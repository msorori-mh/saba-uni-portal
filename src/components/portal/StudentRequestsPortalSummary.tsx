import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, FileText, Loader2, Plus } from "lucide-react";
import { getMyStudentServiceRequests } from "@/lib/student-affairs.functions";
import { StandardCard } from "@/components/brand";

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

function formatRequestDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ar-YE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

/** Visible request types for the student — eligible, not disabled, not hide-mode ineligible. */
export function filterDashboardAvailableServices(
  rows: Array<{
    code: string;
    name_ar: string;
    description_ar: string | null;
    is_eligible: boolean;
    is_disabled: boolean;
    ineligible_display_mode: string;
    sort_order: number;
  }>,
  limit = 4,
) {
  return [...rows]
    .filter((r) => {
      if (r.is_disabled) return false;
      if (!r.is_eligible) {
        // Hide completely when mode asks not to show; otherwise list page handles disabled CTAs.
        if (r.ineligible_display_mode === "hide" || r.ineligible_display_mode === "hidden") {
          return false;
        }
        return false;
      }
      return true;
    })
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, limit);
}

/** Dashboard requests hub — independent loading; failures must not break the page. */
export function StudentRequestsPortalSummary() {
  const listFn = useServerFn(getMyStudentServiceRequests);
  const {
    data: requests = [],
    isLoading: requestsLoading,
    isError: requestsError,
  } = useQuery({
    queryKey: ["student-affairs", "my-requests", "summary"],
    queryFn: () => listFn({ data: {} }),
    staleTime: 60_000,
    retry: 1,
  });

  const recent = requests.slice(0, 2);

  return (
    <StandardCard id="student-requests" className="mt-6">
      <div className="space-y-1">
        <h2 className="font-display text-base font-bold text-primary flex items-center gap-2">
          <FileText className="h-4 w-4 text-gold" /> الخدمات الطلابية
        </h2>
        <p className="text-xs text-muted-foreground leading-5">
          تقديم ومتابعة الخدمات الطلابية من مكان واحد.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/student/requests/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" /> طلب جديد
        </Link>
        <Link
          to="/student/requests"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-bold text-primary hover:bg-secondary/50"
        >
          <ClipboardList className="h-3.5 w-3.5" /> طلباتي السابقة
        </Link>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-bold text-primary mb-2">آخر الطلبات</h3>
        {requestsLoading ? (
          <div className="grid place-items-center py-6" aria-busy="true">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : requestsError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center text-xs text-destructive">
            تعذر تحميل الطلبات حالياً. يمكنك المحاولة لاحقاً أو فتح صفحة طلباتي السابقة.
          </div>
        ) : recent.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-center space-y-1">
            <p className="text-sm font-semibold text-primary">لم تقدم أي طلب حتى الآن.</p>
            <p className="text-xs text-muted-foreground">
              ابدأ بتقديم طلب جديد من الخدمات المتاحة.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {recent.map((request) => (
              <li key={request.id}>
                <Link
                  to="/student/requests/$id"
                  params={{ id: request.id }}
                  className="block rounded-lg border border-border bg-background px-3 py-2.5 hover:bg-secondary/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono text-muted-foreground" dir="ltr">
                        {request.request_number ?? "—"}
                      </div>
                      <div className="font-bold text-primary text-sm truncate">
                        {request.request_type_name_ar ?? request.title}
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold rounded-full bg-muted px-2 py-0.5 text-foreground/80">
                      {STATUS_LABEL[request.status] ?? request.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {formatRequestDate(request.submitted_at ?? request.created_at)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

    </StandardCard>
  );
}
