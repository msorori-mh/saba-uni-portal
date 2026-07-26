import { createFileRoute } from "@tanstack/react-router";
import { B1StaffWorkspace } from "@/components/student-requests/b1/B1StaffWorkspace";

export const Route = createFileRoute("/staff/b1-requests")({
  component: B1StaffWorkspace,
});
