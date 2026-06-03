import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  FileWarning,
  AlertCircle,
  RefreshCw,
  Loader2,
  ExternalLink,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/mobile/student/requests")({
  head: () => ({ meta: [{ title: "الطلبات" }] }),
  component: MobileStudentRequests,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as unknown as { from: (t: string) => any; auth: any };

type RequestType = {
  id: string;
  code: string;
  name_ar: string;
  description_ar: string | null;
  is_active: boolean;
};

type RequestRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  submitted_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  request_type: string;
};

type Data = {
  requests: RequestRow[];
  types: RequestType[];
};

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft: { text: "مسودة", cls: "bg-muted text-foreground" },
  submitted: { text: "مُرسَل", cls: "bg-blue-100 text-blue-800" },
  under_review: { text: "قيد المراجعة", cls: "bg-amber-100 text-amber-800" },
  approved: { text: "مقبول", cls: "bg-emerald-100 text-emerald-800" },
  rejected: { text: "مرفوض", cls: "bg-rose-100 text-rose-800" },
  cancelled: { text: "ملغي", cls: "bg-zinc-200 text-zinc-800" },
};

// Codes for which the existing student portal already supports submission.
const SUPPORTED_CODES = new Set([
  "absence_excuse",
  "enrollment_suspension",
  "extra_chance",
  "transfer",
  "equivalency",
  "grade_appeal",
]);

async function fetchData(): Promise<Data> {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) throw new Error("غير مسجل الدخول");
  const { data: profile, error: pErr } = await sb
    .from("student_profiles")
    .select("id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile?.id) return { requests: [], types: [] };

  const [reqRes, typeRes] = await Promise.all([
    sb
      .from("student_requests")
      .select("id, title, description, status, submitted_at, rejection_reason, created_at, request_type")
      .eq("student_profile_id", profile.id)
      .order("created_at", { ascending: false }),
    sb
      .from("request_types")
      .select("id, code, name_ar, description_ar, is_active")
      .order("sort_order", { ascending: true }),
  ]);
  if (reqRes.error) throw reqRes.error;
  if (typeRes.error) throw typeRes.error;
  return {
    requests: (reqRes.data ?? []) as RequestRow[],
    types: (typeRes.data ?? []) as RequestType[],
  };
}

function MobileStudentRequests() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["mobile-student", "requests"],
    queryFn: fetchData,
    staleTime: 60_000,
  });

  if (isLoading) return <ListSkeleton />;
  if (isError) {
    return (
      <ErrorBox
        message={error instanceof Error ? error.message : "تعذر تحميل الطلبات"}
        onRetry={() => refetch()}
        busy={isFetching}
      />
    );
  }

  const requests = data?.requests ?? [];
  const types = (data?.types ?? []).filter((t) => t.is_active);
  const typeLabel = (code: string) => types.find((t) => t.code === code)?.name_ar ?? code;

  return (
    <div className="px-4 py-5 space-y-5" dir="rtl">
      <header>
        <h1 className="font-display text-lg font-extrabold text-primary flex items-center gap-2">
          <FileWarning className="h-5 w-5 text-gold" /> الطلبات الطلابية
        </h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          تتبع طلباتك وحالتها. لإنشاء طلب جديد استخدم بوابة الطالب.
        </p>
      </header>

      {/* Available request types */}
      <section>
        <h2 className="font-display text-sm font-extrabold text-primary mb-2">
          أنواع الطلبات المتاحة
        </h2>
        {types.length === 0 ? (
          <EmptyMini text="لا توجد أنواع طلبات مفعّلة." />
        ) : (
          <div className="space-y-2">
            {types.map((t) => {
              const supported = SUPPORTED_CODES.has(t.code);
              return (
                <div
                  key={t.id}
                  className="rounded-xl border bg-card p-3 shadow-card flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-primary truncate">{t.name_ar}</div>
                    {t.description_ar && (
                      <div className="text-[11px] text-muted-foreground line-clamp-2">
                        {t.description_ar}
                      </div>
                    )}
                  </div>
                  {supported ? (
                    <Link
                      to="/student"
                      hash="requests"
                      className="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2.5 py-1.5 text-[11px] font-bold"
                    >
                      <ExternalLink className="h-3 w-3" /> تقديم
                    </Link>
                  ) : (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                      <Clock className="h-3 w-3" /> قريباً
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* My requests */}
      <section>
        <h2 className="font-display text-sm font-extrabold text-primary mb-2">طلباتي</h2>
        {requests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
            <FileWarning className="h-7 w-7 text-muted-foreground/60 mx-auto mb-2" />
            <div className="text-sm font-bold text-primary">لا توجد طلبات حالياً.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => {
              const st = STATUS_LABEL[r.status] ?? { text: r.status, cls: "bg-muted" };
              return (
                <div key={r.id} className="rounded-xl border bg-card p-3 shadow-card">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-muted-foreground">
                        {typeLabel(r.request_type)}
                      </div>
                      <div className="font-bold text-sm text-primary truncate">{r.title}</div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${st.cls}`}>
                      {st.text}
                    </span>
                  </div>
                  {r.description && (
                    <div className="mt-1 text-[11px] text-muted-foreground line-clamp-3">
                      {r.description}
                    </div>
                  )}
                  <div className="mt-2 text-[10px] text-muted-foreground font-mono flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>أُنشئ: {r.created_at.slice(0, 10)}</span>
                    {r.submitted_at && <span>أُرسل: {r.submitted_at.slice(0, 10)}</span>}
                  </div>
                  {r.status === "rejected" && r.rejection_reason && (
                    <div className="mt-1 text-[11px] text-rose-700">
                      سبب الرفض: {r.rejection_reason}
                    </div>
                  )}
                </div>
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
