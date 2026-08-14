import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Vote, Check, X, MinusCircle, Calculator, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  castCouncilVoteFn,
  openAgendaItemVoteFn,
  closeAgendaItemVoteFn,
  calculateAgendaItemResultFn,
  resolveAgendaItemFn,
  getCouncilVoteResultFn,
  getMyCouncilVoteFn,
} from "@/lib/councils-c4-c8.functions";
import {
  LIVE_SESSION_INTERVAL_MS,
  agendaSessionStatusLabel,
  liveQueryOptions,
  useLivePollInterval,
} from "@/lib/councils-live";

interface CouncilVotingControlProps {
  agendaItemId: string;
  sessionStatus: string; // 'pending' | 'in_discussion' | 'voting_open' | 'voting_closed' | 'resolved'
  isChair: boolean;
  isEligibleMember: boolean;
  resolutionText?: string | null;
  onStatusChanged?: () => void;
}

export function CouncilVotingControl({
  agendaItemId,
  sessionStatus,
  isChair,
  isEligibleMember,
  resolutionText,
  onStatusChanged,
}: CouncilVotingControlProps) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [localVote, setLocalVote] = useState<"yes" | "no" | "abstain" | null>(null);

  const isLiveItem =
    sessionStatus === "voting_open" ||
    sessionStatus === "in_discussion" ||
    sessionStatus === "voting_closed";
  const liveInterval = useLivePollInterval(isLiveItem, LIVE_SESSION_INTERVAL_MS);

  const voteResultQuery = useQuery({
    queryKey: ["council-vote-result", agendaItemId],
    queryFn: () => getCouncilVoteResultFn({ data: { agenda_item_id: agendaItemId } }),
    enabled: Boolean(agendaItemId) && (sessionStatus === "voting_closed" || sessionStatus === "resolved"),
    ...liveQueryOptions(sessionStatus === "voting_closed" ? liveInterval : false),
  });

  // Server-backed: the member's own vote, so it survives a reload and never
  // claims "not voted" when the database says otherwise.
  const myVoteQuery = useQuery({
    queryKey: ["council-my-vote", agendaItemId],
    queryFn: () => getMyCouncilVoteFn({ data: { agenda_item_id: agendaItemId } }),
    enabled: Boolean(agendaItemId) && isEligibleMember && sessionStatus === "voting_open",
    ...liveQueryOptions(liveInterval),
  });

  const serverVote = myVoteQuery.data?.vote_value ?? null;
  const userVote = serverVote ?? localVote;
  const voteStateUnknown =
    isEligibleMember &&
    sessionStatus === "voting_open" &&
    !localVote &&
    (myVoteQuery.isLoading || myVoteQuery.isError);


  async function handleOpenVote() {
    setLoading(true);
    try {
      await openAgendaItemVoteFn({ data: { agenda_item_id: agendaItemId } });
      toast.success("تم فتح باب التصويت على البند");
      qc.invalidateQueries();
      onStatusChanged?.();
    } catch (err: any) {
      toast.error(err.message || "تعذر فتح التصويت");
    } finally {
      setLoading(false);
    }
  }

  async function handleCastVote(val: "yes" | "no" | "abstain") {
    setLoading(true);
    try {
      await castCouncilVoteFn({ data: { agenda_item_id: agendaItemId, vote_value: val } });
      setLocalVote(val);
      toast.success("تم تسجيل صوتك بنجاح");
      qc.invalidateQueries();
      void myVoteQuery.refetch();

    } catch (err: any) {
      toast.error(err.message || "تعذر تسجيل الصوت");
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseVote() {
    setLoading(true);
    try {
      await closeAgendaItemVoteFn({ data: { agenda_item_id: agendaItemId } });
      toast.success("تم إغلاق التصويت");
      qc.invalidateQueries();
      onStatusChanged?.();
    } catch (err: any) {
      toast.error(err.message || "تعذر إغلاق التصويت");
    } finally {
      setLoading(false);
    }
  }

  async function handleCalculateResult() {
    setLoading(true);
    try {
      const res = await calculateAgendaItemResultFn({ data: { agenda_item_id: agendaItemId } });
      toast.success(`نتيجة التصويت: ${res.outcome} (موافق: ${res.yes_count} ، غير موافق: ${res.no_count})`);
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err.message || "تعذر احتساب النتيجة");
    } finally {
      setLoading(false);
    }
  }

  async function handleResolveItem() {
    setLoading(true);
    try {
      await resolveAgendaItemFn({
        data: { agenda_item_id: agendaItemId, resolution: "تم اعتماد البند حسب مجريات الجلسة" },
      });
      toast.success("تم اعتماد البند وإغلاق مناقشته");
      qc.invalidateQueries();
      onStatusChanged?.();
    } catch (err: any) {
      toast.error(err.message || "تعذر اعتماد البند");
    } finally {
      setLoading(false);
    }
  }

  const result = voteResultQuery.data;

  return (
    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3 dir-rtl text-right text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-200">
          <Vote className="w-4 h-4 text-indigo-600" />
          <span>حالة التصويت والمداولة:</span>
          <Badge variant="outline" className="text-indigo-600 dark:text-indigo-400">
            {sessionStatus}
          </Badge>
        </div>

        {/* Chair Controls */}
        {isChair && (
          <div className="flex items-center gap-1.5">
            {(sessionStatus === "pending" || sessionStatus === "in_discussion") && (
              <Button onClick={handleOpenVote} disabled={loading} size="sm" className="h-7 text-xs bg-indigo-600">
                فتح التصويت
              </Button>
            )}

            {sessionStatus === "voting_open" && (
              <Button onClick={handleCloseVote} disabled={loading} size="sm" variant="destructive" className="h-7 text-xs">
                إغلاق التصويت
              </Button>
            )}

            {sessionStatus === "voting_closed" && (
              <>
                <Button onClick={handleCalculateResult} disabled={loading} size="sm" variant="outline" className="h-7 text-xs">
                  <Calculator className="w-3 h-3 ml-1" />
                  احتساب النتيجة
                </Button>
                <Button onClick={handleResolveItem} disabled={loading} size="sm" className="h-7 text-xs bg-emerald-600">
                  <CheckCircle className="w-3 h-3 ml-1" />
                  اعتماد البند
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Member Live Voting Bar */}
      {sessionStatus === "voting_open" && isEligibleMember && (
        <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 rounded border border-indigo-200 dark:border-indigo-800 space-y-2">
          <p className="font-semibold text-indigo-900 dark:text-indigo-200">التصويت مفتوح حالياً — اختر صوتك:</p>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleCastVote("yes")}
              disabled={loading || Boolean(userVote)}
              size="sm"
              className={`flex-1 h-8 text-xs font-bold ${
                userVote === "yes" ? "bg-emerald-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"
              }`}
            >
              <Check className="w-3.5 h-3.5 ml-1" />
              موافق
            </Button>
            <Button
              onClick={() => handleCastVote("no")}
              disabled={loading || Boolean(userVote)}
              size="sm"
              className={`flex-1 h-8 text-xs font-bold ${
                userVote === "no" ? "bg-rose-700 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"
              }`}
            >
              <X className="w-3.5 h-3.5 ml-1" />
              غير موافق
            </Button>
            <Button
              onClick={() => handleCastVote("abstain")}
              disabled={loading || Boolean(userVote)}
              size="sm"
              variant="outline"
              className={`flex-1 h-8 text-xs font-bold ${userVote === "abstain" ? "bg-slate-200" : ""}`}
            >
              <MinusCircle className="w-3.5 h-3.5 ml-1" />
              امتناع
            </Button>
          </div>
          {userVote && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium" aria-live="polite">
              تم تسجيل صوتك: {userVote === "yes" ? "موافق" : userVote === "no" ? "غير موافق" : "امتناع"}.
            </p>
          )}
        </div>
      )}

      {/* Display Result Summary if Calculated */}
      {result && result.has_result && (
        <div className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
            <span>النتيجة المحتسبة: <span className="font-bold text-indigo-600 dark:text-indigo-400">{result.outcome}</span></span>
            <span>موافق: <strong className="text-emerald-600">{result.yes_count}</strong></span>
            <span>غير موافق: <strong className="text-rose-600">{result.no_count}</strong></span>
            <span>امتناع: <strong>{result.abstain_count}</strong></span>
          </div>
          <span className="text-[11px] text-slate-400">إجمالي الأصوات: {result.total_votes}</span>
        </div>
      )}

      {resolutionText && (
        <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 rounded text-[11px]">
          <strong>القرار والتوصية النهائية:</strong> {resolutionText}
        </div>
      )}
    </div>
  );
}
