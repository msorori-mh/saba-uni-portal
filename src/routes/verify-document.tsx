/**
 * PORTAL_STAFF_SELF_SERVICE_VALUE_ADDED_02E
 * Public authenticity check for signed staff documents (QR target).
 * The token is opaque; the page never reveals private, payroll or contact data.
 */

import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  verifyIssuedDocument,
  type StaffDocumentVerification,
} from "@/lib/staff-self-service-value-added";

const DOC_TYPE_AR: Record<string, string> = {
  employment_statement: "إفادة عمل",
  experience_certificate: "شهادة خبرة",
  training_certificate: "شهادة تدريب",
  clearance_certificate: "شهادة إخلاء طرف",
};

type VerifySearch = { token?: string; code?: string };
type StudentDocumentVerification = {
  valid: boolean;
  status?: string;
  document_type?: string;
  document_number?: string;
  issued_at?: string;
};

export const Route = createFileRoute("/verify-document")({
  validateSearch: (search: Record<string, unknown>): VerifySearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  head: () => ({
    meta: [
      { title: "التحقق من الوثائق الرسمية | كلية تكنولوجيا المعلومات وعلوم الحاسوب" },
      {
        name: "description",
        content:
          "تحقق من صحة الإفادات والشهادات الصادرة عن كلية تكنولوجيا المعلومات وعلوم الحاسوب باستخدام رمز التحقق المطبوع على الوثيقة.",
      },
      { property: "og:title", content: "التحقق من الوثائق الرسمية" },
      {
        property: "og:description",
        content: "خدمة التحقق من أصالة الوثائق الصادرة عن الكلية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifyDocumentPage,
});

function dateLabel(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone: "UTC",
  }).format(parsed);
}

function VerifyDocumentPage() {
  const search = Route.useSearch();
  const [token, setToken] = useState(search.code ?? search.token ?? "");
  const [documentAudience, setDocumentAudience] = useState<"student" | "staff">(
    search.token !== undefined ? "staff" : "student",
  );
  const [state, setState] = useState<StaffDocumentVerification | null>(null);
  const [studentState, setStudentState] = useState<StudentDocumentVerification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(search.code ?? search.token ?? "");
    setDocumentAudience(search.token !== undefined ? "staff" : "student");
    setState(null);
    setStudentState(null);
  }, [search.code, search.token]);

  async function check(value: string) {
    setLoading(true);
    setError(null);
    setState(null);
    setStudentState(null);
    try {
      if (documentAudience === "student") {
        const { data, error: verifyError } = await supabase.rpc("verify_document", { _query: value.trim() });
        if (verifyError) throw verifyError;
        setStudentState(data as StudentDocumentVerification);
      } else {
        setState(await verifyIssuedDocument(value));
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "تعذر إتمام التحقق حالياً.",
      );
    } finally {
      setLoading(false);
    }
  }

  const valid = state && state.result === "valid";

  return (
    <main dir="rtl" className="min-h-screen bg-background px-4 py-10">
      <div
        data-testid="staff-02e-public-verification"
        className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        {search.code !== undefined && <Link to="/mobile/student/documents" className="mb-4 inline-block text-xs font-bold text-primary">العودة إلى الوثائق</Link>}
        <h1 className="mb-1 flex items-center gap-2 text-lg font-bold text-foreground">
          <ShieldCheck className="h-5 w-5" />
          التحقق من الوثائق الرسمية
        </h1>
        <p className="mb-5 text-xs text-muted-foreground">
          أدخل رمز التحقق المطبوع على الوثيقة أو امسح رمز QR الخاص بها. لا تُعرض
          أي بيانات شخصية أو مالية في هذه الصفحة.
        </p>

        <div className="mb-4 flex gap-2" role="group" aria-label="نوع الوثيقة">
          {(["student", "staff"] as const).map((audience) => (
            <button key={audience} type="button"
              aria-pressed={documentAudience === audience}
              onClick={() => { setDocumentAudience(audience); setState(null); setStudentState(null); setError(null); }}
              className={`rounded-md border px-3 py-2 text-xs font-semibold ${documentAudience === audience ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}`}
            >
              {audience === "student" ? "وثيقة طالب" : "وثيقة موظف"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            aria-label="رمز التحقق"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="رمز التحقق"
            className="flex-1 rounded-md border border-border bg-background p-2 text-xs"
          />
          <button
            type="button"
            disabled={loading || token.trim().length === 0}
            onClick={() => void check(token)}
            className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "تحقق"
            )}
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {state && (
          <div
            data-testid="staff-02e-verification-result"
            className="mt-5 rounded-xl border border-border p-4 text-xs"
          >
            <p className="mb-2 flex items-center gap-2 text-sm font-bold">
              {valid ? (
                <BadgeCheck className="h-5 w-5 text-primary" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-destructive" />
              )}
              {state.result === "valid"
                ? "وثيقة صحيحة وصادرة عن الكلية"
                : state.result === "revoked"
                  ? "وثيقة ملغاة"
                  : state.result === "expired"
                    ? "وثيقة منتهية الصلاحية"
                    : "رمز تحقق غير صالح"}
            </p>
            {state.result !== "invalid" && (
              <dl className="grid grid-cols-2 gap-2 text-muted-foreground">
                <dt>الجهة المُصدِرة</dt>
                <dd>{state.issuer_ar}</dd>
                <dt>نوع الوثيقة</dt>
                <dd>
                  {DOC_TYPE_AR[state.document_type] ?? state.document_type}
                </dd>
                <dt>الرقم المرجعي</dt>
                <dd>{state.reference_no}</dd>
                <dt>صاحب الوثيقة</dt>
                <dd>{state.holder_label}</dd>
                <dt>تاريخ الإصدار</dt>
                <dd>{dateLabel(state.issued_at)}</dd>
                <dt>تاريخ الانتهاء</dt>
                <dd>{dateLabel(state.expires_at)}</dd>
              </dl>
            )}
          </div>
        )}
        {studentState && (
          <div role="status" className="mt-5 rounded-xl border border-border p-4 text-xs">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold">
              {studentState.valid ? <BadgeCheck className="h-5 w-5 text-primary" /> : <ShieldAlert className="h-5 w-5 text-destructive" />}
              {studentState.valid ? "وثيقة صحيحة وصادرة عن الكلية" : studentState.status === "cancelled" ? "وثيقة ملغاة" : "رمز تحقق غير صالح"}
            </p>
            {studentState.valid && <dl className="grid grid-cols-2 gap-2 text-muted-foreground">
              <dt>نوع الوثيقة</dt><dd>{studentState.document_type === "enrollment_certificate" ? "شهادة قيد" : studentState.document_type ?? "—"}</dd>
              <dt>الرقم المرجعي</dt><dd>{studentState.document_number ?? "—"}</dd>
              <dt>تاريخ الإصدار</dt><dd>{dateLabel(studentState.issued_at ?? null)}</dd>
            </dl>}
          </div>
        )}
      </div>
    </main>
  );
}
