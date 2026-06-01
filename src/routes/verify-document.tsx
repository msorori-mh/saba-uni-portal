import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, XCircle, ShieldCheck, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/verify-document")({
  component: VerifyPage,
  head: () => ({
    meta: [
      { title: "التحقق من وثيقة رسمية" },
      { name: "description", content: "تحقق من صحة وثيقة رسمية صادرة عن الكلية باستخدام رقم الوثيقة أو رمز التحقق." },
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

function VerifyPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 6) return;
    setLoading(true);
    setResult(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("verify_document", { _query: query.trim() });
      if (error) throw error;
      setResult(data as VerifyResult);
    } catch (err) {
      setResult({ valid: false, reason: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-surface py-16 px-4">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-grid h-14 w-14 place-items-center rounded-2xl bg-gold-gradient text-primary mb-3">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="font-display text-3xl font-extrabold text-primary">التحقق من الوثائق الرسمية</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            أدخل رقم الوثيقة أو رمز التحقق للتأكد من صحتها.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl bg-card border border-border p-6 shadow-card space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-primary">رقم الوثيقة أو رمز التحقق</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="USR-2026-000001 أو SEED000001"
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
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            تحقق
          </button>
        </form>

        {result && (
          <div className={`mt-6 rounded-2xl border-2 p-6 ${
            result.valid ? "bg-emerald-50 border-emerald-500" : "bg-destructive/5 border-destructive"
          }`}>
            {result.valid ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  <span className="font-display text-lg font-extrabold text-emerald-700">وثيقة صحيحة</span>
                </div>
                <dl className="space-y-1 text-sm">
                  <div className="flex gap-2"><dt className="font-bold min-w-[120px]">النوع:</dt>
                    <dd>{TYPE_LABEL[result.document_type ?? ""] ?? result.document_type}</dd></div>
                  <div className="flex gap-2"><dt className="font-bold min-w-[120px]">رقم الوثيقة:</dt>
                    <dd className="font-mono">{result.document_number}</dd></div>
                  <div className="flex gap-2"><dt className="font-bold min-w-[120px]">الحالة:</dt>
                    <dd>صادرة</dd></div>
                  <div className="flex gap-2"><dt className="font-bold min-w-[120px]">تاريخ الإصدار:</dt>
                    <dd>{result.issued_at ? new Date(result.issued_at).toLocaleDateString("ar-EG") : "—"}</dd></div>
                </dl>
              </>
            ) : (
              <div className="flex items-start gap-2">
                <XCircle className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
                <div>
                  <div className="font-display text-lg font-extrabold text-destructive">
                    {result.reason === "not_found" ? "وثيقة غير موجودة" :
                     result.status === "cancelled" ? "وثيقة ملغاة" : "غير صالحة"}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    تأكد من صحة رقم الوثيقة أو رمز التحقق وأعد المحاولة.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
