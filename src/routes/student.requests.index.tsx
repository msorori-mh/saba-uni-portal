import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2, Plus } from "lucide-react";
import { getMyStudentServiceRequests } from "@/lib/student-affairs.functions";

export const Route = createFileRoute("/student/requests/")({
  component: StudentRequestsIndexPage,
});

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

function StudentRequestsIndexPage() {
  const listFn = useServerFn(getMyStudentServiceRequests);
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["student-affairs", "my-requests"],
    queryFn: () => listFn({ data: {} }),
  });

  return (
    <div dir="rtl" className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-primary flex items-center gap-2">
            <FileText className="h-6 w-6 text-gold" /> طلبات شؤون الطلاب
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">متابعة الطلبات الحالية والسابقة وسجل مراحلها.</p>
        </div>
        <Link to="/student/requests/new" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          <Plus className="h-4 w-4" /> طلب جديد
        </Link>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <section className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        {isLoading ? (
          <div className="grid place-items-center p-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : data.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">لا توجد طلبات بعد.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-primary">
                <tr>
                  <th className="px-3 py-2 text-right">رقم الطلب</th>
                  <th className="px-3 py-2 text-right">نوع الطلب</th>
                  <th className="px-3 py-2 text-right">العنوان</th>
                  <th className="px-3 py-2 text-right">الحالة</th>
                  <th className="px-3 py-2 text-right">الجهة الحالية</th>
                  <th className="px-3 py-2 text-right">تاريخ التقديم</th>
                  <th className="px-3 py-2 text-right">آخر تحديث</th>
                  <th className="px-3 py-2 text-right">التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {data.map((request: any) => (
                  <tr key={request.id} className="border-t border-border/60">
                    <td className="px-3 py-2 font-mono">{request.request_number ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{request.request_type}</td>
                    <td className="px-3 py-2 font-bold">{request.title}</td>
                    <td className="px-3 py-2">{STATUS_LABEL[request.status] ?? request.status}</td>
                    <td className="px-3 py-2">{request.current_role_key ?? "—"}</td>
                    <td className="px-3 py-2">{request.submitted_at ? new Date(request.submitted_at).toLocaleString("ar-EG") : "—"}</td>
                    <td className="px-3 py-2">{new Date(request.updated_at).toLocaleString("ar-EG")}</td>
                    <td className="px-3 py-2">
                      <Link to="/student/requests/$id" params={{ id: request.id }} className="font-bold text-primary underline">
                        عرض
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
