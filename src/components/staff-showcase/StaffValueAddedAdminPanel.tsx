/**
 * PORTAL_STAFF_SELF_SERVICE_VALUE_ADDED_02E
 * Administrative workbench for the value-added modules.
 *
 * Two hard rules:
 *  - Every query and every action is driven by an explicit capability boolean;
 *    a role never runs a query it is not entitled to (Finance, for example,
 *    never queries the overtime claim queue or the clearance case list).
 *  - The client renders only what the database returned; authority lives in
 *    RLS and SECURITY DEFINER RPCs, never in this file.
 */

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import {
  Award,
  Banknote,
  CalendarClock,
  FileBadge,
  History,
  Loader2,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  CHECKPOINT_KIND_AR,
  RATING_BAND_AR,
  STAFF_VALUE_ADDED_NO_CAPABILITIES,
  completeClearanceCase,
  completeTrainingEnrollment,
  decideClearanceCheckpoint,
  decideOvertimeClaim,
  decideTrainingEnrollment,
  fetchAssignedClearanceCheckpoints,
  fetchStaffAttendanceMonthReport,
  fetchStaffClearanceCases,
  fetchStaffClearanceCheckpoints,
  fetchStaffEvaluations,
  fetchStaffIssuedDocuments,
  fetchStaffOvertimeClaims,
  fetchStaffOvertimeFinancialImpact,
  fetchStaffPerformanceCycles,
  fetchStaffPromotionCases,
  fetchStaffPromotionFinancialImpact,
  fetchStaffTrainingEnrollments,
  fetchStaffValueAddedAuditEvents,
  fetchStaffValueAddedCapabilities,
  finalizeEvaluation,
  issueStaffDocument,
  openClearanceCase,
  openPromotionCase,
  revokeStaffDocument,
  updatePromotionCase,
  upsertEvaluationDraft,
} from "@/lib/staff-self-service-value-added";

export const STAFF_VALUE_ADDED_ADMIN_UI_MARKER =
  "PORTAL_STAFF_SELF_SERVICE_VALUE_ADDED_02E";

function money(value: number, currency = "YER") {
  return `${new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    numberingSystem: "latn",
  }).format(value)} ${currency}`;
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone: "UTC",
  }).format(parsed);
}

const PROMOTION_STATUS_AR: Record<string, string> = {
  under_study: "قيد الدراسة",
  hr_review: "مراجعة الموارد البشرية",
  approved: "معتمدة",
  rejected: "مرفوضة",
  implemented: "منفذة",
};

const NEXT_PROMOTION_STATUS: Record<
  string,
  readonly ("hr_review" | "approved" | "rejected" | "implemented")[]
> = {
  under_study: ["hr_review", "rejected"],
  hr_review: ["approved", "rejected"],
  approved: ["implemented"],
};

function Section({
  title,
  icon,
  testId,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section
      dir="rtl"
      data-testid={testId}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

export function StaffValueAddedAdminPanel() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    referenceNo: string;
    token: string;
  } | null>(null);

  const capabilitiesQuery = useQuery({
    queryKey: ["staff-02e", "capabilities"],
    queryFn: fetchStaffValueAddedCapabilities,
  });
  const capabilities =
    capabilitiesQuery.data ?? STAFF_VALUE_ADDED_NO_CAPABILITIES;

  const documents = useQuery({
    queryKey: ["staff-02e", "wb-documents"],
    queryFn: fetchStaffIssuedDocuments,
    enabled: capabilities.can_issue_documents,
  });
  const cycles = useQuery({
    queryKey: ["staff-02e", "wb-cycles"],
    queryFn: fetchStaffPerformanceCycles,
    enabled: capabilities.can_manage_evaluations,
  });
  const evaluations = useQuery({
    queryKey: ["staff-02e", "wb-evaluations"],
    queryFn: fetchStaffEvaluations,
    enabled: capabilities.can_manage_evaluations,
  });
  // Finance is excluded by capability: it never runs the claim-queue query.
  const claims = useQuery({
    queryKey: ["staff-02e", "wb-overtime"],
    queryFn: fetchStaffOvertimeClaims,
    enabled: capabilities.can_view_overtime_queue,
  });
  const overtimeMoney = useQuery({
    queryKey: ["staff-02e", "wb-overtime-money"],
    queryFn: fetchStaffOvertimeFinancialImpact,
    enabled: capabilities.can_view_financial_impact,
  });
  const promotionMoney = useQuery({
    queryKey: ["staff-02e", "wb-promotion-money"],
    queryFn: fetchStaffPromotionFinancialImpact,
    enabled: capabilities.can_view_financial_impact,
  });
  const promotionCases = useQuery({
    queryKey: ["staff-02e", "wb-promotions"],
    queryFn: fetchStaffPromotionCases,
    enabled: capabilities.can_manage_promotions,
  });
  const enrollments = useQuery({
    queryKey: ["staff-02e", "wb-training"],
    queryFn: fetchStaffTrainingEnrollments,
    enabled: capabilities.can_manage_training,
  });
  const clearanceCases = useQuery({
    queryKey: ["staff-02e", "wb-clearance"],
    queryFn: fetchStaffClearanceCases,
    enabled: capabilities.can_view_clearance_cases,
  });
  const checkpoints = useQuery({
    queryKey: ["staff-02e", "wb-checkpoints"],
    queryFn: fetchStaffClearanceCheckpoints,
    enabled: capabilities.can_view_clearance_cases,
  });
  // Narrow, checkpoint-owner-only surface — the only clearance data Finance reads.
  const assignedCheckpoints = useQuery({
    queryKey: ["staff-02e", "wb-assigned-checkpoints"],
    queryFn: fetchAssignedClearanceCheckpoints,
    enabled: capabilities.can_decide_clearance,
  });
  const audit = useQuery({
    queryKey: ["staff-02e", "wb-audit"],
    queryFn: () => fetchStaffValueAddedAuditEvents(60),
    enabled: capabilities.can_view_audit_scope,
  });

  async function run(action: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice(ok);
      await queryClient.invalidateQueries({ queryKey: ["staff-02e"] });
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "تعذر إكمال العملية بأمان.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (capabilitiesQuery.isLoading) {
    return (
      <div dir="rtl" className="flex items-center gap-2 p-4 text-xs">
        <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحقق من الصلاحيات…
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      data-testid="staff-02e-admin-panel"
      className="grid gap-4 lg:grid-cols-2"
    >
      {notice && (
        <p className="lg:col-span-2 rounded-md bg-muted p-2 text-xs">{notice}</p>
      )}

      <Section
        title="إصدار الإفادات والشهادات"
        icon={<FileBadge className="h-4 w-4" />}
        testId="staff-02e-wb-documents"
      >
        {!capabilities.can_issue_documents ? (
          <p
            data-testid="staff-02e-wb-documents-empty"
            className="text-xs text-muted-foreground"
          >
            لا تملك صلاحية إصدار الوثائق الرسمية.
          </p>
        ) : (
          <>
            <IssueDocumentForm
              busy={busy}
              onIssue={async (requestId, validDays) => {
                await run(async () => {
                  const result = await issueStaffDocument({
                    requestId,
                    validDays,
                  });
                  setIssued({
                    referenceNo: result.reference_no,
                    token: result.verification_token,
                  });
                }, "تم إصدار الوثيقة وإنشاء رمز التحقق.");
              }}
            />
            {issued && (
              <IssuedDocumentQr
                referenceNo={issued.referenceNo}
                token={issued.token}
                onDismiss={() => setIssued(null)}
              />
            )}
            <ul className="mt-3 space-y-1 text-xs">
              {(documents.data ?? []).map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1"
                >
                  <span>
                    {doc.reference_no} — {dateLabel(doc.issued_at)}
                  </span>
                  {doc.status === "issued" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const reason = window.prompt("سبب إلغاء الوثيقة");
                        if (!reason?.trim()) return;
                        void run(
                          () =>
                            revokeStaffDocument({
                              documentId: doc.id,
                              reason,
                            }),
                          "تم إلغاء الوثيقة.",
                        );
                      }}
                      className="rounded bg-destructive px-2 py-0.5 text-[11px] text-destructive-foreground disabled:opacity-60"
                    >
                      إلغاء
                    </button>
                  ) : (
                    <span className="text-destructive">ملغاة</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section
        title="تحرير واعتماد تقييمات الأداء"
        icon={<Award className="h-4 w-4" />}
        testId="staff-02e-wb-evaluations"
      >
        {!capabilities.can_manage_evaluations ? (
          <p
            data-testid="staff-02e-wb-evaluations-empty"
            className="text-xs text-muted-foreground"
          >
            لا تملك صلاحية إدارة تقييمات الأداء.
          </p>
        ) : (
          <>
            <EvaluationDraftForm
              busy={busy}
              cycles={(cycles.data ?? [])
                .filter((cycle) => cycle.status === "open")
                .map((cycle) => ({ id: cycle.id, label: cycle.title_ar }))}
              onSave={(input) =>
                run(
                  () => upsertEvaluationDraft(input),
                  "تم حفظ مسودة التقييم.",
                )
              }
            />
            <ul className="mt-3 space-y-1 text-xs">
              {(evaluations.data ?? []).map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1"
                >
                  <span>
                    {item.rating_band
                      ? (RATING_BAND_AR[item.rating_band] ?? item.rating_band)
                      : "—"}{" "}
                    — {item.overall_rating ?? "—"}
                  </span>
                  {item.status === "draft" ? (
                    <button
                      type="button"
                      data-testid="staff-02e-finalize-evaluation"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => finalizeEvaluation(item.id),
                          "تم اعتماد التقييم.",
                        )
                      }
                      className="rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground disabled:opacity-60"
                    >
                      اعتماد
                    </button>
                  ) : (
                    <span className="text-muted-foreground">معتمد</span>
                  )}
                </li>
              ))}
              {(evaluations.data ?? []).length === 0 && (
                <li className="text-muted-foreground">
                  لا توجد تقييمات ضمن نطاقك.
                </li>
              )}
            </ul>
          </>
        )}
      </Section>

      <Section
        title="التكليفات والعمل الإضافي"
        icon={<History className="h-4 w-4" />}
        testId="staff-02e-wb-overtime"
      >
        {!capabilities.can_view_overtime_queue ? (
          <p
            data-testid="staff-02e-wb-overtime-empty"
            className="text-xs text-muted-foreground"
          >
            لا تملك صلاحية معالجة طلبات التكليف.
          </p>
        ) : (
          <ul className="space-y-1 text-xs">
            {(claims.data ?? []).map((claim) => (
              <li
                key={claim.id}
                className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1"
              >
                <span>
                  {claim.claim_no} — {claim.total_hours} ساعة
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          decideOvertimeClaim({
                            claimId: claim.id,
                            decision: "approved",
                          }),
                        "تم اعتماد الطلب.",
                      )
                    }
                    className="rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground disabled:opacity-60"
                  >
                    اعتماد
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const reason = window.prompt("سبب الرفض");
                      if (!reason?.trim()) return;
                      void run(
                        () =>
                          decideOvertimeClaim({
                            claimId: claim.id,
                            decision: "rejected",
                            reason,
                          }),
                        "تم رفض الطلب.",
                      );
                    }}
                    className="rounded border border-border px-2 py-0.5 text-[11px] disabled:opacity-60"
                  >
                    رفض
                  </button>
                </span>
              </li>
            ))}
            {(claims.data ?? []).length === 0 && (
              <li className="text-muted-foreground">لا توجد طلبات ضمن نطاقك.</li>
            )}
          </ul>
        )}
      </Section>

      <Section
        title="الأثر المالي (الشؤون المالية فقط)"
        icon={<Banknote className="h-4 w-4" />}
        testId="staff-02e-wb-financial"
      >
        {!capabilities.can_view_financial_impact ? (
          <p
            data-testid="staff-02e-wb-financial-empty"
            className="text-xs text-muted-foreground"
          >
            لا تملك صلاحية الاطلاع على الأثر المالي.
          </p>
        ) : (
          <div className="space-y-2 text-xs">
            <ul className="space-y-1">
              {(overtimeMoney.data ?? []).map((row) => (
                <li
                  key={row.claim_id}
                  className="flex items-center justify-between rounded border border-border px-2 py-1"
                >
                  <span>
                    {row.claim_no} — {money(row.gross_amount, row.currency_code)}
                  </span>
                  <span className="text-muted-foreground">
                    {row.financial_status === "approved_for_settlement"
                      ? row.settled_at
                        ? "مُسوّى"
                        : "جاهز للصرف"
                      : "غير قابل للصرف"}
                  </span>
                </li>
              ))}
            </ul>
            <ul className="space-y-1">
              {(promotionMoney.data ?? []).map((row) => (
                <li
                  key={row.case_id}
                  className="flex items-center justify-between rounded border border-border px-2 py-1"
                >
                  <span>
                    {row.case_no} — {money(row.current_basic, row.currency_code)}{" "}
                    ← {money(row.proposed_basic, row.currency_code)}
                  </span>
                  <span className="text-muted-foreground">
                    أثر رجعي {money(row.retroactive_amount, row.currency_code)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground">
              هذه الشاشة تعرض القيم المالية فقط؛ أسباب الطلبات وقرارات المسار
              الإداري غير متاحة للشؤون المالية.
            </p>
          </div>
        )}
      </Section>

      <Section
        title="طلبات التدريب"
        icon={<Users className="h-4 w-4" />}
        testId="staff-02e-wb-training"
      >
        {!capabilities.can_manage_training ? (
          <p
            data-testid="staff-02e-wb-training-empty"
            className="text-xs text-muted-foreground"
          >
            لا تملك صلاحية إدارة طلبات التدريب.
          </p>
        ) : (
          <ul className="space-y-1 text-xs">
            {(enrollments.data ?? []).map((row) => (
              <li
                key={row.id}
                className="rounded border border-border px-2 py-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{row.status}</span>
                  {row.status === "requested" && (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              decideTrainingEnrollment({
                                enrollmentId: row.id,
                                decision: "approved",
                              }),
                            "تم اعتماد الالتحاق.",
                          )
                        }
                        className="rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground disabled:opacity-60"
                      >
                        اعتماد
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const reason = window.prompt("سبب الرفض");
                          if (!reason?.trim()) return;
                          void run(
                            () =>
                              decideTrainingEnrollment({
                                enrollmentId: row.id,
                                decision: "rejected",
                                reason,
                              }),
                            "تم رفض الطلب.",
                          );
                        }}
                        className="rounded border border-border px-2 py-0.5 text-[11px] disabled:opacity-60"
                      >
                        رفض
                      </button>
                    </span>
                  )}
                </div>
                {row.status === "approved" && (
                  <TrainingCompletionForm
                    busy={busy}
                    onComplete={(certificate) =>
                      run(
                        () =>
                          completeTrainingEnrollment({
                            enrollmentId: row.id,
                            certificate,
                          }),
                        "تم تسجيل إتمام الدورة وبيانات الشهادة.",
                      )
                    }
                  />
                )}
              </li>
            ))}
            {(enrollments.data ?? []).length === 0 && (
              <li className="text-muted-foreground">لا توجد طلبات تدريب.</li>
            )}
          </ul>
        )}
      </Section>

      <Section
        title="الترقيات والتسويات"
        icon={<TrendingUp className="h-4 w-4" />}
        testId="staff-02e-wb-promotions"
      >
        {!capabilities.can_manage_promotions ? (
          <p
            data-testid="staff-02e-wb-promotions-empty"
            className="text-xs text-muted-foreground"
          >
            لا تملك صلاحية إدارة الترقيات والتسويات.
          </p>
        ) : (
          <>
            <PromotionOpenForm
              busy={busy}
              onOpen={(input) =>
                run(() => openPromotionCase(input), "تم فتح حالة الترقية.")
              }
            />
            <ul className="mt-3 space-y-1 text-xs">
              {(promotionCases.data ?? []).map((item) => (
                <li
                  key={item.id}
                  className="rounded border border-border px-2 py-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{item.case_no}</span>
                    <span className="text-muted-foreground">
                      {PROMOTION_STATUS_AR[item.status] ?? item.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {(NEXT_PROMOTION_STATUS[item.status] ?? []).map((next) => (
                      <button
                        key={next}
                        type="button"
                        data-testid="staff-02e-promotion-advance"
                        disabled={busy}
                        onClick={() => {
                          const effectiveOn =
                            next === "implemented"
                              ? window.prompt("تاريخ النفاذ (YYYY-MM-DD)")
                              : null;
                          if (next === "implemented" && !effectiveOn) return;
                          void run(
                            () =>
                              updatePromotionCase({
                                caseId: item.id,
                                status: next,
                                effectiveOn,
                              }),
                            "تم تحديث حالة الملف.",
                          );
                        }}
                        className="rounded border border-border px-2 py-0.5 text-[11px] disabled:opacity-60"
                      >
                        {PROMOTION_STATUS_AR[next] ?? next}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
              {(promotionCases.data ?? []).length === 0 && (
                <li className="text-muted-foreground">لا توجد حالات مسجلة.</li>
              )}
            </ul>
          </>
        )}
      </Section>

      <Section
        title="تقارير الحضور الشهرية"
        icon={<CalendarClock className="h-4 w-4" />}
        testId="staff-02e-wb-attendance-report"
      >
        {!capabilities.can_view_attendance_reports ? (
          <p
            data-testid="staff-02e-wb-attendance-report-empty"
            className="text-xs text-muted-foreground"
          >
            لا تملك صلاحية الاطلاع على تقارير الحضور.
          </p>
        ) : (
          <AttendanceMonthReport />
        )}
      </Section>

      <Section
        title="إخلاء الطرف"
        icon={<ShieldCheck className="h-4 w-4" />}
        testId="staff-02e-wb-clearance"
      >
        {!capabilities.can_decide_clearance ? (
          <p
            data-testid="staff-02e-wb-clearance-empty"
            className="text-xs text-muted-foreground"
          >
            لا تملك صلاحية معالجة إخلاء الطرف.
          </p>
        ) : (
          <div className="space-y-3 text-xs">
            {capabilities.can_manage_clearance_cases && (
              <ClearanceOpenForm
                busy={busy}
                onOpen={(input) =>
                  run(
                    () => openClearanceCase(input),
                    "تم فتح معاملة إخلاء الطرف بمراحلها الخمس.",
                  )
                }
              />
            )}

            <div data-testid="staff-02e-wb-assigned-checkpoints">
              <p className="mb-1 font-semibold">المراحل المسندة إليك</p>
              <ul className="space-y-1">
                {(assignedCheckpoints.data ?? []).map((point) => (
                  <li
                    key={point.checkpoint_id}
                    className="flex items-center justify-between rounded border border-border px-2 py-1"
                  >
                    <span>
                      {point.case_no} —{" "}
                      {CHECKPOINT_KIND_AR[point.checkpoint_kind] ??
                        point.checkpoint_kind}
                    </span>
                    {point.checkpoint_status === "pending" ? (
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                decideClearanceCheckpoint({
                                  checkpointId: point.checkpoint_id,
                                  decision: "cleared",
                                }),
                              "تم إخلاء المرحلة.",
                            )
                          }
                          className="rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground disabled:opacity-60"
                        >
                          إخلاء
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt("سبب الإيقاف");
                            if (!reason?.trim()) return;
                            void run(
                              () =>
                                decideClearanceCheckpoint({
                                  checkpointId: point.checkpoint_id,
                                  decision: "blocked",
                                  reason,
                                }),
                              "تم إيقاف المرحلة.",
                            );
                          }}
                          className="rounded border border-border px-2 py-0.5 text-[11px] disabled:opacity-60"
                        >
                          إيقاف
                        </button>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {point.checkpoint_status === "cleared"
                          ? "تم الإخلاء"
                          : "موقوف"}
                      </span>
                    )}
                  </li>
                ))}
                {(assignedCheckpoints.data ?? []).length === 0 && (
                  <li className="text-muted-foreground">
                    لا توجد مراحل بانتظار قرارك.
                  </li>
                )}
              </ul>
            </div>

            {capabilities.can_view_clearance_cases && (
              <ul className="space-y-2">
                {(clearanceCases.data ?? []).map((item) => (
                  <li
                    key={item.id}
                    className="rounded-md border border-border p-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{item.case_no}</span>
                      {item.status === "in_progress" &&
                        capabilities.can_manage_clearance_cases && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () => completeClearanceCase({ caseId: item.id }),
                                "تم إنهاء معاملة إخلاء الطرف.",
                              )
                            }
                            className="rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground disabled:opacity-60"
                          >
                            إنهاء المعاملة
                          </button>
                        )}
                    </div>
                    <ul className="mt-1 space-y-1">
                      {(checkpoints.data ?? [])
                        .filter((point) => point.case_id === item.id)
                        .map((point) => (
                          <li
                            key={point.id}
                            className="flex items-center justify-between"
                          >
                            <span>
                              {CHECKPOINT_KIND_AR[point.checkpoint_kind] ??
                                point.checkpoint_kind}
                            </span>
                            <span className="text-muted-foreground">
                              {point.status === "cleared"
                                ? "تم الإخلاء"
                                : point.status === "blocked"
                                  ? "موقوف"
                                  : "قيد المراجعة"}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
                {(clearanceCases.data ?? []).length === 0 && (
                  <li className="text-muted-foreground">
                    لا توجد معاملات جارية.
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </Section>

      <Section
        title="سجل التدقيق للخدمات المضافة"
        icon={<History className="h-4 w-4" />}
        testId="staff-02e-wb-audit"
      >
        {!capabilities.can_view_audit_scope ? (
          <p
            data-testid="staff-02e-wb-audit-empty"
            className="text-xs text-muted-foreground"
          >
            لا تملك صلاحية الاطلاع على سجل التدقيق.
          </p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-auto text-xs">
            {(audit.data ?? []).map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between rounded border border-border px-2 py-1"
              >
                <span>{event.event_type}</span>
                <span className="text-muted-foreground">
                  {dateLabel(event.occurred_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/**
 * One-time QR panel.
 *
 * The opaque token is never rendered as readable text: it only ever appears
 * inside a standards-compatible QR image produced by the `qrcode` library, and
 * it is wiped from memory when the panel is dismissed or unmounted.
 */
function IssuedDocumentQr({
  referenceNo,
  token,
  onDismiss,
}: {
  referenceNo: string;
  token: string;
  onDismiss: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(token);

  const verificationUrl = `${
    typeof window === "undefined" ? "" : window.location.origin
  }/verify-document?token=${encodeURIComponent(token)}`;

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(verificationUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setError("تعذر إنشاء رمز QR للوثيقة.");
      });
    return () => {
      active = false;
      tokenRef.current = "";
      setDataUrl(null);
    };
  }, [verificationUrl]);

  return (
    <div
      data-testid="staff-02e-document-qr"
      className="mt-3 rounded-md border border-border p-3 text-center text-[11px]"
    >
      <p className="mb-2 font-semibold">
        رمز التحقق للوثيقة {referenceNo} — يُعرض مرة واحدة فقط
      </p>
      {error && <p className="text-destructive">{error}</p>}
      {dataUrl && (
        <img
          data-testid="staff-02e-document-qr-image"
          src={dataUrl}
          alt={`رمز التحقق للوثيقة ${referenceNo}`}
          className="mx-auto h-40 w-40"
        />
      )}
      <p className="mt-2 text-muted-foreground">
        اطبع الرمز على الوثيقة. لا يظهر الرمز النصي ولا يمكن استرجاعه لاحقاً.
      </p>
      <div className="mt-2 flex justify-center gap-2">
        <a
          data-testid="staff-02e-document-qr-download"
          href={dataUrl ?? "#"}
          download={`${referenceNo}-qr.png`}
          className="rounded border border-border px-3 py-1"
        >
          تنزيل الرمز
        </a>
        <button
          type="button"
          data-testid="staff-02e-document-qr-print"
          onClick={() => window.print()}
          className="rounded border border-border px-3 py-1"
        >
          طباعة
        </button>
        <button
          type="button"
          data-testid="staff-02e-document-qr-dismiss"
          onClick={onDismiss}
          className="rounded bg-primary px-3 py-1 text-primary-foreground"
        >
          إخفاء نهائياً
        </button>
      </div>
    </div>
  );
}

function IssueDocumentForm({
  busy,
  onIssue,
}: {
  busy: boolean;
  onIssue: (requestId: string, validDays: number) => Promise<void>;
}) {
  const [requestId, setRequestId] = useState("");
  const [validDays, setValidDays] = useState("180");

  return (
    <div className="grid gap-2 text-xs sm:grid-cols-3">
      <input
        aria-label="معرف الطلب المعتمد"
        placeholder="معرف الطلب المعتمد"
        value={requestId}
        onChange={(event) => setRequestId(event.target.value)}
        className="sm:col-span-2 rounded-md border border-border bg-background p-1.5"
      />
      <input
        aria-label="مدة الصلاحية بالأيام"
        inputMode="numeric"
        value={validDays}
        onChange={(event) => setValidDays(event.target.value)}
        className="rounded-md border border-border bg-background p-1.5"
      />
      <button
        type="button"
        data-testid="staff-02e-issue-document"
        disabled={busy || requestId.trim().length === 0}
        onClick={() =>
          void onIssue(requestId.trim(), Number.parseInt(validDays, 10) || 180)
        }
        className="sm:col-span-3 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-60"
      >
        إصدار الوثيقة
      </button>
    </div>
  );
}

function EvaluationDraftForm({
  busy,
  cycles,
  onSave,
}: {
  busy: boolean;
  cycles: readonly { id: string; label: string }[];
  onSave: (input: {
    cycleId: string;
    staffProfileId: string;
    overallRating: number | null;
    ratingBand:
      | "excellent"
      | "very_good"
      | "good"
      | "acceptable"
      | "weak"
      | null;
    goals: string | null;
    strengths: string | null;
    improvements: string | null;
  }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    cycleId: "",
    staffProfileId: "",
    overallRating: "",
    ratingBand: "",
    goals: "",
    strengths: "",
    improvements: "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div
      data-testid="staff-02e-evaluation-draft-form"
      className="grid gap-2 text-xs sm:grid-cols-2"
    >
      <select
        aria-label="دورة التقييم"
        value={form.cycleId}
        onChange={(event) => set("cycleId")(event.target.value)}
        className="rounded-md border border-border bg-background p-1.5"
      >
        <option value="">اختر دورة التقييم</option>
        {cycles.map((cycle) => (
          <option key={cycle.id} value={cycle.id}>
            {cycle.label}
          </option>
        ))}
      </select>
      <input
        aria-label="معرف الملف الوظيفي"
        placeholder="معرف الملف الوظيفي"
        value={form.staffProfileId}
        onChange={(event) => set("staffProfileId")(event.target.value)}
        className="rounded-md border border-border bg-background p-1.5"
      />
      <input
        aria-label="الدرجة الكلية"
        inputMode="decimal"
        placeholder="الدرجة الكلية (0-100)"
        value={form.overallRating}
        onChange={(event) => set("overallRating")(event.target.value)}
        className="rounded-md border border-border bg-background p-1.5"
      />
      <select
        aria-label="التقدير"
        value={form.ratingBand}
        onChange={(event) => set("ratingBand")(event.target.value)}
        className="rounded-md border border-border bg-background p-1.5"
      >
        <option value="">التقدير</option>
        {Object.entries(RATING_BAND_AR).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input
        aria-label="الأهداف"
        placeholder="الأهداف"
        value={form.goals}
        onChange={(event) => set("goals")(event.target.value)}
        className="sm:col-span-2 rounded-md border border-border bg-background p-1.5"
      />
      <input
        aria-label="نقاط القوة"
        placeholder="نقاط القوة"
        value={form.strengths}
        onChange={(event) => set("strengths")(event.target.value)}
        className="rounded-md border border-border bg-background p-1.5"
      />
      <input
        aria-label="فرص التحسين"
        placeholder="فرص التحسين"
        value={form.improvements}
        onChange={(event) => set("improvements")(event.target.value)}
        className="rounded-md border border-border bg-background p-1.5"
      />
      <button
        type="button"
        data-testid="staff-02e-save-evaluation-draft"
        disabled={
          busy || form.cycleId.length === 0 || form.staffProfileId.length === 0
        }
        onClick={() =>
          void onSave({
            cycleId: form.cycleId,
            staffProfileId: form.staffProfileId.trim(),
            overallRating:
              form.overallRating.trim().length === 0
                ? null
                : Number.parseFloat(form.overallRating),
            ratingBand:
              form.ratingBand.length === 0
                ? null
                : (form.ratingBand as
                    | "excellent"
                    | "very_good"
                    | "good"
                    | "acceptable"
                    | "weak"),
            goals: form.goals.trim() || null,
            strengths: form.strengths.trim() || null,
            improvements: form.improvements.trim() || null,
          })
        }
        className="sm:col-span-2 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-60"
      >
        حفظ المسودة
      </button>
    </div>
  );
}

function TrainingCompletionForm({
  busy,
  onComplete,
}: {
  busy: boolean;
  onComplete: (certificate: {
    objectPath: string;
    sha256: string;
  }) => Promise<void>;
}) {
  const [objectPath, setObjectPath] = useState("");
  const [sha256, setSha256] = useState("");

  return (
    <div
      data-testid="staff-02e-training-completion-form"
      className="mt-1 grid gap-1 sm:grid-cols-3"
    >
      <input
        aria-label="مسار الشهادة في التخزين الخاص"
        placeholder="مسار الشهادة داخل التخزين الخاص"
        value={objectPath}
        onChange={(event) => setObjectPath(event.target.value)}
        className="sm:col-span-2 rounded border border-border bg-background p-1 text-[11px]"
      />
      <input
        aria-label="بصمة SHA-256"
        placeholder="SHA-256"
        value={sha256}
        onChange={(event) => setSha256(event.target.value)}
        className="rounded border border-border bg-background p-1 text-[11px]"
      />
      <button
        type="button"
        data-testid="staff-02e-complete-training"
        disabled={busy || objectPath.trim().length === 0}
        onClick={() =>
          void onComplete({
            objectPath: objectPath.trim(),
            sha256: sha256.trim(),
          })
        }
        className="sm:col-span-3 rounded bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
      >
        تسجيل الإتمام وبيانات الشهادة
      </button>
    </div>
  );
}

function PromotionOpenForm({
  busy,
  onOpen,
}: {
  busy: boolean;
  onOpen: (input: {
    staffProfileId: string;
    caseKind: "promotion" | "settlement" | "grade_adjustment";
    currentGrade: string | null;
    proposedGrade: string | null;
    notes: string | null;
  }) => Promise<void>;
}) {
  const [form, setForm] = useState({
    staffProfileId: "",
    caseKind: "promotion" as "promotion" | "settlement" | "grade_adjustment",
    currentGrade: "",
    proposedGrade: "",
    notes: "",
  });

  return (
    <div
      data-testid="staff-02e-promotion-open-form"
      className="grid gap-2 text-xs sm:grid-cols-2"
    >
      <input
        aria-label="معرف الملف الوظيفي"
        placeholder="معرف الملف الوظيفي"
        value={form.staffProfileId}
        onChange={(event) =>
          setForm((prev) => ({ ...prev, staffProfileId: event.target.value }))
        }
        className="rounded-md border border-border bg-background p-1.5"
      />
      <select
        aria-label="نوع الحالة"
        value={form.caseKind}
        onChange={(event) =>
          setForm((prev) => ({
            ...prev,
            caseKind: event.target.value as typeof prev.caseKind,
          }))
        }
        className="rounded-md border border-border bg-background p-1.5"
      >
        <option value="promotion">ترقية</option>
        <option value="settlement">تسوية</option>
        <option value="grade_adjustment">تعديل درجة</option>
      </select>
      <input
        aria-label="الدرجة الحالية"
        placeholder="الدرجة الحالية"
        value={form.currentGrade}
        onChange={(event) =>
          setForm((prev) => ({ ...prev, currentGrade: event.target.value }))
        }
        className="rounded-md border border-border bg-background p-1.5"
      />
      <input
        aria-label="الدرجة المقترحة"
        placeholder="الدرجة المقترحة"
        value={form.proposedGrade}
        onChange={(event) =>
          setForm((prev) => ({ ...prev, proposedGrade: event.target.value }))
        }
        className="rounded-md border border-border bg-background p-1.5"
      />
      <input
        aria-label="ملاحظات"
        placeholder="ملاحظات"
        value={form.notes}
        onChange={(event) =>
          setForm((prev) => ({ ...prev, notes: event.target.value }))
        }
        className="sm:col-span-2 rounded-md border border-border bg-background p-1.5"
      />
      <button
        type="button"
        data-testid="staff-02e-open-promotion"
        disabled={busy || form.staffProfileId.trim().length === 0}
        onClick={() =>
          void onOpen({
            staffProfileId: form.staffProfileId.trim(),
            caseKind: form.caseKind,
            currentGrade: form.currentGrade.trim() || null,
            proposedGrade: form.proposedGrade.trim() || null,
            notes: form.notes.trim() || null,
          })
        }
        className="sm:col-span-2 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-60"
      >
        فتح حالة جديدة
      </button>
    </div>
  );
}

function ClearanceOpenForm({
  busy,
  onOpen,
}: {
  busy: boolean;
  onOpen: (input: { staffProfileId: string; reason: string }) => Promise<void>;
}) {
  const [staffProfileId, setStaffProfileId] = useState("");
  const [reason, setReason] = useState("");

  return (
    <div
      data-testid="staff-02e-clearance-open-form"
      className="grid gap-2 sm:grid-cols-2"
    >
      <input
        aria-label="معرف الملف الوظيفي"
        placeholder="معرف الملف الوظيفي"
        value={staffProfileId}
        onChange={(event) => setStaffProfileId(event.target.value)}
        className="rounded-md border border-border bg-background p-1.5"
      />
      <input
        aria-label="سبب إخلاء الطرف"
        placeholder="سبب إخلاء الطرف"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className="rounded-md border border-border bg-background p-1.5"
      />
      <button
        type="button"
        data-testid="staff-02e-open-clearance"
        disabled={
          busy || staffProfileId.trim().length === 0 || reason.trim().length < 3
        }
        onClick={() =>
          void onOpen({
            staffProfileId: staffProfileId.trim(),
            reason: reason.trim(),
          })
        }
        className="sm:col-span-2 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-60"
      >
        فتح معاملة إخلاء طرف
      </button>
    </div>
  );
}

function AttendanceMonthReport() {
  const now = new Date();
  const [year, setYear] = useState(String(now.getUTCFullYear()));
  const [month, setMonth] = useState(String(now.getUTCMonth() + 1));

  const report = useQuery({
    queryKey: ["staff-02e", "wb-attendance-report", year, month],
    queryFn: () =>
      fetchStaffAttendanceMonthReport({
        year: Number.parseInt(year, 10),
        month: Number.parseInt(month, 10),
      }),
  });

  return (
    <div className="space-y-2 text-xs">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          aria-label="السنة"
          inputMode="numeric"
          value={year}
          onChange={(event) => setYear(event.target.value)}
          className="rounded-md border border-border bg-background p-1.5"
        />
        <select
          aria-label="الشهر"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="rounded-md border border-border bg-background p-1.5"
        >
          {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
            <option key={value} value={String(value)}>
              {value}
            </option>
          ))}
        </select>
      </div>
      {report.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ul className="max-h-56 space-y-1 overflow-auto">
          {(report.data ?? []).map((row) => (
            <li
              key={row.staff_profile_id}
              className="flex items-center justify-between rounded border border-border px-2 py-1"
            >
              <span>{row.full_name_ar}</span>
              <span className="text-muted-foreground">
                حضور {row.present_days} — غياب {row.absent_days} — تأخر{" "}
                {row.late_days} — {row.worked_hours} ساعة
              </span>
            </li>
          ))}
          {(report.data ?? []).length === 0 && (
            <li className="text-muted-foreground">
              لا توجد بيانات حضور لهذا الشهر ضمن نطاقك.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
