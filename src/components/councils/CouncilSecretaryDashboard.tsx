import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  FileText,
  ListChecks,
  Users,
  ClipboardEdit,
  AlertCircle,
  Loader2,
  ScrollText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCouncilSecretaryDashboardFn } from "@/lib/councils-c9.functions";

interface CouncilSecretaryDashboardProps {
  councilId: string;
  councilName: string;
}

const STATUS_LABELS: Record<string, string> = {
  submitted: "مقدّم",
  under_review: "قيد المراجعة",
  needs_completion: "مطلوب استكمال",
  accepted_for_agenda: "مقبول للجدول",
  rejected: "مرفوض",
  draft: "مسودة",
  in_progress: "قيد التنفيذ",
  completed: "مكتمل",
  blocked: "معطّل",
  issued: "صادر",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function EmptyItem({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

export function CouncilSecretaryDashboard({
  councilId,
  councilName,
}: CouncilSecretaryDashboardProps) {
  const fetchDashboard = useServerFn(getCouncilSecretaryDashboardFn);
  const query = useQuery({
    queryKey: ["council-secretary-dashboard", councilId],
    queryFn: () => fetchDashboard({ data: { council_id: councilId } }),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const data = (query.data ?? {}) as Record<string, unknown[]>;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <ScrollText className="h-5 w-5 text-primary" />
        <h2 className="font-bold text-primary">لوحة عمل أمين السر — {councilName}</h2>
      </div>

      {query.isLoading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : query.isError ? (
        <div className="rounded-md border border-muted/50 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
          {query.error instanceof Error ? query.error.message : "لوحة متابعة أمين السر غير متاحة حالياً."}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardEdit className="h-4 w-4" />
                قائمة تحضير الموضوعات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.topic_preparation_queue ?? []).length === 0 ? (
                <EmptyItem text="لا توجد موضوعات تنتظر التحضير." />
              ) : (
                (data.topic_preparation_queue as Array<{
                  topic_id: string;
                  title: string;
                  status: string;
                }>).map((t) => (
                  <div
                    key={t.topic_id}
                    className="flex items-center justify-between rounded-md border border-border p-2 text-xs"
                  >
                    <p className="font-bold truncate">{t.title}</p>
                    <Badge variant="outline">{statusLabel(t.status)}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ListChecks className="h-4 w-4" />
                إعداد جدول الأعمال
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.agenda_prep_meetings ?? []).length === 0 ? (
                <EmptyItem text="لا توجد اجتماعات تنتظر إعداد جدول الأعمال." />
              ) : (
                (data.agenda_prep_meetings as Array<{
                  meeting_id: string;
                  title: string;
                  status: string;
                  agenda_item_count: number;
                }>).map((m) => (
                  <div
                    key={m.meeting_id}
                    className="flex items-center justify-between rounded-md border border-border p-2 text-xs"
                  >
                    <div>
                      <p className="font-bold">{m.title}</p>
                      <p className="text-muted-foreground mt-0.5">
                        {m.agenda_item_count} بنود
                      </p>
                    </div>
                    <Badge variant="outline">يحتاج إعداد</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                عمل الحضور
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.attendance_work ?? []).length === 0 ? (
                <EmptyItem text="لا توجد اجتماعات تنتظر تسجيل الحضور." />
              ) : (
                (data.attendance_work as Array<{
                  meeting_id: string;
                  title: string;
                  scheduled_at: string;
                  roll_status: string | null;
                }>).map((m) => (
                  <div
                    key={m.meeting_id}
                    className="flex items-center justify-between rounded-md border border-border p-2 text-xs"
                  >
                    <div>
                      <p className="font-bold">{m.title}</p>
                      <p className="text-muted-foreground mt-0.5">
                        {formatDateTime(m.scheduled_at)}
                      </p>
                    </div>
                    <Badge variant={m.roll_status ? "secondary" : "outline"}>
                      {m.roll_status ? "تم التسجيل" : "تسجيل الحضور"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" />
                مسودات ومراجعة المحاضر
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.minutes_drafts ?? []).length === 0 ? (
                <EmptyItem text="لا توجد محاضر في مرحلة المسودة أو المراجعة." />
              ) : (
                (data.minutes_drafts as Array<{
                  meeting_id: string;
                  title: string;
                  minutes_status: string;
                  is_locked: boolean;
                }>).map((m) => (
                  <div
                    key={m.meeting_id}
                    className="flex items-center justify-between rounded-md border border-border p-2 text-xs"
                  >
                    <div>
                      <p className="font-bold">{m.title}</p>
                      <p className="text-muted-foreground mt-0.5">
                        {statusLabel(m.minutes_status)}
                      </p>
                    </div>
                    <Badge variant={m.is_locked ? "secondary" : "outline"}>
                      {m.is_locked ? "مقفل" : "مسودة"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                متابعة تنفيذ القرارات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data.decision_followup ?? []).length === 0 ? (
                <EmptyItem text="لا توجد قرارات تنتظر المتابعة." />
              ) : (
                (data.decision_followup as Array<{
                  decision_id: string;
                  canonical_number: string;
                  title: string;
                  status: string;
                  due_date: string;
                  responsible_unit: string | null;
                }>).map((d) => (
                  <div
                    key={d.decision_id}
                    className="flex items-center justify-between rounded-md border border-border p-2 text-xs"
                  >
                    <div>
                      <p className="font-bold">{d.title}</p>
                      <p className="text-muted-foreground mt-0.5">
                        الجهة: {d.responsible_unit ?? "—"} · الموعد:{" "}
                        {formatDateTime(d.due_date)}
                      </p>
                    </div>
                    <Badge variant="outline">{statusLabel(d.status)}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
