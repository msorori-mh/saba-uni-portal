import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { GraduationProjectPolicyPanel } from "@/components/graduation-projects/GraduationProjectPolicyPanel";

export const Route = createFileRoute("/admin/graduation-project-policies")({
  head: () => ({
    meta: [
      { title: "سياسات مشاريع التخرج — بوابة الكلية" },
      {
        name: "description",
        content: "إعداد سياسات مشاريع التخرج: حجم الفرق واللجان ودرجة النجاح ودورات التعديل والمواعيد.",
      },
      { property: "og:title", content: "سياسات مشاريع التخرج — بوابة الكلية" },
      {
        property: "og:description",
        content: "إعداد سياسات مشاريع التخرج كإصدارات منشورة دون تعديل برمجي.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminGraduationProjectPolicies,
});

function AdminGraduationProjectPolicies() {
  return (
    <main dir="rtl" className="space-y-6">
      <div className="border-b border-border pb-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-primary">سياسات مشاريع التخرج</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            طبقة الإعدادات فوق نواة النظام الأكاديمية الثابتة.
          </p>
        </div>
        <Link
          to="/admin/graduation-projects"
          className="text-sm font-bold text-primary inline-flex items-center gap-1"
        >
          <ArrowRight className="h-4 w-4" />
          العودة إلى نظرة عامة على مشاريع التخرج
        </Link>
      </div>

      <GraduationProjectPolicyPanel />
    </main>
  );
}
