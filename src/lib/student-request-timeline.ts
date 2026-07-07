import { resolveEffectLabelForRequestType } from "@/lib/student-requests/request-type-registry";

export type TimelineEventKind =
  | "created"
  | "submitted"
  | "under_review"
  | "returned"
  | "resubmitted"
  | "approved"
  | "rejected"
  | "cancelled"
  | "effect_applied"
  | "status_changed";

export type StudentRequestTimelineEvent = {
  id: string;
  at: string;
  kind: TimelineEventKind;
  title: string;
  description?: string | null;
  actorLabel?: string | null;
  actorRole?: string | null;
};

export type AuditLogTimelineRow = {
  id: string;
  created_at: string;
  action_type: string;
  actor_user_id: string | null;
  actor_role: string | null;
  old_values: { status?: string } | null;
  new_values: { status?: string; rejection_reason?: string | null } | null;
  notes: string | null;
};

export type RequestEffectMarkers = {
  recordAppliedAt?: string | null;
  chanceAppliedAt?: string | null;
  creditsAppliedAt?: string | null;
  gradeAppealApprovedScore?: number | null;
  gradeAppealReviewedAt?: string | null;
  documentIssuedAt?: string | null;
};

const KIND_TITLES: Record<TimelineEventKind, string> = {
  created: "إنشاء الطلب (مسودة)",
  submitted: "إرسال الطلب",
  under_review: "بدء المراجعة",
  returned: "إرجاع للاستكمال",
  resubmitted: "إعادة إرسال الطلب",
  approved: "اعتماد الطلب",
  rejected: "رفض الطلب",
  cancelled: "إلغاء الطلب",
  effect_applied: "تطبيق الأثر الأكاديمي",
  status_changed: "تغيير حالة الطلب",
};

export function timelineTitleForKind(kind: TimelineEventKind): string {
  return KIND_TITLES[kind];
}

const ACTOR_ROLE_LABELS: Record<string, string> = {
  student: "الطالب",
  system_admin: "مدير النظام",
  admin: "المدير",
  dean: "العميد",
  registrar: "المسجل",
  student_affairs: "شؤون الطلاب",
  finance_officer: "الشؤون المالية",
  hr_officer: "الموارد البشرية",
  department_head: "رئيس القسم",
  faculty: "عضو هيئة التدريس",
};

export function formatTimelineActorLabel(
  role: string | null | undefined,
  kind?: TimelineEventKind,
): string | null {
  if (!role) {
    if (kind === "created" || kind === "submitted" || kind === "resubmitted" || kind === "cancelled") {
      return "الطالب";
    }
    return null;
  }
  return ACTOR_ROLE_LABELS[role] ?? role;
}

function auditActionToKind(row: AuditLogTimelineRow): TimelineEventKind {
  const oldStatus = row.old_values?.status;
  if (row.action_type === "request_submitted" && oldStatus === "returned") {
    return "resubmitted";
  }
  switch (row.action_type) {
    case "request_created":
      return "created";
    case "request_submitted":
      return "submitted";
    case "request_review_started":
      return "under_review";
    case "request_returned":
      return "returned";
    case "request_approved":
      return "approved";
    case "request_rejected":
      return "rejected";
    case "request_cancelled":
      return "cancelled";
    default:
      return "status_changed";
  }
}

export function auditLogToTimelineEvent(row: AuditLogTimelineRow): StudentRequestTimelineEvent {
  const kind = auditActionToKind(row);
  const rejectionReason = row.new_values?.rejection_reason;
  let description: string | null = row.notes ?? null;
  if (kind === "returned" && rejectionReason) {
    description = rejectionReason;
  } else if (kind === "rejected" && rejectionReason) {
    description = rejectionReason;
  }
  return {
    id: `audit:${row.id}`,
    at: row.created_at,
    kind,
    title: timelineTitleForKind(kind),
    description,
    actorRole: row.actor_role,
    actorLabel: formatTimelineActorLabel(row.actor_role, kind),
  };
}

export function buildEffectTimelineEvents(
  requestType: string,
  markers: RequestEffectMarkers,
): StudentRequestTimelineEvent[] {
  const events: StudentRequestTimelineEvent[] = [];
  const label = resolveEffectLabelForRequestType(requestType);

  if (markers.recordAppliedAt) {
    events.push({
      id: `effect:absence:${markers.recordAppliedAt}`,
      at: markers.recordAppliedAt,
      kind: "effect_applied",
      title: timelineTitleForKind("effect_applied"),
      description: label ?? "تم تطبيق أثر الطلب",
    });
  }
  if (markers.chanceAppliedAt) {
    events.push({
      id: `effect:chance:${markers.chanceAppliedAt}`,
      at: markers.chanceAppliedAt,
      kind: "effect_applied",
      title: timelineTitleForKind("effect_applied"),
      description: label ?? "تم تطبيق أثر الطلب",
    });
  }
  if (markers.creditsAppliedAt) {
    events.push({
      id: `effect:equivalency:${markers.creditsAppliedAt}`,
      at: markers.creditsAppliedAt,
      kind: "effect_applied",
      title: timelineTitleForKind("effect_applied"),
      description: label ?? "تم تطبيق أثر الطلب",
    });
  }
  if (markers.documentIssuedAt) {
    events.push({
      id: `effect:transcript:${markers.documentIssuedAt}`,
      at: markers.documentIssuedAt,
      kind: "effect_applied",
      title: timelineTitleForKind("effect_applied"),
      description: label ?? "تم إصدار الوثيقة الرسمية",
    });
  }
  if (requestType === "grade_appeal" && markers.gradeAppealApprovedScore != null && markers.gradeAppealReviewedAt) {
    events.push({
      id: `effect:grade:${markers.gradeAppealReviewedAt}`,
      at: markers.gradeAppealReviewedAt,
      kind: "effect_applied",
      title: timelineTitleForKind("effect_applied"),
      description: `تم اعتماد الدرجة: ${Number(markers.gradeAppealApprovedScore).toFixed(2)}`,
    });
  }

  return events;
}

export function mergeTimelineEvents(events: StudentRequestTimelineEvent[]): StudentRequestTimelineEvent[] {
  const byId = new Map<string, StudentRequestTimelineEvent>();
  for (const event of events) {
    byId.set(event.id, event);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );
}

export function sanitizeTimelineForStudent(
  events: StudentRequestTimelineEvent[],
): StudentRequestTimelineEvent[] {
  return events.map((event) => ({
    ...event,
    actorLabel: event.kind === "submitted" || event.kind === "resubmitted" || event.kind === "cancelled"
      ? "أنت"
      : event.kind === "created"
        ? "أنت"
        : "الشؤون الأكاديمية",
    actorRole: null,
  }));
}

export const STUDENT_MILESTONE_KINDS: TimelineEventKind[] = [
  "created",
  "submitted",
  "under_review",
  "returned",
  "resubmitted",
  "approved",
  "rejected",
  "cancelled",
  "effect_applied",
];
