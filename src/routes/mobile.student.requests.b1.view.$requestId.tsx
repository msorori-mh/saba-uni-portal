import { createFileRoute } from "@tanstack/react-router";
import { B1StudentRequestDetail } from "@/components/student-requests/b1/B1StudentRequestDetail";

export const Route = createFileRoute("/mobile/student/requests/b1/view/$requestId")({
  component: MobileB1StudentRequestViewRoute,
});

function MobileB1StudentRequestViewRoute() {
  const { requestId } = Route.useParams();
  return (
    <div className="px-4 py-5" dir="rtl">
      <B1StudentRequestDetail requestId={requestId} />
    </div>
  );
}
