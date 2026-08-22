/**
 * PORTAL_STAFF_SELF_SERVICE_VALUE_ADDED_02E
 * Employee-facing value-added modules (RTL, fail-closed, RLS-driven).
 * The client renders only what the database returned; it never decides authority.
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  CalendarClock,
  ClipboardCheck,
  FileBadge,
  GraduationCap,
  Loader2,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import {
  CHECKPOINT_KIND_AR,
  RATING_BAND_AR,
  acknowledgeEvaluation,
  fetchStaffAttendanceDays,
  fetchStaffClearanceCases,
  fetchStaffClearanceCheckpoints,
  fetchStaffEvaluations,
  fetchStaffIssuedDocuments,
  fetchStaffOvertimeClaims,
  fetchStaffPromotionCases,
  fetchStaffTrainingCourses,
  fetchStaffTrainingEnrollments,
  requestEmploymentStatement,
  requestTrainingEnrollment,
  submitOvertimeClaim,
} from "@/lib/staff-self-service-value-added";

export const STAFF_VALUE_ADDED_EMPLOYEE_UI_MARKER =
  "PORTAL_STAFF_SELF_SERVICE_VALUE_ADDED_02E";

const DOC_TYPE_AR: Record<string, string> = {
  employment_statement: "إفادة عمل",
  experience_certificate: "شهادة خبرة",
  training_certificate: "شهادة تدريب",
  clearance_certificate: "شهادة إخلاء طرف",
};

const CLAIM_STATUS_AR: Record<string, string> = {
  submitted: "بانتظار المدير المباشر",
  manager_approved: "بانتظار الموارد البشرية",
  hr_approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغي",
};

const TRAINING_STATUS_AR: Record<string, string> = {
  requested: "طلب مقدم",
  approved: "معتمد",
  rejected: "مرفوض",
  completed: "مكتمل",
  cancelled: "ملغي",
};

const DAY_STATE_AR: Record<string, string> = {
  present: "حضور",
  absent: "غياب",
  late: "تأخر",
  leave: "إجازة",
  holiday: "عطلة",
  mission: "مهمة",
};

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

function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
      {error instanceof Error ? error.message : "تعذر تحميل البيانات."}
    </p>
  );
}

export function StaffValueAddedEmployeePanel() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [overtime, setOvertime] = useState({
    claimKind: "overtime" as "overtime" | "assignment",
    startsOn: "",
    endsOn: "",
    totalHours: "",
    reason: "",
  });

  const documents = useQuery({
    queryKey: ["staff-02e", "documents"],
    queryFn: fetchStaffIssuedDocuments,
  });
  const evaluations = useQuery({
    queryKey: ["staff-02e", "evaluations"],
    queryFn: fetchStaffEvaluations,
  });
  const attendance = useQuery({
    queryKey: ["staff-02e", "attendance"],
    queryFn: () => fetchStaffAttendanceDays(31),
  });
  const claims = useQuery({
    queryKey: ["staff-02e", "overtime"],
    queryFn: fetchStaffOvertimeClaims,
  });
  const courses = useQuery({
    queryKey: ["staff-02e", "training-courses"],
    queryFn: fetchStaffTrainingCourses,
  });
  const enrollments = useQuery({
    queryKey: ["staff-02e", "training-enrollments"],
    queryFn: fetchStaffTrainingEnrollments,
  });
  const promotions = useQuery({
    queryKey: ["staff-02e", "promotions"],
    queryFn: fetchStaffPromotionCases,
  });
  const clearances = useQuery({
    queryKey: ["staff-02e", "clearance-cases"],
    queryFn: fetchStaffClearanceCases,
  });
  const checkpoints = useQuery({
    queryKey: ["staff-02e", "clearance-checkpoints"],
    queryFn: fetchStaffClearanceCheckpoints,
  });

  const attendanceTotals = useMemo(() => {
    const rows = attendance.data ?? [];
    return {
      present: rows.filter((row) => row.day_state === "present").length,
      absent: rows.filter((row) => row.day_state === "absent").length,
      late: rows.filter((row) => row.day_state === "late").length,
      workedHours: Math.round(
        rows.reduce((sum, row) => sum + row.worked_minutes, 0) / 60,
      ),
    };
  }, [attendance.data]);

  async function run(key: string, action: () => Promise<unknown>, ok: string) {
    setBusy(key);
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
      setBusy(null);
    }
  }

  return (
    <div
      dir="rtl"
      data-testid="staff-02e-employee-panel"
      className="grid gap-4 lg:grid-cols-2"
    >
      {notice && (
        <p
          data-testid="staff-02e-notice"
          className="lg:col-span-2 rounded-md bg-muted p-2 text-xs text-foreground"
        >
          {notice}
        </p>
      )}

      <Section
        title="الإفادات والشهادات الصادرة"
        icon={<FileBadge className="h-4 w-4" />}
        testId="staff-02e-documents"
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              run(
                "employment_statement",
                () =>
                  requestEmploymentStatement({
                    documentType: "employment_statement",
                  }),
                "تم إرسال طلب إفادة العمل.",
              )
            }
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
          >
            طلب إفادة عمل
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              run(
                "experience_certificate",
                () =>
                  requestEmploymentStatement({
                    documentType: "experience_certificate",
                  }),
                "تم إرسال طلب شهادة الخبرة.",
              )
            }
            className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
          >
            طلب شهادة خبرة
          </button>
        </div>
        <ErrorNote error={documents.error} />
        {documents.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (documents.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">
            لا توجد وثائق صادرة بعد.
          </p>
        ) : (
          <ul className="space-y-2">
            {(documents.data ?? []).map((doc) => (
              <li
                key={doc.id}
                className="rounded-md border border-border p-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {DOC_TYPE_AR[doc.document_type] ?? doc.document_type}
                  </span>
                  <span
                    className={
                      doc.status === "revoked"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }
                  >
                    {doc.status === "revoked" ? "ملغاة" : "سارية"}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {doc.reference_no} — صدرت في {dateLabel(doc.issued_at)}
                  {doc.expires_at
                    ? ` — تنتهي في ${dateLabel(doc.expires_at)}`
                    : ""}
                </p>
                <p className="text-muted-foreground">
                  يتم التحقق من صحة الوثيقة عبر رمز QR المطبوع عليها فقط.
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="تقييم الأداء السنوي"
        icon={<Award className="h-4 w-4" />}
        testId="staff-02e-evaluations"
      >
        <ErrorNote error={evaluations.error} />
        {evaluations.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (evaluations.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">
            لا يوجد تقييم معتمد متاح للاطلاع.
          </p>
        ) : (
          <ul className="space-y-2">
            {(evaluations.data ?? []).map((item) => (
              <li
                key={item.id}
                className="rounded-md border border-border p-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    التقدير:{" "}
                    {item.rating_band
                      ? (RATING_BAND_AR[item.rating_band] ?? item.rating_band)
                      : "—"}
                  </span>
                  <span className="text-muted-foreground">
                    {item.overall_rating ?? "—"}
                  </span>
                </div>
                {item.strengths && (
                  <p className="text-muted-foreground">
                    نقاط القوة: {item.strengths}
                  </p>
                )}
                {item.improvements && (
                  <p className="text-muted-foreground">
                    فرص التحسين: {item.improvements}
                  </p>
                )}
                {item.acknowledged_at ? (
                  <p className="text-muted-foreground">
                    تم الإقرار في {dateLabel(item.acknowledged_at)}
                    {item.employee_comment
                      ? ` — ملاحظتك: ${item.employee_comment}`
                      : ""}
                  </p>
                ) : item.status === "finalized" ? (
                  <AcknowledgeEvaluationForm
                    busy={busy !== null}
                    onAcknowledge={(comment) =>
                      run(
                        `ack-${item.id}`,
                        () => acknowledgeEvaluation(item.id, comment),
                        "تم تسجيل إقرارك بالاطلاع على التقييم.",
                      )
                    }
                  />
                ) : (
                  <p className="text-muted-foreground">
                    التقييم قيد الإعداد ولم يُعتمد بعد.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="الحضور والانصراف"
        icon={<CalendarClock className="h-4 w-4" />}
        testId="staff-02e-attendance"
      >
        <ErrorNote error={attendance.error} />
        <div className="mb-2 grid grid-cols-4 gap-2 text-center text-xs">
          <div className="rounded-md bg-muted p-2">
            <p className="font-bold">{attendanceTotals.present}</p>
            <p className="text-muted-foreground">حضور</p>
          </div>
          <div className="rounded-md bg-muted p-2">
            <p className="font-bold">{attendanceTotals.absent}</p>
            <p className="text-muted-foreground">غياب</p>
          </div>
          <div className="rounded-md bg-muted p-2">
            <p className="font-bold">{attendanceTotals.late}</p>
            <p className="text-muted-foreground">تأخر</p>
          </div>
          <div className="rounded-md bg-muted p-2">
            <p className="font-bold">{attendanceTotals.workedHours}</p>
            <p className="text-muted-foreground">ساعات</p>
          </div>
        </div>
        <ul className="max-h-52 space-y-1 overflow-auto text-xs">
          {(attendance.data ?? []).map((day) => (
            <li
              key={day.id}
              className="flex items-center justify-between rounded border border-border px-2 py-1"
            >
              <span>{dateLabel(day.attendance_date)}</span>
              <span className="text-muted-foreground">
                {DAY_STATE_AR[day.day_state] ?? day.day_state}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="التكليفات والعمل الإضافي"
        icon={<TrendingUp className="h-4 w-4" />}
        testId="staff-02e-overtime"
      >
        <ErrorNote error={claims.error} />
        <div className="mb-3 grid gap-2 text-xs sm:grid-cols-2">
          <select
            aria-label="نوع الطلب"
            value={overtime.claimKind}
            onChange={(event) =>
              setOvertime((prev) => ({
                ...prev,
                claimKind: event.target.value as "overtime" | "assignment",
              }))
            }
            className="rounded-md border border-border bg-background p-1.5"
          >
            <option value="overtime">عمل إضافي</option>
            <option value="assignment">تكليف</option>
          </select>
          <input
            aria-label="عدد الساعات"
            inputMode="decimal"
            placeholder="عدد الساعات"
            value={overtime.totalHours}
            onChange={(event) =>
              setOvertime((prev) => ({
                ...prev,
                totalHours: event.target.value,
              }))
            }
            className="rounded-md border border-border bg-background p-1.5"
          />
          <input
            aria-label="من تاريخ"
            type="date"
            value={overtime.startsOn}
            onChange={(event) =>
              setOvertime((prev) => ({ ...prev, startsOn: event.target.value }))
            }
            className="rounded-md border border-border bg-background p-1.5"
          />
          <input
            aria-label="إلى تاريخ"
            type="date"
            value={overtime.endsOn}
            onChange={(event) =>
              setOvertime((prev) => ({ ...prev, endsOn: event.target.value }))
            }
            className="rounded-md border border-border bg-background p-1.5"
          />
          <input
            aria-label="سبب التكليف"
            placeholder="السبب"
            value={overtime.reason}
            onChange={(event) =>
              setOvertime((prev) => ({ ...prev, reason: event.target.value }))
            }
            className="sm:col-span-2 rounded-md border border-border bg-background p-1.5"
          />
          <button
            type="button"
            data-testid="staff-02e-submit-overtime"
            disabled={busy !== null}
            onClick={() =>
              run(
                "overtime",
                () =>
                  submitOvertimeClaim({
                    claimKind: overtime.claimKind,
                    startsOn: overtime.startsOn,
                    endsOn: overtime.endsOn,
                    totalHours: Number.parseFloat(overtime.totalHours),
                    reason: overtime.reason,
                  }),
                "تم تسجيل طلب العمل الإضافي.",
              )
            }
            className="sm:col-span-2 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-60"
          >
            إرسال الطلب
          </button>
        </div>
        <ul className="space-y-1 text-xs">
          {(claims.data ?? []).map((claim) => (
            <li
              key={claim.id}
              className="flex items-center justify-between rounded border border-border px-2 py-1"
            >
              <span>
                {claim.claim_no} — {claim.total_hours} ساعة
              </span>
              <span className="text-muted-foreground">
                {CLAIM_STATUS_AR[claim.status] ?? claim.status}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          الأثر المالي للتكليفات تطلع عليه الشؤون المالية فقط.
        </p>
      </Section>

      <Section
        title="التدريب والتطوير"
        icon={<GraduationCap className="h-4 w-4" />}
        testId="staff-02e-training"
      >
        <ErrorNote error={courses.error ?? enrollments.error} />
        <ul className="space-y-2 text-xs">
          {(courses.data ?? []).map((course) => {
            const enrollment = (enrollments.data ?? []).find(
              (row) => row.course_id === course.id,
            );
            return (
              <li
                key={course.id}
                className="rounded-md border border-border p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{course.title_ar}</span>
                  <span className="text-muted-foreground">
                    {course.total_hours} ساعة
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {course.provider} — {dateLabel(course.starts_on)}
                </p>
                {enrollment ? (
                  <p className="text-muted-foreground">
                    الحالة:{" "}
                    {TRAINING_STATUS_AR[enrollment.status] ?? enrollment.status}
                  </p>
                ) : (
                  <button
                    type="button"
                    data-testid="staff-02e-request-training"
                    disabled={busy !== null}
                    onClick={() =>
                      run(
                        `train-${course.id}`,
                        () => requestTrainingEnrollment(course.id),
                        "تم تسجيل طلب الالتحاق بالدورة.",
                      )
                    }
                    className="mt-1 rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    طلب الالتحاق
                  </button>
                )}
              </li>
            );
          })}
          {(courses.data ?? []).length === 0 && !courses.isLoading && (
            <li className="text-muted-foreground">
              لا توجد دورات متاحة حالياً.
            </li>
          )}
        </ul>
      </Section>

      <Section
        title="الترقيات والتسويات"
        icon={<ClipboardCheck className="h-4 w-4" />}
        testId="staff-02e-promotions"
      >
        <ErrorNote error={promotions.error} />
        <ul className="space-y-1 text-xs">
          {(promotions.data ?? []).map((item) => (
            <li
              key={item.id}
              className="rounded border border-border px-2 py-1"
            >
              <div className="flex items-center justify-between">
                <span>{item.case_no}</span>
                <span className="text-muted-foreground">{item.status}</span>
              </div>
              <p className="text-muted-foreground">
                {item.current_grade ?? "—"} ← {item.proposed_grade ?? "—"}
                {item.effective_on
                  ? ` — اعتبارًا من ${dateLabel(item.effective_on)}`
                  : ""}
              </p>
            </li>
          ))}
          {(promotions.data ?? []).length === 0 && !promotions.isLoading && (
            <li className="text-muted-foreground">لا توجد حالات مسجلة.</li>
          )}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          القيم المالية للتسويات مقصورة على الشؤون المالية.
        </p>
      </Section>

      <Section
        title="إخلاء الطرف الإلكتروني"
        icon={<ShieldCheck className="h-4 w-4" />}
        testId="staff-02e-clearance"
      >
        <ErrorNote error={clearances.error ?? checkpoints.error} />
        {(clearances.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">
            لا توجد معاملة إخلاء طرف جارية.
          </p>
        ) : (
          <ul className="space-y-2 text-xs">
            {(clearances.data ?? []).map((item) => (
              <li
                key={item.id}
                className="rounded-md border border-border p-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{item.case_no}</span>
                  <span className="text-muted-foreground">
                    {item.status === "completed" ? "مكتملة" : "جارية"}
                  </span>
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
          </ul>
        )}
      </Section>
    </div>
  );
}
