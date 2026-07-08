import { useRef, useState } from "react";

import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, Wallet } from "lucide-react";

import { useServerFn } from "@tanstack/react-start";

import {

  prepareStudentRequestFinanceClearanceAction,

  prepareStudentRequestParallelClearance,

} from "@/lib/student-requests/staff-inbox.functions";

import {

  FINANCE_CLEARANCE_DRY_RUN_SUCCESS_MSG,

  FINANCE_CLEARANCE_EXECUTION_UNAVAILABLE_MSG,

  getFinanceRequirementForRequestType,

  STUDENT_AFFAIRS_AMOUNT_SET_MSG,

  STUDENT_AMOUNT_DISPLAY_MSG,

  type FinanceClearanceDryRunResult,

} from "@/lib/student-requests/request-finance-clearance-contract";

import {

  CLEARANCE_DRY_RUN_SUCCESS_MSG,

  CLEARANCE_EXECUTION_UNAVAILABLE_MSG,

  FILE_WITHDRAWAL_CLEARANCE_MEMBERS,

  getParallelClearanceRequirementForRequestType,

  type StudentRequestClearanceDryRunResult,

} from "@/lib/student-requests/parallel-clearance-contract";



type FinanceMode = "set_amount" | "confirm_receipt";



function DryRunResultPanel({

  result,

}: {

  result: FinanceClearanceDryRunResult | StudentRequestClearanceDryRunResult;

}) {

  return (

    <div className="space-y-2 border rounded-lg p-2.5 bg-muted/20 text-xs">

      <div className="flex items-center gap-2">

        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />

        <span className="font-bold">{result.status}</span>

        <span className="text-muted-foreground">— {result.summaryAr}</span>

      </div>

      {"groupComplete" in result && (

        <div className="text-muted-foreground">

          اكتمال المجموعة: {result.groupComplete ? "نعم" : "لا"}

        </div>

      )}

      {"amountYer" in result && result.amountYer != null && (

        <div className="text-muted-foreground">

          المبلغ (YER): {result.amountYer.toLocaleString("ar-YE")}

        </div>

      )}

      {"financeStatus" in result && (

        <div className="text-muted-foreground">حالة المالية (نظرية): {result.financeStatus}</div>

      )}

      {result.issues.length > 0 && (

        <ul className="space-y-0.5 max-h-36 overflow-y-auto">

          {result.issues.map((issue, idx) => (

            <li

              key={`${issue.code}-${idx}`}

              className={

                issue.severity === "error"

                  ? "text-destructive"

                  : issue.severity === "warning"

                    ? "text-amber-800"

                    : "text-muted-foreground"

              }

            >

              {issue.messageAr}

            </li>

          ))}

        </ul>

      )}

    </div>

  );

}



export function StaffRequestFinanceClearancePanel({

  requestId,

  requestTypeCode,

}: {

  requestId: string;

  requestTypeCode: string;

}) {

  const financeDryRunFn = useServerFn(prepareStudentRequestFinanceClearanceAction);

  const clearanceDryRunFn = useServerFn(prepareStudentRequestParallelClearance);



  const [financeMode, setFinanceMode] = useState<FinanceMode>("set_amount");

  const [amount, setAmount] = useState("");

  const [financeNote, setFinanceNote] = useState("");

  const [revenueNote, setRevenueNote] = useState("");



  const [clearanceMemberKey, setClearanceMemberKey] = useState("finance");

  const [clearanceAction, setClearanceAction] = useState<"clear" | "waive" | "reject" | "block">(

    "clear",

  );

  const [clearanceNote, setClearanceNote] = useState("");



  const [financeLoading, setFinanceLoading] = useState(false);

  const [clearanceLoading, setClearanceLoading] = useState(false);

  const [financeResult, setFinanceResult] = useState<FinanceClearanceDryRunResult | null>(null);

  const [clearanceGroupResult, setClearanceGroupResult] =

    useState<StudentRequestClearanceDryRunResult | null>(null);

  const [clearanceMemberResult, setClearanceMemberResult] =

    useState<StudentRequestClearanceDryRunResult | null>(null);

  const [financeError, setFinanceError] = useState<string | null>(null);

  const [clearanceError, setClearanceError] = useState<string | null>(null);



  const financeInFlightRef = useRef(false);

  const clearanceInFlightRef = useRef(false);



  const financeReq = getFinanceRequirementForRequestType(requestTypeCode);

  const clearanceReq = getParallelClearanceRequirementForRequestType(requestTypeCode);



  const handleFinanceValidate = async () => {

    if (financeInFlightRef.current || financeLoading) return;

    financeInFlightRef.current = true;

    setFinanceLoading(true);

    setFinanceError(null);

    setFinanceResult(null);



    try {

      const parsedAmount = amount.trim() ? Number(amount.trim()) : null;

      const result = await financeDryRunFn({

        data: {

          requestId,

          requestTypeCode,

          action:

            financeMode === "set_amount"

              ? "set_student_affairs_amount"

              : "confirm_revenue_received",

          amount: financeMode === "set_amount" ? parsedAmount : undefined,

          note:

            financeMode === "set_amount"

              ? financeNote.trim() || null

              : revenueNote.trim() || null,

        },

      });

      setFinanceResult(result);

    } catch (e) {

      setFinanceError((e as Error).message);

    } finally {

      financeInFlightRef.current = false;

      setFinanceLoading(false);

    }

  };



  const handleClearanceGroupValidate = async () => {

    if (clearanceInFlightRef.current || clearanceLoading) return;

    clearanceInFlightRef.current = true;

    setClearanceLoading(true);

    setClearanceError(null);

    setClearanceGroupResult(null);



    try {

      const result = await clearanceDryRunFn({

        data: {

          requestId,

          requestTypeCode,

          mode: "validate_group",

        },

      });

      setClearanceGroupResult(result);

    } catch (e) {

      setClearanceError((e as Error).message);

    } finally {

      clearanceInFlightRef.current = false;

      setClearanceLoading(false);

    }

  };



  const handleClearanceMemberValidate = async () => {

    if (clearanceInFlightRef.current || clearanceLoading) return;

    clearanceInFlightRef.current = true;

    setClearanceLoading(true);

    setClearanceError(null);

    setClearanceMemberResult(null);



    try {

      const result = await clearanceDryRunFn({

        data: {

          requestId,

          requestTypeCode,

          mode: "member_action",

          memberKey: clearanceMemberKey,

          action: clearanceAction,

          note: clearanceNote.trim() || null,

        },

      });

      setClearanceMemberResult(result);

    } catch (e) {

      setClearanceError((e as Error).message);

    } finally {

      clearanceInFlightRef.current = false;

      setClearanceLoading(false);

    }

  };



  return (

    <div className="space-y-4">

      {financeReq.financeRequired && (

        <div className="rounded-lg border bg-card p-3 space-y-3">

          <div className="text-xs font-bold text-primary flex items-center gap-1.5">

            <Wallet className="h-3.5 w-3.5" /> المبلغ وتأكيد الاستلام

          </div>



          <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">

            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />

            <span>{FINANCE_CLEARANCE_EXECUTION_UNAVAILABLE_MSG}</span>

          </div>



          <p className="text-[11px] text-muted-foreground">{STUDENT_AFFAIRS_AMOUNT_SET_MSG}</p>

          <p className="text-[11px] text-muted-foreground">{STUDENT_AMOUNT_DISPLAY_MSG}</p>



          <div className="flex flex-wrap gap-2">

            {(

              [

                ["set_amount", "تحديد المبلغ المطلوب سداده"],

                ["confirm_receipt", "تأكيد استلام المبلغ"],

              ] as const

            ).map(([mode, label]) => (

              <button

                key={mode}

                type="button"

                onClick={() => {

                  setFinanceMode(mode);

                  setFinanceResult(null);

                }}

                className={`text-xs font-bold px-3 py-2 rounded border ${

                  financeMode === mode ? "ring-2 ring-primary ring-offset-1 bg-secondary" : "bg-background"

                }`}

              >

                {label}

              </button>

            ))}

          </div>



          {financeMode === "set_amount" && (

            <div className="space-y-2">

              <div>

                <label className="text-[11px] font-bold text-muted-foreground block mb-1">

                  المبلغ المطلوب سداده (YER — يُحدَّد يدوياً)

                </label>

                <input

                  type="number"

                  min="1"

                  step="1"

                  value={amount}

                  onChange={(e) => setAmount(e.target.value)}

                  className="w-full rounded border bg-background px-2 py-1.5 text-xs"

                  placeholder="5000"

                />

              </div>

              <div>

                <label className="text-[11px] font-bold text-muted-foreground block mb-1">

                  ملاحظة (اختياري)

                </label>

                <textarea

                  value={financeNote}

                  onChange={(e) => setFinanceNote(e.target.value)}

                  rows={2}

                  className="w-full rounded border bg-background px-2 py-1.5 text-xs"

                  placeholder="ملاحظات شؤون الطلاب..."

                />

              </div>

            </div>

          )}



          {financeMode === "confirm_receipt" && (

            <div className="space-y-2">

              <div className="text-[11px] font-bold text-muted-foreground">

                المبلغ المطلوب استلامه — يُؤكَّد الاستلام فقط (لا تعديل للمبلغ)

              </div>

              <textarea

                value={revenueNote}

                onChange={(e) => setRevenueNote(e.target.value)}

                rows={2}

                className="w-full rounded border bg-background px-2 py-1.5 text-xs"

                placeholder="ملاحظة مسؤول الإيرادات..."

              />

            </div>

          )}



          <div className="flex flex-wrap gap-2 border-t pt-3">

            <button

              type="button"

              disabled={financeLoading}

              onClick={handleFinanceValidate}

              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded bg-secondary text-secondary-foreground disabled:opacity-50"

            >

              {financeLoading ? (

                <Loader2 className="h-3.5 w-3.5 animate-spin" />

              ) : (

                <ShieldCheck className="h-3.5 w-3.5" />

              )}

              {financeMode === "set_amount" ? "التحقق من تحديد المبلغ" : "التحقق من تأكيد الاستلام"}

            </button>

            <button

              type="button"

              disabled

              title={FINANCE_CLEARANCE_EXECUTION_UNAVAILABLE_MSG}

              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded bg-primary text-primary-foreground opacity-50 cursor-not-allowed"

            >

              {financeMode === "set_amount" ? "حفظ المبلغ" : "تأكيد استلام المبلغ"}

            </button>

          </div>



          <p className="text-[11px] text-muted-foreground">{FINANCE_CLEARANCE_DRY_RUN_SUCCESS_MSG}</p>



          {financeError && (

            <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{financeError}</p>

          )}

          {financeResult && <DryRunResultPanel result={financeResult} />}

        </div>

      )}



      {clearanceReq.parallelClearanceRequired && (

        <div className="rounded-lg border bg-card p-3 space-y-3">

          <div className="text-xs font-bold text-primary">إخلاء طرف متوازي</div>



          <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">

            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />

            <span>{CLEARANCE_EXECUTION_UNAVAILABLE_MSG}</span>

          </div>



          <div className="text-[11px] text-muted-foreground">

            الأعضاء المتوقعون ({clearanceReq.expectedMemberCount}):{" "}

            {FILE_WITHDRAWAL_CLEARANCE_MEMBERS.map((m) => m.labelAr).join("، ")}

          </div>



          <div className="flex flex-wrap gap-2 border-t pt-3">

            <button

              type="button"

              disabled={clearanceLoading}

              onClick={handleClearanceGroupValidate}

              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded bg-secondary text-secondary-foreground disabled:opacity-50"

            >

              {clearanceLoading ? (

                <Loader2 className="h-3.5 w-3.5 animate-spin" />

              ) : (

                <ShieldCheck className="h-3.5 w-3.5" />

              )}

              التحقق من المجموعة

            </button>

            <button

              type="button"

              disabled

              title={CLEARANCE_EXECUTION_UNAVAILABLE_MSG}

              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded bg-primary text-primary-foreground opacity-50 cursor-not-allowed"

            >

              تنفيذ إخلاء الطرف

            </button>

          </div>



          <div className="border-t pt-3 space-y-2">

            <div className="text-[11px] font-bold text-muted-foreground">إجراء على عضو واحد</div>

            <div className="flex flex-wrap gap-2">

              {FILE_WITHDRAWAL_CLEARANCE_MEMBERS.map((m) => (

                <button

                  key={m.memberKey}

                  type="button"

                  onClick={() => setClearanceMemberKey(m.memberKey)}

                  className={`text-xs px-2 py-1 rounded border ${

                    clearanceMemberKey === m.memberKey ? "bg-secondary font-bold" : ""

                  }`}

                >

                  {m.labelAr}

                </button>

              ))}

            </div>

            <div className="flex flex-wrap gap-2">

              {(["clear", "waive", "reject", "block"] as const).map((a) => (

                <button

                  key={a}

                  type="button"

                  onClick={() => setClearanceAction(a)}

                  className={`text-xs px-2 py-1 rounded border ${

                    clearanceAction === a ? "bg-secondary font-bold" : ""

                  }`}

                >

                  {a}

                </button>

              ))}

            </div>

            <textarea

              value={clearanceNote}

              onChange={(e) => setClearanceNote(e.target.value)}

              rows={2}

              className="w-full rounded border bg-background px-2 py-1.5 text-xs"

              placeholder="ملاحظة العضو..."

            />

            <button

              type="button"

              disabled={clearanceLoading}

              onClick={handleClearanceMemberValidate}

              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded border disabled:opacity-50"

            >

              التحقق من إجراء العضو

            </button>

          </div>



          <p className="text-[11px] text-muted-foreground">{CLEARANCE_DRY_RUN_SUCCESS_MSG}</p>



          {clearanceError && (

            <p className="text-xs text-destructive bg-destructive/10 rounded p-2">

              {clearanceError}

            </p>

          )}

          {clearanceGroupResult && <DryRunResultPanel result={clearanceGroupResult} />}

          {clearanceMemberResult && <DryRunResultPanel result={clearanceMemberResult} />}

        </div>

      )}



      {!financeReq.financeRequired && !clearanceReq.parallelClearanceRequired && (

        <div className="text-xs text-muted-foreground border border-dashed rounded p-3">

          هذا النوع لا يتطلب مبلغاً ولا إخلاء طرف متوازي في المرحلة الحالية.

        </div>

      )}

    </div>

  );

}

