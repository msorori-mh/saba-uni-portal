import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAdminServiceDefinition,
  saveServiceEligibilityRules,
  saveServiceStepActions,
} from "@/lib/admin-service-definition.functions";
import {
  ACTION_KIND_LABEL,
  SERVICE_CHANGE_KIND_LABEL,
  actionsAllowedForService,
  ruleFromCatalog,
  validateEligibilityRules,
  type AdminServiceDefinition,
  type ServiceEligibilityRule,
} from "@/lib/admin-service-definition";

type Props = {
  requestTypeId: string;
  requestTypeCode: string | null;
};

export function ServiceDefinitionPanel({ requestTypeId, requestTypeCode }: Props) {
  const definitionFn = useServerFn(getAdminServiceDefinition);
  const saveRulesFn = useServerFn(saveServiceEligibilityRules);
  const saveActionsFn = useServerFn(saveServiceStepActions);

  const [rules, setRules] = useState<ServiceEligibilityRule[]>([]);
  const [stepActions, setStepActions] = useState<Record<string, string | null>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [savingRules, setSavingRules] = useState(false);
  const [savingActions, setSavingActions] = useState(false);

  const query = useQuery<AdminServiceDefinition>({
    queryKey: ["admin-service-definition", requestTypeId],
    queryFn: () => definitionFn({ data: { requestTypeId } }),
  });

  const definition = query.data;

  useEffect(() => {
    if (!definition) return;
    setRules(definition.eligibility_rules.map((r) => ({ ...r, params: r.params ?? {} })));
    setStepActions(
      Object.fromEntries(definition.step_actions.map((s) => [s.step_key, s.action_code])),
    );
  }, [definition]);

  const allowedActions = useMemo(
    () => actionsAllowedForService(definition?.action_catalog ?? [], requestTypeCode),
    [definition, requestTypeCode],
  );

  const activeWorkflow = useMemo(
    () => definition?.workflow_versions.find((w) => w.is_active && w.status === "active") ?? null,
    [definition],
  );

  const availableCatalog = (definition?.rule_catalog ?? []).filter(
    (c) => !rules.some((r) => r.rule_code === c.code),
  );

  async function onSaveRules() {
    const validation = validateEligibilityRules(rules);
    setErrors(validation);
    setMessage(null);
    if (validation.length > 0) return;

    setSavingRules(true);
    try {
      const res = await saveRulesFn({
        data: {
          requestTypeId,
          rules: rules.map((r, index) => ({
            rule_code: r.rule_code,
            params: r.params,
            message_ar: r.message_ar,
            is_active: r.is_active,
            sort_order: index * 10,
          })),
        },
      });
      setMessage(`تم حفظ ${res.rulesCount} قاعدة أهلية.`);
      await query.refetch();
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "تعذر حفظ قواعد الأهلية"]);
    } finally {
      setSavingRules(false);
    }
  }

  async function onSaveStepActions() {
    if (!activeWorkflow) return;
    setSavingActions(true);
    setErrors([]);
    setMessage(null);
    try {
      const res = await saveActionsFn({
        data: {
          workflowId: activeWorkflow.id,
          stepActions: (definition?.step_actions ?? [])
            .filter((s) => s.workflow_id === activeWorkflow.id)
            .map((s) => ({
              step_key: s.step_key,
              action_code: stepActions[s.step_key] ?? null,
            })),
        },
      });
      setMessage(`تم ربط ${res.updatedSteps} خطوة بإجراءات الكتالوج.`);
      await query.refetch();
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "تعذر حفظ ربط الإجراءات"]);
    } finally {
      setSavingActions(false);
    }
  }

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          جارٍ تحميل تعريف الخدمة…
        </CardContent>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card>
        <CardContent className="py-6 text-destructive">
          {query.error instanceof Error ? query.error.message : "تعذر تحميل تعريف الخدمة"}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5 text-primary" />
          تعريف الخدمة
        </CardTitle>
        <CardDescription>
          الأهلية والأثر النهائي والإصدارات تُدار من هنا كإعدادات، دون تعديل برمجي.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
            {message}
          </div>
        ) : null}
        {errors.length > 0 ? (
          <ul className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}

        <Tabs defaultValue="eligibility" dir="rtl">
          <TabsList>
            <TabsTrigger value="eligibility">شروط الأهلية</TabsTrigger>
            <TabsTrigger value="actions">الأثر النهائي</TabsTrigger>
            <TabsTrigger value="versions">الإصدارات</TabsTrigger>
            <TabsTrigger value="log">سجل التعديلات</TabsTrigger>
          </TabsList>

          <TabsContent value="eligibility" className="space-y-4 pt-4">
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                لا توجد قواعد أهلية لهذه الخدمة — أي طالب ضمن جمهور الخدمة يستطيع التقديم.
              </p>
            ) : null}

            {rules.map((rule, index) => {
              const catalogItem = definition?.rule_catalog.find((c) => c.code === rule.rule_code);
              return (
                <div key={rule.rule_code} className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{catalogItem?.name_ar ?? rule.rule_code}</p>
                      <p className="text-xs text-muted-foreground">
                        {catalogItem?.description_ar ?? ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.is_active}
                          onCheckedChange={(checked) =>
                            setRules((prev) =>
                              prev.map((r, i) => (i === index ? { ...r, is_active: checked } : r)),
                            )
                          }
                        />
                        <span className="text-xs text-muted-foreground">مفعّلة</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setRules((prev) => prev.filter((_, i) => i !== index))}
                        aria-label="حذف القاعدة"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <RuleParamsEditor
                    rule={rule}
                    onChange={(params) =>
                      setRules((prev) => prev.map((r, i) => (i === index ? { ...r, params } : r)))
                    }
                  />

                  <div className="space-y-1">
                    <Label className="text-xs">رسالة الرفض للطالب</Label>
                    <Input
                      value={rule.message_ar}
                      onChange={(e) =>
                        setRules((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, message_ar: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              );
            })}

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value=""
                onValueChange={(code) => {
                  const item = definition?.rule_catalog.find((c) => c.code === code);
                  if (!item) return;
                  setRules((prev) => [...prev, ruleFromCatalog(item, prev.length * 10)]);
                }}
              >
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="إضافة قاعدة من الكتالوج" />
                </SelectTrigger>
                <SelectContent>
                  {availableCatalog.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name_ar}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Plus className="h-4 w-4 text-muted-foreground" />
              <Button type="button" onClick={onSaveRules} disabled={savingRules}>
                {savingRules ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="ml-2 h-4 w-4" />
                )}
                حفظ قواعد الأهلية
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="actions" className="space-y-4 pt-4">
            {!activeWorkflow ? (
              <p className="text-sm text-muted-foreground">
                لا يوجد إصدار مفعّل لدورة الإجراءات — فعّل إصدارًا أولًا لربط الإجراءات بالخطوات.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  كل خطوة تختار إجراءً معلنًا من الكتالوج الآمن؛ لا تُكتب أوامر قاعدة بيانات هنا.
                </p>
                {(definition?.step_actions ?? [])
                  .filter((s) => s.workflow_id === activeWorkflow.id)
                  .map((step) => (
                    <div
                      key={step.step_key}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div>
                        <p className="font-medium">{step.step_name_ar}</p>
                        <p className="text-xs text-muted-foreground">
                          الخطوة {step.step_order} — {step.step_key}
                        </p>
                      </div>
                      <Select
                        value={stepActions[step.step_key] ?? "none"}
                        onValueChange={(value) =>
                          setStepActions((prev) => ({
                            ...prev,
                            [step.step_key]: value === "none" ? null : value,
                          }))
                        }
                      >
                        <SelectTrigger className="w-80">
                          <SelectValue placeholder="بدون إجراء" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">بدون إجراء</SelectItem>
                          {allowedActions.map((a) => (
                            <SelectItem key={a.code} value={a.code}>
                              {a.name_ar} — {ACTION_KIND_LABEL[a.kind] ?? a.kind}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                <Button type="button" onClick={onSaveStepActions} disabled={savingActions}>
                  {savingActions ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="ml-2 h-4 w-4" />
                  )}
                  حفظ ربط الإجراءات
                </Button>
              </>
            )}
          </TabsContent>

          <TabsContent value="versions" className="space-y-3 pt-4">
            {(definition?.workflow_versions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد إصدارات بعد.</p>
            ) : null}
            {(definition?.workflow_versions ?? []).map((v) => (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div>
                  <p className="font-medium">
                    {v.name_ar} — إصدار {v.version}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    الطلبات المثبتة على هذا الإصدار: {v.pinned_requests}
                    {v.published_at ? ` • نُشر: ${new Date(v.published_at).toLocaleString("ar")}` : ""}
                    {v.superseded_at
                      ? ` • استُبدل: ${new Date(v.superseded_at).toLocaleString("ar")}`
                      : ""}
                  </p>
                </div>
                <Badge variant={v.is_active && v.status === "active" ? "default" : "secondary"}>
                  {v.is_active && v.status === "active" ? "الإصدار المنشور" : "إصدار سابق"}
                </Badge>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="log" className="space-y-2 pt-4">
            {(definition?.change_log ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد تعديلات مسجلة بعد.</p>
            ) : null}
            {(definition?.change_log ?? []).map((entry) => (
              <div key={entry.id} className="rounded-md border p-3 text-sm">
                <span className="font-medium">
                  {SERVICE_CHANGE_KIND_LABEL[entry.change_kind] ?? entry.change_kind}
                </span>
                <span className="text-muted-foreground">
                  {" — "}
                  {new Date(entry.created_at).toLocaleString("ar")}
                </span>
                {entry.change_note ? (
                  <p className="text-xs text-muted-foreground">{entry.change_note}</p>
                ) : null}
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function RuleParamsEditor({
  rule,
  onChange,
}: {
  rule: ServiceEligibilityRule;
  onChange: (params: Record<string, unknown>) => void;
}) {
  if (rule.rule_code === "STUDENT_STUDY_STATUS_IN") {
    const values = Array.isArray(rule.params["values"])
      ? (rule.params["values"] as string[])
      : [];
    return (
      <div className="space-y-1">
        <Label className="text-xs">حالات الدراسة المسموحة (مفصولة بفاصلة)</Label>
        <Input
          value={values.join(", ")}
          onChange={(e) =>
            onChange({
              values: e.target.value
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
            })
          }
          placeholder="new, continuing"
        />
      </div>
    );
  }

  if (
    rule.rule_code === "MAX_CONSECUTIVE_SUSPENSION_YEARS" ||
    rule.rule_code === "MAX_SUSPENSION_SEMESTERS"
  ) {
    return (
      <div className="space-y-1">
        <Label className="text-xs">الحد الأقصى</Label>
        <Input
          type="number"
          min={1}
          value={String(rule.params["max"] ?? "")}
          onChange={(e) => onChange({ max: Number(e.target.value) })}
          className="w-40"
        />
      </div>
    );
  }

  return <p className="text-xs text-muted-foreground">هذه القاعدة لا تحتاج معاملات.</p>;
}
