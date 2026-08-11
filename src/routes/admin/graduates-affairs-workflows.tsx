import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { GraduateFollowupWorkflowPanel } from "@/components/graduates-affairs/GraduateFollowupWorkflowPanel";

export const Route = createFileRoute("/admin/graduates-affairs-workflows")({
  head: () => ({
    meta: [
      { title: "متابعات شؤون الخريجين — بوابة الكلية" },
      {
        name: "description",
        content: "إعداد أنواع المتابعة وإصدارات سير العمل لشؤون الخريجين.",
      },
      { property: "og:title", content: "متابعات شؤون الخريجين — بوابة الكلية" },
      {
        property: "og:description",
        content: "إعداد أنواع المتابعة وإصدارات سير العمل كطبقة إعدادات فوق النواة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminGraduatesAffairsWorkflows,
});

function AdminGraduatesAffairsWorkflows() {
  return (
    <main dir="rtl" className="space-y-6">
      <div className="border-b border-border pb-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-primary">متابعات شؤون الخريجين</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            إعداد أنواع المتابعة وإصدارات سير العمل كطبقة إعدادات فوق النواة.
          </p>
        </div>
        <Link
          to="/admin/graduates-affairs"
          className="text-sm font-bold text-primary inline-flex items-center gap-1"
        >
          <ArrowRight className="h-4 w-4" />
          العودة إلى شؤون الخريجين
        </Link>
      </div>

      <GraduateFollowupWorkflowPanel />
    </main>
  );
}
