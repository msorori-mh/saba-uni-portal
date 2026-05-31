import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const Route = createFileRoute("/admin/programs")({
  component: () => <ComingSoon title="الأقسام والبرامج" description="إدارة البرامج الأكاديمية والأقسام." />,
});
