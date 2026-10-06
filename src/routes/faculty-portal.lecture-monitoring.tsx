import { createFileRoute } from "@tanstack/react-router";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { DeliveryMonitoringPanel } from "@/components/lecture-execution/DeliveryMonitoringPanel";

export const Route = createFileRoute("/faculty-portal/lecture-monitoring")({
  head: () => ({
    meta: [
      { title: "متابعة سير العملية التعليمية — بوابة الكلية" },
      {
        name: "description",
        content: "متابعة المخطط مقابل المنفذ من المحاضرات لرؤساء الأقسام والعميد.",
      },
      { property: "og:title", content: "متابعة سير العملية التعليمية" },
      {
        property: "og:description",
        content: "متابعة المخطط مقابل المنفذ من المحاضرات لرؤساء الأقسام والعميد.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FacultyLectureMonitoringPage,
});

function FacultyLectureMonitoringPage() {
  return (
    <FacultyPortalShell
      title="متابعة سير العملية التعليمية"
      subtitle="المخطط مقابل المنفذ ومؤشرات المخاطر الأكاديمية"
      breadcrumbs={[{ label: "متابعة سير العملية التعليمية" }]}
    >
      <DeliveryMonitoringPanel />
    </FacultyPortalShell>
  );
}
