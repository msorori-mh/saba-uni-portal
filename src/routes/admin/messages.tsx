import { createFileRoute, redirect } from "@tanstack/react-router";

// Deprecated route — unified under /admin/contacts
export const Route = createFileRoute("/admin/messages")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/contacts" });
  },
});
