import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck, Save, Send, Loader2 } from "lucide-react";
import {
  GP_POLICY_EMPTY_DRAFT,
  GP_POLICY_FIELD_LABELS_AR,
  GP_POLICY_STATUS_LABELS_AR,
  describePolicyScope,
  validateDraftPolicy,
  validatePolicyForPublish,
  type GraduationProjectPolicy,
  type GraduationProjectPolicyDraft,
} from "@/lib/graduation-projects/policies";

import {
  listGraduationProjectPolicies,
  publishGraduationProjectPolicy,
  saveGraduationProjectPolicyDraft,
} from "@/lib/graduation-projects/policies.functions";

const NUMBER_FIELDS = [
  "min_team_size",
  "max_team_size",
  "required_progress_reports",
  "min_committee_members",
  "max_committee_members",
  "passing_score",
  "max_revision_rounds",
] as const;


const DATE_FIELDS = [
  "proposal_window_start",
  "proposal_window_end",
  "defense_window_start",
  "defense_window_end",
] as const;

export function GraduationProjectPolicyPanel() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listGraduationProjectPolicies);
  const saveFn = useServerFn(saveGraduationProjectPolicyDraft);
  const publishFn = useServerFn(publishGraduationProjectPolicy);

  const [draft, setDraft] = useState<GraduationProjectPolicyDraft>({ ...GP_POLICY_EMPTY_DRAFT });
  const [message, setMessage] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["gp-policies"],
    queryFn: () => listFn(),
  });

  const errors = useMemo(() => validateGraduationProjectPolicy(draft), [draft]);

  const departmentName = (id: string | null) =>
    query.data?.departments.find((d) => d.id === id)?.name_ar ?? null;
  const yearName = (id: string | null) =>
    query.data?.academicYears.find((y) => y.id === id)?.name_ar ?? null;

  const save = useMutation({
    mutationFn: () => saveFn({ data: { ...draft, id: draft.id ?? null } }),
    onSuccess: (res) => {
      setDraft((d) => ({ ...d, id: res.id }));
      setMessage("تم حفظ المسودة.");
      void queryClient.invalidateQueries({ queryKey: ["gp-policies"] });
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const publish = useMutation({
    mutationFn: (policyId: string) => publishFn({ data: { policyId } }),
    onSuccess: () => {
      setMessage("تم نشر الإصدار، وأصبح ساريًا على المشاريع الجديدة فورًا.");
      void queryClient.invalidateQueries({ queryKey: ["gp-policies"] });
    },
    onError: (e: Error) => setMessage(e.message),
  });

  const loadPolicy = (policy: GraduationProjectPolicy) => {
    setDraft({
      id: policy.status === "draft" ? policy.id : null,
      department_id: policy.department_id,
      academic_year_id: policy.academic_year_id,
      min_team_size: policy.min_team_size,
      max_team_size: policy.max_team_size,
      allow_co_supervisor: policy.allow_co_supervisor,
      max_supervisors: policy.max_supervisors,
      required_progress_reports: policy.required_progress_reports,
      min_committee_members: policy.min_committee_members,
      max_committee_members: policy.max_committee_members,
      passing_score: policy.passing_score === null ? null : Number(policy.passing_score),
      max_revision_rounds: policy.max_revision_rounds,
      proposal_window_start: policy.proposal_window_start,
      proposal_window_end: policy.proposal_window_end,
      defense_window_start: policy.defense_window_start,
      defense_window_end: policy.defense_window_end,
      notes: policy.notes,
    });
    setMessage(null);
  };

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل السياسات…
        </CardContent>
      </Card>
    );
  }

  if (query.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          لا تملك صلاحية إدارة سياسات مشاريع التخرج، أو تعذّر تحميلها.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" />
            سياسات مشاريع التخرج
          </CardTitle>
          <CardDescription>
            إعدادات تشغيلية فوق النواة الثابتة: الأهلية وفصل الأدوار وانتقالات الحالة ودورات
            التقييم والأرشفة تبقى محمية في الخلفية ولا تُعدّل من هنا.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>القسم</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={draft.department_id ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, id: null, department_id: e.target.value || null }))
                }
              >
                <option value="">كل الأقسام (افتراضي الكلية)</option>
                {query.data?.departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name_ar}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>العام الأكاديمي</Label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={draft.academic_year_id ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, id: null, academic_year_id: e.target.value || null }))
                }
              >
                <option value="">كل الأعوام</option>
                {query.data?.academicYears.map((y) => (
                  <option key={y.id} value={y.id}>{y.name_ar}</option>
                ))}
              </select>
            </div>

            {NUMBER_FIELDS.map((field) => (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={field}>{GP_POLICY_FIELD_LABELS_AR[field]}</Label>
                <Input
                  id={field}
                  type="number"
                  placeholder="مطلوب — لا يوجد افتراضي"
                  value={draft[field] === null ? "" : String(draft[field])}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      [field]: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                />
              </div>
            ))}


            {DATE_FIELDS.map((field) => (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={field}>{GP_POLICY_FIELD_LABELS_AR[field]}</Label>
                <Input
                  id={field}
                  type="date"
                  value={draft[field] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [field]: e.target.value || null }))
                  }
                />
              </div>
            ))}

            <div className="flex items-center justify-between rounded-md border border-dashed p-3 sm:col-span-2">
              <div>
                <Label htmlFor="allow_co_supervisor" className="text-muted-foreground">
                  {GP_POLICY_FIELD_LABELS_AR["allow_co_supervisor"]}
                </Label>
                <p className="text-xs text-muted-foreground">
                  مؤجّل: النظام يدعم مشرفًا واحدًا فقط، ولا يمكن نشر سياسة تسمح بأكثر من ذلك.
                </p>
              </div>
              <Switch id="allow_co_supervisor" checked={false} disabled />
            </div>


            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea
                id="notes"
                value={draft.notes ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value || null }))}
                rows={2}
              />
            </div>
          </div>

          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="list-disc pr-4 space-y-1">
                  {errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => save.mutate()}
              disabled={errors.length > 0 || save.isPending}
            >
              <Save className="h-4 w-4 ms-1" />
              حفظ كمسودة
            </Button>
            <Button
              variant="secondary"
              disabled={!draft.id || publish.isPending}
              onClick={() => draft.id && publish.mutate(draft.id)}
            >
              <Send className="h-4 w-4 ms-1" />
              نشر الإصدار
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">الإصدارات المسجّلة</CardTitle>
          <CardDescription>
            نشر إصدار جديد يستبدل السابق تلقائيًا لنفس النطاق، مع بقاء السجل للمراجعة.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(query.data?.policies.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">
              لا توجد سياسات مسجّلة بعد — ولا توجد قيم افتراضية مدمجة: لن يتمكّن النظام من إنشاء
              مشاريع تخرج جديدة حتى تنشر الإدارة سياسة معتمدة.
            </p>
          )}

          {query.data?.policies.map((policy) => (
            <button
              key={policy.id}
              type="button"
              onClick={() => loadPolicy(policy)}
              className="w-full text-right rounded-md border p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-bold">
                  {describePolicyScope(policy, departmentName(policy.department_id), yearName(policy.academic_year_id))}
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant={policy.status === "published" ? "default" : "secondary"}>
                    {GP_POLICY_STATUS_LABELS_AR[policy.status] ?? policy.status}
                  </Badge>
                  <Badge variant="outline">الإصدار {policy.version}</Badge>
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                فريق {policy.min_team_size}–{policy.max_team_size} · لجنة{" "}
                {policy.min_committee_members}–{policy.max_committee_members} · نجاح{" "}
                {policy.passing_score} · دورات تعديل {policy.max_revision_rounds}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
