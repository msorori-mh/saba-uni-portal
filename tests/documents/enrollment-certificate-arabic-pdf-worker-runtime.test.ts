/**
 * G4 — Prove Arabic PDF generation inside Cloudflare Workers (local wrangler),
 * not Node-only. Spawns `wrangler dev` (Miniflare) because `unstable_dev`
 * does not reliably settle under bun:test on Windows.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Subprocess, spawn } from "bun";

const ROOT = join(import.meta.dir, "../..");
const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitForReady(proc: Subprocess, timeoutMs: number): Promise<void> {
  const start = Date.now();
  let buf = "";
  const reader = proc.stdout?.getReader();
  const decoder = new TextDecoder();
  if (!reader) throw new Error("wrangler stdout missing");

  while (Date.now() - start < timeoutMs) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    if (/Ready on/i.test(buf) || /Listening on/i.test(buf)) {
      // Detach reader so logs don't block; process keeps running.
      reader.releaseLock();
      return;
    }
  }
  throw new Error(`wrangler did not become ready within ${timeoutMs}ms\n${buf.slice(-2000)}`);
}

describe("G4 — Arabic PDF spike on Wrangler Worker runtime", () => {
  let proc: Subprocess | undefined;

  beforeAll(async () => {
    proc = spawn({
      cmd: [
        "bunx",
        "wrangler",
        "dev",
        "--local",
        "--ip",
        "127.0.0.1",
        "--port",
        String(PORT),
        "--config",
        "tools/arabic-pdf-worker-spike/wrangler.toml",
      ],
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    });
    await waitForReady(proc, 90_000);
  }, 100_000);

  afterAll(() => {
    try {
      proc?.kill();
    } catch {
      /* ignore */
    }
  });

  it("Worker handler returns a valid non-empty PDF", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect(res.headers.get("x-spike-header-ok")).toBe("true");
    expect(res.headers.get("x-spike-shaping")).toBe("fontkit.layout+bidi-js-runs");

    const pages = Number(res.headers.get("x-spike-pages") ?? "0");
    const bytesHdr = Number(res.headers.get("x-spike-bytes") ?? "0");
    expect(pages).toBe(1);
    expect(bytesHdr).toBeGreaterThan(5_000);

    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf.byteLength).toBe(bytesHdr);
    expect(String.fromCharCode(buf[0]!, buf[1]!, buf[2]!, buf[3]!)).toBe("%PDF");

    const outDir = join(ROOT, ".tmp");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "enrollment-certificate-worker-runtime-spike.pdf"), buf);
  }, 60_000);
});
