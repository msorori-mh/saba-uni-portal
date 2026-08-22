/**
 * PORTAL_STAFF_SELF_SERVICE_VALUE_ADDED_02E
 * Administrative oversight for the value-added modules.
 * Section visibility comes from the boolean-only capability probe; every row
 * shown is already RLS-filtered by the database.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  FileBadge,
  History,
  Loader2,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  CHECKPOINT_KIND_AR,
  RATING_BAND_AR,
  STAFF_VALUE_ADDED_NO_CAPABILITIES,
  completeClearanceCase,
  decideClearanceCheckpoint,
  decideOvertimeClaim,
  decideTrainingEnrollment,
  fetchStaffClearanceCases,
  fetchStaffClearanceCheckpoints,
  fetchStaffEvaluations,
  fetchStaffIssuedDocuments,
  fetchStaffOvertimeClaims,
  fetchStaffOvertimeFinancialImpact,
  fetchStaffPromotionFinancialImpact,
  fetchStaffTrainingEnrollments,
  fetchStaffValueAddedAuditEvents,
  fetchStaffValueAddedCapabilities,
  finalizeEvaluation,
  issueStaffDocument,
  revokeStaffDocument,
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
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

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
  const evaluations = useQuery({
    queryKey: ["staff-02e", "wb-evaluations"],
    queryFn: fetchStaffEvaluations,
    enabled: capabilities.can_manage_evaluations,
  });
  const claims = useQuery({
    queryKey: ["staff-02e", "wb-overtime"],
    queryFn: fetchStaffOvertimeClaims,
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
  const enrollments = useQuery({
    queryKey: ["staff-02e", "wb-training"],
    queryFn: fetchStaffTrainingEnrollments,
    enabled: capabilities.can_view_hr_scope,
  });
  const clearanceCases = useQuery({
    queryKey: ["staff-02e", "wb-clearance"],
    queryFn: fetchStaffClearanceCases,
    enabled: capabilities.can_decide_clearance,
  });
  const checkpoints = useQuery({
    queryKey: ["staff-02e", "wb-checkpoints"],
    queryFn: fetchStaffClearanceCheckpoints,
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
                  const issued = await issueStaffDocument({
                    requestId,
                    validDays,
                  });
                  setIssuedToken(issued.verification_token);
                }, "تم إصدار الوثيقة وإنشاء رمز التحقق.");
              }}
            />
            {issuedToken && (
              <div
                data-testid="staff-02e-verification-token"
                className="mt-2 rounded-md bg-muted p-2 text-[11px] break-all"
              >
                <p className="font-semibold">
                  رمز التحقق يُعرض مرة واحدة فقط — أدرجه في رمز QR للوثيقة:
                </p>
                <code>{issuedToken}</code>
              </div>
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
        title="اعتماد تقييمات الأداء"
        icon={<Users className="h-4 w-4" />}
        testId="staff-02e-wb-evaluations"
      >
        {!capabilities.can_manage_evaluations ? (
          <p className="text-xs text-muted-foreground">
            لا تملك صلاحية إدارة تقييمات الأداء.
          </p>
        ) : (
          <ul className="space-y-1 text-xs">
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
              <li className="text-muted-foreground">لا توجد تقييمات ضمن نطاقك.</li>
            )}
          </ul>
        )}
      </Section>

      <Section
        title="التكليفات والعمل الإضافي"
        icon={<History className="h-4 w-4" />}
        testId="staff-02e-wb-overtime"
      >
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
                  <span>تكليف — {money(row.gross_amount, row.currency_code)}</span>
                  <span className="text-muted-foreground">
                    {row.settled_at ? "مُسوّى" : "غير مُسوّى"}
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
                    ترقية — {money(row.current_basic, row.currency_code)} ←{" "}
                    {money(row.proposed_basic, row.currency_code)}
                  </span>
                  <span className="text-muted-foreground">
                    أثر رجعي {money(row.retroactive_amount, row.currency_code)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section
        title="طلبات التدريب"
        icon={<Users className="h-4 w-4" />}
        testId="staff-02e-wb-training"
      >
        {!capabilities.can_view_hr_scope ? (
          <p className="text-xs text-muted-foreground">
            لا تملك صلاحية إدارة طلبات التدريب.
          </p>
        ) : (
          <ul className="space-y-1 text-xs">
            {(enrollments.data ?? []).map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1"
              >
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
              </li>
            ))}
            {(enrollments.data ?? []).length === 0 && (
              <li className="text-muted-foreground">لا توجد طلبات تدريب.</li>
            )}
          </ul>
        )}
      </Section>

      <Section
        title="إخلاء الطرف"
        icon={<ShieldCheck className="h-4 w-4" />}
        testId="staff-02e-wb-clearance"
      >
        {!capabilities.can_decide_clearance ? (
          <p className="text-xs text-muted-foreground">
            لا تملك صلاحية معالجة إخلاء الطرف.
          </p>
        ) : (
          <ul className="space-y-2 text-xs">
            {(clearanceCases.data ?? []).map((item) => (
              <li key={item.id} className="rounded-md border border-border p-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{item.case_no}</span>
                  {item.status === "in_progress" && (
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
                        {point.status === "pending" ? (
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () =>
                                    decideClearanceCheckpoint({
                                      checkpointId: point.id,
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
                                      checkpointId: point.id,
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
                            {point.status === "cleared" ? "تم الإخلاء" : "موقوف"}
                          </span>
                        )}
                      </li>
                    ))}
                </ul>
              </li>
            ))}
            {(clearanceCases.data ?? []).length === 0 && (
              <li className="text-muted-foreground">لا توجد معاملات جارية.</li>
            )}
          </ul>
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
