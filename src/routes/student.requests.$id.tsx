import { createFileRoute } from "@tanstack/react-router";
import { StudentRequestDetailsScreen } from "@/components/student-requests/StudentRequestDetailsScreen";

export const Route = createFileRoute("/student/requests/$id")({
  component: StudentRequestDetailsRoute,
});

function StudentRequestDetailsRoute() {
  const { id } = Route.useParams();
  return <StudentRequestDetailsScreen id={id} />;
}
