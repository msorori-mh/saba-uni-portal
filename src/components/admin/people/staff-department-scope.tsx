export type StaffDepartmentScope = "all" | "specific";

export function formatStaffDepartmentLabel(input: {
  department_scope?: string | null;
  department_names?: string[];
  department_ids?: string[];
}): { label: string; title?: string } {
  if (input.department_scope === "all") {
    return { label: "كل أقسام الكلية" };
  }
  const names = input.department_names ?? [];
  if (names.length === 0) {
    return { label: "—" };
  }
  if (names.length === 1) {
    return { label: names[0]! };
  }
  return {
    label: `${names.length} أقسام`,
    title: names.join("، "),
  };
}

export function StaffDepartmentScopeFields({
  departments,
  scope,
  departmentIds,
  onScopeChange,
  onDepartmentIdsChange,
  operationalScopeHint = false,
}: {
  departments: Array<{ id: string; name_ar: string }>;
  scope: StaffDepartmentScope;
  departmentIds: string[];
  onScopeChange: (scope: StaffDepartmentScope) => void;
  onDepartmentIdsChange: (ids: string[]) => void;
  /** When true, warn that college-wide "all" does not grant GA specialist ops. */
  operationalScopeHint?: boolean;
}) {
  const toggleDepartment = (id: string) => {
    if (departmentIds.includes(id)) {
      onDepartmentIdsChange(departmentIds.filter((x) => x !== id));
    } else {
      onDepartmentIdsChange([...departmentIds, id]);
    }
  };

  return (
    <div className="space-y-3 sm:col-span-2">
      <label className="block space-y-1">
        <span className="text-xs font-bold text-primary">نطاق الأقسام</span>
        <select
          value={scope}
          onChange={(e) => onScopeChange(e.target.value as StaffDepartmentScope)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">كل أقسام الكلية</option>
          <option value="specific">أقسام محددة</option>
        </select>
      </label>

      {operationalScopeHint && scope === "all" && (
        <p className="text-xs text-amber-800 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
          تنبيه تشغيلي: خيار «كل أقسام الكلية» يمسح ربط الأقسام الصريح ولا يمنح
          صلاحية مختص شؤون الخريجين. صلاحية المختص تعتمد فقط على صفوف
          staff_profile_departments الصريحة (fail-closed).
        </p>
      )}

      {scope === "specific" && (
        <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
          <div className="text-xs font-bold text-primary">اختر قسماً واحداً أو أكثر *</div>
          <div className="grid gap-2 sm:grid-cols-2 max-h-40 overflow-y-auto">
            {departments.map((d) => (
              <label
                key={d.id}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm cursor-pointer hover:bg-secondary/40"
              >
                <input
                  type="checkbox"
                  checked={departmentIds.includes(d.id)}
                  onChange={() => toggleDepartment(d.id)}
                  className="h-4 w-4"
                />
                <span>{d.name_ar}</span>
              </label>
            ))}
          </div>
          {departmentIds.length === 0 && (
            <p className="text-xs text-destructive">يجب اختيار قسم واحد على الأقل.</p>
          )}
        </div>
      )}
    </div>
  );
}
