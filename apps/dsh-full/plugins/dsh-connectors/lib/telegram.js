/**
 * Telegram channel adapter — long-poll Bot API (works on Railway, no public webhook required).
 * Chat kinds: private (DM/bot), group, supergroup, channel, forum topic.
 * Secretary mode: concise status-first replies; audience tone injected into agent context.
 */
const TG = 'https://api.telegram.org'

export function classifyChat(chat, message) {
  const type = chat?.type || 'unknown'
  let kind = type
  let audience = 'general'
  if (type === 'private') {
    kind = 'dm'
    audience = 'one_user'
  } else if (type === 'group' || type === 'supergroup') {
    kind = message?.is_topic_message || message?.message_thread_id ? 'forum_topic' : 'group'
    audience = kind === 'forum_topic' ? 'topic_subscribers' : 'group_members'
  } else if (type === 'channel') {
    kind = 'channel'
    audience = 'channel_subscribers'
  }
  return {
    kind,
    audience,
    chatId: chat?.id,
    title: chat?.title || [chat?.first_name, chat?.last_name].filter(Boolean).join(' ') || String(chat?.id),
    username: chat?.username,
    threadId: message?.message_thread_id,
    isForum: Boolean(chat?.is_forum),
  }
}

export function toneForAudience(audience, secretaryMode) {
  if (secretaryMode) {
    return 'SECRETARY MODE: be concise, status-first, action items as bullets, no filler. Confirm receipt briefly.'
  }
  switch (audience) {
    case 'one_user':
      return 'Tone: direct 1:1 assistant. Conversational, helpful, can use light structure.'
    case 'group_members':
      return 'Tone: group chat. Address the group; keep replies skimmable; avoid oversharing private context.'
    case 'topic_subscribers':
      return 'Tone: forum topic. Stay on-topic; prefer threaded answers; cite the topic subject if known.'
    case 'channel_subscribers':
      return 'Tone: channel broadcast style. Clear, polished, minimal back-and-forth.'
    default:
      return 'Tone: professional and clear.'
  }
}

export function createTelegramApi(token) {
  const base = `${TG}/bot${token}`
  async function call(method, body, signal) {
    const res = await fetch(`${base}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!data.ok) {
      const desc = data.description || res.statusText || 'telegram error'
      const err = new Error(desc)
      err.code = data.error_code
      throw err
    }
    return data.result
  }
  return {
    getMe: (signal) => call('getMe', {}, signal),
    getUpdates: (opts, signal) => call('getUpdates', opts, signal),
    sendMessage: (opts, signal) => call('sendMessage', opts, signal),
    sendChatAction: (opts, signal) => call('sendChatAction', opts, signal),
    answerCallbackQuery: (opts, signal) => call('answerCallbackQuery', opts, signal),
  }
}

/** Split long text for Telegram 4096 limit */
export function chunkText(text, max = 4000) {
  const s = String(text || '')
  if (s.length <= max) return [s]
  const parts = []
  let i = 0
  while (i < s.length) {
    let end = Math.min(i + max, s.length)
    if (end < s.length) {
      const slice = s.slice(i, end)
      const br = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'), slice.lastIndexOf(' '))
      if (br > max * 0.5) end = i + br
    }
    parts.push(s.slice(i, end).trim())
    i = end
  }
  return parts.filter(Boolean)
}

export function isAllowed(meta, cfg) {
  if (cfg.allowAll) return true
  const uid = meta.fromId
  const cid = meta.chatId
  const users = cfg.allowedUserIds || []
  const chats = cfg.allowedChatIds || []
  if (!users.length && !chats.length) return false
  if (uid != null && users.map(String).includes(String(uid))) return true
  if (cid != null && chats.map(String).includes(String(cid))) return true
  return false
}
