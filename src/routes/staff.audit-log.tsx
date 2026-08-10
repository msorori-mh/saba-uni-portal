import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowRight, ClipboardList, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell } from "@/components/portal/PortalShell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fetchRequestAuditLog } from "@/lib/student-requests/audit-log.functions";

export const Route = createFileRoute("/staff/audit-log")({
  head: () => ({
    meta: [
      { title: "سجل التدقيق — بوابة الموظف" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AuditLogPage,
});

const STATUS_LABEL: Record<string, string> = {
  completed: "مكتملة",
  active: "نشطة",
  pending: "منتظرة",
  skipped: "متجاوَزة",
  cancelled: "ملغاة",
  rejected: "مرفوضة",
  returned: "معادة",
};

const DECISION_LABEL: Record<string, string> = {
  approve: "موافقة",
  approved: "موافقة",
  reject: "رفض",
  rejected: "رفض",
  return: "إعادة",
  returned: "إعادة",
  review: "مراجعة",
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "rejected" || status === "cancelled") return "destructive";
  if (status === "active") return "secondary";
  return "outline";
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar", {
    dateStyle: "medium",
    timeStyle: "short",
    calendar: "gregory",
    numberingSystem: "latn",
  }).format(d);
}

function AuditLogPage() {
  const [search, setSearch] = useState("");
  const [search, setSearch] = useState("");
  const load = useServerFn(fetchRequestAuditLog);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["staff", "audit-log"],
    queryFn: () => load({ data: {} }),
  });

  const entries = useMemo(() => {
    const all = data?.entries ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((e) =>
      [e.requestNumber, e.stepNameAr, e.stepKey, e.completedByName, e.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [data, search]);

  const handleLogout = useStaffLogout();


  return (
    <PortalShell title="سجل التدقيق" onLogout={handleLogout}>
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <Link
          to="/staff"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowRight className="h-4 w-4" />
          العودة إلى بوابة الموظف
        </Link>

        <h1 className="mt-4 font-display text-xl font-extrabold text-primary-deep flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          سجل التدقيق
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          يعرض كل خطوة في دورة حياة الطلب: حالتها، ومن اعتمدها، ووقت الاعتماد.
        </p>

        <div className="mt-4 relative">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث برقم الطلب أو اسم الخطوة أو المستخدم…"
            className="ps-9"
          />
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : isError || data?.available === false ? (
          <div className="mt-6 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {data?.messageAr ?? "تعذر تحميل سجل التدقيق. يرجى المحاولة لاحقاً."}
          </div>
        ) : entries.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            لا توجد سجلات تدقيق لعرضها.
          </div>
        ) : (
          <>
            {data?.scope === "participated" && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-[11px] text-amber-900">
                يعرض هذا السجل الطلبات التي شاركت في معالجتها فقط.
              </div>
            )}
            <div className="mt-4 overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-bold">رقم الطلب</th>
                    <th className="p-3 text-start font-bold">الخطوة</th>
                    <th className="p-3 text-start font-bold">الحالة</th>
                    <th className="p-3 text-start font-bold">القرار</th>
                    <th className="p-3 text-start font-bold">المستخدم</th>
                    <th className="p-3 text-start font-bold">وقت الاعتماد</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entries.map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className="p-3 font-mono text-[11px] whitespace-nowrap">
                        {e.requestNumber ?? "—"}
                      </td>
                      <td className="p-3">
                        <div className="font-semibold">{e.stepNameAr ?? e.stepKey}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{e.stepKey}</div>
                      </td>
                      <td className="p-3">
                        <Badge variant={statusVariant(e.status)}>
                          {STATUS_LABEL[e.status] ?? e.status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {e.decision ? (DECISION_LABEL[e.decision] ?? e.decision) : "—"}
                      </td>
                      <td className="p-3">{e.completedByName ?? "—"}</td>
                      <td className="p-3 whitespace-nowrap">{formatDateTime(e.completedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </PortalShell>
  );
}
