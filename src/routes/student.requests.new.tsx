import { createFileRoute } from "@tanstack/react-router";
import { NewStudentRequestScreen } from "@/components/student-requests/NewStudentRequestScreen";

export const Route = createFileRoute("/student/requests/new")({
  validateSearch: (search: Record<string, unknown>): { type?: string } => ({
    type: typeof search.type === "string" && search.type.trim() ? search.type.trim() : undefined,
  }),
  component: NewStudentRequestRoute,
});

function NewStudentRequestRoute() {
  const { type } = Route.useSearch();
  return <NewStudentRequestScreen typeFromSearch={type} />;
}
