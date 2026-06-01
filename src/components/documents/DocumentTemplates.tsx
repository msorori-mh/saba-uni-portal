// Reusable printable document templates used by /document-view/$id
// Styling is intentionally minimal & print-friendly. RTL.
import type { ReactNode } from "react";

export type DocumentBase = {
  id: string;
  document_type:
    | "enrollment_certificate"
    | "student_status_certificate"
    | "official_transcript"
    | "financial_receipt";
  document_number: string;
  verification_code: string;
  issued_at: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

export type StudentInfo = {
  full_name_ar: string;
  full_name_en: string | null;
  academic_number: string;
  national_id?: string | null;
  department_name?: string | null;
  program_name?: string | null;
  level_name?: string | null;
  academic_year?: string | null;
  semester?: string | null;
  enrollment_status?: string | null;
};

export type SiteInfo = {
  university_name: string;
  college_name: string;
  logo_url?: string | null;
};

export type TranscriptCourse = {
  course_code: string;
  course_name: string;
  credit_hours: number;
  percentage: number;
  course_status: "passed" | "failed";
  semester_name: string;
  academic_year_name: string;
};

export type ReceiptInfo = {
  receipt_number: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  fee_type?: string | null;
};

export const DOC_TYPE_LABEL: Record<DocumentBase["document_type"], string> = {
  enrollment_certificate: "شهادة قيد",
  student_status_certificate: "إفادة بالحالة الدراسية",
  official_transcript: "السجل الأكاديمي الرسمي",
  financial_receipt: "سند مالي رسمي",
};

function Header({ site, title }: { site: SiteInfo; title: string }) {
  return (
    <header className="border-b-2 border-primary pb-4 mb-6 text-center">
      {site.logo_url ? (
        <img src={site.logo_url} alt="" className="mx-auto h-16 w-auto mb-2" />
      ) : null}
      <h1 className="font-display text-2xl font-extrabold text-primary">
        {site.university_name}
      </h1>
      <h2 className="font-display text-lg font-bold text-primary/80 mt-1">
        {site.college_name}
      </h2>
      <div className="mt-3 inline-block rounded border-2 border-primary px-4 py-1 font-display text-base font-extrabold text-primary">
        {title}
      </div>
    </header>
  );
}

function Footer({ doc }: { doc: DocumentBase }) {
  const issued = new Date(doc.issued_at).toLocaleDateString("ar-EG", {
    year: "numeric", month: "long", day: "numeric",
  });
  return (
    <footer className="mt-10 pt-4 border-t border-border text-xs text-muted-foreground">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div><span className="font-bold">رقم الوثيقة:</span> {doc.document_number}</div>
          <div className="mt-1"><span className="font-bold">رمز التحقق:</span> <span className="font-mono">{doc.verification_code}</span></div>
          <div className="mt-1"><span className="font-bold">تاريخ الإصدار:</span> {issued}</div>
        </div>
        <div className="text-left">
          <div className="font-bold text-primary">للتحقق من صحة الوثيقة:</div>
          <div className="mt-1">قم بزيارة صفحة التحقق وأدخل رقم الوثيقة أو رمز التحقق.</div>
          <div className="mt-1 font-mono text-[10px]">/verify-document</div>
        </div>
      </div>
      {doc.status === "cancelled" ? (
        <div className="mt-4 rounded border-2 border-destructive bg-destructive/10 p-2 text-center font-bold text-destructive">
          هذه الوثيقة ملغاة وغير صالحة.
        </div>
      ) : null}
    </footer>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2 py-1 border-b border-dashed border-border last:border-0">
      <span className="font-bold text-primary min-w-[140px]">{label}:</span>
      <span className="text-foreground">{value ?? "—"}</span>
    </div>
  );
}

export function EnrollmentCertificate({
  doc, student, site,
}: { doc: DocumentBase; student: StudentInfo; site: SiteInfo }) {
  return (
    <article dir="rtl" className="bg-white text-foreground p-8 max-w-3xl mx-auto print:max-w-none">
      <Header site={site} title={DOC_TYPE_LABEL.enrollment_certificate} />
      <p className="text-sm leading-7 text-foreground mb-4">
        تشهد إدارة الكلية بأن الطالب المذكور أدناه مقيد ومسجل لدينا في الفصل الدراسي الحالي
        وفقاً للبيانات الموضحة:
      </p>
      <div className="rounded border border-border p-4 space-y-1">
        <Field label="اسم الطالب" value={student.full_name_ar} />
        <Field label="الرقم الأكاديمي" value={student.academic_number} />
        <Field label="القسم" value={student.department_name} />
        <Field label="البرنامج" value={student.program_name} />
        <Field label="المستوى الأكاديمي" value={student.level_name} />
        <Field label="العام الأكاديمي" value={student.academic_year} />
        <Field label="الفصل الدراسي" value={student.semester} />
        <Field label="الحالة الأكاديمية" value={student.enrollment_status} />
      </div>
      <p className="text-sm leading-7 text-foreground mt-4">
        وقد منحت هذه الشهادة بناءً على طلبه لاستخدامها فيما يلزم.
      </p>
      <Footer doc={doc} />
    </article>
  );
}

export function StatusCertificate(props: { doc: DocumentBase; student: StudentInfo; site: SiteInfo }) {
  const { doc, student, site } = props;
  return (
    <article dir="rtl" className="bg-white text-foreground p-8 max-w-3xl mx-auto print:max-w-none">
      <Header site={site} title={DOC_TYPE_LABEL.student_status_certificate} />
      <p className="text-sm leading-7 mb-4">
        تفيد إدارة الكلية بأن حالة الطالب الدراسية كما يلي:
      </p>
      <div className="rounded border border-border p-4 space-y-1">
        <Field label="اسم الطالب" value={student.full_name_ar} />
        <Field label="الرقم الأكاديمي" value={student.academic_number} />
        <Field label="القسم" value={student.department_name} />
        <Field label="البرنامج" value={student.program_name} />
        <Field label="المستوى" value={student.level_name} />
        <Field label="العام الأكاديمي" value={student.academic_year} />
        <Field label="الفصل الدراسي" value={student.semester} />
        <Field label="الحالة" value={
          <span className="font-bold">{student.enrollment_status === "active" ? "منتظم" : (student.enrollment_status ?? "—")}</span>
        } />
      </div>
      <Footer doc={doc} />
    </article>
  );
}

export function OfficialTranscript({
  doc, student, site, courses,
}: { doc: DocumentBase; student: StudentInfo; site: SiteInfo; courses: TranscriptCourse[] }) {
  const totalHours = courses.reduce((s, c) => s + Number(c.credit_hours || 0), 0);
  const passedHours = courses
    .filter((c) => c.course_status === "passed")
    .reduce((s, c) => s + Number(c.credit_hours || 0), 0);
  const avg = courses.length > 0
    ? Math.round((courses.reduce((s, c) => s + Number(c.percentage || 0), 0) / courses.length) * 100) / 100
    : 0;
  return (
    <article dir="rtl" className="bg-white text-foreground p-8 max-w-4xl mx-auto print:max-w-none">
      <Header site={site} title={DOC_TYPE_LABEL.official_transcript} />
      <div className="rounded border border-border p-4 space-y-1 mb-4">
        <Field label="اسم الطالب" value={student.full_name_ar} />
        <Field label="الرقم الأكاديمي" value={student.academic_number} />
        <Field label="القسم" value={student.department_name} />
        <Field label="البرنامج" value={student.program_name} />
      </div>
      <table className="w-full text-sm border border-border">
        <thead className="bg-secondary text-primary">
          <tr>
            <th className="p-2 border border-border">العام</th>
            <th className="p-2 border border-border">الفصل</th>
            <th className="p-2 border border-border">الرمز</th>
            <th className="p-2 border border-border">المقرر</th>
            <th className="p-2 border border-border">الساعات</th>
            <th className="p-2 border border-border">النسبة</th>
            <th className="p-2 border border-border">النتيجة</th>
          </tr>
        </thead>
        <tbody>
          {courses.length === 0 ? (
            <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">لا توجد مقررات معتمدة.</td></tr>
          ) : courses.map((c, i) => (
            <tr key={i}>
              <td className="p-2 border border-border">{c.academic_year_name}</td>
              <td className="p-2 border border-border">{c.semester_name}</td>
              <td className="p-2 border border-border font-mono">{c.course_code}</td>
              <td className="p-2 border border-border">{c.course_name}</td>
              <td className="p-2 border border-border text-center">{c.credit_hours}</td>
              <td className="p-2 border border-border text-center">{Number(c.percentage).toFixed(2)}%</td>
              <td className="p-2 border border-border text-center font-bold">
                {c.course_status === "passed" ? "ناجح" : "راسب"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div className="rounded border border-border p-3 text-center">
          <div className="text-xs text-muted-foreground">إجمالي الساعات</div>
          <div className="font-bold text-primary text-lg">{totalHours}</div>
        </div>
        <div className="rounded border border-border p-3 text-center">
          <div className="text-xs text-muted-foreground">الساعات الناجحة</div>
          <div className="font-bold text-primary text-lg">{passedHours}</div>
        </div>
        <div className="rounded border border-border p-3 text-center">
          <div className="text-xs text-muted-foreground">متوسط النسبة</div>
          <div className="font-bold text-primary text-lg">{avg}%</div>
        </div>
      </div>
      <Footer doc={doc} />
    </article>
  );
}

export function FinancialReceipt({
  doc, student, site, receipt,
}: { doc: DocumentBase; student: StudentInfo; site: SiteInfo; receipt: ReceiptInfo }) {
  return (
    <article dir="rtl" className="bg-white text-foreground p-8 max-w-3xl mx-auto print:max-w-none">
      <Header site={site} title={DOC_TYPE_LABEL.financial_receipt} />
      <div className="rounded border border-border p-4 space-y-1 mb-4">
        <Field label="اسم الطالب" value={student.full_name_ar} />
        <Field label="الرقم الأكاديمي" value={student.academic_number} />
        <Field label="القسم" value={student.department_name} />
      </div>
      <div className="rounded border-2 border-primary p-4 space-y-1 bg-secondary/20">
        <Field label="رقم السند" value={receipt.receipt_number} />
        <Field label="نوع الرسم" value={receipt.fee_type} />
        <Field label="المبلغ" value={
          <span className="font-bold text-primary text-lg">{Number(receipt.amount).toLocaleString("ar-EG")} ج.م</span>
        } />
        <Field label="تاريخ الدفع" value={new Date(receipt.payment_date).toLocaleDateString("ar-EG")} />
        <Field label="وسيلة الدفع" value={
          receipt.payment_method === "cash" ? "نقدي" :
          receipt.payment_method === "bank_transfer" ? "تحويل بنكي" : "أخرى"
        } />
      </div>
      <Footer doc={doc} />
    </article>
  );
}
