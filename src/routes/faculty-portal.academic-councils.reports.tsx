import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Loader2 } from "lucide-react";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { CouncilReportsView } from "@/components/councils/CouncilReportsView";
import { getMyAcademicCouncilMembershipsV2 } from "@/lib/faculty-councils.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/faculty-portal/academic-councils/reports")({
  head: () => ({
    meta: [
      { title: "تقارير المجالس الأكاديمية" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CouncilReportsPage,
});

function CouncilReportsPage() {
  const fetchMemberships = useServerFn(getMyAcademicCouncilMembershipsV2);
  const membershipsQuery = useQuery({
    queryKey: ["faculty", "my-council-memberships-v2"],
    queryFn: () => fetchMemberships(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const currentMemberships = membershipsQuery.data?.currentMemberships ?? [];
  const eligibleMemberships = useMemo(
    () => currentMemberships.filter((m) => ["chair", "secretary", "member"].includes(m.role)),
    [currentMemberships],
  );
  const [selectedCouncilId, setSelectedCouncilId] = useState(eligibleMemberships[0]?.council_id ?? "");

  const selectedMembership = eligibleMemberships.find((m) => m.council_id === selectedCouncilId);

  return (
    <FacultyPortalShell
      title="بوابة عضو هيئة التدريس"
      breadcrumbs={[
        { label: "المجالس الأكاديمية", to: "/faculty-portal/academic-councils" },
        { label: "التقارير" },
      ]}
    >
      <main className="container mx-auto px-4 py-8 max-w-5xl space-y-6" dir="rtl">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
            <BarChart3 className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-xl font-extrabold text-primary">تقارير المجالس الأكاديمية</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              تقارير دورية ومؤشرات عن أداء المجالس التي أنت عضو فيها.
            </p>
          </div>
        </div>

        {membershipsQuery.isLoading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : eligibleMemberships.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            لا توجد عضويات تسمح بعرض التقارير.
          </div>
        ) : (
          <>
            <div className="max-w-sm">
              <label className="text-xs text-muted-foreground block mb-1.5">اختر المجلس</label>
              <Select
                value={selectedCouncilId}
                onValueChange={setSelectedCouncilId}
                dir="rtl"
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {eligibleMemberships.map((m) => (
                    <SelectItem key={m.council_id} value={m.council_id}>
                      {m.council_name} ({m.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedMembership ? (
              <CouncilReportsView
                councilId={selectedMembership.council_id}
                councilName={selectedMembership.council_name}
              />
            ) : null}
          </>
        )}
      </main>
    </FacultyPortalShell>
  );
}
