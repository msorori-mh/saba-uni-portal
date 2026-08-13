import { createFileRoute } from "@tanstack/react-router";
import { ForgotPasswordScreen } from "@/components/auth/ForgotPasswordScreen";

/**
 * In-app password recovery for the mobile student app. Keeps the student inside
 * the `/mobile` container instead of sending them to the public website.
 */
export const Route = createFileRoute("/mobile/student-forgot-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "استعادة كلمة المرور — بوابة الطالب" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MobileStudentForgotPasswordRoute,
});

function MobileStudentForgotPasswordRoute() {
  return (
    <ForgotPasswordScreen
      ctxOverride="student"
      backToOverride="/mobile/student-login"
      backLabelOverride="العودة إلى تسجيل الدخول"
    />
  );
}
