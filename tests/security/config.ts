/**
 * Security test configuration — staging / test accounts only.
 * Never commit real credentials; use security-test.config.example.env as template.
 */

import { readFileSync } from "fs";

const PRODUCTION_DOMAIN = "quboolye.com";

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

export function loadEnvFile(path?: string): void {
  const filePath = path ?? env("SEC_TEST_ENV_FILE");
  if (!filePath) return;
  try {
    const raw = readFileSync(filePath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch (e) {
    throw new Error(`Failed to load SEC_TEST_ENV_FILE (${filePath}): ${(e as Error).message}`);
  }
}

function assertNotProductionUrl(label: string, url: string): void {
  if (!url.toLowerCase().includes(PRODUCTION_DOMAIN)) return;
  const allowReadOnly = env("SEC_TEST_ALLOW_PRODUCTION_READONLY") === "1";
  if (allowReadOnly) {
    console.warn(
      `[security-test] WARNING: ${label} points at production (${PRODUCTION_DOMAIN}). Read-only tests only.`,
    );
    return;
  }
  throw new Error(
    `Refusing to run security tests against production domain (${PRODUCTION_DOMAIN}) in ${label}. ` +
      "Use a staging URL or set SEC_TEST_ALLOW_PRODUCTION_READONLY=1 only for read-only review (not recommended).",
  );
}

export interface SecurityTestConfig {
  targetUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  studentA: { email?: string; password?: string; id?: string };
  studentB: { email?: string; password?: string; id?: string };
  documentAId?: string;
  documentBId?: string;
  registrar?: { email?: string; password?: string };
  finance?: { email?: string; password?: string };
  admin?: { email?: string; password?: string };
  dean?: { email?: string; password?: string };
  hr?: { email?: string; password?: string };
  faculty?: { email?: string; password?: string };
  staff?: { email?: string; password?: string };
  validVerifyCode?: string;
  fakeVerifyCode: string;
  attachmentPathB?: string;
  serverFnIds: Record<string, string | undefined>;
}

export function loadSecurityTestConfig(): SecurityTestConfig {
  loadEnvFile();

  const targetUrl = env("SEC_TEST_TARGET_URL");
  if (!targetUrl) {
    throw new Error("SEC_TEST_TARGET_URL is required");
  }

  const supabaseUrl = env("SEC_TEST_SUPABASE_URL");
  if (!supabaseUrl) {
    throw new Error("SEC_TEST_SUPABASE_URL is required");
  }

  const supabaseAnonKey = env("SEC_TEST_SUPABASE_ANON_KEY");
  if (!supabaseAnonKey) {
    throw new Error("SEC_TEST_SUPABASE_ANON_KEY is required");
  }

  assertNotProductionUrl("SEC_TEST_TARGET_URL", targetUrl);
  assertNotProductionUrl("SEC_TEST_SUPABASE_URL", supabaseUrl);

  return {
    targetUrl: targetUrl.replace(/\/$/, ""),
    supabaseUrl,
    supabaseAnonKey,
    studentA: {
      email: env("SEC_TEST_STUDENT_A_EMAIL"),
      password: env("SEC_TEST_STUDENT_A_PASSWORD"),
      id: env("SEC_TEST_STUDENT_A_ID"),
    },
    studentB: {
      email: env("SEC_TEST_STUDENT_B_EMAIL"),
      password: env("SEC_TEST_STUDENT_B_PASSWORD"),
      id: env("SEC_TEST_STUDENT_B_ID"),
    },
    documentAId: env("SEC_TEST_DOCUMENT_A_ID"),
    documentBId: env("SEC_TEST_DOCUMENT_B_ID"),
    registrar: {
      email: env("SEC_TEST_REGISTRAR_EMAIL"),
      password: env("SEC_TEST_REGISTRAR_PASSWORD"),
    },
    finance: {
      email: env("SEC_TEST_FINANCE_EMAIL"),
      password: env("SEC_TEST_FINANCE_PASSWORD"),
    },
    admin: {
      email: env("SEC_TEST_ADMIN_EMAIL"),
      password: env("SEC_TEST_ADMIN_PASSWORD"),
    },
    dean: {
      email: env("SEC_TEST_DEAN_EMAIL"),
      password: env("SEC_TEST_DEAN_PASSWORD"),
    },
    hr: {
      email: env("SEC_TEST_HR_EMAIL"),
      password: env("SEC_TEST_HR_PASSWORD"),
    },
    faculty: {
      email: env("SEC_TEST_FACULTY_EMAIL"),
      password: env("SEC_TEST_FACULTY_PASSWORD"),
    },
    staff: {
      email: env("SEC_TEST_STAFF_EMAIL"),
      password: env("SEC_TEST_STAFF_PASSWORD"),
    },
    validVerifyCode: env("SEC_TEST_VALID_VERIFY_CODE"),
    fakeVerifyCode: env("SEC_TEST_FAKE_VERIFY_CODE") ?? "INVALID-TEST-CODE",
    attachmentPathB: env("SEC_TEST_ATTACHMENT_PATH_B"),
    serverFnIds: {
      getUnofficialTranscriptData: env("SEC_TEST_FN_GET_UNOFFICIAL_TRANSCRIPT_DATA"),
      getStudentProgress: env("SEC_TEST_FN_GET_STUDENT_PROGRESS"),
      listAuditLogs: env("SEC_TEST_FN_LIST_AUDIT_LOGS"),
      validateBulkImportPreview: env("SEC_TEST_FN_VALIDATE_BULK_IMPORT_PREVIEW"),
      runBulkImport: env("SEC_TEST_FN_RUN_BULK_IMPORT"),
      getOperationsOverview: env("SEC_TEST_FN_GET_OPERATIONS_OVERVIEW"),
      getStudentRequestAttachmentUrl: env("SEC_TEST_FN_GET_STUDENT_REQUEST_ATTACHMENT_URL"),
      getAdminSession: env("SEC_TEST_FN_GET_ADMIN_SESSION"),
    },
  };
}
