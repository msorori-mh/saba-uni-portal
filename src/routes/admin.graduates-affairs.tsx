import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  Clock3,
  FileCheck2,
  GraduationCap,
  Loader2,
  RefreshCw,
  UsersRound,
  XCircle,
  CalendarDays,
  Megaphone,
  ClipboardList,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAdminGraduatesAffairsOverviewFn } from "@/lib/admin-graduates-affairs.functions";
import { GraduatesAffairsAuthoringPanel } from "@/components/portal/GraduatesAffairsAuthoringPanel";

export const Route = createFileRoute("/admin/graduates-affairs")({
  component: AdminGraduatesAffairsPage,
});

const STATE_LABELS: Record<string, string> = {
  pending: "مرشح — بانتظار الاعتماد",
  approved: "خريج معتمد",
  corrected: "خريج — سجل مصحح",
  revoked: "اعتماد ملغى",
};

function shortId(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function AdminGraduatesAffairsPage() {
  const getOverview = useServerFn(getAdminGraduatesAffairsOverviewFn);
  const query = useQuery({
    queryKey: ["admin", "graduates-affairs", "overview"],
    queryFn: () => getOverview({ data: {} }),
  });

  return (
    <main dir="rtl" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-primary flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-gold" />
            نظرة إدارية على شؤون الخريجين
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            عرض إداري للأرقام المجمّعة، مع صلاحية تشغيلية احتياطية موثّقة في سجل الأحداث.
          </p>
        </div>
      </div>

      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState retry={() => void query.refetch()} />
      ) : !query.data ? (
        <EmptyState />
      ) : (
        <OverviewContent data={query.data} retry={() => void query.refetch()} />
      )}

      <div className="border-t border-border pt-6">
        <GraduatesAffairsAuthoringPanel />
      </div>
    </main>

  );
}

function LoadingState() {
  return (
    <div
      className="rounded-2xl border border-dashed bg-muted/20 p-10 text-center"
      role="status"
      data-testid="admin-ga-overview-loading"
    >
      <Loader2 className="mx-auto h-9 w-9 animate-spin text-muted-foreground" />
      <p className="mt-3 font-bold text-primary">جارٍ تحميل النظرة الإدارية</p>
      <p className="text-sm text-muted-foreground">يتم قراءة الأرقام المجمّعة من قاعدة البيانات.</p>
    </div>
  );
}

function ErrorState({ retry }: { retry: () => void }) {
  return (
    <div
      className="rounded-2xl border border-dashed bg-muted/20 p-10 text-center"
      role="alert"
      data-testid="admin-ga-overview-error"
    >
      <AlertTriangle className="mx-auto h-9 w-9 text-muted-foreground" />
      <p className="mt-3 font-bold text-primary">تعذّر تحميل النظرة الإدارية</p>
      <p className="text-sm text-muted-foreground">
        حدث خطأ أثناء قراءة الأرقام المجمّعة. يمكنك المحاولة مرة أخرى.
      </p>
      <Button type="button" variant="outline" className="mt-4" onClick={retry}>
        <RefreshCw className="h-4 w-4" /> إعادة المحاولة
      </Button>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-2xl border border-dashed bg-muted/20 p-10 text-center"
      data-testid="admin-ga-overview-empty"
    >
      <Briefcase className="mx-auto h-9 w-9 text-muted-foreground" />
      <p className="mt-3 font-bold text-primary">لا توجد بيانات متاحة</p>
      <p className="text-sm text-muted-foreground">
        لم يُعثر على سجلات خريجين لعرضها في النظرة الإدارية.
      </p>
    </div>
  );
}

function OverviewContent({
  data,
  retry,
}: {
  data: Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getAdminGraduatesAffairsOverviewFn>>>>;
  retry: () => void;
}) {
  const counts = data.counts;
  const hasRecords = counts.totalRecords > 0;

  return (
    <div className="space-y-6" data-testid="admin-ga-overview-content">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>نطاق إداري للقراءة فقط.</strong> هذه الصفحة تعرض أرقاماً وإحصاءات مجمّعة
            للإشراف على Go-Live. لا تتيح إجراءات تشغيلية — العمليات تظل حصراً على مدير/مختص شؤون
            الخريجين ضمن نطاق تكليفه.
          </p>
        </div>
      </div>

      <section aria-labelledby="ga-admin-records-title">
        <h2
          id="ga-admin-records-title"
          className="font-display text-lg font-bold text-primary mb-3"
        >
          سجلات الخريجين
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="إجمالي السجلات"
            value={counts.totalRecords}
            icon={UsersRound}
            testId="admin-ga-kpi-total"
          />
          <Kpi
            label="معتمد"
            value={counts.approvedRecords}
            icon={CheckCircle2}
            tone="emerald"
            testId="admin-ga-kpi-approved"
          />
          <Kpi
            label="بانتظار الاعتماد"
            value={counts.pendingRecords}
            icon={Clock3}
            tone="amber"
            testId="admin-ga-kpi-pending"
          />
          <Kpi
            label="مصحح / ملغى"
            value={counts.correctedRecords + counts.revokedRecords}
            icon={XCircle}
            tone="rose"
            testId="admin-ga-kpi-exception"
          />
        </div>
      </section>

      <section aria-labelledby="ga-admin-activity-title">
        <h2
          id="ga-admin-activity-title"
          className="font-display text-lg font-bold text-primary mb-3"
        >
          النشاط والمتابعة
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="متابعات مفتوحة"
            value={counts.openFollowups}
            icon={ClipboardList}
            testId="admin-ga-kpi-followups"
          />
          <Kpi
            label="فعاليات قادمة/جارية"
            value={counts.activeEvents}
            icon={CalendarDays}
            testId="admin-ga-kpi-events"
          />
          <Kpi
            label="فرص منشورة"
            value={counts.activeOpportunities}
            icon={Megaphone}
            testId="admin-ga-kpi-opportunities"
          />
          <Kpi
            label="استبيانات منشورة"
            value={counts.publishedSurveyVersions}
            icon={BarChart3}
            testId="admin-ga-kpi-surveys"
          />
        </div>
      </section>

      {hasRecords ? (
        <section
          className="rounded-2xl border bg-card shadow-sm"
          aria-labelledby="ga-admin-recent-title"
        >
          <div className="border-b p-4">
            <h2 id="ga-admin-recent-title" className="font-bold text-primary">
              أحدث السجلات
            </h2>
            <p className="text-xs text-muted-foreground">
              قائمة بأحدث السجلات المعروضة للإدارة — بدون بيانات اتصال أو تفاصيل شخصية.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-3 text-start">السجل</th>
                  <th className="p-3 text-start">الحالة الرسمية</th>
                  <th className="p-3 text-start">سنة التخرج</th>
                  <th className="p-3 text-start">البرنامج / القسم</th>
                  <th className="p-3 text-start">تاريخ الإنشاء</th>
                </tr>
              </thead>
              <tbody>
                {data.recentRecords.map((record) => (
                  <tr key={record.recordId} className="border-t">
                    <td className="p-3 font-mono text-xs" title={record.recordId}>
                      {shortId(record.recordId)}
                    </td>
                    <td className="p-3">
                      <StateBadge state={record.recordState} />
                    </td>
                    <td className="p-3 tabular-nums">
                      {record.graduationYear ?? "—"}
                    </td>
                    <td className="p-3">
                      <div title={record.programId}>برنامج {shortId(record.programId)}</div>
                      <div className="text-xs text-muted-foreground" title={record.departmentId}>
                        قسم {shortId(record.departmentId)}
                      </div>
                    </td>
                    <td className="p-3 tabular-nums">
                      {new Date(record.createdAt).toLocaleDateString("ar-SA")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <EmptyState />
      )}

      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={retry}>
          <RefreshCw className="h-4 w-4" /> تحديث الأرقام
        </Button>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone = "primary",
  testId,
}: {
  label: string;
  value: number | null;
  icon: typeof UsersRound;
  tone?: "primary" | "emerald" | "amber" | "rose";
  testId: string;
}) {
  const toneClasses = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
    rose: "bg-rose-500/10 text-rose-600",
  };

  return (
    <div
      className="rounded-xl border border-border bg-card p-4 flex items-center gap-3"
      data-testid={testId}
    >
      <div className={`grid h-10 w-10 place-items-center rounded-lg shrink-0 ${toneClasses[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground font-semibold">{label}</div>
        <div className="text-xl font-extrabold text-primary">
          {value === null ? (
            <span className="text-muted-foreground" title="غير متاح حالياً">—</span>
          ) : (
            value.toLocaleString("ar-EG")
          )}
        </div>
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const label = STATE_LABELS[state] ?? state;
  const classes: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    corrected: "bg-blue-100 text-blue-800",
    revoked: "bg-rose-100 text-rose-800",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold ${classes[state] ?? "bg-muted text-muted-foreground"}`}>
      {label}
    </span>
  );
}
