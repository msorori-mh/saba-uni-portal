import { useState, type ChangeEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CorrectionInput, ResultOutcome } from "../../lib/graduation-projects/rpc";
import {
  CORRECTION_STATUS_LABELS,
  correctionStatus,
  isCorrectionOverdue,
  type ArchiveRow,
  type CorrectionRow,
  type LifecycleAction,
  type ProjectDetailProject,
} from "../../lib/graduation-projects/lifecycle";

export interface ResultCorrectionsArchivePanelProps {
  project: ProjectDetailProject;
  actions: LifecycleAction[];
  corrections: CorrectionRow[];
  archive: ArchiveRow | null;
  busy?: boolean;
  onConclude(outcome: ResultOutcome, corrections: CorrectionInput[]): void;
  onCompleteCorrection(correctionId: string): void;
  onAcceptCorrection(correctionId: string): void;
}

export function ResultCorrectionsArchivePanel({ project, actions, corrections, archive, busy = false, onConclude, onCompleteCorrection, onAcceptCorrection }: ResultCorrectionsArchivePanelProps) {
  const [correctionText, setCorrectionText] = useState("");
  const [correctionDue, setCorrectionDue] = useState("");
  const canConclude = actions.includes("conclude_result");
  const canComplete = actions.includes("complete_correction");
  const canAccept = actions.includes("accept_correction");
  const canArchive = actions.includes("archive");
  return (
    <div dir="rtl" className="space-y-4">
      {canConclude ? (
        <Card>
          <CardHeader>
            <CardTitle>اعتماد النتيجة</CardTitle>
            <CardDescription>يتطلب اعتماد جميع التقييمات أولاً.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={correctionText} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCorrectionText(event.target.value)} rows={2}
              placeholder="وصف التصحيح المطلوب (عند اختيار تصحيحات)" />
            <Input value={correctionDue} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setCorrectionDue(event.target.value)}
              placeholder="موعد استحقاق التصحيح (اختياري)" dir="ltr" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => onConclude("completed", [])}>
                اعتماد النتيجة (مكتمل)
              </Button>
              <Button type="button" variant="secondary" disabled={busy || correctionText.trim() === ""}
                onClick={() => onConclude("corrections_required", [{
                  description: correctionText.trim(),
                  due_at: correctionDue.trim() === "" ? null : correctionDue.trim(),
                }])}>
                طلب تصحيحات
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>التصحيحات</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {corrections.map((correction) => {
              const status = correctionStatus(correction);
              return (
                <li key={correction.id} className="flex flex-wrap items-center gap-2 border-b pb-2">
                  <span className="text-sm">{correction.description}</span>
                  <Badge variant={status === "pending" ? "destructive" : "secondary"}>{CORRECTION_STATUS_LABELS[status]}</Badge>
                  {isCorrectionOverdue(correction) ? <Badge variant="destructive">متأخر</Badge> : null}
                  {status === "pending" && canComplete ? (
                    <Button type="button" size="sm" disabled={busy} onClick={() => onCompleteCorrection(correction.id)}>
                      إتمام التصحيح
                    </Button>
                  ) : null}
                  {status === "completed" && canAccept ? (
                    <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onAcceptCorrection(correction.id)}>
                      قبول التصحيح
                    </Button>
                  ) : null}
                </li>
              );
            })}
            {corrections.length === 0 ? <li>لا توجد تصحيحات.</li> : null}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>الأرشفة</CardTitle>
          <CardDescription>النسخة النهائية للمشروع: {project.version}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {archive ? (
            <div className="space-y-1 text-sm">
              <p>أُرشف بتاريخ {archive.archived_at}</p>
              <p>الملف النهائي: {archive.final_file_name}</p>
              <p>{archive.final_file_object_key ? `المفتاح: ${archive.final_file_object_key}` : "مفتاح الملف النهائي محجوب حتى الفحص."}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {canArchive
                ? "الأرشفة متاحة عند اكتمال المشروع مع ملف نهائي سليم الفحص وتصحيحات مقبولة."
                : "لم تتم الأرشفة بعد."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
