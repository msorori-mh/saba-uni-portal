import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CreateTeamPanelInput {
  departmentId: string;
  programId: string;
  academicYearId: string;
  semesterId: string;
  leaderStudentProfileId: string;
  leaderUserId: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function CreateTeamPanel({
  busy = false,
  defaults,
  onSubmit,
}: {
  busy?: boolean;
  defaults?: Partial<CreateTeamPanelInput>;
  onSubmit: (input: CreateTeamPanelInput) => void;
}) {
  const [departmentId, setDepartmentId] = useState(defaults?.departmentId ?? "");
  const [programId, setProgramId] = useState(defaults?.programId ?? "");
  const [academicYearId, setAcademicYearId] = useState(defaults?.academicYearId ?? "");
  const [semesterId, setSemesterId] = useState(defaults?.semesterId ?? "");
  const [leaderStudentProfileId, setLeaderStudentProfileId] = useState(
    defaults?.leaderStudentProfileId ?? "",
  );
  const [leaderUserId, setLeaderUserId] = useState(defaults?.leaderUserId ?? "");

  const fields = [
    departmentId,
    programId,
    academicYearId,
    semesterId,
    leaderStudentProfileId,
    leaderUserId,
  ];
  const valid = fields.every(isUuid);

  return (
    <Card dir="rtl" data-testid="create-team-panel">
      <CardHeader>
        <CardTitle>إنشاء فريق مشروع تخرج</CardTitle>
        <CardDescription>
          للمنسق على مستوى القسم فقط. يُنشأ المشروع في حالة مسودة مع تعيين القائد والمنسق مباشرة.
          أدخل معرّفات الدليل الأكاديمي المعتمدة (ملف الطالب + حساب الدخول + السياق الأكاديمي).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Field
          id="gp-dept"
          label="معرّف القسم"
          value={departmentId}
          onChange={setDepartmentId}
        />
        <Field
          id="gp-program"
          label="معرّف البرنامج"
          value={programId}
          onChange={setProgramId}
        />
        <Field
          id="gp-year"
          label="معرّف السنة الأكاديمية"
          value={academicYearId}
          onChange={setAcademicYearId}
        />
        <Field
          id="gp-semester"
          label="معرّف الفصل"
          value={semesterId}
          onChange={setSemesterId}
        />
        <Field
          id="gp-leader-profile"
          label="ملف الطالب القائد"
          value={leaderStudentProfileId}
          onChange={setLeaderStudentProfileId}
        />
        <Field
          id="gp-leader-user"
          label="حساب دخول القائد"
          value={leaderUserId}
          onChange={setLeaderUserId}
        />
        {!valid && fields.some((f) => f.trim().length > 0) ? (
          <p className="sm:col-span-2 text-sm text-destructive">
            جميع الحقول يجب أن تكون معرّفات UUID صالحة من الدليل الأكاديمي.
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <Button
            type="button"
            disabled={busy || !valid}
            onClick={() =>
              onSubmit({
                departmentId: departmentId.trim(),
                programId: programId.trim(),
                academicYearId: academicYearId.trim(),
                semesterId: semesterId.trim(),
                leaderStudentProfileId: leaderStudentProfileId.trim(),
                leaderUserId: leaderUserId.trim(),
              })
            }
          >
            إنشاء الفريق
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        dir="ltr"
        className="font-mono text-xs"
      />
    </div>
  );
}
