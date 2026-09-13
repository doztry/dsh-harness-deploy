FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates psmisc \
    && rm -rf /var/lib/apt/lists/*
COPY package.json oc-proxy.mjs ./
COPY plugins ./plugins
COPY packages ./packages
COPY scripts ./scripts
COPY start.mjs start.js ./
# Optional: reconstruct from bundle if present (for size-constrained pushes)
RUN if [ -d .bundle ] && [ -f .bundle/MANIFEST.txt ]; then \
      cat $(grep -v '^#' .bundle/MANIFEST.txt | sed 's|^|.bundle/|') 2>/dev/null | base64 -d | tar xzf - -C /app 2>/dev/null || true; \
    fi
RUN test -f /app/start.mjs
RUN npm install --omit=dev
ENV NODE_ENV=production
ENV PORT=8080
ENV OPENCODE_FREE_API_KEY=public
EXPOSE 8080
CMD ["node", "start.mjs"]
