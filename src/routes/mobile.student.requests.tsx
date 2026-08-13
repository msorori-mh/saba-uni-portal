import { Outlet, createFileRoute } from "@tanstack/react-router";
import { StudentSurfaceProvider } from "@/lib/student-requests/surface";

export const Route = createFileRoute("/mobile/student/requests")({
  component: MobileStudentRequestsLayout,
});

/**
 * Mobile requests container. All shared student-request screens rendered under
 * this layout resolve their links to `/mobile/student/requests/*`.
 */
function MobileStudentRequestsLayout() {
  return (
    <StudentSurfaceProvider surface="mobile">
      <Outlet />
    </StudentSurfaceProvider>
  );
}
