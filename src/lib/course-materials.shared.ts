export const MATERIALS_ALLOWED_MIME = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export const MATERIALS_ALLOWED_EXT = ["pdf", "doc", "docx", "ppt", "pptx"] as const;
export const MATERIALS_MAX_BYTES_DEFAULT = 25 * 1024 * 1024;
export const MATERIALS_BUCKET = "course-materials";

export type StudySystemTag = "regular" | "parallel" | "both";
export type MaterialStatus = "draft" | "published" | "archived";
export type LinkageMode = "cohort_fallback" | "enrollment_only";

export function sanitizeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 80) || "file";
  const ext = (dot > 0 ? name.slice(dot + 1) : "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return ext ? `${base}.${ext}` : base;
}

export const STUDY_SYSTEM_LABELS: Record<StudySystemTag, string> = {
  regular: "نظامي",
  parallel: "انتساب",
  both: "كلا النظامين",
};

export const STATUS_LABELS: Record<MaterialStatus, string> = {
  draft: "مسودة",
  published: "منشورة",
  archived: "مؤرشفة",
};

// ---------------------------------------------------------------------------
// Secure activation additions (LEARNING-MATERIALS-SECURE-ACTIVATION-01)
// Everything below is additive; the constants above are unchanged.
// ---------------------------------------------------------------------------

/**
 * Malware-scan lifecycle for uploaded files.
 * Fail-closed rule: a file is never downloadable before scan_state = 'clean'.
 */
export const MATERIAL_SCAN_STATES = ["pending", "clean", "infected", "failed"] as const;
export type MaterialScanState = (typeof MATERIAL_SCAN_STATES)[number];

export const SCAN_STATE_LABELS: Record<MaterialScanState, string> = {
  pending: "قيد الفحص",
  clean: "آمن",
  infected: "مصاب",
  failed: "فشل الفحص",
};

export function isMaterialScanState(value: unknown): value is MaterialScanState {
  return typeof value === "string" && (MATERIAL_SCAN_STATES as readonly string[]).includes(value);
}

/** Fail-closed download gate: only a clean scan permits access to the file. */
export function isMaterialFileDownloadable(scanState: unknown): boolean {
  return scanState === "clean";
}

/** Week linkage (optional, complements the existing lecture_number linkage). */
export const MATERIAL_WEEK_MIN = 1;
export const MATERIAL_WEEK_MAX = 20;

export function isValidMaterialWeekNumber(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= MATERIAL_WEEK_MIN
    && value <= MATERIAL_WEEK_MAX;
}

export const WEEK_LABEL = "الأسبوع";
export const LECTURE_LABEL = "المحاضرة";

/** Human label such as "الأسبوع 3 • المحاضرة 2" (empty string when neither set). */
export function formatWeekLectureLabel(weekNumber: unknown, lectureNumber: unknown): string {
  const parts: string[] = [];
  if (isValidMaterialWeekNumber(weekNumber)) parts.push(`${WEEK_LABEL} ${weekNumber}`);
  if (
    typeof lectureNumber === "number"
    && Number.isInteger(lectureNumber)
    && lectureNumber > 0
  ) {
    parts.push(`${LECTURE_LABEL} ${lectureNumber}`);
  }
  return parts.join(" • ");
}

// --- Configurable upload policy (D-16 pending: narrow-only configuration) ---

export const MATERIALS_SETTINGS_KEYS = {
  maxMb: "materials_max_mb",
  allowedMimeTypes: "materials_allowed_mime_types",
  allowedExtensions: "materials_allowed_extensions",
} as const;

export type MaterialsUploadPolicy = {
  maxMb: number;
  maxBytes: number;
  allowedMimeTypes: readonly string[];
  allowedExtensions: readonly string[];
  narrowedFromDefaults: boolean;
};

export const MATERIALS_UPLOAD_POLICY_DEFAULTS: MaterialsUploadPolicy = {
  maxMb: MATERIALS_MAX_BYTES_DEFAULT / (1024 * 1024),
  maxBytes: MATERIALS_MAX_BYTES_DEFAULT,
  allowedMimeTypes: MATERIALS_ALLOWED_MIME,
  allowedExtensions: MATERIALS_ALLOWED_EXT,
  narrowedFromDefaults: false,
};

export type MaterialsPolicySettings = {
  maxMb?: unknown;
  allowedMimeTypes?: unknown;
  allowedExtensions?: unknown;
} | null | undefined;

function parseTextList(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const items = value
      .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
      .filter((entry) => entry.length > 0);
    return items.length > 0 ? items : null;
  }
  if (typeof value === "string") {
    const items = value
      .split(/[,\n]/)
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0);
    return items.length > 0 ? items : null;
  }
  return null;
}

/**
 * Resolve the effective upload policy from portal settings.
 *
 * D-16 (final approved file types / size limits) is still pending, so settings
 * may only NARROW the conservative compiled-in defaults, never widen them:
 * - maxMb is clamped to [1, default 25MB]; invalid/missing values fall back to the default.
 * - MIME/extension allow-lists are intersected with the defaults; configured values
 *   outside the defaults are ignored; empty/invalid lists fall back to the defaults.
 */
function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  return setA.size === setB.size && [...setA].every((x) => setB.has(x));
}

export function resolveMaterialsUploadPolicy(
  settings?: MaterialsPolicySettings,
): MaterialsUploadPolicy {
  const defaults = MATERIALS_UPLOAD_POLICY_DEFAULTS;
  if (!settings) return defaults;

  let maxMb = defaults.maxMb;
  const configuredMax = typeof settings.maxMb === "string" ? Number(settings.maxMb) : settings.maxMb;
  if (typeof configuredMax === "number" && Number.isFinite(configuredMax) && configuredMax > 0) {
    maxMb = Math.min(Math.max(configuredMax, 1), defaults.maxMb);
  }

  let allowedMimeTypes: readonly string[] = defaults.allowedMimeTypes;
  const configuredMime = parseTextList(settings.allowedMimeTypes);
  if (configuredMime) {
    const intersection = configuredMime.filter((mime) =>
      (defaults.allowedMimeTypes as readonly string[]).includes(mime),
    );
    if (intersection.length > 0) allowedMimeTypes = intersection;
  }

  let allowedExtensions: readonly string[] = defaults.allowedExtensions;
  const configuredExt = parseTextList(settings.allowedExtensions);
  if (configuredExt) {
    const normalized = configuredExt.map((ext) => ext.replace(/^\./, ""));
    const intersection = normalized.filter((ext) =>
      (defaults.allowedExtensions as readonly string[]).includes(ext),
    );
    if (intersection.length > 0) allowedExtensions = intersection;
  }

  const narrowedFromDefaults = maxMb !== defaults.maxMb
    || !sameStringSet(allowedMimeTypes, defaults.allowedMimeTypes)
    || !sameStringSet(allowedExtensions, defaults.allowedExtensions);

  return {
    maxMb,
    maxBytes: Math.floor(maxMb * 1024 * 1024),
    allowedMimeTypes,
    allowedExtensions,
    narrowedFromDefaults,
  };
}

// --- Access logs & usage reporting (faculty-facing) ---

export type MaterialAccessEvent =
  | "created"
  | "file_uploaded"
  | "published"
  | "updated"
  | "archived"
  | "downloaded"
  | "file_scanned";

export const MATERIAL_ACCESS_EVENT_LABELS: Record<MaterialAccessEvent, string> = {
  created: "إنشاء",
  file_uploaded: "رفع ملف",
  published: "نشر",
  updated: "تعديل",
  archived: "أرشفة",
  downloaded: "تنزيل",
  file_scanned: "فحص ملف",
};

export type MaterialAccessLogEntry = {
  event: string;
  actorUserId: string | null;
  createdAt: string;
  fileId: string | null;
};

export type MaterialUsageSummary = {
  materialId: string;
  title: string;
  status: MaterialStatus;
  weekNumber: number | null;
  lectureNumber: number | null;
  downloads: number;
  uniqueDownloaders: number;
  lastDownloadAt: string | null;
  filesTotal: number;
  filesClean: number;
  filesPending: number;
  filesInfected: number;
  filesFailed: number;
};

export type MaterialsUsageReport = {
  sectionId: string;
  materials: MaterialUsageSummary[];
  totalDownloads: number;
  generatedAt: string;
};

export type MaterialUsageEventRow = {
  course_material_id: string;
  event: string;
  actor_user_id: string | null;
  created_at: string;
};

export type MaterialUsageMaterialRow = {
  id: string;
  title: string;
  status: MaterialStatus;
  week_number: number | null;
  lecture_number: number | null;
  files?: { scan_state?: unknown }[] | null;
};

export function buildMaterialUsageSummary(
  material: MaterialUsageMaterialRow,
  events: MaterialUsageEventRow[],
): MaterialUsageSummary {
  const downloadEvents = events.filter(
    (event) => event.event === "downloaded" && event.course_material_id === material.id,
  );
  const downloaders = new Set(
    downloadEvents
      .map((event) => event.actor_user_id)
      .filter((actor): actor is string => typeof actor === "string" && actor.length > 0),
  );
  const lastDownloadAt = downloadEvents.reduce<string | null>(
    (latest, event) => (latest === null || event.created_at > latest ? event.created_at : latest),
    null,
  );
  const files = material.files ?? [];
  const countByScanState = (scanState: MaterialScanState) =>
    files.filter((file) => file.scan_state === scanState).length;

  return {
    materialId: material.id,
    title: material.title,
    status: material.status,
    weekNumber: isValidMaterialWeekNumber(material.week_number) ? material.week_number : null,
    lectureNumber: typeof material.lecture_number === "number" ? material.lecture_number : null,
    downloads: downloadEvents.length,
    uniqueDownloaders: downloaders.size,
    lastDownloadAt,
    filesTotal: files.length,
    filesClean: countByScanState("clean"),
    filesPending: countByScanState("pending"),
    filesInfected: countByScanState("infected"),
    filesFailed: countByScanState("failed"),
  };
}

export function buildMaterialsUsageReport(
  sectionId: string,
  materials: MaterialUsageMaterialRow[],
  events: MaterialUsageEventRow[],
  generatedAt: string,
): MaterialsUsageReport {
  const summaries = materials.map((material) => buildMaterialUsageSummary(material, events));
  return {
    sectionId,
    materials: summaries,
    totalDownloads: summaries.reduce((total, summary) => total + summary.downloads, 0),
    generatedAt,
  };
}

// ---------------------------------------------------------------------------
// Deterministic content-signature gate (PORTAL-COURSE-MATERIALS-PRODUCTION-SAFE-01)
// The portal has no external AV service. Instead of leaving every uploaded file
// permanently 'pending' (which makes downloads impossible), uploads are gated by
// a fail-closed magic-byte check: the declared MIME type must match the actual
// container signature. Anything unrecognised stays blocked.
// ---------------------------------------------------------------------------

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK.. (docx/pptx)
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // doc/ppt

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((b, i) => bytes[i] === b);
}

/**
 * Returns the scan state an uploaded file should be stored with.
 * 'clean' only when the byte signature matches the declared MIME type.
 */
export function resolveUploadScanState(bytes: Uint8Array, mimeType: string): MaterialScanState {
  switch (mimeType) {
    case "application/pdf":
      return startsWith(bytes, PDF_MAGIC) ? "clean" : "failed";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return startsWith(bytes, ZIP_MAGIC) ? "clean" : "failed";
    case "application/msword":
    case "application/vnd.ms-powerpoint":
      return startsWith(bytes, OLE2_MAGIC) ? "clean" : "failed";
    default:
      return "failed";
  }
}
