import { createFileRoute } from "@tanstack/react-router";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { DeliveryMonitoringPanel } from "@/components/lecture-execution/DeliveryMonitoringPanel";

export const Route = createFileRoute("/faculty-portal/lecture-monitoring")({
  head: () => ({
    meta: [
      { title: "متابعة تنفيذ المحاضرات — بوابة الكلية" },
      {
        name: "description",
        content: "متابعة المخطط مقابل المنفذ من المحاضرات لرؤساء الأقسام والعميد.",
      },
      { property: "og:title", content: "متابعة تنفيذ المحاضرات" },
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
      title="متابعة تنفيذ المحاضرات"
      subtitle="المخطط مقابل المنفذ ومؤشرات المخاطر الأكاديمية"
      breadcrumbs={[{ label: "متابعة تنفيذ المحاضرات" }]}
    >
      <DeliveryMonitoringPanel />
    </FacultyPortalShell>
  );
}
