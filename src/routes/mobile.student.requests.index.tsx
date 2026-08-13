import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  FileWarning,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import {
  getMyStudentServiceRequests,
  getStudentRequestTypesForStudent,
} from "@/lib/student-affairs.functions";
import { STUDENT_REQUEST_INELIGIBLE_DEFAULT_MSG } from "@/lib/student-request-rpc";
import {
  filterStudentRequestTypesForDisplay,
  getStudentRequestTypeDisplayName,
} from "@/lib/student-requests/request-type-registry";

export const Route = createFileRoute("/mobile/student/requests/")({
  head: () => ({ meta: [{ title: "الطلبات" }] }),
  component: MobileStudentRequests,
});

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft: { text: "مسودة", cls: "bg-muted text-foreground" },
  submitted: { text: "مُرسَل", cls: "bg-blue-100 text-blue-800" },
  under_review: { text: "قيد المراجعة", cls: "bg-amber-100 text-amber-800" },
  in_review: { text: "قيد المراجعة", cls: "bg-amber-100 text-amber-800" },
  returned: { text: "يحتاج استكمال", cls: "bg-orange-100 text-orange-800" },
  returned_for_completion: { text: "يحتاج استكمال", cls: "bg-orange-100 text-orange-800" },
  approved: { text: "مقبول", cls: "bg-emerald-100 text-emerald-800" },
  rejected: { text: "مرفوض", cls: "bg-rose-100 text-rose-800" },
  cancelled: { text: "ملغي", cls: "bg-zinc-200 text-zinc-800" },
};

function MobileStudentRequests() {
  const typesFn = useServerFn(getStudentRequestTypesForStudent);
  const listFn = useServerFn(getMyStudentServiceRequests);

  const typesQuery = useQuery({
    queryKey: ["mobile-student", "request-types"],
    queryFn: () => typesFn({ data: {} }),
    staleTime: 60_000,
  });

  const requestsQuery = useQuery({
    queryKey: ["mobile-student", "requests"],
    queryFn: () => listFn({ data: {} }),
    staleTime: 60_000,
  });

  const isLoading = typesQuery.isLoading || requestsQuery.isLoading;
  const isError = typesQuery.isError || requestsQuery.isError;
  const error = typesQuery.error ?? requestsQuery.error;
  const refetch = () => {
    void typesQuery.refetch();
    void requestsQuery.refetch();
  };
  const isFetching = typesQuery.isFetching || requestsQuery.isFetching;

  if (isLoading) return <ListSkeleton />;
  if (isError) {
    return (
      <ErrorBox
        message={error instanceof Error ? error.message : "تعذر تحميل الطلبات"}
        onRetry={refetch}
        busy={isFetching}
      />
    );
  }

  const types = filterStudentRequestTypesForDisplay(
    (typesQuery.data ?? []) as Array<{
      id: string;
      code: string;
      name_ar: string;
      description_ar: string | null;
      requires_attachment?: boolean;
      is_eligible: boolean;
      is_disabled: boolean;
      disabled_reason: string | null;
    }>,
  );
  const requests = (requestsQuery.data ?? []) as Array<{
    id: string;
    title: string;
    status: string;
    submitted_at: string | null;
    created_at: string;
    request_type: string;
    request_type_name_ar: string | null;
    rejection_reason?: string | null;
    description?: string | null;
  }>;

  const allDisabled = types.length > 0 && types.every((t) => t.is_disabled || !t.is_eligible);
  const ineligibleMsg = allDisabled
    ? (types[0]?.disabled_reason ?? STUDENT_REQUEST_INELIGIBLE_DEFAULT_MSG)
    : null;

  return (
    <div className="px-4 py-5 space-y-5" dir="rtl">
      <header>
        <h1 className="font-display text-lg font-extrabold text-primary flex items-center gap-2">
          <FileWarning className="h-5 w-5 text-gold" /> الطلبات الطلابية
        </h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          تتبع طلباتك وحالتها. تقديم الطلبات الجديدة يتم عبر بوابة المتصفح — بمسار إرسال
          موحّد. أنواع تتطلب مرفقات غير متاحة للإرسال حتى يُفعَّل نظام الرفع.
        </p>
      </header>

      {ineligibleMsg && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900 flex gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{ineligibleMsg}</span>
        </div>
      )}

      <section>
        <h2 className="font-display text-sm font-extrabold text-primary mb-2">
          أنواع الطلبات
        </h2>
        {types.length === 0 ? (
          <EmptyMini text="لا توجد أنواع طلبات متاحة." />
        ) : (
          <div className="space-y-2">
            {types.map((t) => {
              const disabled = t.is_disabled || !t.is_eligible;
              return (
                <div
                  key={t.id}
                  className={`rounded-2xl border border-border bg-card shadow-card p-3 shadow-card flex items-center justify-between gap-2 ${
                    disabled ? "opacity-60" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-primary truncate">{t.name_ar}</div>
                    {t.description_ar && (
                      <div className="text-[11px] text-muted-foreground line-clamp-2">
                        {t.description_ar}
                      </div>
                    )}
                    {disabled && t.disabled_reason && (
                      <div className="text-[10px] font-bold text-amber-800 mt-1">
                        {t.disabled_reason}
                      </div>
                    )}
                    {t.requires_attachment && !disabled && (
                      <div className="text-[10px] font-bold text-amber-800 mt-1">
                        يتطلب إرفاق مستند
                      </div>
                    )}
                  </div>
                  {!disabled ? (
                    <Link
                      to="/mobile/student/requests/new"
                      search={{ type: t.code }}
                      className="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2.5 py-1.5 text-[11px] font-bold"
                    >
                      <Plus className="h-3 w-3" /> تقديم
                    </Link>
                  ) : (
                    <span className="shrink-0 text-[10px] font-bold text-muted-foreground px-2 py-0.5">
                      غير متاح
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-sm font-extrabold text-primary mb-2">طلباتي</h2>
        {requests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
            <FileWarning className="h-7 w-7 text-muted-foreground/60 mx-auto mb-2" />
            <div className="text-sm font-bold text-primary">لا توجد طلبات حالياً.</div>
            <Link to="/mobile/student/requests/new" className="mt-2 inline-block text-xs font-bold text-primary underline">
              تقديم طلب جديد
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => {
              const st = STATUS_LABEL[r.status] ?? { text: r.status, cls: "bg-muted" };
              return (
                <Link
                  key={r.id}
                  to="/mobile/student/requests/$id"
                  params={{ id: r.id }}
                  className="block rounded-2xl border border-border bg-card shadow-card p-3 shadow-card"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-muted-foreground">
                        {getStudentRequestTypeDisplayName(r.request_type, r.request_type_name_ar)}
                      </div>
                      <div className="font-bold text-sm text-primary truncate">{r.title}</div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${st.cls}`}>
                      {st.text}
                    </span>
                  </div>
                  <div className="mt-2 text-[10px] text-muted-foreground font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>أُنشئ: {r.created_at.slice(0, 10)}</span>
                    {r.submitted_at && <span>أُرسل: {r.submitted_at.slice(0, 10)}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function ErrorBox({
  message,
  onRetry,
  busy,
}: {
  message: string;
  onRetry: () => void;
  busy: boolean;
}) {
  return (
    <div className="px-4 py-6">
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
        <AlertCircle className="h-6 w-6 text-destructive mx-auto mb-2" />
        <div className="text-sm font-bold text-destructive mb-1">تعذر التحميل</div>
        <div className="text-[11px] text-muted-foreground mb-3">{message}</div>
        <button
          onClick={onRetry}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          إعادة المحاولة
        </button>
      </div>
    </div>
  );
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-[11px] text-muted-foreground">
      {text}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="px-4 py-5 space-y-4" dir="rtl">
      <div className="h-6 w-40 bg-muted rounded animate-pulse" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
      ))}
    </div>
  );
}
