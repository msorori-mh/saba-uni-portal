import { createFileRoute } from "@tanstack/react-router";
import { StudentRequestDetailsScreen } from "@/components/student-requests/StudentRequestDetailsScreen";

export const Route = createFileRoute("/mobile/student/requests/$id")({
  component: MobileStudentRequestDetailsRoute,
});

function MobileStudentRequestDetailsRoute() {
  const { id } = Route.useParams();
  return (
    <div className="px-4 py-5" dir="rtl">
      <StudentRequestDetailsScreen id={id} />
    </div>
  );
}
