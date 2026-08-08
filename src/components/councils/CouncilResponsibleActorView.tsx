import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  UserCheck,
  CalendarClock,
  Loader2,
  CheckCircle2,
  FileText,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getCouncilResponsibleDecisionsFn,
} from "@/lib/councils-c9.functions";
import {
  completeCouncilDecisionFn,
  updateCouncilDecisionFollowupFn,
} from "@/lib/councils-c4-c8.functions";

interface CouncilResponsibleActorViewProps {
  userId: string;
}

const STATUS_LABELS: Record<string, string> = {
  issued: "صادر",
  in_progress: "قيد التنفيذ",
  completed: "مكتمل",
  blocked: "معطّل",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar", {
      dateStyle: "medium",
    });
  } catch {
    return iso;
  }
}

export function CouncilResponsibleActorView({ userId }: CouncilResponsibleActorViewProps) {
  const qc = useQueryClient();
  const fetchDecisions = useServerFn(getCouncilResponsibleDecisionsFn);
  const updateFollowup = useServerFn(updateCouncilDecisionFollowupFn);
  const completeDecision = useServerFn(completeCouncilDecisionFn);

  const query = useQuery({
    queryKey: ["council-responsible-decisions", userId],
    queryFn: () => fetchDecisions({ data: {} }),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const [selected, setSelected] = useState<any>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const decisions = (query.data ?? []) as Array<{
    decision_id: string;
    canonical_number: string;
    title: string;
    body: string;
    status: string;
    due_date: string;
    execution_note: string | null;
    evidence_metadata: any;
    council_name: string;
  }>;

  async function handleSaveProgress(complete = false) {
    if (!selected) return;
    setBusy(true);
    try {
      if (complete) {
        await completeDecision({
          data: {
            decision_id: selected.decision_id,
            execution_note: note,
            evidence_metadata: { note },
          },
        });
        toast.success("تم إكمال القرار بنجاح");
      } else {
        await updateFollowup({
          data: {
            decision_id: selected.decision_id,
            status: "in_progress",
            execution_note: note,
            evidence_metadata: { note },
          },
        });
        toast.success("تم تحديث مجريات التنفيذ");
      }
      setSelected(null);
      setNote("");
      void qc.invalidateQueries({ queryKey: ["council-responsible-decisions", userId] });
    } catch (err: any) {
      toast.error(err?.message || "تعذر حفظ التحديث");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <UserCheck className="h-5 w-5 text-primary" />
        <h2 className="font-bold text-primary">قراراتي المكلف بتنفيذها</h2>
      </div>

      {query.isLoading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : query.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          تعذر تحميل القرارات المكلفة.
        </div>
      ) : decisions.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          لا توجد قرارات موجهة لك للتنفيذ حالياً.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {decisions.map((d) => {
            const isOverdue = d.status !== "completed" && new Date(d.due_date) < new Date();
            return (
              <Card key={d.decision_id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {d.title}
                    </CardTitle>
                    <Badge variant={d.status === "completed" ? "secondary" : "outline"}>
                      {statusLabel(d.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-3">{d.body}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    موعد التنفيذ: {formatDateTime(d.due_date)}
                    {isOverdue ? (
                      <span className="inline-flex items-center gap-1 text-destructive font-bold">
                        <AlertCircle className="h-3.5 w-3.5" />
                        متأخر
                      </span>
                    ) : null}
                  </div>
                  {d.execution_note ? (
                    <div className="rounded-md bg-muted/30 p-2 text-xs">
                      <span className="font-bold">آخر تحديث:</span> {d.execution_note}
                    </div>
                  ) : null}
                  {d.status !== "completed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setSelected(d);
                        setNote(d.execution_note ?? "");
                      }}
                    >
                      تحديث التقدم
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={() => !busy && setSelected(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تحديث مجريات التنفيذ</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="space-y-3 py-2">
              <p className="text-sm font-bold">{selected.title}</p>
              <p className="text-xs text-muted-foreground">
                الموعد: {formatDateTime(selected.due_date)}
              </p>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="اكتب مستجدات التنفيذ والوثائق والملاحظات..."
                rows={4}
                dir="rtl"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => void handleSaveProgress(false)}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ التقدم"}
                </Button>
                <Button
                  className="flex-1"
                  disabled={busy}
                  onClick={() => void handleSaveProgress(true)}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  إكمال
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
