import { createFileRoute, redirect } from "@tanstack/react-router";

// Deprecated route — unified under /admin/departments (Programs tab)
export const Route = createFileRoute("/admin/programs")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/departments" });
  },
});
