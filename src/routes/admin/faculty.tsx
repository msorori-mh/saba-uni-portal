import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const Route = createFileRoute("/admin/faculty")({
  component: () => <ComingSoon title="إدارة هيئة التدريس" description="إضافة وتعديل بيانات أعضاء هيئة التدريس." />,
});
