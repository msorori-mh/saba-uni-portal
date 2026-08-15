import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowRight, CalendarCheck, Save, Info } from "lucide-react";
import { toast } from "sonner";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  getSectionDeliveryPlan,
  recordSessionExecution,
  clearSessionExecution,
  LECTURE_EXECUTION_STATUSES,
  LECTURE_STATUS_LABELS,
  SECTION_STUDY_SYSTEM_LABELS,
  type DeliveryPlanSession,
  type LectureExecutionStatus,
  type LectureSessionStatus,
} from "@/lib/lecture-execution.functions";

export const Route = createFileRoute("/faculty-portal/lecture-execution/$sectionId")({
  component: FacultyLectureExecutionSection,
  head: () => ({
    meta: [
      { title: "تسجيل تنفيذ محاضرات المقرر | بوابة عضو هيئة التدريس" },
      {
        name: "description",
        content: "خطة المحاضرات المولّدة من توصيف المقرر المعتمد وتسجيل حالة تنفيذ كل محاضرة.",
      },
      { property: "og:title", content: "تسجيل تنفيذ محاضرات المقرر" },
      {
        property: "og:description",
        content: "خطة المحاضرات المولّدة من توصيف المقرر المعتمد وتسجيل حالة تنفيذ كل محاضرة.",
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

  const [selected, setSelected] = useState<number | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["delivery-plan", sectionId] });
    void queryClient.invalidateQueries({ queryKey: ["faculty", "lecture-execution", "sections"] });
  };

  const sessions = useMemo<DeliveryPlanSession[]>(() => data?.sessions ?? [], [data]);
  const current = sessions.find((s) => s.session_number === selected) ?? null;
  const executed = sessions.filter((s) => s.status === "executed").length;
  const compensated = sessions.filter((s) => s.status === "compensated").length;
  const postponed = sessions.filter(
    (s) => s.status === "postponed" || s.status === "hindered" || s.status === "cancelled",
  ).length;
  const studySystem = data?.course?.study_system;

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
                {data?.course?.section_code}
                {studySystem && ` • النظام: ${SECTION_STUDY_SYSTEM_LABELS[studySystem]}`}
                {data?.plan?.source === "syllabus" && data.plan.syllabus_version
                  ? ` • توصيف معتمد (إصدار ${data.plan.syllabus_version})`
                  : data?.plan
                    ? " • خطة سابقة (قبل اعتماد التوصيف)"
                    : ""}
              </p>
            </header>

            {data?.awaiting_syllabus || !data?.plan ? (
              <div className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
                لم يُعتمد توصيف هذا المقرر بعد، لذلك لم تُولَّد خطة المحاضرات. يتم اعتماد التوصيف
                من إدارة الشؤون الأكاديمية عبر مركز الاستيراد.
              </div>
            ) : (
              <>
                <section className="rounded-xl border-2 border-gold/30 bg-card p-4">
                  <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-bold text-primary">خطة المحاضرات المعتمدة</h2>
                    <span className="text-xs text-muted-foreground">
                      {data.plan.planned_session_count} محاضرة
                    </span>
                  </header>
                  <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-gold" aria-hidden />
                    <span>
                      عناوين المحاضرات ومفرداتها مصدرها توصيف المقرر المعتمد ولا يمكن تعديلها من
                      البوابة. دورك هو تسجيل حالة التنفيذ فقط.
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {sessions.map((s) => (
                      <li
                        key={s.plan_session_id}
                        className="grid gap-1 rounded-lg border p-3 sm:grid-cols-[3rem_1fr]"
                      >
                        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-sm font-bold text-primary">
                          {s.session_number}
                        </div>
                        <div className="text-sm">
                          <div className="font-medium text-primary">
                            {s.planned_title}
                            {s.week_number ? (
                              <span className="mr-2 text-xs text-muted-foreground">
                                (الأسبوع {s.week_number})
                              </span>
                            ) : null}
                          </div>
                          {s.planned_topics && (
                            <div className="text-xs text-muted-foreground">{s.planned_topics}</div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="rounded-xl border-2 border-gold/30 bg-card p-4">
                  <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-bold text-primary">تسجيل التنفيذ</h2>
                    <span className="text-xs text-muted-foreground">
                      المنفذ {executed} • المعوّض {compensated} • غير المنفذ {postponed} — من{" "}
                      {data.plan.planned_session_count} محاضرة مخططة
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
              </>
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

  const isFinalRecorded = session.status === "executed" || session.status === "compensated";
  const isMissedRecorded =
    session.status === "postponed" ||
    session.status === "hindered" ||
    session.status === "cancelled";
  const [compensationMode, setCompensationMode] = useState(false);

  const header = (
    <div className="text-sm font-bold text-primary">
      المحاضرة {session.session_number} — {session.planned_title}
    </div>
  );

  if (isFinalRecorded || (isMissedRecorded && !compensationMode)) {
    return (
      <div className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-4">
        {header}
        <p className="text-sm font-medium text-primary">
          {session.status === "executed"
            ? "تم تسجيل تنفيذ هذه المحاضرة، ولا يمكن تعديل السجل."
            : session.status === "compensated"
              ? "تم تسجيل تعويض هذه المحاضرة، ولا يمكن تعديل السجل."
              : `تم تسجيل الحالة: ${LECTURE_STATUS_LABELS[session.status as LectureExecutionStatus]} — السجل نهائي ولا يمكن تعديله.`}
        </p>
        <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          {session.execution_date && (
            <div>
              <dt className="inline">تاريخ التنفيذ: </dt>
              <dd className="inline font-medium text-foreground">{session.execution_date}</dd>
            </div>
          )}
          {session.compensation_date && (
            <div>
              <dt className="inline">تاريخ التعويض: </dt>
              <dd className="inline font-medium text-foreground">{session.compensation_date}</dd>
            </div>
          )}
          {session.reason && (
            <div className="sm:col-span-2">
              <dt className="inline">السبب: </dt>
              <dd className="inline font-medium text-foreground">{session.reason}</dd>
            </div>
          )}
        </dl>
        {isMissedRecorded && (
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              setStatus("compensated");
              setCompensationMode(true);
            }}
          >
            تسجيل محاضرة تعويضية
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-4">
      {header}


      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="status" className="text-xs">
            الحالة
          </Label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as LectureExecutionStatus)}
            disabled={compensationMode}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-70"
          >
            {(compensationMode
              ? (["compensated"] as LectureExecutionStatus[])
              : LECTURE_EXECUTION_STATUSES
            ).map((s) => (
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
          {compensationMode ? "حفظ التعويض" : "حفظ التسجيل"}
        </Button>
        {compensationMode && (
          <Button variant="ghost" onClick={() => setCompensationMode(false)}>
            إلغاء
          </Button>
        )}
      </div>
    </div>
  );
}
