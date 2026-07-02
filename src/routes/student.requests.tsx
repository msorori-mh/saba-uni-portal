import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/student/requests")({
  component: () => <Outlet />,
});
