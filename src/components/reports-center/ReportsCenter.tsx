import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  canSeeReport,
  groupByBeneficiary,
  groupByStatus,
  searchReports,
  REPORT_BENEFICIARIES,
  REPORT_STATUSES,
  type ReportEntry,
} from "@/lib/reports/catalog";

import { ReportCard } from "./ReportCard";
import {
  BENEFICIARY_LABELS_AR,
  STATUS_LABELS_AR,
  type ReportsCenterGrouping,
  type ReportsCenterProps,
} from "./types";

type ChangeEventLike = { target: { value: string } };

interface ReportGroup {
  readonly key: string;
  readonly label: string;
  readonly entries: readonly ReportEntry[];
}

function buildGroups(
  entries: readonly ReportEntry[],
  grouping: ReportsCenterGrouping,
): ReportGroup[] {
  if (grouping === "beneficiary") {
    const byBeneficiary = groupByBeneficiary(entries);
    return REPORT_BENEFICIARIES.filter((b) => byBeneficiary.has(b)).map(
      (b) => ({
        key: b,
        label: BENEFICIARY_LABELS_AR[b],
        entries: byBeneficiary.get(b) ?? [],
      }),
    );
  }
  const byStatus = groupByStatus(entries);
  return REPORT_STATUSES.filter((s) => byStatus.has(s)).map((s) => ({
    key: s,
    label: STATUS_LABELS_AR[s],
    entries: byStatus.get(s) ?? [],
  }));
}

/**
 * Reports-center shell: indexes the canonical catalog, groups it by status
 * or beneficiary, and offers search + status filtering.
 *
 * Presentational only (props-driven): no data fetching, no routes, no mock
 * data. Visibility is fail-closed — a viewer with no/unknown roles sees an
 * empty center even if handed the full catalog.
 */
export function ReportsCenter({
  entries,
  viewerRoles,
  title = "مركز التقارير",
  subtitle = "الكتالوج المرجعي لتقارير البوابة — الرؤية fail-closed بحسب صلاحياتك.",
}: ReportsCenterProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [grouping, setGrouping] = useState<ReportsCenterGrouping>("status");

  const visible = useMemo(
    () => entries.filter((entry) => canSeeReport(entry, viewerRoles)),
    [entries, viewerRoles],
  );

  const filtered = useMemo(() => {
    const searched = searchReports(visible, query);
    if (statusFilter === "all") {
      return searched;
    }
    return searched.filter((entry) => entry.status === statusFilter);
  }, [visible, query, statusFilter]);

  const groups = useMemo(() => buildGroups(filtered, grouping), [filtered, grouping]);

  return (
    <div dir="rtl" className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event: ChangeEventLike) => setQuery(event.target.value)}
          placeholder="ابحث بالاسم أو الرمز أو الوصف…"
          className="max-w-sm"
          aria-label="بحث في التقارير"
        />
        <select
          value={statusFilter}
          onChange={(event: ChangeEventLike) => setStatusFilter(event.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          aria-label="تصفية حسب الحالة"
        >
          <option value="all">كل الحالات</option>
          {REPORT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS_AR[status]}
            </option>
          ))}
        </select>
        <select
          value={grouping}
          onChange={(event: ChangeEventLike) => setGrouping(event.target.value as ReportsCenterGrouping)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          aria-label="طريقة التجميع"
        >
          <option value="status">تجميع حسب الحالة</option>
          <option value="beneficiary">تجميع حسب المستفيد</option>
        </select>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {"لا تقارير متاحة لصلاحياتك الحالية."}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="space-y-2">
            <h3 className="text-base font-semibold">
              {group.label}
              <span className="text-sm font-normal text-muted-foreground">
                {` (${group.entries.length})`}
              </span>
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {group.entries.map((entry) => (
                <ReportCard key={entry.report_code} entry={entry} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
