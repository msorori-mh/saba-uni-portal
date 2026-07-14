import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, ShieldCheck, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/verify-document")({
  component: VerifyPage,
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  head: () => ({
    meta: [
      { title: "التحقق من وثيقة رسمية" },
      {
        name: "description",
        content: "تحقق من صحة وثيقة رسمية صادرة عن الكلية باستخدام رقم الوثيقة أو رمز التحقق.",
      },
    ],
  }),
});

type VerifyResult = {
  valid: boolean;
  reason?: string;
  document_type?: string;
  document_number?: string;
  status?: string;
  issued_at?: string;
};

const TYPE_LABEL: Record<string, string> = {
  enrollment_certificate: "شهادة قيد",
  student_status_certificate: "إفادة بالحالة الدراسية",
  official_transcript: "السجل الأكاديمي الرسمي",
  financial_receipt: "سند مالي رسمي",
};

const STATUS_LABEL: Record<string, string> = {
  issued: "صادرة",
  archived: "مؤرشفة",
  cancelled: "ملغاة",
  draft: "مسودة",
};

function VerifyPage() {
  const { code } = Route.useSearch();
  const [query, setQuery] = useState(code ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const runVerify = async (q: string) => {
    if (q.trim().length < 6) return;
    setLoading(true);
    setResult(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("verify_document", { _query: q.trim() });
      if (error) throw error;
      setResult(data as VerifyResult);
    } catch (err) {
      setResult({ valid: false, reason: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  // Auto-verify if code arrived via QR scan
  useEffect(() => {
    if (code && code.length >= 6) {
      void runVerify(code);
    }
  }, [code]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runVerify(query);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-surface py-16 px-4">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-grid h-14 w-14 place-items-center rounded-2xl bg-gold-gradient text-primary mb-3">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="font-display text-3xl font-extrabold text-primary">
            التحقق من الوثائق الرسمية
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            أدخل رقم الوثيقة أو رمز التحقق للتأكد من صحتها، أو امسح رمز QR من الوثيقة مباشرة.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-card border border-border p-6 shadow-card space-y-4"
        >
          <label className="block">
            <span className="text-sm font-bold text-primary">رقم الوثيقة أو رمز التحقق</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="USR-2026-000001"
              className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm font-mono"
              required
              minLength={6}
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            تحقق
          </button>
        </form>

        {loading && !result && (
          <div className="mt-6 text-center text-sm text-muted-foreground">جارٍ التحقق...</div>
        )}

        {result && (
          <div
            className={`mt-6 rounded-2xl border-2 overflow-hidden ${
              result.valid ? "border-emerald-500" : "border-destructive"
            }`}
          >
            <div
              className={`px-6 py-4 flex items-center gap-3 ${
                result.valid ? "bg-emerald-500 text-white" : "bg-destructive text-white"
              }`}
            >
              {result.valid ? (
                <CheckCircle2 className="h-7 w-7" />
              ) : (
                <XCircle className="h-7 w-7" />
              )}
              <div>
                <div className="font-display text-xl font-extrabold">
                  {result.valid
                    ? "وثيقة صحيحة ومعتمدة"
                    : result.status === "cancelled"
                      ? "وثيقة ملغاة"
                      : result.reason === "not_found"
                        ? "وثيقة غير موجودة"
                        : "وثيقة غير صالحة"}
                </div>
                <div className="text-xs opacity-90 mt-0.5">
                  {result.valid
                    ? "تم التحقق من صحة الوثيقة عبر بوابة الجامعة"
                    : "تأكد من صحة المدخلات وأعد المحاولة"}
                </div>
              </div>
            </div>
            {result.valid && (
              <div className="bg-white p-6">
                <dl className="space-y-2 text-sm">
                  <div className="flex gap-2 border-b border-dashed border-border pb-2">
                    <dt className="font-bold text-primary min-w-[140px]">نوع الوثيقة:</dt>
                    <dd>{TYPE_LABEL[result.document_type ?? ""] ?? result.document_type}</dd>
                  </div>
                  <div className="flex gap-2 border-b border-dashed border-border pb-2">
                    <dt className="font-bold text-primary min-w-[140px]">الرقم المرجعي:</dt>
                    <dd className="font-mono">{result.document_number}</dd>
                  </div>
                  <div className="flex gap-2 border-b border-dashed border-border pb-2">
                    <dt className="font-bold text-primary min-w-[140px]">الحالة:</dt>
                    <dd>
                      <span className="inline-block rounded bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs font-bold">
                        {STATUS_LABEL[result.status ?? ""] ?? result.status ?? "—"}
                      </span>
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="font-bold text-primary min-w-[140px]">تاريخ الإصدار:</dt>
                    <dd>
                      {result.issued_at
                        ? new Date(result.issued_at).toLocaleDateString("ar-EG", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
            {!result.valid && result.status === "cancelled" && (
              <div className="bg-white p-6 text-sm text-muted-foreground">
                هذه الوثيقة ملغاة أو مستبدلة ولا تُعتمد للتحقق العام.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
