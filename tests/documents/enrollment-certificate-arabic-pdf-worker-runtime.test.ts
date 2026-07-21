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

async function drain(stream: ReadableStream<Uint8Array> | undefined, into: { text: string }) {
  if (!stream) return;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      into.text += decoder.decode(value, { stream: true });
    }
  } catch {
    /* process killed */
  }
}

async function waitForReady(proc: Subprocess, timeoutMs: number): Promise<void> {
  const start = Date.now();
  const logs = { text: "" };
  void drain(proc.stdout ?? undefined, logs);
  void drain(proc.stderr ?? undefined, logs);

  while (Date.now() - start < timeoutMs) {
    if (proc.exitCode != null) {
      throw new Error(
        `wrangler exited early with code ${proc.exitCode}\n${logs.text.slice(-4000)}`,
      );
    }
    if (/Ready on/i.test(logs.text) || /Listening on/i.test(logs.text)) {
      return;
    }
    // HTTP readiness: Ready banners sometimes land only on stderr or after bind.
    try {
      const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(500) });
      if (res.ok || res.status === 200) return;
    } catch {
      /* not up yet */
    }
    await Bun.sleep(250);
  }
  throw new Error(`wrangler did not become ready within ${timeoutMs}ms\n${logs.text.slice(-4000)}`);
}

describe("G4 — Arabic PDF spike on Wrangler Worker runtime", () => {
  let proc: Subprocess | undefined;

  beforeAll(async () => {
    // Prefer `bun x` over bare `bunx` — some CI/agent PATHs lack a bunx shim
    // (ENOENT), while `bun` itself is always present under oven-sh/setup-bun.
    const bunBin = Bun.which("bun") ?? "bun";
    proc = spawn({
      cmd: [
        bunBin,
        "x",
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
