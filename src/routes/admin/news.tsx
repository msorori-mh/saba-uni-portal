import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const Route = createFileRoute("/admin/news")({
  component: () => <ComingSoon title="إدارة الأخبار" description="إضافة وتعديل وحذف الأخبار والإعلانات." />,
});
