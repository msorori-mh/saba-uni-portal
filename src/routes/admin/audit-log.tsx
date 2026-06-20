import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAuditLogs } from "@/lib/admin-audit-log.functions";
import { Loader2, Search, X } from "lucide-react";

export const Route = createFileRoute("/admin/audit-log")({
  component: AuditLogPage,
});

type AuditRow = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_role: string | null;
  entity_type: string;
  entity_id: string | null;
  action_type: string;
  old_values: any;
  new_values: any;
  notes: string | null;
};

const ENTITY_TYPES = [
  { value: "", label: "كل الكيانات" },
  { value: "student_request", label: "طلبات الطلاب" },
  { value: "grade", label: "الدرجات" },
  { value: "finance", label: "المالية" },
];

const ACTION_TYPES = [
  { value: "", label: "كل العمليات" },
  { value: "request_created", label: "إنشاء طلب" },
  { value: "request_submitted", label: "إرسال طلب" },
  { value: "request_review_started", label: "بدء المراجعة" },
  { value: "request_approved", label: "اعتماد طلب" },
  { value: "request_rejected", label: "رفض طلب" },
  { value: "request_cancelled", label: "إلغاء طلب" },
  { value: "grade_created", label: "إنشاء درجة" },
  { value: "grade_modified", label: "تعديل درجة" },
  { value: "fee_created", label: "إنشاء رسوم" },
  { value: "fee_modified", label: "تعديل رسوم" },
  { value: "payment_added", label: "إضافة دفعة" },
  { value: "receipt_approved", label: "اعتماد سند دفع" },
  { value: "receipt_rejected", label: "رفض سند دفع" },
  { value: "discount_applied", label: "تطبيق خصم" },
  { value: "discount_cancelled", label: "إلغاء خصم" },
];

function actionLabel(code: string) {
  return ACTION_TYPES.find((a) => a.value === code)?.label ?? code;
}
function entityLabel(code: string) {
  return ENTITY_TYPES.find((e) => e.value === code)?.label ?? code;
}

function AuditLogPage() {
  const listFn = useServerFn(listAuditLogs);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [userId, setUserId] = useState("");
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", from, to, entity, action, userId],
    queryFn: () => listFn({
      data: {
        from: from || undefined,
        to: to || undefined,
        entityType: entity || undefined,
        actionType: action || undefined,
        actorUserId: userId.trim() || undefined,
      },
    }),
  });

  const rows = data ?? [];

  const reset = () => {
    setFrom(""); setTo(""); setEntity(""); setAction(""); setUserId("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-primary">سجل التدقيق</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تتبع جميع العمليات الحساسة في النظام (الطلبات، الدرجات، المالية).
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl bg-card border border-border p-4 shadow-card">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">من تاريخ</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">إلى تاريخ</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">الكيان</label>
            <select value={entity} onChange={(e) => setEntity(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              {ENTITY_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">نوع العملية</label>
            <select value={action} onChange={(e) => setAction(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
              {ACTION_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1">معرّف المستخدم</label>
            <div className="flex gap-2">
              <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="UUID"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
              <button onClick={reset}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary">
                مسح
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-card border border-border shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 grid place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            لا توجد سجلات مطابقة للفلاتر.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-primary">
                <tr>
                  <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                  <th className="px-4 py-3 text-right font-bold">المستخدم</th>
                  <th className="px-4 py-3 text-right font-bold">الدور</th>
                  <th className="px-4 py-3 text-right font-bold">الكيان</th>
                  <th className="px-4 py-3 text-right font-bold">العملية</th>
                  <th className="px-4 py-3 text-right font-bold">تفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                      {new Date(r.created_at).toLocaleString("ar-EG")}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {r.actor_user_id?.slice(0, 8) ?? "—"}
                    </td>
                    <td className="px-4 py-3">{r.actor_role ?? "—"}</td>
                    <td className="px-4 py-3">{entityLabel(r.entity_type)}</td>
                    <td className="px-4 py-3 font-bold">{actionLabel(r.action_type)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setSelected(r)}
                        className="inline-flex items-center gap-1 text-primary hover:underline">
                        <Search className="h-4 w-4" /> عرض
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
          عرض حتى آخر 500 سجل
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4"
          onClick={() => setSelected(null)}>
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-display text-lg font-bold text-primary">تفاصيل السجل</h3>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-secondary rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><b>التاريخ:</b> {new Date(selected.created_at).toLocaleString("ar-EG")}</div>
                <div><b>العملية:</b> {actionLabel(selected.action_type)}</div>
                <div><b>الكيان:</b> {entityLabel(selected.entity_type)}</div>
                <div><b>الدور:</b> {selected.actor_role ?? "—"}</div>
                <div className="col-span-2 font-mono text-xs"><b>المستخدم:</b> {selected.actor_user_id ?? "—"}</div>
                <div className="col-span-2 font-mono text-xs"><b>معرّف الكيان:</b> {selected.entity_id ?? "—"}</div>
              </div>
              {selected.notes && (
                <div>
                  <b>الملاحظات:</b>
                  <div className="mt-1 p-2 bg-secondary/50 rounded">{selected.notes}</div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <b className="block mb-1">القيم القديمة:</b>
                  <pre className="p-2 bg-secondary/50 rounded text-xs overflow-auto font-mono">
                    {selected.old_values ? JSON.stringify(selected.old_values, null, 2) : "—"}
                  </pre>
                </div>
                <div>
                  <b className="block mb-1">القيم الجديدة:</b>
                  <pre className="p-2 bg-secondary/50 rounded text-xs overflow-auto font-mono">
                    {selected.new_values ? JSON.stringify(selected.new_values, null, 2) : "—"}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
