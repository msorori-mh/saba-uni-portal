import type { SecurityTestConfig } from "./config";
import { fail, isAuthDenied, pass, skip, type TestResult } from "./assertions";
import { signIn, trySignIn } from "./roles";
import { callServerFn } from "./server-fn";

type FnProbe = {
  name: string;
  envKey: keyof SecurityTestConfig["serverFnIds"];
  method?: "GET" | "POST";
  payload?: unknown;
};

const SENSITIVE_FN_PROBES: FnProbe[] = [
  { name: "listAuditLogs without token", envKey: "listAuditLogs", payload: {} },
  {
    name: "validateBulkImportPreview without token",
    envKey: "validateBulkImportPreview",
    payload: { data: { type: "students", rows: [], updateExisting: false } },
  },
  {
    name: "runBulkImport without token",
    envKey: "runBulkImport",
    payload: {
      data: {
        type: "students",
        fileName: "sec-test.csv",
        rows: [],
        dryRun: true,
        updateExisting: false,
      },
    },
  },
  {
    name: "getOperationsOverview without token",
    envKey: "getOperationsOverview",
    payload: {},
  },
  {
    name: "getStudentRequestAttachmentUrl without token",
    envKey: "getStudentRequestAttachmentUrl",
    payload: { data: { path: "security-test/probe.bin" } },
  },
  { name: "getAdminSession without token", envKey: "getAdminSession", method: "GET" },
];

const WRONG_ROLE_MATRIX: Array<{
  name: string;
  envKey: keyof SecurityTestConfig["serverFnIds"];
  account: (c: SecurityTestConfig) => { email?: string; password?: string };
  payload?: unknown;
  method?: "GET" | "POST";
}> = [
  {
    name: "student cannot listAuditLogs",
    envKey: "listAuditLogs",
    account: (c) => c.studentA,
    payload: {},
  },
  {
    name: "student cannot getOperationsOverview",
    envKey: "getOperationsOverview",
    account: (c) => c.studentA,
    payload: {},
  },
  {
    name: "faculty cannot listAuditLogs",
    envKey: "listAuditLogs",
    account: (c) => c.faculty,
    payload: {},
  },
  {
    name: "staff cannot listAuditLogs",
    envKey: "listAuditLogs",
    account: (c) => c.staff,
    payload: {},
  },
  {
    name: "registrar cannot getOperationsOverview (admin-only)",
    envKey: "getOperationsOverview",
    account: (c) => c.registrar,
    payload: {},
  },
  {
    name: "dean cannot listAuditLogs (full read admin-only)",
    envKey: "listAuditLogs",
    account: (c) => c.dean,
    payload: {},
  },
];

export async function runT2ServerFunctionsAuthzTests(
  config: SecurityTestConfig,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const suite = "T2";

  for (const probe of SENSITIVE_FN_PROBES) {
    const fnId = config.serverFnIds[probe.envKey];
    if (!fnId) {
      results.push(skip(probe.name, `SEC_TEST_FN_${envSuffix(probe.envKey)} not set`));
      continue;
    }
    const res = await callServerFn(config, fnId, {
      method: probe.method,
      payload: probe.payload,
    });
    if (!res) {
      results.push(skip(probe.name, "no response"));
      continue;
    }
    if (isAuthDenied(res.body, res.status)) {
      results.push(pass(probe.name));
    } else if (res.ok) {
      results.push(fail(probe.name, `unexpected HTTP ${res.status} success`));
    } else {
      results.push(pass(probe.name, `denied (${res.status})`));
    }
  }

  for (const probe of WRONG_ROLE_MATRIX) {
    const fnId = config.serverFnIds[probe.envKey];
    const creds = probe.account(config);
    if (!fnId) {
      results.push(skip(probe.name, `server fn id not configured`));
      continue;
    }
    if (!creds.email || !creds.password) {
      results.push(skip(probe.name, "test account not configured"));
      continue;
    }
    let session;
    try {
      session = await signIn(config, creds.email, creds.password, probe.name);
    } catch (e) {
      results.push(skip(probe.name, (e as Error).message));
      continue;
    }
    if (!session) {
      results.push(skip(probe.name, "sign-in failed"));
      continue;
    }
    const res = await callServerFn(config, fnId, {
      method: probe.method,
      token: session.accessToken,
      payload: probe.payload,
    });
    if (!res) {
      results.push(skip(probe.name, "no response"));
      continue;
    }
    if (isAuthDenied(res.body, res.status) || /صلاحية|Forbidden/i.test(res.body)) {
      results.push(pass(probe.name));
    } else if (res.ok && probe.envKey === "listAuditLogs") {
      results.push(fail(probe.name, "received audit log data"));
    } else if (res.ok) {
      results.push(fail(probe.name, `unexpected HTTP ${res.status} success`));
    } else {
      results.push(pass(probe.name));
    }
  }

  // Admin read-only probe (no writes)
  {
    const fnId = config.serverFnIds.getAdminSession;
    if (!fnId) {
      results.push(skip("admin getAdminSession read-only", "SEC_TEST_FN_GET_ADMIN_SESSION not set"));
    } else if (!config.admin?.email || !config.admin.password) {
      results.push(skip("admin getAdminSession read-only", "SEC_TEST_ADMIN_* not set"));
    } else {
      const admin = await trySignIn(config, config.admin.email, config.admin.password);
      if (!admin) {
        results.push(skip("admin getAdminSession read-only", "admin sign-in failed"));
      } else {
        const res = await callServerFn(config, fnId, {
          method: "GET",
          token: admin.accessToken,
        });
        if (res?.ok && /roles|email/i.test(res.body)) {
          results.push(pass("admin getAdminSession returns session (read-only)"));
        } else if (res && isAuthDenied(res.body, res.status)) {
          results.push(fail("admin getAdminSession returns session", "denied for admin"));
        } else {
          results.push(
            skip("admin getAdminSession read-only", `unexpected response ${res?.status ?? "?"}`),
          );
        }
      }
    }
  }

  return results.map((r) => ({ ...r, suite }));
}

function envSuffix(key: keyof SecurityTestConfig["serverFnIds"]): string {
  const map: Record<keyof SecurityTestConfig["serverFnIds"], string> = {
    getUnofficialTranscriptData: "GET_UNOFFICIAL_TRANSCRIPT_DATA",
    getStudentProgress: "GET_STUDENT_PROGRESS",
    listAuditLogs: "LIST_AUDIT_LOGS",
    validateBulkImportPreview: "VALIDATE_BULK_IMPORT_PREVIEW",
    runBulkImport: "RUN_BULK_IMPORT",
    getOperationsOverview: "GET_OPERATIONS_OVERVIEW",
    getStudentRequestAttachmentUrl: "GET_STUDENT_REQUEST_ATTACHMENT_URL",
    getAdminSession: "GET_ADMIN_SESSION",
  };
  return map[key];
}
