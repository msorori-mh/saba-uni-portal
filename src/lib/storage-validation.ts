// STORAGE-HARDENING-01: client-side upload validation with Arabic messages.
// Enforces per-policy MIME + size + filename rules BEFORE hitting Supabase Storage.
// Server-side bucket limits remain the source of truth; this layer provides
// stricter operational policies and clearer UX.

export type UploadPolicyKey =
  | "public_image"        // news, events, departments, faculty (2 MB, image only)
  | "student_attachment"  // student-request-attachments (5 MB, pdf/jpg/png)
  | "payment_receipt"     // payment-receipts (5 MB, pdf/jpg/png)
  | "research_pdf";       // research-pdfs (10 MB, pdf only)

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

export function validateUpload(file: File, policyKey: UploadPolicyKey): ValidationResult {
  const policy = POLICIES[policyKey];
  if (!file) return { ok: false, message: "لم يتم اختيار ملف." };

  const ext = getExt(file.name);
  if (!ext) return { ok: false, message: "اسم الملف لا يحتوي على امتداد." };

  if (BLOCKED_EXT.has(ext)) {
    return { ok: false, message: `نوع الملف غير مسموح به (${ext}).` };
  }

  if (!policy.allowedExt.includes(ext)) {
    return {
      ok: false,
      message: `صيغة الملف غير مسموحة. الصيغ المقبولة لـ${policy.label}: ${policy.allowedExt.join(", ")}.`,
    };
  }

  // MIME check (browser-reported; combined with extension allowlist above).
  if (file.type && !policy.allowedMime.includes(file.type)) {
    return {
      ok: false,
      message: `نوع المحتوى (${file.type}) لا يطابق الصيغ المقبولة لـ${policy.label}.`,
    };
  }

  if (file.size > policy.maxBytes) {
    return {
      ok: false,
      message: `حجم الملف ${formatBytes(file.size)} يتجاوز الحد المسموح (${formatBytes(policy.maxBytes)}) لـ${policy.label}.`,
    };
  }

  if (file.size === 0) {
    return { ok: false, message: "الملف فارغ." };
  }

  return { ok: true };
}

export function getPolicy(policyKey: UploadPolicyKey): Readonly<Policy> {
  return POLICIES[policyKey];
}
