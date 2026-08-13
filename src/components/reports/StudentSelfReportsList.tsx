/**
 * Student-safe reports list (Phase H).
 *
 * Deliberately NOT the generic multi-beneficiary ReportCard: no beneficiary
 * groups (Faculty/Supervisor, Department Head/Coordinator), no technical tags
 * (report codes, sensitivity, data scope, statuses) and no duplicate cards.
 * It renders only what the server projected: title, summary, destination.
 */

import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { StudentReportItem } from "@/lib/reports/student-projection";

export interface StudentSelfReportsListProps {
  readonly items: readonly StudentReportItem[];
  readonly title?: string;
}

export function StudentSelfReportsList({
  items,
  title = "تقاريري",
}: StudentSelfReportsListProps) {
  return (
    <section className="space-y-2" aria-label="تقاريري" data-student-reports="self-only">
      <h2 className="font-semibold text-primary">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد تقارير متاحة لك حالياً.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={item.to}
                className="flex items-start justify-between gap-2 rounded-md border border-border px-3 py-2 hover:border-gold"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-primary">{item.title}</span>
                  <span className="block text-xs text-muted-foreground">{item.summary}</span>
                </span>
                <ChevronLeft className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
