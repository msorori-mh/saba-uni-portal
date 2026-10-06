import { createFileRoute } from "@tanstack/react-router";
import { NewStudentRequestScreen } from "@/components/student-requests/NewStudentRequestScreen";
import { StudentServicesNewRequestGate } from "@/components/student-requests/StudentServicesPausedNotice";

export const Route = createFileRoute("/mobile/student/requests/new")({
  validateSearch: (search: Record<string, unknown>): { type?: string } => ({
    type: typeof search.type === "string" && search.type.trim() ? search.type.trim() : undefined,
  }),
  component: MobileNewStudentRequestRoute,
});

function MobileNewStudentRequestRoute() {
  const { type } = Route.useSearch();
  return (
    <div className="px-4 py-5" dir="rtl">
      <StudentServicesNewRequestGate>
        <NewStudentRequestScreen typeFromSearch={type} />
      </StudentServicesNewRequestGate>
    </div>
  );
}
