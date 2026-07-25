import { createFileRoute } from "@tanstack/react-router";
import { B1StudentRequestForm } from "@/components/student-requests/b1/B1StudentRequestForm";
import { B1ErrorState } from "@/components/student-requests/b1/B1ErrorState";
import { isB1ServiceCode } from "@/lib/student-requests/b1-ui";

export const Route = createFileRoute("/student/requests/b1/$service")({
  component: B1StudentServiceRoute,
});

function B1StudentServiceRoute() {
  const { service } = Route.useParams();
  if (!isB1ServiceCode(service)) return <B1ErrorState messageAr="نوع الخدمة غير معروف." />;
  return <B1StudentRequestForm serviceCode={service} />;
}
