# dsh-harness-deploy

Source-of-truth for **DeepSeek Harness (dsh)** deployments used on Railway.

**Policy:** fix in this repo, redeploy from Git. Do not patch only on the running Railway box.

## Apps

| App | Path | Purpose |
|-----|------|---------|
| **dsh-full** | `apps/dsh-full` | Current production: web UI + remote privileges + connectors + Telegram channel into real `ctx.agents` |
| **dsh-telegram** | `apps/dsh-telegram` | Telegram-focused (minimal / no full web shell) — scaffold |
| **dsh-web-next** | `apps/dsh-web-next` | Custom web UI direction — scaffold |
| **dsh-auth** | `packages/dsh-auth` | Simple gate (optional user + password), experiment-notice style — for **web UI** |

## Redeploy `dsh-full` on Railway (exact)

1. Create empty service or connect this repo.
2. **Root directory:** `apps/dsh-full` (or deploy only that folder).
3. Builder: **Dockerfile** (`apps/dsh-full/Dockerfile`).
4. Start: `node start.mjs` (already in Dockerfile `CMD`).
5. Env (minimum):

```bash
PORT=8080
OPENCODE_FREE_API_KEY=public
# Web UI auth (optional):
# AUTH_REQUIRED=1
# AUTH_PASSWORD=secret
# AUTH_USER=
# AUTH_NOTICE=Gated instance. Username optional.
# optional Telegram also via Connectors UI:
# TELEGRAM_BOT_TOKEN=
# TELEGRAM_ALLOWED_USER_IDS=
# TELEGRAM_ALLOW_ALL=1   # dev only
```

6. Health: `GET /__health`
7. Public URL → set Railway public domain; connectors use `RAILWAY_PUBLIC_DOMAIN` when present.

### Resource reality

Service cgroup is typically **~1 GB RAM / 2 vCPU** on trial-class limits. Raise **Replica limits** in Railway service settings for heavier work. Host “300 GB” is **not** available to the container.

### After deploy checklist

- [ ] `GET /__health` → `{"ok":true}`
- [ ] Web UI loads (and auth gate if AUTH_REQUIRED=1)
- [ ] Connectors → save Telegram token → logs `online as @…`
- [ ] Telegram message → `followup → dsh agent` (not a lean mini-LLM)

## Local smoke

```bash
cd apps/dsh-full
npm install
# needs network for @deepseek-ai/dsh
node start.mjs
```

## Capacity lab

Separate service in project: `capacity-lab` (CPU/RAM/disk stress). Not part of customer boot path.
