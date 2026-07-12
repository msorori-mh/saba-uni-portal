import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldOff, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  deactivateStaffProfile,
  deleteStaffProfileSafely,
  getStaffDeletionPreflight,
} from "@/lib/admin-staff-deletion.functions";

type StaffDeleteDialogProps = {
  staff: {
    id: string;
    full_name_ar: string;
    employee_number?: string | null;
    user_id?: string | null;
    email?: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
};

const dependencyLabels: Array<[string, string]> = [
  ["processingAssignmentsCount", "تكليفات معالجة الطلبات"],
  ["workflowStepsAssignedCount", "خطوات الطلبات المسندة"],
  ["staffProfileDepartmentsCount", "ارتباطات الأقسام"],
  ["positionAssignmentsCount", "تكليفات المناصب"],
  ["notificationsCount", "الإشعارات"],
  ["auditLogsCount", "سجلات التدقيق"],
];

export function staffDeleteConfirmationMatches(expected: string, actual: string) {
  return actual.trim() === expected.trim();
}

export function StaffDeleteDialog({ staff, open, onOpenChange, onChanged }: StaffDeleteDialogProps) {
  const qc = useQueryClient();
  const preflightFn = useServerFn(getStaffDeletionPreflight);
  const deleteFn = useServerFn(deleteStaffProfileSafely);
  const deactivateFn = useServerFn(deactivateStaffProfile);
  const [confirmationText, setConfirmationText] = useState("");
  const [busyAction, setBusyAction] = useState<"delete" | "deactivate" | null>(null);
  const [deleteResult, setDeleteResult] = useState<{
    authUserDeleted: boolean;
    staffProfileDeleted: boolean;
    partialFailure: boolean;
  } | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setConfirmationText("");
      setDeleteResult(null);
      setResultMessage(null);
      setWarning(null);
      setBusyAction(null);
    }
  }, [open]);

  const query = useQuery({
    queryKey: ["admin-staff-deletion-preflight", staff.id],
    queryFn: () => preflightFn({ data: { staffProfileId: staff.id } }),
    enabled: open,
  });

  const preflight = query.data;
  const hasAuthUser = Boolean(preflight?.user_id ?? staff.user_id);
  const canConfirm = useMemo(
    () => Boolean(preflight?.canHardDelete) && staffDeleteConfirmationMatches(preflight?.full_name_ar ?? staff.full_name_ar, confirmationText),
    [confirmationText, preflight?.canHardDelete, preflight?.full_name_ar, staff.full_name_ar],
  );

  const refreshStaffQueries = () => {
    qc.invalidateQueries({ queryKey: ["admin-staff-management"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["people-stats"] });
    onChanged();
  };

  const handleDeactivate = async () => {
    setBusyAction("deactivate");
    setWarning(null);
    setResultMessage(null);
    setDeleteResult(null);
    try {
      const res = await deactivateFn({ data: { staffProfileId: staff.id } });
      toast.success("تم تعطيل ملف الموظف");
      if (res.warning) toast.warning(res.warning);
      refreshStaffQueries();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذّر تعطيل ملف الموظف";
      setWarning(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async () => {
    if (!preflight || !canConfirm) return;
    setBusyAction("delete");
    setWarning(null);
    setResultMessage(null);
    setDeleteResult(null);
    try {
      const res = await deleteFn({
        data: {
          staffProfileId: staff.id,
          expectedFullName: preflight.full_name_ar,
          expectedEmployeeNumber: preflight.employee_number,
          confirmationText,
          deleteAuthUser: Boolean(preflight.user_id),
        },
      });
      setDeleteResult({
        authUserDeleted: res.authUserDeleted,
        staffProfileDeleted: res.staffProfileDeleted,
        partialFailure: res.partialFailure,
      });
      setResultMessage(res.messageAr);
      setWarning(res.warning ?? null);
      if (res.partialFailure) {
        toast.error("حدث فشل جزئي أثناء الحذف");
        refreshStaffQueries();
        return;
      }
      toast.success(res.messageAr);
      refreshStaffQueries();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذّر حذف الموظف";
      setWarning(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Trash2 className="h-5 w-5" /> فحص الحذف / حذف نهائي
          </DialogTitle>
          <DialogDescription className="text-right">
            يتم فحص الارتباطات قبل السماح بالحذف النهائي. حذف حساب الدخول من Auth إجراء دائم ولا يمكن التراجع عنه.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-secondary/30 p-3 text-sm">
            <div className="font-bold text-primary">{preflight?.full_name_ar ?? staff.full_name_ar}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              الرقم الوظيفي: <span className="font-mono">{preflight?.employee_number ?? staff.employee_number ?? "—"}</span>
              {" · "}
              حساب الدخول: <span dir="ltr">{preflight?.email ?? staff.email ?? (hasAuthUser ? "موجود" : "لا يوجد")}</span>
            </div>
          </div>

          {query.isLoading ? (
            <div className="p-8 grid place-items-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : query.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">
              {query.error instanceof Error ? query.error.message : "تعذّر فحص الحذف"}
            </div>
          ) : preflight ? (
            <>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-primary">نتائج فحص الارتباطات</h4>
                  <Badge variant={preflight.canHardDelete ? "secondary" : "destructive"}>
                    {preflight.canHardDelete ? "الحذف النهائي مسموح" : "الحذف النهائي محظور"}
                  </Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {dependencyLabels.map(([key, label]) => (
                    <div key={key} className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="float-left font-mono font-bold">{(preflight as any)[key] ?? "تعذّر الفحص"}</span>
                    </div>
                  ))}
                </div>
              </div>

              {preflight.blockingReasons.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
                  <div className="font-bold">أسباب منع الحذف النهائي:</div>
                  <ul className="mt-2 list-disc space-y-1 pr-5">
                    {preflight.blockingReasons.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                </div>
              )}

              {preflight.canHardDelete && (
                <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <div className="text-sm font-bold text-destructive">
                    اكتب الاسم الكامل بالعربية لتأكيد الحذف النهائي:
                  </div>
                  <input
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    placeholder={preflight.full_name_ar}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {hasAuthUser
                      ? "سيتم حذف ملف الموظف وحساب الدخول المرتبط من Auth بشكل دائم."
                      : "سيتم حذف ملف الموظف فقط؛ لا يوجد حساب دخول مرتبط."}
                  </p>
                </div>
              )}

              {!preflight.canHardDelete && preflight.canDeactivate && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                  يمكن تعطيل ملف الموظف بدلاً من الحذف النهائي. هذا لا يمنع تسجيل الدخول تلقائياً؛ منع الدخول يبقى عبر زر تعطيل حساب الدخول الموجود في جدول الموظفين.
                </div>
              )}
            </>
          ) : null}

          {(deleteResult || resultMessage || warning) && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
              {resultMessage && <div className="font-bold">{resultMessage}</div>}
              {deleteResult?.partialFailure && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="rounded border border-amber-500/30 bg-background/70 px-3 py-2">
                    حساب الدخول: {deleteResult.authUserDeleted ? "تم حذفه" : "لم يُحذف"}
                  </div>
                  <div className="rounded border border-amber-500/30 bg-background/70 px-3 py-2">
                    ملف الموظف: {deleteResult.staffProfileDeleted ? "تم حذفه" : "لم يُحذف"}
                  </div>
                </div>
              )}
              {warning && <div className="mt-1">{warning}</div>}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
          {preflight?.canDeactivate && (
            <Button type="button" variant="secondary" disabled={Boolean(busyAction)} onClick={handleDeactivate}>
              {busyAction === "deactivate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
              تعطيل الملف
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            disabled={!canConfirm || Boolean(busyAction)}
            onClick={handleDelete}
          >
            {busyAction === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {hasAuthUser ? "حذف الموظف وحساب الدخول" : "حذف ملف الموظف"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
