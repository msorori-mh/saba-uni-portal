import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/admin/ComingSoon";

export const Route = createFileRoute("/admin/settings")({
  component: () => <ComingSoon title="إعدادات الموقع" description="إدارة المحتوى العام للموقع: الرؤية، الرسالة، كلمة العميد، وغيرها." />,
});
