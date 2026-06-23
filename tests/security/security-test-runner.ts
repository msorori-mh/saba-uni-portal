#!/usr/bin/env bun
/**
 * SECURITY-FULL-ASSURANCE-02 — Staging security test harness runner.
 * Read-only / non-destructive probes against staging test accounts only.
 */
import { loadSecurityTestConfig } from "./config";
import { formatResult, summarizeResults, type TestResult } from "./assertions";
import { runT1StudentIdorTests } from "./t1-student-idor.test";
import { runT2ServerFunctionsAuthzTests } from "./t2-server-functions-authz.test";
import { runT3ImportRoleSeparationTests } from "./t3-import-role-separation.test";
import { runT4AnonPublicSurfaceTests } from "./t4-anon-public-surface.test";
import { runT5AuditLogScopeTests } from "./t5-audit-log-scope.test";

async function main(): Promise<number> {
  let config;
  try {
    config = loadSecurityTestConfig();
  } catch (e) {
    console.error(String((e as Error).message));
    return 1;
  }

  console.log("=== Saba Uni Portal — Security Assurance Harness (02) ===");
  console.log(`Target: ${config.targetUrl}`);
  console.log(`Supabase: ${config.supabaseUrl}`);
  console.log("Mode: read-only / non-destructive\n");

  const all: TestResult[] = [];

  const suites: Array<{ name: string; run: () => Promise<TestResult[]> }> = [
    { name: "T1 Student IDOR", run: () => runT1StudentIdorTests(config) },
    { name: "T2 Server Functions AuthZ", run: () => runT2ServerFunctionsAuthzTests(config) },
    { name: "T3 Import Role Separation", run: () => runT3ImportRoleSeparationTests(config) },
    { name: "T4 Anonymous Public Surface", run: () => runT4AnonPublicSurfaceTests(config) },
    { name: "T5 Audit Log Scope", run: () => runT5AuditLogScopeTests(config) },
  ];

  for (const suite of suites) {
    console.log(`--- ${suite.name} ---`);
    const results = await suite.run();
    for (const r of results) {
      console.log(formatResult(r));
    }
    all.push(...results);
    console.log("");
  }

  const summary = summarizeResults(all);
  console.log("=== Summary ===");
  console.log(
    `PASS: ${summary.pass}  FAIL: ${summary.fail}  SKIP: ${summary.skip}  MANUAL: ${summary.manual}`,
  );

  if (summary.fail > 0) {
    console.error("\nSecurity harness reported FAIL result(s). Review output above.");
    return 2;
  }

  console.log("\nHarness finished (no FAIL). Review SKIP/MANUAL items on staging.");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
