import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adminListFollowupTypesFn,
  adminListFollowupWorkflowsFn,
  adminPublishWorkflowFn,
  adminSaveFollowupTypeFn,
  adminSaveWorkflowDraftFn,
} from "@/lib/graduates-affairs/graduates-affairs.functions";
import type { GraduateFollowupType } from "@/lib/graduates-affairs/followup-workflows";
import {
  GA_FOLLOWUP_STATE_LABELS_AR,
  GA_WORKFLOW_DEFAULT_STATES,
  GA_WORKFLOW_DEFAULT_TRANSITIONS,
  GA_WORKFLOW_EMPTY_DRAFT,
  GA_WORKFLOW_STATUS_LABELS_AR,
  validateDraftWorkflow,
  validateWorkflowForPublish,
  workflowStatesAsStrings,
  type GraduateFollowupWorkflow,
  type GraduateFollowupWorkflowDraft,
} from "@/lib/graduates-affairs/followup-workflows";

interface RawTypeRow {
  id: string;
  code: string;
  label_ar: string;
  description_ar: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  current_workflow_id: string | null;
  current_workflow_version: number | null;
  current_workflow_status: string | null;
}

interface RawWorkflowRow {
  id: string;
  followup_type_id: string;
  type_code: string;
  type_label_ar: string;
  version: number;
  status: string;
  states: string[] | Array<{ value: string; label?: string }>;
  transitions: Array<{ from: string; to: string }>;
  initial_state: string;
  terminal_states: string[];
  require_outcome_on_complete: boolean;
  max_active_per_graduate: number;
  notes: string | null;
  published_at: string | null;
  superseded_at: string | null;
  is_current: boolean;
  created_at: string;
}

export function GraduateFollowupWorkflowPanel() {
  const queryClient = useQueryClient();
  const listTypes = useServerFn(adminListFollowupTypesFn);
  const saveType = useServerFn(adminSaveFollowupTypeFn);
  const listWorkflows = useServerFn(adminListFollowupWorkflowsFn);
  const saveDraft = useServerFn(adminSaveWorkflowDraftFn);
  const publishWorkflow = useServerFn(adminPublishWorkflowFn);

  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [typeForm, setTypeForm] = useState<{ id: string | null; code: string; labelAr: string; descriptionAr: string; isActive: boolean }>({
    id: null,
    code: "",
    labelAr: "",
    descriptionAr: "",
    isActive: true,
  });
  const [typeBusy, setTypeBusy] = useState(false);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [draft, setDraft] = useState<GraduateFollowupWorkflowDraft>({ ...GA_WORKFLOW_EMPTY_DRAFT });
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftSavedId, setDraftSavedId] = useState<string | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const typesQuery = useQuery({
    queryKey: ["ga-admin", "followup-types"],
    queryFn: () => listTypes({ data: undefined }),
  });
  const types: GraduateFollowupType[] = useMemo(() => {
    const rows = Array.isArray(typesQuery.data) ? (typesQuery.data as RawTypeRow[]) : [];
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      label_ar: r.label_ar,
      description_ar: r.description_ar,
      is_active: r.is_active,
      created_at: r.created_at,
      updated_at: r.updated_at,
      current_workflow_id: r.current_workflow_id,
      current_workflow_version: r.current_workflow_version,
      current_workflow_status: r.current_workflow_status,
    }));
  }, [typesQuery.data]);

  const workflowsQuery = useQuery({
    queryKey: ["ga-admin", "followup-workflows", selectedTypeId],
    queryFn: () => listWorkflows({ data: { followupTypeId: selectedTypeId } }),
    enabled: Boolean(selectedTypeId),
  });
  const workflows: GraduateFollowupWorkflow[] = useMemo(() => {
    const rows = Array.isArray(workflowsQuery.data) ? (workflowsQuery.data as RawWorkflowRow[]) : [];
    return rows.map((r) => ({
      id: r.id,
      followup_type_id: r.followup_type_id,
      type_code: r.type_code,
      type_label_ar: r.type_label_ar,
      version: r.version,
      status: r.status as GraduateFollowupWorkflow["status"],
      states: r.states,
      transitions: r.transitions,
      initial_state: r.initial_state,
      terminal_states: Array.isArray(r.terminal_states) ? r.terminal_states : [],
      require_outcome_on_complete: r.require_outcome_on_complete,
      max_active_per_graduate: r.max_active_per_graduate,
      notes: r.notes,
      published_at: r.published_at,
      superseded_at: r.superseded_at,
      is_current: r.is_current,
      created_at: r.created_at,
    }));
  }, [workflowsQuery.data]);

  // When a type is selected, reset the draft and type form
  useEffect(() => {
    if (!selectedTypeId) return;
    const t = types.find((x) => x.id === selectedTypeId);
    if (!t) return;
    setTypeForm({ id: t.id, code: t.code, labelAr: t.label_ar, descriptionAr: t.description_ar ?? "", isActive: t.is_active });
    // Start a fresh draft for a new version
    setDraft({ ...GA_WORKFLOW_EMPTY_DRAFT, followup_type_id: t.id });
    setDraftSavedId(null);
    setDraftError(null);
    setPublishError(null);
  }, [selectedTypeId, types]);

  const handleSaveType = async () => {
    setTypeBusy(true);
    setTypeError(null);
    try {
      await saveType({
        data: {
          id: typeForm.id,
          code: typeForm.code.trim(),
          labelAr: typeForm.labelAr.trim(),
          descriptionAr: typeForm.descriptionAr.trim() || null,
          isActive: typeForm.isActive,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["ga-admin", "followup-types"] });
    } catch (err) {
      setTypeError(err instanceof Error ? err.message : "تعذّر حفظ نوع المتابعة.");
    } finally {
      setTypeBusy(false);
    }
  };

  const handleSaveDraft = async () => {
    const errors = validateDraftWorkflow(draft);
    if (errors.length > 0) {
      setDraftError(errors[0]);
      return;
    }
    setDraftBusy(true);
    setDraftError(null);
    try {
      const id = await saveDraft({
        data: {
          id: draft.id ?? null,
          followupTypeId: draft.followup_type_id,
          states: draft.states,
          transitions: draft.transitions,
          initialState: draft.initial_state,
          terminalStates: draft.terminal_states,
          requireOutcomeOnComplete: draft.require_outcome_on_complete,
          maxActivePerGraduate: draft.max_active_per_graduate,
          notes: draft.notes,
        },
      });
      setDraftSavedId(id as string);
      setDraft((d) => ({ ...d, id: id as string }));
      await queryClient.invalidateQueries({ queryKey: ["ga-admin", "followup-workflows", selectedTypeId] });
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "تعذّر حفظ المسودة.");
    } finally {
      setDraftBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!draft.id) {
      setPublishError("احفظ المسودة أولًا قبل النشر.");
      return;
    }
    const errors = validateWorkflowForPublish(draft);
    if (errors.length > 0) {
      setPublishError(errors[0]);
      return;
    }
    setPublishBusy(true);
    setPublishError(null);
    try {
      await publishWorkflow({ data: { workflowId: draft.id } });
      await queryClient.invalidateQueries({ queryKey: ["ga-admin", "followup-workflows", selectedTypeId] });
      await queryClient.invalidateQueries({ queryKey: ["ga-admin", "followup-types"] });
      setDraft((d) => ({ ...d, id: null }));
      setDraftSavedId(null);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "تعذّر نشر إصدار سير العمل.");
    } finally {
      setPublishBusy(false);
    }
  };

  const loadDraftFromWorkflow = (w: GraduateFollowupWorkflow) => {
    const states = workflowStatesAsStrings(w.states);
    setDraft({
      id: w.status === "draft" ? w.id : null,
      followup_type_id: w.followup_type_id,
      states,
      transitions: w.transitions,
      initial_state: w.initial_state,
      terminal_states: w.terminal_states,
      require_outcome_on_complete: w.require_outcome_on_complete,
      max_active_per_graduate: w.max_active_per_graduate,
      notes: w.notes,
    });
    setDraftSavedId(w.status === "draft" ? w.id : null);
    setDraftError(null);
    setPublishError(null);
  };

  return (
    <div className="space-y-6">
      {/* GA-1: Type Catalog */}
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-primary">فهرس أنواع المتابعة</h2>
            <p className="text-sm text-muted-foreground">إنشاء وتفعيل أنواع المتابعة المتاحة للإنشاء.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={typesQuery.isLoading}
            onClick={() => queryClient.invalidateQueries({ queryKey: ["ga-admin", "followup-types"] })}
          >
            <RefreshCw className="h-4 w-4" /> تحديث
          </Button>
        </div>
        {typeError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
            {typeError}
          </div>
        )}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-right text-muted-foreground">
                <th className="py-2 px-3">الرمز</th>
                <th className="py-2 px-3">الاسم</th>
                <th className="py-2 px-3">الإصدار الحالي</th>
                <th className="py-2 px-3">الحالة</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id} className="border-b hover:bg-muted/30">
                  <td className="py-2 px-3 font-mono text-xs" dir="ltr">{t.code}</td>
                  <td className="py-2 px-3">{t.label_ar}</td>
                  <td className="py-2 px-3">
                    {t.current_workflow_version ? `V${t.current_workflow_version}` : "—"}
                  </td>
                  <td className="py-2 px-3">
                    {t.is_active ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">نشط</span>
                    ) : (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">معطل</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedTypeId(t.id)}>
                      إدارة
                    </Button>
                  </td>
                </tr>
              ))}
              {types.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">لا توجد أنواع بعد.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Create new type */}
        <div className="mt-4 rounded-lg border p-3">
          <h3 className="text-sm font-bold">نوع متابعة جديد</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input placeholder="الرمز (بالإنجليزية)" value={typeForm.code} onChange={(e) => setTypeForm((f) => ({ ...f, code: e.target.value }))} />
            <Input placeholder="الاسم بالعربية" value={typeForm.labelAr} onChange={(e) => setTypeForm((f) => ({ ...f, labelAr: e.target.value }))} />
            <Input placeholder="الوصف (اختياري)" value={typeForm.descriptionAr} onChange={(e) => setTypeForm((f) => ({ ...f, descriptionAr: e.target.value }))} />
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={typeForm.isActive} onChange={(e) => setTypeForm((f) => ({ ...f, isActive: e.target.checked }))} />
                نشط
              </label>
              <Button type="button" size="sm" disabled={typeBusy || !typeForm.code.trim() || !typeForm.labelAr.trim()} onClick={handleSaveType}>
                {typeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                حفظ
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* GA-2/3: Workflow Versions & Draft Editor */}
      {selectedTypeId && (
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="text-lg font-bold text-primary">إصدارات سير العمل</h2>
          <p className="text-sm text-muted-foreground">
            النوع: {types.find((t) => t.id === selectedTypeId)?.label_ar ?? ""}
          </p>

          {/* Version history */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-right text-muted-foreground">
                  <th className="py-2 px-3">الإصدار</th>
                  <th className="py-2 px-3">الحالة</th>
                  <th className="py-2 px-3">الحالة الابتدائية</th>
                  <th className="py-2 px-3">تاريخ النشر</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((w) => (
                  <tr key={w.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-3 font-bold">V{w.version}</td>
                    <td className="py-2 px-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${w.is_current ? "bg-emerald-100 text-emerald-900" : w.status === "superseded" ? "bg-gray-200 text-gray-700" : "bg-amber-100 text-amber-900"}`}>
                        {GA_WORKFLOW_STATUS_LABELS_AR[w.status]}
                        {w.is_current ? " (حالي)" : ""}
                      </span>
                    </td>
                    <td className="py-2 px-3">{GA_FOLLOWUP_STATE_LABELS_AR[w.initial_state] ?? w.initial_state}</td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">
                      {w.published_at ? new Date(w.published_at).toLocaleDateString("ar-SA") : "—"}
                    </td>
                    <td className="py-2 px-3">
                      <Button type="button" variant="ghost" size="sm" onClick={() => loadDraftFromWorkflow(w)}>
                        عرض
                      </Button>
                    </td>
                  </tr>
                ))}
                {workflows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">لا توجد إصدارات.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Draft editor */}
          <div className="mt-5 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">
                محرر المسودة
                {draftSavedId && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" /> تم الحفظ
                  </span>
                )}
              </h3>
            </div>

            {/* States editor */}
            <div className="mt-3 space-y-3">
              <div>
                <label className="text-sm font-bold">الحالات (state codes)</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {draft.states.map((s, i) => (
                    <div key={i} className="flex items-center gap-1 rounded-md border px-2 py-1">
                      <input
                        className="bg-transparent text-sm outline-none"
                        value={s}
                        onChange={(e) => {
                          const next = [...draft.states];
                          next[i] = e.target.value;
                          setDraft((d) => ({ ...d, states: next }));
                        }}
                      />
                      <button
                        type="button"
                        className="text-xs text-red-500 hover:text-red-700"
                        onClick={() => setDraft((d) => ({ ...d, states: d.states.filter((_, j) => j !== i) }))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="rounded-md border border-dashed px-2 py-1 text-sm text-muted-foreground hover:bg-muted/30"
                    onClick={() => setDraft((d) => ({ ...d, states: [...d.states, ""] }))}
                  >
                    + إضافة حالة
                  </button>
                </div>
              </div>

              {/* Initial state */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-bold">الحالة الابتدائية:</label>
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={draft.initial_state}
                  onChange={(e) => setDraft((d) => ({ ...d, initial_state: e.target.value }))}
                >
                  {draft.states.map((s) => (
                    <option key={s} value={s}>{GA_FOLLOWUP_STATE_LABELS_AR[s] ?? s}</option>
                  ))}
                </select>
              </div>

              {/* Transitions */}
              <div>
                <label className="text-sm font-bold">الانتقالات</label>
                <div className="mt-1 space-y-1">
                  {draft.transitions.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <select
                        className="h-8 rounded-md border bg-background px-2"
                        value={t.from}
                        onChange={(e) => {
                          const next = [...draft.transitions];
                          next[i] = { ...next[i], from: e.target.value };
                          setDraft((d) => ({ ...d, transitions: next }));
                        }}
                      >
                        {draft.states.map((s) => (
                          <option key={s} value={s}>{GA_FOLLOWUP_STATE_LABELS_AR[s] ?? s}</option>
                        ))}
                      </select>
                      <span className="text-muted-foreground">→</span>
                      <select
                        className="h-8 rounded-md border bg-background px-2"
                        value={t.to}
                        onChange={(e) => {
                          const next = [...draft.transitions];
                          next[i] = { ...next[i], to: e.target.value };
                          setDraft((d) => ({ ...d, transitions: next }));
                        }}
                      >
                        {draft.states.map((s) => (
                          <option key={s} value={s}>{GA_FOLLOWUP_STATE_LABELS_AR[s] ?? s}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="text-xs text-red-500 hover:text-red-700"
                        onClick={() => setDraft((d) => ({ ...d, transitions: d.transitions.filter((_, j) => j !== i) }))}
                      >
                        إزالة
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="rounded-md border border-dashed px-2 py-1 text-sm text-muted-foreground hover:bg-muted/30"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        transitions: [...d.transitions, { from: draft.states[0] ?? "", to: draft.states[0] ?? "" }],
                      }))
                    }
                  >
                    + إضافة انتقال
                  </button>
                </div>
              </div>

              {/* Terminal states */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-bold">الحالات النهائية:</label>
                <Input
                  className="h-9 max-w-xs"
                  value={draft.terminal_states.join(", ")}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      terminal_states: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    }))
                  }
                />
              </div>

              {/* Options */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.require_outcome_on_complete}
                    onChange={(e) => setDraft((d) => ({ ...d, require_outcome_on_complete: e.target.checked }))}
                  />
                  طلب نتيجة عند الإكمال
                </label>
                <div className="flex items-center gap-2 text-sm">
                  <label>الحد الأعلى للمتابعات النشطة:</label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9 w-20"
                    value={draft.max_active_per_graduate}
                    onChange={(e) => setDraft((d) => ({ ...d, max_active_per_graduate: Number(e.target.value) || 1 }))}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-bold">ملاحظات</label>
                <Input
                  className="mt-1"
                  value={draft.notes ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value || null }))}
                  placeholder="ملاحظات الإصدار…"
                />
              </div>

              {(draftError || publishError) && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
                  {draftError ?? publishError}
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" disabled={draftBusy} onClick={handleSaveDraft}>
                  {draftBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  حفظ المسودة
                </Button>
                <Button type="button" variant="default" disabled={publishBusy || !draft.id} onClick={handlePublish}>
                  {publishBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  نشر الإصدار
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setDraft({ ...GA_WORKFLOW_EMPTY_DRAFT, followup_type_id: selectedTypeId });
                    setDraftSavedId(null);
                    setDraftError(null);
                    setPublishError(null);
                  }}
                >
                  مسح
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
