import { createFileRoute, redirect } from "@tanstack/react-router";

// Deprecated — schedule management is consolidated under
// /admin/course-offerings → tab "الجدول" (استيراد الجداول الدراسية).
// Schedules are imported from the central university scheduling system;
// the college portal no longer hosts a standalone schedule editor.
export const Route = createFileRoute("/admin/schedules")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/course-offerings" });
  },
});
