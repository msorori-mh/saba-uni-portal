import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  CalendarClock,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Archive,
  Users,
  ScrollText,
  Vote,
  FileText,
  Bell,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getCouncilChairDashboardFn,
  getCouncilSecretaryDashboardFn,
  getCouncilMemberDashboardFn,
  getCouncilAdminOperationalDashboardFn,
} from "@/lib/councils-c9.functions";

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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ar", { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-5 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive text-center">
      {message}
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="grid place-items-center py-10">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <span className="sr-only">جاري تحميل لوحة المعلومات…</span>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count }: { icon: typeof LayoutDashboard; title: string; count?: number }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
        <h3 className="font-bold text-sm text-primary">{title}</h3>
      </div>
      {count !== undefined ? (
        <Badge variant="secondary" className="text-[10px]">
          {count}
        </Badge>
      ) : null}
    </div>
  );
}

function CountCard({ label, value, variant = "default" }: { label: string; value: number; variant?: "default" | "warning" | "danger" }) {
  const valueClass =
    variant === "danger" ? "text-destructive" : variant === "warning" ? "text-amber-600" : "text-primary";
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
      <div className={`text-lg font-bold ${valueClass}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

export function CouncilDashboardsPanel({
  councilId,
  availableRoles,
  isAdmin,
}: {
  councilId: string;
  availableRoles: string[];
  isAdmin: boolean;
}) {
  const tabs = [
    { id: "chair", label: "رئيس المجلس", icon: Users, allowed: availableRoles.includes("chair") },
    { id: "secretary", label: "أمين السر", icon: ScrollText, allowed: availableRoles.includes("secretary") || availableRoles.includes("chair") },
    { id: "member", label: "عضو", icon: Vote, allowed: true },
    { id: "admin", label: "الإدارة", icon: LayoutDashboard, allowed: isAdmin },
  ];

  const defaultTab = tabs.find((t) => t.allowed)?.id ?? "member";
  const [activeTab, setActiveTab] = useState<string>(defaultTab);

  const fetchChair = useServerFn(getCouncilChairDashboardFn);
  const fetchSecretary = useServerFn(getCouncilSecretaryDashboardFn);
  const fetchMember = useServerFn(getCouncilMemberDashboardFn);
  const fetchAdmin = useServerFn(getCouncilAdminOperationalDashboardFn);

  const chairQuery = useQuery({
    queryKey: ["council-dashboard", "chair", councilId],
    queryFn: () => fetchChair({ data: { council_id: councilId } }),
    enabled: activeTab === "chair",
  });

  const secretaryQuery = useQuery({
    queryKey: ["council-dashboard", "secretary", councilId],
    queryFn: () => fetchSecretary({ data: { council_id: councilId } }),
    enabled: activeTab === "secretary",
  });

  const memberQuery = useQuery({
    queryKey: ["council-dashboard", "member", councilId],
    queryFn: () => fetchMember({ data: { council_id: councilId } }),
    enabled: activeTab === "member",
  });

  const adminQuery = useQuery({
    queryKey: ["council-dashboard", "admin", councilId],
    queryFn: () => fetchAdmin({ data: { council_id: councilId } }),
    enabled: activeTab === "admin",
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-primary" aria-hidden />
          <CardTitle className="text-base">لوحة المعلومات</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
          <TabsList className="flex-wrap h-auto gap-1 mb-4">
            {tabs
              .filter((t) => t.allowed)
              .map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger key={tab.id} value={tab.id} className="text-xs gap-1" aria-label={tab.label}>
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {tab.label}
                  </TabsTrigger>
                );
              })}
          </TabsList>

          <TabsContent value="chair">
            {chairQuery.isLoading ? (
              <LoadingBlock />
            ) : chairQuery.isError ? (
              <ErrorState message="تعذّر تحميل لوحة رئيس المجلس." />
            ) : (
              <ChairDashboard data={chairQuery.data} />
            )}
          </TabsContent>

          <TabsContent value="secretary">
            {secretaryQuery.isLoading ? (
              <LoadingBlock />
            ) : secretaryQuery.isError ? (
              <ErrorState message="تعذّر تحميل لوحة أمين السر." />
            ) : (
              <SecretaryDashboard data={secretaryQuery.data} />
            )}
          </TabsContent>

          <TabsContent value="member">
            {memberQuery.isLoading ? (
              <LoadingBlock />
            ) : memberQuery.isError ? (
              <ErrorState message="تعذّر تحميل لوحة العضو." />
            ) : (
              <MemberDashboard data={memberQuery.data} />
            )}
          </TabsContent>

          <TabsContent value="admin">
            {adminQuery.isLoading ? (
              <LoadingBlock />
            ) : adminQuery.isError ? (
              <ErrorState message="تعذّر تحميل لوحة الإدارة." />
            ) : (
              <AdminDashboard data={adminQuery.data} />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ChairDashboard({ data }: { data: unknown }) {
  const d = data as {
    upcoming_meetings?: Array<{ meeting_id: string; meeting_number: number; title: string; scheduled_at: string; status: string }>;
    topics_requiring_action?: Array<{ topic_id: string; title: string; status: string; submitted_at: string | null }>;
    agenda_readiness?: { meetings_with_agenda?: Array<{ meeting_id: string; title: string; total_items: number; approved_items: number; completion_rate: number }> };
    quorum_readiness?: Array<{ meeting_id: string; title: string; scheduled_at: string; roll_status: string | null; quorum_met: boolean | null }>;
    overdue_decisions?: { overdue_decisions?: Array<{ decision_id: string; title: string; due_date: string }> };
    archive_status?: { total_archived_meetings?: number };
    metrics?: { total_meetings?: number; archived_meetings?: number; total_decisions?: number; completed_decisions?: number };
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CountCard label="إجمالي الاجتماعات" value={d.metrics?.total_meetings ?? 0} />
        <CountCard label="المؤرشفة" value={d.metrics?.archived_meetings ?? 0} />
        <CountCard label="القرارات" value={d.metrics?.total_decisions ?? 0} />
        <CountCard label="منجزة" value={d.metrics?.completed_decisions ?? 0} />
      </div>

      <DashboardSection
        icon={CalendarClock}
        title="الاجتماعات القادمة"
        count={d.upcoming_meetings?.length}
      >
        {d.upcoming_meetings?.length === 0 ? (
          <EmptyState text="لا توجد اجتماعات قادمة." />
        ) : (
          <ul className="space-y-2">
            {d.upcoming_meetings?.map((m) => (
              <li
                key={m.meeting_id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs"
              >
                <span className="font-medium">{m.title}</span>
                <span className="text-muted-foreground">{formatDateTime(m.scheduled_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection
        icon={AlertTriangle}
        title="موضوعات تتطلب إجراءً"
        count={d.topics_requiring_action?.length}
      >
        {d.topics_requiring_action?.length === 0 ? (
          <EmptyState text="لا توجد موضوعات تتطلب إجراءً." />
        ) : (
          <ul className="space-y-2">
            {d.topics_requiring_action?.map((t) => (
              <li
                key={t.topic_id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs"
              >
                <span className="font-medium">{t.title}</span>
                <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection icon={ListChecks} title="جاهزية جدول الأعمال">
        {d.agenda_readiness?.meetings_with_agenda?.length === 0 ? (
          <EmptyState text="لا توجد جداول أعمال." />
        ) : (
          <ul className="space-y-2">
            {d.agenda_readiness?.meetings_with_agenda?.map((m) => (
              <li
                key={m.meeting_id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs"
              >
                <span className="font-medium">{m.title}</span>
                <span className="text-muted-foreground">
                  {m.approved_items}/{m.total_items} معتمد ({Math.round(m.completion_rate * 100)}%)
                </span>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection icon={CheckCircle2} title="جاهزية النصاب">
        {d.quorum_readiness?.length === 0 ? (
          <EmptyState text="لا توجد اجتماعات تحتاج تقييم نصاب." />
        ) : (
          <ul className="space-y-2">
            {d.quorum_readiness?.map((q) => (
              <li
                key={q.meeting_id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs"
              >
                <span className="font-medium">{q.title}</span>
                <Badge
                  variant={q.quorum_met ? "secondary" : q.quorum_met === false ? "destructive" : "outline"}
                  className="text-[10px]"
                >
                  {q.quorum_met ? "نصاب مكتمل" : q.quorum_met === false ? "نصاب غير مكتمل" : "غير مُقيّم"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection
        icon={AlertTriangle}
        title="قرارات متأخرة"
        count={d.overdue_decisions?.overdue_decisions?.length}
      >
        {d.overdue_decisions?.overdue_decisions?.length === 0 ? (
          <EmptyState text="لا توجد قرارات متأخرة." />
        ) : (
          <ul className="space-y-2">
            {d.overdue_decisions?.overdue_decisions?.map((dec) => (
              <li
                key={dec.decision_id}
                className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs"
              >
                <span className="font-medium text-destructive">{dec.title}</span>
                <span className="text-destructive/80">{formatDate(dec.due_date)}</span>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection icon={Archive} title="حالة الأرشيف">
        <div className="flex items-center gap-2 text-xs">
          <Archive className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span>الاجتماعات المؤرشفة:</span>
          <span className="font-bold">{d.archive_status?.total_archived_meetings ?? 0}</span>
        </div>
      </DashboardSection>
    </div>
  );
}

function SecretaryDashboard({ data }: { data: unknown }) {
  const d = data as {
    topics_requiring_preparation?: Array<{ topic_id: string; title: string; status: string; submitted_at: string | null }>;
    attendance_tasks?: Array<{ meeting_id: string; title: string; scheduled_at: string; roll_status: string | null }>;
    minutes_drafts?: Array<{ meeting_id: string; title: string; scheduled_at: string; minutes_status: string; is_locked: boolean }>;
    decision_followups?: { summary?: Record<string, number>; decisions?: Array<{ decision_id: string; title: string; status: string; due_date: string | null }> };
  };

  return (
    <div className="space-y-5">
      <DashboardSection
        icon={ListChecks}
        title="موضوعات تحتاج إعداداً"
        count={d.topics_requiring_preparation?.length}
      >
        {d.topics_requiring_preparation?.length === 0 ? (
          <EmptyState text="لا توجد موضوعات تنتظر الإعداد." />
        ) : (
          <ul className="space-y-2">
            {d.topics_requiring_preparation?.map((t) => (
              <li
                key={t.topic_id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs"
              >
                <span className="font-medium">{t.title}</span>
                <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection
        icon={Users}
        title="مهام الحضور"
        count={d.attendance_tasks?.length}
      >
        {d.attendance_tasks?.length === 0 ? (
          <EmptyState text="لا توجد مهام حضور مطلوبة." />
        ) : (
          <ul className="space-y-2">
            {d.attendance_tasks?.map((m) => (
              <li
                key={m.meeting_id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs"
              >
                <span className="font-medium">{m.title}</span>
                <Badge variant={m.roll_status === "open" ? "secondary" : "outline"} className="text-[10px]">
                  {m.roll_status === "open" ? "قيد التسجيل" : "لم يبدأ"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection icon={FileText} title="مسودات المحاضر">
        {d.minutes_drafts?.length === 0 ? (
          <EmptyState text="لا توجد مسودات محاضر." />
        ) : (
          <ul className="space-y-2">
            {d.minutes_drafts?.map((m) => (
              <li
                key={m.meeting_id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs"
              >
                <span className="font-medium">{m.title}</span>
                <Badge variant={m.is_locked ? "secondary" : "outline"} className="text-[10px]">
                  {m.is_locked ? "مقفل" : "مسودة"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection icon={AlertTriangle} title="متابعة القرارات">
        {d.decision_followups?.decisions?.length === 0 ? (
          <EmptyState text="لا توجد قرارات تتطلب متابعة." />
        ) : (
          <ul className="space-y-2">
            {d.decision_followups?.decisions?.slice(0, 10).map((dec) => (
              <li
                key={dec.decision_id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs"
              >
                <span className="font-medium">{dec.title}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{formatDate(dec.due_date)}</span>
                  <Badge variant="outline" className="text-[10px]">{dec.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>
    </div>
  );
}

function MemberDashboard({ data }: { data: unknown }) {
  const d = data as {
    meetings?: Array<{ meeting_id: string; meeting_number: number; title: string; scheduled_at: string; status: string }>;
    topics?: Array<{ topic_id: string; title: string; status: string; submitted_at: string | null }>;
    votes_requiring_action?: Array<{ agenda_item_id: string; meeting_id: string; title: string; session_status: string }>;
    visible_minutes?: Array<{ meeting_id: string; title: string; scheduled_at: string; is_locked: boolean }>;
    visible_decisions?: Array<{ decision_id: string; title: string; status: string; due_date: string | null }>;
  };

  return (
    <div className="space-y-5">
      <DashboardSection icon={CalendarClock} title="الاجتماعات" count={d.meetings?.length}>
        {d.meetings?.length === 0 ? (
          <EmptyState text="لا توجد اجتماعات مرئية." />
        ) : (
          <ul className="space-y-2">
            {d.meetings?.slice(0, 5).map((m) => (
              <li
                key={m.meeting_id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs"
              >
                <span className="font-medium">{m.title}</span>
                <span className="text-muted-foreground">{formatDateTime(m.scheduled_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection icon={ListChecks} title="الموضوعات" count={d.topics?.length}>
        {d.topics?.length === 0 ? (
          <EmptyState text="لا توجد موضوعات مرئية." />
        ) : (
          <ul className="space-y-2">
            {d.topics?.slice(0, 5).map((t) => (
              <li
                key={t.topic_id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs"
              >
                <span className="font-medium">{t.title}</span>
                <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection icon={Vote} title="تصويتات تتطلب مشاركتك" count={d.votes_requiring_action?.length}>
        {d.votes_requiring_action?.length === 0 ? (
          <EmptyState text="لا توجد تصويتات تنتظر مشاركتك." />
        ) : (
          <ul className="space-y-2">
            {d.votes_requiring_action?.map((v) => (
              <li
                key={v.agenda_item_id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs"
              >
                <span className="font-medium">{v.title}</span>
                <Badge variant="secondary" className="text-[10px]">تصويت مفتوح</Badge>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection icon={FileText} title="محاضر مرئية" count={d.visible_minutes?.length}>
        {d.visible_minutes?.length === 0 ? (
          <EmptyState text="لا توجد محاضر مقفلة مرئية." />
        ) : (
          <ul className="space-y-2">
            {d.visible_minutes?.slice(0, 5).map((m) => (
              <li
                key={m.meeting_id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs"
              >
                <span className="font-medium">{m.title}</span>
                <Badge variant="secondary" className="text-[10px]">مقفل</Badge>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection icon={AlertTriangle} title="قرارات مرئية" count={d.visible_decisions?.length}>
        {d.visible_decisions?.length === 0 ? (
          <EmptyState text="لا توجد قرارات مرئية." />
        ) : (
          <ul className="space-y-2">
            {d.visible_decisions?.slice(0, 5).map((dec) => (
              <li
                key={dec.decision_id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs"
              >
                <span className="font-medium">{dec.title}</span>
                <Badge variant="outline" className="text-[10px]">{dec.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>
    </div>
  );
}

function AdminDashboard({ data }: { data: unknown }) {
  const d = data as {
    membership_count?: number;
    membership_by_role?: Record<string, number>;
    meeting_metrics?: { total_meetings?: number; archived_meetings?: number; total_decisions?: number; completed_decisions?: number };
    notification_volume?: number;
    unprocessed_outbox_count?: number;
    audit_event_count?: number;
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-amber-300/60 bg-amber-50/80 p-3 text-xs text-amber-900">
        لوحة إدارة تشغيلية/فنية فقط؛ لا تتيح اتخاذ إجراءات أكاديمية نيابة عن المجلس.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CountCard label="الأعضاء الفعّالين" value={d.membership_count ?? 0} />
        <CountCard label="إجمالي الإشعارات" value={d.notification_volume ?? 0} />
        <CountCard label="صندوق البريد غير المعالج" value={d.unprocessed_outbox_count ?? 0} variant="warning" />
        <CountCard label="أحداث التدقيق" value={d.audit_event_count ?? 0} />
      </div>

      <DashboardSection icon={Users} title="العضويات حسب الدور">
        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(d.membership_by_role ?? {}).map(([role, count]) => (
            <div key={role} className="rounded-md border border-border bg-muted/10 p-2 text-center text-xs">
              <div className="font-bold text-primary">{count}</div>
              <div className="text-muted-foreground">{role}</div>
            </div>
          ))}
        </div>
      </DashboardSection>

      <DashboardSection icon={BarChart3} title="مؤشرات الاجتماعات">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CountCard label="إجمالي الاجتماعات" value={d.meeting_metrics?.total_meetings ?? 0} />
          <CountCard label="المؤرشفة" value={d.meeting_metrics?.archived_meetings ?? 0} />
          <CountCard label="إجمالي القرارات" value={d.meeting_metrics?.total_decisions ?? 0} />
          <CountCard label="المنجزة" value={d.meeting_metrics?.completed_decisions ?? 0} />
        </div>
      </DashboardSection>
    </div>
  );
}

function DashboardSection({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof LayoutDashboard;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <SectionHeader icon={Icon} title={title} count={count} />
      {children}
    </section>
  );
}
