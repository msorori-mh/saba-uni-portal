import { createFileRoute } from "@tanstack/react-router";
import {
  ForgotPasswordScreen,
  type ForgotPasswordCtx,
} from "@/components/auth/ForgotPasswordScreen";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: (s: Record<string, unknown>): { type?: ForgotPasswordCtx } => {
    const c = s.type ?? s.ctx;
    if (c === "admin" || c === "student" || c === "faculty" || c === "staff") return { type: c };
    return {};
  },
  head: () => ({
    meta: [
      { title: "نسيت كلمة المرور؟ — كلية تكنولوجيا المعلومات" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ForgotPasswordRoute,
});

function ForgotPasswordRoute() {
  const { type } = Route.useSearch();
  return <ForgotPasswordScreen ctxOverride={type} />;
}
