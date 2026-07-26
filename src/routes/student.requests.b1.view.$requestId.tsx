import { createFileRoute } from "@tanstack/react-router";
import { B1StudentRequestDetail } from "@/components/student-requests/b1/B1StudentRequestDetail";

export const Route = createFileRoute("/student/requests/b1/view/$requestId")({
  component: B1StudentRequestViewRoute,
});

function B1StudentRequestViewRoute() {
  const { requestId } = Route.useParams();
  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <B1StudentRequestDetail requestId={requestId} />
    </div>
  );
}
