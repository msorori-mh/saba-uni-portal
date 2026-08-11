import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck } from "lucide-react";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { CouncilAuthorizationMatrixPanel } from "@/components/councils/CouncilAuthorizationMatrixPanel";
import { runCouncilAuthorizationAudit } from "@/lib/councils-authorization-audit.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/faculty-portal/academic-councils/authorization-audit")({
  head: () => ({
    meta: [
      { title: "فحص صلاحيات المجالس — المجالس الأكاديمية" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CouncilAuthorizationAuditPage,
});

function CouncilAuthorizationAuditPage() {
  const runAudit = useServerFn(runCouncilAuthorizationAudit);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["council-authorization-audit"],
    queryFn: () => runAudit({ data: undefined }),
    staleTime: 60_000,
  });

  return (
    <FacultyPortalShell>
      <div className="space-y-6 p-4 md:p-6" dir="rtl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold">
              <ShieldCheck className="h-5 w-5 text-primary" />
              فحص صلاحيات الأدوار في المجالس
            </h1>
            <p className="text-sm text-muted-foreground">
              فحص تلقائي للقراءة فقط يتحقق أن سياسات الرئيس وأمين السر والعضو ومسؤول
              التكليف تعمل بالطريقة نفسها في مجلس الكلية ومجالس الأقسام.
            </p>
          </div>
          <Button onClick={() => refetch()} disabled={isFetching} variant="outline">
            {isFetching ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
            إعادة الفحص
          </Button>
        </header>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري تشغيل الفحص...
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "تعذر تشغيل الفحص."}
          </p>
        ) : data ? (
          <CouncilAuthorizationMatrixPanel report={data} />
        ) : null}
      </div>
    </FacultyPortalShell>
  );
}
