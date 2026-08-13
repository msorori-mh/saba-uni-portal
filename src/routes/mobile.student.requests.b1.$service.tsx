import { createFileRoute } from "@tanstack/react-router";
import { B1StudentRequestForm } from "@/components/student-requests/b1/B1StudentRequestForm";
import { B1ErrorState } from "@/components/student-requests/b1/B1ErrorState";
import { isB1ServiceCode } from "@/lib/student-requests/b1-ui";

export const Route = createFileRoute("/mobile/student/requests/b1/$service")({
  component: MobileB1StudentServiceRoute,
});

function MobileB1StudentServiceRoute() {
  const { service } = Route.useParams();
  if (!isB1ServiceCode(service)) return <B1ErrorState messageAr="نوع الخدمة غير معروف." />;
  return (
    <div className="px-4 py-5" dir="rtl">
      <B1StudentRequestForm serviceCode={service} />
    </div>
  );
}
