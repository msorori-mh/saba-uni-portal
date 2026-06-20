import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Receipt, FileText, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/mobile/student/finance")({
  head: () => ({ meta: [{ title: "الرسوم والمدفوعات" }] }),
  component: MobileStudentFinance,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as unknown as { from: (t: string) => any; auth: any };

type FeeRow = {
  id: string;
  amount: number;
  status: string;
  fee_type: { name_ar: string } | null;
  academic_year: { name: string } | null;
  semester: { name: string } | null;
  paid: number;
};

type PaymentRow = {
  id: string;
  receipt_number: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  fee: { fee_type: { name_ar: string } | null } | null;
};

type ReceiptRow = {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  receipt_reference: string | null;
  status: string;
  rejection_reason: string | null;
  student_fee: { fee_type: { name_ar: string } | null } | null;
};

type FinanceData = {
  fees: FeeRow[];
  payments: PaymentRow[];
  receipts: ReceiptRow[];
};

const FEE_STATUS: Record<string, { text: string; cls: string }> = {
  pending: { text: "غير مدفوع", cls: "bg-muted text-foreground" },
  partially_paid: { text: "مدفوع جزئياً", cls: "bg-amber-100 text-amber-800" },
  paid: { text: "مدفوع بالكامل", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { text: "ملغي", cls: "bg-rose-100 text-rose-800" },
};

const REC_STATUS: Record<string, { text: string; cls: string }> = {
  submitted: { text: "قيد الإرسال", cls: "bg-sky-100 text-sky-800" },
  under_review: { text: "قيد المراجعة", cls: "bg-amber-100 text-amber-800" },
  approved: { text: "معتمد", cls: "bg-emerald-100 text-emerald-800" },
  rejected: { text: "مرفوض", cls: "bg-rose-100 text-rose-800" },
};

const METHOD_LABEL: Record<string, string> = {
  cash: "نقداً",
  bank_transfer: "تحويل بنكي",
  other: "أخرى",
};

async function fetchFinance(): Promise<FinanceData> {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) throw new Error("غير مسجل الدخول");
  const { data: profile, error: pErr } = await sb
    .from("student_profiles")
    .select("id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile?.id) return { fees: [], payments: [], receipts: [] };

  const spId = profile.id as string;

  const [feesRes, paysRes, receiptsRes] = await Promise.all([
    sb
      .from("student_fees")
      .select("id, amount, status, fee_type:fee_types(name_ar), academic_year:academic_years(name), semester:semesters(name)")
      .eq("student_profile_id", spId)
      .order("created_at", { ascending: false }),
    sb
      .from("student_payments")
      .select("id, receipt_number, amount, payment_date, payment_method, fee:student_fees!inner(student_profile_id, fee_type:fee_types(name_ar))")
      .eq("fee.student_profile_id", spId)
      .order("payment_date", { ascending: false }),
    sb
      .from("payment_receipts")
      .select("id, amount, payment_date, payment_method, receipt_reference, status, rejection_reason, student_fee:student_fees(fee_type:fee_types(name_ar))")
      .eq("student_profile_id", spId)
      .order("created_at", { ascending: false }),
  ]);
  if (feesRes.error) throw feesRes.error;
  if (paysRes.error) throw paysRes.error;
  if (receiptsRes.error) throw receiptsRes.error;

  const feeRows = (feesRes.data ?? []) as Omit<FeeRow, "paid">[];
  const paySum = new Map<string, number>();
  for (const p of (paysRes.data ?? []) as Array<{ id: string; amount: number } & Record<string, unknown>>) {
    // student_payments rows don't include student_fee_id in our select; fetch separately for sums
  }

  // Get per-fee paid amount
  let fees: FeeRow[] = feeRows.map((r) => ({ ...r, paid: 0 }));
  if (feeRows.length > 0) {
    const { data: sums } = await sb
      .from("student_payments")
      .select("student_fee_id, amount")
      .in("student_fee_id", feeRows.map((r) => r.id));
    const m = new Map<string, number>();
    for (const s of (sums ?? []) as { student_fee_id: string; amount: number }[]) {
      m.set(s.student_fee_id, (m.get(s.student_fee_id) ?? 0) + Number(s.amount));
    }
    fees = feeRows.map((r) => ({ ...r, paid: m.get(r.id) ?? 0 }));
  }

  return {
    fees,
    payments: (paysRes.data ?? []) as PaymentRow[],
    receipts: (receiptsRes.data ?? []) as ReceiptRow[],
  };
}

function MobileStudentFinance() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["mobile-student", "finance"],
    queryFn: fetchFinance,
    staleTime: 90_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <FinanceSkeleton />;

  if (isError) {
    return (
      <div className="px-4 py-6">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
          <AlertCircle className="h-6 w-6 text-destructive mx-auto mb-2" />
          <div className="text-sm font-bold text-destructive mb-1">تعذر تحميل البيانات المالية</div>
          <div className="text-[11px] text-muted-foreground mb-3">
            {error instanceof Error ? error.message : "حدث خطأ غير متوقع"}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold disabled:opacity-60"
          >
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  const fees = data?.fees ?? [];
  const payments = data?.payments ?? [];
  const receipts = data?.receipts ?? [];

  const totals = fees.reduce(
    (acc, f) => {
      if (f.status === "cancelled") return acc;
      const a = Number(f.amount);
      const p = Number(f.paid ?? 0);
      acc.total += a;
      acc.paid += p;
      acc.remaining += Math.max(0, a - p);
      return acc;
    },
    { total: 0, paid: 0, remaining: 0 }
  );

  const empty = fees.length === 0 && payments.length === 0 && receipts.length === 0;

  if (empty) {
    return (
      <div className="px-4 py-6">
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
          <Wallet className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
          <div className="text-sm font-bold text-primary">لا توجد رسوم أو مدفوعات حالياً.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 space-y-5" dir="rtl">
      <header>
        <h1 className="font-display text-lg font-extrabold text-primary flex items-center gap-2">
          <Wallet className="h-5 w-5 text-gold" /> الرسوم والمدفوعات
        </h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">عرض فقط — لا يمكن إجراء عمليات دفع من هنا.</p>
      </header>

      {/* Summary */}
      <section className="grid grid-cols-3 gap-2">
        <SummaryCard label="إجمالي المستحق" value={totals.total} tone="default" />
        <SummaryCard label="المدفوع" value={totals.paid} tone="ok" />
        <SummaryCard label="المتبقي" value={totals.remaining} tone="warn" />
      </section>

      {/* Fees */}
      <section>
        <SectionTitle icon={<Wallet className="h-3.5 w-3.5" />} title="الرسوم" />
        {fees.length === 0 ? (
          <EmptyMini text="لا توجد رسوم مسجلة." />
        ) : (
          <div className="space-y-2">
            {fees.map((f) => {
              const st = FEE_STATUS[f.status] ?? { text: f.status, cls: "bg-muted" };
              const paid = Number(f.paid ?? 0);
              const remaining = Math.max(0, Number(f.amount) - paid);
              return (
                <div key={f.id} className="rounded-xl border bg-card p-3 shadow-card">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-bold text-sm text-primary">{f.fee_type?.name_ar ?? "—"}</div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${st.cls}`}>{st.text}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {f.academic_year?.name ?? "—"} {f.semester?.name ? `— ${f.semester.name}` : ""}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11px]">
                    <Mini label="المستحق" value={Number(f.amount)} />
                    <Mini label="المدفوع" value={paid} tone="ok" />
                    <Mini label="المتبقي" value={remaining} tone="warn" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Payments */}
      <section>
        <SectionTitle icon={<Receipt className="h-3.5 w-3.5" />} title="سندات الدفع المعتمدة" />
        {payments.length === 0 ? (
          <EmptyMini text="لا توجد دفعات مسجلة." />
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="rounded-xl border bg-card p-3 shadow-card">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-bold text-[13px] text-primary">{p.fee?.fee_type?.name_ar ?? "دفعة"}</div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    معتمد
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground font-mono">
                  سند: <b dir="ltr">{p.receipt_number}</b> • {p.payment_date} •{" "}
                  {METHOD_LABEL[p.payment_method] ?? p.payment_method}
                </div>
                <div className="mt-1 font-mono text-sm font-extrabold text-primary">
                  {Number(p.amount).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Uploaded receipts */}
      <section>
        <SectionTitle icon={<FileText className="h-3.5 w-3.5" />} title="السندات المرفوعة" />
        {receipts.length === 0 ? (
          <EmptyMini text="لا توجد سندات مرفوعة." />
        ) : (
          <div className="space-y-2">
            {receipts.map((r) => {
              const st = REC_STATUS[r.status] ?? { text: r.status, cls: "bg-muted" };
              return (
                <div key={r.id} className="rounded-xl border bg-card p-3 shadow-card">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-bold text-[13px] text-primary">
                      {r.student_fee?.fee_type?.name_ar ?? "—"}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${st.cls}`}>{st.text}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground font-mono">
                    {r.payment_date} • {METHOD_LABEL[r.payment_method] ?? r.payment_method}
                    {r.receipt_reference ? ` • مرجع: ${r.receipt_reference}` : ""}
                  </div>
                  <div className="mt-1 font-mono text-sm font-extrabold text-primary">
                    {Number(r.amount).toFixed(2)}
                  </div>
                  {r.status === "rejected" && r.rejection_reason && (
                    <div className="mt-1 text-[11px] text-rose-700">سبب الرفض: {r.rejection_reason}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "default" | "ok" | "warn" }) {
  const cls =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-border bg-card text-primary";
  return (
    <div className={`rounded-xl border p-2.5 text-center ${cls}`}>
      <div className="text-[10px] font-bold opacity-80">{label}</div>
      <div className="mt-1 font-mono font-extrabold text-sm">{value.toFixed(2)}</div>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  const color = tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-primary";
  return (
    <div className="rounded-md bg-muted/40 p-1.5 text-center">
      <div className="text-[9px] text-muted-foreground font-sans">{label}</div>
      <div className={`font-bold ${color}`}>{value.toFixed(2)}</div>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="font-display text-sm font-extrabold text-primary mb-2 flex items-center gap-1.5">
      {icon} {title}
    </h2>
  );
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-[11px] text-muted-foreground">
      {text}
    </div>
  );
}

function FinanceSkeleton() {
  return (
    <div className="px-4 py-5 space-y-4" dir="rtl">
      <div className="h-6 w-40 bg-muted rounded animate-pulse" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
      {[0, 1].map((s) => (
        <div key={s} className="space-y-2">
          <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          {[0, 1].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ))}
    </div>
  );
}
