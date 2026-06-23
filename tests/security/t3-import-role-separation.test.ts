import type { SecurityTestConfig } from "./config";
import { fail, isAuthDenied, pass, skip, manual, type TestResult } from "./assertions";
import { signIn, trySignIn } from "./roles";
import { callServerFn } from "./server-fn";

/** Safe preview payload — validation only, no DB writes. */
const FINANCE_PREVIEW_PAYLOAD = {
  data: {
    type: "student_fees",
    rows: [{ academic_number: "SEC-TEST-000", amount: "0" }],
    updateExisting: false,
  },
};

const ACADEMIC_PREVIEW_PAYLOAD = {
  data: {
    type: "students",
    rows: [{ academic_number: "SEC-TEST-000", full_name_ar: "اختبار أمن" }],
    updateExisting: false,
  },
};

export async function runT3ImportRoleSeparationTests(
  config: SecurityTestConfig,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const suite = "T3";
  const fnId = config.serverFnIds.validateBulkImportPreview;

  if (!fnId) {
    results.push(
      skip(
        "import role separation suite",
        "SEC_TEST_FN_VALIDATE_BULK_IMPORT_PREVIEW not set",
      ),
    );
    return results.map((r) => ({ ...r, suite }));
  }

  // Registrar must not preview finance imports
  if (!config.registrar?.email || !config.registrar.password) {
    results.push(
      manual(
        "registrar cannot preview student_fees import",
        "SEC_TEST_REGISTRAR_* not configured — verify manually on staging",
      ),
    );
  } else {
    const registrar = await trySignIn(
      config,
      config.registrar.email,
      config.registrar.password,
    );
    if (!registrar) {
      results.push(skip("registrar cannot preview student_fees import", "sign-in failed"));
    } else {
      const res = await callServerFn(config, fnId, {
        token: registrar.accessToken,
        payload: FINANCE_PREVIEW_PAYLOAD,
      });
      if (!res) {
        results.push(skip("registrar cannot preview student_fees import", "no response"));
      } else if (isAuthDenied(res.body, res.status) || /صلاحية|استيراد هذا النوع/i.test(res.body)) {
        results.push(pass("registrar cannot preview student_fees import"));
      } else if (res.ok && !/error/i.test(res.body)) {
        results.push(fail("registrar cannot preview student_fees import", "preview succeeded"));
      } else {
        results.push(pass("registrar cannot preview student_fees import"));
      }
    }
  }

  // Registrar may preview academic imports (dry validation only)
  if (config.registrar?.email && config.registrar.password) {
    const registrar = await trySignIn(
      config,
      config.registrar.email,
      config.registrar.password,
    );
    if (registrar) {
      const res = await callServerFn(config, fnId, {
        token: registrar.accessToken,
        payload: ACADEMIC_PREVIEW_PAYLOAD,
      });
      if (!res) {
        results.push(skip("registrar can preview students import (validation)", "no response"));
      } else if (isAuthDenied(res.body, res.status)) {
        results.push(
          fail("registrar can preview students import (validation)", "unexpected deny"),
        );
      } else {
        results.push(
          pass(
            "registrar can preview students import (validation only, no import)",
            "preview endpoint reachable",
          ),
        );
      }
    }
  }

  // Finance / admin finance preview
  if (!config.finance?.email || !config.finance.password) {
    results.push(
      manual(
        "finance_officer can preview student_fees import",
        "SEC_TEST_FINANCE_* not configured — verify manually",
      ),
    );
  } else {
    const finance = await trySignIn(config, config.finance.email, config.finance.password);
    if (!finance) {
      results.push(skip("finance_officer can preview student_fees import", "sign-in failed"));
    } else {
      const res = await callServerFn(config, fnId, {
        token: finance.accessToken,
        payload: FINANCE_PREVIEW_PAYLOAD,
      });
      if (!res) {
        results.push(skip("finance_officer can preview student_fees import", "no response"));
      } else if (isAuthDenied(res.body, res.status)) {
        results.push(fail("finance_officer can preview student_fees import", "denied"));
      } else {
        results.push(pass("finance_officer can preview student_fees import (validation only)"));
      }
    }
  }

  // runBulkImport must not execute — only auth probe with dryRun
  const runFnId = config.serverFnIds.runBulkImport;
  if (!runFnId) {
    results.push(skip("runBulkImport not invoked (dryRun auth probe)", "fn id not set"));
  } else if (!config.registrar?.email || !config.registrar.password) {
    results.push(skip("registrar runBulkImport student_fees denied", "registrar not configured"));
  } else {
    const registrar = await trySignIn(
      config,
      config.registrar.email,
      config.registrar.password,
    );
    if (registrar) {
      const res = await callServerFn(config, runFnId, {
        token: registrar.accessToken,
        payload: {
          data: {
            type: "student_fees",
            fileName: "sec-test.csv",
            rows: [],
            dryRun: true,
            updateExisting: false,
          },
        },
      });
      if (!res) {
        results.push(skip("registrar runBulkImport student_fees denied", "no response"));
      } else if (isAuthDenied(res.body, res.status) || /صلاحية|استيراد/i.test(res.body)) {
        results.push(pass("registrar runBulkImport student_fees denied (dryRun probe)"));
      } else if (res.ok) {
        results.push(fail("registrar runBulkImport student_fees denied", "dryRun accepted"));
      } else {
        results.push(pass("registrar runBulkImport student_fees denied"));
      }
    }
  }

  return results.map((r) => ({ ...r, suite }));
}
