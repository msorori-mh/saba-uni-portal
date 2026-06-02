import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2, GraduationCap } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getMyProgress } from "@/lib/academic-status.functions";
import { ProgressSummary, DegreeAudit, EligibilityCard } from "@/components/academic/ProgressSummary";

export const Route = createFileRoute("/student/progress")({
  head: () => ({ meta: [{ title: "تقدمي الأكاديمي — بوابة الطالب" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: StudentProgressPage,
});

function StudentProgressPage() {
  const fetchMine = useServerFn(getMyProgress);
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-progress"],
    queryFn: () => fetchMine(),
  });

  return (
    <div dir="rtl" className="container mx-auto px-4 py-6 max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-extrabold text-primary">تقدمي الأكاديمي</h1>
            <p className="text-xs text-muted-foreground">ملخص ما أنجزته، ما تبقى، وحالتك الأكاديمية وأهلية التخرج.</p>
          </div>
        </div>
        <Link to="/student" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-gold">
          <ArrowRight className="h-4 w-4" /> الرجوع
        </Link>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : error ? (
        <div className="rounded-xl border bg-red-50 border-red-200 p-4 text-sm text-red-700">{(error as any).message}</div>
      ) : data ? (
        <>
          <ProgressSummary d={data} />
          <Tabs defaultValue="audit">
            <TabsList>
              <TabsTrigger value="audit">تدقيق المقررات</TabsTrigger>
              <TabsTrigger value="eligibility">أهلية التخرج</TabsTrigger>
            </TabsList>
            <TabsContent value="audit" className="mt-4"><DegreeAudit d={data} /></TabsContent>
            <TabsContent value="eligibility" className="mt-4"><EligibilityCard d={data} /></TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  );
}
