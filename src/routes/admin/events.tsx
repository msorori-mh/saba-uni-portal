import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const Route = createFileRoute("/admin/events")({
  component: () => <ComingSoon title="إدارة الفعاليات" description="إضافة وتعديل الفعاليات والأنشطة." />,
});
