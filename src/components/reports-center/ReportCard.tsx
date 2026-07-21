import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  BENEFICIARY_LABELS_AR,
  SENSITIVITY_LABELS_AR,
  STATUS_BADGE_VARIANTS,
  STATUS_LABELS_AR,
  type ReportCardProps,
} from "./types";

/**
 * Presentational card for one canonical catalog entry. Props-driven only —
 * no data fetching, no navigation. The card never links to a report route;
 * wiring a route is a documented follow-up per entry.
 */
export function ReportCard({ entry }: ReportCardProps) {
  return (
    <Card variant="compact" dir="rtl" data-report-code={entry.report_code}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{entry.name_ar}</CardTitle>
          <Badge variant={STATUS_BADGE_VARIANTS[entry.status]}>
            {STATUS_LABELS_AR[entry.status]}
          </Badge>
        </div>
        <CardDescription>{entry.report_code}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">{entry.description}</p>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="outline">
            {"الحساسية: "}
            {SENSITIVITY_LABELS_AR[entry.sensitivity]}
          </Badge>
          {entry.beneficiaries.map((beneficiary) => (
            <Badge key={beneficiary} variant="outline">
              {BENEFICIARY_LABELS_AR[beneficiary]}
            </Badge>
          ))}
        </div>
        {entry.route !== null ? (
          <p className="text-xs text-muted-foreground">
            {"المسار الحالي: "}
            {entry.route}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {"لا واجهة بعد — توصيل المسار متابعة لاحقة موثقة."}
          </p>
        )}
        {entry.blocker !== null ? (
          <p className="text-xs text-destructive">
            {"سبب عدم الجاهزية: "}
            {entry.blocker}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
