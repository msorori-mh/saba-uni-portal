import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  ShieldCheck,
  Eye,
  AlertCircle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { openExternalUrl } from "@/lib/native/external-links";

export const Route = createFileRoute("/mobile/student/documents/")({
  head: () => ({ meta: [{ title: "الوثائق الرسمية" }] }),
  component: MobileStudentDocuments,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as unknown as { from: (t: string) => any; auth: any };

type DocRow = {
  id: string;
  document_type: string;
  document_number: string;
  verification_code: string;
  status: string;
  issued_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  enrollment_certificate: "شهادة قيد",
  student_status_certificate: "إفادة بالحالة الدراسية",
  official_transcript: "السجل الأكاديمي الرسمي",
  financial_receipt: "سند مالي رسمي",
};

const STATUS: Record<string, { text: string; cls: string }> = {
  issued: { text: "صادرة", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { text: "ملغاة", cls: "bg-destructive/10 text-destructive" },
  draft: { text: "مسودة", cls: "bg-muted text-muted-foreground" },
};

async function fetchDocs(): Promise<DocRow[]> {
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) throw new Error("غير مسجل الدخول");
  const { data: profile, error: pErr } = await sb
    .from("student_profiles")
    .select("id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile?.id) return [];
  const { data, error } = await sb
    .from("official_documents")
    .select("id, document_type, document_number, verification_code, status, issued_at")
    .eq("student_profile_id", profile.id)
    .order("issued_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DocRow[];
}

function MobileStudentDocuments() {
  const { data: docs = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["mobile-student", "documents"],
    queryFn: fetchDocs,
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="px-4 py-5 space-y-3" dir="rtl">
        <div className="h-6 w-40 bg-muted rounded animate-pulse" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-4 py-6">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
          <AlertCircle className="h-6 w-6 text-destructive mx-auto mb-2" />
          <div className="text-sm font-bold text-destructive mb-1">تعذر تحميل الوثائق</div>
          <div className="text-[11px] text-muted-foreground mb-3">
            {error instanceof Error ? error.message : "حدث خطأ غير متوقع"}
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold disabled:opacity-60"
          >
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="px-4 py-6">
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
          <div className="text-sm font-bold text-primary">لا توجد وثائق رسمية حالياً.</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            يمكنك طلبها من شؤون الطلاب.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 space-y-4" dir="rtl">
      <header>
        <h1 className="font-display text-lg font-extrabold text-primary flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-gold" /> الوثائق الرسمية
        </h1>
      </header>

      <div className="space-y-2">
        {docs.map((d) => {
          const st = STATUS[d.status] ?? { text: d.status, cls: "bg-muted text-foreground" };
          return (
            <div key={d.id} className="rounded-2xl border border-border bg-card shadow-card p-3 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-primary text-sm leading-tight">
                      {TYPE_LABEL[d.document_type] ?? d.document_type}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                      {d.document_number}
                    </div>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${st.cls}`}>
                  {st.text}
                </span>
              </div>

              <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5">
                <div>
                  تاريخ الإصدار:{" "}
                  <span className="font-mono">
                    {new Date(d.issued_at).toLocaleDateString("ar-EG")}
                  </span>
                </div>
                <div>
                  رمز التحقق: <span className="font-mono">{d.verification_code}</span>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => void openExternalUrl(`/document-view/${d.id}`)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
                >
                  <Eye className="h-3.5 w-3.5" /> عرض الوثيقة
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void openExternalUrl(
                      `/verify-document?code=${encodeURIComponent(d.verification_code)}`,
                    )
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-primary"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> تحقق
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
