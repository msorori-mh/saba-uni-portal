import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, CalendarCheck, AlertTriangle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  getDeliveryMonitoring,
  MONITORING_PERIODS,
  MONITORING_PERIOD_LABELS,
  PLAN_STATUS_LABELS,
  RISK_LABELS,
  type MonitoringPeriod,
} from "@/lib/lecture-execution.functions";

const RISK_STYLES: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-amber-500/10 text-amber-700",
  low: "bg-emerald-500/10 text-emerald-700",
  no_plan: "bg-muted text-muted-foreground",
};

/**
 * Scoped planned-vs-executed monitoring for department heads, academic
 * affairs, dean and admins. All scoping/authorization is enforced by the
 * cdp_delivery_monitoring RPC — this panel only renders what it returns.
 */
export function DeliveryMonitoringPanel() {
  const [period, setPeriod] = useState<MonitoringPeriod>("term");
  const fetchMonitoring = useServerFn(getDeliveryMonitoring);

  const q = useQuery({
    queryKey: ["lecture-execution", "monitoring", period],
    queryFn: () => fetchMonitoring({ data: { period } }),
    staleTime: 30_000,
  });

  if (q.isLoading) {
    return (
      <div className="grid place-items-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (q.isError) {
    const message = q.error instanceof Error ? q.error.message : "";
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        {message.includes("CDP_NOT_AUTHORIZED")
          ? "هذه المتابعة متاحة لرؤساء الأقسام والشؤون الأكاديمية والعميد والإدارة فقط."
          : "تعذر تحميل بيانات المتابعة."}
      </div>
    );
  }

  const data = q.data;
  if (!data) return null;
  const t = data.totals;
  const atRisk = data.rows.filter((r) => r.risk_level === "high" || r.risk_level === "medium");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">الفترة:</span>
        {MONITORING_PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-lg border px-3 py-1 text-sm transition-colors",
              period === p ? "border-gold bg-gold/10 font-bold text-primary" : "hover:bg-muted",
            )}
          >
            {MONITORING_PERIOD_LABELS[p]}
          </button>
        ))}
        <span className="ms-auto text-xs text-muted-foreground">
          النطاق: {data.scope === "department" ? "القسم" : "الكلية"}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {[
          ["المجموعات", t.sections],
          ["المخطط", t.planned],
          ["المنفذ", t.executed],
          ["المعوّض", t.compensated],
          ["المؤجل", t.postponed],
          ["الملغى", t.cancelled],
          ["المتعذر", t.hindered],
          ["غير المعوّض", t.uncompensated],
          ["المتبقي", t.remaining],
          ["نسبة التنفيذ", t.execution_percent === null ? "—" : `${t.execution_percent}%`],
          ["مقررات متأخرة", t.behind_plan_courses],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-display text-lg font-extrabold text-primary">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-primary">
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden /> الإنذار المبكر
        </h2>
        {atRisk.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            لا توجد مقررات متأخرة عن خطة التنفيذ في هذه الفترة.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {atRisk.map((r) => (
              <li key={r.course_section_id}>
                <span className="font-mono text-xs">{r.course_code}</span> — {r.course_name_ar} (
                {r.section_code}) — {RISK_LABELS[r.risk_level]} — نُفذ {r.executed_count} من{" "}
                {r.planned_count}
                {r.uncompensated_count > 0 && ` — غير معوّض ${r.uncompensated_count}`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-display text-base font-extrabold text-primary">أسباب عدم التنفيذ</h2>
        {data.reasons.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">لا توجد حالات عدم تنفيذ مسجلة.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {data.reasons.map((r) => (
              <li key={r.reason}>
                {r.reason} — {r.count}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المقرر</TableHead>
              <TableHead>المجموعة</TableHead>
              <TableHead>القسم</TableHead>
              <TableHead>عضو هيئة التدريس</TableHead>
              <TableHead>الخطة</TableHead>
              <TableHead>المخطط</TableHead>
              <TableHead>المنفذ</TableHead>
              <TableHead>المتبقي</TableHead>
              <TableHead>غير المنفذ</TableHead>
              <TableHead>غير المعوّض</TableHead>
              <TableHead>نسبة التنفيذ</TableHead>
              <TableHead>المخاطر</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((r) => (
              <TableRow key={r.course_section_id}>
                <TableCell className="whitespace-nowrap">
                  <span className="font-mono text-xs">{r.course_code}</span> — {r.course_name_ar}
                </TableCell>
                <TableCell>{r.section_code}</TableCell>
                <TableCell>{r.department_name_ar ?? "—"}</TableCell>
                <TableCell>{r.faculty_name || "—"}</TableCell>
                <TableCell>{PLAN_STATUS_LABELS[r.plan_status] ?? r.plan_status}</TableCell>
                <TableCell>{r.planned_count}</TableCell>
                <TableCell>{r.executed_count}</TableCell>
                <TableCell>{r.remaining_count}</TableCell>
                <TableCell>{r.not_executed_count}</TableCell>
                <TableCell>{r.uncompensated_count}</TableCell>
                <TableCell className="font-bold">
                  {r.execution_percent === null ? "—" : `${r.execution_percent}%`}
                </TableCell>
                <TableCell>
                  <span
                    className={cn("rounded px-2 py-0.5 text-xs", RISK_STYLES[r.risk_level])}
                  >
                    {RISK_LABELS[r.risk_level]}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarCheck className="h-3 w-3" aria-hidden /> المصدر: خطط المحاضرات وسجلات التنفيذ التي
        يعتمدها عضو هيئة التدريس المسند للمجموعة.
      </p>
    </div>
  );
}
