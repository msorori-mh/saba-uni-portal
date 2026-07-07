import { ArrowLeft, Clock, Inbox } from "lucide-react";
import {
  formatWaitingDuration,
  type StaffRequestInboxItem,
} from "@/lib/student-requests/staff-inbox-ui";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-foreground",
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-amber-100 text-amber-800",
  in_review: "bg-amber-100 text-amber-800",
  returned: "bg-orange-100 text-orange-800",
  returned_for_completion: "bg-orange-100 text-orange-800",
  approved: "bg-emerald-100 text-emerald-800",
  completed: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  cancelled: "bg-zinc-200 text-zinc-800",
};

export function StaffRequestInbox({
  items,
  selectedId,
  onSelect,
}: {
  items: StaffRequestInboxItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card p-8 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <div className="text-sm text-muted-foreground">لا توجد طلبات مطابقة للفلاتر.</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden divide-y">
      {items.map((item) => {
        const isSelected = item.id === selectedId;
        const badgeCls = STATUS_BADGE[item.status] ?? "bg-muted text-foreground";
        const waiting = formatWaitingDuration(item.waitingSince);

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`w-full text-right p-3 flex items-start justify-between gap-3 transition-colors ${
              isSelected ? "bg-primary/5 border-r-2 border-r-primary" : "hover:bg-muted/40"
            }`}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-primary">
                  {item.requestNumber ?? item.academicNumber ?? "—"}
                </span>
                <span className="font-semibold text-sm truncate">
                  {item.studentName ?? "—"}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                  {item.requestTypeNameAr}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badgeCls}`}>
                  {item.statusLabelAr}
                </span>
                {item.isActionable && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    يتطلب إجراءك
                  </span>
                )}
              </div>

              <div className="text-xs text-muted-foreground truncate">{item.title}</div>

              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                {item.currentStepLabelAr && (
                  <span>الخطوة: {item.currentStepLabelAr}</span>
                )}
                {item.currentRoleLabelAr && (
                  <span>الدور: {item.currentRoleLabelAr}</span>
                )}
                {item.departmentNameAr && (
                  <span>القسم: {item.departmentNameAr}</span>
                )}
                {waiting && (
                  <span className="inline-flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {waiting}
                  </span>
                )}
              </div>

              {item.submittedAt && (
                <div className="text-[10px] text-muted-foreground">
                  تاريخ التقديم:{" "}
                  {new Date(item.submittedAt).toLocaleString("ar-EG")}
                </div>
              )}
            </div>
            <ArrowLeft className="h-4 w-4 text-muted-foreground self-center shrink-0" />
          </button>
        );
      })}
    </div>
  );
}
