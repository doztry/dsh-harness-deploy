FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates psmisc \
    && rm -rf /var/lib/apt/lists/*
COPY package.json start.mjs start.js oc-proxy.mjs ./
COPY plugins ./plugins
RUN npm install --omit=dev
ENV NODE_ENV=production
ENV PORT=8080
ENV OPENCODE_FREE_API_KEY=public
EXPOSE 8080
CMD ["node", "start.mjs"]
