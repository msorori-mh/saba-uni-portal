import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  closeGaSurveyFn,
  listGaEmployersFn,
  listGaEventsFn,
  listGaOpportunitiesFn,
  listGaSurveysFn,
  moderateGaOpportunityFn,
  publishGaSurveyVersionFn,
  saveGaEventFn,
  saveGaOpportunityFn,
  saveGaSurveyFn,
  saveGaSurveyVersionDraftFn,
  setGaEmployerVerificationFn,
  transitionGaEventFn,
} from "@/lib/graduates-affairs/ga-authoring.functions";

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
  if (raw.includes("ACCESS_DENIED")) return "لا تملك صلاحية تنفيذ هذه العملية.";
  if (raw.includes("NOT_EDITABLE")) return "لا يمكن التعديل في الحالة الحالية.";
  if (raw.includes("INVALID_TRANSITION")) return "الانتقال غير مسموح من الحالة الحالية.";
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

/* -------------------------- opportunities -------------------------- */

function OpportunitiesTab() {
  const list = useServerFn(listGaOpportunitiesFn);
  const save = useServerFn(saveGaOpportunityFn);
  const moderate = useServerFn(moderateGaOpportunityFn);
  const query = useQuery({ queryKey: ["ga-opportunities"], queryFn: () => list({ data: {} }) });
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
            <Button
              size="sm"
              disabled={saveMutation.isPending || !title.trim() || !description.trim()}
              onClick={() =>
                saveMutation.mutate(
                  {
                    id: null,
                    opportunityType: type,
                    title: title.trim(),
                    description: description.trim(),
                    employerId: null,
                    closesAt: null,
                    audienceScope: {},
                  },
                  { onSuccess: () => { setTitle(""); setDescription(""); } },
                )
              }
            >
              <Plus className="ms-1 h-4 w-4" /> حفظ كمسودة
            </Button>
          </div>
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
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">إضافة فعالية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="عنوان الفعالية" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              البداية
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </label>
            <label className="text-sm">
              النهاية
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </label>
          </div>
          <Button
            size="sm"
            disabled={saveMutation.isPending || !title.trim() || !startsAt || !endsAt}
            onClick={() =>
              saveMutation.mutate(
                {
                  id: null,
                  title: title.trim(),
                  eventType: "career",
                  purposeCode: "graduate_events",
                  noticeVersion: "v1",
                  startsAt: new Date(startsAt).toISOString(),
                  endsAt: new Date(endsAt).toISOString(),
                  audienceScope: {},
                },
                { onSuccess: () => { setTitle(""); setStartsAt(""); setEndsAt(""); } },
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">إضافة استبيان</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            className="max-w-sm"
            placeholder="عنوان الاستبيان"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button
            size="sm"
            disabled={saveSurveyMutation.isPending || !title.trim()}
            onClick={() =>
              saveSurveyMutation.mutate(
                {
                  id: null,
                  title: title.trim(),
                  purposeCode: "graduate_survey",
                  minimumReportCellSize: 5,
                },
                { onSuccess: () => setTitle("") },
              )
            }
          >
            <Plus className="ms-1 h-4 w-4" /> حفظ
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {query.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {(query.data ?? []).map((row) => (
          <Card key={`${row.survey_id}-${row.version_id ?? "none"}`}>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <div className="font-semibold">{row.title}</div>
                <div className="text-xs text-muted-foreground">
                  {row.version ? `النسخة ${row.version}` : "بدون نسخة"} — الردود: {row.response_count ?? 0}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{label(row.state)}</Badge>
                {row.version_id === null ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      versionMutation.mutate({
                        surveyId: row.survey_id,
                        versionId: null,
                        noticeVersion: "v1",
                        questions: [
                          { code: "employment_status", label_ar: "ما هي حالتك الوظيفية الحالية؟", type: "text" },
                        ],
                      })
                    }
                  >
                    إنشاء نسخة مسودة
                  </Button>
                ) : null}
                {row.version_id && row.published_at === null ? (
                  <Button size="sm" onClick={() => publishMutation.mutate({ versionId: row.version_id! })}>
                    نشر النسخة
                  </Button>
                ) : null}
                {row.state !== "closed" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => closeMutation.mutate({ surveyId: row.survey_id })}
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
 * write is audited with the resolved actor mode.
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
        <TabsContent value="employers" className="pt-3">
          <EmployersTab />
        </TabsContent>
      </Tabs>
    </section>
  );
}
