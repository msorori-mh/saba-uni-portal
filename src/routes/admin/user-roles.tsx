import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, Plus, X, ShieldMinus } from "lucide-react";
import {
  listRoles, listUsersWithRoles, assignUserRole, unassignUserRole,
} from "@/lib/roles-management.functions";

export const Route = createFileRoute("/admin/user-roles")({
  head: () => ({ meta: [{ title: "ربط الأدوار بالمستخدمين — لوحة الإدارة" }] }),
  component: UserRolesPage,
});

const KIND_AR: Record<string, string> = {
  student: "طالب",
  faculty: "هيئة تدريس",
  staff: "موظف",
  user: "مستخدم",
};

function UserRolesPage() {
  const qc = useQueryClient();
  const listR = useServerFn(listRoles);
  const listU = useServerFn(listUsersWithRoles);
  const assign = useServerFn(assignUserRole);
  const unassign = useServerFn(unassignUserRole);

  const [search, setSearch] = useState("");
  const [picker, setPicker] = useState<null | { user_id: string; name: string; roles: string[] }>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: roles } = useQuery({ queryKey: ["roles-catalog"], queryFn: () => listR() });
  const { data: users, isLoading } = useQuery({
    queryKey: ["users-with-roles", search],
    queryFn: () => listU({ data: { search: search || undefined } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["users-with-roles"] });
  const activeRoles = (roles ?? []).filter((r: any) => r.is_active);

  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key); setError(null);
    try { await fn(); refresh(); }
    catch (e: any) { setError(e?.message ?? "خطأ"); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ربط الأدوار بالمستخدمين</h1>
        <p className="text-muted-foreground text-sm mt-1">إسناد الأدوار الوظيفية للمستخدمين (يدعم تعدد الأدوار).</p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو البريد"
            className="w-full pr-9 pl-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 text-destructive p-3 text-sm">{error}</div>}

      <div className="rounded-xl border bg-card">
        {isLoading ? (
          <div className="p-8 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-right">
              <tr>
                <th className="p-3">الاسم</th>
                <th className="p-3">البريد</th>
                <th className="p-3">النوع</th>
                <th className="p-3">الأدوار الحالية</th>
                <th className="p-3">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u: any) => (
                <tr key={u.user_id} className="border-t">
                  <td className="p-3 font-medium">{u.name || "—"}</td>
                  <td className="p-3 text-muted-foreground">{u.email ?? "—"}</td>
                  <td className="p-3"><span className="text-xs px-2 py-1 rounded bg-muted">{KIND_AR[u.kind] ?? u.kind}</span></td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      {u.roles.map((rc: string) => {
                        const r = (roles ?? []).find((x: any) => x.code === rc);
                        const mapping = r?.app_role_mapping as string | null | undefined;
                        return (
                          <span key={rc} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-primary/10 text-primary">
                            {r?.name_ar ?? rc}
                            {mapping ? (
                              <span className="text-[10px] px-1 rounded bg-emerald-100 text-emerald-700" title="الدور التشغيلي المرتبط">→ {mapping}</span>
                            ) : (
                              <span className="text-[10px] px-1 rounded bg-amber-100 text-amber-700" title="لا يوجد دور تشغيلي مرتبط">وصفي فقط</span>
                            )}
                            <button
                              disabled={busy === `${u.user_id}-${rc}`}
                              onClick={() => run(`${u.user_id}-${rc}`, () => unassign({ data: { user_id: u.user_id, role_code: rc } }))}
                              className="hover:bg-primary/20 rounded"
                              title="إزالة"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => setPicker({ user_id: u.user_id, name: u.name || u.email || "", roles: u.roles })}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-muted"
                    >
                      <Plus className="h-3 w-3" /> إسناد دور
                    </button>
                  </td>
                </tr>
              ))}
              {(users ?? []).length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">لا يوجد مستخدمون</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {picker && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setPicker(null)}>
          <div className="bg-card rounded-xl p-6 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold">إسناد دور لـ {picker.name}</h3>
              <button onClick={() => setPicker(null)}><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y">
              {activeRoles.map((r: any) => {
                const has = picker.roles.includes(r.code);
                return (
                  <button
                    key={r.id}
                    disabled={has || busy === `assign-${r.code}`}
                    onClick={() => run(`assign-${r.code}`, async () => {
                      await assign({ data: { user_id: picker.user_id, role_code: r.code } });
                      setPicker({ ...picker, roles: [...picker.roles, r.code] });
                    })}
                    className="w-full text-right p-3 hover:bg-muted disabled:opacity-50 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium">{r.name_ar}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.code}</div>
                    </div>
                    {has && <span className="text-xs text-emerald-600">مُسند</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
