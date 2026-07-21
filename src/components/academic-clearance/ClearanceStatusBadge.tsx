import {
  CLEARANCE_STATUS_LABELS,
  type ClearanceStatus,
} from "@/lib/academic-clearance";

const tones: Record<ClearanceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  department_review: "bg-blue-100 text-blue-800",
  academic_affairs_review: "bg-amber-100 text-amber-800",
  returned: "bg-orange-100 text-orange-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  superseded: "bg-slate-200 text-slate-700",
};

export function ClearanceStatusBadge(props: { status: ClearanceStatus }) {
  return (
    <span
      dir="rtl"
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[props.status]}`}
      aria-label={`حالة المقاصة ${CLEARANCE_STATUS_LABELS[props.status]}`}
    >
      {CLEARANCE_STATUS_LABELS[props.status]}
    </span>
  );
}
