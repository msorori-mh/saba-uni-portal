import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FormEvent, useMemo, useState } from "react";
import { FilePlus2, Loader2 } from "lucide-react";
import {
  createStudentServiceRequest,
  getStudentRequestTypesForStudent,
  saveStudentServiceRequestDraft,
  submitStudentServiceRequest,
} from "@/lib/student-affairs.functions";

export const Route = createFileRoute("/student/requests/new")({
  component: NewStudentRequestPage,
});

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

  const { data: types = [], isLoading } = useQuery({
    queryKey: ["student-affairs", "types"],
    queryFn: () => typesFn({ data: {} }),
  });

  const selectedType = useMemo(() => types.find((type: any) => type.code === requestType), [types, requestType]);

  const create = async (submit: boolean) => {
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
      if (submit) await submitFn({ data: { requestId: created.id } });
      navigate({ to: "/student/requests/$id", params: { id: created.id } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void create(true);
  };

  return (
    <div dir="rtl" className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-extrabold text-primary flex items-center gap-2">
          <FilePlus2 className="h-6 w-6 text-gold" /> تقديم طلب شؤون طلاب
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">اختر نوع الطلب وأدخل البيانات الأساسية. يمكن حفظه كمسودة أو إرساله مباشرة.</p>
      </header>

      <form onSubmit={onSubmit} className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
        {error && <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <label className="block space-y-1">
          <span className="text-xs font-bold text-primary">نوع الطلب</span>
          <select required value={requestType} onChange={(e) => setRequestType(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">{isLoading ? "جاري التحميل..." : "اختر نوع الطلب"}</option>
            {types.map((type: any) => <option key={type.code} value={type.code}>{type.name_ar}</option>)}
          </select>
        </label>

        {selectedType && (
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
            <div className="font-bold text-primary mb-1">المتطلبات</div>
            <div>{selectedType.description_ar ?? "يرجى تعبئة بيانات الطلب بدقة وإرفاق المستندات المطلوبة إن وجدت."}</div>
            {selectedType.requires_attachment && <div className="mt-1 text-amber-700 font-bold">هذا النوع يتطلب مرفقاً داعماً.</div>}
          </div>
        )}

        <label className="block space-y-1">
          <span className="text-xs font-bold text-primary">موضوع الطلب</span>
          <input required value={subject} onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold text-primary">تفاصيل الطلب</span>
          <textarea required rows={6} value={details} onChange={(e) => setDetails(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </label>

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy || !requestType || !subject} onClick={() => create(false)}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-bold text-primary disabled:opacity-50">
            {busy === "draft" && <Loader2 className="h-4 w-4 animate-spin" />} حفظ كمسودة
          </button>
          <button type="submit" disabled={!!busy || !requestType || !subject || !details}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {busy === "submit" && <Loader2 className="h-4 w-4 animate-spin" />} إرسال الطلب
          </button>
        </div>
      </form>
    </div>
  );
}
