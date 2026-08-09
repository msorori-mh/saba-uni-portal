import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isReportInPreparation, isReportOpenable } from "@/lib/reports/catalog";

import {
  BENEFICIARY_LABELS_AR,
  SENSITIVITY_LABELS_AR,
  STATUS_BADGE_VARIANTS,
  STATUS_LABELS_AR,
  type ReportCardProps,
} from "./types";

/**
 * Presentational card for one catalog entry.
 * Openable reports may link to their route; preparation cards never open data.
 */
export function ReportCard({
  entry,
  favorite = false,
  onToggleFavorite,
}: ReportCardProps) {
  const openable = isReportOpenable(entry);
  const preparation = isReportInPreparation(entry);

  return (
    <Card
      variant="compact"
      dir="rtl"
      data-report-code={entry.report_code}
      data-openable={openable ? "true" : "false"}
      data-preparation={preparation ? "true" : "false"}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{entry.name_ar}</CardTitle>
          <div className="flex items-center gap-1">
            {onToggleFavorite ? (
              <button
                type="button"
                aria-label={favorite ? "إزالة من المفضلة" : "إضافة للمفضلة"}
                className="text-sm px-2 py-1 rounded border border-input"
                onClick={onToggleFavorite}
              >
                {favorite ? "★" : "☆"}
              </button>
            ) : null}
            <Badge variant={STATUS_BADGE_VARIANTS[entry.status]}>
              {preparation ? "قيد التجهيز" : STATUS_LABELS_AR[entry.status]}
            </Badge>
          </div>
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
          <Badge variant="outline">{entry.data_scope}</Badge>
          {entry.beneficiaries.map((beneficiary) => (
            <Badge key={beneficiary} variant="outline">
              {BENEFICIARY_LABELS_AR[beneficiary]}
            </Badge>
          ))}
        </div>
        {openable && entry.route ? (
          <p className="text-xs">
            <a
              href={entry.route}
              className="font-bold text-primary hover:text-gold underline-offset-4 hover:underline"
            >
              فتح التقرير
            </a>
            <span className="text-muted-foreground">{` — ${entry.route}`}</span>
          </p>
        ) : preparation ? (
          <p className="text-xs text-muted-foreground">
            قيد التجهيز — لا بيانات للفتح حالياً.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            لا واجهة قابلة للفتح لهذا التقرير.
          </p>
        )}
        {entry.blocker !== null && preparation ? (
          <p className="text-xs text-muted-foreground">
            {"ملاحظة تجهيز: "}
            {entry.blocker}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
