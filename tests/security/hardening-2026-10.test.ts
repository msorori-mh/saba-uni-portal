import { beforeEach, describe, expect, it } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { localRateLimit, resetLocalRateLimit } from "../../src/lib/rate-limit-fallback";
import { withSecurityHeaders } from "../../src/lib/security-headers";

const root = join(import.meta.dir, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("pre-auth rate limit never fails open", () => {
  beforeEach(() => resetLocalRateLimit());
  const policy = { maxAttempts: 5, windowMinutes: 10, blockMinutes: 15 };

  it("the public limiter falls back to the local limiter on RPC failure", () => {
    const src = read("src/lib/rate-limit.functions.ts");
    expect(src).not.toMatch(/return \{ allowed: true/);
    expect(src.match(/localRateLimit\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("allows up to the policy, then blocks for the block window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(localRateLimit("k", policy, t0 + i).allowed).toBe(true);
    const blocked = localRateLimit("k", policy, t0 + 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.blocked_until).toBeTruthy();
    expect(localRateLimit("k", policy, t0 + 14 * 60_000).allowed).toBe(false);
    expect(localRateLimit("k", policy, t0 + 16 * 60_000).allowed).toBe(true);
  });

  it("keys are independent and old attempts expire", () => {
    const t0 = 5_000_000;
    for (let i = 0; i < 5; i++) localRateLimit("a", policy, t0);
    expect(localRateLimit("b", policy, t0).allowed).toBe(true);
    for (let i = 0; i < 4; i++) localRateLimit("c", policy, t0);
    expect(localRateLimit("c", policy, t0 + 11 * 60_000).remaining).toBe(4);
  });
});

describe("document security headers", () => {
  const html = () => new Response("<html></html>", { headers: { "content-type": "text/html; charset=utf-8" } });

  it("adds anti-clickjacking headers to production HTML", () => {
    const res = withSecurityHeaders(new Request("https://quboolye.com/"), html());
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("leaves non-HTML responses and editor preview hosts untouched", () => {
    const json = new Response("{}", { headers: { "content-type": "application/json" } });
    expect(withSecurityHeaders(new Request("https://quboolye.com/x"), json).headers.get("x-frame-options")).toBeNull();
    const preview = withSecurityHeaders(new Request("https://id-preview--abc.lovable.app/"), html());
    expect(preview.headers.get("content-security-policy")).toBeNull();
  });

  it("does not override a stricter upstream policy and keeps status/body", async () => {
    const upstream = new Response("<p>x</p>", {
      status: 404,
      headers: { "content-type": "text/html", "content-security-policy": "default-src 'none'" },
    });
    const res = withSecurityHeaders(new Request("https://quboolye.com/missing"), upstream);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(await res.text()).toBe("<p>x</p>");
  });

  it("is wired into the server entry", () => {
    expect(read("src/server.ts")).toContain("withSecurityHeaders(request,");
  });
});

describe("role cache", () => {
  const src = read("src/lib/authz.server.ts");
  it("is short-lived, de-duplicates in-flight lookups and never caches errors", () => {
    expect(src).toContain("const ROLE_CACHE_TTL_MS = 10_000;");
    expect(src).toContain("roleInFlight");
    expect(src).toContain("export function invalidateUserRolesCache");
    // cache write happens only on the success path of the loader
    expect(src.indexOf("roleCache.set(userId")).toBeGreaterThan(src.indexOf("loadUserRoles(userId)\n    .then("));
  });
});

describe("every server function authenticates", () => {
  // Public by design; anything new here needs a deliberate review.
  const PUBLIC_SERVER_FUNCTIONS = new Set(["checkPublicRateLimit"]);

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(name)) out.push(p);
    }
    return out;
  }

  it("no exported createServerFn lacks requireSupabaseAuth", () => {
    const offenders: string[] = [];
    let total = 0;
    for (const file of walk(join(root, "src"))) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("createServerFn(")) continue;
      const re = /export const (\w+)\s*=\s*createServerFn\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        total += 1;
        const rest = text.slice(m.index + m[0].length);
        const next = rest.search(/\nexport /);
        const block = next === -1 ? rest : rest.slice(0, next);
        if (!block.includes("requireSupabaseAuth") && !PUBLIC_SERVER_FUNCTIONS.has(m[1])) {
          offenders.push(`${file.replace(root + "/", "")}: ${m[1]}`);
        }
      }
    }
    expect(total).toBeGreaterThan(300);
    expect(offenders).toEqual([]);
  });
});

describe("committed production env file holds public values only", () => {
  it(".env.production has no server secrets", () => {
    const env = read(".env.production");
    expect(env).not.toMatch(/service_role|SERVICE_ROLE|SECRET|RESEND|PASSWORD|PRIVATE_KEY/);
    for (const line of env.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(eyJ[\w-]+\.([\w-]+)\.[\w-]+)/);
      if (!m) continue;
      const payload = JSON.parse(Buffer.from(m[3], "base64url").toString("utf8"));
      expect(payload.role).toBe("anon");
    }
  });
});

describe("follow-ups 2026-10-04", () => {
  it("HTML gets a bounded shared-cache lifetime; non-200 and explicit policies are untouched", () => {
    const ok = withSecurityHeaders(
      new Request("https://quboolye.com/faculty"),
      new Response("<html></html>", { headers: { "content-type": "text/html" } }),
    );
    expect(ok.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60, stale-while-revalidate=300");
    const notFound = withSecurityHeaders(
      new Request("https://quboolye.com/x"),
      new Response("<html></html>", { status: 404, headers: { "content-type": "text/html" } }),
    );
    expect(notFound.headers.get("cache-control")).toBeNull();
    const explicit = withSecurityHeaders(
      new Request("https://quboolye.com/x"),
      new Response("<html></html>", { headers: { "content-type": "text/html", "cache-control": "no-store" } }),
    );
    expect(explicit.headers.get("cache-control")).toBe("no-store");
  });

  it("contact form is throttled through the public limiter", () => {
    expect(read("src/routes/contact.tsx")).toContain("RATE_LIMIT_POLICIES.contactMessage");
    expect(read("src/lib/rate-limit.functions.ts")).toContain('"contact_message"');
  });

  it("program detail shows the real degree and duration", async () => {
    const { programDegree, programYears, arabicYears } = await import("../../src/lib/public-site-format");
    expect(programDegree({ code: "MCS", degree_type: null })).toBe("ماجستير");
    expect(programDegree({ code: "CS", degree_type: null })).toBe("بكالوريوس");
    expect(arabicYears(programYears({ code: "MCS", degree_type: "ماجستير", years: null }))).toBe("سنتان");
    const detail = read("src/routes/departments.$code.tsx");
    expect(detail).not.toContain('<span className="font-bold">بكالوريوس</span>');
    expect(detail).not.toContain("70%");
  });
});
