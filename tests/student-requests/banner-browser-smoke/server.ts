import { mkdirSync } from "node:fs";
import { join } from "node:path";

const pagesDir = join(import.meta.dir, "pages");
const port = Number(process.env.PR246_SMOKE_PORT || 4178);
mkdirSync(pagesDir, { recursive: true });

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    if (pathname.includes("..")) return new Response("Forbidden", { status: 403 });
    const file = Bun.file(join(pagesDir, pathname.replace(/^\//, "")));
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file, {
      headers: {
        "content-type": pathname.endsWith(".html")
          ? "text/html; charset=utf-8"
          : "application/octet-stream",
        "cache-control": "no-store",
      },
    });
  },
});

console.log(`PR246 banner smoke server: http://127.0.0.1:${server.port}`);
