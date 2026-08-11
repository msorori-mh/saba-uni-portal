import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, UserMinus, UserPlus } from "lucide-react";
import {
  allowsMultipleActiveAssignees,
  createProcessingAssignment,
  deactivateProcessingAssignment,
  isFacultyOnlyRoleCode,
  listAssignmentCandidates,
  listProcessingAssignments,
} from "@/lib/admin-processing-assignments.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/processing-assignments")({
  head: () => ({
    meta: [
      { title: "ممثلو أدوار الطلبات — لوحة الإدارة" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ProcessingAssignmentsPage,
});

type OpenState = {
  role_id: string;
  role_code: string;
  role_name: string;
  unit_name: string;
  is_managerial: boolean;
} | null;

function ProcessingAssignmentsPage() {
  const listFn = useServerFn(listProcessingAssignments);
  const candFn = useServerFn(listAssignmentCandidates);
  const createFn = useServerFn(createProcessingAssignment);
  const deactivateFn = useServerFn(deactivateProcessingAssignment);
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["processing-assignments"],
    queryFn: () => listFn({ data: {} as never }),
  });

  const [openFor, setOpenFor] = useState<OpenState>(null);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [notes, setNotes] = useState("");

  const candQ = useQuery({
    enabled: !!openFor,
    queryKey: ["processing-assignment-candidates", openFor?.role_code],
    queryFn: () => candFn({ data: { role_code: openFor!.role_code } }),
  });

  const createMut = useMutation({
    mutationFn: (vars: { role_id: string; user_id: string; notes?: string }) =>
      createFn({ data: vars }),
    onSuccess: (res: { warning?: string } | undefined) => {
      if (res?.warning) toast.warning(res.warning);
      else toast.success("تم إسناد الدور بنجاح");
      qc.invalidateQueries({ queryKey: ["processing-assignments"] });
      setOpenFor(null);
      setSelectedUser("");
      setNotes("");
    },
    onError: (e: Error) => toast.error(e.message ?? "تعذّر الإسناد"),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: string) => deactivateFn({ data: { assignment_id: id } }),
    onSuccess: (res: { warning?: string } | undefined) => {
      if (res?.warning) toast.warning(res.warning);
      else toast.success("تم تعطيل الإسناد");
      qc.invalidateQueries({ queryKey: ["processing-assignments"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "تعذّر التعطيل"),
  });

  const grouped = useMemo(() => {
    const data = listQ.data;
    if (!data) return null;
    const unitById = new Map(data.units.map((u) => [u.id, u]));
    const assignsByRole = new Map<string, typeof data.assignments>();
    for (const a of data.assignments) {
      const arr = assignsByRole.get(a.role_id ?? "") ?? [];
      arr.push(a);
      assignsByRole.set(a.role_id ?? "", arr);
    }
    return data.roles
      .map((r) => ({
        role: r,
        unit: unitById.get(r.unit_id) ?? null,
        active: assignsByRole.get(r.id) ?? [],
      }))
      .sort((a, b) => {
        const ua = a.unit?.sort_order ?? 0;
        const ub = b.unit?.sort_order ?? 0;
        if (ua !== ub) return ua - ub;
        return (a.role.sort_order ?? 0) - (b.role.sort_order ?? 0);
      });
  }, [listQ.data]);

  if (listQ.isLoading) {
    return (
      <div className="grid place-items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (listQ.error) {
    return (
      <div className="p-6 text-destructive">
        تعذّر تحميل الإسنادات: {(listQ.error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">ممثلو أدوار الطلبات</h1>
        <p className="text-muted-foreground text-sm mt-1">
          إسناد المستخدمين إلى مسميات المعالجة لكل جهة. الأدوار الإدارية تحتفظ
          بإسناد نشط واحد، بينما أدوار المختصين تدعم عدة ممثلين متزامنين. نطاق
          أقسام المختص يُضبط من{" "}
          <Link to="/admin/staff-management" className="underline text-primary">
            إدارة الموظفين
          </Link>{" "}
          عبر ربط صريح بأقسام نشطة (وليس «كل أقسام الكلية»).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>الأدوار والإسنادات النشطة</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الوحدة التشغيلية</TableHead>
                <TableHead>الدور التشغيلي</TableHead>
                <TableHead>الموظف</TableHead>
                <TableHead>الأقسام المخولة</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-left">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(grouped ?? []).map(({ role, unit, active }) => {
                const multi = allowsMultipleActiveAssignees(role);
                const canAssign =
                  !!role.is_active &&
                  !!unit?.is_active &&
                  (multi || active.length === 0);
                return (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">
                      {unit?.name_ar ?? "—"}
                      {unit && !unit.is_active && (
                        <Badge variant="secondary" className="mr-2">معطلة</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{role.name_ar}</span>
                        {role.is_managerial ? (
                          <Badge variant="outline" className="text-xs">إداري</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">مختص</Badge>
                        )}
                        {isFacultyOnlyRoleCode(role.code) && (
                          <Badge variant="outline" className="text-xs">هيئة تدريس</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {active.length === 0 ? (
                        <span className="text-xs text-muted-foreground">— لا يوجد —</span>
                      ) : (
                        <ul className="space-y-2 text-sm">
                          {active.map((cur) => (
                            <li key={cur.id} className="flex items-start justify-between gap-2">
                              <div>
                                <div>{cur.user_name ?? "—"}</div>
                                <div className="text-xs text-muted-foreground">
                                  {cur.user_email ?? cur.user_id?.slice(0, 8)}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive shrink-0"
                                onClick={() => deactivateMut.mutate(cur.id)}
                                disabled={deactivateMut.isPending}
                              >
                                <UserMinus className="h-4 w-4 ml-1" /> تعطيل
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell>
                      {active.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <ul className="space-y-2 text-xs">
                          {active.map((cur) => (
                            <li key={`${cur.id}-depts`}>
                              {role.is_managerial ? (
                                <span className="text-muted-foreground">نطاق الكلية</span>
                              ) : (cur.department_names?.length ?? 0) > 0 ? (
                                <span title={(cur.department_names ?? []).join("، ")}>
                                  {(cur.department_names ?? []).join("، ")}
                                </span>
                              ) : (
                                <span className="text-destructive">
                                  لا أقسام مخولة — يُرفض التشغيل
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={role.is_active ? "default" : "secondary"}>
                        {role.is_active ? "نشط" : "معطل"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-left">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canAssign}
                        onClick={() => {
                          setOpenFor({
                            role_id: role.id,
                            role_code: role.code,
                            role_name: role.name_ar,
                            unit_name: unit?.name_ar ?? "",
                            is_managerial: !!role.is_managerial,
                          });
                          setSelectedUser("");
                          setNotes("");
                        }}
                      >
                        <UserPlus className="h-4 w-4 ml-1" /> إسناد
                      </Button>
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
            <DialogTitle>
              إسناد الدور: {openFor?.role_name}
              {openFor?.unit_name ? ` (${openFor.unit_name})` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">
                {openFor && isFacultyOnlyRoleCode(openFor.role_code)
                  ? "عضو هيئة التدريس"
                  : "الموظف"}
              </label>
              <Select value={selectedUser} onValueChange={setSelectedUser} disabled={candQ.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={candQ.isLoading ? "جارٍ التحميل…" : "اختر مستخدماً"} />
                </SelectTrigger>
                <SelectContent>
                  {(candQ.data?.candidates ?? []).map((c) => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.name}
                      {c.employee_number ? ` — ${c.employee_number}` : ""}
                      {c.email ? ` (${c.email})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {openFor && isFacultyOnlyRoleCode(openFor.role_code) && (
                <p className="text-xs text-muted-foreground mt-1">
                  هذا الدور محصور بأعضاء هيئة التدريس فقط.
                </p>
              )}
              {openFor && !openFor.is_managerial && (
                <p className="text-xs text-muted-foreground mt-1">
                  بعد الإسناد، اضبط الأقسام المخولة من إدارة الموظفين. نطاق
                  المختص صريح fail-closed ولا يرث الأقسام الجديدة تلقائياً.
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">ملاحظات (اختياري)</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenFor(null)}>إلغاء</Button>
            <Button
              disabled={!selectedUser || createMut.isPending}
              onClick={() =>
                openFor &&
                createMut.mutate({
                  role_id: openFor.role_id,
                  user_id: selectedUser,
                  notes: notes || undefined,
                })
              }
            >
              {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد الإسناد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
