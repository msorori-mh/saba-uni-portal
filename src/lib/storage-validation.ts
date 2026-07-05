// STORAGE-HARDENING-01: client-side upload validation with Arabic messages.
// Enforces per-policy MIME + size + filename rules BEFORE hitting Supabase Storage.
// Server-side bucket limits remain the source of truth; this layer provides
// stricter operational policies and clearer UX.

export type UploadPolicyKey =
  | "public_image"        // news, events, departments, faculty (2 MB, image only)
  | "student_attachment"  // student-request-attachments (5 MB, pdf/jpg/png)
  | "payment_receipt"     // payment-receipts (5 MB, pdf/jpg/png)
  | "research_pdf"        // research-pdfs (10 MB, pdf only)
  | "council_topic_attachment"; // council-topic-attachments (10 MB, office + images)

type Policy = {
  maxBytes: number;
  allowedMime: ReadonlyArray<string>;
  allowedExt: ReadonlyArray<string>;
  label: string;
};

const POLICIES: Record<UploadPolicyKey, Policy> = {
  public_image: {
    maxBytes: 2 * 1024 * 1024,
    allowedMime: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    allowedExt: ["jpg", "jpeg", "png", "webp", "gif"],
    label: "صورة عامة",
  },
  student_attachment: {
    maxBytes: 5 * 1024 * 1024,
    allowedMime: ["application/pdf", "image/jpeg", "image/png"],
    allowedExt: ["pdf", "jpg", "jpeg", "png"],
    label: "مرفق طلب",
  },
  payment_receipt: {
    maxBytes: 5 * 1024 * 1024,
    allowedMime: ["application/pdf", "image/jpeg", "image/png"],
    allowedExt: ["pdf", "jpg", "jpeg", "png"],
    label: "سند دفع",
  },
  research_pdf: {
    maxBytes: 10 * 1024 * 1024,
    allowedMime: ["application/pdf"],
    allowedExt: ["pdf"],
    label: "ملف بحث (PDF)",
  },
  council_topic_attachment: {
    maxBytes: 10 * 1024 * 1024,
    allowedMime: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    allowedExt: ["jpg", "jpeg", "png", "webp", "pdf", "doc", "docx", "xls", "xlsx"],
    label: "مرفق موضوع المجلس",
  },
};

// Filenames / extensions that must never be uploaded regardless of policy.
const BLOCKED_EXT = new Set([
  "exe", "js", "mjs", "cjs", "ts", "html", "htm", "php", "phtml",
  "sh", "bash", "zsh", "bat", "cmd", "ps1", "jar", "war",
  "svg", // XSS risk via inline scripts
  "vbs", "wsf", "msi", "dll", "so",
]);

export function getExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function safeFileName(name: string): string {
  // Strip directories + dangerous chars; collapse to UUID-friendly slug.
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return cleaned.length > 80 ? cleaned.slice(-80) : cleaned;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`;
  return `${(n / 1024 / 1024).toFixed(1)} م.ب`;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; message: string };

// PILOT-MEDIUM-FIX-01 (F-06): Arabic upload error messages made explicit —
// each rejection tells the user the exact reason, the allowed formats, and
// the maximum size for the given policy, so the message alone is enough to
// self-correct without contacting support.
export function policyHint(policyKey: UploadPolicyKey): string {
  const p = POLICIES[policyKey];
  return `الصيغ المقبولة: ${p.allowedExt.join(", ").toUpperCase()} — الحد الأقصى للحجم: ${formatBytes(p.maxBytes)}.`;
}

export function validateUpload(file: File, policyKey: UploadPolicyKey): ValidationResult {
  const policy = POLICIES[policyKey];
  const hint = policyHint(policyKey);

  if (!file) return { ok: false, message: `تعذر رفع الملف: لم يتم اختيار ملف. ${hint}` };

  const ext = getExt(file.name);
  if (!ext) {
    return { ok: false, message: `تعذر رفع الملف: اسم الملف لا يحتوي على امتداد واضح. ${hint}` };
  }

  if (BLOCKED_EXT.has(ext)) {
    return {
      ok: false,
      message: `تعذر رفع الملف: نوع الملف (.${ext}) محظور لأسباب أمنية. ${hint}`,
    };
  }

  if (!policy.allowedExt.includes(ext)) {
    return {
      ok: false,
      message: `تعذر رفع الملف: صيغة (.${ext}) غير مقبولة لـ${policy.label}. ${hint}`,
    };
  }

  // MIME check (browser-reported; combined with extension allowlist above).
  if (file.type && !policy.allowedMime.includes(file.type)) {
    return {
      ok: false,
      message: `تعذر رفع الملف: نوع المحتوى (${file.type}) لا يطابق صيغة ${policy.label}. ${hint}`,
    };
  }

  if (file.size === 0) {
    return { ok: false, message: `تعذر رفع الملف: الملف فارغ (0 بايت). يرجى اختيار ملف صالح. ${hint}` };
  }

  if (file.size > policy.maxBytes) {
    return {
      ok: false,
      message: `تعذر رفع الملف: الحجم ${formatBytes(file.size)} أكبر من الحد المسموح (${formatBytes(policy.maxBytes)}) لـ${policy.label}. يرجى ضغط الملف أو تقليل جودته ثم إعادة المحاولة.`,
    };
  }

  return { ok: true };
}

export function getPolicy(policyKey: UploadPolicyKey): Readonly<Policy> {
  return POLICIES[policyKey];
}

export type UploadMetadata = {
  fileName: string;
  fileSize: number;
  mimeType: string;
};

/** Server-side metadata validation (no File/Blob required). */
export function validateUploadMetadata(
  meta: UploadMetadata,
  policyKey: UploadPolicyKey,
): ValidationResult {
  const policy = POLICIES[policyKey];
  const hint = policyHint(policyKey);
  const fileName = meta.fileName?.trim() ?? "";

  if (!fileName) {
    return { ok: false, message: `تعذر رفع الملف: اسم الملف مطلوب. ${hint}` };
  }

  const ext = getExt(fileName);
  if (!ext) {
    return { ok: false, message: `تعذر رفع الملف: اسم الملف لا يحتوي على امتداد واضح. ${hint}` };
  }

  if (BLOCKED_EXT.has(ext)) {
    return {
      ok: false,
      message: `تعذر رفع الملف: نوع الملف (.${ext}) محظور لأسباب أمنية. ${hint}`,
    };
  }

  if (!policy.allowedExt.includes(ext)) {
    return {
      ok: false,
      message: `تعذر رفع الملف: صيغة (.${ext}) غير مقبولة لـ${policy.label}. ${hint}`,
    };
  }

  const mime = meta.mimeType?.trim() ?? "";
  if (!mime) {
    return { ok: false, message: `تعذر رفع الملف: نوع المحتوى (MIME) مطلوب. ${hint}` };
  }

  if (!policy.allowedMime.includes(mime)) {
    return {
      ok: false,
      message: `تعذر رفع الملف: نوع المحتوى (${mime}) لا يطابق صيغة ${policy.label}. ${hint}`,
    };
  }

  if (!Number.isFinite(meta.fileSize) || meta.fileSize <= 0) {
    return { ok: false, message: `تعذر رفع الملف: حجم الملف غير صالح. ${hint}` };
  }

  if (meta.fileSize > policy.maxBytes) {
    return {
      ok: false,
      message: `تعذر رفع الملف: الحجم ${formatBytes(meta.fileSize)} أكبر من الحد المسموح (${formatBytes(policy.maxBytes)}) لـ${policy.label}. يرجى ضغط الملف أو تقليل جودته ثم إعادة المحاولة.`,
    };
  }

  return { ok: true };
}
