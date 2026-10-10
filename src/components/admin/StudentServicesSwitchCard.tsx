/**
 * STUDENT-SERVICES-GLOBAL-SWITCH-01 — admin card «الخدمات الطلابية».
 *
 * One switch: temporarily pause / resume every NEW student-service request.
 * Authorization is server-side (assertAdmin + the database RPC); for anyone
 * who is not admin | system_admin the card is read-only.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PauseCircle, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import {
  getAdminStudentServicesSwitch,
  setAdminStudentServicesSwitch,
} from "@/lib/student-requests/student-services-switch.functions";
import {
  STUDENT_SERVICES_DISABLED_DEFAULT_MESSAGE_AR,
  STUDENT_SERVICES_MESSAGE_MAX_LENGTH,
  validateStudentServicesMessage,
  type StudentServicesAdminView,
} from "@/lib/student-requests/student-services-switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const QUERY_KEY = ["admin-student-services-switch"] as const;

export function StudentServicesSwitchCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getAdminStudentServicesSwitch);
  const setFn = useServerFn(setAdminStudentServicesSwitch);

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: (): Promise<StudentServicesAdminView> => getFn(),
    retry: 1,
  });

  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMessage(data?.messageAr ?? "");
  }, [data?.messageAr]);

  if (isLoading) {
    return (
      <section className="grid place-items-center rounded-lg border bg-card p-6" aria-busy="true">
        <Loader2 className="h-5 w-5 animate-spin" />
      </section>
    );
  }
  if (isError || !data) {
    return (
      <section
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
      >
        تعذر تحميل حالة الخدمات الطلابية.
      </section>
    );
  }

  const canEdit = data.canManage && data.installed;
  const messageCheck = validateStudentServicesMessage(message);
  const messageChanged = (messageCheck.ok ? messageCheck.value : message) !== (data.messageAr ?? null);

  const apply = async (enabled: boolean) => {
    if (!messageCheck.ok) {
      toast.error(messageCheck.messageAr);
      return;
    }
    setSaving(true);
    try {
      await setFn({ data: { enabled, message: messageCheck.value } });
      toast.success(
        enabled === data.enabled
          ? "تم حفظ الرسالة"
          : enabled
            ? "تم تفعيل الخدمات الطلابية"
            : "تم إيقاف الخدمات الطلابية مؤقتًا",
      );
      await qc.invalidateQueries({ queryKey: QUERY_KEY });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر حفظ حالة الخدمات الطلابية");
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  const onToggle = (next: boolean) => {
    if (!canEdit || saving) return;
    // Disabling affects every student: always confirm first.
    if (!next) setConfirmOpen(true);
    else void apply(true);
  };

  return (
    <section
      dir="rtl"
      data-testid="student-services-switch-card"
      className="space-y-3 rounded-lg border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-primary">
            {data.enabled ? (
              <PlayCircle className="h-4 w-4 text-emerald-600" />
            ) : (
              <PauseCircle className="h-4 w-4 text-amber-600" />
            )}
            الخدمات الطلابية
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            إيقاف مؤقت لجميع الخدمات الطلابية لدى الطلاب (البوابة وتطبيق الجوال). أثناء الإيقاف لا
            يستطيع الطالب بدء طلب جديد أو إرسال مسودة، ويبقى بإمكانه متابعة طلباته السابقة وتنزيل وثائقه
            الصادرة وإعادة إرسال طلب أُعيد إليه للاستكمال. معالجة الموظفين للطلبات الجارية لا تتأثر.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            data-testid="student-services-switch-state"
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              data.enabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
            }`}
          >
            {data.enabled ? "مفعّلة" : "متوقفة مؤقتًا"}
          </span>
          <Switch
            dir="ltr"
            checked={data.enabled}
            onCheckedChange={onToggle}
            disabled={!canEdit || saving}
            aria-label="تفعيل أو إيقاف الخدمات الطلابية مؤقتًا"
          />
        </div>
      </div>

      {!data.installed ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          هذه الميزة تحتاج تطبيق الترحيل المعتمد على قاعدة البيانات قبل استخدامها. الخدمات تعمل حاليًا
          كالمعتاد.
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="student-services-message" className="text-xs">
          رسالة تظهر للطلاب أثناء الإيقاف (اختيارية — مثل السبب وموعد العودة المتوقع)
        </Label>
        <Textarea
          id="student-services-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={STUDENT_SERVICES_MESSAGE_MAX_LENGTH}
          rows={2}
          disabled={!canEdit || saving}
          placeholder={STUDENT_SERVICES_DISABLED_DEFAULT_MESSAGE_AR}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>
            نص عادي فقط، بحد أقصى {STUDENT_SERVICES_MESSAGE_MAX_LENGTH} حرفًا. عند تركها فارغة تظهر
            الرسالة الافتراضية.
          </span>
          <span dir="ltr">
            {message.length}/{STUDENT_SERVICES_MESSAGE_MAX_LENGTH}
          </span>
        </div>
        {!messageCheck.ok ? (
          <p role="alert" className="text-xs font-bold text-destructive">
            {messageCheck.messageAr}
          </p>
        ) : null}
        {canEdit && messageChanged ? (
          <Button
            size="sm"
            variant="outline"
            disabled={saving || !messageCheck.ok}
            onClick={() => void apply(data.enabled)}
          >
            حفظ الرسالة
          </Button>
        ) : null}
      </div>

      <p className="text-[11px] text-muted-foreground" data-testid="student-services-switch-last-change">
        {data.updatedAt && data.hasBeenChanged
          ? `آخر تغيير: ${new Date(data.updatedAt).toLocaleString("ar-EG")}${
              data.updatedByName ? ` — بواسطة ${data.updatedByName}` : ""
            }`
          : "لم تُغيَّر الحالة منذ تفعيل الميزة."}
      </p>

      {!data.canManage ? (
        <p className="text-[11px] font-bold text-muted-foreground">
          تغيير هذه الحالة متاح لمدير النظام فقط.
        </p>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !saving && setConfirmOpen(open)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إيقاف الخدمات الطلابية مؤقتًا؟</AlertDialogTitle>
            <AlertDialogDescription>
              لن يتمكن أي طالب من بدء طلب جديد أو إرسال مسودة حتى تعيد التفعيل. الطلبات الجارية
              ومعالجة الموظفين وتنزيل الوثائق الصادرة لا تتأثر. سيُسجَّل هذا الإجراء في سجل التدقيق.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md border bg-muted/30 p-3 text-xs leading-5">
            <div className="mb-1 font-bold">الرسالة التي ستظهر للطلاب:</div>
            <div className="whitespace-pre-line break-words">
              {(messageCheck.ok ? messageCheck.value : null) ??
                STUDENT_SERVICES_DISABLED_DEFAULT_MESSAGE_AR}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>تراجع</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving || !messageCheck.ok}
              onClick={(e) => {
                e.preventDefault();
                void apply(false);
              }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "نعم، أوقف الخدمات"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
