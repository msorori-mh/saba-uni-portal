/**
 * STUDENT-ACCOUNTS-PRODUCTION-REALITY-RECONCILIATION-01 (track D)
 *
 * Offline / read-only preflight guards for the `student_accounts` importer
 * (PR #195). Pure-function core: this module imports NO Supabase client and
 * performs NO writes and NO network I/O. All DB/Auth facts arrive through
 * dependency-injected readers (`StudentAccountsPreflightReaders`); the
 * read-only server wiring lives in `student-accounts-preflight.server.ts`.
 *
 * Design precedent: `eligibility-import-policy.ts` (small, side-effect-free
 * policy module). Row classification mirrors the semantics of
 * `validateStudentAccounts` (student-accounts.ts) which is read-only by
 * construction via `previewBulkImportValidation("student_accounts", rawRows)`,
 * and adds reconciliation-only codes (DUPLICATE_* / SNAPSHOT_MISMATCH) plus a
 * binding rule against a production snapshot (counts only, NO PII).
 *
 * PII policy: outputs carry row numbers, academic numbers (correlation key),
 * and classification codes only — never names, emails, phones, auth user IDs,
 * or linked user IDs.
 */
import {
  isValidUniversityLoginEmail,
  normalizeUniversityLoginEmail,
} from "@/lib/university-email-auth";
import { createHash } from "node:crypto";

/* ------------------------------------------------------------------ *
 * Classification codes (exactly 12 — contract, do not extend inline)  *
 * ------------------------------------------------------------------ */
export const STUDENT_ACCOUNTS_PREFLIGHT_CODES = [
  "ALREADY_LINKED",
  "READY_TO_CREATE",
  "CONFLICT",
  "STUDENT_NOT_FOUND",
  "INVALID_EMAIL",
  "DUPLICATE_IN_FILE",
  "DUPLICATE_ACADEMIC_NUMBER",
  "DUPLICATE_EMAIL",
  "SNAPSHOT_MISMATCH",
  "FILE_CHANGED_AFTER_PREVIEW",
  "UNAUTHORIZED",
  "STALE_SNAPSHOT",
] as const;

export type StudentAccountsPreflightCode =
  (typeof STUDENT_ACCOUNTS_PREFLIGHT_CODES)[number];

/** Codes that may appear on a single file row. */
export const STUDENT_ACCOUNTS_ROW_CODES: readonly StudentAccountsPreflightCode[] = [
  "ALREADY_LINKED",
  "READY_TO_CREATE",
  "CONFLICT",
  "STUDENT_NOT_FOUND",
  "INVALID_EMAIL",
  "DUPLICATE_IN_FILE",
  "DUPLICATE_ACADEMIC_NUMBER",
  "DUPLICATE_EMAIL",
  "SNAPSHOT_MISMATCH",
];

/** Codes that are raised at batch/gate level (never on a single row). */
export const STUDENT_ACCOUNTS_BATCH_CODES: readonly StudentAccountsPreflightCode[] = [
  "FILE_CHANGED_AFTER_PREVIEW",
  "UNAUTHORIZED",
  "STALE_SNAPSHOT",
  "SNAPSHOT_MISMATCH",
];

/* ------------------------------------------------------------------ *
 * HOLD reasons (gate output; stable strings for audits/tests)         *
 * ------------------------------------------------------------------ */
export const STUDENT_ACCOUNTS_HOLD_REASONS = [
  "BINDING_RULE_VIOLATION",
  "CONFLICTS_PRESENT",
  "DUPLICATES_PRESENT",
  "STUDENT_NOT_FOUND_PRESENT",
  "INVALID_EMAIL_PRESENT",
  "SNAPSHOT_MISMATCH_PRESENT",
  "STALE_SNAPSHOT",
  "PROJECT_REF_MISMATCH",
  "FILE_CHANGED_AFTER_PREVIEW",
  "DRY_RUN_MISSING",
  "UNAUTHORIZED_ROLE",
  "IMPORTER_SOURCE_UNPROVEN",
  "DEPLOY_PROOF_UNPROVEN",
] as const;

export type StudentAccountsHoldReason =
  (typeof STUDENT_ACCOUNTS_HOLD_REASONS)[number];

/** Only these roles may execute a live student_accounts import. */
export const STUDENT_ACCOUNTS_AUTHORIZED_ROLES = ["admin", "system_admin"] as const;

/* ------------------------------------------------------------------ *
 * Production snapshot contract (NO PII — counts only)                 *
 * ------------------------------------------------------------------ */
export const STUDENT_ACCOUNTS_SNAPSHOT_SCHEMA_VERSION = 1;
/** Default freshness window for a snapshot before it is considered stale. */
export const STUDENT_ACCOUNTS_SNAPSHOT_TTL_MS = 15 * 60 * 1000;

export type StudentAccountsProductionSnapshot = {
  schema_version: number;
  total_profiles: number;
  linked_profiles: number;
  unlinked_profiles: number;
  /** ISO-8601 capture time (UTC). */
  captured_at: string;
  /** ISO-8601 expiry; gate must HOLD when now > expires_at. */
  expires_at: string;
  /** How the counts were captured, e.g. "supabase_service_role_readonly". */
  source_channel: string;
  /** Supabase project ref the counts belong to (anti-wrong-environment). */
  project_ref: string;
  /** sha256 over the canonical JSON of every field above. */
  snapshot_hash: string;
};

/* ------------------------------------------------------------------ *
 * Hashing helpers (canonical JSON → sha256 hex)                       *
 * ------------------------------------------------------------------ */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Deterministic hash of the file rows exactly as previewed/executed. */
export function computeStudentAccountsFileHash(
  rawRows: Record<string, unknown>[],
): string {
  return sha256Hex(stableStringify(rawRows));
}

export function computeStudentAccountsSnapshotHash(
  snapshot: Omit<StudentAccountsProductionSnapshot, "snapshot_hash">,
): string {
  return sha256Hex(
    stableStringify({
      schema_version: snapshot.schema_version,
      total_profiles: snapshot.total_profiles,
      linked_profiles: snapshot.linked_profiles,
      unlinked_profiles: snapshot.unlinked_profiles,
      captured_at: snapshot.captured_at,
      expires_at: snapshot.expires_at,
      source_channel: snapshot.source_channel,
      project_ref: snapshot.project_ref,
    }),
  );
}

/** Build a snapshot from measured counts; derives unlinked + hash. */
export function buildStudentAccountsProductionSnapshot(fields: {
  total_profiles: number;
  linked_profiles: number;
  captured_at: string;
  expires_at: string;
  source_channel: string;
  project_ref: string;
}): StudentAccountsProductionSnapshot {
  const base: Omit<StudentAccountsProductionSnapshot, "snapshot_hash"> = {
    schema_version: STUDENT_ACCOUNTS_SNAPSHOT_SCHEMA_VERSION,
    total_profiles: fields.total_profiles,
    linked_profiles: fields.linked_profiles,
    unlinked_profiles: fields.total_profiles - fields.linked_profiles,
    captured_at: fields.captured_at,
    expires_at: fields.expires_at,
    source_channel: fields.source_channel,
    project_ref: fields.project_ref,
  };
  return { ...base, snapshot_hash: computeStudentAccountsSnapshotHash(base) };
}

/** True when the embedded hash matches the recomputed canonical hash. */
export function verifyStudentAccountsSnapshotHash(
  snapshot: StudentAccountsProductionSnapshot,
): boolean {
  const { snapshot_hash, ...rest } = snapshot;
  return computeStudentAccountsSnapshotHash(rest) === snapshot_hash;
}

export function isStudentAccountsSnapshotExpired(
  snapshot: StudentAccountsProductionSnapshot,
  nowIso: string,
): boolean {
  return Date.parse(nowIso) > Date.parse(snapshot.expires_at);
}

/* ------------------------------------------------------------------ *
 * Row classification (mirrors validateStudentAccounts semantics)      *
 * ------------------------------------------------------------------ */
const str = (v: unknown) => (v == null ? "" : String(v).trim());

/** Same header-alias contract as the importer (Arabic headers accepted). */
const HEADER_ALIASES: Record<string, string> = {
  academic_number: "academic_number",
  "الرقم الأكاديمي": "academic_number",
  university_email: "university_email",
  "البريد الإلكتروني الجامعي": "university_email",
  "الايميل الجامعي": "university_email",
  "الإيميل الجامعي": "university_email",
  must_change_password: "must_change_password",
  is_active: "is_active",
  notes: "notes",
  "ملاحظات": "notes",
};

function normalizeRaw(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const canon =
      HEADER_ALIASES[key.trim()] ?? HEADER_ALIASES[key.trim().toLowerCase()] ?? key;
    if (out[canon] == null || out[canon] === "") out[canon] = value;
  }
  return out;
}

function parseBool(v: unknown, defaultValue: boolean): boolean {
  if (v === null || v === undefined || v === "") return defaultValue;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "y", "نعم", "صحيح"].includes(s)) return true;
  if (["false", "0", "no", "n", "لا", "خطأ"].includes(s)) return false;
  return defaultValue;
}

/** Read-only profile fact needed by the preflight (no PII beyond email-for-compare). */
export type StudentAccountsPreflightProfileRecord = {
  academic_number: string;
  email: string | null;
  user_linked: boolean;
};

export type StudentAccountsPreflightRowClassification = {
  /** 1-based row number in the source file (excluding header). */
  rowNumber: number;
  /** Correlation key only (synthetic in fixtures); never an email/name. */
  academic_number: string;
  code: StudentAccountsPreflightCode;
};

/**
 * Classify every file row into exactly one of the row-level codes.
 * Pure: profiles and the set of auth-existing emails are provided by callers.
 */
export function classifyStudentAccountsPreflightRows(
  rawRows: Record<string, unknown>[],
  profiles: StudentAccountsPreflightProfileRecord[],
  authExistingEmails: ReadonlySet<string>,
): StudentAccountsPreflightRowClassification[] {
  const byAcademic = new Map(profiles.map((p) => [p.academic_number, p]));
  // First claimant wins for DB email ownership; a DB-level duplicate email is
  // itself a production defect the snapshot/counts layer reports separately.
  const emailOwner = new Map<string, string>();
  for (const p of profiles) {
    if (p.email) {
      const norm = normalizeUniversityLoginEmail(p.email);
      if (!emailOwner.has(norm)) emailOwner.set(norm, p.academic_number);
    }
  }

  const seenPairs = new Set<string>();
  const seenAcademic = new Set<string>();
  const seenEmail = new Set<string>();
  const out: StudentAccountsPreflightRowClassification[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 2;
    const raw = normalizeRaw(rawRows[i] ?? {});
    const academic_number = str(raw.academic_number);
    const emailRaw = str(raw.university_email);
    const email = normalizeUniversityLoginEmail(emailRaw);
    const is_active = parseBool(raw.is_active, true);
    const pair = `${academic_number}\n${email}`;

    let code: StudentAccountsPreflightCode;
    if (!academic_number) {
      code = "STUDENT_NOT_FOUND";
    } else if (seenPairs.has(pair)) {
      code = "DUPLICATE_IN_FILE";
    } else if (seenAcademic.has(academic_number)) {
      code = "DUPLICATE_ACADEMIC_NUMBER";
    } else if (!emailRaw || !isValidUniversityLoginEmail(email)) {
      code = "INVALID_EMAIL";
    } else if (seenEmail.has(email)) {
      code = "DUPLICATE_EMAIL";
    } else {
      const profile = byAcademic.get(academic_number);
      if (!profile) {
        code = "STUDENT_NOT_FOUND";
      } else {
        const owner = emailOwner.get(email);
        if (owner && owner !== academic_number) {
          // Email claimed by a different student profile — never auto-link.
          code = "CONFLICT";
        } else if (profile.user_linked) {
          // Reconciliation guard (validator blind spot): a linked profile whose
          // recorded email disagrees with the file row is a mismatch signal,
          // not a silent skip.
          const profileEmail = profile.email
            ? normalizeUniversityLoginEmail(profile.email)
            : null;
          code = profileEmail && profileEmail !== email ? "SNAPSHOT_MISMATCH" : "ALREADY_LINKED";
        } else if (authExistingEmails.has(email)) {
          // Orphan/foreign auth account for this email — never auto-link.
          code = "CONFLICT";
        } else if (!is_active) {
          code = "CONFLICT";
        } else {
          code = "READY_TO_CREATE";
        }
      }
    }

    if (academic_number) seenAcademic.add(academic_number);
    if (emailRaw && isValidUniversityLoginEmail(email)) seenEmail.add(email);
    // Pair-dedup only applies to rows with an academic number; empty-academic
    // rows must each stay STUDENT_NOT_FOUND, never DUPLICATE_IN_FILE.
    if (academic_number) seenPairs.add(pair);
    out.push({ rowNumber, academic_number, code });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Summary (counts only — NO PII)                                      *
 * ------------------------------------------------------------------ */
export type StudentAccountsPreflightSummary = Record<
  StudentAccountsPreflightCode,
  number
> & {
  file_rows: number;
};

export function summarizeStudentAccountsPreflightRows(
  rows: StudentAccountsPreflightRowClassification[],
): StudentAccountsPreflightSummary {
  const summary = {
    file_rows: rows.length,
    ALREADY_LINKED: 0,
    READY_TO_CREATE: 0,
    CONFLICT: 0,
    STUDENT_NOT_FOUND: 0,
    INVALID_EMAIL: 0,
    DUPLICATE_IN_FILE: 0,
    DUPLICATE_ACADEMIC_NUMBER: 0,
    DUPLICATE_EMAIL: 0,
    SNAPSHOT_MISMATCH: 0,
    FILE_CHANGED_AFTER_PREVIEW: 0,
    UNAUTHORIZED: 0,
    STALE_SNAPSHOT: 0,
  } as StudentAccountsPreflightSummary;
  for (const r of rows) summary[r.code] += 1;
  return summary;
}

/** Total in-file duplicate rows (all three duplicate codes). */
export function countStudentAccountsDuplicates(
  summary: StudentAccountsPreflightSummary,
): number {
  return (
    summary.DUPLICATE_IN_FILE +
    summary.DUPLICATE_ACADEMIC_NUMBER +
    summary.DUPLICATE_EMAIL
  );
}

/* ------------------------------------------------------------------ *
 * Dependency-injected readers (the ONLY DB/Auth boundary)             *
 * ------------------------------------------------------------------ */
export type StudentAccountsPreflightReaders = {
  /**
   * Read-only: profile link/email state for the given academic numbers and
   * emails (same prefetch pattern as `validateStudentAccounts`).
   */
  fetchProfileRecords(input: {
    academicNumbers: string[];
    emails: string[];
  }): Promise<StudentAccountsPreflightProfileRecord[]>;
  /**
   * Read-only: subset of the given emails that already exist as Supabase Auth
   * accounts (orphan/foreign detection). Must return normalized emails only.
   */
  findAuthExistingEmails(emails: string[]): Promise<string[]>;
};

export type StudentAccountsPreflightClassificationResult = {
  rows: StudentAccountsPreflightRowClassification[];
  summary: StudentAccountsPreflightSummary;
};

/** Async wrapper: collects reader facts, then runs the pure classifier. */
export async function runStudentAccountsPreflightClassification(
  rawRows: Record<string, unknown>[],
  readers: StudentAccountsPreflightReaders,
): Promise<StudentAccountsPreflightClassificationResult> {
  const academicNumbers = new Set<string>();
  const emails = new Set<string>();
  for (const r of rawRows) {
    const raw = normalizeRaw(r ?? {});
    const ac = str(raw.academic_number);
    const em = normalizeUniversityLoginEmail(str(raw.university_email));
    if (ac) academicNumbers.add(ac);
    if (em && isValidUniversityLoginEmail(em)) emails.add(em);
  }

  const profiles = await readers.fetchProfileRecords({
    academicNumbers: [...academicNumbers],
    emails: [...emails],
  });

  // Auth probe is only decision-relevant for unlinked profiles; probing is
  // read-only so over-approximation is safe but we keep it tight.
  const linkedByAcademic = new Map(profiles.map((p) => [p.academic_number, p.user_linked]));
  const probeEmails = new Set<string>();
  for (const r of rawRows) {
    const raw = normalizeRaw(r ?? {});
    const ac = str(raw.academic_number);
    const em = normalizeUniversityLoginEmail(str(raw.university_email));
    if (!ac || !em || !isValidUniversityLoginEmail(em)) continue;
    const linked = linkedByAcademic.get(ac);
    if (linked === false) probeEmails.add(em);
  }

  const authExisting = new Set(
    (await readers.findAuthExistingEmails([...probeEmails])).map((e) =>
      normalizeUniversityLoginEmail(e),
    ),
  );

  const rows = classifyStudentAccountsPreflightRows(rawRows, profiles, authExisting);
  return { rows, summary: summarizeStudentAccountsPreflightRows(rows) };
}

/* ------------------------------------------------------------------ *
 * Gate evaluation (pure decision)                                     *
 * ------------------------------------------------------------------ */
export type StudentAccountsGateContext = {
  snapshot: StudentAccountsProductionSnapshot;
  /** ISO-8601 "now" for expiry evaluation (injectable for tests). */
  now: string;
  /** Expected Supabase project ref for the target environment. */
  expected_project_ref: string;
  /** Hash of the file rows captured at preview/dry-run time. */
  preview_file_hash: string | null;
  /** Hash of the file rows presented at execute time. */
  execute_file_hash: string | null;
  /** A dry-run of this exact file hash was completed. */
  dry_run_completed: boolean;
  actor_role: string;
  /** The running importer code SHA is proven (reviewed artifact). */
  importer_source_sha_proven: boolean;
  /** The deployed production code is proven to match that SHA. */
  deploy_proof_proven: boolean;
};

export type StudentAccountsGateDecision = {
  decision: "GO" | "HOLD";
  hold_reasons: StudentAccountsHoldReason[];
  batch_flags: StudentAccountsPreflightCode[];
  binding_rule: {
    ready_to_create: number;
    snapshot_unlinked_profiles: number;
    satisfied: boolean;
  };
};

/**
 * The gate. decision = HOLD if ANY blocking condition holds; GO only when the
 * list is empty. BINDING RULE: READY_TO_CREATE MUST equal
 * snapshot.unlinked_profiles — enforced here, first, always.
 */
export function evaluateStudentAccountsGate(
  summary: StudentAccountsPreflightSummary,
  ctx: StudentAccountsGateContext,
): StudentAccountsGateDecision {
  const hold_reasons: StudentAccountsHoldReason[] = [];
  const batch_flags = new Set<StudentAccountsPreflightCode>();

  // BINDING RULE (spec §3): ready count MUST equal snapshot unlinked count.
  const bindingSatisfied =
    summary.READY_TO_CREATE === ctx.snapshot.unlinked_profiles;
  if (!bindingSatisfied) hold_reasons.push("BINDING_RULE_VIOLATION");

  if (summary.CONFLICT > 0) hold_reasons.push("CONFLICTS_PRESENT");
  if (countStudentAccountsDuplicates(summary) > 0) {
    hold_reasons.push("DUPLICATES_PRESENT");
  }
  if (summary.STUDENT_NOT_FOUND > 0) hold_reasons.push("STUDENT_NOT_FOUND_PRESENT");
  if (summary.INVALID_EMAIL > 0) hold_reasons.push("INVALID_EMAIL_PRESENT");

  if (
    summary.SNAPSHOT_MISMATCH > 0 ||
    !verifyStudentAccountsSnapshotHash(ctx.snapshot)
  ) {
    hold_reasons.push("SNAPSHOT_MISMATCH_PRESENT");
    batch_flags.add("SNAPSHOT_MISMATCH");
  }
  if (isStudentAccountsSnapshotExpired(ctx.snapshot, ctx.now)) {
    hold_reasons.push("STALE_SNAPSHOT");
    batch_flags.add("STALE_SNAPSHOT");
  }
  if (ctx.snapshot.project_ref !== ctx.expected_project_ref) {
    hold_reasons.push("PROJECT_REF_MISMATCH");
  }
  if (
    !ctx.preview_file_hash ||
    !ctx.execute_file_hash ||
    ctx.preview_file_hash !== ctx.execute_file_hash
  ) {
    hold_reasons.push("FILE_CHANGED_AFTER_PREVIEW");
    batch_flags.add("FILE_CHANGED_AFTER_PREVIEW");
  }
  if (!ctx.dry_run_completed) hold_reasons.push("DRY_RUN_MISSING");
  if (
    !(STUDENT_ACCOUNTS_AUTHORIZED_ROLES as readonly string[]).includes(ctx.actor_role)
  ) {
    hold_reasons.push("UNAUTHORIZED_ROLE");
    batch_flags.add("UNAUTHORIZED");
  }
  if (!ctx.importer_source_sha_proven) hold_reasons.push("IMPORTER_SOURCE_UNPROVEN");
  if (!ctx.deploy_proof_proven) hold_reasons.push("DEPLOY_PROOF_UNPROVEN");

  return {
    decision: hold_reasons.length === 0 ? "GO" : "HOLD",
    hold_reasons,
    batch_flags: [...batch_flags],
    binding_rule: {
      ready_to_create: summary.READY_TO_CREATE,
      snapshot_unlinked_profiles: ctx.snapshot.unlinked_profiles,
      satisfied: bindingSatisfied,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Full offline orchestration (classification + gate)                  *
 * ------------------------------------------------------------------ */
export type StudentAccountsPreflightReport = StudentAccountsPreflightClassificationResult & {
  decision: StudentAccountsGateDecision;
  file_hash: string;
};

export async function runStudentAccountsPreflight(
  rawRows: Record<string, unknown>[],
  readers: StudentAccountsPreflightReaders,
  gate: StudentAccountsGateContext,
): Promise<StudentAccountsPreflightReport> {
  const { rows, summary } = await runStudentAccountsPreflightClassification(
    rawRows,
    readers,
  );
  return {
    rows,
    summary,
    decision: evaluateStudentAccountsGate(summary, gate),
    file_hash: computeStudentAccountsFileHash(rawRows),
  };
}
