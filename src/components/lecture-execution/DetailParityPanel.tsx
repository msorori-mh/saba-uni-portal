import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2, CheckCircle2, AlertTriangle, EyeOff, RefreshCw } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StandardCard } from "@/components/brand/StandardCard";
import { PLAN_STATUS_LABELS } from "@/lib/lecture-execution.functions";
import {
  getDataMiningDetailParity,
  PARITY_METRIC_LABELS,
} from "@/lib/lecture-execution-parity.functions";

/**
 * DATA_MINING_DETAIL_PARITY — يعرض مطابقة قيم لوحة المتابعة مع صفحة تفاصيل
 * المقرر، ويسرد صفوف الاختلاف فقط إن وُجدت. القراءة تتم عبر نفس الدوال
 * المخوَّلة، ولا يجري أي تعديل على البيانات.
 */
export function DetailParityPanel() {
  const fetchParity = useServerFn(getDataMiningDetailParity);
  const q = useQuery({
    queryKey: ["lecture-execution", "detail-parity"],
    queryFn: () => fetchParity({ data: {} }),
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
          ? "هذا الفحص متاح لرؤساء الأقسام والشؤون الأكاديمية والعميد والإدارة فقط."
          : "تعذر تنفيذ فحص المطابقة."}
      </div>
    );
  }

  const data = q.data;
  if (!data) return null;
  const problems = data.sections.filter((s) => s.status !== "match");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          المقارنة على مستوى الفصل الدراسي بين قيم لوحة المتابعة وقيم صفحة تفاصيل المقرر.
          آخر فحص: {new Date(data.checked_at).toLocaleString("ar")}
        </p>
        <button
          type="button"
          onClick={() => void q.refetch()}
          disabled={q.isFetching}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-bold text-primary hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw className={q.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          إعادة الفحص
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <StandardCard density="compact">
          <p className="text-xs text-muted-foreground">المقررات المفحوصة</p>
          <p className="text-2xl font-extrabold">{data.totals.sections}</p>
        </StandardCard>
        <StandardCard density="compact">
          <p className="text-xs text-muted-foreground">مطابقة</p>
          <p className="text-2xl font-extrabold text-emerald-700">{data.totals.matched}</p>
        </StandardCard>
        <StandardCard density="compact">
          <p className="text-xs text-muted-foreground">مختلفة</p>
          <p className="text-2xl font-extrabold text-destructive">{data.totals.mismatched}</p>
        </StandardCard>
        <StandardCard density="compact">
          <p className="text-xs text-muted-foreground">تعذّرت قراءتها</p>
          <p className="text-2xl font-extrabold text-amber-700">{data.totals.unreadable}</p>
        </StandardCard>
      </div>

      {problems.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-700">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
          لا توجد صفوف اختلاف: جميع قيم المتابعة مطابقة لصفحات تفاصيل المقررات.
        </div>
      ) : (
        <StandardCard className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المقرر</TableHead>
                <TableHead>المجموعة</TableHead>
                <TableHead>عضو هيئة التدريس</TableHead>
                <TableHead>حالة الخطة</TableHead>
                <TableHead>الاختلاف</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {problems.map((s) => (
                <TableRow key={s.course_section_id}>
                  <TableCell className="font-bold">
                    <Link
                      to="/faculty-portal/lecture-execution/$sectionId"
                      params={{ sectionId: s.course_section_id }}
                      className="text-primary hover:underline"
                    >
                      {s.course_code} — {s.course_name_ar}
                    </Link>
                  </TableCell>
                  <TableCell>{s.section_code}</TableCell>
                  <TableCell>{s.faculty_name}</TableCell>
                  <TableCell>{PLAN_STATUS_LABELS[s.plan_status] ?? s.plan_status}</TableCell>
                  <TableCell>
                    {s.status === "unreadable" ? (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <EyeOff className="h-4 w-4" aria-hidden />
                        تعذر قراءة تفاصيل المقرر{s.error ? `: ${s.error}` : ""}
                      </span>
                    ) : (
                      <ul className="space-y-1">
                        {s.diffs.map((d) => (
                          <li key={d.metric} className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
                            <span>{PARITY_METRIC_LABELS[d.metric]}:</span>
                            <span className="font-bold">المتابعة {d.monitoring_value}</span>
                            <span className="text-muted-foreground">مقابل</span>
                            <span className="font-bold">التفاصيل {d.detail_value}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </StandardCard>
      )}
    </div>
  );
}
