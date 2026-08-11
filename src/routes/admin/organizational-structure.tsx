import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2, UserPlus, UserMinus, ShieldAlert, Plus, Pencil, Power, KeyRound, History, RefreshCw,
} from "lucide-react";
import {
  listOrgStructure, listAssignableUsers, assignPosition, endAssignment, setPositionActive,
} from "@/lib/org-structure.functions";
import { OrgPositionDialog, type OrgPosition } from "@/components/admin/OrgPositionDialog";
import { OrgPositionRolesDialog } from "@/components/admin/OrgPositionRolesDialog";
import { OrgRoleDriftPanel } from "@/components/admin/OrgRoleDriftPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/admin/organizational-structure")({
  head: () => ({ meta: [{ title: "الهيكل التنظيمي — لوحة الإدارة" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: OrgStructurePage,
});

const UNIT_TYPE_AR: Record<string, string> = {
  position: "منصب",
  department: "قسم أكاديمي",
  unit: "وحدة",
  administration: "إدارة",
  council: "مجلس",
  committee: "لجنة",
};

function OrgStructurePage() {
  const listFn = useServerFn(listOrgStructure);
  const usersFn = useServerFn(listAssignableUsers);
  const assignFn = useServerFn(assignPosition);
  const endFn = useServerFn(endAssignment);
  const activeFn = useServerFn(setPositionActive);
  const qc = useQueryClient();

  const orgQ = useQuery({ queryKey: ["org-structure"], queryFn: () => listFn({ data: {} as any }) });
  const usersQ = useQuery({ queryKey: ["org-assignable-users"], queryFn: () => usersFn({ data: {} as any }) });

  const [openFor, setOpenFor] = useState<{ id: string; name: string } | null>(null);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [editPosition, setEditPosition] = useState<OrgPosition | null>(null);
  const [positionDialogOpen, setPositionDialogOpen] = useState(false);
  const [rolesFor, setRolesFor] = useState<{ id: string; name_ar: string } | null>(null);
  const [historyFor, setHistoryFor] = useState<{ id: string; name_ar: string } | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["org-structure"] });
    qc.invalidateQueries({ queryKey: ["org-role-drift"] });
    qc.invalidateQueries({ queryKey: ["users-with-roles"] });
  };

  const assignMut = useMutation({
    mutationFn: (vars: { position_id: string; user_id: string; notes?: string }) => assignFn({ data: vars }),
    onSuccess: (r: any) => {
      const granted = r?.granted_roles?.length ?? 0;
      toast.success(granted ? `تم التعيين ومنح ${granted} دور تلقائياً` : "تم تعيين الشاغل");
      refresh();
      setOpenFor(null); setSelectedUser(""); setNotes("");
    },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر التعيين"),
  });

  const endMut = useMutation({
    mutationFn: (id: string) => endFn({ data: { assignment_id: id } }),
    onSuccess: () => { toast.success("تم إنهاء التعيين وسحب الأدوار المشتقة"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر إنهاء التعيين"),
  });

  const activeMut = useMutation({
    mutationFn: (vars: { id: string; active: boolean }) => activeFn({ data: vars }),
    onSuccess: () => { toast.success("تم تحديث حالة المنصب"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "تعذّر التحديث"),
  });

  const data = orgQ.data;

  const ordered = useMemo(() => {
    if (!data) return [] as any[];
    const positions = [...data.positions] as any[];
    const byParent = new Map<string, any[]>();
    for (const p of positions) {
      const key = p.parent_code ?? "__root__";
      const arr = byParent.get(key) ?? [];
      arr.push(p); byParent.set(key, arr);
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => (a.sort_order - b.sort_order) || a.name_ar.localeCompare(b.name_ar, "ar"));
    }
    const out: Array<{ position: any; depth: number }> = [];
    const seen = new Set<string>();
    const walk = (key: string, depth: number) => {
      for (const p of byParent.get(key) ?? []) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        out.push({ position: p, depth });
        walk(p.code, depth + 1);
      }
    };
    walk("__root__", 0);
    for (const p of positions) if (!seen.has(p.id)) out.push({ position: p, depth: 0 });
    return out;
  }, [data]);

  if (orgQ.isLoading) {
    return <div className="grid place-items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (orgQ.error || !data) {
    return (
      <div className="p-6 space-y-3" dir="rtl">
        <div className="text-destructive">تعذّر تحميل الهيكل التنظيمي: {(orgQ.error as Error)?.message}</div>
        <Button variant="outline" onClick={() => orgQ.refetch()}>
          <RefreshCw className="h-4 w-4 ml-1" /> إعادة المحاولة
        </Button>
      </div>
    );
  }

  const mappingsByPos = new Map<string, any[]>();
  for (const m of data.mappings as any[]) {
    const arr = mappingsByPos.get(m.position_id) ?? [];
    arr.push(m); mappingsByPos.set(m.position_id, arr);
  }
  const assignmentByPos = new Map<string, any>();
  for (const a of data.activeAssignments as any[]) assignmentByPos.set(a.position_id, a);

  const history = historyFor
    ? (data.assignments as any[]).filter((a) => a.position_id === historyFor.id)
    : [];

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الهيكل التنظيمي للكلية</h1>
          <p className="text-muted-foreground text-sm mt-1">
            المناصب الرسمية وربطها بالأدوار. تعيين شاغل للمنصب يمنحه أدوار المنصب تلقائياً، وإنهاء التعيين يسحبها.
          </p>
        </div>
        <Button onClick={() => { setEditPosition(null); setPositionDialogOpen(true); }}>
          <Plus className="h-4 w-4 ml-1" /> منصب جديد
        </Button>
      </div>

      <OrgRoleDriftPanel />

      <Card>
        <CardHeader><CardTitle>المناصب التنظيمية ({data.positions.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المنصب</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الشاغل الحالي</TableHead>
                <TableHead>الأدوار المرتبطة</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map(({ position: p, depth }) => {
                const maps = mappingsByPos.get(p.id) ?? [];
                const assignment = assignmentByPos.get(p.id);
                return (
                  <TableRow key={p.id} className={p.is_active ? "" : "opacity-60"}>
                    <TableCell className="font-medium">
                      <span style={{ paddingInlineStart: depth * 16 }} className="inline-block">
                        {depth > 0 && <span className="text-muted-foreground">└ </span>}
                        {p.name_ar}
                      </span>
                      <div className="text-[11px] text-muted-foreground font-mono">{p.code}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{UNIT_TYPE_AR[p.unit_type] ?? p.unit_type}</Badge></TableCell>
                    <TableCell>
                      {assignment ? (
                        <div className="text-sm">
                          <div>{assignment.user_name ?? assignment.user_email ?? assignment.user_id.slice(0, 8)}</div>
                          {assignment.user_email && (
                            <div className="text-[11px] text-muted-foreground">{assignment.user_email}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">— لا يوجد —</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {maps.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                          <ShieldAlert className="h-3 w-3" /> بدون صلاحيات تشغيلية
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {maps.map((m) => (
                            <Badge key={m.id} variant={m.is_active ? "default" : "secondary"}>
                              {m.roles_catalog?.name_ar ?? m.role_code}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "نشط" : "معطل"}</Badge>
                    </TableCell>
                    <TableCell className="text-left">
                      <div className="flex flex-wrap gap-1 justify-end">
                        <Button size="sm" variant="outline" disabled={!p.is_active}
                          onClick={() => { setOpenFor({ id: p.id, name: p.name_ar }); setSelectedUser(""); setNotes(""); }}>
                          <UserPlus className="h-4 w-4 ml-1" /> تعيين
                        </Button>
                        {assignment && (
                          <Button size="sm" variant="ghost" className="text-destructive"
                            onClick={() => endMut.mutate(assignment.id)} disabled={endMut.isPending}>
                            <UserMinus className="h-4 w-4 ml-1" /> إنهاء
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setRolesFor({ id: p.id, name_ar: p.name_ar })}>
                          <KeyRound className="h-4 w-4 ml-1" /> الأدوار
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditPosition(p as OrgPosition); setPositionDialogOpen(true); }}>
                          <Pencil className="h-4 w-4 ml-1" /> تعديل
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setHistoryFor({ id: p.id, name_ar: p.name_ar })}>
                          <History className="h-4 w-4 ml-1" /> السجل
                        </Button>
                        <Button size="sm" variant="ghost" disabled={activeMut.isPending}
                          onClick={() => activeMut.mutate({ id: p.id, active: !p.is_active })}>
                          <Power className="h-4 w-4 ml-1" /> {p.is_active ? "تعطيل" : "تفعيل"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Assign occupant */}
      <Dialog open={!!openFor} onOpenChange={(o) => !o && setOpenFor(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعيين شاغل للمنصب: {openFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">المستخدم</label>
              {usersQ.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل المستخدمين…
                </div>
              ) : usersQ.error ? (
                <div className="space-y-2">
                  <div className="text-sm text-destructive">
                    تعذّر تحميل المستخدمين: {(usersQ.error as Error).message}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => usersQ.refetch()}>
                    <RefreshCw className="h-4 w-4 ml-1" /> إعادة المحاولة
                  </Button>
                </div>
              ) : (usersQ.data ?? []).length === 0 ? (
                <div className="text-sm text-amber-600">لا توجد حسابات موظفين أو أعضاء هيئة تدريس متاحة للتعيين.</div>
              ) : (
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger><SelectValue placeholder="اختر مستخدماً" /></SelectTrigger>
                  <SelectContent>
                    {(usersQ.data ?? []).map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                سيتم إنهاء أي تعيين نشط سابق لهذا المنصب تلقائياً، مع سحب أدواره ومنحها للشاغل الجديد.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">ملاحظات (اختياري)</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenFor(null)}>إلغاء</Button>
            <Button
              disabled={!selectedUser || assignMut.isPending}
              onClick={() => openFor && assignMut.mutate({
                position_id: openFor.id, user_id: selectedUser, notes: notes || undefined,
              })}>
              {assignMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد التعيين"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Occupancy history */}
      <Dialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>سجل شاغلي المنصب: {historyFor?.name_ar}</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {history.length === 0 && <div className="text-sm text-muted-foreground">لا يوجد سجل تعيينات.</div>}
            {history.map((a: any) => (
              <div key={a.id} className="rounded-lg border p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{a.user_name ?? a.user_email ?? a.user_id.slice(0, 8)}</span>
                  <Badge variant={a.is_active ? "default" : "secondary"}>{a.is_active ? "نشط" : "منتهٍ"}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  من {a.assigned_from} {a.assigned_to ? `إلى ${a.assigned_to}` : "— حتى الآن"}
                </div>
                {a.notes && <div className="text-xs mt-1">{a.notes}</div>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <OrgPositionDialog
        open={positionDialogOpen}
        onOpenChange={(o) => { setPositionDialogOpen(o); if (!o) setEditPosition(null); }}
        position={editPosition}
        positions={data.positions as OrgPosition[]}
        departments={(data.departments ?? []) as any}
      />

      <OrgPositionRolesDialog
        open={!!rolesFor}
        onOpenChange={(o) => !o && setRolesFor(null)}
        position={rolesFor}
        mappings={data.mappings as any}
        roles={data.roles as any}
      />
    </div>
  );
}
