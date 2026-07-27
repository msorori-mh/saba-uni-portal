/**
 * One-shot diagnosis: Node fetch vs Chrome --dump-dom vs Chrome CDP on loopback HTTP.
 */
import { spawn, spawnSync } from "bun";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP_PORT = 4195;
const CDP_PORT = 4196;
const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const srv = Bun.serve({
  hostname: "127.0.0.1",
  port: APP_PORT,
  fetch(req) {
    console.error(`[srv] ${req.method} ${new URL(req.url).pathname}`);
    return new Response(
      `<!doctype html><html lang="ar" dir="rtl"><body><div id="root" data-ready="1">ok-cdp-http</div><script>window.__ready=true</script></body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  },
});

const url = `http://127.0.0.1:${APP_PORT}/`;
console.log("SERVER_CMD=Bun.serve hostname=127.0.0.1 port=" + APP_PORT);
console.log("URL=" + url);

const fetchRes = await fetch(url);
const fetchHtml = await fetchRes.text();
console.log("FETCH_STATUS=" + fetchRes.status);
console.log("FETCH_HTML=" + fetchHtml.slice(0, 120));

const udDump = mkdtempSync(join(tmpdir(), "dump-"));
const dump = spawnSync(
  [
    chrome,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--no-proxy-server",
    "--disable-background-networking",
    "--no-first-run",
    `--user-data-dir=${udDump}`,
    "--dump-dom",
    "--virtual-time-budget=3000",
    url,
  ],
  { encoding: "utf8", timeout: 15_000, maxBuffer: 5 * 1024 * 1024, windowsHide: true },
);
console.log(
  "DUMP_DOM status=" +
    String(dump.status) +
    " err=" +
    (dump.error?.code ?? "") +
    " has=" +
    String((dump.stdout || "").includes("ok-cdp-http")),
);
console.log("DUMP_DOM_STDERR=" + String(dump.stderr || "").slice(0, 160));
try {
  rmSync(udDump, { recursive: true, force: true });
} catch {
  /* ignore */
}

const ud = mkdtempSync(join(tmpdir(), "cdp-"));
const chromeProc = spawn({
  cmd: [
    chrome,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-proxy-server",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-extensions",
    "--disable-component-update",
    "--disable-default-apps",
    `--user-data-dir=${ud}`,
    `--remote-debugging-port=${CDP_PORT}`,
    "about:blank",
  ],
  stdout: "ignore",
  stderr: "pipe",
});

let wsUrl = "";
for (let i = 0; i < 40; i++) {
  await Bun.sleep(250);
  const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).catch(() => null);
  if (r?.ok) {
    wsUrl = ((await r.json()) as { webSocketDebuggerUrl?: string }).webSocketDebuggerUrl || "";
    if (wsUrl) break;
  }
}
console.log("CDP_ENDPOINT=" + (wsUrl ? "ok" : "missing"));

if (wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("ws failed"));
  });
  let id = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  ws.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id)!;
      pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message));
      else p.resolve(m.result);
    }
  };
  const send = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => {
    const i = id++;
    return new Promise((resolve, reject) => {
      pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params, sessionId }));
    });
  };
  const created = (await send("Target.createTarget", { url: "about:blank" })) as { targetId: string };
  const attached = (await send("Target.attachToTarget", {
    targetId: created.targetId,
    flatten: true,
  })) as { sessionId: string };
  const sid = attached.sessionId;
  await send("Page.enable", {}, sid);
  await send("Runtime.enable", {}, sid);
  await send("Page.navigate", { url }, sid);
  let text = "";
  for (let i = 0; i < 40; i++) {
    await Bun.sleep(200);
    const ev = (await send(
      "Runtime.evaluate",
      {
        expression: 'document.querySelector("#root")?.textContent || ""',
        returnByValue: true,
      },
      sid,
    )) as { result?: { value?: string } };
    text = ev.result?.value || "";
    if (text === "ok-cdp-http") break;
  }
  console.log("CDP_HTTP_TEXT=" + text);
  console.log(text === "ok-cdp-http" ? "ROOT_CAUSE_CONFIRMED=dump-dom_hangs_cdp_works" : "CDP_HTTP_FAIL");
  await send("Browser.close").catch(() => undefined);
  ws.close();
}

spawnSync(["taskkill", "/PID", String(chromeProc.pid), "/T", "/F"], {
  stdout: "ignore",
  stderr: "ignore",
});
try {
  rmSync(ud, { recursive: true, force: true });
} catch {
  /* ignore */
}
srv.stop(true);
process.exit(0);
