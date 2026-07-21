import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PROJECT_STATE_LABELS } from "../../lib/graduation-projects/lifecycle";
import type {
  GraduationProjectArchiveReport,
  GraduationProjectAssignmentsReport,
  GraduationProjectEvaluationsReport,
  GraduationProjectStatesReport,
} from "../../lib/graduation-projects/lifecycle";

export type GraduationProjectReportKind = "states" | "assignments" | "evaluations" | "archive";

export interface GraduationProjectReportsProps {
  departmentId: string;
  statesReport: GraduationProjectStatesReport | null;
  assignmentsReport: GraduationProjectAssignmentsReport | null;
  evaluationsReport: GraduationProjectEvaluationsReport | null;
  archiveReport: GraduationProjectArchiveReport | null;
  busy?: boolean;
  onLoad(kind: GraduationProjectReportKind): void;
}

export function GraduationProjectReports({ departmentId, statesReport, assignmentsReport, evaluationsReport, archiveReport, busy = false, onLoad }: GraduationProjectReportsProps) {
  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle>تقارير القسم</CardTitle>
        <CardDescription>القسم: {departmentId} — تتطلب التقارير تعييناً إدارياً نشطاً.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="states" onValueChange={(value: string) => onLoad(value as GraduationProjectReportKind)}>
          <TabsList>
            <TabsTrigger value="states">الحالات</TabsTrigger>
            <TabsTrigger value="assignments">التعيينات</TabsTrigger>
            <TabsTrigger value="evaluations">التقييمات</TabsTrigger>
            <TabsTrigger value="archive">الأرشيف</TabsTrigger>
          </TabsList>
          <TabsContent value="states">
            {statesReport ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">الإجمالي: {statesReport.summary.total}</Badge>
                  <Badge variant="destructive">متعثر: {statesReport.summary.at_risk}</Badge>
                  <Badge variant="secondary">بمراحل متأخرة: {statesReport.summary.with_overdue}</Badge>
                  <Badge variant="secondary">جاهز للمناقشة: {statesReport.summary.discussion_ready}</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>العنوان</TableHead><TableHead>الحالة</TableHead><TableHead>التقدم</TableHead>
                      <TableHead>مراحل متأخرة</TableHead><TableHead>جاهزية المناقشة</TableHead>
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
              <Button type="button" variant="outline" disabled={busy} onClick={() => onLoad("states")}>تحميل تقرير الحالات</Button>
            )}
          </TabsContent>
          <TabsContent value="assignments">
            {assignmentsReport ? (
              <div className="space-y-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المشرف</TableHead><TableHead>مشاريع نشطة</TableHead>
                      <TableHead>متعثرة</TableHead><TableHead>متوسط التقدم</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignmentsReport.supervisors.map((supervisor) => (
                      <TableRow key={supervisor.assignment_id}>
                        <TableCell dir="ltr">{supervisor.user_id}</TableCell>
                        <TableCell>{supervisor.active_projects}</TableCell>
                        <TableCell>{supervisor.at_risk_projects}</TableCell>
                        <TableCell>{supervisor.avg_progress}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="text-sm text-muted-foreground">
                  مشاريع بلا مشرف نشط: {assignmentsReport.unassigned_projects.length}
                </p>
              </div>
            ) : (
              <Button type="button" variant="outline" disabled={busy} onClick={() => onLoad("assignments")}>تحميل تقرير التعيينات</Button>
            )}
          </TabsContent>
          <TabsContent value="evaluations">
            {evaluationsReport ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>العنوان</TableHead><TableHead>تقييمات معتمدة</TableHead><TableHead>المتوسط</TableHead>
                    <TableHead>أدنى</TableHead><TableHead>أعلى</TableHead><TableHead>تصحيحات معلقة</TableHead>
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
            ) : (
              <Button type="button" variant="outline" disabled={busy} onClick={() => onLoad("evaluations")}>تحميل تقرير التقييمات</Button>
            )}
          </TabsContent>
          <TabsContent value="archive">
            {archiveReport ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>العنوان</TableHead><TableHead>تاريخ الأرشفة</TableHead>
                    <TableHead>الملف النهائي</TableHead><TableHead>الحجم</TableHead><TableHead>الفحص</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archiveReport.archives.map((row) => (
                    <TableRow key={row.project_id}>
                      <TableCell>{row.title}</TableCell>
                      <TableCell>{row.archived_at}</TableCell>
                      <TableCell>{row.final_file.original_name}</TableCell>
                      <TableCell>{row.final_file.byte_size}</TableCell>
                      <TableCell>{row.final_file.scan_state === "clean" ? "سليم" : "محجوب"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Button type="button" variant="outline" disabled={busy} onClick={() => onLoad("archive")}>تحميل تقرير الأرشيف</Button>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
