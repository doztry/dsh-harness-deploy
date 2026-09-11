/**
 * dsh-auth-simple — optional username + password gate for the **web UI**.
 * UI: experiment-notice style banner; off when AUTH_REQUIRED=0.
 * Env:
 *   AUTH_REQUIRED=1
 *   AUTH_USER=optional
 *   AUTH_PASSWORD=secret
 *   AUTH_NOTICE=message shown above the form
 */
import crypto from 'node:crypto'

export const name = 'dsh-auth-simple'
export const inject = []

function cfg() {
  return {
    required: process.env.AUTH_REQUIRED === '1' || process.env.AUTH_REQUIRED === 'true',
    user: process.env.AUTH_USER || '',
    password: process.env.AUTH_PASSWORD || '',
    notice:
      process.env.AUTH_NOTICE ||
      'This instance is gated. Enter credentials to continue. Leave username empty if your host only set a password.',
    cookieName: 'dsh_auth',
  }
}

function tokenFor(c) {
  return crypto.createHash('sha256').update(`${c.user}|${c.password}|dsh-auth-v1`).digest('hex')
}

function parseCookies(header) {
  const out = {}
  String(header || '')
    .split(';')
    .forEach((p) => {
      const i = p.indexOf('=')
      if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim())
    })
  return out
}

export function createAuthMiddleware() {
  const c = cfg()
  if (!c.required || !c.password) {
    return (req, res, next) => next()
  }
  const expected = tokenFor(c)
  return (req, res, next) => {
    const url = new URL(req.url || '/', 'http://local')
    if (url.pathname === '/__health' || url.pathname === '/healthz') return next()
    if (url.pathname === '/__auth/login' && req.method === 'POST') {
      let body = ''
      req.on('data', (d) => (body += d))
      req.on('end', () => {
        const params = new URLSearchParams(body)
        const user = params.get('user') || ''
        const password = params.get('password') || ''
        const ok = (!c.user || user === c.user) && password === c.password
        if (!ok) {
          res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' })
          res.end(loginPage(c, 'Invalid credentials'))
          return
        }
        res.writeHead(302, {
          'Set-Cookie': `${c.cookieName}=${expected}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
          Location: '/',
        })
        res.end()
      })
      return
    }
    const cookies = parseCookies(req.headers.cookie)
    if (cookies[c.cookieName] === expected) return next()
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(loginPage(c))
  }
}

function loginPage(c, error) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Sign in</title>
<style>
  body{margin:0;font-family:system-ui,sans-serif;background:#0f1115;color:#e8eaed;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{max-width:420px;width:92%;background:#161a21;border:1px solid #2a2e36;border-radius:14px;padding:22px 20px;box-shadow:0 12px 40px rgba(0,0,0,.35)}
  .notice{font-size:13px;line-height:1.45;color:#9aa0a8;background:#1c2028;border:1px solid #2a2e36;border-radius:10px;padding:12px;margin-bottom:16px}
  h1{font-size:18px;margin:0 0 12px;font-weight:600}
  label{display:block;font-size:12px;color:#9aa0a8;margin:10px 0 4px}
  input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid #2a2e36;background:#0f1115;color:#e8eaed;font:inherit}
  button{margin-top:16px;width:100%;padding:11px;border:0;border-radius:10px;background:#3d7eff;color:#fff;font-weight:600;cursor:pointer}
  .err{color:#f85149;font-size:13px;margin-bottom:8px}
</style></head><body>
<form class="card" method="POST" action="/__auth/login">
  <h1>Sign in</h1>
  <div class="notice">${escapeHtml(c.notice)}</div>
  ${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
  <label>Username (optional)</label>
  <input name="user" autocomplete="username" placeholder="optional"/>
  <label>Password</label>
  <input name="password" type="password" autocomplete="current-password" required/>
  <button type="submit">Continue</button>
</form>
</body></html>`
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
}

export function apply(ctx) {
  console.log('[dsh-auth-simple] configured required=', cfg().required)
}

export default { name, inject, apply, createAuthMiddleware }
