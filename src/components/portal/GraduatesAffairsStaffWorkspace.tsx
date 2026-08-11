import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Loader2,
  RefreshCw,
  Search,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createGraduateFollowupFn,
  getStaffGraduateFileFn,
  listActiveFollowupTypesFn,
  listGraduateAffairsAssignableStaffFn,
  searchGraduateRecordsFn,
  transitionGraduateFollowupFn,
} from "@/lib/graduates-affairs/graduates-affairs.functions";
import type {
  GraduateAffairsAssignableStaff,
  GraduateAffairsFileProjection,
  GraduateAffairsRecordState,
  GraduateAffairsSearchRecord,
} from "@/lib/graduates-affairs/rpc";

interface FollowupType {
  id: string;
  code: string;
  label_ar: string;
  description_ar: string | null;
}

const STATE_LABELS: Record<GraduateAffairsRecordState, string> = {
  pending: "مرشح — بانتظار الاعتماد",
  approved: "خريج معتمد",
  corrected: "خريج — سجل مصحح",
  revoked: "اعتماد ملغى",
};

const FOLLOWUP_LABELS: Record<string, string> = {
  open: "مفتوحة",
  in_progress: "قيد المعالجة",
  completed: "مكتملة",
  cancelled: "ملغاة",
};

function shortId(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function metric(
  records: readonly GraduateAffairsSearchRecord[],
  states: GraduateAffairsRecordState[],
) {
  return records.filter((record) => states.includes(record.record_state)).length;
}

export function GraduatesAffairsStaffWorkspace() {
  const queryClient = useQueryClient();
  const searchRecords = useServerFn(searchGraduateRecordsFn);
  const getFile = useServerFn(getStaffGraduateFileFn);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"all" | GraduateAffairsRecordState>("all");
  const [year, setYear] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const recordsQuery = useQuery({
    queryKey: ["graduates-affairs", "staff-records", year],
    queryFn: () =>
      searchRecords({
        data: {
          programId: null,
          departmentId: null,
          graduationYear: year ? Number(year) : null,
          limit: 100,
        },
      }),
    retry: 1,
  });

  const academicScope = useServerFn(listGaAcademicScopeFn);
  const scopeQuery = useQuery({
    queryKey: ["ga-academic-scope"],
    queryFn: () => academicScope({ data: {} }),
    staleTime: 5 * 60 * 1000,
  });

  const programName = (id: string) =>
    scopeQuery.data?.programs.find((program) => program.id === id)?.name ?? "برنامج غير محدد";
  const departmentName = (id: string) =>
    scopeQuery.data?.departments.find((department) => department.id === id)?.name ?? "قسم غير محدد";

  const fileQuery = useQuery({
    queryKey: ["graduates-affairs", "staff-file", selectedId],
    queryFn: () => getFile({ data: { graduateRecordId: selectedId! } }),
    enabled: Boolean(selectedId),
    retry: 1,
  });

  const invalidateFile = () => {
    queryClient.invalidateQueries({ queryKey: ["graduates-affairs", "staff-file", selectedId] });
  };

  const records = recordsQuery.data ?? [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.filter((record) => {
      if (state !== "all" && record.record_state !== state) return false;
      if (!needle) return true;
      return [
        record.id,
        programName(record.program_id),
        departmentName(record.department_id),
        String(record.graduation_year),
        STATE_LABELS[record.record_state],
      ].some((value) => value.toLowerCase().includes(needle));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, records, state, scopeQuery.data]);


  if (recordsQuery.isLoading) {
    return (
      <WorkspaceState
        icon={Loader2}
        title="جارٍ تحميل مساحة شؤون الخريجين"
        detail="يتم جلب السجلات الواقعة ضمن نطاق تكليفك."
        spin
      />
    );
  }

  if (recordsQuery.isError) {
    return (
      <WorkspaceState
        icon={AlertTriangle}
        title="تعذّر فتح مساحة شؤون الخريجين"
        detail={
          recordsQuery.error instanceof Error
            ? recordsQuery.error.message
            : "تحقق من التكليف التشغيلي ثم أعد المحاولة."
        }
        action={
          <Button type="button" variant="outline" onClick={() => recordsQuery.refetch()}>
            <RefreshCw className="h-4 w-4" /> إعادة المحاولة
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-5" data-testid="graduates-affairs-staff-workspace">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>نطاق تشغيلي مفوّض.</strong> النتائج أدناه يحددها تكليف مدير شؤون الخريجين أو
            نطاق أقسام المختص داخل RPC؛ دور الإدارة العام لا يمنح الوصول.
          </p>
        </div>
      </div>

      <section aria-labelledby="ga-overview-title">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 id="ga-overview-title" className="font-display text-lg font-bold text-primary">
              نظرة عامة
            </h2>
            <p className="text-xs text-muted-foreground">
              المؤشرات محسوبة من آخر {records.length.toLocaleString("ar-EG")} سجل ظاهر ضمن نطاقك
              (الحد الأقصى ١٠٠).
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="السجلات الظاهرة" value={records.length} icon={UsersRound} />
          <Kpi label="مرشحو التخرج" value={metric(records, ["pending"])} icon={Clock3} />
          <Kpi
            label="الخريجون المعتمدون"
            value={metric(records, ["approved", "corrected"])}
            icon={UserRoundCheck}
          />
          <Kpi label="اعتماد ملغى" value={metric(records, ["revoked"])} icon={FileCheck2} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          لا يوفّر عقد القراءة الحالي حالة أهلية مستقلة قبل الترشيح؛ لذلك لا تُستنتج «الأهلية» من
          بيانات أخرى.
        </p>
      </section>

      <section className="rounded-2xl border bg-card shadow-sm" aria-labelledby="ga-records-title">
        <div className="border-b p-4">
          <h2 id="ga-records-title" className="font-bold text-primary">
            سجلات الخريجين والاستقبال الرسمي
          </h2>
          <p className="text-xs text-muted-foreground">
            حالة السجل الرسمية كما يعيدها عقد شؤون الخريجين.
          </p>
        </div>
        <div className="grid gap-3 border-b bg-muted/20 p-4 md:grid-cols-[1fr_180px_150px]">
          <label className="relative">
            <span className="sr-only">بحث في السجلات</span>
            <Search className="absolute end-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="رقم السجل، البرنامج، القسم أو الحالة"
              className="pe-9"
            />
          </label>
          <label>
            <span className="sr-only">تصفية حسب الحالة</span>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={state}
              onChange={(event) => setState(event.target.value as typeof state)}
            >
              <option value="all">كل الحالات</option>
              {Object.entries(STATE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">سنة التخرج</span>
            <Input
              inputMode="numeric"
              value={year}
              onChange={(event) => setYear(event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="سنة التخرج"
            />
          </label>
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <UsersRound className="mx-auto h-9 w-9 text-muted-foreground" />
            <p className="mt-3 font-medium">لا توجد سجلات مطابقة</p>
            <p className="mt-1 text-sm text-muted-foreground">
              غيّر البحث أو المرشحات، أو تحقق من وجود سجلات ضمن نطاق التكليف.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-3 text-start">السجل</th>
                  <th className="p-3 text-start">الحالة الرسمية</th>
                  <th className="p-3 text-start">سنة التخرج</th>
                  <th className="p-3 text-start">البرنامج / القسم</th>
                  <th className="p-3 text-start">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => (
                  <tr key={record.id} className="border-t">
                    <td className="p-3 font-mono text-xs" title={record.id}>
                      {shortId(record.id)}
                    </td>
                    <td className="p-3">
                      <StateBadge state={record.record_state} />
                    </td>
                    <td className="p-3 tabular-nums">{record.graduation_year}</td>
                    <td className="p-3">
                      <div title={record.program_id}>{programName(record.program_id)}</div>
                      <div className="text-xs text-muted-foreground" title={record.department_id}>
                        {departmentName(record.department_id)}
                      </div>
                    </td>

                    <td className="p-3">
                      <Button
                        type="button"
                        size="sm"
                        variant={selectedId === record.id ? "secondary" : "outline"}
                        onClick={() => setSelectedId(record.id)}
                      >
                        فتح الملف
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <GraduateCasePanel
        selectedId={selectedId}
        file={fileQuery.data ?? null}
        loading={fileQuery.isLoading}
        error={fileQuery.error}
        retry={() => fileQuery.refetch()}
        onInvalidate={invalidateFile}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof UsersRound;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <Icon className="h-5 w-5 text-gold" />
      <p className="mt-3 text-2xl font-extrabold tabular-nums text-primary">
        {value.toLocaleString("ar-EG")}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function StateBadge({ state }: { state: GraduateAffairsRecordState }) {
  const tone =
    state === "approved" || state === "corrected"
      ? "bg-emerald-100 text-emerald-900"
      : state === "revoked"
        ? "bg-red-100 text-red-900"
        : "bg-amber-100 text-amber-900";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {STATE_LABELS[state]}
    </span>
  );
}

function GraduateCasePanel({
  selectedId,
  file,
  loading,
  error,
  retry,
  onInvalidate,
}: {
  selectedId: string | null;
  file: GraduateAffairsFileProjection | null;
  loading: boolean;
  error: unknown;
  retry: () => void;
  onInvalidate: () => void;
}) {
  const transitionFollowup = useServerFn(transitionGraduateFollowupFn);
  const createFollowup = useServerFn(createGraduateFollowupFn);
  const listAssignableStaff = useServerFn(listGraduateAffairsAssignableStaffFn);
  const listFollowupTypes = useServerFn(listActiveFollowupTypesFn);
  const [followupBusy, setFollowupBusy] = useState<string | null>(null);
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [followupTypeId, setFollowupTypeId] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [genericError, setGenericError] = useState<string | null>(null);

  const staffQuery = useQuery({
    queryKey: ["graduates-affairs", "assignable-staff"],
    queryFn: () => listAssignableStaff({ data: undefined }),
  });
  const typesQuery = useQuery({
    queryKey: ["graduates-affairs", "active-followup-types"],
    queryFn: () => listFollowupTypes({ data: undefined }),
  });
  const assignableStaff: GraduateAffairsAssignableStaff[] = Array.isArray(staffQuery.data)
    ? staffQuery.data
    : [];
  const followupTypes: FollowupType[] = Array.isArray(typesQuery.data) ? typesQuery.data : [];
  const staffNameByUserId = new Map(assignableStaff.map((s) => [s.user_id, s.full_name]));


  const handleTransition = async (
    followupId: string,
    targetState: string,
    isTerminal: boolean,
  ) => {
    setFollowupBusy(followupId);
    try {
      await transitionFollowup({
        data: {
          followupId,
          targetState,
          outcome: isTerminal ? "تمّت المتابعة" : null,
          nextActionAt: null,
        },
      });
      onInvalidate();
    } catch (err) {
      setGenericError(err instanceof Error ? err.message : "تعذّر تحديث حالة المتابعة.");
    } finally {
      setFollowupBusy(null);
    }
  };

  const handleCreate = async () => {
    if (!assigneeUserId.trim() || !selectedId || !followupTypeId) return;
    setCreateBusy(true);
    try {
      await createFollowup({
        data: {
          graduateRecordId: selectedId,
          assigneeUserId: assigneeUserId.trim(),
          followupTypeId,
          nextActionAt: nextActionAt || null,
        },
      });
      setAssigneeUserId("");
      setFollowupTypeId("");
      setNextActionAt("");
      onInvalidate();
    } catch (err) {
      setGenericError(err instanceof Error ? err.message : "تعذّر إنشاء المتابعة.");
    } finally {
      setCreateBusy(false);
    }
  };

  if (!selectedId)
    return (
      <WorkspaceState
        icon={BriefcaseBusiness}
        title="قائمة الحالات والمتابعة"
        detail="اختر سجل خريج لعرض ملفه التشغيلي والمتابعات الواقعة ضمن صلاحيتك."
      />
    );
  if (loading)
    return (
      <WorkspaceState
        icon={Loader2}
        title="جارٍ تحميل ملف الخريج"
        detail="يتم التحقق من صلاحية الوصول المباشر للسجل."
        spin
      />
    );
  if (error || !file)
    return (
      <WorkspaceState
        icon={AlertTriangle}
        title="تعذّر تحميل ملف الخريج"
        detail={
          error instanceof Error ? error.message : "السجل غير موجود أو لا يقع ضمن نطاق التكليف."
        }
        action={
          <Button type="button" variant="outline" onClick={retry}>
            <RefreshCw className="h-4 w-4" /> إعادة المحاولة
          </Button>
        }
      />
    );
  const isTerminalState = (item: (typeof file.followups)[number], state: string) =>
    (item.terminal_states ?? ["completed", "cancelled"]).includes(state);
  const nextStates = (item: (typeof file.followups)[number]) =>
    (item.transitions ?? [])
      .filter((t) => t.from === item.state)
      .map((t) => t.to);
  const active = file.followups.filter((item) => !isTerminalState(item, item.state));
  return (
    <section className="rounded-2xl border bg-card p-4" aria-labelledby="ga-case-title">
      {genericError && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
          {genericError}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="ga-case-title" className="font-bold text-primary">
            ملف الخريج وقائمة العمل
          </h2>
          <p className="font-mono text-xs text-muted-foreground" dir="ltr">
            {file.record.id}
          </p>
        </div>
        <StateBadge state={file.record.record_state} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <SmallMetric label="المتابعات" value={file.counts.followups} />
        <SmallMetric label="سجلات التوظيف" value={file.counts.employment_events} />
        <SmallMetric label="الموافقات" value={file.counts.consents} />
      </div>
      <div className="mt-5">
        <h3 className="text-sm font-bold">
          المتابعات المفتوحة ({active.length.toLocaleString("ar-EG")})
        </h3>
        {active.length === 0 ? (
          <p className="mt-2 rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            لا توجد حالات مفتوحة أو قيد المعالجة لهذا السجل.
          </p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {active.map((item) => (
              <li key={item.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong>{item.type_label_ar ?? FOLLOWUP_LABELS[item.state] ?? "متابعة"}</strong>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span>{FOLLOWUP_LABELS[item.state] ?? item.state}</span>
                    <span className="mx-2 text-muted-foreground">·</span>
                    <span>
                      {item.next_action_at
                        ? new Date(item.next_action_at).toLocaleDateString("ar-SA")
                        : "دون موعد تالٍ"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {nextStates(item).length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        لا توجد انتقالات متاحة في النسخة المثبتة
                      </span>
                    ) : (
                      nextStates(item).map((target) => (
                        <Button
                          key={target}
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={followupBusy === item.id}
                          onClick={() =>
                            handleTransition(item.id, target, isTerminalState(item, target))
                          }
                        >
                          {FOLLOWUP_LABELS[target] ?? target}
                        </Button>
                      ))
                    )}
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  المسؤول:{" "}
                  {staffNameByUserId.get(item.assignee_user_id) ?? shortId(item.assignee_user_id)}
                  {item.workflow_version ? ` · نسخة سير العمل ${item.workflow_version}` : ""}
                  {item.workflow_pin_source ? ` · ${item.workflow_pin_source}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-5 rounded-lg border p-3">
        <h3 className="text-sm font-bold">إنشاء متابعة جديدة</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px_160px_auto]">
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={assigneeUserId}
            onChange={(e) => setAssigneeUserId(e.target.value)}
          >
            <option value="">اختر الموظف المسؤول…</option>
            {assignableStaff.map((staff) => (
              <option key={staff.user_id} value={staff.user_id}>
                {staff.full_name}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={followupTypeId}
            onChange={(e) => setFollowupTypeId(e.target.value)}
          >
            <option value="">اختر نوع المتابعة…</option>
            {followupTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label_ar}
              </option>
            ))}
          </select>
          <Input
            type="datetime-local"
            value={nextActionAt}
            onChange={(e) => setNextActionAt(e.target.value)}
            placeholder="الموعد التالي"
          />
          <Button
            type="button"
            disabled={createBusy || !assigneeUserId.trim() || !followupTypeId}
            onClick={handleCreate}
          >
            إنشاء
          </Button>
        </div>
      </div>
    </section>
  );
}

function SmallMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-xl font-bold text-primary">{value.toLocaleString("ar-EG")}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function WorkspaceState({
  icon: Icon,
  title,
  detail,
  spin,
  action,
}: {
  icon: typeof UsersRound;
  title: string;
  detail: string;
  spin?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center"
      role={title.includes("تعذّر") ? "alert" : "status"}
    >
      <Icon className={`mx-auto h-9 w-9 text-muted-foreground ${spin ? "animate-spin" : ""}`} />
      <h2 className="mt-3 font-bold text-primary">{title}</h2>
      <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{detail}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
