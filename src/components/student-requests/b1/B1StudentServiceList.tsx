import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { getB1UiAdapter, type B1ServiceAvailability } from "@/lib/student-requests/b1-ui";
import { B1EmptyState } from "./B1EmptyState";
import { B1ErrorState } from "./B1ErrorState";
import { B1LoadingState } from "./B1LoadingState";

export function B1StudentServiceList() {
  const [services, setServices] = useState<readonly B1ServiceAvailability[] | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    setServices(null);
    void getB1UiAdapter()
      .getAvailableB1RequestTypes()
      .then((rows) => setServices(rows.filter((row) => row.studentVisible && row.runtimeAvailable)))
      .catch(() => setError(true));
  };

  useEffect(load, []);

  if (error)
    return <B1ErrorState messageAr="تعذر تحميل قائمة الخدمات. أعد المحاولة." onRetry={load} />;
  if (!services) return <B1LoadingState labelAr="جارٍ تحميل خدمات الطلبات…" />;
  if (services.length === 0) {
    return (
      <B1EmptyState
        titleAr="لا توجد خدمات إضافية متاحة"
        bodyAr="الخدمات الخمس لا تظهر إلا بعد تفعيلها من النظام الخلفي."
      />
    );
  }

  return (
    <section dir="rtl" data-testid="b1-student-service-list" className="space-y-3">
      <h2 className="font-display text-base font-extrabold text-primary">الخدمات الأكاديمية</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {services.map((service) => (
          <article
            key={service.code}
            className="rounded-xl border border-border bg-card p-4 shadow-card"
          >
            <div className="flex items-start gap-3">
              <FileText className="mt-1 h-5 w-5 shrink-0 text-gold" />
              <div className="min-w-0">
                <h3 className="font-bold text-primary">{service.titleAr}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {service.descriptionAr}
                </p>
                <Link
                  to={routes.b1Service}
                  params={{ service: service.code }}
                  className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
                >
                  بدء الطلب
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
