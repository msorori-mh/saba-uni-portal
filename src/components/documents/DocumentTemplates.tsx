// Phase 9A + 10A: printable official documents with QR + security banner.
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
  college_logo_url?: string | null;
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

const SECURITY_NOTICE =
  "يمكن التحقق من صحة هذه الوثيقة عبر بوابة الجامعة باستخدام رمز التحقق أو رمز QR.";

function Header({ site, title }: { site: SiteInfo; title: string }) {
  return (
    <header className="border-b-2 border-primary pb-4 mb-6">
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {site.logo_url ? (
          <img src={site.logo_url} alt="شعار الجامعة" className="h-12 w-12 sm:h-20 sm:w-20 object-contain print:h-20 print:w-20" />
        ) : <div className="h-12 w-12 sm:h-20 sm:w-20 print:h-20 print:w-20" />}
        <div className="text-center flex-1">
          <h1 className="font-display text-lg sm:text-2xl font-extrabold text-primary break-words">
            {site.university_name}
          </h1>
          <h2 className="font-display text-sm sm:text-base font-bold text-primary/80 mt-1 break-words">
            {site.college_name}
          </h2>
          <div className="mt-3 inline-block rounded border-2 border-primary px-3 sm:px-5 py-1 font-display text-sm sm:text-base font-extrabold text-primary break-words">
            {title}
          </div>
        </div>
        {site.college_logo_url ? (
          <img src={site.college_logo_url} alt="شعار الكلية" className="h-12 w-12 sm:h-20 sm:w-20 object-contain print:h-20 print:w-20" />
        ) : site.logo_url ? (
          <img src={site.logo_url} alt="" className="h-12 w-12 sm:h-20 sm:w-20 object-contain opacity-80 print:h-20 print:w-20" />
        ) : <div className="h-12 w-12 sm:h-20 sm:w-20 print:h-20 print:w-20" />}
      </div>
    </header>
  );
}

function Footer({ doc, qrDataUrl }: { doc: DocumentBase; qrDataUrl?: string | null }) {
  const issued = new Date(doc.issued_at).toLocaleDateString("ar-EG", {
    year: "numeric", month: "long", day: "numeric",
  });
  return (
    <footer className="mt-10 pt-4 border-t-2 border-primary text-xs text-foreground">
      <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
        <div className="space-y-1">
          <div><span className="font-bold text-primary">رقم الوثيقة:</span> <span className="font-mono">{doc.document_number}</span></div>
          <div><span className="font-bold text-primary">رمز التحقق:</span> <span className="font-mono">{doc.verification_code}</span></div>
          <div><span className="font-bold text-primary">تاريخ الإصدار:</span> {issued}</div>
          <div className="mt-2 text-[11px] text-muted-foreground leading-5">
            {SECURITY_NOTICE}
          </div>
        </div>
        {qrDataUrl ? (
          <div className="text-center">
            <img src={qrDataUrl} alt="رمز التحقق QR" className="h-24 w-24 border border-border rounded" />
            <div className="text-[10px] text-muted-foreground mt-1">امسح للتحقق</div>
          </div>
        ) : null}
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
    <div className="flex flex-col gap-0.5 py-1 border-b border-dashed border-border last:border-0 sm:flex-row sm:gap-2 print:flex-row print:gap-2">
      <span className="font-bold text-primary sm:min-w-[140px] print:min-w-[140px]">{label}:</span>
      <span className="text-foreground break-words">{value ?? "—"}</span>
    </div>
  );
}

type WithQR = { qrDataUrl?: string | null };

export function EnrollmentCertificate({
  doc, student, site, qrDataUrl,
}: { doc: DocumentBase; student: StudentInfo; site: SiteInfo } & WithQR) {
  return (
    <article dir="rtl" className="bg-white text-foreground p-4 sm:p-8 print:p-8 max-w-3xl mx-auto print:max-w-none">
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
      <Footer doc={doc} qrDataUrl={qrDataUrl} />
    </article>
  );
}

export function StatusCertificate({
  doc, student, site, qrDataUrl,
}: { doc: DocumentBase; student: StudentInfo; site: SiteInfo } & WithQR) {
  return (
    <article dir="rtl" className="bg-white text-foreground p-4 sm:p-8 print:p-8 max-w-3xl mx-auto print:max-w-none">
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
      <Footer doc={doc} qrDataUrl={qrDataUrl} />
    </article>
  );
}

export function OfficialTranscript({
  doc, student, site, courses, qrDataUrl,
}: { doc: DocumentBase; student: StudentInfo; site: SiteInfo; courses: TranscriptCourse[] } & WithQR) {
  const totalHours = courses.reduce((s, c) => s + Number(c.credit_hours || 0), 0);
  const passedHours = courses
    .filter((c) => c.course_status === "passed")
    .reduce((s, c) => s + Number(c.credit_hours || 0), 0);
  const avg = courses.length > 0
    ? Math.round((courses.reduce((s, c) => s + Number(c.percentage || 0), 0) / courses.length) * 100) / 100
    : 0;
  return (
    <article dir="rtl" className="bg-white text-foreground p-4 sm:p-8 print:p-8 max-w-4xl mx-auto print:max-w-none">
      <Header site={site} title={DOC_TYPE_LABEL.official_transcript} />
      <div className="rounded border border-border p-4 space-y-1 mb-4">
        <Field label="اسم الطالب" value={student.full_name_ar} />
        <Field label="الرقم الأكاديمي" value={student.academic_number} />
        <Field label="القسم" value={student.department_name} />
        <Field label="البرنامج" value={student.program_name} />
      </div>
      <div className="-mx-1 overflow-x-auto print:overflow-visible print:mx-0">
      <table className="w-full min-w-[560px] text-xs sm:text-sm print:min-w-0 print:text-sm border border-border">
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
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-4 text-sm">
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
      <Footer doc={doc} qrDataUrl={qrDataUrl} />
    </article>
  );
}

export function FinancialReceipt({
  doc, student, site, receipt, qrDataUrl,
}: { doc: DocumentBase; student: StudentInfo; site: SiteInfo; receipt: ReceiptInfo } & WithQR) {
  return (
    <article dir="rtl" className="bg-white text-foreground p-4 sm:p-8 print:p-8 max-w-3xl mx-auto print:max-w-none">
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
      <Footer doc={doc} qrDataUrl={qrDataUrl} />
    </article>
  );
}
