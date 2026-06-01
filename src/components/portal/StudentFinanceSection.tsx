import { useQuery } from "@tanstack/react-query";
import { Wallet, Loader2, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as unknown as { from: (t: string) => any };

type FeeRow = {
  id: string; amount: number; status: string; notes: string | null;
  fee_type: { name_ar: string } | null;
  academic_year: { name: string } | null;
  semester: { name: string } | null;
  paid?: number;
};
type PaymentRow = {
  id: string; receipt_number: string; amount: number; payment_date: string;
  payment_method: string; notes: string | null;
  fee: { fee_type: { name_ar: string } | null } | null;
};

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: "غير مدفوع", cls: "bg-muted text-foreground" },
  partially_paid: { text: "مدفوع جزئياً", cls: "bg-amber-100 text-amber-800" },
  paid: { text: "مدفوع بالكامل", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { text: "ملغي", cls: "bg-rose-100 text-rose-800" },
};
const METHOD_LABEL: Record<string, string> = { cash: "نقداً", bank_transfer: "تحويل بنكي", other: "أخرى" };

export function StudentFinanceSection({ studentProfileId }: { studentProfileId: string }) {
  const { data: fees = [], isLoading: lf } = useQuery({
    queryKey: ["student-fees", studentProfileId],
    queryFn: async (): Promise<FeeRow[]> => {
      const { data, error } = await sb.from("student_fees")
        .select("id, amount, status, notes, fee_type:fee_types(name_ar), academic_year:academic_years(name), semester:semesters(name)")
        .eq("student_profile_id", studentProfileId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as FeeRow[];
      if (rows.length === 0) return rows;
      const { data: pays } = await sb.from("student_payments")
        .select("student_fee_id, amount").in("student_fee_id", rows.map((r) => r.id));
      const sum = new Map<string, number>();
      for (const p of (pays ?? []) as { student_fee_id: string; amount: number }[]) {
        sum.set(p.student_fee_id, (sum.get(p.student_fee_id) ?? 0) + Number(p.amount));
      }
      return rows.map((r) => ({ ...r, paid: sum.get(r.id) ?? 0 }));
    },
  });

  const { data: payments = [], isLoading: lp } = useQuery({
    queryKey: ["student-payments", studentProfileId],
    queryFn: async (): Promise<PaymentRow[]> => {
      const { data, error } = await sb.from("student_payments")
        .select("id, receipt_number, amount, payment_date, payment_method, notes, fee:student_fees!inner(student_profile_id, fee_type:fee_types(name_ar))")
        .eq("fee.student_profile_id", studentProfileId)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

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

  return (
    <div className="mt-6">
      <h2 className="font-display text-base font-bold text-primary mb-3 flex items-center gap-2">
        <Wallet className="h-4 w-4 text-gold" /> الحساب المالي
      </h2>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <SummaryCard label="إجمالي المستحق" value={totals.total} tone="default" />
        <SummaryCard label="المدفوع" value={totals.paid} tone="ok" />
        <SummaryCard label="المتبقي" value={totals.remaining} tone="warn" />
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-3 py-2 bg-muted/40 text-xs font-bold text-primary border-b">الرسوم</div>
        {lf ? (
          <div className="p-4 text-center"><Loader2 className="inline h-4 w-4 animate-spin" /></div>
        ) : fees.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">لا توجد رسوم مسجلة.</div>
        ) : (
          <div className="divide-y">
            {fees.map((f) => {
              const st = STATUS_LABEL[f.status] ?? { text: f.status, cls: "bg-muted" };
              const paid = Number(f.paid ?? 0);
              const remaining = Math.max(0, Number(f.amount) - paid);
              return (
                <div key={f.id} className="p-3 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-bold">{f.fee_type?.name_ar}</div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${st.cls}`}>{st.text}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{f.academic_year?.name} — {f.semester?.name}</div>
                  <div className="mt-2 flex items-center gap-3 font-mono">
                    <span>المستحق: <b>{Number(f.amount).toFixed(2)}</b></span>
                    <span className="text-emerald-700">المدفوع: <b>{paid.toFixed(2)}</b></span>
                    <span className="text-amber-700">المتبقي: <b>{remaining.toFixed(2)}</b></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card overflow-hidden mt-3">
        <div className="px-3 py-2 bg-muted/40 text-xs font-bold text-primary border-b flex items-center gap-1.5">
          <Receipt className="h-3.5 w-3.5" /> سندات الدفع
        </div>
        {lp ? (
          <div className="p-4 text-center"><Loader2 className="inline h-4 w-4 animate-spin" /></div>
        ) : payments.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">لا توجد دفعات.</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/20 text-muted-foreground">
              <tr>
                <th className="text-right p-2">رقم السند</th>
                <th className="text-right p-2">التاريخ</th>
                <th className="text-right p-2">نوع الرسوم</th>
                <th className="text-right p-2">المبلغ</th>
                <th className="text-right p-2">الطريقة</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="p-2 font-mono">{p.receipt_number}</td>
                  <td className="p-2">{p.payment_date}</td>
                  <td className="p-2">{p.fee?.fee_type?.name_ar ?? "—"}</td>
                  <td className="p-2 font-mono font-bold">{Number(p.amount).toFixed(2)}</td>
                  <td className="p-2">{METHOD_LABEL[p.payment_method] ?? p.payment_method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "default" | "ok" | "warn" }) {
  const cls = tone === "ok" ? "border-emerald-300 bg-emerald-50" : tone === "warn" ? "border-amber-300 bg-amber-50" : "bg-card";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="text-[10px] font-bold text-muted-foreground">{label}</div>
      <div className="font-mono font-extrabold text-base mt-1">{value.toFixed(2)}</div>
    </div>
  );
}
