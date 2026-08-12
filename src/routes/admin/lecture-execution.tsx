import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, CalendarCheck } from "lucide-react";
import { LoadErrorNotice } from "@/components/admin/AccessDeniedNotice";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDeliveryOverview } from "@/lib/lecture-execution.functions";

export const Route = createFileRoute("/admin/lecture-execution")({
  component: LectureExecutionOverviewPage,
});

const PLAN_STATUS_LABELS: Record<string, string> = {
  none: "لا توجد خطة",
  draft: "مسودة",
  published: "معتمدة",
  archived: "مؤرشفة",
};

function LectureExecutionOverviewPage() {
  const fetchOverview = useServerFn(getDeliveryOverview);
  const overviewQ = useQuery({
    queryKey: ["admin", "lecture-execution", "overview"],
    queryFn: () => fetchOverview(),
    staleTime: 30_000,
  });

  if (overviewQ.isError) {
    return <LoadErrorNotice error={overviewQ.error} onRetry={() => overviewQ.refetch()} />;
  }

  const rows = overviewQ.data ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-xl font-extrabold text-primary flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-gold" aria-hidden /> متابعة تنفيذ المحاضرات
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          مقارنة ما كان مخططاً تدريسه بما تم تسجيل تنفيذه فعلياً لكل مجموعة، ونسبة تغطية مفردات
          المقرر.
        </p>
      </header>

      {overviewQ.isLoading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          لا توجد مجموعات دراسية نشطة.
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
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
                <TableHead>نسبة التغطية</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
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
                  <TableCell>{r.pending_count}</TableCell>
                  <TableCell>{r.not_executed_count}</TableCell>
                  <TableCell>{r.uncompensated_count}</TableCell>
                  <TableCell className="font-bold">{r.coverage_percent}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
