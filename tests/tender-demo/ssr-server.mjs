import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

export async function startSsrServer(port = 3195) {
  const workerModule = await import(`../../.output/server/index.mjs?v=${Date.now()}`);
  const worker = workerModule.default;
  const publicDir = path.join(root, ".output/public");

  const env = {
    ASSETS: {
      fetch: async (req) => {
        const url = new URL(req.url);
        let pathname = decodeURIComponent(url.pathname);
        if (pathname === "/") pathname = "/index.html";

        const filePath = path.join(publicDir, pathname);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const buffer = fs.readFileSync(filePath);
          const ext = path.extname(filePath).toLowerCase();
          return new Response(buffer, {
            status: 200,
            headers: { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" }
          });
        }
        return new Response(null, { status: 404 });
      }
    }
  };

  const ctx = {
    waitUntil: () => {},
    context: { waitUntil: () => {} }
  };

  const server = http.createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(req.url.split("?")[0]);
      const staticPath = path.join(publicDir, pathname);

      // 1. Direct Static Asset Serving
      if (pathname !== "/" && fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
        const ext = path.extname(staticPath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
        fs.createReadStream(staticPath).pipe(res);
        return;
      }

      // 2. Dynamic SSR Worker Handling
      const url = `http://127.0.0.1:${port}` + req.url;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v) {
          if (Array.isArray(v)) {
            v.forEach(val => headers.append(k, val));
          } else {
            headers.set(k, v);
          }
        }
      }

      const webReq = new Request(url, {
        method: req.method,
        headers: headers
      });

      const webRes = await worker.fetch(webReq, env, ctx);
      res.writeHead(webRes.status, Object.fromEntries(webRes.headers.entries()));
      const body = await webRes.arrayBuffer();
      res.end(Buffer.from(body));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("SSR Server Error: " + err.message);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve(server);
    });
  });
}
