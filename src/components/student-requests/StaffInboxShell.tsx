import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";
import {
  fetchStaffInbox,
  fetchStaffRequestDetail,
} from "@/lib/student-requests/staff-inbox.functions";
import {
  filterInboxByStatusFilter,
  STAFF_INBOX_EMPTY_MSG,
  STAFF_INBOX_STATUS_FILTER_OPTIONS,
  type StaffInboxStatusFilter,
} from "@/lib/student-requests/staff-inbox-ui";
import { StaffRequestInbox } from "@/components/student-requests/StaffRequestInbox";
import { StaffRequestDetailPanel } from "@/components/student-requests/StaffRequestDetailPanel";
import {
  enrichRequestTypesForDisplay,
} from "@/lib/student-requests/request-type-registry";
import { getStudentRequestLookups } from "@/lib/admin-student-requests.functions";

export function StaffInboxShell() {
  const inboxFn = useServerFn(fetchStaffInbox);
  const detailFn = useServerFn(fetchStaffRequestDetail);
  const lookupsFn = useServerFn(getStudentRequestLookups);

  const [statusFilter, setStatusFilter] = useState<StaffInboxStatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: lookups } = useQuery({
    queryKey: ["staff-inbox-lookups"],
    queryFn: () => lookupsFn({ data: {} }),
  });

  const requestTypes = enrichRequestTypesForDisplay(lookups?.requestTypes ?? []);
  const departments = lookups?.departments ?? [];

  const {
    data: inboxResult,
    isLoading: inboxLoading,
    isError: inboxError,
    error: inboxErr,
    refetch: refetchInbox,
    isFetching: inboxFetching,
  } = useQuery({
    queryKey: ["staff-inbox", typeFilter, deptFilter, search],
    queryFn: () =>
      inboxFn({
        data: {
          statusFilter,
          requestTypeCode: typeFilter || undefined,
          departmentId: deptFilter || undefined,
          search: search.trim() || undefined,
        },
      }),
  });

  const filteredItems = useMemo(() => {
    const items = inboxResult?.items ?? [];
    return filterInboxByStatusFilter(items, statusFilter);
  }, [inboxResult?.items, statusFilter]);

  const {
    data: detailResult,
    isLoading: detailLoading,
  } = useQuery({
    queryKey: ["staff-inbox-detail", selectedId],
    queryFn: () =>
      detailFn({ data: { requestId: selectedId! } }),
    enabled: Boolean(selectedId),
  });

  const workflowRuntimeAvailable = inboxResult?.workflowRuntimeAvailable ?? false;
  const dataSource = inboxResult?.dataSource ?? "legacy_overview";

  return (
    <div className="space-y-4">
      {inboxResult?.messageAr && !inboxResult.available && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{inboxResult.messageAr}</span>
        </div>
      )}

      {inboxResult?.messageAr && inboxResult.available && inboxResult.reason === "workflow_schema_unavailable" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <div>{inboxResult.messageAr}</div>
            <div className="mt-1 text-muted-foreground">
              يُعرض حالياً ملخص الطلبات من النظام التقليدي ({dataSource === "legacy_overview" ? "نظرة عامة إدارية" : dataSource}).
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 rounded-lg border bg-card p-3">
        <FilterSelect
          label="الحالة"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StaffInboxStatusFilter)}
          options={STAFF_INBOX_STATUS_FILTER_OPTIONS.map((o) => ({
            value: o.value,
            label: o.labelAr,
          }))}
        />
        <FilterSelect
          label="نوع الطلب"
          value={typeFilter}
          onChange={setTypeFilter}
          options={requestTypes.map((t) => ({
            value: t.code,
            label: `${t.name_ar}${t.is_active ? "" : " (معطل)"}`,
          }))}
        />
        <FilterSelect
          label="القسم"
          value={deptFilter}
          onChange={setDeptFilter}
          options={departments.map((d) => ({ value: d.id, label: d.name_ar }))}
        />
        <div>
          <label className="text-[10px] text-muted-foreground block">بحث</label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="اسم / رقم أكاديمي / رقم طلب"
            className="h-9 rounded border bg-background px-2 text-sm min-w-[180px]"
          />
        </div>
        <div className="ms-auto self-end flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {filteredItems.length} طلب
          </span>
          <button
            type="button"
            onClick={() => refetchInbox()}
            disabled={inboxFetching}
            className="text-xs inline-flex items-center gap-1 border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${inboxFetching ? "animate-spin" : ""}`} />
            تحديث
          </button>
        </div>
      </div>

      {inboxLoading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : inboxError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-center justify-between gap-3">
          <span>
            تعذر تحميل الصندوق:{" "}
            {inboxErr instanceof Error ? inboxErr.message : "خطأ غير معروف"}
          </span>
          <button
            type="button"
            onClick={() => refetchInbox()}
            className="text-xs font-bold underline shrink-0"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">{STAFF_INBOX_EMPTY_MSG}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <StaffRequestInbox
            items={filteredItems}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <StaffRequestDetailPanel
            detail={detailResult?.detail ?? null}
            loading={detailLoading && Boolean(selectedId)}
            workflowRuntimeAvailable={
              detailResult?.workflowRuntimeAvailable ?? workflowRuntimeAvailable
            }
            dataSourceNote={detailResult?.messageAr ?? null}
          />
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded border bg-background px-2 text-sm min-w-[140px]"
      >
        {label === "الحالة" ? null : <option value="">الكل</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
