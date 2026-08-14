import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Download, Loader2, Printer, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logDocumentAction } from "@/lib/document-audit.functions";
import { getOfficialDocumentSignedUrl } from "@/lib/documents/official-document-download.functions";
import {
  downloadOfficialDocumentPdf,
  printOfficialDocument,
  printActionLabel,
  isDownloadableStatus,
  documentNotDownloadableMessage,
} from "@/lib/documents/official-document-actions";
import {
  EnrollmentCertificate, StatusCertificate, OfficialTranscript, FinancialReceipt,
  type DocumentBase, type StudentInfo, type SiteInfo, type TranscriptCourse, type ReceiptInfo,
} from "@/components/documents/DocumentTemplates";

export const Route = createFileRoute("/mobile/student/documents/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "عرض الوثيقة الرسمية" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MobileDocumentView,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function MobileDocumentView() {
  const { id } = Route.useParams();
  const auditFn = useServerFn(logDocumentAction);
  const signFn = useServerFn(getOfficialDocumentSignedUrl);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "download" | "print">(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["mobile-official-document", id],
    queryFn: async () => {
      const { data: auth } = await sb.auth.getUser();
      if (!auth?.user) throw new Error("غير مسجل الدخول");
      const { data: profile } = await sb.from("student_profiles")
        .select("id, academic_number, full_name_ar, full_name_en, national_id, user_id, department:departments(name_ar), program:programs(name_ar)")
        .eq("user_id", auth.user.id).maybeSingle();
      if (!profile?.id) throw new Error("ليس لديك صلاحية الوصول إلى هذه الوثيقة");

      // Owner-only: scope the read by the caller's own student profile.
      const { data: doc, error: e1 } = await sb.from("official_documents")
        .select("*").eq("id", id).eq("student_profile_id", profile.id).maybeSingle();
      if (e1) throw new Error(e1.message);
      if (!doc) throw new Error("ليس لديك صلاحية الوصول إلى هذه الوثيقة");

      const { data: status } = await sb.from("student_academic_status")
        .select("enrollment_status, academic_year:academic_years(name), semester:semesters(name), level:academic_levels(name)")
        .eq("student_profile_id", profile.id)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();

      const { data: settings } = await sb.from("site_settings")
        .select("setting_key, setting_value")
        .in("setting_key", ["university_name", "college_name", "logo_url", "college_logo_url"]);
      const map = new Map<string, string>();
      (settings ?? []).forEach((r: { setting_key: string; setting_value: string }) =>
        map.set(r.setting_key, r.setting_value));

      const site: SiteInfo = {
        university_name: map.get("university_name") ?? "جامعة سبأ",
        college_name: map.get("college_name") ?? "كلية تكنولوجيا المعلومات وعلوم الحاسوب",
        logo_url: map.get("logo_url") ?? null,
        college_logo_url: map.get("college_logo_url") ?? null,
      };

      const student: StudentInfo = {
        full_name_ar: profile.full_name_ar ?? "—",
        full_name_en: profile.full_name_en ?? null,
        academic_number: profile.academic_number ?? "—",
        national_id: profile.national_id ?? null,
        department_name: profile.department?.name_ar ?? null,
        program_name: profile.program?.name_ar ?? null,
        level_name: status?.level?.name ?? null,
        academic_year: status?.academic_year?.name ?? null,
        semester: status?.semester?.name ?? null,
        enrollment_status: status?.enrollment_status ?? null,
      };

      let courses: TranscriptCourse[] = [];
      if (doc.document_type === "official_transcript") {
        const { data: tx } = await sb.from("student_unofficial_transcript")
          .select("course_code, course_name, credit_hours, percentage, course_status, semester_name, academic_year_name")
          .eq("student_profile_id", profile.id);
        courses = (tx ?? []) as TranscriptCourse[];
      }

      let receipt: ReceiptInfo | null = null;
      if (doc.document_type === "financial_receipt") {
        const meta = (doc.metadata ?? {}) as Record<string, unknown>;
        receipt = {
          receipt_number: String(meta.receipt_number ?? doc.document_number),
          amount: Number(meta.amount ?? 0),
          payment_date: String(meta.payment_date ?? doc.issued_at),
          payment_method: String(meta.payment_method ?? "cash"),
          fee_type: (meta.fee_type as string | undefined) ?? null,
        };
      }

      return { doc: doc as DocumentBase, student, site, courses, receipt };
    },
  });

  useEffect(() => {
    const code = data?.doc?.verification_code;
    if (!code) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    let cancelled = false;
    import("qrcode")
      .then((m) => m.default.toDataURL(`${origin}/verify-document?code=${encodeURIComponent(code)}`, { width: 240, margin: 1, errorCorrectionLevel: "M" }))
      .then((u) => { if (!cancelled) setQrDataUrl(u); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [data?.doc?.verification_code]);

  const resolveSignedUrl = async (documentId: string) =>
    (await signFn({ data: { officialDocumentId: documentId } })) as { signedUrl: string; expiresInSeconds: number };

  const onDownload = async () => {
    setMessage(null);
    setBusy("download");
    const res = await downloadOfficialDocumentPdf(id, data?.doc?.status, resolveSignedUrl);
    setBusy(null);
    if (!res.ok) { setMessage(res.error); return; }
    auditFn({ data: { documentId: id, action: "document_downloaded" } }).catch(() => undefined);
  };

  const onPrint = async () => {
    setMessage(null);
    setBusy("print");
    const res = await printOfficialDocument(id, data?.doc?.status, resolveSignedUrl);
    setBusy(null);
    if (!res.ok) { setMessage(res.error); return; }
    auditFn({ data: { documentId: id, action: "document_printed" } }).catch(() => undefined);
  };

  if (isLoading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-4 py-6" dir="rtl">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
          <XCircle className="mx-auto mb-2 h-6 w-6 text-destructive" />
          <div className="text-sm font-bold text-destructive">
            {(error as Error)?.message ?? "تعذر تحميل الوثيقة"}
          </div>
          <Link
            to="/mobile/student/documents"
            className="mt-3 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
          >
            <ArrowRight className="h-3.5 w-3.5" /> الوثائق
          </Link>
        </div>
      </div>
    );
  }

  const { doc, student, site, courses, receipt } = data;
  const downloadable = isDownloadableStatus(doc.status);

  return (
    <div dir="rtl" className="pb-6">
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-2">
        <Link
          to="/mobile/student/documents"
          aria-label="رجوع إلى الوثائق"
          data-testid="mobile-document-back"
          className="grid h-8 w-8 place-items-center rounded-lg border border-border text-primary"
        >
          <ArrowRight className="h-4 w-4" />
        </Link>
        <div className="truncate text-xs font-bold text-primary">{doc.document_number}</div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onDownload}
            disabled={!downloadable || busy !== null}
            data-testid="mobile-document-download"
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy === "download" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            تنزيل PDF
          </button>
          <button
            type="button"
            onClick={onPrint}
            disabled={!downloadable || busy !== null}
            data-testid="mobile-document-print"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-primary disabled:opacity-50"
          >
            {busy === "print" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
            {printActionLabel()}
          </button>
        </div>
      </div>

      {!downloadable ? (
        <div className="mx-3 mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] font-bold text-destructive">
          {documentNotDownloadableMessage(doc.status)}
        </div>
      ) : null}
      {message ? (
        <div className="mx-3 mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] font-bold text-destructive">
          {message}
        </div>
      ) : null}

      <div className="w-full overflow-x-hidden px-2 py-3 print:p-0">
        {doc.document_type === "enrollment_certificate" && (
          <EnrollmentCertificate doc={doc} student={student} site={site} qrDataUrl={qrDataUrl} />
        )}
        {doc.document_type === "student_status_certificate" && (
          <StatusCertificate doc={doc} student={student} site={site} qrDataUrl={qrDataUrl} />
        )}
        {doc.document_type === "official_transcript" && (
          <OfficialTranscript doc={doc} student={student} site={site} courses={courses} qrDataUrl={qrDataUrl} />
        )}
        {doc.document_type === "financial_receipt" && receipt && (
          <FinancialReceipt doc={doc} student={student} site={site} receipt={receipt} qrDataUrl={qrDataUrl} />
        )}
      </div>
    </div>
  );
}
