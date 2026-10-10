import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MvpError } from "@/components/graduation-projects/MvpStates";
import {
  HeadWorkflowUnavailableError,
  approveTeamAndAssignSupervisor,
  describeWorkflowStage,
  fetchDepartmentProjectsOverview,
  fetchSupervisorOptions,
  headWorkflowKeys,
  returnTeam,
  type DepartmentProjectRow,
  type SupervisorOption,
} from "@/lib/graduation-projects/head-workflow";

const TERMINAL_STATES = new Set(["rejected", "archived", "completed", "cancelled"]);

function supervisorLabel(option: SupervisorOption): string {
  const name = option.full_name_ar ?? "عضو هيئة تدريس";
  const self = option.is_self ? " (أنت)" : "";
  const dept = option.department_name_ar ? ` — ${option.department_name_ar}` : "";
  return `${name}${self}${dept} — ${option.active_projects} مشروع`;
}

function TeamList({ row }: { row: DepartmentProjectRow }) {
  if (!row.members.length) return <span className="text-muted-foreground">لا أعضاء</span>;
  return (
    <ul className="space-y-0.5">
      {row.members.map((m) => (
        <li key={`${m.academic_number}-${m.full_name_ar}`}>
          {m.full_name_ar ?? "—"}
          {m.academic_number ? (
            <span className="text-muted-foreground"> ({m.academic_number})</span>
          ) : null}
          {m.is_leader ? <span className="text-xs font-bold text-primary"> · القائد</span> : null}
        </li>
      ))}
    </ul>
  );
}

function ProjectRowCard({
  row,
  options,
  busy,
  onAssign,
  onReturn,
}: {
  row: DepartmentProjectRow;
  options: SupervisorOption[];
  busy: boolean;
  onAssign: (row: DepartmentProjectRow, facultyProfileId: string) => void;
  onReturn: (row: DepartmentProjectRow, reason: string) => void;
}) {
  const [selected, setSelected] = useState(row.supervisor_faculty_profile_id ?? "");
  const [reason, setReason] = useState("");
  const awaitingApproval = Boolean(row.team_submitted_at) && !row.team_approved_at;
  const forming = !row.team_submitted_at && !row.team_approved_at;
  const canReassign = Boolean(row.team_approved_at) && !TERMINAL_STATES.has(row.lifecycle_state);
  const picksSelf = options.some((o) => o.faculty_profile_id === selected && o.is_self);
  const unchanged = selected === (row.supervisor_faculty_profile_id ?? "");

  return (
    <Card data-testid="gp-head-project-row">
      <CardContent className="space-y-3 pt-5 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-bold text-primary">
              {row.title?.trim() ? row.title : "مشروع بلا عنوان بعد"}
            </p>
            <p className="text-muted-foreground">{row.program_name_ar ?? ""}</p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold">
            {describeWorkflowStage(row)}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-bold text-muted-foreground">الفريق</p>
            <TeamList row={row} />
          </div>
          <div>
            <p className="mb-1 text-xs font-bold text-muted-foreground">المشرف</p>
            <p>{row.supervisor_name ?? "لم يُسند بعد"}</p>
            {row.coordinator_name ? (
              <p className="mt-1 text-xs text-muted-foreground">
                جهة الاعتماد: {row.coordinator_name}
              </p>
            ) : null}
          </div>
        </div>

        {forming ? (
          <p className="text-xs text-muted-foreground">
            لم يرسل الطلاب الفريق للاعتماد بعد.
          </p>
        ) : null}

        {awaitingApproval || canReassign ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <label className="block text-xs font-bold" htmlFor={`sup-${row.project_id}`}>
              {awaitingApproval ? "اعتماد الفريق وإسناد المشرف" : "تغيير المشرف"}
            </label>
            <select
              id={`sup-${row.project_id}`}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={busy}
            >
              <option value="">اختر المشرف من أعضاء هيئة التدريس</option>
              {options.map((o) => (
                <option key={o.faculty_profile_id} value={o.faculty_profile_id}>
                  {supervisorLabel(o)}
                </option>
              ))}
            </select>
            {picksSelf ? (
              <p className="text-xs text-amber-700">
                اخترت نفسك مشرفًا: اعتماد المقترح وتشكيل لجنة المناقشة لهذا المشروع ينتقلان إلى
                نائب العميد للشؤون الأكاديمية.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy || !selected || (canReassign && unchanged)}
                onClick={() => onAssign(row, selected)}
              >
                {awaitingApproval ? "اعتماد الفريق وإسناد المشرف" : "حفظ المشرف الجديد"}
              </Button>
            </div>
            {awaitingApproval ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="سبب إعادة الفريق للطلاب"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={busy}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !reason.trim()}
                  onClick={() => onReturn(row, reason.trim())}
                >
                  إعادة الفريق للتعديل
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <Link
          to="/faculty-portal/graduation-projects/$projectId"
          params={{ projectId: row.project_id }}
          className="inline-block text-xs font-bold text-primary underline"
        >
          فتح مساحة المشروع
        </Link>
      </CardContent>
    </Card>
  );
}

/**
 * Department head board: approve student teams, assign supervisors from the
 * whole college, and follow every project of the department. Renders nothing
 * for faculty members who do not manage a department.
 */
export function DepartmentHeadBoard() {
  const queryClient = useQueryClient();
  const overview = useQuery({
    queryKey: headWorkflowKeys.departmentOverview(),
    queryFn: fetchDepartmentProjectsOverview,
    retry: false,
  });
  const canManage = overview.data?.can_manage === true;
  const options = useQuery({
    queryKey: headWorkflowKeys.supervisorOptions(),
    queryFn: fetchSupervisorOptions,
    enabled: canManage,
    retry: false,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["graduation-projects"] });
  };
  const assign = useMutation({
    mutationFn: (input: { row: DepartmentProjectRow; facultyProfileId: string }) =>
      approveTeamAndAssignSupervisor(input.row.project_id, input.row.version, input.facultyProfileId),
    onSuccess: refresh,
  });
  const sendBack = useMutation({
    mutationFn: (input: { row: DepartmentProjectRow; reason: string }) =>
      returnTeam(input.row.project_id, input.row.version, input.reason),
    onSuccess: refresh,
  });

  const projects = useMemo(() => overview.data?.projects ?? [], [overview.data]);
  const pending = useMemo(
    () => projects.filter((p) => p.team_submitted_at && !p.team_approved_at),
    [projects],
  );
  const others = useMemo(
    () => projects.filter((p) => !(p.team_submitted_at && !p.team_approved_at)),
    [projects],
  );

  // Not deployed yet, or not a department manager: stay out of the way.
  if (overview.isLoading) return null;
  if (overview.error) {
    return overview.error instanceof HeadWorkflowUnavailableError ? null : (
      <MvpError message={overview.error.message} retry={() => void overview.refetch()} />
    );
  }
  if (!canManage) return null;

  const busy = assign.isPending || sendBack.isPending;
  const error = assign.error ?? sendBack.error ?? options.error;
  const supervisorOptions = options.data ?? [];

  const renderRow = (row: DepartmentProjectRow) => (
    <ProjectRowCard
      key={`${row.project_id}-${row.version}`}
      row={row}
      options={supervisorOptions}
      busy={busy}
      onAssign={(r, facultyProfileId) => assign.mutate({ row: r, facultyProfileId })}
      onReturn={(r, reason) => sendBack.mutate({ row: r, reason })}
    />
  );

  return (
    <section className="space-y-4" data-testid="gp-department-head-board" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">مشاريع القسم — إدارة رئيس القسم</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          يكوّن طلاب المستوى الرابع فرقهم من بوابتهم ثم يرسلونها إليك. تعتمد الفريق وتسند له
          مشرفًا من أعضاء هيئة التدريس في الكلية، وإسنادك نهائي.
        </CardContent>
      </Card>

      {error ? <MvpError message={error.message} /> : null}

      <div className="space-y-3">
        <h2 className="text-base font-extrabold text-primary">
          فرق بانتظار اعتمادك ({pending.length})
        </h2>
        {pending.length ? (
          pending.map(renderRow)
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            لا توجد فرق بانتظار الاعتماد.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-extrabold text-primary">
          جميع مشاريع القسم ({others.length})
        </h2>
        {others.length ? (
          others.map(renderRow)
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            لا توجد مشاريع أخرى في القسم بعد.
          </p>
        )}
      </div>
    </section>
  );
}
