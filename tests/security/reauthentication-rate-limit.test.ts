import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { webcrypto } from "node:crypto";

function ast(path: string) {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}
function js(source: string) {
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

// Execute the real helper/handler bodies without importing live credentials or
// globally mocking Supabase modules used by other security suites.
const serverAst = ast("src/lib/rate-limit.server.ts");
const helperSource = serverAst.statements.filter((node) =>
  (ts.isFunctionDeclaration(node) && node.name?.text === "enforceReauthenticationRateLimit")
  || (ts.isVariableStatement(node) && node.declarationList.declarations.some((d) =>
    ["SERVER_RATE_LIMIT_POLICIES", "RATE_LIMIT_ERROR_AR"].includes(d.name.getText(serverAst)))),
).map((node) => node.getText(serverAst).replace(/^export /, "")).join("\n");
const buildHelper = (rpc: unknown) => new Function("supabaseAdmin", `${js(helperSource)}; return enforceReauthenticationRateLimit;`)({ rpc });

test.each([
  { data: null, error: null }, { data: { allowed: false }, error: null },
  { data: {}, error: null }, { data: { allowed: true }, error: new Error("unavailable") },
])("reauthentication rejects unavailable or denied counters (%j)", async (result) => {
  await expect(buildHelper(async () => result)("reauth:user")).rejects.toThrow();
});
test("reauthentication accepts only an explicit allowance under the five-attempt policy", async () => {
  let parameters: unknown;
  await buildHelper(async (_name: string, input: unknown) => { parameters = input; return { data: { allowed: true }, error: null }; })("reauth:user");
  expect(parameters).toEqual({ p_key: "reauth:user", p_action: "reauthentication", p_max_attempts: 5, p_window_minutes: 15, p_block_minutes: 15 });
});

const publicAst = ast("src/lib/rate-limit.functions.ts");
let handlerSource = "";
function visit(node: ts.Node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "handler") {
    handlerSource = node.arguments[0].getText(publicAst);
  }
  ts.forEachChild(node, visit);
}
visit(publicAst);
function publicFixture(ip: string | null, mode: "error" | "throw" | "ok") {
  const calls: string[] = [];
  const policy = { action: "login_attempt", maxAttempts: 5, windowMinutes: 15 };
  const handler = new Function("PUBLIC_POLICY_BY_ACTION", "getRequest", "supabaseAdmin", "localRateLimit", "crypto", "console",
    `${js(`const handler = ${handlerSource};`)}; return handler;`)(
    { login_attempt: policy, contact_message: { ...policy, action: "contact_message" } },
    () => ({ headers: { get: () => ip } }),
    { rpc: async () => { if (mode === "throw") throw new Error("offline"); return mode === "error" ? { error: new Error("offline") } : { data: { allowed: true } }; } },
    (key: string) => { calls.push(key); return { allowed: false }; }, webcrypto, { warn: () => undefined },
  );
  return { handler, calls };
}
test.each(["error", "throw"] as const)("public limiter uses its hashed local fallback without a scope error (%s)", async (mode) => {
  const f = publicFixture("192.0.2.1", mode);
  expect(await f.handler({ data: { action: "login_attempt", key: "student@example.test" } })).toEqual({ allowed: false });
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0]).toMatch(/^login_attempt:[a-f0-9]{64}$/);
});
test("public fallback separates client IPs and does not fail open for contact messages", async () => {
  const a = publicFixture("192.0.2.1", "error"), b = publicFixture("192.0.2.2", "error");
  for (const f of [a, b]) await f.handler({ data: { action: "login_attempt", key: "student@example.test" } });
  expect(a.calls[0]).not.toBe(b.calls[0]);
  const missing = publicFixture(null, "ok");
  expect(await missing.handler({ data: { action: "contact_message", key: "arbitrary" } })).toEqual({ allowed: false });
});
