import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { StudentRequestDetailsScreen } from "@/components/student-requests/StudentRequestDetailsScreen";

export const Route = createFileRoute("/mobile/student/requests/$id")({
  component: MobileStudentRequestDetailsRoute,
});

function MobileStudentRequestDetailsRoute() {
  const { id } = Route.useParams();
  return (
    <div className="px-4 py-5" dir="rtl">
      <Link to="/mobile/student/requests" className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-primary">
        <ArrowRight className="h-4 w-4" /> رجوع إلى الطلبات
      </Link>
      <StudentRequestDetailsScreen id={id} />
    </div>
  );
}
