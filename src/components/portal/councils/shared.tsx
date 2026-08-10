/**
 * Shared labels, Arabic error mapping, and compact presentation primitives
 * for the faculty academic councils operational dashboard.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import type { CouncilLinkMemberRole } from "@/lib/admin-councils.functions";

export const MEMBER_ROLE_LABELS: Record<string, string> = {
  chair: "رئيس المجلس",
  secretary: "أمين السر",
  member: "عضو",
  viewer: "مطّلع",
  vice_chair: "نائب الرئيس",
};

export const COUNCIL_TYPE_LABELS: Record<string, string> = {
  college: "مجلس الكلية",
  department: "مجلس قسم",
};

export const MEETING_STATUS_LABELS: Record<string, string> = {
  scheduled: "مجدول",
  intake_open: "استقبال الموضوعات مفتوح",
  intake_closed: "استقبال الموضوعات مغلق",
  agenda_ready: "جدول الأعمال جاهز",
  in_session: "جلسة قيد الانعقاد",
  minutes_draft: "مسودة محضر",
  minutes_locked: "محضر مقفل",
  archived: "مؤرشف",
  cancelled: "ملغى",
};

export const TOPIC_STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  submitted: "مقدّم",
  under_review: "قيد المراجعة",
  needs_completion: "مطلوب استكمال",
  accepted_for_agenda: "مقبول للجدول",
  rejected: "مرفوض",
  added_to_agenda: "مُضاف إلى جدول الأعمال",
  deferred: "مؤجّل",
  decided: "مُبت فيه",
  closed: "مغلق",
  archived: "مؤرشف",
};

export const MEETING_SCHEDULE_DENIED_UI = "لا تملك صلاحية جدولة اجتماع لهذا المجلس.";
export const MEETING_UPDATE_DENIED_UI = "لا تملك صلاحية تعديل هذا الاجتماع.";
export const MEETINGS_LOAD_FAILED_UI = "تعذر تحميل الاجتماعات.";
export const MEETING_SAVE_FAILED_UI = "تعذر حفظ الاجتماع.";
export const AGENDA_LOAD_FAILED_UI = "تعذر تحميل جدول الأعمال.";
export const AGENDA_TOPICS_LOAD_FAILED_UI = "تعذر تحميل الموضوعات المتاحة.";
export const AGENDA_WRITE_DENIED_UI = "لا تملك صلاحية إدارة جدول أعمال هذا المجلس.";
export const AGENDA_TOPIC_ALREADY_ADDED_UI = "هذا الموضوع مضاف مسبقاً إلى جدول الأعمال.";
export const AGENDA_REORDER_FAILED_UI = "تعذر حفظ ترتيب جدول الأعمال.";
export const AGENDA_FINALIZE_DENIED_UI = "لا تملك صلاحية اعتماد جدول الأعمال.";
export const AGENDA_SAVE_FAILED_UI = "تعذر حفظ جدول الأعمال.";
export const SESSION_EXPIRED_UI = "انتهت جلسة تسجيل الدخول، يرجى تسجيل الدخول مرة أخرى.";

export const MEETING_STATUS_OPTIONS = [
  "scheduled",
  "intake_open",
  "intake_closed",
  "agenda_ready",
  "in_session",
  "minutes_draft",
  "minutes_locked",
  "archived",
  "cancelled",
] as const;

export const PERMISSION_DENIED_MESSAGE = "لا تملك صلاحية تقديم موضوع لهذا المجلس.";
export const SESSION_EXPIRED_MESSAGE =
  "انتهت جلسة تسجيل الدخول، يرجى تسجيل الخروج ثم تسجيل الدخول مرة أخرى.";
export const SUBMIT_GENERIC_ERROR_MESSAGE = "تعذّر إرسال الموضوع. يرجى المحاولة مرة أخرى.";
export const MAX_TOPIC_ATTACHMENTS = 5;
export const PARTIAL_UPLOAD_MESSAGE =
  "تم إنشاء الموضوع، لكن تعذر رفع بعض المرفقات. يرجى المحاولة لاحقاً أو التواصل مع الإدارة.";
export const ATTACHMENT_UPLOAD_DENIED_MESSAGE = "لا تملك صلاحية رفع مرفقات لهذا الموضوع.";
export const ATTACHMENT_OPEN_ERROR_MESSAGE = "تعذر فتح المرفق حالياً.";

export const TOPIC_REVIEW_DENIED_UI = "لا تملك صلاحية مراجعة هذا الموضوع.";
export const TOPIC_REVIEW_FINAL_DENIED_UI =
  "قرار القبول النهائي أو الرفض يعود لرئيس المجلس فقط.";
export const TOPIC_REVIEW_STATUS_SKIP_UI =
  "انتقال الحالة غير مسموح به في دورة حياة الموضوع.";
export const TOPIC_REVIEW_FAILED_UI = "تعذّر حفظ حالة المراجعة.";
export const TOPIC_EDIT_DENIED_UI = "لا يمكن تعديل هذا الموضوع.";
export const TOPIC_EDIT_FAILED_UI = "تعذّر تعديل الموضوع.";

export const ATTACHMENT_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const PRINTABLE_ASCII_RE = /^[ -~]+$/;

export function isRawTechnicalMessage(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.length > 0 && PRINTABLE_ASCII_RE.test(trimmed);
}

export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "";
}

export function isSessionExpiredError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("jwt has expired") ||
    lower.includes("jwt expired") ||
    lower.includes("invalid jwt") ||
    lower.includes("refresh token") ||
    lower.includes("session expired") ||
    lower.includes("session has expired") ||
    lower.includes("authapierror") ||
    lower.includes("token expired") ||
    lower.includes("not authenticated") ||
    lower.includes("invalid claim") ||
    (lower.includes("jwt") && lower.includes("expir"))
  );
}

export function mapSubmitError(message: string): string {
  if (isSessionExpiredError(message)) return SESSION_EXPIRED_MESSAGE;
  const lower = message.toLowerCase();
  if (
    lower.includes("مطّلع") ||
    lower.includes("viewer") ||
    lower.includes("صلاحية") ||
    lower.includes("policy") ||
    lower.includes("permission") ||
    lower.includes("row-level security")
  ) {
    return PERMISSION_DENIED_MESSAGE;
  }
  if (lower.includes("jwt") || lower.includes("authapi") || lower.includes("refresh token")) {
    return SESSION_EXPIRED_MESSAGE;
  }
  if (isRawTechnicalMessage(message)) {
    return SUBMIT_GENERIC_ERROR_MESSAGE;
  }
  if (message.trim().length > 0) return message;
  return SUBMIT_GENERIC_ERROR_MESSAGE;
}

export function mapReviewError(message: string): string {
  if (isSessionExpiredError(message)) return SESSION_EXPIRED_MESSAGE;
  const lower = message.toLowerCase();
  if (
    lower.includes("لا تملك صلاحية") ||
    lower.includes("مراجعة") ||
    lower.includes("permission") ||
    lower.includes("policy") ||
    lower.includes("row-level security")
  ) {
    return TOPIC_REVIEW_DENIED_UI;
  }
  if (lower.includes("رئيس المجلس فقط") || lower.includes("final approval")) {
    return TOPIC_REVIEW_FINAL_DENIED_UI;
  }
  if (lower.includes("دورة حياة") || lower.includes("lifecycle") || lower.includes("skip")) {
    return TOPIC_REVIEW_STATUS_SKIP_UI;
  }
  if (isRawTechnicalMessage(message)) {
    return TOPIC_REVIEW_FAILED_UI;
  }
  if (message.trim().length > 0) return message;
  return TOPIC_REVIEW_FAILED_UI;
}

export function mapEditError(message: string): string {
  if (isSessionExpiredError(message)) return SESSION_EXPIRED_MESSAGE;
  const lower = message.toLowerCase();
  if (
    lower.includes("لا يمكن تعديل") ||
    lower.includes("صلاحية") ||
    lower.includes("permission") ||
    lower.includes("policy") ||
    lower.includes("row-level security")
  ) {
    return TOPIC_EDIT_DENIED_UI;
  }
  if (lower.includes("jwt") || lower.includes("authapi") || lower.includes("refresh token")) {
    return SESSION_EXPIRED_MESSAGE;
  }
  if (isRawTechnicalMessage(message)) {
    return TOPIC_EDIT_FAILED_UI;
  }
  if (message.trim().length > 0) return message;
  return TOPIC_EDIT_FAILED_UI;
}

export function mapAttachmentError(message: string): string {
  if (isSessionExpiredError(message)) return SESSION_EXPIRED_MESSAGE;
  const lower = message.toLowerCase();
  if (
    lower.includes("لا تملك صلاحية رفع مرفقات") ||
    lower.includes("مطّلع") ||
    lower.includes("viewer")
  ) {
    return ATTACHMENT_UPLOAD_DENIED_MESSAGE;
  }
  if (
    lower.includes("لا تملك صلاحية فتح") ||
    lower.includes("permission") ||
    lower.includes("policy")
  ) {
    return ATTACHMENT_OPEN_ERROR_MESSAGE;
  }
  if (lower.includes("5 ملفات") || lower.includes("maximum 5")) {
    return "لا يمكن رفع أكثر من 5 مرفقات للموضوع.";
  }
  if (lower.includes("jwt") || lower.includes("authapi") || lower.includes("refresh token")) {
    return SESSION_EXPIRED_MESSAGE;
  }
  if (message.includes("تعذر رفع الملف") || message.includes("لا يمكن إرفاق")) {
    return message;
  }
  if (isRawTechnicalMessage(message)) {
    return ATTACHMENT_OPEN_ERROR_MESSAGE;
  }
  if (message.trim().length > 0) return message;
  return ATTACHMENT_OPEN_ERROR_MESSAGE;
}

export function mimeLabel(mime: string, ext: string): string {
  if (mime) return mime;
  return ext ? `.${ext.toUpperCase()}` : "—";
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar", { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ar", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toIsoFromDatetimeLocal(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function mapMeetingUiError(message: string, mode: "schedule" | "update" | "load"): string {
  if (isSessionExpiredError(message)) return SESSION_EXPIRED_MESSAGE;
  if (message.includes(MEETING_SCHEDULE_DENIED_UI)) return MEETING_SCHEDULE_DENIED_UI;
  if (message.includes(MEETING_UPDATE_DENIED_UI)) return MEETING_UPDATE_DENIED_UI;
  if (message.includes(MEETINGS_LOAD_FAILED_UI)) return MEETINGS_LOAD_FAILED_UI;
  if (message.includes(MEETING_SAVE_FAILED_UI)) return MEETING_SAVE_FAILED_UI;
  const lower = message.toLowerCase();
  if (
    lower.includes("policy") ||
    lower.includes("permission") ||
    lower.includes("row-level security") ||
    lower.includes("صلاحية")
  ) {
    if (mode === "schedule") return MEETING_SCHEDULE_DENIED_UI;
    if (mode === "update") return MEETING_UPDATE_DENIED_UI;
  }
  if (mode === "load") return MEETINGS_LOAD_FAILED_UI;
  if (isRawTechnicalMessage(message)) {
    return MEETING_SAVE_FAILED_UI;
  }
  if (message.trim().length > 0) return message;
  return MEETING_SAVE_FAILED_UI;
}

export function mapAgendaUiError(
  message: string,
  mode: "load" | "topics_load" | "write" | "reorder" | "finalize",
): string {
  if (isSessionExpiredError(message)) return SESSION_EXPIRED_UI;
  if (message.includes(AGENDA_LOAD_FAILED_UI)) return AGENDA_LOAD_FAILED_UI;
  if (message.includes(AGENDA_TOPICS_LOAD_FAILED_UI)) return AGENDA_TOPICS_LOAD_FAILED_UI;
  if (message.includes(AGENDA_WRITE_DENIED_UI)) return AGENDA_WRITE_DENIED_UI;
  if (message.includes(AGENDA_TOPIC_ALREADY_ADDED_UI)) return AGENDA_TOPIC_ALREADY_ADDED_UI;
  if (message.includes(AGENDA_REORDER_FAILED_UI)) return AGENDA_REORDER_FAILED_UI;
  if (message.includes(AGENDA_FINALIZE_DENIED_UI)) return AGENDA_FINALIZE_DENIED_UI;
  const lower = message.toLowerCase();
  if (
    lower.includes("policy") ||
    lower.includes("permission") ||
    lower.includes("row-level security") ||
    lower.includes("صلاحية")
  ) {
    if (mode === "finalize") return AGENDA_FINALIZE_DENIED_UI;
    if (mode === "load") return AGENDA_LOAD_FAILED_UI;
    if (mode === "topics_load") return AGENDA_TOPICS_LOAD_FAILED_UI;
    if (mode === "reorder") return AGENDA_REORDER_FAILED_UI;
    return AGENDA_WRITE_DENIED_UI;
  }
  if (mode === "load") return AGENDA_LOAD_FAILED_UI;
  if (mode === "topics_load") return AGENDA_TOPICS_LOAD_FAILED_UI;
  if (mode === "reorder") return AGENDA_REORDER_FAILED_UI;
  if (mode === "finalize") return AGENDA_FINALIZE_DENIED_UI;
  if (isRawTechnicalMessage(message)) {
    return AGENDA_SAVE_FAILED_UI;
  }
  if (message.trim().length > 0) return message;
  return AGENDA_SAVE_FAILED_UI;
}

export function roleLabel(role: string): string {
  return MEMBER_ROLE_LABELS[role as CouncilLinkMemberRole] ?? MEMBER_ROLE_LABELS[role] ?? role;
}

export function councilTypeLabel(type: string): string {
  return COUNCIL_TYPE_LABELS[type] ?? type;
}

export function meetingStatusLabel(status: string): string {
  return MEETING_STATUS_LABELS[status] ?? status;
}

export function topicStatusLabel(status: string): string {
  return TOPIC_STATUS_LABELS[status] ?? status;
}

export function SectionShell({
  icon: Icon,
  title,
  children,
  testId,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  testId?: string;
  actions?: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-xl border border-border bg-card shadow-card overflow-hidden"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-primary shrink-0" aria-hidden />
          <h2 className="font-display font-bold text-primary text-sm truncate">{title}</h2>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function LoadingBlock() {
  return (
    <div className="grid place-items-center py-6" role="status" aria-label="جاري التحميل">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive text-center"
    >
      {message}
    </div>
  );
}

/** Compact empty state — avoids tall bordered panels. */
export function CompactEmpty({ text, testId }: { text: string; testId?: string }) {
  return (
    <p data-testid={testId} className="text-xs text-muted-foreground py-1.5" role="status">
      {text}
    </p>
  );
}
