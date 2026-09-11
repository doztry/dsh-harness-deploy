import http from "node:http";
import { randomBytes, createHash } from "node:crypto";

const PORT = Number(process.env.OC_PROXY_PORT || 4097);
const BASE = "https://opencode.ai/zen/v1";
const UA = "opencode/1.18.29 ai-sdk/provider-utils/4.0.23 runtime/node";

// Accurate free-tier ids (from GET /v1/models + `opencode models`, 2026-09-08)
const FREE_MODELS = [
  "big-pickle",
  "deepseek-v4-flash-free",
  "muse-spark-1.3-contributor-free",
  "muse-spark-1.2-contributor-free",
  "mimo-v2.5-free",
  "ling-3.0-flash-fin-free",
  "nemotron-3-ultra-free",
  "nemotron-3.5-lightning-free",
];

function ocHeaders() {
  const session = createHash("sha256")
    .update(String(Date.now()) + Math.random())
    .digest("hex")
    .slice(0, 26)
    .toUpperCase();
  const reqId = randomBytes(16).toString("hex").slice(0, 26).toUpperCase();
  const project = createHash("sha256").update("dsh-railway").digest("hex").slice(0, 26).toUpperCase();
  return {
    "content-type": "application/json",
    authorization: "Bearer public",
    "user-agent": UA,
    "x-opencode-client": "cli",
    "x-opencode-session": session,
    "x-session-affinity": session,
    "X-Session-Id": session,
    "x-opencode-request": reqId,
    "x-opencode-project": project,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    let path = url.pathname;
    if (!path.startsWith("/v1")) path = "/v1" + (path.startsWith("/") ? path : "/" + path);
    const upstreamPath = path.replace(/^\/v1/, "") || "/models";

    if (upstreamPath === "/models" && (req.method || "GET") === "GET") {
      const payload = {
        object: "list",
        data: FREE_MODELS.map((id) => ({
          id,
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: "opencode",
        })),
      };
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(payload));
      return;
    }

    const bodyBuf = ["GET", "HEAD"].includes(req.method || "GET") ? undefined : await readBody(req);

    let bodyOut = bodyBuf;
    if (bodyBuf && bodyBuf.length) {
      try {
        const j = JSON.parse(bodyBuf.toString("utf8"));
        if (j.model) {
          let mid = String(j.model).replace(/^opencode-free\//, "").replace(/^opencode\//, "");
          if (!FREE_MODELS.includes(mid)) {
            if (!mid.includes("free") && mid !== "big-pickle") mid = "big-pickle";
          }
          j.model = mid;
        }
        delete j.max_completion_tokens;
        bodyOut = Buffer.from(JSON.stringify(j));
      } catch {
        bodyOut = bodyBuf;
      }
    }

    const up = await fetch(`${BASE}${upstreamPath}`, {
      method: req.method || "GET",
      headers: ocHeaders(),
      body: bodyOut,
    });

    res.writeHead(up.status, {
      "content-type": up.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
    });
    if (up.body) {
      const reader = up.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (e) {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end("oc-proxy error: " + (e?.message || String(e)));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[oc-proxy] free models (${FREE_MODELS.length}) on 127.0.0.1:${PORT} -> ${BASE}`);
});
