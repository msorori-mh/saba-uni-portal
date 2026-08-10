import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Coins, Loader2, ShieldAlert } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { Badge } from "@/components/ui/badge";
import { fetchFeeAssessmentBoard } from "@/lib/student-requests/fee-assessment-board.functions";

export const Route = createFileRoute("/staff/fee-assessment-board")({
  head: () => ({
    meta: [
      { title: "لوحة مهام تقييم الرسوم — مدير شؤون الطلاب" },
      {
        name: "description",
        content: "الطلبات المعلقة في خطوة تقييم الرسوم مع حالة كل طلب والخطوة التالية المقترحة.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FeeAssessmentBoardPage,
});

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar", {
    dateStyle: "medium",
    timeStyle: "short",
    calendar: "gregory",
    numberingSystem: "latn",
  }).format(d);
}

const SERVICE_LABEL: Record<string, string> = {
  enrollment_certificate: "شهادة قيد",
  enrollment_suspension: "إيقاف قيد",
  excused_absence: "غياب بعذر",
  department_transfer: "تحويل بين الأقسام",
  final_chance: "فرصة أخيرة",
  file_withdrawal: "سحب ملف",
};

function FeeAssessmentBoardPage() {
  const run = useServerFn(fetchFeeAssessmentBoard);
  const { data, isLoading } = useQuery({
    queryKey: ["fee-assessment-board"],
    queryFn: () => run(),
  });

  return (
    <PortalShell>
      <main className="container mx-auto px-4 py-6" dir="rtl">
        <Link
          to="/staff"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowRight className="h-4 w-4" />
          العودة للوحة الموظف
        </Link>

        <h1 className="mt-3 flex items-center gap-2 font-display text-2xl font-extrabold text-primary-deep">
          <Coins className="h-6 w-6 text-gold" />
          لوحة مهام تقييم الرسوم
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          مخصّصة لدور «مدير شؤون الطلاب»: الطلبات المتوقفة عند خطوة تقييم الرسوم، وحالة كل طلب،
          والخطوة التالية المقترحة.
        </p>

        {isLoading && (
          <div className="mt-8 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جارٍ التحميل…
          </div>
        )}

        {data && !data.available && (
          <div className="mt-6 flex items-start gap-2 rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>{data.messageAr}</span>
          </div>
        )}

        {data?.available && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryCard label="إجمالي المهام" value={data.summary.total} />
              <SummaryCard label="بانتظار التقييم" value={data.summary.awaitingAssessment} tone="warn" />
              <SummaryCard label="بانتظار السداد" value={data.summary.awaitingPayment} tone="warn" />
              <SummaryCard label="جاهزة للاعتماد" value={data.summary.readyToAdvance} tone="ok" />
            </div>

            {data.rows.length === 0 ? (
              <div className="mt-5 rounded-xl border-2 border-gold/30 bg-card p-6 text-sm text-muted-foreground">
                لا توجد طلبات معلّقة في خطوة تقييم الرسوم حالياً.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {data.rows.map((row) => (
                  <article
                    key={row.stepId}
                    className="rounded-xl border-2 border-gold/30 bg-card p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-primary">
                          {SERVICE_LABEL[row.requestType] ?? row.requestType}
                          <span className="mr-2 font-mono text-xs text-muted-foreground">
                            {row.requestNumber ?? "—"}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.studentNameAr ?? "طالب غير معروف"}
                          {row.academicNumber ? ` · ${row.academicNumber}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{row.stateLabelAr}</Badge>
                        <Badge variant="outline">حالة الطلب: {row.requestStatus}</Badge>
                      </div>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <Field label="دخلت الخطوة" value={formatDateTime(row.enteredAt)} />
                      <Field
                        label="مدة الانتظار"
                        value={row.waitingDays == null ? "—" : `${row.waitingDays} يوم`}
                      />
                      <Field
                        label="الرسوم المقيّمة"
                        value={
                          row.feeAmount == null
                            ? "لم تُقيَّم بعد"
                            : `${row.feeAmount} ${row.feeCurrency ?? ""}`.trim()
                        }
                      />
                      <Field
                        label="الخطوة التالية"
                        value={row.nextStepNameAr ?? row.nextStepKey ?? "—"}
                      />
                    </dl>

                    <p className="mt-3 rounded-lg bg-muted/50 p-3 text-xs text-foreground">
                      <span className="font-bold">الإجراء المقترح: </span>
                      {row.suggestedActionAr}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </PortalShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}) {
  const toneClass =
    tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : "text-primary";
  return (
    <div className="rounded-xl border-2 border-gold/30 bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-display text-2xl font-extrabold ${toneClass}`}>{value}</div>
    </div>
  );
}
