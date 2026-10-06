/**
 * STUDENT-SERVICES-GLOBAL-SWITCH-01 — student-facing notice and route gate.
 *
 * Presentation only. Hiding or disabling a button here is NOT the control:
 * the database guard and the server gate refuse a new request regardless.
 */
import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2, PauseCircle } from "lucide-react";
import { getStudentServicesStatus } from "@/lib/student-requests/student-services-switch.functions";
import {
  STUDENT_SERVICES_DISABLED_SCOPE_NOTE_AR,
  resolveStudentServicesNoticeAr,
  type StudentServicesStatus,
} from "@/lib/student-requests/student-services-switch";
import { useStudentRequestRoutes } from "@/lib/student-requests/surface";
import { getB1UiAdapter } from "@/lib/student-requests/b1-ui";

export const STUDENT_SERVICES_STATUS_QUERY_KEY = ["student-services", "status"] as const;

/** Current switch state for the signed-in user (web portal and mobile app). */
export function useStudentServicesStatus() {
  const statusFn = useServerFn(getStudentServicesStatus);
  const query = useQuery({
    queryKey: STUDENT_SERVICES_STATUS_QUERY_KEY,
    queryFn: (): Promise<StudentServicesStatus> => statusFn(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  return {
    isLoading: query.isLoading,
    /** true only when the server explicitly said the services are paused. */
    paused: query.data ? query.data.enabled === false : false,
    messageAr: query.data?.messageAr ?? null,
  };
}

/** Banner shown above the services list and instead of a new-request form. */
export function StudentServicesPausedBanner({ messageAr }: { messageAr: string | null }) {
  return (
    <div
      role="alert"
      dir="rtl"
      data-testid="student-services-paused-banner"
      className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200"
    >
      <div className="flex items-start gap-3">
        <PauseCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 space-y-1.5">
          <p className="whitespace-pre-line break-words text-sm font-bold leading-6">
            {resolveStudentServicesNoticeAr(messageAr)}
          </p>
          <p className="text-xs leading-5">{STUDENT_SERVICES_DISABLED_SCOPE_NOTE_AR}</p>
        </div>
      </div>
    </div>
  );
}

/** Disabled (not hidden) stand-in for a "تقديم طلب" button while paused. */
export function StudentServicesPausedButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      data-testid="student-services-paused-action"
      title="الخدمات الطلابية متوقفة مؤقتًا"
      className={
        className ??
        "inline-flex cursor-not-allowed items-center rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs font-bold text-muted-foreground"
      }
    >
      متوقفة مؤقتًا
    </button>
  );
}

/**
 * Wraps a new-request form route (deep links included).
 *  - enabled                -> the form
 *  - paused                 -> the notice instead of the form
 *  - paused + a request of `resumeB1ServiceCode` that staff RETURNED -> the
 *    form (resubmitting a returned request is not a new service)
 */
export function StudentServicesNewRequestGate({
  children,
  resumeB1ServiceCode,
}: {
  children: ReactNode;
  resumeB1ServiceCode?: string;
}) {
  const routes = useStudentRequestRoutes();
  const { isLoading, paused, messageAr } = useStudentServicesStatus();

  const returnedQuery = useQuery({
    queryKey: ["student-services", "returned-b1", resumeB1ServiceCode ?? null],
    enabled: paused && Boolean(resumeB1ServiceCode),
    queryFn: async () => {
      const rows = await getB1UiAdapter().listB1StudentRequests();
      return rows.some(
        (row) => row.serviceCode === resumeB1ServiceCode && row.status === "returned",
      );
    },
    staleTime: 0,
    retry: 0,
  });

  if (isLoading || (paused && resumeB1ServiceCode && returnedQuery.isLoading)) {
    // Never mount the form (it creates a draft on load) before the state is known.
    return (
      <div className="grid place-items-center rounded-xl border border-border bg-card p-8" aria-busy="true">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!paused || returnedQuery.data === true) return <>{children}</>;

  return (
    <div dir="rtl" className="space-y-3" data-testid="student-services-paused-gate">
      <StudentServicesPausedBanner messageAr={messageAr} />
      <Link
        to={routes.list}
        className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-4 text-sm font-bold text-primary"
      >
        <ArrowRight className="h-4 w-4" /> العودة إلى طلباتي السابقة
      </Link>
    </div>
  );
}
