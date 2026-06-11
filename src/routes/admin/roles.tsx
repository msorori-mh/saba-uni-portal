import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Power, PowerOff, Pencil, X } from "lucide-react";
import {
  listRoles, createRole, updateRole, setRoleActive,
} from "@/lib/roles-management.functions";

export const Route = createFileRoute("/admin/roles")({
  head: () => ({ meta: [{ title: "إدارة الأدوار — لوحة الإدارة" }] }),
  component: RolesPage,
});

function RolesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listRoles);
  const create = useServerFn(createRole);
  const update = useServerFn(updateRole);
  const toggle = useServerFn(setRoleActive);

  const { data: rows, isLoading } = useQuery({ queryKey: ["roles-catalog"], queryFn: () => list() });
  const [showForm, setShowForm] = useState<null | { mode: "create" } | { mode: "edit"; row: any }>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["roles-catalog"] });

  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key); setError(null);
    try { await fn(); refresh(); }
    catch (e: any) { setError(e?.message ?? "خطأ"); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">إدارة الأدوار الوظيفية</h1>
          <p className="text-muted-foreground text-sm mt-1">كتالوج الأدوار الأساسية للجامعة (لا يؤثر على نظام الصلاحيات).</p>
        </div>
        <button
          onClick={() => setShowForm({ mode: "create" })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> إضافة دور
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm">{error}</div>
      )}

      <div className="rounded-xl border bg-card">
        {isLoading ? (
          <div className="p-8 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-right">
              <tr>
                <th className="p-3">الاسم</th>
                <th className="p-3">الكود</th>
                <th className="p-3">الوصف</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3 font-medium">{r.name_ar}</td>
                  <td className="p-3 font-mono text-xs">{r.code}</td>
                  <td className="p-3 text-muted-foreground">{r.description ?? "—"}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs ${r.is_active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                      {r.is_active ? "مفعّل" : "معطّل"}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowForm({ mode: "edit", row: r })}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-muted"
                      >
                        <Pencil className="h-3 w-3" /> تعديل
                      </button>
                      <button
                        disabled={busy === r.id}
                        onClick={() => run(r.id, () => toggle({ data: { id: r.id, active: !r.is_active } }))}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-muted"
                      >
                        {r.is_active ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
                        {r.is_active ? "تعطيل" : "تفعيل"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(rows ?? []).length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">لا توجد أدوار</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <RoleForm
          initial={showForm.mode === "edit" ? showForm.row : null}
          onClose={() => setShowForm(null)}
          onSubmit={async (values) => {
            if (showForm.mode === "edit") {
              await update({ data: { id: showForm.row.id, ...values } });
            } else {
              await create({ data: values as any });
            }
            refresh();
            setShowForm(null);
          }}
        />
      )}
    </div>
  );
}

function RoleForm({ initial, onClose, onSubmit }: { initial: any | null; onClose: () => void; onSubmit: (v: any) => Promise<void> }) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [nameAr, setNameAr] = useState(initial?.name_ar ?? "");
  const [nameEn, setNameEn] = useState(initial?.name_en ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isEdit = !!initial;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const payload: any = { name_ar: nameAr, name_en: nameEn || undefined, description: desc || undefined };
      if (!isEdit) payload.code = code.trim();
      await onSubmit(payload);
    } catch (e: any) { setErr(e?.message ?? "خطأ"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
      <form onSubmit={submit} className="bg-card rounded-xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">{isEdit ? "تعديل دور" : "إضافة دور جديد"}</h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        {err && <div className="text-destructive text-sm">{err}</div>}
        {!isEdit && (
          <div>
            <label className="text-sm block mb-1">الكود (لاتيني صغير)</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} required className="w-full border rounded px-3 py-2" placeholder="academic_affairs_officer" />
          </div>
        )}
        <div>
          <label className="text-sm block mb-1">الاسم بالعربية</label>
          <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} required className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="text-sm block mb-1">الاسم بالإنجليزية</label>
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="text-sm block mb-1">الوصف</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full border rounded px-3 py-2" rows={3} />
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded border">إلغاء</button>
          <button disabled={busy} className="px-4 py-2 rounded bg-primary text-primary-foreground inline-flex items-center gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
          </button>
        </div>
      </form>
    </div>
  );
}
