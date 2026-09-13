'use strict'
/**
 * dsh-opencode-free — lean keyless OpenCode free-tier adapter for DSH.
 * No OpenCode CLI, no sidecar. ~6KB. Talks to opencode.ai/zen/v1 with CLI headers.
 */
const { randomBytes, createHash } = require('crypto')

const name = 'dsh-opencode-free'
const inject = ['model']

const BASE = process.env.OPENCODE_FREE_BASE || 'https://opencode.ai/zen/v1'
const DEFAULT_MODEL = process.env.OPENCODE_FREE_MODEL || 'opencode/gpt-5-nano'

function apply(ctx) {
  const apiKey = process.env.OPENCODE_FREE_API_KEY || 'public'
  const models = {
    [DEFAULT_MODEL]: {
      id: DEFAULT_MODEL,
      name: 'OpenCode Free (keyless)',
      context: 128000,
      max_tokens: 8192,
      provider: 'opencode-free',
    },
  }

  ctx.model.register({
    id: 'opencode-free',
    name: 'OpenCode Free',
    models,
    async chat(req) {
      const body = {
        model: req.model || DEFAULT_MODEL,
        messages: req.messages || [],
        stream: false,
        max_tokens: req.max_tokens || 4096,
        temperature: req.temperature ?? 0.7,
      }
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'opencode-cli',
        'X-OpenCode-Client': 'dsh',
      }
      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(`opencode-free ${res.status}: ${t.slice(0, 200)}`)
      }
      const data = await res.json()
      const choice = data.choices?.[0]
      return {
        content: choice?.message?.content || '',
        usage: data.usage,
        model: data.model || body.model,
        finish_reason: choice?.finish_reason,
      }
    },
  })

  ctx.logger?.info?.('[dsh-opencode-free] registered keyless provider')
}

module.exports = { name, inject, apply }
