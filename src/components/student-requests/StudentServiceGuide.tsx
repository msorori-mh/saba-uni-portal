import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Compass, Loader2 } from "lucide-react";
import { askStudentServiceGuide } from "@/lib/student-service-guide.functions";
import type { ServiceGuideResult } from "@/lib/student-service-guide.server";
import { normalizeStudentRequestTypeCode } from "@/lib/student-requests/request-type-registry";
import { isB1ServiceCode } from "@/lib/student-requests/b1-ui";

export function StudentServiceGuide({ variant }: { variant: "web" | "mobile" }) {
  const ask = useServerFn(askStudentServiceGuide);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ServiceGuideResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (question.trim().length < 5 || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await ask({ data: { question } });
      if (res.ok) setResult(res.result);
      else setError(res.error);
    } catch (err) {
      console.error("[service-guide]", err);
      setError("تعذّر الحصول على إجابة، حاول مرة أخرى.");
    } finally {
      setLoading(false);
    }
  }

  const code = result?.matched_service_code ? normalizeStudentRequestTypeCode(result.matched_service_code) : null;
  const compact = variant === "mobile";

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" dir="rtl" aria-label="مساعد الخدمات">
      <div className="flex items-center gap-2">
        <Compass className="h-5 w-5 text-gold shrink-0" />
        <h2 className={compact ? "text-sm font-bold text-primary" : "text-base font-bold text-primary"}>
          مساعد الخدمات الذكي
        </h2>
      </div>
      <p className="text-xs text-muted-foreground">
        صف حالتك أو استفسارك، وسنقترح عليك الخدمة المناسبة ومتطلباتها وخطوات التقديم.
      </p>
      <form onSubmit={submit} className="space-y-2">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, 1500))}
          rows={compact ? 3 : 4}
          placeholder="مثال: تغيبت عن الاختبار النهائي بسبب مرض، ماذا أفعل؟"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={loading || question.trim().length < 5}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "جارٍ التحليل…" : "اقترح لي"}
        </button>
      </form>

      {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

      {result ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          {result.matched_service_name ? (
            <p className="font-bold text-primary">الخدمة المقترحة: {result.matched_service_name}</p>
          ) : (
            <p className="font-bold text-muted-foreground">لم نجد خدمة مطابقة ضمن الخدمات المتاحة لك.</p>
          )}
          {result.summary ? <p className="leading-6">{result.summary}</p> : null}
          {result.requirements.length ? (
            <div>
              <h3 className="mb-1 font-bold">المتطلبات</h3>
              <ul className="list-disc space-y-1 pr-5">
                {result.requirements.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          ) : null}
          {result.steps.length ? (
            <div>
              <h3 className="mb-1 font-bold">الخطوات</h3>
              <ol className="list-decimal space-y-1 pr-5">
                {result.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          ) : null}
          {result.notes ? <p className="text-xs text-muted-foreground">{result.notes}</p> : null}
          {code && result.can_apply ? (
            variant === "web" ? (
              isB1ServiceCode(code) ? (
                <Link to="/student/requests/b1/$service" params={{ service: code }} className="inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                  تقديم الطلب الآن
                </Link>
              ) : (
                <Link to="/student/requests/new" search={{ type: result.matched_service_code! }} className="inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                  تقديم الطلب الآن
                </Link>
              )
            ) : isB1ServiceCode(code) ? (
              <Link to="/mobile/student/requests/b1/$service" params={{ service: code }} className="inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                تقديم الطلب الآن
              </Link>
            ) : (
              <Link to="/mobile/student/requests/new" search={{ type: result.matched_service_code! }} className="inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                تقديم الطلب الآن
              </Link>
            )
          ) : null}
          <p className="text-[11px] text-muted-foreground">إجابة إرشادية آلية؛ تبقى شروط الخدمة الرسمية هي المرجع.</p>
        </div>
      ) : null}
    </section>
  );
}
