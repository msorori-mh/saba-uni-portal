import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { B1StudentRequestForm } from "@/components/student-requests/b1/B1StudentRequestForm";
import { B1ErrorState } from "@/components/student-requests/b1/B1ErrorState";
import { isB1ServiceCode } from "@/lib/student-requests/b1-ui";

export const Route = createFileRoute("/mobile/student/requests/b1/$service")({
  component: MobileB1StudentServiceRoute,
});

function MobileB1StudentServiceRoute() {
  const { service } = Route.useParams();
  return (
    <div className="px-4 py-5 space-y-3" dir="rtl">
      <Link
        to="/mobile/student/requests"
        className="inline-flex items-center gap-1 text-xs font-bold text-primary"
      >
        <ArrowRight className="h-3.5 w-3.5" /> العودة إلى الطلبات
      </Link>
      {isB1ServiceCode(service) ? (
        <B1StudentRequestForm serviceCode={service} />
      ) : (
        <B1ErrorState messageAr="نوع الخدمة غير معروف." />
      )}
    </div>
  );
}
