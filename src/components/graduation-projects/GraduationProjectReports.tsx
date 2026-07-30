import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportCsv } from "../../lib/reports/export";
import { formatGpDateTimeAr, formatGpFileSizeAr } from "./gp-datetime";
import { PROJECT_STATE_LABELS } from "../../lib/graduation-projects/lifecycle";
import type {
  GraduationProjectArchiveReport,
  GraduationProjectAssignmentsReport,
  GraduationProjectDefenseReport,
  GraduationProjectEvaluationsReport,
  GraduationProjectStatesReport,
} from "../../lib/graduation-projects/lifecycle";

export type GraduationProjectReportKind = "states" | "assignments" | "evaluations" | "archive" | "defense";

export interface GraduationProjectReportsProps {
  departmentId: string;
  statesReport: GraduationProjectStatesReport | null;
  assignmentsReport: GraduationProjectAssignmentsReport | null;
  evaluationsReport: GraduationProjectEvaluationsReport | null;
  archiveReport: GraduationProjectArchiveReport | null;
  defenseReport?: GraduationProjectDefenseReport | null;
  busy?: boolean;
  onLoad(kind: GraduationProjectReportKind): void;
}

export function GraduationProjectReports({
  departmentId,
  statesReport,
  assignmentsReport,
  evaluationsReport,
  archiveReport,
  defenseReport = null,
  busy = false,
  onLoad,
}: GraduationProjectReportsProps) {
  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle>تقارير القسم</CardTitle>
        <CardDescription>تتطلب التقارير تعييناً إدارياً نشطاً في القسم.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          defaultValue="states"
          onValueChange={(value: string) => onLoad(value as GraduationProjectReportKind)}
        >
          <TabsList>
            <TabsTrigger value="states">الحالات</TabsTrigger>
            <TabsTrigger value="assignments">التعيينات</TabsTrigger>
            <TabsTrigger value="evaluations">التقييمات</TabsTrigger>
            <TabsTrigger value="archive">الأرشيف</TabsTrigger>
            <TabsTrigger value="defense">المناقشات</TabsTrigger>
          </TabsList>
          <TabsContent value="states">
            {statesReport ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">الإجمالي: {statesReport.summary.total}</Badge>
                  <Badge variant="destructive">متعثر: {statesReport.summary.at_risk}</Badge>
                  <Badge variant="secondary">
                    بمراحل متأخرة: {statesReport.summary.with_overdue}
                  </Badge>
                  <Badge variant="secondary">
                    جاهز للمناقشة: {statesReport.summary.discussion_ready}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void exportCsv(
                        "مشاريع التخرج — الحالات",
                        statesReport.projects.map((project) => ({
                          العنوان: project.title,
                          الحالة: PROJECT_STATE_LABELS[project.state],
                          "التقدم %": project.progress_percent,
                          "مراحل متأخرة": project.overdue_milestones,
                          "جاهز للمناقشة": project.discussion_ready ? "نعم" : "لا",
                        })),
                      )
                    }
                  >
                    تصدير CSV
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>العنوان</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>التقدم</TableHead>
                      <TableHead>مراحل متأخرة</TableHead>
                      <TableHead>جاهزية المناقشة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statesReport.projects.map((project) => (
                      <TableRow key={project.project_id}>
                        <TableCell>{project.title}</TableCell>
                        <TableCell>{PROJECT_STATE_LABELS[project.state]}</TableCell>
                        <TableCell>{project.progress_percent}%</TableCell>
                        <TableCell>{project.overdue_milestones}</TableCell>
                        <TableCell>{project.discussion_ready ? "جاهز" : "غير جاهز"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onLoad("states")}
              >
                تحميل تقرير الحالات
              </Button>
            )}
          </TabsContent>
          <TabsContent value="assignments">
            {assignmentsReport ? (
              <div className="space-y-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المشرف</TableHead>
                      <TableHead>مشاريع نشطة</TableHead>
                      <TableHead>متعثرة</TableHead>
                      <TableHead>متوسط التقدم</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignmentsReport.supervisors.map((supervisor, index) => (
                      <TableRow key={supervisor.assignment_id}>
                        <TableCell>مشرف {index + 1}</TableCell>
                        <TableCell>{supervisor.active_projects}</TableCell>
                        <TableCell>{supervisor.at_risk_projects}</TableCell>
                        <TableCell>{supervisor.avg_progress}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    مشاريع بلا مشرف نشط: {assignmentsReport.unassigned_projects.length}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void exportCsv(
                        "مشاريع التخرج — أعباء الإشراف",
                        assignmentsReport.supervisors.map((supervisor, index) => ({
                          المشرف: `مشرف ${index + 1}`,
                          "مشاريع نشطة": supervisor.active_projects,
                          متعثرة: supervisor.at_risk_projects,
                          "متوسط التقدم %": supervisor.avg_progress,
                        })),
                      )
                    }
                  >
                    تصدير CSV
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onLoad("assignments")}
              >
                تحميل تقرير التعيينات
              </Button>
            )}
          </TabsContent>
          <TabsContent value="evaluations">
            {evaluationsReport ? (
              <div className="space-y-3">
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void exportCsv(
                        "مشاريع التخرج — التقييمات",
                        evaluationsReport.projects.map((project) => ({
                          العنوان: project.title,
                          "تقييمات معتمدة": project.finalized_evaluations,
                          المتوسط: project.avg_total,
                          أدنى: project.min_total,
                          أعلى: project.max_total,
                          "تصحيحات معلقة": project.pending_corrections,
                        })),
                      )
                    }
                  >
                    تصدير CSV
                  </Button>
                </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>العنوان</TableHead>
                    <TableHead>تقييمات معتمدة</TableHead>
                    <TableHead>المتوسط</TableHead>
                    <TableHead>أدنى</TableHead>
                    <TableHead>أعلى</TableHead>
                    <TableHead>تصحيحات معلقة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evaluationsReport.projects.map((project) => (
                    <TableRow key={project.project_id}>
                      <TableCell>{project.title}</TableCell>
                      <TableCell>{project.finalized_evaluations}</TableCell>
                      <TableCell>{project.avg_total ?? "—"}</TableCell>
                      <TableCell>{project.min_total ?? "—"}</TableCell>
                      <TableCell>{project.max_total ?? "—"}</TableCell>
                      <TableCell>{project.pending_corrections}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onLoad("evaluations")}
              >
                تحميل تقرير التقييمات
              </Button>
            )}
          </TabsContent>
          <TabsContent value="archive">
            {archiveReport ? (
              <div className="space-y-3">
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void exportCsv(
                        "مشاريع التخرج — الأرشيف",
                        archiveReport.archives.map((row) => ({
                          العنوان: row.title,
                          "تاريخ الأرشفة": formatGpDateTimeAr(row.archived_at),
                          "الملف النهائي": row.final_file.original_name,
                          الحجم: formatGpFileSizeAr(row.final_file.byte_size),
                        })),
                      )
                    }
                  >
                    تصدير CSV
                  </Button>
                </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>العنوان</TableHead>
                    <TableHead>تاريخ الأرشفة</TableHead>
                    <TableHead>الملف النهائي</TableHead>
                    <TableHead>الحجم</TableHead>
                    <TableHead>الفحص</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archiveReport.archives.map((row) => (
                    <TableRow key={row.project_id}>
                      <TableCell>{row.title}</TableCell>
                      <TableCell>{formatGpDateTimeAr(row.archived_at)}</TableCell>
                      <TableCell>{row.final_file.original_name}</TableCell>
                      <TableCell>{formatGpFileSizeAr(row.final_file.byte_size)}</TableCell>
                      <TableCell>
                        {row.final_file.scan_state === "clean" ? "سليم" : "محجوب"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onLoad("archive")}
              >
                تحميل تقرير الأرشيف
              </Button>
            )}
          </TabsContent>
          <TabsContent value="defense">
            {defenseReport ? (
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">المناقشات المجدولة</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void exportCsv(
                          "مشاريع التخرج — المناقشات المجدولة",
                          defenseReport.scheduled_defenses.map((row) => ({
                            العنوان: row.title,
                            الموعد: formatGpDateTimeAr(row.starts_at),
                            المكان: row.venue,
                            "أعضاء اللجنة": row.panel_size,
                            "رئيس اللجنة": row.has_chair ? "معيَّن" : "غير معيَّن",
                          })),
                        )
                      }
                    >
                      تصدير CSV
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>العنوان</TableHead>
                        <TableHead>الموعد</TableHead>
                        <TableHead>المكان</TableHead>
                        <TableHead>أعضاء اللجنة</TableHead>
                        <TableHead>رئيس اللجنة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {defenseReport.scheduled_defenses.map((row) => (
                        <TableRow key={row.discussion_id}>
                          <TableCell>{row.title}</TableCell>
                          <TableCell>{formatGpDateTimeAr(row.starts_at)}</TableCell>
                          <TableCell>{row.venue}</TableCell>
                          <TableCell>{row.panel_size}</TableCell>
                          <TableCell>{row.has_chair ? "معيَّن" : "غير معيَّن"}</TableCell>
                        </TableRow>
                      ))}
                      {defenseReport.scheduled_defenses.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5}>لا توجد مناقشات مجدولة.</TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">تقييمات ناقصة</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>العنوان</TableHead>
                        <TableHead>أعضاء اللجنة</TableHead>
                        <TableHead>معتمدة</TableHead>
                        <TableHead>متبقية</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {defenseReport.missing_evaluations.map((row) => (
                        <TableRow key={row.discussion_id}>
                          <TableCell>{row.title}</TableCell>
                          <TableCell>{row.panel_size}</TableCell>
                          <TableCell>{row.finalized}</TableCell>
                          <TableCell>{row.pending}</TableCell>
                        </TableRow>
                      ))}
                      {defenseReport.missing_evaluations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4}>لا توجد تقييمات ناقصة.</TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">توزيع النتائج</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(defenseReport.results_distribution).map(([bucket, count]) => (
                      <Badge key={bucket} variant="secondary">
                        {bucket}: {count}
                      </Badge>
                    ))}
                    {Object.keys(defenseReport.results_distribution).length === 0 ? (
                      <span className="text-sm text-muted-foreground">لا توجد نتائج معتمدة بعد.</span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onLoad("defense")}
              >
                تحميل تقرير المناقشات
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
