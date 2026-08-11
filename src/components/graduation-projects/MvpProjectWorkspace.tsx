import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DECISION_LABELS,
  STATE_LABELS,
  type FinalDecision,
  type GraduationProjectDetail,
  type UiAction,
} from "./mvp-ui";
import { PrivateFileControl } from "./PrivateFileControl";

export function MvpProjectWorkspace({
  detail,
  busy = false,
  defaultTab = "team",
  onAction,
}: {
  detail: GraduationProjectDetail;
  busy?: boolean;
  defaultTab?: "team" | "proposal" | "progress" | "final" | "defense" | "result";
  onAction: (action: UiAction) => void;
}) {
  const leader = detail.viewer === "leader",
    coordinator = detail.viewer === "coordinator",
    supervisor = detail.viewer === "supervisor",
    pendingSupervisor = detail.viewer === "supervisor_pending",
    committee = detail.viewer === "committee";
  const editableProposal = leader && ["draft", "revision_required"].includes(detail.state);
  const [problem, setProblem] = useState(detail.proposal.problemStatement),
    [objectives, setObjectives] = useState(detail.proposal.objectives),
    [summary, setSummary] = useState(detail.proposal.summary);
  const [comments, setComments] = useState(""),
    [progressText, setProgressText] = useState(""),
    [progressFileId, setProgressFileId] = useState<string | undefined>(),
    [selectedStudent, setSelectedStudent] = useState(""),
    [selectedSupervisor, setSelectedSupervisor] = useState("");
  const [startsAt, setStartsAt] = useState(""),
    [venue, setVenue] = useState(""),
    [committeeIds, setCommitteeIds] = useState<string[]>([]),
    [score, setScore] = useState(""),
    [notes, setNotes] = useState(""),
    [revisions, setRevisions] = useState("");
  const proposalComplete = useMemo(
    () => [problem, objectives, summary].every((value) => value.trim()),
    [problem, objectives, summary],
  );
  const confirmAction = (message: string, action: UiAction) => {
    if (window.confirm(message)) onAction(action);
  };
  const resolveUserId = (profileId: string, options: { id: string; userId?: string }[]) => {
    const hit = options.find((o) => o.id === profileId);
    return hit?.userId ?? profileId;
  };
  const upload = (category: "proposal" | "progress" | "final") => (file: File) => {
    if (category === "progress") setProgressFileId("pending");
    onAction({ type: "upload", category, file });
  };
  return (
    <div dir="rtl" className="space-y-4" data-actor={detail.viewer}>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle>{detail.title}</CardTitle>
            <Badge>{STATE_LABELS[detail.state]}</Badge>
          </div>
          <CardDescription>
            {detail.finalDecision
              ? `النتيجة: ${DECISION_LABELS[detail.finalDecision]}`
              : "مساحة عمل المشروع المعيّن"}
          </CardDescription>
        </CardHeader>
      </Card>
      {pendingSupervisor ? (
        <Card data-testid="supervisor-pending">
          <CardHeader>
            <CardTitle>دعوة إشراف معلقة</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                confirmAction("تأكيد قبول الإشراف؟", {
                  type: "supervisor_respond",
                  response: "accepted",
                })
              }
            >
              قبول
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                confirmAction("تأكيد رفض دعوة الإشراف؟", {
                  type: "supervisor_respond",
                  response: "declined",
                })
              }
            >
              رفض
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <Tabs defaultValue={defaultTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="team">الفريق</TabsTrigger>
          <TabsTrigger value="proposal">المقترح</TabsTrigger>
          <TabsTrigger value="progress">التقدم</TabsTrigger>
          <TabsTrigger value="final">التسليم النهائي</TabsTrigger>
          <TabsTrigger value="defense">مناقشة مشروع التخرج</TabsTrigger>
          <TabsTrigger value="result">النتيجة والأرشيف</TabsTrigger>
        </TabsList>
        <TabsContent value="team">
          <Card>
            <CardHeader>
              <CardTitle>فريق المشروع</CardTitle>
              <CardDescription>
                {detail.teamLocked
                  ? "عضوية الفريق مقفلة بعد قبول المقترح."
                  : "يمكن لقائد الفريق إدارة الأعضاء قبل القفل."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="divide-y">
                {detail.team.map((member) => (
                  <li key={member.id} className="flex items-center gap-2 py-2">
                    <span className="flex-1">
                      {member.name}
                      {member.academicNumber ? ` — ${member.academicNumber}` : ""}
                    </span>
                    {member.leader ? <Badge>قائد الفريق</Badge> : null}
                    {leader && !detail.teamLocked && !member.leader ? (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          confirmAction("تأكيد إزالة العضو من الفريق؟", {
                            type: "member_remove",
                            memberId: member.id,
                          })
                        }
                      >
                        إزالة
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {leader && !detail.teamLocked ? (
                <div className="flex flex-wrap gap-2" data-testid="leader-member-controls">
                  <IdentitySelect
                    label="اختر طالباً"
                    value={selectedStudent}
                    onChange={setSelectedStudent}
                    options={detail.coordinatorOptions.students}
                    emptyHint="لا يوجد طلاب مستوى رابع متاحون في دليل القسم لهذا المشروع."
                  />
                  <Button
                    disabled={busy || !selectedStudent}
                    onClick={() =>
                      onAction({
                        type: "member_add",
                        studentId: selectedStudent,
                        userId: resolveUserId(
                          selectedStudent,
                          detail.coordinatorOptions.students,
                        ),
                      })
                    }
                  >
                    إضافة عضو
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="proposal">
          <Card>
            <CardHeader>
              <CardTitle>المقترح المنظم</CardTitle>
              {detail.proposal.comments ? (
                <CardDescription>تعليق المنسق: {detail.proposal.comments}</CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              <Field
                label="مشكلة المشروع"
                value={problem}
                set={setProblem}
                disabled={!editableProposal}
              />
              <Field
                label="الأهداف"
                value={objectives}
                set={setObjectives}
                disabled={!editableProposal}
              />
              <Field label="الملخص" value={summary} set={setSummary} disabled={!editableProposal} />
              <PrivateFileControl
                label="مرفق المقترح"
                file={detail.proposal.attachment}
                canUpload={editableProposal}
                busy={busy}
                onUpload={upload("proposal")}
                onDownload={() =>
                  detail.proposal.attachment &&
                  onAction({ type: "download", fileId: detail.proposal.attachment.id })
                }
              />
              {editableProposal ? (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={busy || !proposalComplete}
                    onClick={() =>
                      onAction({
                        type: "proposal_save",
                        problemStatement: problem.trim(),
                        objectives: objectives.trim(),
                        summary: summary.trim(),
                      })
                    }
                  >
                    حفظ
                  </Button>
                  <Button
                    disabled={
                      busy || !proposalComplete || detail.proposal.attachment?.state !== "ready"
                    }
                    onClick={() =>
                      confirmAction("تأكيد إرسال المقترح للمراجعة؟", { type: "proposal_submit" })
                    }
                  >
                    إرسال المقترح
                  </Button>
                </div>
              ) : null}
              {coordinator && detail.state === "submitted" ? (
                <div className="space-y-2" data-testid="coordinator-proposal-controls">
                  <Textarea
                    placeholder="التعليقات مطلوبة للإعادة أو الرفض"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() =>
                        confirmAction("تأكيد قبول المقترح؟", {
                          type: "proposal_decide",
                          decision: "accepted",
                        })
                      }
                    >
                      قبول
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!comments.trim()}
                      onClick={() =>
                        confirmAction("تأكيد إعادة المقترح؟", {
                          type: "proposal_decide",
                          decision: "returned",
                          comments: comments.trim(),
                        })
                      }
                    >
                      إعادة للتعديل
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={!comments.trim()}
                      onClick={() =>
                        confirmAction("هذا الرفض ينهي المسار التشغيلي. متابعة؟", {
                          type: "proposal_decide",
                          decision: "rejected",
                          comments: comments.trim(),
                        })
                      }
                    >
                      رفض
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="progress">
          <Card>
            <CardHeader>
              <CardTitle>تحديثات التقدم</CardTitle>
              <CardDescription>السجل محفوظ ويعرض الإرسال والتصحيح وقرار المشرف.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.progress.map((item) => (
                <div key={item.id} className="rounded-lg border p-3">
                  <Badge variant="secondary">
                    {item.state === "approved"
                      ? "معتمد"
                      : item.state === "returned"
                        ? "معاد"
                        : "مرسل"}
                  </Badge>
                  <p className="mt-2">{item.text}</p>
                  {item.supervisorComment ? (
                    <p className="text-sm text-muted-foreground">
                      تعليق المشرف: {item.supervisorComment}
                    </p>
                  ) : null}
                  {supervisor && item.state === "submitted" ? (
                    <div className="mt-2 flex gap-2" data-testid="supervisor-accepted-controls">
                      <Button
                        onClick={() =>
                          onAction({
                            type: "progress_review",
                            updateId: item.id,
                            decision: "approved",
                          })
                        }
                      >
                        اعتماد
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={!comments.trim()}
                        onClick={() =>
                          onAction({
                            type: "progress_review",
                            updateId: item.id,
                            decision: "returned",
                            comments: comments.trim(),
                          })
                        }
                      >
                        إعادة
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
              {leader && detail.state === "active" ? (
                <>
                  <Textarea
                    placeholder="اكتب تحديث التقدم أو التصحيح"
                    value={progressText}
                    onChange={(e) => setProgressText(e.target.value)}
                  />
                  <PrivateFileControl
                    label="مرفق تقدم اختياري"
                    canUpload
                    busy={busy}
                    onUpload={upload("progress")}
                  />
                  <Button
                    disabled={busy || !progressText.trim()}
                    onClick={() => {
                      onAction({
                        type: "progress_submit",
                        text: progressText.trim(),
                        fileId:
                          progressFileId && progressFileId !== "pending"
                            ? progressFileId
                            : undefined,
                      });
                      setProgressText("");
                      setProgressFileId(undefined);
                    }}
                  >
                    إرسال التحديث
                  </Button>
                </>
              ) : null}
              {supervisor ? (
                <Textarea
                  placeholder="تعليق الإعادة"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                />
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="final">
          <Card>
            <CardHeader>
              <CardTitle>التسليم النهائي الخاص</CardTitle>
              {detail.finalResponse ? (
                <CardDescription>
                  {detail.finalResponse.state === "ready"
                    ? "المشرف: جاهز للمناقشة"
                    : `أعاده المشرف: ${detail.finalResponse.comments ?? ""}`}
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              <PrivateFileControl
                label="النسخة النهائية الحالية"
                file={detail.finalFile}
                canUpload={
                  leader &&
                  (detail.state === "active" || detail.finalDecision === "revisions_required")
                }
                busy={busy}
                onUpload={upload("final")}
                onDownload={() =>
                  detail.finalFile && onAction({ type: "download", fileId: detail.finalFile.id })
                }
              />
              {supervisor && detail.finalFile?.state === "ready" ? (
                <div className="space-y-2" data-testid="supervisor-final-controls">
                  <Textarea
                    placeholder="تعليق مطلوب عند الإعادة"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() =>
                        confirmAction("تأكيد جاهزية الملف النهائي؟", {
                          type: "final_review",
                          decision: "ready",
                        })
                      }
                    >
                      جاهز
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!comments.trim()}
                      onClick={() =>
                        onAction({
                          type: "final_review",
                          decision: "returned",
                          comments: comments.trim(),
                        })
                      }
                    >
                      إعادة
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="defense">
          <Card>
            <CardHeader>
              <CardTitle>مناقشة مشروع التخرج</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.defense ? (
                <p>
                  {new Date(detail.defense.startsAt).toLocaleString("ar-SA")} —{" "}
                  {detail.defense.venue} — أعضاء اللجنة: {detail.defense.committeeCount}
                </p>
              ) : (
                <p className="text-muted-foreground">لم تُجدول المناقشة بعد.</p>
              )}
              {coordinator ? (
                <div className="space-y-3" data-testid="coordinator-defense-controls">
                  <Label>التاريخ والوقت</Label>
                  <Input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                  <Label>المكان</Label>
                  <Input value={venue} onChange={(e) => setVenue(e.target.value)} />
                  <Button
                    disabled={!startsAt || !venue.trim()}
                    onClick={() =>
                      onAction({ type: "defense_schedule", startsAt, venue: venue.trim() })
                    }
                  >
                    حفظ الموعد
                  </Button>
                  <CommitteeSelect
                    options={detail.coordinatorOptions.committee}
                    selected={committeeIds}
                    setSelected={setCommitteeIds}
                  />
                  <Button
                    disabled={committeeIds.length < 2}
                    onClick={() =>
                      onAction({
                        type: "committee_assign",
                        facultyIds: committeeIds,
                        members: committeeIds.map((facultyId) => ({
                          facultyId,
                          userId: resolveUserId(
                            facultyId,
                            detail.coordinatorOptions.committee,
                          ),
                        })),
                      })
                    }
                  >
                    تعيين اللجنة ({committeeIds.length})
                  </Button>
                  {detail.defense && !detail.defense.held ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        confirmAction("تأكيد انعقاد المناقشة؟", { type: "defense_held" })
                      }
                    >
                      تسجيل انعقاد المناقشة
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {committee && detail.evaluation ? (
                <div className="space-y-2" data-testid="committee-own-evaluation">
                  <p>تقييمي فقط — لا تظهر تقييمات أو ملاحظات الزملاء.</p>
                  {detail.evaluation.submitted ? (
                    <Badge>تم الإرسال — غير قابل للتعديل</Badge>
                  ) : (
                    <>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={score}
                        onChange={(e) => setScore(e.target.value)}
                        placeholder="الدرجة من 0 إلى 100"
                      />
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="ملاحظاتي"
                      />
                      <Button
                        disabled={Number(score) < 0 || Number(score) > 100 || score === ""}
                        onClick={() =>
                          confirmAction("إرسال التقييم نهائياً؟ لن يمكن تعديله.", {
                            type: "evaluation_submit",
                            score: Number(score),
                            notes: notes.trim(),
                          })
                        }
                      >
                        إرسال التقييم النهائي
                      </Button>
                    </>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="result">
          <Card>
            <CardHeader>
              <CardTitle>النتيجة والتعديلات والأرشيف</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.evaluation && coordinator ? (
                <p data-testid="evaluation-aggregate">
                  جاهزية التقييم: {detail.evaluation.submittedCount}/
                  {detail.evaluation.requiredCount}
                  {detail.evaluation.average === undefined
                    ? ""
                    : ` — المتوسط: ${detail.evaluation.average.toFixed(2)}`}
                </p>
              ) : null}
              {detail.finalDecision ? (
                <p data-testid="final-decision-label">
                  القرار: {DECISION_LABELS[detail.finalDecision]}
                </p>
              ) : null}
              {detail.finalDecision === "revisions_required" ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm" data-testid="revisions-visibility">
                  المشروع غير مؤرشف وبانتظار إعادة التسليم النهائي والمراجعة.
                  {detail.revisions ? ` وصف التعديلات: ${detail.revisions}` : ""}
                </p>
              ) : null}
              {detail.revisions && detail.finalDecision !== "revisions_required" ? (
                <p>التعديلات المطلوبة: {detail.revisions}</p>
              ) : null}
              {coordinator &&
              detail.state === "evaluating" &&
              detail.evaluation?.submittedCount === detail.evaluation?.requiredCount ? (
                <div className="space-y-2" data-testid="coordinator-result-controls">
                  <Textarea
                    value={revisions}
                    onChange={(e) => setRevisions(e.target.value)}
                    placeholder="وصف التعديلات المطلوبة"
                  />
                  <div className="flex flex-wrap gap-2">
                    {(
                      ["passed", "revisions_required", "failed"] as Exclude<FinalDecision, null>[]
                    ).map((decision) => (
                      <Button
                        key={decision}
                        variant={decision === "failed" ? "destructive" : "outline"}
                        disabled={decision === "revisions_required" && !revisions.trim()}
                        onClick={() =>
                          confirmAction("تأكيد تسجيل القرار النهائي؟", {
                            type: "result_record",
                            decision,
                            revisions: revisions.trim() || undefined,
                          })
                        }
                      >
                        {DECISION_LABELS[decision]}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              {coordinator &&
              (detail.finalDecision === "passed" || detail.finalDecision === "failed") &&
              detail.state !== "archived" ? (
                <Button
                  onClick={() =>
                    confirmAction("الأرشفة إجراء نهائي. هل تريد المتابعة؟", { type: "archive" })
                  }
                >
                  أرشفة المشروع
                </Button>
              ) : null}
              {detail.archive ? (
                <div className="rounded-lg border p-3">
                  <p>{detail.archive.summary}</p>
                  <p className="text-sm text-muted-foreground">
                    أرشف في {detail.archive.archivedAt}
                  </p>
                  <PrivateFileControl
                    label="الملف النهائي المؤرشف"
                    file={detail.archive.file}
                    canUpload={false}
                    onDownload={() =>
                      detail.archive?.file &&
                      onAction({ type: "download", fileId: detail.archive.file.id })
                    }
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {coordinator ? (
        <Card data-testid="coordinator-supervisor-controls">
          <CardHeader>
            <CardTitle>المشرف</CardTitle>
            <CardDescription>
              {detail.supervisor
                ? `${detail.supervisor.name} — ${detail.supervisor.acceptance === "accepted" ? "مقبول" : detail.supervisor.acceptance === "pending" ? "بانتظار القبول" : "مرفوض"}`
                : "لم يعيّن مشرف"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <IdentitySelect
              label="اختر مشرفاً"
              value={selectedSupervisor}
              onChange={setSelectedSupervisor}
              options={detail.coordinatorOptions.supervisors}
              emptyHint="لا يوجد أعضاء هيئة تدريس متاحون في دليل القسم. طبّق ترحيل خيارات الهوية أو حدّث الدليل."
            />
            <Button
              disabled={!selectedSupervisor}
              onClick={() =>
                onAction({
                  type: "supervisor_assign",
                  facultyId: selectedSupervisor,
                  userId: resolveUserId(
                    selectedSupervisor,
                    detail.coordinatorOptions.supervisors,
                  ),
                })
              }
            >
              تعيين المشرف
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  set,
  disabled,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea value={value} disabled={disabled} onChange={(e) => set(e.target.value)} />
    </div>
  );
}
function IdentitySelect({
  label,
  value,
  onChange,
  options,
  emptyHint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; name: string; secondary?: string }[];
  emptyHint?: string;
}) {
  if (!options.length) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="identity-options-empty">
        {emptyHint ?? "دليل الهويات غير متاح لهذا الإجراء حالياً."}
      </p>
    );
  }
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="min-w-56">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
            {option.secondary ? ` — ${option.secondary}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function CommitteeSelect({
  options,
  selected,
  setSelected,
}: {
  options: { id: string; name: string; secondary?: string }[];
  selected: string[];
  setSelected: (ids: string[]) => void;
}) {
  if (!options.length) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="committee-options-empty">
        لا يوجد مرشحون للجنة في دليل القسم. لا يمكن التعيين بمعرّفات خام.
      </p>
    );
  }
  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">أعضاء اللجنة (عضوان على الأقل)</legend>
      {options.map((option) => (
        <label key={option.id} className="flex gap-2">
          <input
            type="checkbox"
            checked={selected.includes(option.id)}
            onChange={(e) =>
              setSelected(
                e.target.checked
                  ? [...selected, option.id]
                  : selected.filter((id) => id !== option.id),
              )
            }
          />
          {option.name}
          {option.secondary ? ` — ${option.secondary}` : ""}
        </label>
      ))}
    </fieldset>
  );
}
