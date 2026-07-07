import { Loader2, Paperclip, User } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getStudentRequestAttachmentUrl } from "@/lib/admin-student-requests.functions";
import type { StaffRequestDetail } from "@/lib/student-requests/staff-inbox-ui";
import { getStaffRoleLabelAr } from "@/lib/student-requests/staff-inbox-ui";
import { StudentRequestFormDataView } from "@/components/student-requests/StudentRequestFormDataView";
import { StaffRequestWorkflowTimeline } from "@/components/student-requests/StaffRequestWorkflowTimeline";
import { StaffRequestActionPanel } from "@/components/student-requests/StaffRequestActionPanel";

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <div className="text-muted-foreground w-28 shrink-0">{label}:</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function SignedAttachment({ path, name }: { path: string; name: string }) {
  const urlFn = useServerFn(getStudentRequestAttachmentUrl);
  const open = async () => {
    try {
      const { signedUrl } = await urlFn({ data: { path } });
      window.open(signedUrl, "_blank");
    } catch {
      toast.error("تعذر فتح المرفق");
    }
  };
  return (
    <button
      type="button"
      onClick={open}
      className="text-xs inline-flex items-center gap-1 border bg-muted/30 px-2 py-1 rounded hover:bg-muted"
    >
      <Paperclip className="h-3 w-3" /> {name}
    </button>
  );
}

const STUDENT_STATUS_LABEL: Record<string, string> = {
  active: "نشط",
  graduated: "خريج",
  suspended: "موقوف القيد",
  withdrawn: "منسحب",
};

export function StaffRequestDetailPanel({
  detail,
  loading,
  workflowRuntimeAvailable,
  dataSourceNote,
}: {
  detail: StaffRequestDetail | null;
  loading: boolean;
  workflowRuntimeAvailable: boolean;
  dataSourceNote?: string | null;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-8 grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        اختر طلباً من القائمة لعرض التفاصيل.
      </div>
    );
  }

  const statusBadge = "text-[10px] font-bold px-2 py-0.5 rounded bg-secondary";

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="p-4 border-b bg-muted/20 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display font-bold text-primary text-sm">{detail.title}</h2>
          <span className={statusBadge}>{detail.statusLabelAr}</span>
          <span className="text-[10px] text-muted-foreground">{detail.requestTypeNameAr}</span>
        </div>
        {detail.requestNumber && (
          <div className="text-xs text-muted-foreground font-mono">
            رقم الطلب: {detail.requestNumber}
          </div>
        )}
        {dataSourceNote && (
          <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
            {dataSourceNote}
          </div>
        )}
      </div>

      <div className="p-4 space-y-4 max-h-[calc(100vh-16rem)] overflow-y-auto">
        <section>
          <div className="text-xs font-bold text-primary mb-2 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> بيانات الطالب
          </div>
          <div className="rounded-lg border bg-muted/10 p-3 space-y-1.5">
            <DetailRow label="الاسم" value={detail.student.fullNameAr ?? "—"} />
            <DetailRow label="الرقم الأكاديمي" value={detail.student.academicNumber ?? "—"} />
            <DetailRow label="القسم" value={detail.student.departmentNameAr ?? "—"} />
            <DetailRow label="البرنامج" value={detail.student.programNameAr ?? "—"} />
            {detail.student.levelNameAr && (
              <DetailRow label="المستوى" value={detail.student.levelNameAr} />
            )}
            {detail.student.studySystemLabelAr && (
              <DetailRow label="نظام الدراسة" value={detail.student.studySystemLabelAr} />
            )}
            {detail.student.enrollmentStatusLabelAr && (
              <DetailRow label="حالة القيد" value={detail.student.enrollmentStatusLabelAr} />
            )}
            {detail.student.status && (
              <DetailRow
                label="حالة الملف"
                value={STUDENT_STATUS_LABEL[detail.student.status] ?? detail.student.status}
              />
            )}
          </div>
        </section>

        <section>
          <div className="text-xs font-bold text-primary mb-2">بيانات الطلب</div>
          <div className="space-y-1.5 mb-3">
            {detail.description && (
              <DetailRow label="الوصف" value={detail.description} />
            )}
            {detail.studentNotes && (
              <DetailRow label="ملاحظات الطالب" value={detail.studentNotes} />
            )}
            {detail.createdAt && (
              <DetailRow
                label="تاريخ الإنشاء"
                value={new Date(detail.createdAt).toLocaleString("ar-EG")}
              />
            )}
            {detail.submittedAt && (
              <DetailRow
                label="تاريخ التقديم"
                value={new Date(detail.submittedAt).toLocaleString("ar-EG")}
              />
            )}
            {detail.currentRoleKey && (
              <DetailRow
                label="الدور الحالي"
                value={getStaffRoleLabelAr(detail.currentRoleKey)}
              />
            )}
          </div>

          <div className="text-[11px] font-bold text-muted-foreground mb-2">
            بيانات النموذج
          </div>
          <StudentRequestFormDataView
            requestTypeCode={detail.requestTypeCode}
            formData={detail.formData}
          />
        </section>

        {detail.attachments.length > 0 && (
          <section>
            <div className="text-xs font-bold text-primary mb-2">المرفقات</div>
            <div className="flex flex-wrap gap-1.5">
              {detail.attachments.map((a) => (
                <SignedAttachment key={a.id} path={a.fileUrl} name={a.fileName} />
              ))}
            </div>
          </section>
        )}

        {detail.privacyNoticeAr && (
          <div className="text-xs text-muted-foreground border rounded p-2 bg-muted/20">
            {detail.privacyNoticeAr}
          </div>
        )}

        <StaffRequestWorkflowTimeline
          steps={detail.workflowSteps}
          isPreview={detail.workflowIsPreview}
        />

        <StaffRequestActionPanel
          currentRoleKey={detail.currentRoleKey}
          workflowRuntimeAvailable={workflowRuntimeAvailable}
        />
      </div>
    </div>
  );
}
