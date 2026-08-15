import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { StudentRequestsNav } from "@/components/portal/StudentRequestsNav";

export const Route = createFileRoute("/student/requests")({
  component: StudentRequestsLayout,
});

function StudentRequestsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  let currentLabel = "الخدمات الطلابية";
  if (pathname.endsWith("/requests/new") || pathname.includes("/requests/new")) {
    currentLabel = "تقديم طلب";
  } else if (/\/student\/requests\/[^/]+$/.test(pathname)) {
    currentLabel = "تفاصيل الطلب";
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6" dir="rtl">
      <StudentRequestsNav currentLabel={currentLabel} />
      <Outlet />
    </div>
  );
}
