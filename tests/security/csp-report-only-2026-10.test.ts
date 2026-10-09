import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildReportOnlyCsp,
  resolveSupabaseOrigin,
  withSecurityHeaders,
} from "../../src/lib/security-headers";

const root = join(import.meta.dir, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const PROD_SUPABASE = "https://cldpnartkfnmllrkjaoi.supabase.co";
const REPORT_ONLY = "content-security-policy-report-only";

const html = () =>
  new Response("<html></html>", { headers: { "content-type": "text/html; charset=utf-8" } });

function directives(policy: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) out.set(name, sources);
  }
  return out;
}

describe("resource CSP is rolled out report-only", () => {
  const ENV_KEYS = ["VITE_SUPABASE_URL", "SUPABASE_URL", "VITE_PORTAL_DEPLOY_TARGET", "PORTAL_DEPLOY_TARGET"];
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const k of ENV_KEYS) saved.set(k, process.env[k]);
    process.env.VITE_SUPABASE_URL = PROD_SUPABASE;
    process.env.SUPABASE_URL = PROD_SUPABASE;
    process.env.VITE_PORTAL_DEPLOY_TARGET = "production";
    process.env.PORTAL_DEPLOY_TARGET = "production";
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      const v = saved.get(k);
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("uses the Report-Only header and leaves the enforced policy untouched", () => {
    const res = withSecurityHeaders(new Request("https://quboolye.com/"), html());
    const reportOnly = res.headers.get(REPORT_ONLY) ?? "";
    expect(reportOnly).toContain("script-src");
    const enforced = res.headers.get("content-security-policy") ?? "";
    expect(enforced).toBe("frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'");
    expect(enforced).not.toContain("script-src");
    expect(enforced).not.toContain("connect-src");
  });

  it("script-src allows only the app's own origin: no wildcard, scheme or remote host", () => {
    const d = directives(withSecurityHeaders(new Request("https://quboolye.com/"), html()).headers.get(REPORT_ONLY) ?? "");
    const scripts = d.get("script-src") ?? [];
    expect(scripts).toContain("'self'");
    for (const source of scripts) {
      expect(source).not.toContain("*");
      expect(source).not.toMatch(/^https?:/);
      expect(source).not.toMatch(/^(data|blob|wss?):/);
      expect(source).not.toBe("'unsafe-eval'");
    }
    expect(scripts.filter((s) => s !== "'self'" && s !== "'unsafe-inline'")).toEqual([]);
    expect(d.get("default-src")).toEqual(["'self'"]);
    expect(d.get("object-src")).toEqual(["'none'"]);
    expect(d.get("base-uri")).toEqual(["'self'"]);
  });

  it("connect-src lists the Supabase origin over https and wss and nothing wider", () => {
    const d = directives(withSecurityHeaders(new Request("https://quboolye.com/"), html()).headers.get(REPORT_ONLY) ?? "");
    expect(d.get("connect-src")).toEqual([
      "'self'",
      PROD_SUPABASE,
      "wss://cldpnartkfnmllrkjaoi.supabase.co",
    ]);
    expect(d.get("img-src")).toEqual(["'self'", "data:", "blob:", PROD_SUPABASE]);
    expect(d.get("font-src")).toEqual(["'self'", "https://fonts.gstatic.com", "data:"]);
    expect(d.get("style-src")).toEqual(["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]);
    expect(d.get("worker-src")).toEqual(["'self'", "blob:"]);
  });

  it("no directive anywhere carries a wildcard or plain-http source, and nothing is reported externally", () => {
    const policy = withSecurityHeaders(new Request("https://quboolye.com/"), html()).headers.get(REPORT_ONLY) ?? "";
    expect(policy).not.toContain("*");
    expect(policy).not.toContain("http:");
    expect(policy).not.toContain("report-uri");
    expect(policy).not.toContain("report-to");
    expect(withSecurityHeaders(new Request("https://quboolye.com/"), html()).headers.get("report-to")).toBeNull();
  });

  it("frames stay disabled because the app embeds no iframe", () => {
    expect(directives(buildReportOnlyCsp(PROD_SUPABASE)).get("frame-src")).toEqual(["'none'"]);
    expect(read("src/routes/contact.tsx")).not.toContain("<iframe");
  });

  it("the Supabase origin is validated, never copied verbatim from configuration", () => {
    for (const bad of [
      "https://evil.example.com",
      "http://cldpnartkfnmllrkjaoi.supabase.co",
      "https://cldpnartkfnmllrkjaoi.supabase.co.evil.example",
      "https://*.supabase.co",
      "https://x.supabase.co; script-src *",
      "",
    ]) {
      const d = directives(buildReportOnlyCsp(bad));
      expect(d.get("connect-src")).toEqual(["'self'"]);
      expect(d.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    }
    process.env.VITE_SUPABASE_URL = "https://evil.example.com";
    process.env.SUPABASE_URL = "https://evil.example.com";
    expect(resolveSupabaseOrigin()).toBe(PROD_SUPABASE);
  });

  it("skips non-HTML responses and editor preview hosts, and keeps an upstream report-only policy", () => {
    const json = new Response("{}", { headers: { "content-type": "application/json" } });
    expect(withSecurityHeaders(new Request("https://quboolye.com/x"), json).headers.get(REPORT_ONLY)).toBeNull();
    for (const host of ["id-preview--abc.lovable.app", "abc.lovableproject.com", "localhost"]) {
      expect(withSecurityHeaders(new Request(`https://${host}/`), html()).headers.get(REPORT_ONLY)).toBeNull();
    }
    const upstream = new Response("<p>x</p>", {
      headers: { "content-type": "text/html", [REPORT_ONLY]: "default-src 'none'" },
    });
    expect(withSecurityHeaders(new Request("https://quboolye.com/"), upstream).headers.get(REPORT_ONLY)).toBe(
      "default-src 'none'",
    );
  });

  it("matches the committed production Supabase URL and what the root document loads", () => {
    expect(read(".env.production")).toContain(`VITE_SUPABASE_URL=${PROD_SUPABASE}`);
    expect(read(".github/workflows/cloudflare-production.yml")).toContain(`VITE_SUPABASE_URL: ${PROD_SUPABASE}`);
    const rootRoute = read("src/routes/__root.tsx");
    expect(rootRoute).toContain("https://fonts.googleapis.com/css2?");
    expect(rootRoute).toContain("https://fonts.gstatic.com");
    expect(rootRoute).not.toMatch(/<script[^>]+src=["']https?:/);
  });
});
