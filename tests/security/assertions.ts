export type TestStatus = "PASS" | "FAIL" | "SKIP" | "MANUAL";

export interface TestResult {
  status: TestStatus;
  name: string;
  reason: string;
  suite?: string;
}

export function pass(name: string, reason = ""): TestResult {
  return { status: "PASS", name, reason: reason || "expected behavior" };
}

export function fail(name: string, reason: string): TestResult {
  return { status: "FAIL", name, reason };
}

export function skip(name: string, reason: string): TestResult {
  return { status: "SKIP", name, reason };
}

export function manual(name: string, reason: string): TestResult {
  return { status: "MANUAL", name, reason };
}

/** Fields that must not appear in anonymous verify_document responses. */
export const PII_FIELD_PATTERNS = [
  "national_id",
  "full_name",
  "full_name_ar",
  "full_name_en",
  "email",
  "phone",
  "mobile",
  "student_profile_id",
  "user_id",
  "verification_code",
  "pdf_url",
  "metadata",
  "address",
  "date_of_birth",
  "birth",
] as const;

export function collectJsonKeys(value: unknown, prefix = ""): string[] {
  const keys: string[] = [];
  if (value === null || value === undefined) return keys;
  if (Array.isArray(value)) {
    for (const item of value) keys.push(...collectJsonKeys(item, prefix));
    return keys;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${k}` : k;
      keys.push(path.toLowerCase());
      keys.push(...collectJsonKeys(v, path));
    }
  }
  return keys;
}

export function findPiiLeaks(payload: unknown): string[] {
  const keys = collectJsonKeys(payload);
  const leaks: string[] = [];
  for (const key of keys) {
    for (const pii of PII_FIELD_PATTERNS) {
      if (key.includes(pii)) {
        leaks.push(key);
        break;
      }
    }
  }
  return [...new Set(leaks)];
}

const AUTH_DENIED_RE =
  /unauthorized|forbidden|401|403|ليس لديك صلاحية|not authorized|invalid token|no authorization/i;

export function isAuthDenied(body: string, status: number): boolean {
  if (status === 401 || status === 403 || status === 405) return true;
  return AUTH_DENIED_RE.test(body);
}

export function isAccessDeniedError(message: string): boolean {
  return AUTH_DENIED_RE.test(message);
}

export function isSupabaseDenied(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = error.message ?? "";
  return (
    code === "42501" ||
    code === "PGRST301" ||
    /permission denied|row-level security|jwt/i.test(msg)
  );
}

export function formatResult(r: TestResult): string {
  return `${r.status} ${r.name}${r.reason ? ` — ${r.reason}` : ""}`;
}

export function summarizeResults(results: TestResult[]): {
  pass: number;
  fail: number;
  skip: number;
  manual: number;
} {
  return {
    pass: results.filter((r) => r.status === "PASS").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    skip: results.filter((r) => r.status === "SKIP").length,
    manual: results.filter((r) => r.status === "MANUAL").length,
  };
}
