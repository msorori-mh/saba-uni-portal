import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
  type MonitoringRow,
} from "@/lib/lecture-execution.functions";
import {
  rowsOfDepartment,
  summarizeByDepartment,
  totalsOfRows,
  type DepartmentMonitoringSummary,
} from "@/lib/lecture-execution-by-department";

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
  // College scope only: `null` = the whole college, otherwise one department.
  const [departmentKey, setDepartmentKey] = useState<string | null>(null);
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
          ? "غير مصرح: متابعة سير العملية التعليمية متاحة لرئيس القسم (في قسمه) وللعميد والإدارة الأكاديمية فقط."
          : "تعذر تحميل بيانات المتابعة."}
      </div>
    );
  }

  const data = q.data;
  if (!data) return null;
  const isCollege = data.scope === "college";
  const departmentSummaries = isCollege ? summarizeByDepartment(data.rows) : [];
  // A department that vanished after a refetch falls back to the whole college.
  const activeDepartment =
    isCollege && departmentKey !== null
      ? (departmentSummaries.find((d) => d.key === departmentKey) ?? null)
      : null;
  const visibleRows = activeDepartment ? rowsOfDepartment(data.rows, activeDepartment.key) : data.rows;
  const t = activeDepartment ? totalsOfRows(visibleRows) : data.totals;
  const plannedRows = visibleRows.filter((r) => r.plan_status === "published");
  const awaitingRows = visibleRows.filter((r) => r.plan_status !== "published");
  const atRisk = plannedRows.filter(
    (r) => r.risk_level === "high" || r.risk_level === "medium",
  );

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
        <Link
          to="/faculty-portal/lecture-monitoring/parity"
          className="ms-auto rounded-lg border border-border px-3 py-1 text-sm font-bold text-primary hover:bg-muted"
        >
          مطابقة القيم مع تفاصيل المقرر
        </Link>
        <span className="text-xs text-muted-foreground">
          النطاق:{" "}
          {data.scope === "department"
            ? departmentScopeLabel(data.departments)
            : activeDepartment
              ? `الكلية — ${activeDepartment.name}`
              : "الكلية"}
        </span>
      </div>

      {isCollege && departmentSummaries.length > 0 && (
        <DepartmentBreakdown
          summaries={departmentSummaries}
          activeKey={activeDepartment?.key ?? null}
          onSelect={setDepartmentKey}
        />
      )}

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {[
          ["المجموعات", t.sections],
          ["المخطط", t.planned],
          ["المنفذ (شامل التعويض)", t.executed],
          ["منها معوّض", t.compensated],
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
        {activeDepartment && (
          <p className="mt-1 text-xs text-muted-foreground">
            هذه الأسباب مجمّعة على مستوى الكلية كلها، وليست خاصة بالقسم المحدد.
          </p>
        )}
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

      <section className="space-y-2">
        <h2 className="font-display text-base font-extrabold text-primary">
          مجموعات لديها خطة معتمدة ({plannedRows.length})
        </h2>
        {plannedRows.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
            لا توجد خطط محاضرات معتمدة في هذا النطاق حتى الآن.
          </p>
        ) : (
          <MonitoringTable rows={plannedRows} />
        )}
      </section>

      {awaitingRows.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-base font-extrabold text-primary">
            مجموعات بانتظار اعتماد الخطة ({awaitingRows.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            لم تُعتمد خطة محاضرات لهذه المجموعات، لذلك لا تُحتسب ضمن نسب التنفيذ.
          </p>
          <MonitoringTable rows={awaitingRows} compact />
        </section>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CalendarCheck className="h-3 w-3" aria-hidden /> المصدر: خطط المحاضرات وسجلات التنفيذ التي
        يعتمدها عضو هيئة التدريس المسند للمجموعة.
      </p>
    </div>
  );
}

/**
 * College scope (dean / academic administration): one row per department with
 * its own figures, and a filter that narrows everything below to that department.
 */
function DepartmentBreakdown({
  summaries,
  activeKey,
  onSelect,
}: {
  summaries: DepartmentMonitoringSummary[];
  activeKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const chip = (selected: boolean) =>
    cn(
      "rounded-lg border px-3 py-1 text-sm transition-colors",
      selected ? "border-gold bg-gold/10 font-bold text-primary" : "hover:bg-muted",
    );
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-display text-base font-extrabold text-primary">المتابعة حسب القسم</h2>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="تصفية حسب القسم">
        <button
          type="button"
          aria-pressed={activeKey === null}
          onClick={() => onSelect(null)}
          className={chip(activeKey === null)}
        >
          كل الأقسام
        </button>
        {summaries.map((d) => (
          <button
            key={d.key}
            type="button"
            aria-pressed={activeKey === d.key}
            onClick={() => onSelect(d.key)}
            className={chip(activeKey === d.key)}
          >
            {d.name}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className={cn(HEAD_CELL, "text-start")}>القسم</TableHead>
              <TableHead className={NUM_HEAD}>المجموعات</TableHead>
              <TableHead className={NUM_HEAD}>بانتظار اعتماد الخطة</TableHead>
              <TableHead className={NUM_HEAD}>المخطط</TableHead>
              <TableHead className={NUM_HEAD}>المنفذ (شامل التعويض)</TableHead>
              <TableHead className={NUM_HEAD}>المتبقي</TableHead>
              <TableHead className={NUM_HEAD}>غير المعوّض</TableHead>
              <TableHead className={NUM_HEAD}>نسبة التنفيذ</TableHead>
              <TableHead className={NUM_HEAD}>مقررات متأخرة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summaries.map((d) => (
              <TableRow key={d.key} className={cn(activeKey === d.key && "bg-gold/5")}>
                <TableCell className="whitespace-nowrap text-start font-bold text-primary">
                  {d.name}
                </TableCell>
                <TableCell className={NUM_CELL}>{d.totals.sections}</TableCell>
                <TableCell className={NUM_CELL}>
                  <CountBadge value={d.awaitingPlan} tone="warn" />
                </TableCell>
                <TableCell className={NUM_CELL}>{d.totals.planned}</TableCell>
                <TableCell className={NUM_CELL}>{d.totals.executed}</TableCell>
                <TableCell className={NUM_CELL}>{d.totals.remaining}</TableCell>
                <TableCell className={NUM_CELL}>
                  <CountBadge value={d.totals.uncompensated} tone="danger" />
                </TableCell>
                <TableCell className={NUM_CELL}>
                  <PercentBar value={d.totals.execution_percent} />
                </TableCell>
                <TableCell className={NUM_CELL}>
                  <CountBadge value={d.totals.behind_plan_courses} tone="danger" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

/** Shared column styling: every numeric column is centred under its header. */
const HEAD_CELL = "whitespace-nowrap px-3 py-2.5 text-xs font-bold text-muted-foreground";
const NUM_HEAD = cn(HEAD_CELL, "text-center");
const NUM_CELL = "px-3 text-center tabular-nums";

/** A count that needs attention when above zero; a quiet dash-free zero otherwise. */
function CountBadge({ value, tone }: { value: number; tone: "warn" | "danger" }) {
  if (!value) return <span className="text-muted-foreground">0</span>;
  return (
    <span
      className={cn(
        "inline-flex min-w-8 justify-center rounded-full px-2 py-0.5 text-xs font-bold",
        tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-amber-500/15 text-amber-700",
      )}
    >
      {value}
    </span>
  );
}

/** Execution percentage as a number with a thin progress bar under it. */
function PercentBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className="mx-auto w-20">
      <div className="text-sm font-bold text-primary">{value}%</div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

/** Department scope shows which department(s) the head is looking at. */
function departmentScopeLabel(departments: { department_name_ar: string }[] | undefined): string {
  const names = (departments ?? []).map((d) => d.department_name_ar).filter(Boolean);
  return names.length > 0 ? `القسم — ${names.join("، ")}` : "القسم";
}

function MonitoringTable({
  rows,
  compact = false,
}: {
  rows: MonitoringRow[];
  compact?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className={cn(HEAD_CELL, "text-start")}>المقرر</TableHead>
            <TableHead className={NUM_HEAD}>المجموعة</TableHead>
            <TableHead className={cn(HEAD_CELL, "text-start")}>القسم</TableHead>
            <TableHead className={cn(HEAD_CELL, "text-start")}>عضو هيئة التدريس</TableHead>
            <TableHead className={NUM_HEAD}>الخطة</TableHead>
            {!compact && (
              <>
                <TableHead className={NUM_HEAD}>المخطط</TableHead>
                <TableHead className={NUM_HEAD}>المنفذ (شامل التعويض)</TableHead>
                <TableHead className={NUM_HEAD}>منها معوّض</TableHead>
                <TableHead className={NUM_HEAD}>المؤجل</TableHead>
                <TableHead className={NUM_HEAD}>المتبقي</TableHead>
                <TableHead className={NUM_HEAD}>غير المعوّض</TableHead>
                <TableHead className={NUM_HEAD}>نسبة التنفيذ</TableHead>
                <TableHead className={NUM_HEAD}>المخاطر</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.course_section_id}>
              <TableCell className="whitespace-nowrap text-start">
                <span className="font-mono text-xs">{r.course_code}</span> — {r.course_name_ar}
              </TableCell>
              <TableCell className={NUM_CELL}>{r.section_code}</TableCell>
              <TableCell className="whitespace-nowrap text-start">{r.department_name_ar ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap text-start">{r.faculty_name || "—"}</TableCell>
              <TableCell className="whitespace-nowrap px-3 text-center text-xs">
                {PLAN_STATUS_LABELS[r.plan_status] ?? r.plan_status}
              </TableCell>
              {!compact && (
                <>
                  <TableCell className={NUM_CELL}>{r.planned_count}</TableCell>
                  <TableCell className={NUM_CELL}>{r.executed_count}</TableCell>
                  <TableCell className={NUM_CELL}>{r.compensated_count}</TableCell>
                  <TableCell className={NUM_CELL}>
                    <CountBadge value={r.postponed_count} tone="warn" />
                  </TableCell>
                  <TableCell className={NUM_CELL}>{r.remaining_count}</TableCell>
                  <TableCell className={NUM_CELL}>
                    <CountBadge value={r.uncompensated_count} tone="danger" />
                  </TableCell>
                  <TableCell className={NUM_CELL}>
                    <PercentBar value={r.execution_percent} />
                  </TableCell>
                  <TableCell className="px-3 text-center">
                    <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold", RISK_STYLES[r.risk_level])}>
                      {RISK_LABELS[r.risk_level]}
                    </span>
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
