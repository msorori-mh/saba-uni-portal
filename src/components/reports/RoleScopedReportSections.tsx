/**
 * Role-scoped report sections for the faculty / department-head portal.
 * Presentation only — grouping and authorization live in
 * `src/lib/reports/catalog/role-scoped-view.ts`.
 */

import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ScopedReportSection } from "@/lib/reports/catalog/role-scoped-view";

interface Props {
  readonly sections: readonly ScopedReportSection[];
  readonly emptyMessageAr?: string;
}

export function RoleScopedReportSections({
  sections,
  emptyMessageAr = "لا توجد تقارير متاحة ضمن نطاقك حالياً.",
}: Props) {
  if (sections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" dir="rtl">
        {emptyMessageAr}
      </p>
    );
  }

  return (
    <div className="space-y-8" dir="rtl">
      {sections.map((section) => (
        <section key={section.key} className="space-y-3" aria-label={section.titleAr}>
          <h2 className="text-lg font-bold">{section.titleAr}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {section.items.map(({ entry, route }) => (
              <li key={entry.report_code}>
                <Link
                  to={route as never}
                  className="flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-bold text-foreground">{entry.name_ar}</span>
                    <ArrowLeft className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                  </span>
                  <span className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {entry.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
