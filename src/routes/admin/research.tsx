import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const Route = createFileRoute("/admin/research")({
  component: () => <ComingSoon title="إدارة الأبحاث" description="إضافة وتعديل الأبحاث والمنشورات العلمية." />,
});
