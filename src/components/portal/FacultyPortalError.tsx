import { Link, useRouter } from "@tanstack/react-router";
import { ShieldAlert, TriangleAlert } from "lucide-react";
import { retryRouteError } from "@/lib/route-error-recovery";

/**
 * Error boundary for the /faculty-portal route tree.
 *
 * Deliberately renders NO technical details (no raw exception text, no UUIDs,
 * no SQL): a generic Arabic message plus recovery actions that keep the
 * faculty member inside their portal.
 */
export function FacultyPortalError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div
        className="max-w-md text-center"
        role="alert"
        aria-live="assertive"
        data-testid="faculty-portal-error-fallback"
      >
        <TriangleAlert className="mx-auto h-10 w-10 text-gold" aria-hidden />
        <h1 className="mt-4 font-display text-xl font-extrabold text-primary">
          تعذّر تحميل الصفحة
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          حدث خطأ غير متوقع أثناء عرض هذه الصفحة. يمكنك المحاولة مرة أخرى أو العودة إلى بوابتك.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              void retryRouteError({
                reset,
                invalidate: () => router.invalidate(),
                error,
                reload: () => window.location.reload(),
              });
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            حاول مرة أخرى
          </button>
          <Link
            to="/faculty-portal"
            className="inline-flex items-center justify-center rounded-md border border-gold/40 px-4 py-2 text-sm font-bold text-primary transition-colors hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            العودة إلى بوابتي
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Not-found fallback scoped to the /faculty-portal route tree. */
export function FacultyPortalNotFound() {
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center" data-testid="faculty-portal-not-found">
        <ShieldAlert className="mx-auto h-10 w-10 text-gold" aria-hidden />
        <h1 className="mt-4 font-display text-xl font-extrabold text-primary">الصفحة غير موجودة</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          عذراً، الصفحة التي تبحث عنها غير متوفرة ضمن بوابة عضو هيئة التدريس.
        </p>
        <div className="mt-6">
          <Link
            to="/faculty-portal"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            العودة إلى بوابتي
          </Link>
        </div>
      </div>
    </div>
  );
}
