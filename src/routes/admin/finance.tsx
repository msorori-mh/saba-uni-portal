import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Wallet, Plus, X, Receipt, Tag, Users, Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as unknown as { from: (t: string) => any };

export const Route = createFileRoute("/admin/finance")({
  component: AdminFinancePage,
});

type FeeType = { id: string; code: string; name_ar: string; description_ar: string | null; amount: number; is_active: boolean };
type Student = { id: string; academic_number: string; full_name_ar: string; program_id: string | null };
type Year = { id: string; name: string; is_current: boolean };
type Sem = { id: string; name: string; academic_year_id: string; is_current: boolean };
type Program = { id: string; name_ar: string };
type StudentFee = {
  id: string; amount: number; status: string; notes: string | null;
  student_profile_id: string; fee_type_id: string; academic_year_id: string; semester_id: string;
  fee_type: { name_ar: string; code: string } | null;
  student: { academic_number: string; full_name_ar: string; program_id: string | null } | null;
  academic_year: { name: string } | null;
  semester: { name: string } | null;
  paid?: number;
};
type Payment = {
  id: string; student_fee_id: string; receipt_number: string;
  amount: number; payment_date: string; payment_method: string; notes: string | null;
  fee?: { amount: number; student: { academic_number: string; full_name_ar: string } | null; fee_type: { name_ar: string } | null } | null;
};

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending: { text: "غير مدفوع", cls: "bg-muted text-foreground" },
  partially_paid: { text: "مدفوع جزئياً", cls: "bg-amber-100 text-amber-800" },
  paid: { text: "مدفوع بالكامل", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { text: "ملغي", cls: "bg-rose-100 text-rose-800" },
};
const METHOD_LABEL: Record<string, string> = { cash: "نقداً", bank_transfer: "تحويل بنكي", other: "أخرى" };

function AdminFinancePage() {
  const [tab, setTab] = useState<"types" | "fees" | "payments" | "discounts">("types");

  return (
    <div dir="rtl" className="p-4 lg:p-8 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5 text-gold" />
        <h1 className="font-display text-xl font-extrabold text-primary">الشؤون المالية</h1>
      </div>

      <div className="inline-flex gap-1 rounded-lg bg-muted p-1 flex-wrap">
        <TabButton active={tab === "types"} onClick={() => setTab("types")} icon={Tag}>أنواع الرسوم</TabButton>
        <TabButton active={tab === "fees"} onClick={() => setTab("fees")} icon={Users}>رسوم الطلاب</TabButton>
        <TabButton active={tab === "payments"} onClick={() => setTab("payments")} icon={Receipt}>المدفوعات</TabButton>
        <TabButton active={tab === "discounts"} onClick={() => setTab("discounts")} icon={Percent}>الخصومات والإعفاءات</TabButton>
      </div>

      {tab === "types" && <FeeTypesTab />}
      {tab === "fees" && <StudentFeesTab />}
      {tab === "payments" && <PaymentsTab />}
      {tab === "discounts" && <DiscountsTab />}
    </div>
  );
}

function TabButton({ active, onClick, children, icon: Icon }: { active: boolean; onClick: () => void; children: React.ReactNode; icon: typeof Tag }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold transition ${active ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-primary"}`}
    >
      <Icon className="h-4 w-4" /> {children}
    </button>
  );
}

// ===================== Fee Types =====================
function FeeTypesTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<FeeType | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["admin-fee-types"],
    queryFn: async (): Promise<FeeType[]> => {
      const { data, error } = await sb.from("fee_types").select("*").order("code");
      if (error) throw error;
      return data ?? [];
    },
  });

  const remove = async (id: string) => {
    if (!confirm("حذف نوع الرسوم؟")) return;
    const { error } = await sb.from("fee_types").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["admin-fee-types"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-xs font-bold">
          <Plus className="h-3.5 w-3.5" /> نوع رسوم جديد
        </button>
      </div>
      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden divide-y">
          {types.map((t) => (
            <div key={t.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-bold text-sm text-primary">{t.name_ar}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{t.code}</span>
                  {!t.is_active && <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">معطّل</span>}
                </div>
                {t.description_ar && <p className="text-xs text-muted-foreground mt-0.5">{t.description_ar}</p>}
                <p className="text-xs mt-1 font-mono">المبلغ الافتراضي: <b>{Number(t.amount).toFixed(2)}</b></p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(t)} className="text-xs px-2 py-1 rounded border hover:bg-muted">تعديل</button>
                <button onClick={() => remove(t.id)} className="text-xs px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50">حذف</button>
              </div>
            </div>
          ))}
          {types.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground">لا توجد أنواع رسوم بعد.</div>}
        </div>
      )}

      {(creating || editing) && (
        <FeeTypeModal
          value={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["admin-fee-types"] }); setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function FeeTypeModal({ value, onClose, onSaved }: { value: FeeType | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name_ar ?? "");
  const [desc, setDesc] = useState(value?.description_ar ?? "");
  const [amount, setAmount] = useState(String(value?.amount ?? 0));
  const [active, setActive] = useState(value?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!code.trim() || !name.trim()) return toast.error("الرمز والاسم مطلوبان");
    setSaving(true);
    const payload = { code: code.trim(), name_ar: name.trim(), description_ar: desc || null, amount: Number(amount) || 0, is_active: active };
    const q = value ? sb.from("fee_types").update(payload).eq("id", value.id) : sb.from("fee_types").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    onSaved();
  };

  return (
    <ModalShell title={value ? "تعديل نوع رسوم" : "نوع رسوم جديد"} onClose={onClose}>
      <Field label="الرمز (Code)"><input value={code} onChange={(e) => setCode(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm font-mono" /></Field>
      <Field label="الاسم بالعربية"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm" /></Field>
      <Field label="الوصف"><textarea value={desc ?? ""} onChange={(e) => setDesc(e.target.value)} rows={2} className="w-full border rounded-md px-2 py-1.5 text-sm" /></Field>
      <Field label="المبلغ الافتراضي"><input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm font-mono" /></Field>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> مفعّل
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-3 py-1.5 rounded border text-xs">إلغاء</button>
        <button onClick={submit} disabled={saving} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50">
          {saving ? "جاري الحفظ..." : "حفظ"}
        </button>
      </div>
    </ModalShell>
  );
}

// ===================== Student Fees =====================
function StudentFeesTab() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [filterYear, setFilterYear] = useState<string>("");
  const [filterSem, setFilterSem] = useState<string>("");
  const [filterProgram, setFilterProgram] = useState<string>("");

  const { data: years = [] } = useQuery({
    queryKey: ["years"],
    queryFn: async (): Promise<Year[]> => (await sb.from("academic_years").select("id, name, is_current").order("name", { ascending: false })).data ?? [],
  });
  const { data: semesters = [] } = useQuery({
    queryKey: ["semesters"],
    queryFn: async (): Promise<Sem[]> => (await sb.from("semesters").select("id, name, academic_year_id, is_current")).data ?? [],
  });
  const { data: programs = [] } = useQuery({
    queryKey: ["programs"],
    queryFn: async (): Promise<Program[]> => (await sb.from("programs").select("id, name_ar").eq("is_active", true)).data ?? [],
  });

  const { data: fees = [], isLoading } = useQuery({
    queryKey: ["admin-student-fees", filterYear, filterSem, filterProgram],
    queryFn: async (): Promise<StudentFee[]> => {
      let q = sb.from("student_fees").select(
        "id, amount, status, notes, student_profile_id, fee_type_id, academic_year_id, semester_id, fee_type:fee_types(name_ar, code), student:student_profiles(academic_number, full_name_ar, program_id), academic_year:academic_years(name), semester:semesters(name)"
      ).order("created_at", { ascending: false });
      if (filterYear) q = q.eq("academic_year_id", filterYear);
      if (filterSem) q = q.eq("semester_id", filterSem);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as StudentFee[];
      if (filterProgram) rows = rows.filter((r) => r.student?.program_id === filterProgram);
      // load payments to compute paid
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const { data: pays } = await sb.from("student_payments").select("student_fee_id, amount").in("student_fee_id", ids);
        const sum = new Map<string, number>();
        for (const p of (pays ?? []) as { student_fee_id: string; amount: number }[]) {
          sum.set(p.student_fee_id, (sum.get(p.student_fee_id) ?? 0) + Number(p.amount));
        }
        rows = rows.map((r) => ({ ...r, paid: sum.get(r.id) ?? 0 }));
      }
      return rows;
    },
  });

  const cancelFee = async (id: string) => {
    if (!confirm("إلغاء هذه الرسوم؟")) return;
    const { error } = await sb.from("student_fees").update({ status: "cancelled" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الإلغاء");
    qc.invalidateQueries({ queryKey: ["admin-student-fees"] });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="border rounded-md px-2 py-1.5 text-xs">
          <option value="">كل السنوات</option>
          {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </select>
        <select value={filterSem} onChange={(e) => setFilterSem(e.target.value)} className="border rounded-md px-2 py-1.5 text-xs">
          <option value="">كل الفصول</option>
          {semesters.filter((s) => !filterYear || s.academic_year_id === filterYear).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterProgram} onChange={(e) => setFilterProgram(e.target.value)} className="border rounded-md px-2 py-1.5 text-xs">
          <option value="">كل البرامج</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
        </select>
        <div className="ms-auto">
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-xs font-bold">
            <Plus className="h-3.5 w-3.5" /> إضافة رسوم لطالب
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-right p-2">الطالب</th>
                <th className="text-right p-2">نوع الرسوم</th>
                <th className="text-right p-2">السنة/الفصل</th>
                <th className="text-right p-2">المبلغ</th>
                <th className="text-right p-2">المدفوع</th>
                <th className="text-right p-2">المتبقي</th>
                <th className="text-right p-2">الحالة</th>
                <th className="text-right p-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {fees.map((f) => {
                const st = STATUS_LABEL[f.status] ?? { text: f.status, cls: "bg-muted" };
                const paid = f.paid ?? 0;
                const remaining = Math.max(0, Number(f.amount) - paid);
                return (
                  <tr key={f.id}>
                    <td className="p-2">
                      <div className="font-mono text-[11px]">{f.student?.academic_number}</div>
                      <div className="font-semibold">{f.student?.full_name_ar}</div>
                    </td>
                    <td className="p-2">{f.fee_type?.name_ar}</td>
                    <td className="p-2">{f.academic_year?.name} - {f.semester?.name}</td>
                    <td className="p-2 font-mono">{Number(f.amount).toFixed(2)}</td>
                    <td className="p-2 font-mono">{paid.toFixed(2)}</td>
                    <td className="p-2 font-mono">{remaining.toFixed(2)}</td>
                    <td className="p-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded ${st.cls}`}>{st.text}</span></td>
                    <td className="p-2">
                      {f.status !== "cancelled" && f.status !== "paid" && (
                        <button onClick={() => cancelFee(f.id)} className="text-[10px] px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50">إلغاء</button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {fees.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">لا توجد رسوم.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {creating && <StudentFeeModal onClose={() => setCreating(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["admin-student-fees"] }); setCreating(false); }} />}
    </div>
  );
}

function StudentFeeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [studentSearch, setStudentSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [feeTypeId, setFeeTypeId] = useState("");
  const [yearId, setYearId] = useState("");
  const [semId, setSemId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: students = [] } = useQuery({
    queryKey: ["student-search", studentSearch],
    queryFn: async (): Promise<Student[]> => {
      if (studentSearch.trim().length < 2) return [];
      const { data } = await sb.from("student_profiles")
        .select("id, academic_number, full_name_ar, program_id")
        .or(`academic_number.ilike.%${studentSearch}%,full_name_ar.ilike.%${studentSearch}%`)
        .limit(10);
      return data ?? [];
    },
  });
  const { data: types = [] } = useQuery({
    queryKey: ["fee-types-active"],
    queryFn: async (): Promise<FeeType[]> => (await sb.from("fee_types").select("*").eq("is_active", true).order("name_ar")).data ?? [],
  });
  const { data: years = [] } = useQuery({
    queryKey: ["years-current"],
    queryFn: async (): Promise<Year[]> => (await sb.from("academic_years").select("id, name, is_current").order("name", { ascending: false })).data ?? [],
  });
  const { data: semesters = [] } = useQuery({
    queryKey: ["semesters-all"],
    queryFn: async (): Promise<Sem[]> => (await sb.from("semesters").select("id, name, academic_year_id, is_current")).data ?? [],
  });

  const selectedStudent = useMemo(() => students.find((s) => s.id === studentId), [students, studentId]);

  const onPickType = (id: string) => {
    setFeeTypeId(id);
    const t = types.find((x) => x.id === id);
    if (t && !amount) setAmount(String(t.amount));
  };

  const submit = async () => {
    if (!studentId || !feeTypeId || !yearId || !semId || !amount) return toast.error("الرجاء تعبئة كل الحقول");
    setSaving(true);
    const { error } = await sb.from("student_fees").insert({
      student_profile_id: studentId, fee_type_id: feeTypeId,
      academic_year_id: yearId, semester_id: semId,
      amount: Number(amount), notes: notes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("تم إنشاء الرسوم");
    onSaved();
  };

  return (
    <ModalShell title="إضافة رسوم لطالب" onClose={onClose}>
      <Field label="بحث عن طالب (الرقم الأكاديمي أو الاسم)">
        <input value={studentSearch} onChange={(e) => { setStudentSearch(e.target.value); setStudentId(""); }} className="w-full border rounded-md px-2 py-1.5 text-sm" />
        {selectedStudent ? (
          <div className="mt-1 text-xs bg-muted rounded px-2 py-1">
            ✓ {selectedStudent.academic_number} — {selectedStudent.full_name_ar}
          </div>
        ) : students.length > 0 && (
          <div className="mt-1 border rounded max-h-40 overflow-auto">
            {students.map((s) => (
              <button key={s.id} type="button" onClick={() => { setStudentId(s.id); setStudentSearch(`${s.academic_number} — ${s.full_name_ar}`); }} className="w-full text-right px-2 py-1.5 text-xs hover:bg-muted">
                <span className="font-mono">{s.academic_number}</span> — {s.full_name_ar}
              </button>
            ))}
          </div>
        )}
      </Field>
      <Field label="نوع الرسوم">
        <select value={feeTypeId} onChange={(e) => onPickType(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm">
          <option value="">اختر</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name_ar} ({Number(t.amount).toFixed(2)})</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="السنة">
          <select value={yearId} onChange={(e) => { setYearId(e.target.value); setSemId(""); }} className="w-full border rounded-md px-2 py-1.5 text-sm">
            <option value="">اختر</option>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </select>
        </Field>
        <Field label="الفصل">
          <select value={semId} onChange={(e) => setSemId(e.target.value)} disabled={!yearId} className="w-full border rounded-md px-2 py-1.5 text-sm">
            <option value="">اختر</option>
            {semesters.filter((s) => s.academic_year_id === yearId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="المبلغ"><input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm font-mono" /></Field>
      <Field label="ملاحظات"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border rounded-md px-2 py-1.5 text-sm" /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-3 py-1.5 rounded border text-xs">إلغاء</button>
        <button onClick={submit} disabled={saving} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50">
          {saving ? "جاري..." : "إنشاء"}
        </button>
      </div>
    </ModalShell>
  );
}

// ===================== Payments =====================
function PaymentsTab() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["admin-payments"],
    queryFn: async (): Promise<Payment[]> => {
      const { data, error } = await sb.from("student_payments")
        .select("id, student_fee_id, receipt_number, amount, payment_date, payment_method, notes, fee:student_fees(amount, student:student_profiles(academic_number, full_name_ar), fee_type:fee_types(name_ar))")
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-xs font-bold">
          <Plus className="h-3.5 w-3.5" /> تسجيل دفعة
        </button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-right p-2">رقم السند</th>
                <th className="text-right p-2">التاريخ</th>
                <th className="text-right p-2">الطالب</th>
                <th className="text-right p-2">الرسوم</th>
                <th className="text-right p-2">المبلغ</th>
                <th className="text-right p-2">الطريقة</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="p-2 font-mono">{p.receipt_number}</td>
                  <td className="p-2">{p.payment_date}</td>
                  <td className="p-2">
                    <div className="font-mono text-[11px]">{p.fee?.student?.academic_number}</div>
                    <div>{p.fee?.student?.full_name_ar}</div>
                  </td>
                  <td className="p-2">{p.fee?.fee_type?.name_ar}</td>
                  <td className="p-2 font-mono font-bold">{Number(p.amount).toFixed(2)}</td>
                  <td className="p-2">{METHOD_LABEL[p.payment_method] ?? p.payment_method}</td>
                </tr>
              ))}
              {payments.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد مدفوعات.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {creating && <PaymentModal onClose={() => setCreating(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["admin-payments"] }); qc.invalidateQueries({ queryKey: ["admin-student-fees"] }); setCreating(false); }} />}
    </div>
  );
}

function PaymentModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [studentSearch, setStudentSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [feeId, setFeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: students = [] } = useQuery({
    queryKey: ["student-search-pay", studentSearch],
    queryFn: async (): Promise<Student[]> => {
      if (studentSearch.trim().length < 2) return [];
      const { data } = await sb.from("student_profiles")
        .select("id, academic_number, full_name_ar, program_id")
        .or(`academic_number.ilike.%${studentSearch}%,full_name_ar.ilike.%${studentSearch}%`)
        .limit(10);
      return data ?? [];
    },
  });

  const { data: openFees = [] } = useQuery({
    queryKey: ["student-open-fees", studentId],
    queryFn: async (): Promise<StudentFee[]> => {
      if (!studentId) return [];
      const { data } = await sb.from("student_fees")
        .select("id, amount, status, student_profile_id, fee_type_id, academic_year_id, semester_id, fee_type:fee_types(name_ar, code), academic_year:academic_years(name), semester:semesters(name)")
        .eq("student_profile_id", studentId)
        .in("status", ["pending", "partially_paid"]);
      return data ?? [];
    },
    enabled: !!studentId,
  });

  const submit = async () => {
    if (!feeId || !amount || !receipt) return toast.error("الرجاء تعبئة الحقول");
    setSaving(true);
    const { error } = await sb.from("student_payments").insert({
      student_fee_id: feeId, receipt_number: receipt.trim(),
      amount: Number(amount), payment_date: date, payment_method: method, notes: notes || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("تم تسجيل الدفعة وتحديث الحالة تلقائياً");
    onSaved();
  };

  return (
    <ModalShell title="تسجيل دفعة" onClose={onClose}>
      <Field label="بحث عن طالب">
        <input value={studentSearch} onChange={(e) => { setStudentSearch(e.target.value); setStudentId(""); setFeeId(""); }} className="w-full border rounded-md px-2 py-1.5 text-sm" />
        {!studentId && students.length > 0 && (
          <div className="mt-1 border rounded max-h-40 overflow-auto">
            {students.map((s) => (
              <button key={s.id} type="button" onClick={() => { setStudentId(s.id); setStudentSearch(`${s.academic_number} — ${s.full_name_ar}`); }} className="w-full text-right px-2 py-1.5 text-xs hover:bg-muted">
                <span className="font-mono">{s.academic_number}</span> — {s.full_name_ar}
              </button>
            ))}
          </div>
        )}
      </Field>
      <Field label="الرسوم المفتوحة">
        <select value={feeId} onChange={(e) => setFeeId(e.target.value)} disabled={!studentId} className="w-full border rounded-md px-2 py-1.5 text-sm">
          <option value="">اختر</option>
          {openFees.map((f) => (
            <option key={f.id} value={f.id}>{f.fee_type?.name_ar} - {f.academic_year?.name}/{f.semester?.name} ({Number(f.amount).toFixed(2)})</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="رقم السند"><input value={receipt} onChange={(e) => setReceipt(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm font-mono" /></Field>
        <Field label="المبلغ"><input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm font-mono" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="التاريخ"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm" /></Field>
        <Field label="طريقة الدفع">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm">
            <option value="cash">نقداً</option>
            <option value="bank_transfer">تحويل بنكي</option>
            <option value="other">أخرى</option>
          </select>
        </Field>
      </div>
      <Field label="ملاحظات"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border rounded-md px-2 py-1.5 text-sm" /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-3 py-1.5 rounded border text-xs">إلغاء</button>
        <button onClick={submit} disabled={saving} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50">
          {saving ? "جاري..." : "تسجيل"}
        </button>
      </div>
    </ModalShell>
  );
}

// ===================== Shared =====================
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-bold text-sm">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-[11px] font-bold text-muted-foreground block mb-1">{label}</label>{children}</div>;
}
