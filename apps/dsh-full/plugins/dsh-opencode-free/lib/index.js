'use strict'
/**
 * dsh-opencode-free — OpenCode Zen adapter for DSH.
 *
 * - Dynamically discovers models from https://opencode.ai/zen/v1/models
 * - Supports a real API key (OPENCODE_API_KEY / OPENCODE_FREE_API_KEY) for
 *   paid / Go-tier models that still work from external clients.
 * - Free-tier models are still attempted keyless, but since ~2026-09-17
 *   OpenCode returns FreeTierError for any non-OpenCode client. We surface
 *   that clearly instead of a generic "invalid api key".
 */
const { randomBytes, createHash } = require('node:crypto')

const name = 'dsh-opencode-free'
const inject = ['llm']

const PROVIDER = 'opencode-free'
const BASE = process.env.OPENCODE_ZEN_BASE || 'https://opencode.ai/zen/v1'
const UA =
  process.env.OPENCODE_UA ||
  'opencode/1.18.31 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14'

const FALLBACK_MODELS = [
  { id: 'big-pickle', name: 'Big Pickle', contextWindow: 200000 },
  { id: 'mimo-v2.5-free', name: 'MiMo V2.5 Free', contextWindow: 200000 },
  { id: 'nemotron-3-ultra-free', name: 'Nemotron 3 Ultra Free', contextWindow: 131072 },
  { id: 'nemotron-3.5-lightning-free', name: 'Nemotron 3.5 Lightning Free', contextWindow: 131072 },
  { id: 'hy3-free', name: 'Hy3 Free', contextWindow: 190000 },
  { id: 'ling-3.0-flash-fin-free', name: 'Ling 3.0 Flash Fin Free', contextWindow: 200000 },
]

const REASONING = [
  { id: 'off', name: 'Off' },
  { id: 'low', name: 'Low' },
  { id: 'high', name: 'High' },
  { id: 'max', name: 'Max' },
]

let _modelsCache = null
let _modelsCacheAt = 0
const CACHE_MS = 5 * 60 * 1000

function ulidish() {
  return randomBytes(16).toString('hex').slice(0, 26).toUpperCase()
}

function sessionFrom(messages) {
  const first = (messages || []).find((m) => m && m.role === 'user')
  const seed =
    typeof first?.content === 'string'
      ? first.content
      : JSON.stringify(first?.content || 'dsh')
  return createHash('sha256').update(seed).digest('hex').slice(0, 26).toUpperCase()
}

function apiKey() {
  const k =
    process.env.OPENCODE_API_KEY ||
    process.env.OPENCODE_FREE_API_KEY ||
    process.env.OPENCODE_ZEN_API_KEY ||
    ''
  if (!k || k === 'public' || k === 'none' || k === 'keyless') return null
  return k
}

function buildHeaders(messages, key) {
  const session = sessionFrom(messages)
  const h = {
    'Content-Type': 'application/json',
    'User-Agent': UA,
    'x-opencode-client': 'cli',
    'x-opencode-session': session,
    'x-session-affinity': session,
    'X-Session-Id': session,
    'x-opencode-request': ulidish(),
    'x-opencode-project': createHash('sha256')
      .update('dsh-opencode-free')
      .digest('hex')
      .slice(0, 26)
      .toUpperCase(),
  }
  if (key) h.Authorization = `Bearer ${key}`
  return h
}

function looksFree(id, name) {
  const s = `${id || ''} ${name || ''}`.toLowerCase()
  return (
    s.includes('free') ||
    s.includes('big-pickle') ||
    s.includes('contributor') ||
    s.includes('stealth')
  )
}

async function fetchLiveModels() {
  const now = Date.now()
  if (_modelsCache && now - _modelsCacheAt < CACHE_MS) return _modelsCache
  try {
    const res = await fetch(`${BASE}/models`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) throw new Error(`models ${res.status}`)
    const data = await res.json()
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
    const mapped = list
      .map((m) => {
        const id = String(m.id || m.name || '').trim()
        if (!id) return null
        return {
          id,
          name: m.name || id,
          contextWindow: Number(m.context_window || m.contextWindow || 128000) || 128000,
          free: looksFree(id, m.name),
        }
      })
      .filter(Boolean)
    if (mapped.length) {
      _modelsCache = mapped
      _modelsCacheAt = now
      return mapped
    }
  } catch (e) {
    // fall through
  }
  return FALLBACK_MODELS.map((m) => ({ ...m, free: looksFree(m.id, m.name) }))
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function apply(ctx) {
  const log = (msg) => {
    try {
      ctx.logger?.info?.(`[dsh-opencode-free] ${msg}`)
    } catch {}
  }

  const adapter = {
    async listModels() {
      const live = await fetchLiveModels()
      const key = apiKey()
      const filtered = key ? live : live.filter((m) => m.free)
      const use = filtered.length ? filtered : live
      return use.map((m) => ({
        id: m.id,
        name: m.free ? `${m.name} (free)` : m.name,
        provider: PROVIDER,
        contextWindow: m.contextWindow || 128000,
        maxOutputTokens: 128000,
        reasoningLevels: REASONING,
        defaultReasoning: 'high',
        capabilities: { tools: true, streaming: true, vision: false },
        meta: { free: !!m.free, dynamic: true },
      }))
    },

    async *streamChat(req, signal) {
      const key = apiKey()
      const model = String(req.model || 'big-pickle')
        .replace(/^opencode-free\//, '')
        .replace(/^opencode\//, '')
        .replace(/^opencode-zen\//, '')

      const body = {
        model,
        messages: req.messages || [],
        stream: true,
      }
      if (req.temperature != null) body.temperature = req.temperature
      if (req.maxTokens) body.max_tokens = req.maxTokens
      if (req.tools?.length) {
        body.tools = req.tools
        body.tool_choice = req.toolChoice || 'auto'
      }
      if (req.reasoningEffort && req.reasoningEffort !== 'off') {
        body.reasoning = { effort: req.reasoningEffort }
      }

      let lastErr
      for (let attempt = 0; attempt < 3; attempt++) {
        const ctrl = new AbortController()
        const onAbort = () => ctrl.abort()
        if (signal) {
          if (signal.aborted) throw new Error('aborted')
          signal.addEventListener('abort', onAbort, { once: true })
        }
        try {
          const res = await fetch(`${BASE}/chat/completions`, {
            method: 'POST',
            headers: buildHeaders(req.messages, key),
            body: JSON.stringify(body),
            signal: ctrl.signal,
          })
          const ct = res.headers.get('content-type') || ''
          if (!res.ok) {
            const t = await res.text().catch(() => '')
            let parsed
            try {
              parsed = JSON.parse(t)
            } catch {}
            const msg =
              parsed?.error?.message ||
              parsed?.message ||
              t.slice(0, 400) ||
              res.statusText

            if (
              /FreeTierError|free tier can only be used from within OpenCode/i.test(msg) ||
              /free tier/i.test(msg)
            ) {
              throw new Error(
                `OpenCode free tier is locked to the official OpenCode client only ` +
                  `(not usable from DSH / other harnesses). ` +
                  `Get a real key at https://opencode.ai/zen (or use OpenCode Go) and set ` +
                  `OPENCODE_API_KEY=... — free models no longer work keylessly from outside OpenCode.`
              )
            }
            if (res.status === 401 || /invalid api key|unauthorized|no api/i.test(msg)) {
              throw new Error(
                `OpenCode API key invalid or missing. ` +
                  `Set OPENCODE_API_KEY (from https://opencode.ai/zen) or use a paid model. ` +
                  `Raw: ${msg.slice(0, 200)}`
              )
            }
            throw new Error(`opencode-free ${res.status}: ${msg.slice(0, 300)}`)
          }

          if (!ct.includes('text/event-stream') && !ct.includes('stream')) {
            const data = await res.json()
            const choice = data.choices?.[0]
            const content = choice?.message?.content || ''
            if (content) yield { type: 'text', text: content }
            yield { type: 'finish', finishReason: choice?.finish_reason || 'stop' }
            return
          }

          const reader = res.body.getReader()
          const dec = new TextDecoder()
          let buf = ''
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buf += dec.decode(value, { stream: true })
            const parts = buf.split('\n')
            buf = parts.pop() || ''
            for (const line of parts) {
              const s = line.trim()
              if (!s.startsWith('data:')) continue
              const data = s.slice(5).trim()
              if (data === '[DONE]') {
                yield { type: 'finish', finishReason: 'stop' }
                return
              }
              let json
              try {
                json = JSON.parse(data)
              } catch {
                continue
              }
              if (json.error) {
                const msg = json.error.message || JSON.stringify(json.error)
                if (/FreeTierError|free tier can only be used from within OpenCode/i.test(msg)) {
                  throw new Error(
                    `OpenCode free tier is locked to the official OpenCode client only. ` +
                      `Set OPENCODE_API_KEY from https://opencode.ai/zen for external use.`
                  )
                }
                throw new Error(`opencode-free stream error: ${msg.slice(0, 300)}`)
              }
              const choice = json.choices && json.choices[0]
              if (!choice) continue
              const delta = choice.delta || {}
              if (delta.reasoning_content) yield { type: 'reasoning', text: delta.reasoning_content }
              if (delta.content) yield { type: 'text', text: delta.content }
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  yield {
                    type: 'tool_call_delta',
                    index: tc.index || 0,
                    id: tc.id,
                    name: tc.function && tc.function.name,
                    arguments: (tc.function && tc.function.arguments) || '',
                  }
                }
              }
              if (choice.finish_reason) yield { type: 'finish', finishReason: choice.finish_reason }
            }
          }
          yield { type: 'finish', finishReason: 'stop' }
          return
        } catch (e) {
          lastErr = e
          if (signal?.aborted) throw e
          if (
            /free tier is locked|API key invalid|FreeTierError/i.test(String(e?.message || e))
          ) {
            throw e
          }
          await sleep(400 * (attempt + 1))
        } finally {
          if (signal) signal.removeEventListener('abort', onAbort)
        }
      }
      throw lastErr || new Error('opencode-free failed')
    },
  }

  if (typeof ctx.llm.registerAdapter === 'function') {
    ctx.llm.registerAdapter([PROVIDER, 'opencode', 'opencode-zen'], adapter)
  } else if (typeof ctx.llm.registerProvider === 'function') {
    ctx.llm.registerProvider(PROVIDER, adapter)
  } else {
    try {
      ctx.logger?.warn?.('[dsh-opencode-free] no llm.registerAdapter')
    } catch {}
    return
  }

  const key = apiKey()
  log(
    key
      ? `registered with API key (dynamic models from ${BASE}/models)`
      : `registered keyless — free tier is currently locked to official OpenCode client; set OPENCODE_API_KEY for external use`
  )
}

module.exports = { name, inject, apply }
