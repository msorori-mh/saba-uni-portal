import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowRight, CalendarCheck, Save, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  getSectionDeliveryPlan,
  saveDeliveryPlan,
  publishDeliveryPlan,
  recordSessionExecution,
  clearSessionExecution,
  LECTURE_EXECUTION_STATUSES,
  LECTURE_STATUS_LABELS,
  type DeliveryPlanSession,
  type LectureExecutionStatus,
  type LectureSessionStatus,
} from "@/lib/lecture-execution.functions";

export const Route = createFileRoute("/faculty-portal/lecture-execution/$sectionId")({
  component: FacultyLectureExecutionSection,
  head: () => ({
    meta: [
      { title: "خطة وتنفيذ محاضرات المقرر | بوابة عضو هيئة التدريس" },
      {
        name: "description",
        content: "تحديد عناوين المحاضرات المخططة مسبقاً وتسجيل حالة تنفيذ كل محاضرة.",
      },
      { property: "og:title", content: "خطة وتنفيذ محاضرات المقرر" },
      {
        property: "og:description",
        content: "تحديد عناوين المحاضرات المخططة مسبقاً وتسجيل حالة تنفيذ كل محاضرة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_STYLES: Record<LectureSessionStatus, string> = {
  not_recorded: "border-border bg-muted/40 text-muted-foreground",
  executed: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700",
  compensated: "border-sky-500/50 bg-sky-500/10 text-sky-700",
  postponed: "border-amber-500/50 bg-amber-500/10 text-amber-700",
  hindered: "border-destructive/50 bg-destructive/10 text-destructive",
  cancelled: "border-destructive/40 bg-destructive/5 text-destructive",
};

const REASON_REQUIRED: LectureExecutionStatus[] = ["hindered", "postponed", "cancelled"];

function FacultyLectureExecutionSection() {
  const { sectionId } = Route.useParams();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["delivery-plan", sectionId],
    queryFn: () => getSectionDeliveryPlan({ data: { sectionId } }),
  });

  const [count, setCount] = useState<string>("14");
  const [titles, setTitles] = useState<Record<number, { title: string; topics: string }>>({});
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (!data) return;
    if (data.plan) setCount(String(data.plan.planned_session_count));
    const next: Record<number, { title: string; topics: string }> = {};
    for (const s of data.sessions) {
      next[s.session_number] = { title: s.planned_title, topics: s.planned_topics ?? "" };
    }
    setTitles(next);
  }, [data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["delivery-plan", sectionId] });
    void queryClient.invalidateQueries({ queryKey: ["faculty", "lecture-execution", "sections"] });
  };

  const savePlan = useMutation({
    mutationFn: () =>
      saveDeliveryPlan({
        data: {
          sectionId,
          plannedSessionCount: Number(count),
          sessions: Object.entries(titles).map(([number, value]) => ({
            session_number: Number(number),
            planned_title: value.title.trim() || `محاضرة ${number}`,
            planned_topics: value.topics.trim() || null,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ خطة المحاضرات");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publish = useMutation({
    mutationFn: (planId: string) => publishDeliveryPlan({ data: { planId } }),
    onSuccess: () => {
      toast.success("تم اعتماد خطة المحاضرات");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sessions = useMemo<DeliveryPlanSession[]>(() => data?.sessions ?? [], [data]);
  const current = sessions.find((s) => s.session_number === selected) ?? null;
  const executed = sessions.filter(
    (s) => s.status === "executed" || s.status === "compensated",
  ).length;

  return (
    <FacultyPortalShell
      title="بوابة عضو هيئة التدريس"
      breadcrumbs={[{ label: "متابعة تنفيذ المحاضرات" }]}
    >
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-4">
          <Link
            to="/faculty-portal/lecture-execution"
            className="text-sm text-primary hover:text-gold inline-flex items-center gap-1"
          >
            <ArrowRight className="h-4 w-4" /> العودة
          </Link>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-destructive">
            {(error as Error).message}
          </div>
        ) : (
          <div className="space-y-6">
            <header>
              <h1 className="font-display text-xl font-extrabold text-primary flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-gold" aria-hidden />
                {data?.course?.course_name_ar}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-mono">{data?.course?.course_code}</span> • المجموعة{" "}
                {data?.course?.section_code} • حالة الخطة:{" "}
                {data?.plan?.status === "published" ? "معتمدة" : data?.plan ? "مسودة" : "غير موجودة"}
              </p>
            </header>

            {/* خطة المحاضرات المخططة مسبقاً */}
            <section className="rounded-xl border-2 border-gold/30 bg-card p-4">
              <h2 className="font-bold text-primary mb-3">خطة المحاضرات (تُحدَّد قبل بدء الفصل)</h2>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-40">
                  <Label htmlFor="count" className="text-xs">
                    عدد المحاضرات المخططة
                  </Label>
                  <Input
                    id="count"
                    type="number"
                    min={1}
                    max={60}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                  />
                </div>
                <Button
                  onClick={() => savePlan.mutate()}
                  disabled={savePlan.isPending}
                  className="gap-2"
                >
                  {savePlan.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  حفظ الخطة
                </Button>
                {data?.plan && data.plan.status !== "published" && (
                  <Button
                    variant="secondary"
                    className="gap-2"
                    disabled={publish.isPending}
                    onClick={() => publish.mutate(data.plan!.plan_id)}
                  >
                    <CheckCircle2 className="h-4 w-4" /> اعتماد الخطة
                  </Button>
                )}
              </div>

              {sessions.length > 0 && (
                <div className="mt-4 space-y-2">
                  {sessions.map((s) => (
                    <div
                      key={s.plan_session_id}
                      className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[3rem_1fr_1fr]"
                    >
                      <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-sm font-bold text-primary">
                        {s.session_number}
                      </div>
                      <Input
                        aria-label={`عنوان المحاضرة ${s.session_number}`}
                        placeholder="عنوان المحاضرة المخطط"
                        value={titles[s.session_number]?.title ?? ""}
                        onChange={(e) =>
                          setTitles((prev) => ({
                            ...prev,
                            [s.session_number]: {
                              title: e.target.value,
                              topics: prev[s.session_number]?.topics ?? "",
                            },
                          }))
                        }
                      />
                      <Input
                        aria-label={`مواضيع المحاضرة ${s.session_number}`}
                        placeholder="مفردات/مواضيع (اختياري)"
                        value={titles[s.session_number]?.topics ?? ""}
                        onChange={(e) =>
                          setTitles((prev) => ({
                            ...prev,
                            [s.session_number]: {
                              title: prev[s.session_number]?.title ?? "",
                              topics: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* تسجيل التنفيذ */}
            {data?.plan?.status === "published" && (
              <section className="rounded-xl border-2 border-gold/30 bg-card p-4">
                <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-bold text-primary">تسجيل التنفيذ</h2>
                  <span className="text-xs text-muted-foreground">
                    المنفذ {executed} من {data.plan.planned_session_count}
                  </span>
                </header>
                <div className="flex flex-wrap gap-2">
                  {sessions.map((s) => (
                    <button
                      key={s.plan_session_id}
                      type="button"
                      onClick={() =>
                        setSelected(s.session_number === selected ? null : s.session_number)
                      }
                      aria-label={`المحاضرة ${s.session_number} — ${LECTURE_STATUS_LABELS[s.status]}`}
                      className={cn(
                        "h-10 w-10 rounded-lg border-2 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        STATUS_STYLES[s.status],
                        selected === s.session_number && "ring-2 ring-gold",
                      )}
                    >
                      {s.session_number}
                    </button>
                  ))}
                </div>

                {current && (
                  <ExecutionForm
                    key={current.plan_session_id}
                    session={current}
                    onSaved={invalidate}
                  />
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </FacultyPortalShell>
  );
}

function ExecutionForm({
  session,
  onSaved,
}: {
  session: DeliveryPlanSession;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<LectureExecutionStatus>(
    session.status === "not_recorded" ? "executed" : (session.status as LectureExecutionStatus),
  );
  const [executionDate, setExecutionDate] = useState(session.execution_date ?? "");
  const [compensationDate, setCompensationDate] = useState(session.compensation_date ?? "");
  const [reason, setReason] = useState(session.reason ?? "");
  const [notes, setNotes] = useState(session.notes ?? "");

  const save = useMutation({
    mutationFn: () =>
      recordSessionExecution({
        data: {
          planSessionId: session.plan_session_id,
          status,
          executionDate: executionDate || null,
          compensationDate: compensationDate || null,
          reason: reason || null,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("تم تسجيل حالة المحاضرة");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: () => clearSessionExecution({ data: { planSessionId: session.plan_session_id } }),
    onSuccess: () => {
      toast.success("تم مسح التسجيل");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const needsReason = REASON_REQUIRED.includes(status);
  const needsExecutionDate = status === "executed" || status === "compensated";

  return (
    <div className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="text-sm font-bold text-primary">
        المحاضرة {session.session_number} — {session.planned_title}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="status" className="text-xs">
            الحالة
          </Label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as LectureExecutionStatus)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {LECTURE_EXECUTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LECTURE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {needsExecutionDate && (
          <div>
            <Label htmlFor="exec-date" className="text-xs">
              تاريخ التنفيذ
            </Label>
            <Input
              id="exec-date"
              type="date"
              value={executionDate}
              onChange={(e) => setExecutionDate(e.target.value)}
            />
          </div>
        )}

        {status === "compensated" && (
          <div>
            <Label htmlFor="comp-date" className="text-xs">
              تاريخ التعويض
            </Label>
            <Input
              id="comp-date"
              type="date"
              value={compensationDate}
              onChange={(e) => setCompensationDate(e.target.value)}
            />
          </div>
        )}
      </div>

      {needsReason && (
        <div>
          <Label htmlFor="reason" className="text-xs">
            السبب (إلزامي عند عدم التنفيذ)
          </Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
        </div>
      )}

      <div>
        <Label htmlFor="notes" className="text-xs">
          ملاحظات داخلية (لا تظهر للطالب)
        </Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      <div className="flex gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          حفظ التسجيل
        </Button>
        {session.status !== "not_recorded" && (
          <Button variant="ghost" onClick={() => clear.mutate()} disabled={clear.isPending}>
            مسح التسجيل
          </Button>
        )}
      </div>
    </div>
  );
}
