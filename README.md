# dsh-harness-deploy

Source of truth for **DeepSeek Harness (dsh)** — full web + Telegram channel into real `ctx.agents`.

**Fix in this repo → redeploy from Git.** Do not patch only the live box.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/doztry/dsh-harness-deploy)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/doztry/dsh-harness-deploy?referralCode=doztry)

## Apps

| App | Path | Purpose |
|-----|------|---------|
| **dsh-full** | `apps/dsh-full` | Production: web UI, connectors, Telegram → real agents, auth gate |
| **dsh-telegram** | `apps/dsh-telegram` | Telegram-only (scaffold) |
| **dsh-web-next** | `apps/dsh-web-next` | Custom web UI (scaffold) |
| **dsh-auth** | `packages/dsh-auth` | Web UI sign-in (optional user + password, notice style) |

## Deploy on Render

1. Click **Deploy to Render** above, or New → Blueprint → this repo.
2. Service uses Docker at **`apps/dsh-full`** (`render.yaml`).
3. Set env as needed (Telegram token, `AUTH_*`, etc.).
4. Health: `GET /__health`

## Deploy on Railway

1. New service → connect this repo.
2. **Root Directory:** `apps/dsh-full`
3. Builder: **Dockerfile**
4. Start: `node start.mjs` (Dockerfile `CMD`)

### Env (minimum)

```bash
PORT=8080
OPENCODE_FREE_API_KEY=public
# AUTH_REQUIRED=1
# AUTH_PASSWORD=
# AUTH_USER=
# AUTH_NOTICE=
# TELEGRAM_BOT_TOKEN=
# TELEGRAM_ALLOWED_USER_IDS=
# TELEGRAM_ALLOW_ALL=0
```

### Checklist after deploy

- [ ] `GET /__health` → `{"ok":true}`
- [ ] Web UI loads
- [ ] Connectors → Telegram token → logs `online as @…`
- [ ] Chat uses real dsh agent (not a lean mini-LLM)

## Resource note

Containers are typically **~1 GB RAM / 2 vCPU** unless you raise plan/limits. Host “300 GB” is **not** yours.

## Local

```bash
cd apps/dsh-full && npm install && node start.mjs
```
