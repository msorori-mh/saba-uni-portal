import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { Badge } from "@/components/ui/badge";
import { fetchFixturesDiagnostics } from "@/lib/student-requests/fixtures-diagnostics.functions";

export const Route = createFileRoute("/staff/fixtures-diagnostics")({
  head: () => ({
    meta: [
      { title: "تشخيص بيانات الاختبار — بوابة الموظف" },
      {
        name: "description",
        content: "حالة كل fixture من طلبات الاختبار وجداول التفاصيل المفقودة لكل خدمة.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FixturesDiagnosticsPage,
});

function FixturesDiagnosticsPage() {
  const run = useServerFn(fetchFixturesDiagnostics);
  const { data, isLoading } = useQuery({
    queryKey: ["fixtures-diagnostics"],
    queryFn: () => run(),
  });

  return (
    <PortalShell>
      <main className="container mx-auto px-4 py-6" dir="rtl">
        <Link
          to="/staff"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowRight className="h-4 w-4" />
          العودة للوحة الموظف
        </Link>

        <h1 className="mt-3 font-display text-2xl font-extrabold text-primary-deep">
          تشخيص بيانات الاختبار (Fixtures)
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          يوضح لكل طلب اختباري ما إذا كان صف التفاصيل الخاص بالخدمة موجوداً، وأي جدول تفاصيل مفقود
          يمنع تنفيذ الإجراءات التقدّمية.
        </p>

        {isLoading && (
          <div className="mt-8 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جارٍ الفحص…
          </div>
        )}

        {data && !data.available && (
          <div className="mt-6 flex items-start gap-2 rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
            <span>{data.messageAr}</span>
          </div>
        )}

        {data?.available && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryCard label="إجمالي الـfixtures" value={data.summary.total} />
              <SummaryCard label="جاهزة" value={data.summary.ready} tone="ok" />
              <SummaryCard
                label="تفاصيل مفقودة"
                value={data.summary.missingDetails}
                tone={data.summary.missingDetails > 0 ? "bad" : "ok"}
              />
              <SummaryCard
                label="خدمات غير مشمولة"
                value={data.summary.unmapped}
                tone={data.summary.unmapped > 0 ? "bad" : "ok"}
              />
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border-2 border-gold/30 bg-card">
              <table className="w-full text-right text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-bold">رقم الطلب</th>
                    <th className="p-3 font-bold">الخدمة</th>
                    <th className="p-3 font-bold">حالة الطلب</th>
                    <th className="p-3 font-bold">الخطوة النشطة</th>
                    <th className="p-3 font-bold">جدول التفاصيل</th>
                    <th className="p-3 font-bold">الجاهزية</th>
                    <th className="p-3 font-bold">الملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr>
                      <td className="p-4 text-muted-foreground" colSpan={7}>
                        لا توجد طلبات اختبارية مطابقة.
                      </td>
                    </tr>
                  )}
                  {data.rows.map((row) => (
                    <tr key={row.requestId} className="border-t border-border/60 align-top">
                      <td className="p-3 font-mono text-xs">{row.requestNumber}</td>
                      <td className="p-3">
                        <div className="font-medium">{row.serviceLabelAr ?? "—"}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {row.requestType}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant={row.status === "completed" ? "default" : "secondary"}>
                          {row.status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {row.activeStepKey ? (
                          <>
                            <div>{row.activeStepNameAr ?? row.activeStepKey}</div>
                            <div className="font-mono text-[11px] text-muted-foreground">
                              {row.activeStepKey}
                              {row.activeStepOrder != null ? ` · #${row.activeStepOrder}` : ""}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-[11px]">{row.detailsTable ?? "—"}</td>
                      <td className="p-3">
                        {row.ready ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="h-4 w-4" />
                            جاهزة
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <XCircle className="h-4 w-4" />
                            ناقصة
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{row.issueAr ?? "—"}</td>
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

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "bad";
}) {
  const toneClass =
    tone === "bad" ? "text-destructive" : tone === "ok" ? "text-emerald-600" : "text-primary";
  return (
    <div className="rounded-xl border-2 border-gold/30 bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-display text-2xl font-extrabold ${toneClass}`}>{value}</div>
    </div>
  );
}
