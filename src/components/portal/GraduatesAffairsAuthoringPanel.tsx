import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  closeGaSurveyFn,
  listGaAcademicScopeFn,
  listGaCommunicationsFn,
  listGaEmployersFn,
  listGaEventsFn,
  listGaOpportunitiesFn,
  listGaSurveysFn,
  logGaCommunicationFn,
  moderateGaOpportunityFn,
  publishGaSurveyVersionFn,
  saveGaEventFn,
  saveGaOpportunityFn,
  saveGaSurveyFn,
  saveGaSurveyVersionDraftFn,
  setGaEmployerVerificationFn,
  transitionGaEventFn,
} from "@/lib/graduates-affairs/ga-authoring.functions";
import {
  getStaffGraduateFileFn,
  searchGraduateRecordsFn,
} from "@/lib/graduates-affairs/graduates-affairs.functions";

const STATE_LABELS: Record<string, string> = {
  draft: "مسودة",
  in_review: "قيد المراجعة",
  published: "منشور",
  closed: "مغلق",
  archived: "مؤرشف",
  completed: "منتهية",
  cancelled: "ملغاة",
  active: "نشط",
  unverified: "غير موثقة",
  verified: "موثقة",
  rejected: "مرفوضة",
};

function label(value: string) {
  return STATE_LABELS[value] ?? value;
}

function errorText(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes("SCOPE_REQUIRED")) return "يجب تحديد نطاق القسم قبل التنفيذ.";
  if (raw.includes("SCOPE_DENIED")) return "النطاق المحدد خارج أقسام تكليفك.";
  if (raw.includes("SCOPE_INVALID")) return "النطاق المحدد غير صالح.";
  if (raw.includes("ACCESS_DENIED")) return "لا تملك صلاحية تنفيذ هذه العملية.";
  if (raw.includes("NOT_EDITABLE")) return "لا يمكن التعديل في الحالة الحالية.";
  if (raw.includes("INVALID_TRANSITION")) return "الانتقال غير مسموح من الحالة الحالية.";
  if (raw.includes("CONSENT_MISSING")) return "لا توجد موافقة فعالة لهذا الغرض.";
  if (raw.includes("CONTACT_REVOKED")) return "نقطة الاتصال ملغاة.";
  if (raw.includes("CHANNEL_MISMATCH")) return "القناة لا تطابق نقطة الاتصال.";
  if (raw.includes("IMMUTABLE") || raw.includes("ALREADY_PUBLISHED"))
    return "النسخة منشورة ولا يمكن تعديلها.";
  return raw;
}

function useOp(invalidateKey: string) {
  const queryClient = useQueryClient();
  return {
    onSuccess: () => {
      toast.success("تم تنفيذ العملية");
      void queryClient.invalidateQueries({ queryKey: [invalidateKey] });
    },
    onError: (error: unknown) => toast.error(errorText(error)),
  };
}

/* ---------------------------- scope selector ---------------------------- */

type AudienceScope = Record<string, unknown>;

function useAcademicScope() {
  const list = useServerFn(listGaAcademicScopeFn);
  return useQuery({
    queryKey: ["ga-academic-scope"],
    queryFn: () => list({ data: {} }),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Audience/scope selector. The selection is advisory UI only: the backend
 * re-derives the scope and denies any department outside a specialist's
 * assignment, so hiding options here is never the authorization boundary.
 */
function ScopeSelector(props: {
  collegeWide: boolean;
  departmentIds: string[];
  programIds: string[];
  onChange: (next: { collegeWide: boolean; departmentIds: string[]; programIds: string[] }) => void;
}) {
  const scopeQuery = useAcademicScope();
  const departments = scopeQuery.data?.departments ?? [];
  const programs = (scopeQuery.data?.programs ?? []).filter(
    (program) =>
      props.departmentIds.length === 0 ||
      (program.departmentId !== null && props.departmentIds.includes(program.departmentId)),
  );

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">نطاق الجمهور</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={props.collegeWide ? "default" : "outline"}
          onClick={() =>
            props.onChange({ collegeWide: true, departmentIds: [], programIds: [] })
          }
        >
          على مستوى الكلية
        </Button>
        <Button
          type="button"
          size="sm"
          variant={!props.collegeWide ? "default" : "outline"}
          onClick={() =>
            props.onChange({
              collegeWide: false,
              departmentIds: props.departmentIds,
              programIds: props.programIds,
            })
          }
        >
          أقسام محددة
        </Button>
      </div>
      {!props.collegeWide ? (
        <div className="space-y-2">
          {scopeQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          <div className="flex flex-wrap gap-2">
            {departments.map((department) => (
              <Button
                key={department.id}
                type="button"
                size="sm"
                variant={props.departmentIds.includes(department.id) ? "default" : "outline"}
                onClick={() => {
                  const nextDepartments = toggle(props.departmentIds, department.id);
                  props.onChange({
                    collegeWide: false,
                    departmentIds: nextDepartments,
                    programIds: props.programIds.filter((programId) => {
                      const program = (scopeQuery.data?.programs ?? []).find(
                        (item) => item.id === programId,
                      );
                      return (
                        program?.departmentId !== undefined &&
                        program?.departmentId !== null &&
                        nextDepartments.includes(program.departmentId)
                      );
                    }),
                  });
                }}
              >
                {department.name}
              </Button>
            ))}
          </div>
          {props.departmentIds.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {programs.map((program) => (
                <Button
                  key={program.id}
                  type="button"
                  size="sm"
                  variant={props.programIds.includes(program.id) ? "secondary" : "outline"}
                  onClick={() =>
                    props.onChange({
                      collegeWide: false,
                      departmentIds: props.departmentIds,
                      programIds: toggle(props.programIds, program.id),
                    })
                  }
                >
                  {program.name}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function useScopeState() {
  const [collegeWide, setCollegeWide] = useState(false);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [programIds, setProgramIds] = useState<string[]>([]);
  const scope: AudienceScope = collegeWide
    ? { all_graduates: true }
    : { department_ids: departmentIds, program_ids: programIds };
  const valid = collegeWide || departmentIds.length > 0;
  return {
    collegeWide,
    departmentIds,
    programIds,
    scope,
    valid,
    onChange: (next: { collegeWide: boolean; departmentIds: string[]; programIds: string[] }) => {
      setCollegeWide(next.collegeWide);
      setDepartmentIds(next.departmentIds);
      setProgramIds(next.programIds);
    },
    reset: () => {
      setCollegeWide(false);
      setDepartmentIds([]);
      setProgramIds([]);
    },
  };
}

function ScopeSummary(props: { scope: Record<string, unknown> | null }) {
  const scopeQuery = useAcademicScope();
  const scope = props.scope ?? {};
  if (scope["all_graduates"] === true) {
    return <span className="text-xs text-muted-foreground">نطاق: كل الخريجين</span>;
  }
  const departmentIds = Array.isArray(scope["department_ids"])
    ? (scope["department_ids"] as unknown[]).map(String)
    : [];
  if (departmentIds.length === 0) {
    return <span className="text-xs text-muted-foreground">نطاق: غير محدد</span>;
  }
  const names = departmentIds.map(
    (id) => scopeQuery.data?.departments.find((department) => department.id === id)?.name ?? "قسم",
  );
  return <span className="text-xs text-muted-foreground">نطاق: {names.join("، ")}</span>;
}

/* -------------------------- opportunities -------------------------- */

function OpportunitiesTab() {
  const list = useServerFn(listGaOpportunitiesFn);
  const save = useServerFn(saveGaOpportunityFn);
  const moderate = useServerFn(moderateGaOpportunityFn);
  const employers = useServerFn(listGaEmployersFn);
  const query = useQuery({ queryKey: ["ga-opportunities"], queryFn: () => list({ data: {} }) });
  const employersQuery = useQuery({ queryKey: ["ga-employers"], queryFn: () => employers({ data: {} }) });
  const handlers = useOp("ga-opportunities");
  const saveMutation = useMutation({
    mutationFn: (input: Parameters<typeof save>[0]["data"]) => save({ data: input }),
    ...handlers,
  });
  const moderateMutation = useMutation({
    mutationFn: (input: { opportunityId: string; targetState: string }) =>
      moderate({ data: input as never }),
    ...handlers,
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"job" | "internship" | "training">("job");
  const [employerId, setEmployerId] = useState<string>("");
  const [closesAt, setClosesAt] = useState("");
  const scopeState = useScopeState();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">إضافة فرصة جديدة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="عنوان الفرصة" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea
            placeholder="وصف الفرصة"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {(["job", "internship", "training"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant={type === value ? "default" : "outline"}
                size="sm"
                onClick={() => setType(value)}
              >
                {value === "job" ? "وظيفة" : value === "internship" ? "تدريب تعاوني" : "تدريب"}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              جهة العمل
              <select
                className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
                value={employerId}
                onChange={(e) => setEmployerId(e.target.value)}
              >
                <option value="">بدون جهة عمل</option>
                {(employersQuery.data ?? []).map((employer) => (
                  <option key={employer.id} value={employer.id}>
                    {employer.legal_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              تاريخ الإغلاق
              <Input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </label>
          </div>
          <ScopeSelector
            collegeWide={scopeState.collegeWide}
            departmentIds={scopeState.departmentIds}
            programIds={scopeState.programIds}
            onChange={scopeState.onChange}
          />
          <Button
            size="sm"
            disabled={
              saveMutation.isPending || !title.trim() || !description.trim() || !scopeState.valid
            }
            onClick={() =>
              saveMutation.mutate(
                {
                  id: null,
                  opportunityType: type,
                  title: title.trim(),
                  description: description.trim(),
                  employerId: employerId || null,
                  closesAt: closesAt ? new Date(closesAt).toISOString() : null,
                  audienceScope: scopeState.scope,
                },
                {
                  onSuccess: () => {
                    setTitle("");
                    setDescription("");
                    setClosesAt("");
                    setEmployerId("");
                    scopeState.reset();
                  },
                },
              )
            }
          >
            <Plus className="ms-1 h-4 w-4" /> حفظ كمسودة
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {query.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {(query.data ?? []).map((row) => (
          <Card key={row.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <div className="font-semibold">{row.title}</div>
                <div className="text-xs text-muted-foreground">{row.description}</div>
                <ScopeSummary scope={row.audience_scope} />
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{label(row.state)}</Badge>
                {row.state === "draft" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      moderateMutation.mutate({ opportunityId: row.id, targetState: "in_review" })
                    }
                  >
                    إرسال للمراجعة
                  </Button>
                ) : null}
                {row.state === "in_review" ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      moderateMutation.mutate({ opportunityId: row.id, targetState: "published" })
                    }
                  >
                    نشر
                  </Button>
                ) : null}
                {row.state === "published" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => moderateMutation.mutate({ opportunityId: row.id, targetState: "closed" })}
                  >
                    إغلاق
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- events ----------------------------- */

const EVENT_TYPES = [
  { value: "career", labelAr: "مهنية" },
  { value: "training", labelAr: "تدريبية" },
  { value: "networking", labelAr: "تشبيك" },
  { value: "survey", labelAr: "استبيان" },
  { value: "quality", labelAr: "جودة" },
] as const;

function EventsTab() {
  const list = useServerFn(listGaEventsFn);
  const save = useServerFn(saveGaEventFn);
  const transition = useServerFn(transitionGaEventFn);
  const query = useQuery({ queryKey: ["ga-events"], queryFn: () => list({ data: {} }) });
  const handlers = useOp("ga-events");
  const saveMutation = useMutation({
    mutationFn: (input: Parameters<typeof save>[0]["data"]) => save({ data: input }),
    ...handlers,
  });
  const transitionMutation = useMutation({
    mutationFn: (input: { eventId: string; targetState: string }) => transition({ data: input as never }),
    ...handlers,
  });

  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<(typeof EVENT_TYPES)[number]["value"]>("career");
  const [purposeCode, setPurposeCode] = useState("graduate_events");
  const [noticeVersion, setNoticeVersion] = useState("v1");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const scopeState = useScopeState();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">إضافة فعالية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="عنوان الفعالية" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {EVENT_TYPES.map((item) => (
              <Button
                key={item.value}
                type="button"
                size="sm"
                variant={eventType === item.value ? "default" : "outline"}
                onClick={() => setEventType(item.value)}
              >
                {item.labelAr}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              غرض المعالجة
              <Input value={purposeCode} onChange={(e) => setPurposeCode(e.target.value)} />
            </label>
            <label className="text-sm">
              إصدار الإشعار
              <Input value={noticeVersion} onChange={(e) => setNoticeVersion(e.target.value)} />
            </label>
            <label className="text-sm">
              البداية
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </label>
            <label className="text-sm">
              النهاية
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </label>
          </div>
          <ScopeSelector
            collegeWide={scopeState.collegeWide}
            departmentIds={scopeState.departmentIds}
            programIds={scopeState.programIds}
            onChange={scopeState.onChange}
          />
          <Button
            size="sm"
            disabled={
              saveMutation.isPending ||
              !title.trim() ||
              !startsAt ||
              !endsAt ||
              !purposeCode.trim() ||
              !noticeVersion.trim() ||
              !scopeState.valid
            }
            onClick={() =>
              saveMutation.mutate(
                {
                  id: null,
                  title: title.trim(),
                  eventType,
                  purposeCode: purposeCode.trim(),
                  noticeVersion: noticeVersion.trim(),
                  startsAt: new Date(startsAt).toISOString(),
                  endsAt: new Date(endsAt).toISOString(),
                  audienceScope: scopeState.scope,
                },
                {
                  onSuccess: () => {
                    setTitle("");
                    setStartsAt("");
                    setEndsAt("");
                    scopeState.reset();
                  },
                },
              )
            }
          >
            <Plus className="ms-1 h-4 w-4" /> حفظ كمسودة
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {query.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {(query.data ?? []).map((row) => (
          <Card key={row.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <div className="font-semibold">{row.title}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(row.starts_at).toLocaleString("ar")} — المسجلون: {row.registrations_count}
                </div>
                <ScopeSummary scope={row.audience_scope} />
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{label(row.state)}</Badge>
                {row.state === "draft" ? (
                  <Button
                    size="sm"
                    onClick={() => transitionMutation.mutate({ eventId: row.id, targetState: "published" })}
                  >
                    نشر
                  </Button>
                ) : null}
                {row.state === "published" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => transitionMutation.mutate({ eventId: row.id, targetState: "completed" })}
                  >
                    إنهاء
                  </Button>
                ) : null}
                {row.state === "draft" || row.state === "published" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => transitionMutation.mutate({ eventId: row.id, targetState: "cancelled" })}
                  >
                    إلغاء
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------- surveys ---------------------------- */

interface DraftQuestion {
  key: string;
  labelAr: string;
  kind: "single_choice" | "free_text";
  required: boolean;
  options: string;
  maxLength: number;
}

function emptyQuestion(index: number): DraftQuestion {
  return {
    key: `q${index + 1}`,
    labelAr: "",
    kind: "single_choice",
    required: true,
    options: "نعم، لا",
    maxLength: 500,
  };
}

function toQuestionPayload(question: DraftQuestion): Record<string, unknown> {
  return question.kind === "single_choice"
    ? {
        key: question.key,
        label_ar: question.labelAr,
        kind: "single_choice",
        required: question.required,
        options: question.options
          .split(/[،,]/)
          .map((option) => option.trim())
          .filter(Boolean),
      }
    : {
        key: question.key,
        label_ar: question.labelAr,
        kind: "free_text",
        required: question.required,
        maxLength: question.maxLength,
      };
}

function QuestionEditor(props: {
  questions: DraftQuestion[];
  onChange: (next: DraftQuestion[]) => void;
}) {
  const update = (index: number, patch: Partial<DraftQuestion>) =>
    props.onChange(props.questions.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const move = (index: number, delta: number) => {
    const next = [...props.questions];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    props.onChange(next);
  };

  return (
    <div className="space-y-3">
      {props.questions.map((question, index) => (
        <div key={index} className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">السؤال {index + 1}</span>
            <div className="flex gap-1">
              <Button type="button" size="icon" variant="ghost" onClick={() => move(index, -1)}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" onClick={() => move(index, 1)}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => props.onChange(props.questions.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">
              المعرّف
              <Input value={question.key} onChange={(e) => update(index, { key: e.target.value })} />
            </label>
            <label className="text-xs">
              نص السؤال
              <Input value={question.labelAr} onChange={(e) => update(index, { labelAr: e.target.value })} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={question.kind === "single_choice" ? "default" : "outline"}
              onClick={() => update(index, { kind: "single_choice" })}
            >
              اختيار واحد
            </Button>
            <Button
              type="button"
              size="sm"
              variant={question.kind === "free_text" ? "default" : "outline"}
              onClick={() => update(index, { kind: "free_text" })}
            >
              نص حر
            </Button>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(e) => update(index, { required: e.target.checked })}
              />
              إلزامي
            </label>
          </div>
          {question.kind === "single_choice" ? (
            <label className="block text-xs">
              الخيارات (مفصولة بفاصلة)
              <Input value={question.options} onChange={(e) => update(index, { options: e.target.value })} />
            </label>
          ) : (
            <label className="block text-xs">
              الحد الأقصى للأحرف
              <Input
                type="number"
                value={question.maxLength}
                onChange={(e) => update(index, { maxLength: Number(e.target.value) || 500 })}
              />
            </label>
          )}
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => props.onChange([...props.questions, emptyQuestion(props.questions.length)])}
      >
        <Plus className="ms-1 h-4 w-4" /> إضافة سؤال
      </Button>
    </div>
  );
}

function SurveysTab() {
  const list = useServerFn(listGaSurveysFn);
  const saveSurvey = useServerFn(saveGaSurveyFn);
  const saveVersion = useServerFn(saveGaSurveyVersionDraftFn);
  const publish = useServerFn(publishGaSurveyVersionFn);
  const close = useServerFn(closeGaSurveyFn);
  const query = useQuery({ queryKey: ["ga-surveys"], queryFn: () => list({ data: {} }) });
  const handlers = useOp("ga-surveys");
  const saveSurveyMutation = useMutation({
    mutationFn: (input: Parameters<typeof saveSurvey>[0]["data"]) => saveSurvey({ data: input }),
    ...handlers,
  });
  const versionMutation = useMutation({
    mutationFn: (input: Parameters<typeof saveVersion>[0]["data"]) => saveVersion({ data: input }),
    ...handlers,
  });
  const publishMutation = useMutation({
    mutationFn: (input: { versionId: string }) => publish({ data: input }),
    ...handlers,
  });
  const closeMutation = useMutation({
    mutationFn: (input: { surveyId: string }) => close({ data: input }),
    ...handlers,
  });

  const [title, setTitle] = useState("");
  const [purposeCode, setPurposeCode] = useState("surveys");
  const scopeState = useScopeState();

  const [editorSurveyId, setEditorSurveyId] = useState<string | null>(null);
  const [editorVersionId, setEditorVersionId] = useState<string | null>(null);
  const [noticeVersion, setNoticeVersion] = useState("v1");
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion(0)]);

  const rows = query.data ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      map.set(row.survey_id, [...(map.get(row.survey_id) ?? []), row]);
    }
    return [...map.values()];
  }, [rows]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">إضافة استبيان</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="عنوان الاستبيان" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="غرض المعالجة" value={purposeCode} onChange={(e) => setPurposeCode(e.target.value)} />
          </div>
          <ScopeSelector
            collegeWide={scopeState.collegeWide}
            departmentIds={scopeState.departmentIds}
            programIds={scopeState.programIds}
            onChange={scopeState.onChange}
          />
          <Button
            size="sm"
            disabled={saveSurveyMutation.isPending || !title.trim() || !scopeState.valid}
            onClick={() =>
              saveSurveyMutation.mutate(
                {
                  id: null,
                  title: title.trim(),
                  purposeCode: purposeCode.trim() || "surveys",
                  minimumReportCellSize: 5,
                  audienceScope: scopeState.scope,
                },
                {
                  onSuccess: () => {
                    setTitle("");
                    scopeState.reset();
                  },
                },
              )
            }
          >
            <Plus className="ms-1 h-4 w-4" /> حفظ
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {query.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {grouped.map((versions) => {
          const head = versions[0];
          const latestDraft = versions.find((row) => row.version_id && row.published_at === null);
          return (
            <Card key={head.survey_id}>
              <CardContent className="space-y-3 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{head.title}</div>
                    <ScopeSummary scope={head.audience_scope} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{label(head.state)}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditorSurveyId(head.survey_id);
                        setEditorVersionId(latestDraft?.version_id ?? null);
                        setNoticeVersion(latestDraft?.notice_version ?? "v1");
                        const existing = (latestDraft?.questions ?? []) as Array<Record<string, unknown>>;
                        setQuestions(
                          existing.length > 0
                            ? existing.map((item, index) => ({
                                key: String(item["key"] ?? `q${index + 1}`),
                                labelAr: String(item["label_ar"] ?? ""),
                                kind: item["kind"] === "free_text" ? "free_text" : "single_choice",
                                required: item["required"] !== false,
                                options: Array.isArray(item["options"])
                                  ? (item["options"] as unknown[]).map(String).join("، ")
                                  : "",
                                maxLength: Number(item["maxLength"] ?? 500),
                              }))
                            : [emptyQuestion(0)],
                        );
                      }}
                    >
                      {latestDraft ? "تحرير المسودة" : "إنشاء نسخة مسودة"}
                    </Button>
                    {latestDraft?.version_id ? (
                      <Button
                        size="sm"
                        onClick={() => publishMutation.mutate({ versionId: latestDraft.version_id! })}
                      >
                        نشر النسخة
                      </Button>
                    ) : null}
                    {head.state !== "closed" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => closeMutation.mutate({ surveyId: head.survey_id })}
                      >
                        إغلاق
                      </Button>
                    ) : null}
                  </div>
                </div>

                <ul className="space-y-1 text-xs text-muted-foreground">
                  {versions
                    .filter((row) => row.version_id)
                    .map((row) => (
                      <li key={row.version_id}>
                        النسخة {row.version} —{" "}
                        {row.published_at ? `منشورة (${new Date(row.published_at).toLocaleDateString("ar")})` : "مسودة"}{" "}
                        — الردود: {row.response_count ?? 0}
                      </li>
                    ))}
                </ul>

                {editorSurveyId === head.survey_id ? (
                  <div className="space-y-3 rounded-md border p-3">
                    <label className="block text-xs">
                      إصدار الإشعار
                      <Input value={noticeVersion} onChange={(e) => setNoticeVersion(e.target.value)} />
                    </label>
                    <QuestionEditor questions={questions} onChange={setQuestions} />
                    <div className="rounded-md bg-muted/40 p-2 text-xs">
                      <p className="font-medium">معاينة</p>
                      <ol className="mt-1 list-decimal ps-5">
                        {questions.map((question, index) => (
                          <li key={index}>
                            {question.labelAr || "(بدون نص)"}
                            {question.required ? " *" : ""}
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={versionMutation.isPending || questions.some((q) => !q.labelAr.trim())}
                        onClick={() =>
                          versionMutation.mutate(
                            {
                              surveyId: head.survey_id,
                              versionId: editorVersionId,
                              noticeVersion: noticeVersion.trim() || "v1",
                              questions: questions.map(toQuestionPayload),
                            },
                            { onSuccess: () => setEditorSurveyId(null) },
                          )
                        }
                      >
                        حفظ المسودة
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditorSurveyId(null)}>
                        إلغاء
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------- communications -------------------------- */

function CommunicationsTab() {
  const search = useServerFn(searchGraduateRecordsFn);
  const getFile = useServerFn(getStaffGraduateFileFn);
  const listCommunications = useServerFn(listGaCommunicationsFn);
  const logCommunication = useServerFn(logGaCommunicationFn);
  const handlers = useOp("ga-communications");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contactPointId, setContactPointId] = useState<string>("");
  const [templateCode, setTemplateCode] = useState("");

  const recordsQuery = useQuery({
    queryKey: ["ga-communication-records"],
    queryFn: () => search({ data: { programId: null, departmentId: null, graduationYear: null, limit: 100 } }),
  });
  const fileQuery = useQuery({
    queryKey: ["ga-communication-file", selectedId],
    queryFn: () => getFile({ data: { graduateRecordId: selectedId! } }),
    enabled: Boolean(selectedId),
  });
  const communicationsQuery = useQuery({
    queryKey: ["ga-communications", selectedId],
    queryFn: () => listCommunications({ data: { graduateRecordId: selectedId! } }),
    enabled: Boolean(selectedId),
  });

  const contactPoints = (fileQuery.data?.contact_points ?? []).filter(
    (point) => !point.is_revoked,
  );
  const selectedPoint = contactPoints.find((point) => point.id === contactPointId);

  const logMutation = useMutation({
    mutationFn: (input: Parameters<typeof logCommunication>[0]["data"]) =>
      logCommunication({ data: input }),
    ...handlers,
  });

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,320px)_1fr]">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">اختيار الخريج</CardTitle>
        </CardHeader>
        <CardContent className="max-h-96 space-y-1 overflow-auto">
          {recordsQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {(recordsQuery.data ?? []).map((record) => (
            <Button
              key={record.id}
              size="sm"
              variant={selectedId === record.id ? "default" : "ghost"}
              className="w-full justify-start"
              onClick={() => {
                setSelectedId(record.id);
                setContactPointId("");
              }}
            >
              خريج {record.graduation_year} — {label(record.record_state)}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">تسجيل رسالة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!selectedId ? (
            <p className="text-sm text-muted-foreground">اختر خريجاً لعرض نقاط الاتصال الصالحة.</p>
          ) : (
            <>
              {fileQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <label className="block text-sm">
                نقطة الاتصال
                <select
                  className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
                  value={contactPointId}
                  onChange={(e) => setContactPointId(e.target.value)}
                >
                  <option value="">اختر نقطة اتصال</option>
                  {contactPoints.map((point) => (
                    <option key={point.id} value={point.id}>
                      {point.channel_type === "email" ? "بريد إلكتروني" : "هاتف"} — {point.purpose_code}
                      {point.is_verified ? "" : " (غير موثقة)"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                رمز القالب
                <Input value={templateCode} onChange={(e) => setTemplateCode(e.target.value)} />
              </label>
              <Button
                size="sm"
                disabled={!selectedPoint || !templateCode.trim() || logMutation.isPending}
                onClick={() =>
                  selectedPoint
                    ? logMutation.mutate(
                        {
                          graduateRecordId: selectedId,
                          contactPointId: selectedPoint.id,
                          purposeCode: selectedPoint.purpose_code,
                          channel: selectedPoint.channel_type === "email" ? "email" : "phone",
                          templateCode: templateCode.trim(),
                        },
                        { onSuccess: () => setTemplateCode("") },
                      )
                    : undefined
                }
              >
                تسجيل الإرسال
              </Button>

              <div className="space-y-1 pt-2 text-xs">
                <p className="font-medium">سجل التواصل</p>
                {(communicationsQuery.data ?? []).length === 0 ? (
                  <p className="text-muted-foreground">لا توجد رسائل مسجلة.</p>
                ) : null}
                {(communicationsQuery.data ?? []).map((row) => (
                  <div key={row.id} className="rounded border p-2">
                    {row.template_code} — {row.channel === "email" ? "بريد" : "هاتف"} —{" "}
                    {new Date(row.sent_at).toLocaleString("ar")}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------------------- employers --------------------------- */

function EmployersTab() {
  const list = useServerFn(listGaEmployersFn);
  const setVerification = useServerFn(setGaEmployerVerificationFn);
  const query = useQuery({ queryKey: ["ga-employers"], queryFn: () => list({ data: {} }) });
  const handlers = useOp("ga-employers");
  const mutation = useMutation({
    mutationFn: (input: { employerId: string; targetState: string }) =>
      setVerification({ data: input as never }),
    ...handlers,
  });

  return (
    <div className="space-y-2">
      {query.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {(query.data ?? []).length === 0 && !query.isLoading ? (
        <p className="text-sm text-muted-foreground">لا توجد جهات عمل مسجلة.</p>
      ) : null}
      {(query.data ?? []).map((row) => (
        <Card key={row.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="font-semibold">{row.legal_name}</div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{label(row.verification_state)}</Badge>
              {row.verification_state === "unverified" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => mutation.mutate({ employerId: row.id, targetState: "in_review" })}
                >
                  بدء التوثيق
                </Button>
              ) : null}
              {row.verification_state === "in_review" ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => mutation.mutate({ employerId: row.id, targetState: "verified" })}
                  >
                    اعتماد
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => mutation.mutate({ employerId: row.id, targetState: "rejected" })}
                  >
                    رفض
                  </Button>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Operational authoring surface for Graduates Affairs.
 * Authorization is enforced server-side: manager (college), specialist
 * (department scope), or admin/system_admin operational fallback — every
 * write is audited with the resolved actor mode and audience scope.
 */
export function GraduatesAffairsAuthoringPanel() {
  const queryClient = useQueryClient();
  return (
    <section className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-primary">الإدخال التشغيلي</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void queryClient.invalidateQueries();
          }}
        >
          <RefreshCw className="ms-1 h-4 w-4" /> تحديث
        </Button>
      </div>
      <Tabs defaultValue="opportunities">
        <TabsList>
          <TabsTrigger value="opportunities">الفرص</TabsTrigger>
          <TabsTrigger value="events">الفعاليات</TabsTrigger>
          <TabsTrigger value="surveys">الاستبيانات</TabsTrigger>
          <TabsTrigger value="communications">التواصل</TabsTrigger>
          <TabsTrigger value="employers">جهات العمل</TabsTrigger>
        </TabsList>
        <TabsContent value="opportunities" className="pt-3">
          <OpportunitiesTab />
        </TabsContent>
        <TabsContent value="events" className="pt-3">
          <EventsTab />
        </TabsContent>
        <TabsContent value="surveys" className="pt-3">
          <SurveysTab />
        </TabsContent>
        <TabsContent value="communications" className="pt-3">
          <CommunicationsTab />
        </TabsContent>
        <TabsContent value="employers" className="pt-3">
          <EmployersTab />
        </TabsContent>
      </Tabs>
    </section>
  );
}
