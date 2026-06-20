import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, UserPlus, UserMinus, ShieldAlert } from "lucide-react";
import {
  listOrgStructure, listAssignableUsers, assignPosition, endAssignment,
} from "@/lib/org-structure.functions";
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

function OrgStructurePage() {
  const listFn = useServerFn(listOrgStructure);
  const usersFn = useServerFn(listAssignableUsers);
  const assignFn = useServerFn(assignPosition);
  const endFn = useServerFn(endAssignment);
  const qc = useQueryClient();

  const orgQ = useQuery({ queryKey: ["org-structure"], queryFn: () => listFn({ data: {} as any }) });
  const usersQ = useQuery({ queryKey: ["org-assignable-users"], queryFn: () => usersFn({ data: {} as any }) });

  const [openFor, setOpenFor] = useState<{ id: string; name: string } | null>(null);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [notes, setNotes] = useState("");

  const assignMut = useMutation({
    mutationFn: (vars: { position_id: string; user_id: string; notes?: string }) =>
      assignFn({ data: vars }),
    onSuccess: () => {
      toast.success("تم تعيين الشاغل");
      qc.invalidateQueries({ queryKey: ["org-structure"] });
      setOpenFor(null); setSelectedUser(""); setNotes("");
    },
    onError: (e: any) => toast.error(e.message ?? "تعذّر التعيين"),
  });

  const endMut = useMutation({
    mutationFn: (id: string) => endFn({ data: { assignment_id: id } }),
    onSuccess: () => {
      toast.success("تم إنهاء التعيين");
      qc.invalidateQueries({ queryKey: ["org-structure"] });
    },
    onError: (e: any) => toast.error(e.message ?? "تعذّر إنهاء التعيين"),
  });

  if (orgQ.isLoading) {
    return <div className="grid place-items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (orgQ.error) {
    return <div className="p-6 text-destructive">تعذّر تحميل الهيكل التنظيمي: {(orgQ.error as Error).message}</div>;
  }

  const data = orgQ.data!;
  const mappingsByPos = new Map<string, any[]>();
  for (const m of data.mappings) {
    const arr = mappingsByPos.get(m.position_id) ?? [];
    arr.push(m); mappingsByPos.set(m.position_id, arr);
  }
  const assignmentByPos = new Map<string, any>();
  for (const a of data.assignments) assignmentByPos.set(a.position_id, a);

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">الهيكل التنظيمي للكلية</h1>
        <p className="text-muted-foreground text-sm mt-1">
          المناصب الرسمية وربطها بالأدوار التشغيلية. الصلاحيات لا تُمنح مباشرة من المنصب،
          بل تمر عبر: المنصب ← ربط الدور ← الدور التشغيلي.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>المناصب التنظيمية</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المنصب</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الشاغل الحالي</TableHead>
                <TableHead>الدور التشغيلي</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.positions.map((p: any) => {
                const maps = mappingsByPos.get(p.id) ?? [];
                const assignment = assignmentByPos.get(p.id);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name_ar}</TableCell>
                    <TableCell><Badge variant="outline">{p.unit_type}</Badge></TableCell>
                    <TableCell>
                      {assignment ? (
                        <span className="text-sm">{assignment.user_email ?? assignment.user_id.slice(0, 8)}</span>
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
                      <Badge variant={p.is_active ? "default" : "secondary"}>
                        {p.is_active ? "نشط" : "معطل"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-left">
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline"
                          onClick={() => { setOpenFor({ id: p.id, name: p.name_ar }); setSelectedUser(""); setNotes(""); }}>
                          <UserPlus className="h-4 w-4 ml-1" /> تعيين
                        </Button>
                        {assignment && (
                          <Button size="sm" variant="ghost" className="text-destructive"
                            onClick={() => endMut.mutate(assignment.id)} disabled={endMut.isPending}>
                            <UserMinus className="h-4 w-4 ml-1" /> إنهاء
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!openFor} onOpenChange={(o) => !o && setOpenFor(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعيين شاغل للمنصب: {openFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">المستخدم</label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger><SelectValue placeholder="اختر مستخدماً" /></SelectTrigger>
                <SelectContent>
                  {(usersQ.data ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                سيتم إنهاء أي تعيين نشط سابق لهذا المنصب تلقائياً.
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
    </div>
  );
}
