import { createFileRoute } from "@tanstack/react-router";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { DetailParityPanel } from "@/components/lecture-execution/DetailParityPanel";

export const Route = createFileRoute("/faculty-portal/lecture-monitoring/parity")({
  head: () => ({
    meta: [
      { title: "مطابقة المتابعة مع تفاصيل المقرر — بوابة الكلية" },
      {
        name: "description",
        content:
          "فحص مطابقة قيم لوحة متابعة تنفيذ المحاضرات مع صفحات تفاصيل المقررات وعرض صفوف الاختلاف.",
      },
      { property: "og:title", content: "مطابقة المتابعة مع تفاصيل المقرر" },
      {
        property: "og:description",
        content: "عرض صفوف الاختلاف بين لوحة المتابعة وصفحة تفاصيل المقرر.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LectureMonitoringParityPage,
});

function LectureMonitoringParityPage() {
  return (
    <FacultyPortalShell
      title="مطابقة قيم المتابعة مع تفاصيل المقرر"
      subtitle="DATA_MINING_DETAIL_PARITY — فحص قراءة فقط لصفوف الاختلاف"
      breadcrumbs={[
        { label: "متابعة تنفيذ المحاضرات", to: "/faculty-portal/lecture-monitoring" },
        { label: "مطابقة التفاصيل" },
      ]}
    >
      <div className="container mx-auto px-4 py-6">
        <DetailParityPanel />
      </div>
    </FacultyPortalShell>
  );
}
