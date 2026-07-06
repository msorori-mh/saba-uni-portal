import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, FileText, Loader2, Plus } from "lucide-react";
import { getMyStudentServiceRequests } from "@/lib/student-affairs.functions";

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  submitted: "مُرسل",
  in_review: "قيد المراجعة",
  under_review: "قيد المراجعة",
  returned_for_completion: "عاد للاستكمال",
  returned: "عاد للاستكمال",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغى",
  completed: "مكتمل",
};

/** Dashboard summary card — full workflow at /student/requests */
export function StudentRequestsPortalSummary() {
  const listFn = useServerFn(getMyStudentServiceRequests);
  const { data = [], isLoading } = useQuery({
    queryKey: ["student-affairs", "my-requests", "summary"],
    queryFn: () => listFn({ data: {} }),
    staleTime: 60_000,
  });

  const recent = data.slice(0, 3);
  const pendingCount = data.filter((r: { status: string }) =>
    ["submitted", "in_review", "under_review", "returned", "returned_for_completion"].includes(r.status),
  ).length;

  return (
    <div id="student-requests" className="mt-6 rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-primary flex items-center gap-2">
            <FileText className="h-4 w-4 text-gold" /> طلبات شؤون الطلاب
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            تقديم ومتابعة الطلبات عبر الواجهة الموحدة.
            {pendingCount > 0 && (
              <span className="mr-1 font-bold text-primary"> ({pendingCount} قيد المتابعة)</span>
            )}
          </p>
        </div>
        <Link
          to="/student/requests/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> طلب جديد
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-4 grid place-items-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : recent.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
          لا توجد طلبات بعد.{" "}
          <Link to="/student/requests" className="font-bold text-primary underline">
            عرض كل الطلبات
          </Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {recent.map((request: {
            id: string;
            title: string;
            status: string;
            request_type_name_ar?: string | null;
            request_type: string;
          }) => (
            <li key={request.id}>
              <Link
                to="/student/requests/$id"
                params={{ id: request.id }}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-secondary/40 transition-colors"
              >
                <span className="font-bold text-primary truncate">{request.title}</span>
                <span className="shrink-0 text-[10px] font-bold text-muted-foreground">
                  {STATUS_LABEL[request.status] ?? request.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Link
          to="/student/requests"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary underline"
        >
          <ClipboardList className="h-3.5 w-3.5" /> إدارة الطلبات
        </Link>
      </div>
    </div>
  );
}
