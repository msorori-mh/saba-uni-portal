import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, GitBranch, Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAdminRequestWorkflowConfig,
  getRequestTypeForWorkflow,
  listRequestProcessingOptions,
  saveAdminRequestWorkflowConfig,
} from "@/lib/admin-request-workflow.functions";
import {
  ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE,
  type DraftWorkflowStep,
  type DraftWorkflowTransition,
  type WorkflowActionType,
  type WorkflowConfigStep,
  type WorkflowConfigTransition,
  type WorkflowConfigWorkflow,
} from "@/lib/admin-request-workflow-rpc";
import { WORKFLOW_STATUS_LABEL } from "@/components/admin/request-workflow/constants";
import { WorkflowStepsEditor } from "@/components/admin/request-workflow/WorkflowStepsEditor";
import { WorkflowTransitionsEditor } from "@/components/admin/request-workflow/WorkflowTransitionsEditor";
import { RequestWorkflowPreview } from "@/components/admin/RequestWorkflowPreview";
import {
  canonicalPreviewToSuggestedDraftSteps,
  hasCanonicalWorkflowPreview,
  WORKFLOW_SCHEMA_UNAVAILABLE_MSG,
} from "@/lib/student-requests/request-workflow-preview-registry";
import { STUDENT_REQUEST_SERVICE_UPDATING_MSG } from "@/lib/student-request-rpc";

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

function configToDraftSteps(
  steps: WorkflowConfigStep[],
  workflowId: string | null,
): DraftWorkflowStep[] {
  const filtered = workflowId
    ? steps.filter((s) => s.workflow_id === workflowId)
    : steps;
  return filtered.map((s) => ({
    localId: s.id,
    step_key: s.step_key,
    step_name_ar: s.step_name_ar,
    step_order: s.step_order,
    processing_unit_id: s.processing_unit_id,
    processing_role_id: s.processing_role_id,
    action_type: s.action_type,
    visible_to_student: s.visible_to_student,
    notify_on_enter: s.notify_on_enter,
    can_return_to_student: s.can_return_to_student,
    can_reject: s.can_reject,
    can_skip: s.can_skip,
  }));
}

function configToDraftTransitions(
  transitions: WorkflowConfigTransition[],
  steps: WorkflowConfigStep[],
  workflowId: string | null,
): DraftWorkflowTransition[] {
  const stepIdToKey = new Map(steps.map((s) => [s.id, s.step_key]));
  const filtered = workflowId
    ? transitions.filter((t) => t.workflow_id === workflowId)
    : transitions;
  return filtered.map((t) => ({
    localId: t.id,
    from_step_key: t.from_step_id ? stepIdToKey.get(t.from_step_id) ?? null : null,
    to_step_key: t.to_step_id ? stepIdToKey.get(t.to_step_id) ?? null : null,
    action_result: t.action_result,
    is_default: t.is_default,
  }));
}

function AdminRequestTypeWorkflowPage() {
  const { id } = Route.useParams();
  const typeFn = useServerFn(getRequestTypeForWorkflow);
  const configFn = useServerFn(getAdminRequestWorkflowConfig);
  const processingFn = useServerFn(listRequestProcessingOptions);
  const saveFn = useServerFn(saveAdminRequestWorkflowConfig);

  const [draftSteps, setDraftSteps] = useState<DraftWorkflowStep[]>([]);
  const [draftTransitions, setDraftTransitions] = useState<DraftWorkflowTransition[]>([]);
  const [initialized, setInitialized] = useState(false);

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

  const primaryWorkflow = useMemo(() => {
    if (!config?.workflows?.length) return null;
    return (
      config.workflows.find((w) => w.is_active && w.status === "active") ??
      config.workflows.find((w) => w.status === "draft") ??
      config.workflows[0]
    );
  }, [config]);

  const workflowState = useMemo(
    () => resolveWorkflowState(config?.workflows ?? []),
    [config],
  );

  useEffect(() => {
    if (initialized || !config) return;
    const wfId = primaryWorkflow?.id ?? null;
    setDraftSteps(configToDraftSteps(config.steps, wfId));
    setDraftTransitions(configToDraftTransitions(config.transitions, config.steps, wfId));
    setInitialized(true);
  }, [config, primaryWorkflow, initialized]);

  const loading = typeLoading || configLoading || processingLoading;

  const statusBadgeClass =
    workflowState.variant === "active"
      ? "bg-emerald-600 text-white"
      : workflowState.variant === "draft"
        ? "bg-amber-500 text-white"
        : workflowState.variant === "retired"
          ? "bg-muted text-muted-foreground"
          : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200";

  const handleSave = async () => {
    if (!ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE) return;
    await saveFn({
      data: {
        requestTypeId: id,
        workflow: {},
        steps: draftSteps,
        transitions: draftTransitions,
      },
    });
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
    const transitions: DraftWorkflowTransition[] = steps.slice(0, -1).map((s, i) => ({
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
          {workflowState.label}
        </span>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-2 text-sm">
        <div className="font-bold text-primary">حالة دورة الحياة</div>
        <p className="text-muted-foreground">{workflowState.detail}</p>
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
        schemaUnavailable={configUnavailable || !ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE}
      />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-bold text-sm text-primary">محرر المسودة المحلية</h2>
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

      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="font-bold text-sm">حفظ إعدادات دورة الحياة</p>
            <p className="text-xs text-muted-foreground mt-1">
              الحفظ غير مفعل حالياً — لا يتم كتابة أي بيانات إلى قاعدة البيانات من هذه الواجهة.
            </p>
          </div>
          <Button
            type="button"
            disabled={!ADMIN_SAVE_WORKFLOW_RPC_AVAILABLE}
            onClick={handleSave}
            className="gap-1"
          >
            <Save className="h-4 w-4" />
            حفظ دورة الحياة
          </Button>
        </div>
        <p className="text-xs text-muted-foreground border-t pt-2">
          {WORKFLOW_SCHEMA_UNAVAILABLE_MSG}
        </p>
      </div>
    </div>
  );
}
