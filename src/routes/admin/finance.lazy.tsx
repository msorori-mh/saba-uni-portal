import { createLazyFileRoute } from "@tanstack/react-router";
import { usePagePerf } from "@/lib/perf-probe";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Wallet, Plus, X, Receipt, Tag, Users, Percent, FileText } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { sendNotificationEmail } from "@/lib/email.functions";
import {
  getFinanceLookups,
  searchStudentsForFinance,
  listFeeTypes,
  listActiveFeeTypes,
  upsertFeeType,
  deleteFeeType,
  listStudentFees,
  cancelStudentFee,
  createStudentFee,
  listOpenStudentFees,
  listStudentPayments,
  createStudentPayment,
  listDiscountTypes,
  listActiveDiscountTypes,
  upsertDiscountType,
  deleteDiscountType,
  listStudentDiscounts,
  updateStudentDiscountStatus,
  createStudentDiscount,
  listPaymentReceipts,
  getPaymentReceiptFileUrl,
  approvePaymentReceipt,
  rejectPaymentReceipt,
} from "@/lib/admin-finance.functions";
import { FeatureFrozenNotice } from "@/components/portal/FeatureFrozenNotice";
import {
  ADMIN_FINANCE_FROZEN_MSG,
  portalFeatures,
} from "@/lib/portal-features";

export const Route = createLazyFileRoute("/admin/finance")({
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
  usePagePerf("/admin/finance");
  const [tab, setTab] = useState<"types" | "fees" | "payments" | "receipts">("types");

  if (!portalFeatures.adminFinance) {
    return (
      <div dir="rtl" className="p-4 lg:p-8 max-w-xl mx-auto">
        <FeatureFrozenNotice
          message={ADMIN_FINANCE_FROZEN_MSG}
          homeHref="/admin"
          homeLabel="العودة للوحة التحكم"
        />
      </div>
    );
  }

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
        {/* الخصومات — مخفية (ADMIN-DASHBOARD-CARDS-RENAME-HIDE-01); المسار والدوال الخلفية باقية */}
        <TabButton active={tab === "receipts"} onClick={() => setTab("receipts")} icon={FileText}>سندات الدفع</TabButton>
      </div>

      {tab === "types" && <FeeTypesTab />}
      {tab === "fees" && <StudentFeesTab />}
      {tab === "payments" && <PaymentsTab />}
      {tab === "receipts" && <ReceiptsTab />}
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
  const listFn = useServerFn(listFeeTypes);
  const deleteFn = useServerFn(deleteFeeType);
  const [editing, setEditing] = useState<FeeType | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["admin-fee-types"],
    queryFn: () => listFn({ data: {} }),
  });

  const remove = async (id: string) => {
    if (!confirm("حذف نوع الرسوم؟")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["admin-fee-types"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
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
  const upsertFn = useServerFn(upsertFeeType);
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name_ar ?? "");
  const [desc, setDesc] = useState(value?.description_ar ?? "");
  const [amount, setAmount] = useState(String(value?.amount ?? 0));
  const [active, setActive] = useState(value?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!code.trim() || !name.trim()) return toast.error("الرمز والاسم مطلوبان");
    setSaving(true);
    try {
      await upsertFn({
        data: {
          id: value?.id,
          code: code.trim(),
          name_ar: name.trim(),
          description_ar: desc || null,
          amount: Number(amount) || 0,
          is_active: active,
        },
      });
      toast.success("تم الحفظ");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
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
  const lookupsFn = useServerFn(getFinanceLookups);
  const listFn = useServerFn(listStudentFees);
  const cancelFn = useServerFn(cancelStudentFee);
  const [creating, setCreating] = useState(false);
  const [filterYear, setFilterYear] = useState<string>("");
  const [filterSem, setFilterSem] = useState<string>("");
  const [filterProgram, setFilterProgram] = useState<string>("");

  const { data: lookups } = useQuery({
    queryKey: ["finance-lookups"],
    queryFn: () => lookupsFn({ data: {} }),
  });
  const years = lookups?.years ?? [];
  const semesters = lookups?.semesters ?? [];
  const programs = lookups?.programs ?? [];

  const { data: fees = [], isLoading } = useQuery({
    queryKey: ["admin-student-fees", filterYear, filterSem, filterProgram],
    queryFn: () => listFn({
      data: {
        academicYearId: filterYear || undefined,
        semesterId: filterSem || undefined,
        programId: filterProgram || undefined,
      },
    }),
  });

  const cancelFee = async (id: string) => {
    if (!confirm("إلغاء هذه الرسوم؟")) return;
    try {
      await cancelFn({ data: { id } });
      toast.success("تم الإلغاء");
      qc.invalidateQueries({ queryKey: ["admin-student-fees"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
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
  const searchFn = useServerFn(searchStudentsForFinance);
  const lookupsFn = useServerFn(getFinanceLookups);
  const typesFn = useServerFn(listActiveFeeTypes);
  const createFn = useServerFn(createStudentFee);
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
    queryFn: () => searchFn({ data: { query: studentSearch } }),
    enabled: studentSearch.trim().length >= 2,
  });
  const { data: types = [] } = useQuery({
    queryKey: ["fee-types-active"],
    queryFn: () => typesFn({ data: {} }),
  });
  const { data: lookups } = useQuery({
    queryKey: ["finance-lookups"],
    queryFn: () => lookupsFn({ data: {} }),
  });
  const years = lookups?.years ?? [];
  const semesters = lookups?.semesters ?? [];

  const selectedStudent = useMemo(() => students.find((s) => s.id === studentId), [students, studentId]);

  const onPickType = (id: string) => {
    setFeeTypeId(id);
    const t = types.find((x) => x.id === id);
    if (t && !amount) setAmount(String(t.amount));
  };

  const submit = async () => {
    if (!studentId || !feeTypeId || !yearId || !semId || !amount) return toast.error("الرجاء تعبئة كل الحقول");
    setSaving(true);
    try {
      await createFn({
        data: {
          studentProfileId: studentId,
          feeTypeId,
          academicYearId: yearId,
          semesterId: semId,
          amount: Number(amount),
          notes: notes || null,
        },
      });
      toast.success("تم إنشاء الرسوم");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
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
  const listFn = useServerFn(listStudentPayments);
  const [creating, setCreating] = useState(false);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["admin-payments"],
    queryFn: () => listFn({ data: {} }),
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
  const searchFn = useServerFn(searchStudentsForFinance);
  const openFeesFn = useServerFn(listOpenStudentFees);
  const createFn = useServerFn(createStudentPayment);
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
    queryFn: () => searchFn({ data: { query: studentSearch } }),
    enabled: studentSearch.trim().length >= 2,
  });

  const { data: openFees = [] } = useQuery({
    queryKey: ["student-open-fees", studentId],
    queryFn: () => openFeesFn({ data: { studentProfileId: studentId } }),
    enabled: !!studentId,
  });

  const submit = async () => {
    if (!feeId || !amount || !receipt) return toast.error("الرجاء تعبئة الحقول");
    setSaving(true);
    try {
      await createFn({
        data: {
          studentFeeId: feeId,
          receiptNumber: receipt.trim(),
          amount: Number(amount),
          paymentDate: date,
          paymentMethod: method as "cash" | "bank_transfer" | "other",
          notes: notes || null,
        },
      });
      toast.success("تم تسجيل الدفعة وتحديث الحالة تلقائياً");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
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

// ===================== Discounts & Exemptions =====================
type DiscountType = { id: string; code: string; name_ar: string; description_ar: string | null; discount_type: "percentage" | "fixed_amount"; default_value: number; is_active: boolean };
type StudentDiscount = {
  id: string; student_profile_id: string; discount_type_id: string;
  academic_year_id: string; semester_id: string; value: number; status: string;
  notes: string | null; approved_at: string | null;
  discount_type: { name_ar: string; discount_type: string; code: string } | null;
  student: { academic_number: string; full_name_ar: string } | null;
  academic_year: { name: string } | null;
  semester: { name: string } | null;
  adjustments?: { id: string; original_amount: number; discount_amount: number; final_amount: number }[];
};

function DiscountsTab() {
  const [sub, setSub] = useState<"types" | "students">("types");
  return (
    <div className="space-y-3">
      <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
        <TabButton active={sub === "types"} onClick={() => setSub("types")} icon={Tag}>أنواع الخصومات</TabButton>
        <TabButton active={sub === "students"} onClick={() => setSub("students")} icon={Users}>خصومات الطلاب</TabButton>
      </div>
      {sub === "types" ? <DiscountTypesPanel /> : <StudentDiscountsPanel />}
    </div>
  );
}

function DiscountTypesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listDiscountTypes);
  const deleteFn = useServerFn(deleteDiscountType);
  const [editing, setEditing] = useState<DiscountType | null>(null);
  const [creating, setCreating] = useState(false);
  const { data: types = [], isLoading } = useQuery({
    queryKey: ["admin-discount-types"],
    queryFn: () => listFn({ data: {} }),
  });
  const remove = async (id: string) => {
    if (!confirm("حذف نوع الخصم؟")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["admin-discount-types"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-xs font-bold">
          <Plus className="h-3.5 w-3.5" /> نوع خصم جديد
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
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{t.discount_type === "percentage" ? "نسبة %" : "مبلغ ثابت"}</span>
                  {!t.is_active && <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">معطّل</span>}
                </div>
                {t.description_ar && <p className="text-xs text-muted-foreground mt-0.5">{t.description_ar}</p>}
                <p className="text-xs mt-1 font-mono">القيمة الافتراضية: <b>{Number(t.default_value)}{t.discount_type === "percentage" ? "%" : ""}</b></p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(t)} className="text-xs px-2 py-1 rounded border hover:bg-muted">تعديل</button>
                <button onClick={() => remove(t.id)} className="text-xs px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50">حذف</button>
              </div>
            </div>
          ))}
          {types.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground">لا توجد أنواع خصومات.</div>}
        </div>
      )}
      {(creating || editing) && (
        <DiscountTypeModal value={editing} onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["admin-discount-types"] }); setCreating(false); setEditing(null); }} />
      )}
    </div>
  );
}

function DiscountTypeModal({ value, onClose, onSaved }: { value: DiscountType | null; onClose: () => void; onSaved: () => void }) {
  const upsertFn = useServerFn(upsertDiscountType);
  const [code, setCode] = useState(value?.code ?? "");
  const [name, setName] = useState(value?.name_ar ?? "");
  const [desc, setDesc] = useState(value?.description_ar ?? "");
  const [type, setType] = useState<"percentage" | "fixed_amount">(value?.discount_type ?? "percentage");
  const [defVal, setDefVal] = useState(String(value?.default_value ?? 0));
  const [active, setActive] = useState(value?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!code.trim() || !name.trim()) return toast.error("الرمز والاسم مطلوبان");
    setSaving(true);
    try {
      await upsertFn({
        data: {
          id: value?.id,
          code: code.trim(),
          name_ar: name.trim(),
          description_ar: desc || null,
          discount_type: type,
          default_value: Number(defVal) || 0,
          is_active: active,
        },
      });
      toast.success("تم الحفظ");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <ModalShell title={value ? "تعديل نوع خصم" : "نوع خصم جديد"} onClose={onClose}>
      <Field label="الرمز"><input value={code} onChange={(e) => setCode(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm font-mono" /></Field>
      <Field label="الاسم بالعربية"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm" /></Field>
      <Field label="الوصف"><textarea value={desc ?? ""} onChange={(e) => setDesc(e.target.value)} rows={2} className="w-full border rounded-md px-2 py-1.5 text-sm" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="نوع الخصم">
          <select value={type} onChange={(e) => setType(e.target.value as "percentage" | "fixed_amount")} className="w-full border rounded-md px-2 py-1.5 text-sm">
            <option value="percentage">نسبة مئوية (%)</option>
            <option value="fixed_amount">مبلغ ثابت</option>
          </select>
        </Field>
        <Field label="القيمة الافتراضية"><input type="number" min="0" step="0.01" value={defVal} onChange={(e) => setDefVal(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm font-mono" /></Field>
      </div>
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

function StudentDiscountsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listStudentDiscounts);
  const statusFn = useServerFn(updateStudentDiscountStatus);
  const [creating, setCreating] = useState(false);
  const { data: discounts = [], isLoading } = useQuery({
    queryKey: ["admin-student-discounts"],
    queryFn: () => listFn({ data: {} }),
  });
  const setStatus = async (id: string, status: string) => {
    try {
      await statusFn({
        data: {
          id,
          status: status as "active" | "inactive" | "cancelled",
        },
      });
      toast.success("تم التحديث");
      qc.invalidateQueries({ queryKey: ["admin-student-discounts"] });
      qc.invalidateQueries({ queryKey: ["admin-student-fees"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-2 text-xs font-bold">
          <Plus className="h-3.5 w-3.5" /> منح خصم لطالب
        </button>
      </div>
      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden divide-y">
          {discounts.map((d) => {
            const totalDiscount = (d.adjustments ?? []).reduce((s, a) => s + Number(a.discount_amount), 0);
            const totalOrig = (d.adjustments ?? []).reduce((s, a) => s + Number(a.original_amount), 0);
            const totalFinal = (d.adjustments ?? []).reduce((s, a) => s + Number(a.final_amount), 0);
            const stCls = d.status === "active" ? "bg-emerald-100 text-emerald-800" : d.status === "cancelled" ? "bg-rose-100 text-rose-800" : "bg-muted";
            return (
              <div key={d.id} className="p-3 text-xs">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <div>
                    <span className="font-bold text-sm text-primary">{d.discount_type?.name_ar}</span>
                    <span className="mx-2 text-muted-foreground">|</span>
                    <span className="font-mono">{d.student?.academic_number}</span> — <b>{d.student?.full_name_ar}</b>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${stCls}`}>
                    {d.status === "active" ? "مفعّل" : d.status === "inactive" ? "غير مفعّل" : "ملغي"}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {d.academic_year?.name} — {d.semester?.name} • قيمة الخصم: <b>{Number(d.value)}{d.discount_type?.discount_type === "percentage" ? "%" : ""}</b>
                </div>
                {(d.adjustments ?? []).length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-2 font-mono">
                    <Mini label="الأصلي" value={totalOrig} />
                    <Mini label="الخصم" value={totalDiscount} tone="warn" />
                    <Mini label="النهائي" value={totalFinal} tone="ok" />
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  {d.status !== "active" && <button onClick={() => setStatus(d.id, "active")} className="text-[10px] px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50">تفعيل</button>}
                  {d.status === "active" && <button onClick={() => setStatus(d.id, "inactive")} className="text-[10px] px-2 py-1 rounded border hover:bg-muted">إيقاف</button>}
                  {d.status !== "cancelled" && <button onClick={() => setStatus(d.id, "cancelled")} className="text-[10px] px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50">إلغاء</button>}
                </div>
              </div>
            );
          })}
          {discounts.length === 0 && <div className="p-6 text-center text-xs text-muted-foreground">لا توجد خصومات.</div>}
        </div>
      )}
      {creating && <StudentDiscountModal onClose={() => setCreating(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["admin-student-discounts"] }); qc.invalidateQueries({ queryKey: ["admin-student-fees"] }); setCreating(false); }} />}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  const cls = tone === "ok" ? "border-emerald-300 bg-emerald-50" : tone === "warn" ? "border-amber-300 bg-amber-50" : "";
  return (
    <div className={`rounded border p-1.5 ${cls}`}>
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div className="font-bold">{Number(value).toFixed(2)}</div>
    </div>
  );
}

function StudentDiscountModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const searchFn = useServerFn(searchStudentsForFinance);
  const typesFn = useServerFn(listActiveDiscountTypes);
  const lookupsFn = useServerFn(getFinanceLookups);
  const createFn = useServerFn(createStudentDiscount);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [yearId, setYearId] = useState("");
  const [semId, setSemId] = useState("");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [activate, setActivate] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: students = [] } = useQuery({
    queryKey: ["student-search-disc", studentSearch],
    queryFn: () => searchFn({ data: { query: studentSearch } }),
    enabled: studentSearch.trim().length >= 2,
  });
  const { data: types = [] } = useQuery({
    queryKey: ["discount-types-active"],
    queryFn: () => typesFn({ data: {} }),
  });
  const { data: lookups } = useQuery({
    queryKey: ["finance-lookups"],
    queryFn: () => lookupsFn({ data: {} }),
  });
  const years = lookups?.years ?? [];
  const semesters = lookups?.semesters ?? [];

  const selectedType = useMemo(() => types.find((t) => t.id === typeId), [types, typeId]);

  const onPickType = (id: string) => {
    setTypeId(id);
    const t = types.find((x) => x.id === id);
    if (t && !value) setValue(String(t.default_value));
  };

  const submit = async () => {
    if (!studentId || !typeId || !yearId || !semId || !value) return toast.error("الرجاء تعبئة كل الحقول");
    setSaving(true);
    try {
      await createFn({
        data: {
          studentProfileId: studentId,
          discountTypeId: typeId,
          academicYearId: yearId,
          semesterId: semId,
          value: Number(value),
          notes: notes || null,
          activate,
        },
      });
      toast.success(activate ? "تم منح الخصم وتطبيقه" : "تم حفظ الخصم (غير مفعّل)");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="منح خصم لطالب" onClose={onClose}>
      <Field label="بحث عن طالب">
        <input value={studentSearch} onChange={(e) => { setStudentSearch(e.target.value); setStudentId(""); }} className="w-full border rounded-md px-2 py-1.5 text-sm" />
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
      <Field label="نوع الخصم">
        <select value={typeId} onChange={(e) => onPickType(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm">
          <option value="">اختر</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name_ar} ({t.discount_type === "percentage" ? `${t.default_value}%` : t.default_value})</option>)}
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
      <Field label={`القيمة ${selectedType?.discount_type === "percentage" ? "(%)" : "(مبلغ ثابت)"}`}>
        <input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className="w-full border rounded-md px-2 py-1.5 text-sm font-mono" />
      </Field>
      <Field label="ملاحظات"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border rounded-md px-2 py-1.5 text-sm" /></Field>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} /> اعتماد الخصم وتطبيقه فوراً على الرسوم
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-3 py-1.5 rounded border text-xs">إلغاء</button>
        <button onClick={submit} disabled={saving} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50">
          {saving ? "جاري..." : "حفظ"}
        </button>
      </div>
    </ModalShell>
  );
}

// ===================== Payment Receipts =====================
type ReceiptRecord = {
  id: string; student_profile_id: string; student_fee_id: string;
  amount: number; payment_date: string; payment_method: string;
  receipt_reference: string | null; file_url: string; file_name: string;
  status: string; rejection_reason: string | null; created_at: string;
  reviewed_at: string | null; student_payment_id: string | null;
  student: { academic_number: string; full_name_ar: string } | null;
  fee: { amount: number; fee_type: { name_ar: string } | null } | null;
};

const REC_STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  submitted: { text: "قيد الإرسال", cls: "bg-sky-100 text-sky-800" },
  under_review: { text: "قيد المراجعة", cls: "bg-amber-100 text-amber-800" },
  approved: { text: "معتمد", cls: "bg-emerald-100 text-emerald-800" },
  rejected: { text: "مرفوض", cls: "bg-rose-100 text-rose-800" },
};

function ReceiptsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPaymentReceipts);
  const fileUrlFn = useServerFn(getPaymentReceiptFileUrl);
  const approveFn = useServerFn(approvePaymentReceipt);
  const sendEmail = useServerFn(sendNotificationEmail);
  const [statusFilter, setStatusFilter] = useState<string>("submitted");
  const [search, setSearch] = useState("");
  const [rejecting, setRejecting] = useState<ReceiptRecord | null>(null);

  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ["admin-payment-receipts", statusFilter],
    queryFn: () => listFn({
      data: {
        statusFilter: (statusFilter === "all" ? "all" : statusFilter) as "all" | "submitted" | "under_review" | "approved" | "rejected",
      },
    }),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return receipts;
    const s = search.trim().toLowerCase();
    return receipts.filter((r) =>
      (r.student?.academic_number ?? "").toLowerCase().includes(s) ||
      (r.student?.full_name_ar ?? "").toLowerCase().includes(s)
    );
  }, [receipts, search]);

  const viewFile = async (path: string) => {
    try {
      const { signedUrl } = await fileUrlFn({ data: { path } });
      window.open(signedUrl, "_blank");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const approve = async (r: ReceiptRecord) => {
    if (!confirm(`اعتماد سند الدفع للطالب ${r.student?.academic_number}؟ سيتم تسجيل دفعة بقيمة ${Number(r.amount).toFixed(2)}.`)) return;
    try {
      const result = await approveFn({ data: { id: r.id } });
      toast.success("تم الاعتماد وتسجيل الدفعة");
      qc.invalidateQueries({ queryKey: ["admin-payment-receipts"] });
      if (result.email) {
        sendEmail({
          data: {
            templateKey: "receipt_approved",
            recipientEmail: result.email,
            recipientName: result.full_name_ar,
            variables: {
              amount: Number(result.amount).toFixed(2),
              payment_date: result.payment_date,
              fee_type: result.fee_type,
            },
            relatedEntityType: "payment_receipt",
            relatedEntityId: r.id,
          },
        }).catch(() => undefined);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded border px-2 py-1.5 text-xs bg-background">
          <option value="all">كل الحالات</option>
          <option value="submitted">قيد الإرسال</option>
          <option value="under_review">قيد المراجعة</option>
          <option value="approved">معتمد</option>
          <option value="rejected">مرفوض</option>
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث برقم أكاديمي أو اسم"
          className="rounded border px-2 py-1.5 text-xs bg-background flex-1 min-w-[200px]" />
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-xs text-muted-foreground py-10">لا توجد سندات.</div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden divide-y">
          {filtered.map((r) => {
            const st = REC_STATUS_LABEL[r.status] ?? { text: r.status, cls: "bg-muted" };
            const canAct = r.status === "submitted" || r.status === "under_review";
            return (
              <div key={r.id} className="p-3 text-xs space-y-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-bold text-sm text-primary">
                    {r.student?.full_name_ar} <span className="font-mono text-[11px] text-muted-foreground">({r.student?.academic_number})</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${st.cls}`}>{st.text}</span>
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  {r.fee?.fee_type?.name_ar} • المبلغ المدفوع: <b>{Number(r.amount).toFixed(2)}</b> • {r.payment_date} • {METHOD_LABEL[r.payment_method] ?? r.payment_method}
                  {r.receipt_reference && <> • مرجع: {r.receipt_reference}</>}
                </div>
                {r.status === "rejected" && r.rejection_reason && (
                  <div className="text-[11px] text-rose-700">سبب الرفض: {r.rejection_reason}</div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button onClick={() => viewFile(r.file_url)} className="rounded border px-2 py-1 text-[11px]">عرض المرفق</button>
                  {canAct && (
                    <>
                      <button onClick={() => approve(r)} className="rounded bg-emerald-600 text-white px-2 py-1 text-[11px] font-bold">اعتماد</button>
                      <button onClick={() => setRejecting(r)} className="rounded bg-rose-600 text-white px-2 py-1 text-[11px] font-bold">رفض</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rejecting && (
        <RejectReceiptModal receipt={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); qc.invalidateQueries({ queryKey: ["admin-payment-receipts"] }); }} />
      )}
    </div>
  );
}

function RejectReceiptModal({ receipt, onClose, onDone }: { receipt: ReceiptRecord; onClose: () => void; onDone: () => void }) {
  const rejectFn = useServerFn(rejectPaymentReceipt);
  const sendEmail = useServerFn(sendNotificationEmail);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!reason.trim()) return toast.error("سبب الرفض مطلوب");
    setBusy(true);
    try {
      const result = await rejectFn({
        data: { id: receipt.id, rejectionReason: reason.trim() },
      });
      toast.success("تم رفض السند");
      if (result.email) {
        sendEmail({
          data: {
            templateKey: "receipt_rejected",
            recipientEmail: result.email,
            recipientName: result.full_name_ar,
            variables: {
              amount: Number(result.amount).toFixed(2),
              rejection_reason: result.rejection_reason,
            },
            relatedEntityType: "payment_receipt",
            relatedEntityId: receipt.id,
          },
        }).catch(() => undefined);
      }
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3" dir="rtl">
      <div className="bg-card border rounded-lg shadow-xl w-full max-w-md">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="font-bold text-sm">رفض السند</h3>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-2 text-xs">
          <div>الطالب: <b>{receipt.student?.full_name_ar}</b></div>
          <label className="block">
            <div className="text-[10px] font-bold text-muted-foreground mb-1">سبب الرفض</div>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded border px-2 py-1.5 bg-background" />
          </label>
        </div>
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-xs">إلغاء</button>
          <button onClick={submit} disabled={busy} className="rounded bg-rose-600 text-white px-3 py-1.5 text-xs font-bold disabled:opacity-50">
            {busy ? "جارٍ..." : "تأكيد الرفض"}
          </button>
        </div>
      </div>
    </div>
  );
}
