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
