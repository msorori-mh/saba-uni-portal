import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  SCORE_PROBLEM_LABELS,
  computeEvaluationTotal,
  validateEvaluationScores,
  type EvaluationRow,
  type EvaluationScoreRow,
  type LifecycleAction,
} from "../../lib/graduation-projects/lifecycle";
import type { ChangeEvent } from "react";

export interface EvaluationPanelProps {
  actions: LifecycleAction[];
  discussionId: string | null;
  evaluations: EvaluationRow[];
  ownEvaluation: EvaluationRow | null;
  busy?: boolean;
  onSave(
    discussionId: string,
    scores: EvaluationScoreRow[],
    comments: string | null,
    submit: boolean,
  ): void;
  onFinalize(evaluationId: string): void;
}

const EVALUATION_STATE_LABELS: Record<EvaluationRow["state"], string> = {
  draft: "مسودة",
  submitted: "مُرسل",
  finalized: "معتمد",
};

function emptyScore(index: number): EvaluationScoreRow {
  return {
    criterion_code: `c${index}`,
    criterion_label: "",
    maximum_score: 0,
    awarded_score: 0,
    comment: null,
  };
}

export function EvaluationPanel({
  actions,
  discussionId,
  evaluations,
  ownEvaluation,
  busy = false,
  onSave,
  onFinalize,
}: EvaluationPanelProps) {
  const [scores, setScores] = useState<EvaluationScoreRow[]>([emptyScore(1)]);
  const [comments, setComments] = useState("");
  const canEdit =
    actions.includes("save_evaluation") &&
    discussionId !== null &&
    ownEvaluation?.state !== "finalized" &&
    ownEvaluation?.state !== "submitted";
  const problems = validateEvaluationScores(scores);
  const total = computeEvaluationTotal(scores);
  const updateScore = (index: number, patch: Partial<EvaluationScoreRow>) => {
    setScores((current) =>
      current.map((score, i) => (i === index ? { ...score, ...patch } : score)),
    );
  };
  return (
    <div dir="rtl" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>التقييمات</CardTitle>
          <CardDescription>لا يرى الطالب أي تقييم قبل اعتماده النهائي.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {evaluations.map((evaluation) => (
              <li key={evaluation.id} className="flex flex-wrap items-center gap-2 border-b pb-2">
                <Badge variant="secondary">{EVALUATION_STATE_LABELS[evaluation.state]}</Badge>
                <span className="text-sm">الإصدار: {evaluation.rubric_version}</span>
                <span className="text-sm">المجموع: {evaluation.total_score}</span>
                {evaluation.comments ? (
                  <span className="text-sm text-muted-foreground">{evaluation.comments}</span>
                ) : null}
              </li>
            ))}
            {evaluations.length === 0 ? <li>لا توجد تقييمات ظاهرة.</li> : null}
          </ul>
          {actions.includes("finalize_evaluation") && ownEvaluation?.state === "submitted" ? (
            <div className="mt-3">
              <Button
                type="button"
                disabled={busy}
                data-testid="gp-finalize-evaluation"
                onClick={() => onFinalize(ownEvaluation.id)}
              >
                اعتماد تقييمي نهائياً
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">
                بعد الاعتماد لا يمكن تعديل التقييم.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {canEdit && discussionId ? (
        <Card>
          <CardHeader>
            <CardTitle>تقييمي</CardTitle>
            <CardDescription>أدخل درجات المعايير ثم احفظ كمسودة أو أرسل نهائياً.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {scores.map((score, index) => (
              <div key={index} className="grid gap-2 border-b pb-3">
                <Input
                  value={score.criterion_code}
                  dir="ltr"
                  placeholder="رمز المعيار"
                  aria-label={`رمز المعيار ${index + 1}`}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    updateScore(index, { criterion_code: event.target.value })
                  }
                />
                <Input
                  value={score.criterion_label}
                  placeholder="اسم المعيار"
                  aria-label={`اسم المعيار ${index + 1}`}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    updateScore(index, { criterion_label: event.target.value })
                  }
                />
                <div className="flex gap-2">
                  <Input
                    value={String(score.maximum_score)}
                    inputMode="decimal"
                    placeholder="الدرجة العظمى"
                    dir="ltr"
                    aria-label={`الدرجة العظمى للمعيار ${index + 1}`}
                    onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                      updateScore(index, { maximum_score: Number(event.target.value) })
                    }
                  />
                  <Input
                    value={String(score.awarded_score)}
                    inputMode="decimal"
                    placeholder="الدرجة الممنوحة"
                    dir="ltr"
                    aria-label={`الدرجة الممنوحة للمعيار ${index + 1}`}
                    onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                      updateScore(index, { awarded_score: Number(event.target.value) })
                    }
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => setScores((current) => [...current, emptyScore(current.length + 1)])}
            >
              إضافة معيار
            </Button>
            <Textarea
              value={comments}
              onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                setComments(event.target.value)
              }
              rows={2}
              placeholder="ملاحظات عامة (اختياري)"
              aria-label="ملاحظات عامة على التقييم"
            />
            <p className="text-sm">المجموع الكلي: {total}</p>
            {problems.length > 0 ? (
              <ul className="space-y-1" role="alert" data-testid="gp-evaluation-problems">
                {problems.map((problem) => (
                  <li key={problem} className="text-sm text-destructive">
                    {SCORE_PROBLEM_LABELS[problem]}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy || problems.length > 0}
                onClick={() =>
                  onSave(
                    discussionId,
                    scores,
                    comments.trim() === "" ? null : comments.trim(),
                    false,
                  )
                }
              >
                حفظ كمسودة
              </Button>
              <Button
                type="button"
                disabled={busy || problems.length > 0}
                onClick={() =>
                  onSave(
                    discussionId,
                    scores,
                    comments.trim() === "" ? null : comments.trim(),
                    true,
                  )
                }
              >
                إرسال التقييم
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
