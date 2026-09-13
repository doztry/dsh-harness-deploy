# Source status

**Deploy buttons** (top of README):
- [Deploy to Render](https://render.com/deploy?repo=https://github.com/doztry/dsh-harness-deploy)
- Railway: root dir `apps/dsh-full`, Dockerfile builder

## Current state (2026-09-13)

- Dockerfile updated: `COPY start.mjs start.js ./` so deploy no longer depends only on the .bundle tar.
- Core plugins, auth, lean-search, capacity-guard, oc-proxy, package manifests: present.
- Large runtime still being fully synced from local tree:
  - `start.mjs` / `start.js`
  - `plugins/dsh-connectors/lib/{client,channel-telegram,index,catalog,tg-markdown}.js`
  - `.bundle/runtime.*.b64` (optional reconstruct path)

Once the remaining files land, a clean clone + Render/Railway deploy boots the full web + Telegram → real `ctx.agents` harness.

Health: `GET /__health`
