# Source sync status

**Repo:** https://github.com/doztry/dsh-harness-deploy  
**Account:** doztry  
**Policy:** fix in Git, redeploy from `apps/dsh-full`.

## On GitHub (enough to wire Railway + auth + structure)

- Root README, `.gitignore`
- `apps/dsh-full`: Dockerfile, package.json, railway.toml, .env.example, nixpacks, oc-proxy.mjs
- Plugin **manifests** (cordis.patch.yml + package.json) for connectors, lean-search, opencode-free, web-search-stack
- `packages/dsh-auth` — **web UI** gate (optional username + password, notice style)
- capacity-guard.js
- scaffolds: `dsh-telegram`, `dsh-web-next`

## Still must be copied from local tree (large runtime)

These files exist under `/home/workdir/artifacts/dsh-harness-deploy` (and tarball `dsh-harness-deploy-src.tar.gz`) but were too large for a single connector push in one session:

- `apps/dsh-full/start.mjs` (+ `start.js`)
- `apps/dsh-full/plugins/dsh-connectors/lib/{index,client,channel-telegram,tg-markdown,catalog,telegram}.js`
- `apps/dsh-full/plugins/dsh-lean-search/lib/index.js`
- `apps/dsh-full/plugins/dsh-opencode-free/lib/index.js`
- `apps/dsh-full/scripts/capacity-probe.mjs`

### Finish sync (on your machine)

```bash
git clone https://github.com/doztry/dsh-harness-deploy.git
# copy remaining files from the finished local tree / tarball into apps/dsh-full/
git add -A && git commit -m "feat: full runtime sources" && git push
```

Or re-open this chat and ask to **continue pushing remaining JS** via the GitHub connector.

## dsh-auth (web UI only)

```bash
AUTH_REQUIRED=1
AUTH_PASSWORD=secret
AUTH_USER=           # optional
AUTH_NOTICE=Your notice (experiment-style)
```

Unset / `AUTH_REQUIRED=0` removes the gate.

## Railway

Root directory: `apps/dsh-full` · Dockerfile · health `GET /__health`
