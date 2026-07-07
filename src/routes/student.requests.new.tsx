import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FormEvent, useMemo, useState } from "react";
import { AlertCircle, FilePlus2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createStudentServiceRequest,
  getStudentRequestTypesForStudent,
  saveStudentServiceRequestDraft,
  submitStudentServiceRequest,
} from "@/lib/student-affairs.functions";
import { STUDENT_REQUEST_INELIGIBLE_DEFAULT_MSG } from "@/lib/student-request-rpc";

export const Route = createFileRoute("/student/requests/new")({
  component: NewStudentRequestPage,
});

type RequestTypeOption = {
  id: string;
  code: string;
  name_ar: string;
  description_ar: string | null;
  requires_attachment: boolean;
  is_eligible: boolean;
  is_disabled: boolean;
  disabled_reason: string | null;
};

function NewStudentRequestPage() {
  const navigate = useNavigate();
  const typesFn = useServerFn(getStudentRequestTypesForStudent);
  const createFn = useServerFn(createStudentServiceRequest);
  const saveFn = useServerFn(saveStudentServiceRequestDraft);
  const submitFn = useServerFn(submitStudentServiceRequest);
  const [requestType, setRequestType] = useState("");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: types = [], isLoading, error: typesError } = useQuery({
    queryKey: ["student-affairs", "types"],
    queryFn: () => typesFn({ data: {} }),
  });

  const typedTypes = types as RequestTypeOption[];
  const selectedType = useMemo(
    () => typedTypes.find((type) => type.code === requestType),
    [typedTypes, requestType],
  );
  const selectableTypes = typedTypes.filter((t) => t.is_eligible && !t.is_disabled);
  const allDisabled =
    typedTypes.length > 0 && typedTypes.every((t) => t.is_disabled || !t.is_eligible);
  const ineligibleBanner =
    allDisabled
      ? (typedTypes[0]?.disabled_reason ?? STUDENT_REQUEST_INELIGIBLE_DEFAULT_MSG)
      : null;

  const canSubmitForm =
    !!selectedType &&
    selectedType.is_eligible &&
    !selectedType.is_disabled &&
    !!subject.trim() &&
    !!details.trim();

  const create = async (submit: boolean) => {
    if (!selectedType?.is_eligible || selectedType.is_disabled) return;
    setBusy(submit ? "submit" : "draft");
    setError(null);
    try {
      const created = await createFn({
        data: {
          requestType,
          title: subject,
          formData: { subject, details },
          studentNotes: details,
        },
      });
      await saveFn({
        data: {
          requestId: created.id,
          title: subject,
          formData: { subject, details },
          studentNotes: details,
        },
      });
      if (submit) {
        await submitFn({ data: { requestId: created.id } });
        toast.success("تم إرسال الطلب", { description: "انتقل الطلب إلى حالة: مُرسَل — بانتظار المراجعة." });
      } else {
        toast.success("تم حفظ المسودة");
      }
      navigate({ to: "/student/requests/$id", params: { id: created.id } });
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error("تعذر تنفيذ العملية", { description: msg });
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void create(true);
  };

  const pickType = (code: string, disabled: boolean) => {
    if (disabled) return;
    setRequestType(code);
  };

  return (
    <div dir="rtl" className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-extrabold text-primary flex items-center gap-2">
          <FilePlus2 className="h-6 w-6 text-gold" /> تقديم طلب شؤون طلاب
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          اختر نوع الطلب وأدخل البيانات الأساسية. يمكن حفظه كمسودة أو إرساله مباشرة.
        </p>
      </header>

      {(typesError || error) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {(typesError as Error | null)?.message ?? error}
        </div>
      )}

      {ineligibleBanner && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-2"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{ineligibleBanner}</span>
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-5 shadow-card space-y-3">
        <h2 className="text-sm font-bold text-primary">أنواع الطلبات المتاحة</h2>
        {isLoading ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : typedTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد أنواع طلبات متاحة حالياً.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {typedTypes.map((type) => {
              const disabled = type.is_disabled || !type.is_eligible;
              const selected = requestType === type.code;
              return (
                <button
                  key={type.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => pickType(type.code, disabled)}
                  className={`rounded-lg border p-3 text-right transition-colors ${
                    disabled
                      ? "cursor-not-allowed border-border/60 bg-muted/40 opacity-60"
                      : selected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-background hover:bg-secondary/30"
                  }`}
                >
                  <div className="font-bold text-sm text-primary">{type.name_ar}</div>
                  {type.description_ar && (
                    <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {type.description_ar}
                    </div>
                  )}
                  {disabled && type.disabled_reason && (
                    <div className="mt-2 text-[11px] font-bold text-amber-800">
                      {type.disabled_reason}
                    </div>
                  )}
                  {type.requires_attachment && !disabled && (
                    <div className="mt-1 text-[11px] font-bold text-amber-700">يتطلب مرفقاً</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <form onSubmit={onSubmit} className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
        {selectableTypes.length > 0 && !requestType && (
          <p className="text-xs text-muted-foreground">اختر نوع الطلب من القائمة أعلاه للمتابعة.</p>
        )}

        {selectedType && (
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
            <div className="font-bold text-primary mb-1">المتطلبات — {selectedType.name_ar}</div>
            <div>
              {selectedType.description_ar ??
                "يرجى تعبئة بيانات الطلب بدقة وإرفاق المستندات المطلوبة إن وجدت."}
            </div>
            {selectedType.requires_attachment && (
              <div className="mt-1 text-amber-700 font-bold">هذا النوع يتطلب مرفقاً داعماً.</div>
            )}
          </div>
        )}

        <label className="block space-y-1">
          <span className="text-xs font-bold text-primary">موضوع الطلب</span>
          <input
            required
            disabled={!selectedType || selectedType.is_disabled}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-primary">تفاصيل الطلب</span>
          <textarea
            required
            rows={6}
            disabled={!selectedType || selectedType.is_disabled}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy || !canSubmitForm}
            onClick={() => create(false)}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold text-primary disabled:opacity-50"
          >
            {busy === "draft" && <Loader2 className="h-4 w-4 animate-spin" />} حفظ كمسودة
          </button>
          <button
            type="submit"
            disabled={!!busy || !canSubmitForm}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy === "submit" && <Loader2 className="h-4 w-4 animate-spin" />} إرسال الطلب
          </button>
        </div>
      </form>
    </div>
  );
}
