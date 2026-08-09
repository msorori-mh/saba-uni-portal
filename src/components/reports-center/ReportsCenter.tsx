import { useMemo, useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";

import { Input } from "@/components/ui/input";
import {
  endUserCatalogEntries,
  groupByBeneficiary,
  groupByStatus,
  isReportInPreparation,
  isReportOpenable,
  searchReports,
  REPORT_BENEFICIARIES,
  REPORT_STATUSES,
  type ReportEntry,
  type ReportStatus,
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

const FAVORITES_KEY = "portal.reports.favorites.v1";

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function persistFavorites(codes: Set<string>) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...codes]));
  } catch {
    // ignore quota / private mode
  }
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
 * Central reports catalog shell — role/scope/beneficiary aware.
 * Hides BLOCKED/NOT_ACTIVATED from end users. Preparation cards are
 * non-openable ("قيد التجهيز"). Favorites are local-only.
 */
export function ReportsCenter({
  entries,
  viewerRoles,
  title = "مركز التقارير",
  subtitle = "التقارير وفق الصلاحية والنطاق والمستفيد — الرؤية fail-closed.",
  showPreparation = true,
  defaultGrouping = "beneficiary",
}: ReportsCenterProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [grouping, setGrouping] = useState<ReportsCenterGrouping>(defaultGrouping);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  const toggleFavorite = (code: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      persistFavorites(next);
      return next;
    });
  };

  const catalog = useMemo(() => {
    const base = endUserCatalogEntries(entries, viewerRoles);
    return showPreparation
      ? base
      : base.filter((e) => !isReportInPreparation(e));
  }, [entries, viewerRoles, showPreparation]);

  const filtered = useMemo(() => {
    let list = searchReports(catalog, query);
    if (statusFilter !== "all") {
      list = list.filter((entry) => entry.status === statusFilter);
    }
    if (favoritesOnly) {
      list = list.filter((entry) => favorites.has(entry.report_code));
    }
    return list;
  }, [catalog, query, statusFilter, favoritesOnly, favorites]);

  const groups = useMemo(() => buildGroups(filtered, grouping), [filtered, grouping]);

  const openableCount = catalog.filter(isReportOpenable).length;

  return (
    <div dir="rtl" className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
        <p className="text-xs text-muted-foreground">
          {`متاح للفتح: ${openableCount} — المعروض: ${filtered.length}`}
        </p>
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
          <option value="all">كل الحالات الظاهرة</option>
          {(
            [
              "LIVE",
              "DATA_DEPENDENT",
              "SOURCE_READY",
              "UNDER_DEVELOPMENT",
            ] as ReportStatus[]
          ).map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS_AR[status]}
            </option>
          ))}
        </select>
        <select
          value={grouping}
          onChange={(event: ChangeEventLike) =>
            setGrouping(event.target.value as ReportsCenterGrouping)
          }
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          aria-label="طريقة التجميع"
        >
          <option value="beneficiary">تجميع حسب المستفيد</option>
          <option value="status">تجميع حسب الحالة</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(e) => setFavoritesOnly(e.target.checked)}
          />
          المفضلة فقط
        </label>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          لا تقارير متاحة لصلاحياتك الحالية.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="space-y-2" aria-label={group.label}>
            <h3 className="text-base font-semibold">
              {group.label}
              <span className="text-sm font-normal text-muted-foreground">
                {` (${group.entries.length})`}
              </span>
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {group.entries.map((entry) => (
                <ReportCard
                  key={entry.report_code}
                  entry={entry}
                  favorite={favorites.has(entry.report_code)}
                  onToggleFavorite={() => toggleFavorite(entry.report_code)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

/** Optional deep-link helper used by hubs. */
export function ReportRouteLink({
  to,
  label,
}: {
  to: string;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="text-sm font-bold text-primary hover:text-gold underline-offset-4 hover:underline"
    >
      {label}
    </Link>
  );
}
