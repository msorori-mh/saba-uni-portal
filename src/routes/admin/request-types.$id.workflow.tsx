import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, GitBranch, Loader2, Save, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAdminRequestWorkflowConfig,
  getRequestTypeForWorkflow,
  listRequestProcessingOptions,
  prepareStudentRequestWorkflowSave,
  saveAdminRequestWorkflowConfig,
} from "@/lib/admin-request-workflow.functions";
import {
  WORKFLOW_SAVE_NOT_AVAILABLE_MSG,
  canSubmitWorkflowSave,
  isAdminSaveWorkflowRpcAvailable,
  type AdminRequestWorkflowConfig,
  type DraftWorkflowStep,
  type DraftWorkflowTransition,
  type WorkflowActionType,
  type WorkflowConfigWorkflow,
  type WorkflowSaveMode,
} from "@/lib/admin-request-workflow-rpc";
import { WORKFLOW_STATUS_LABEL } from "@/components/admin/request-workflow/constants";
import { WorkflowStepsEditor } from "@/components/admin/request-workflow/WorkflowStepsEditor";
import { WorkflowTransitionsEditor } from "@/components/admin/request-workflow/WorkflowTransitionsEditor";
import { RequestWorkflowPreview } from "@/components/admin/RequestWorkflowPreview";
import {
  canonicalPreviewToSuggestedDraftSteps,
  getCanonicalDraftTransitionsForType,
  hasCanonicalWorkflowPreview,
  WORKFLOW_SCHEMA_UNAVAILABLE_MSG,
} from "@/lib/student-requests/request-workflow-preview-registry";
import {
  WORKFLOW_SAVE_REFRESH_FAILED_MSG,
  WORKFLOW_SAVE_REFRESH_MISSING_MSG,
  decideWorkflowEditorRemap,
  hasWorkflowId,
  mapWorkflowConfigToDraft,
  selectWorkflowForEditor,
} from "@/lib/student-requests/request-workflow-editor-mappers";
import { STUDENT_REQUEST_SERVICE_UPDATING_MSG } from "@/lib/student-request-rpc";
import type { StudentRequestWorkflowSaveResult } from "@/lib/student-requests/request-workflow-save-contract";

export const Route = createFileRoute("/admin/request-types/$id/workflow")({
  component: AdminRequestTypeWorkflowPage,
});

function resolveWorkflowState(workflows: WorkflowConfigWorkflow[]): {
  label: string;
  detail: string;
  variant: "none" | "draft" | "active" | "retired";
} {
  if (workflows.length === 0) {
    return {
      label: "لا توجد دورة حياة",
      detail: "لا توجد دورة حياة لهذا الطلب بعد",
      variant: "none",
    };
  }
  const active = workflows.find((w) => w.is_active && w.status === "active");
  if (active) {
    return {
      label: WORKFLOW_STATUS_LABEL.active,
      detail: `${active.name_ar} (إصدار ${active.version})`,
      variant: "active",
    };
  }
  const draft = workflows.find((w) => w.status === "draft");
  if (draft) {
    return {
      label: WORKFLOW_STATUS_LABEL.draft,
      detail: `${draft.name_ar} (إصدار ${draft.version})`,
      variant: "draft",
    };
  }
  const retired = workflows[0];
  return {
    label: WORKFLOW_STATUS_LABEL.retired,
    detail: retired ? `${retired.name_ar} (إصدار ${retired.version})` : "",
    variant: "retired",
  };
}

function AdminRequestTypeWorkflowPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const typeFn = useServerFn(getRequestTypeForWorkflow);
  const configFn = useServerFn(getAdminRequestWorkflowConfig);
  const processingFn = useServerFn(listRequestProcessingOptions);
  const saveFn = useServerFn(saveAdminRequestWorkflowConfig);
  const dryRunFn = useServerFn(prepareStudentRequestWorkflowSave);

  const [draftSteps, setDraftSteps] = useState<DraftWorkflowStep[]>([]);
  const [draftTransitions, setDraftTransitions] = useState<DraftWorkflowTransition[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<StudentRequestWorkflowSaveResult | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState<WorkflowSaveMode | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const saveRpcAvailable = isAdminSaveWorkflowRpcAvailable();
  const dryRunOk = Boolean(dryRunResult?.valid);
  const canSaveDraft = canSubmitWorkflowSave({
    saveRpcAvailable,
    saveLoading,
    dryRunOk,
    saveMode: "draft",
  });
  const canSaveActivate = canSubmitWorkflowSave({
    saveRpcAvailable,
    saveLoading,
    dryRunOk,
    saveMode: "activate",
  });

  const { data: requestType, isLoading: typeLoading, error: typeError } = useQuery({
    queryKey: ["admin-request-type", id],
    queryFn: () => typeFn({ data: { id } }),
  });

  const {
    data: config,
    isLoading: configLoading,
    error: configError,
    isError: configIsError,
  } = useQuery({
    queryKey: ["admin-request-workflow-config", id],
    queryFn: () => configFn({ data: { requestTypeId: id } }),
    retry: false,
  });

  const { data: processing, isLoading: processingLoading } = useQuery({
    queryKey: ["admin-request-processing-options"],
    queryFn: () => processingFn({ data: {} }),
    retry: false,
  });

  const editorWorkflow = useMemo(
    () => selectWorkflowForEditor(config?.workflows ?? [], selectedWorkflowId),
    [config, selectedWorkflowId],
  );

  const workflowState = useMemo(
    () => resolveWorkflowState(config?.workflows ?? []),
    [config],
  );

  useEffect(() => {
    if (initialized || !config) return;
    const selected = selectWorkflowForEditor(config.workflows, selectedWorkflowId);
    const wfId = selected?.id ?? null;
    if (wfId && selectedWorkflowId !== wfId) {
      setSelectedWorkflowId(wfId);
    }
    const mapped = mapWorkflowConfigToDraft(config, wfId);
    setDraftSteps(mapped.steps);
    setDraftTransitions(mapped.transitions);
    setInitialized(true);
  }, [config, selectedWorkflowId, initialized]);

  useEffect(() => {
    if (!initialized) return;
    setDryRunResult(null);
    setSaveSuccess(null);
  }, [draftSteps, draftTransitions, initialized]);

  const loading = typeLoading || configLoading || processingLoading;

  const statusBadgeClass =
    workflowState.variant === "active"
      ? "bg-emerald-600 text-white"
      : workflowState.variant === "draft"
        ? "bg-amber-500 text-white"
        : workflowState.variant === "retired"
          ? "bg-muted text-muted-foreground"
          : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200";

  const handleSave = async (saveMode: WorkflowSaveMode) => {
    if (
      !canSubmitWorkflowSave({
        saveRpcAvailable,
        saveLoading,
        dryRunOk,
        saveMode,
      })
    ) {
      return;
    }
    setSaveLoading(saveMode);
    setSaveError(null);
    setSaveSuccess(null);
    // Capture local draft so an RPC / refresh error never clears the editor.
    const stepsSnapshot = draftSteps;
    const transitionsSnapshot = draftTransitions;
    try {
      const result = await saveFn({
        data: {
          requestTypeId: id,
          saveMode,
          workflowNameAr:
            editorWorkflow?.name_ar ?? `دورة حياة — ${requestType!.name_ar}`,
          draftSteps: stepsSnapshot,
          draftTransitions: transitionsSnapshot,
        },
      });
      // Keep preferred id on the saved version even if refresh fails — never jump to active.
      setSelectedWorkflowId(result.workflowId);
      try {
        await queryClient.refetchQueries(
          {
            queryKey: ["admin-request-workflow-config", id],
            type: "active",
          },
          {
            throwOnError: true,
          },
        );

        const refreshedConfig = queryClient.getQueryData<AdminRequestWorkflowConfig>([
          "admin-request-workflow-config",
          id,
        ]);

        const remapDecision = decideWorkflowEditorRemap({
          refreshOk: true,
          config: refreshedConfig,
          savedWorkflowId: result.workflowId,
        });

        if (!remapDecision.canRemap || !hasWorkflowId(refreshedConfig, result.workflowId)) {
          throw new Error(WORKFLOW_SAVE_REFRESH_MISSING_MSG);
        }

        // Remap editor from the saved version only after refresh + id verification.
        setInitialized(false);
        setSaveSuccess(
          saveMode === "activate"
            ? "تم حفظ وتفعيل دورة الحياة بنجاح."
            : "تم حفظ المسودة بنجاح.",
        );
      } catch (refreshErr) {
        // Keep editor as-is: no remap, no draft clear, no auto-retry/save.
        setSaveSuccess(null);
        setSaveError(
          (refreshErr as Error).message || WORKFLOW_SAVE_REFRESH_FAILED_MSG,
        );
      }
      return result;
    } catch (e) {
      // Keep draftSteps / draftTransitions / selectedWorkflowId intact — no automatic retry.
      setSaveError((e as Error).message);
    } finally {
      setSaveLoading(null);
    }
  };

  const handleDryRun = async () => {
    setDryRunLoading(true);
    setDryRunError(null);
    setDryRunResult(null);
    try {
      const result = await dryRunFn({
        data: {
          requestTypeId: id,
          requestTypeCode: requestType!.code,
          source: "draft",
          draftSteps,
          draftTransitions,
        },
      });
      setDryRunResult(result);
    } catch (e) {
      setDryRunError((e as Error).message);
    } finally {
      setDryRunLoading(false);
    }
  };

  const handleDryRunFromPreview = async () => {
    setDryRunLoading(true);
    setDryRunError(null);
    setDryRunResult(null);
    try {
      const result = await dryRunFn({
        data: {
          requestTypeId: id,
          requestTypeCode: requestType!.code,
          source: "preview",
        },
      });
      setDryRunResult(result);
    } catch (e) {
      setDryRunError((e as Error).message);
    } finally {
      setDryRunLoading(false);
    }
  };

  const loadDraftFromCanonicalPreview = () => {
    if (!hasCanonicalWorkflowPreview(requestType.code)) return;
    const suggested = canonicalPreviewToSuggestedDraftSteps(requestType.code);
    const steps: DraftWorkflowStep[] = suggested.map((s) => ({
      localId: crypto.randomUUID(),
      step_key: s.step_key,
      step_name_ar: s.step_name_ar,
      step_order: s.step_order,
      processing_unit_id: null,
      processing_role_id: null,
      action_type: s.action_type as WorkflowActionType,
      visible_to_student: true,
      notify_on_enter: true,
      can_return_to_student: s.role_key === "student",
      can_reject: s.role_key !== "student",
      can_skip: false,
    }));

    const canonicalTransitions = getCanonicalDraftTransitionsForType(requestType.code);
    const transitions: DraftWorkflowTransition[] =
      canonicalTransitions.length > 0
        ? canonicalTransitions.map((t) => ({
            localId: crypto.randomUUID(),
            from_step_key: t.from_step_key,
            to_step_key: t.to_step_key,
            action_result: t.action_result,
            is_default: t.is_default,
          }))
        : steps.slice(0, -1).map((s, i) => ({
            localId: crypto.randomUUID(),
            from_step_key: s.step_key,
            to_step_key: steps[i + 1]?.step_key ?? null,
            action_result: "approve",
            is_default: true,
          }));

    setDraftSteps(steps);
    setDraftTransitions(transitions);
  };

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (typeError || !requestType) {
    return (
      <div className="p-4 text-sm text-destructive">
        {(typeError as Error)?.message ?? "تعذر تحميل نوع الطلب"}
      </div>
    );
  }

  const configUnavailable =
    configIsError &&
    (configError as Error)?.message?.includes(STUDENT_REQUEST_SERVICE_UPDATING_MSG.slice(0, 20));

  const editorStatusLabel = editorWorkflow
    ? WORKFLOW_STATUS_LABEL[editorWorkflow.status] ?? editorWorkflow.status
    : workflowState.label;

  return (
    <div dir="rtl" className="p-4 lg:p-8 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <Link
            to="/admin/request-types"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            <ArrowRight className="h-3.5 w-3.5" /> العودة إلى أنواع الطلبات
          </Link>
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-gold" />
            <h1 className="font-display text-xl font-extrabold text-primary">
              إعداد دورة الحياة
            </h1>
          </div>
          <p className="text-sm font-bold text-primary">{requestType.name_ar}</p>
          <p className="text-xs font-mono text-muted-foreground" dir="ltr">
            {requestType.code}
          </p>
        </div>
        <span className={`inline-flex px-3 py-1 rounded text-xs font-bold ${statusBadgeClass}`}>
          {editorWorkflow
            ? `${editorStatusLabel} (إصدار ${editorWorkflow.version})`
            : workflowState.label}
        </span>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-2 text-sm">
        <div className="font-bold text-primary">حالة دورة الحياة</div>
        <p className="text-muted-foreground">
          {editorWorkflow
            ? `${editorWorkflow.name_ar} (إصدار ${editorWorkflow.version} — ${editorStatusLabel})`
            : workflowState.detail}
        </p>
        {configUnavailable && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
            {WORKFLOW_SCHEMA_UNAVAILABLE_MSG} يمكنك استخدام المحرر والمعاينة المرجعية كمسودة
            محلية فقط.
          </p>
        )}
        {config && config.workflows.length > 0 && (
          <div className="text-xs text-muted-foreground pt-1">
            إصدارات مسجّلة: {config.workflows.length} — خطوات: {config.steps.length} — انتقالات:{" "}
            {config.transitions.length}
          </div>
        )}
      </div>

      <RequestWorkflowPreview
        requestTypeCode={requestType.code}
        draftSteps={draftSteps}
        draftTransitions={draftTransitions}
        schemaUnavailable={configUnavailable}
      />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-bold text-sm text-primary">محرر المسودة المحلية</h2>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
            مسودة محلية غير محفوظة — إعادة تحميل الصفحة تعيد المعاينة الأصلية.
          </p>
        </div>
        {hasCanonicalWorkflowPreview(requestType.code) && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={loadDraftFromCanonicalPreview}
          >
            <Sparkles className="h-3.5 w-3.5" />
            تحميل مسودة من المرجع (محلي)
          </Button>
        )}
      </div>

      <WorkflowStepsEditor
        steps={draftSteps}
        processing={
          processing ?? {
            schemaAvailable: false,
            units: [],
            roles: [],
            message: "يجب تطبيق مخطط وحدات المعالجة قبل تحميل الجهات والمسميات.",
          }
        }
        onChange={setDraftSteps}
      />

      <WorkflowTransitionsEditor
        steps={draftSteps}
        transitions={draftTransitions}
        onChange={setDraftTransitions}
      />

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="font-bold text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              التحقق من التكوين (dry-run)
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              تم التحقق من التكوين فقط. لم يتم حفظ أي تغييرات في قاعدة البيانات.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1"
              disabled={dryRunLoading}
              onClick={handleDryRun}
            >
              {dryRunLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              التحقق من التكوين
            </Button>
            {hasCanonicalWorkflowPreview(requestType.code) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={dryRunLoading}
                onClick={handleDryRunFromPreview}
              >
                <Sparkles className="h-3.5 w-3.5" />
                التحقق من المرجع المعياري
              </Button>
            )}
          </div>
        </div>

        {dryRunError && (
          <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{dryRunError}</p>
        )}

        {dryRunResult && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-bold">الحالة:</span>
              <span
                className={
                  dryRunResult.status === "VALID"
                    ? "text-emerald-700"
                    : dryRunResult.status === "VALID_WITH_WARNINGS"
                      ? "text-amber-700"
                      : dryRunResult.status === "SAVE_UNAVAILABLE"
                        ? "text-blue-700"
                        : "text-destructive"
                }
              >
                {dryRunResult.status}
              </span>
              <span className="text-muted-foreground">— {dryRunResult.summaryAr}</span>
            </div>
            <p className="text-xs text-muted-foreground">{dryRunResult.capability.messageAr}</p>
            {dryRunResult.issues.length > 0 && (
              <ul className="text-xs space-y-1 max-h-48 overflow-y-auto">
                {dryRunResult.issues.map((issue, idx) => (
                  <li
                    key={`${issue.code}-${idx}`}
                    className={
                      issue.severity === "error"
                        ? "text-destructive"
                        : issue.severity === "warning"
                          ? "text-amber-800 dark:text-amber-200"
                          : "text-muted-foreground"
                    }
                  >
                    {issue.severity === "error" ? "✕" : issue.severity === "warning" ? "!" : "·"}{" "}
                    {issue.stepKey ? `«${issue.stepKey}» — ` : ""}
                    {issue.messageAr}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="font-bold text-sm">حفظ إعدادات دورة الحياة</p>
            <p className="text-xs text-muted-foreground mt-1">
              {saveRpcAvailable
                ? "الحفظ ينشئ إصداراً جديداً دون تعديل خطوات الإصدارات السابقة. التفعيل يتطلب نجاح التحقق أولاً."
                : WORKFLOW_SAVE_NOT_AVAILABLE_MSG}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!canSaveDraft}
              onClick={() => handleSave("draft")}
              className="gap-1"
            >
              {saveLoading === "draft" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              حفظ كمسودة
            </Button>
            <Button
              type="button"
              disabled={!canSaveActivate}
              onClick={() => handleSave("activate")}
              className="gap-1"
            >
              {saveLoading === "activate" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              حفظ وتفعيل
            </Button>
          </div>
        </div>
        {!saveRpcAvailable && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
            أزرار الحفظ معطّلة في هذا الإصدار حتى تفعيل خدمة الحفظ.
          </p>
        )}
        {saveRpcAvailable && !dryRunOk && (
          <p className="text-xs text-muted-foreground">
            «حفظ كمسودة» متاح دون Dry Run. «حفظ وتفعيل» يتطلب نجاح التحقق بدون أخطاء. المسودة لا
            تُفعَّل تلقائيًا.
          </p>
        )}
        {saveError && (
          <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{saveError}</p>
        )}
        {saveSuccess && (
          <p className="text-xs text-emerald-800 bg-emerald-50 rounded p-2">{saveSuccess}</p>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap border-t pt-2">
          <p className="text-xs text-muted-foreground">{WORKFLOW_SCHEMA_UNAVAILABLE_MSG}</p>
        </div>
      </div>
    </div>
  );
}
