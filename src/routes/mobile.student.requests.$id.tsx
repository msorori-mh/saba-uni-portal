import { createFileRoute, Link } from "@tanstack/react-router";
import { StudentRequestDetailsScreen } from "@/components/student-requests/StudentRequestDetailsScreen";

export const Route = createFileRoute("/mobile/student/requests/$id")({
  component: MobileStudentRequestDetailsRoute,
});

function MobileStudentRequestDetailsRoute() {
  const { id } = Route.useParams();
  return (
    <div className="px-4 py-5" dir="rtl">
      <Link to="/mobile/student/requests" className="mb-3 inline-flex text-xs font-bold text-primary">رجوع إلى الطلبات</Link>
      <StudentRequestDetailsScreen id={id} />
    </div>
  );
}
