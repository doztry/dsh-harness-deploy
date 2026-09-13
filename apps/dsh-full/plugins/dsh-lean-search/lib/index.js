/**
 * dsh-lean-search — OpenCode Parallel → Exa
 * Must return DSH WebSearchResult: { sources: WebSearchSource[], truncated: boolean }
 */
export const name = 'dsh-lean-search'
export const inject = ['web']

const PARALLEL_URL = 'https://search.parallel.ai/mcp'
const EXA_URL = 'https://mcp.exa.ai/mcp'
const UA = 'dsh-lean-search/0.2.1'
const MAX = 6
const SNIP = 280

function clip(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim()
  return s.length > SNIP ? s.slice(0, SNIP - 1) + '\u2026' : s
}

function toSource(url, title, snippet, publishedAt) {
  const src = { url: String(url) }
  if (title) src.title = String(title)
  if (snippet) src.snippet = clip(snippet)
  if (publishedAt) src.publishedAt = String(publishedAt)
  return src
}

function extractToolText(body) {
  const tryParse = (text) => {
    try {
      const data = JSON.parse(text)
      const item = (data.result && data.result.content || []).find(
        (c) => c && c.type === 'text' && typeof c.text === 'string' && c.text.length,
      )
      return item ? item.text : undefined
    } catch {
      return undefined
    }
  }
  const direct = tryParse(String(body || '').trim())
  if (direct) return direct
  for (const line of String(body || '').split('\n')) {
    if (!line.startsWith('data: ')) continue
    const t = tryParse(line.slice(6))
    if (t) return t
  }
  return undefined
}

async function mcpCall(url, tool, args, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'user-agent': UA,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: tool, arguments: args },
    }),
    signal,
  })
  if (!res.ok) throw new Error(new URL(url).host + ' HTTP ' + res.status)
  const text = extractToolText(await res.text())
  if (!text) throw new Error(new URL(url).host + ' empty tool text')
  return text
}

function mapParallel(text) {
  const payload = JSON.parse(text)
  const out = []
  for (const item of payload.results || []) {
    if (!item || !item.url) continue
    out.push(
      toSource(
        item.url,
        item.title,
        Array.isArray(item.excerpts) ? item.excerpts.join(' ') : item.snippet,
        item.publish_date,
      ),
    )
    if (out.length >= MAX) break
  }
  if (!out.length) throw new Error('parallel empty')
  return out
}

function mapExa(text) {
  const blocks = String(text).split(/(?=^Title: )/m).filter((b) => b.trim())
  const out = []
  for (const b of blocks) {
    const title = (b.match(/^Title:\s*(.+)$/m) || [])[1]
    const url = (b.match(/^URL:\s*(.+)$/m) || [])[1]
    const published = (b.match(/^Published:\s*(.+)$/m) || [])[1]
    const highlights = (b.match(/^Highlights:\s*([\s\S]*?)(?=^Title: |\Z)/m) || [])[1]
    if (!url) continue
    const pub = published && published.trim() !== 'N/A' ? published.trim() : undefined
    out.push(toSource(url.trim(), (title || url).trim(), highlights, pub))
    if (out.length >= MAX) break
  }
  if (!out.length) throw new Error('exa empty')
  return out
}

async function runSearch(query, signal) {
  const errors = []
  try {
    const text = await mcpCall(
      PARALLEL_URL,
      'web_search',
      { objective: query, search_queries: [query] },
      signal,
    )
    return mapParallel(text)
  } catch (e) {
    errors.push('parallel: ' + (e && e.message ? e.message : e))
  }
  try {
    const text = await mcpCall(EXA_URL, 'web_search_exa', { query, numResults: MAX }, signal)
    return mapExa(text)
  } catch (e) {
    errors.push('exa: ' + (e && e.message ? e.message : e))
  }
  throw new Error('lean-search failed: ' + errors.join(' | '))
}

function makeProvider(id) {
  return {
    id,
    available() {
      return true
    },
    async search(request, signal) {
      const query = String((request && (request.query || request.q)) || '').trim()
      if (!query) return { sources: [], truncated: false }
      const sources = await runSearch(query, signal)
      return { sources, truncated: false }
    },
  }
}

export function apply(ctx) {
  if (!ctx.web || typeof ctx.web.registerSearchProvider !== 'function') {
    try {
      ctx.logger?.warn?.('[lean-search] no registerSearchProvider')
    } catch {}
    return
  }
  ctx.web.registerSearchProvider(makeProvider('lean-search'))
  ctx.web.registerSearchProvider(makeProvider('deepseek-official'))
  try {
    if (ctx.web.config) ctx.web.config.searchProvider = 'lean-search'
  } catch {}
  try {
    ctx.logger?.info?.('[lean-search] registered lean-search + deepseek-official')
  } catch {}
}

export default { name, inject, apply }
