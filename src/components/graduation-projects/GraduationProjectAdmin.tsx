import { useState, type ChangeEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  GraduationProjectRubricRow,
  GraduationProjectSettingsRow,
  RubricCriterionInput,
} from "../../lib/graduation-projects/lifecycle";

export interface GraduationProjectAdminProps {
  settings: GraduationProjectSettingsRow[];
  rubrics: GraduationProjectRubricRow[];
  busy?: boolean;
  onSaveSettings(input: {
    teamMin: number;
    teamMax: number;
    supervisorCapacity: number | null;
    coSupervisorAllowed: boolean;
    correctionWindowDays: number;
    defenseNoticeDays: number;
  }): void;
  onSaveRubric(input: {
    code: string;
    versionLabel: string;
    title: string;
    passingThreshold: number | null;
    criteria: RubricCriterionInput[];
  }): void;
}

function emptyCriterion(index: number): RubricCriterionInput {
  return {
    criterion_code: `C${index}`,
    criterion_label: "",
    maximum_score: 0,
    sequence_no: index,
  };
}

export function GraduationProjectAdmin({
  settings,
  rubrics,
  busy = false,
  onSaveSettings,
  onSaveRubric,
}: GraduationProjectAdminProps) {
  const current = settings[0] ?? null;
  const [teamMin, setTeamMin] = useState(String(current?.team_min ?? 1));
  const [teamMax, setTeamMax] = useState(String(current?.team_max ?? 3));
  const [capacity, setCapacity] = useState(
    current?.supervisor_capacity != null ? String(current.supervisor_capacity) : "",
  );
  const [coAllowed, setCoAllowed] = useState(current?.co_supervisor_allowed ?? true);
  const [correctionDays, setCorrectionDays] = useState(String(current?.correction_window_days ?? 30));
  const [noticeDays, setNoticeDays] = useState(String(current?.defense_notice_days ?? 7));

  const [rubricCode, setRubricCode] = useState("");
  const [rubricVersion, setRubricVersion] = useState("");
  const [rubricTitle, setRubricTitle] = useState("");
  const [rubricThreshold, setRubricThreshold] = useState("");
  const [criteria, setCriteria] = useState<RubricCriterionInput[]>([emptyCriterion(1)]);

  const teamMinNum = Number(teamMin);
  const teamMaxNum = Number(teamMax);
  const settingsValid =
    Number.isInteger(teamMinNum) &&
    teamMinNum >= 1 &&
    Number.isInteger(teamMaxNum) &&
    teamMaxNum >= teamMinNum &&
    (capacity.trim() === "" || Number(capacity) > 0) &&
    Number(correctionDays) > 0 &&
    Number(noticeDays) >= 0;

  const criteriaValid = criteria.every(
    (criterion) =>
      criterion.criterion_code.trim() !== "" &&
      criterion.criterion_label.trim() !== "" &&
      criterion.maximum_score > 0,
  );
  const rubricValid =
    rubricCode.trim().length >= 2 &&
    rubricVersion.trim() !== "" &&
    rubricTitle.trim().length >= 3 &&
    criteriaValid;

  const updateCriterion = (index: number, patch: Partial<RubricCriterionInput>) => {
    setCriteria((currentCriteria) =>
      currentCriteria.map((criterion, i) => (i === index ? { ...criterion, ...patch } : criterion)),
    );
  };

  const numberField = (
    id: string,
    label: string,
    value: string,
    setValue: (next: string) => void,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        inputMode="numeric"
        onChange={(event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value)}
      />
    </div>
  );

  return (
    <div dir="rtl" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>إعدادات مشاريع التخرج</CardTitle>
          <CardDescription>
            تُطبق على قسمك فقط وتُفرض في العقود الخلفية (حجم الفريق، طاقة الإشراف، النوافذ).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {numberField("gp-team-min", "الحد الأدنى للفريق", teamMin, setTeamMin)}
            {numberField("gp-team-max", "الحد الأقصى للفريق", teamMax, setTeamMax)}
            {numberField("gp-capacity", "طاقة الإشراف (فارغ = بلا حد)", capacity, setCapacity)}
            {numberField("gp-correction-days", "مهلة التصحيحات (يوم)", correctionDays, setCorrectionDays)}
            {numberField("gp-notice-days", "مهلة إشعار المناقشة (يوم)", noticeDays, setNoticeDays)}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={coAllowed}
              onChange={(event) => setCoAllowed(event.target.checked)}
            />
            السماح بالمشرف المشارك
          </label>
          {!settingsValid ? (
            <p className="text-sm text-destructive" role="alert">
              تحقق من القيم: الحد الأقصى ≥ الأدنى، وكل الأرقام موجبة.
            </p>
          ) : null}
          <Button
            type="button"
            disabled={busy || !settingsValid}
            data-testid="gp-save-settings"
            onClick={() =>
              onSaveSettings({
                teamMin: teamMinNum,
                teamMax: teamMaxNum,
                supervisorCapacity: capacity.trim() === "" ? null : Number(capacity),
                coSupervisorAllowed: coAllowed,
                correctionWindowDays: Number(correctionDays),
                defenseNoticeDays: Number(noticeDays),
              })
            }
          >
            حفظ الإعدادات
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>سلالم التقييم</CardTitle>
          <CardDescription>معايير التقييم المرجعية للقسم وأوزانها.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-1">
            {rubrics.map((rubric) => (
              <li key={rubric.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">
                  {rubric.code} — {rubric.version_label}
                </Badge>
                <span>{rubric.title}</span>
                <span className="text-muted-foreground">
                  ({rubric.criteria.length} معايير)
                </span>
              </li>
            ))}
            {rubrics.length === 0 ? <li>لا توجد سلالم تقييم بعد.</li> : null}
          </ul>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={rubricCode}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setRubricCode(event.target.value)}
              placeholder="رمز السلم (مثل GEN)"
              aria-label="رمز سلم التقييم"
            />
            <Input
              value={rubricVersion}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setRubricVersion(event.target.value)}
              placeholder="إصدار السلم (مثل v1)"
              aria-label="إصدار سلم التقييم"
            />
            <Input
              value={rubricTitle}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setRubricTitle(event.target.value)}
              placeholder="عنوان السلم"
              aria-label="عنوان سلم التقييم"
            />
            <Input
              value={rubricThreshold}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setRubricThreshold(event.target.value)
              }
              placeholder="عتبة النجاح (اختياري)"
              inputMode="decimal"
              aria-label="عتبة النجاح"
            />
          </div>
          {criteria.map((criterion, index) => (
            <div key={index} className="grid gap-2 border-b pb-2 sm:grid-cols-4">
              <Input
                value={criterion.criterion_code}
                dir="ltr"
                placeholder="رمز المعيار"
                aria-label={`رمز المعيار ${index + 1}`}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateCriterion(index, { criterion_code: event.target.value })
                }
              />
              <Input
                value={criterion.criterion_label}
                placeholder="اسم المعيار"
                aria-label={`اسم المعيار ${index + 1}`}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateCriterion(index, { criterion_label: event.target.value })
                }
              />
              <Input
                value={String(criterion.maximum_score)}
                dir="ltr"
                inputMode="decimal"
                placeholder="الدرجة العظمى"
                aria-label={`الدرجة العظمى للمعيار ${index + 1}`}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateCriterion(index, { maximum_score: Number(event.target.value) })
                }
              />
              <Input
                value={String(criterion.weight ?? 1)}
                dir="ltr"
                inputMode="decimal"
                placeholder="الوزن"
                aria-label={`وزن المعيار ${index + 1}`}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  updateCriterion(index, { weight: Number(event.target.value) })
                }
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCriteria((currentCriteria) => [...currentCriteria, emptyCriterion(currentCriteria.length + 1)])}
            >
              إضافة معيار
            </Button>
            <Button
              type="button"
              disabled={busy || !rubricValid}
              data-testid="gp-save-rubric"
              onClick={() =>
                onSaveRubric({
                  code: rubricCode.trim(),
                  versionLabel: rubricVersion.trim(),
                  title: rubricTitle.trim(),
                  passingThreshold:
                    rubricThreshold.trim() === "" ? null : Number(rubricThreshold),
                  criteria,
                })
              }
            >
              حفظ سلم التقييم
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
