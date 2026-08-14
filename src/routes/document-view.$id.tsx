import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
// QRCode is lazy-loaded (Phase PERF-01) — pulled in only when a document renders.
import { Loader2, Printer, ArrowRight, XCircle, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logDocumentAction } from "@/lib/document-audit.functions";
import { getOfficialDocumentSignedUrl } from "@/lib/documents/official-document-download.functions";
import { downloadOfficialDocumentPdf } from "@/lib/documents/official-document-actions";
import {
  EnrollmentCertificate, StatusCertificate, OfficialTranscript, FinancialReceipt,
  type DocumentBase, type StudentInfo, type SiteInfo, type TranscriptCourse, type ReceiptInfo,
} from "@/components/documents/DocumentTemplates";

export const Route = createFileRoute("/document-view/$id")({
  component: DocumentViewPage,
  head: () => ({ meta: [{ title: "عرض الوثيقة الرسمية" }, { name: "robots", content: "noindex,nofollow" }] }),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function DocumentViewPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const autoprint = typeof window !== "undefined" && window.location.search.includes("print=1");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const auditFn = useServerFn(logDocumentAction);
  const signFn = useServerFn(getOfficialDocumentSignedUrl);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const loggedPrintRef = useRef(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["official-document-view", id],
    queryFn: async () => {
      const { data: doc, error: e1 } = await sb.from("official_documents")
        .select("*").eq("id", id).maybeSingle();
      if (e1) throw new Error(e1.message);
      if (!doc) throw new Error("الوثيقة غير موجودة");

      const { data: student, error: e2 } = await sb.from("student_profiles")
        .select("id, academic_number, full_name_ar, full_name_en, national_id, department:departments(name_ar), program:programs(name_ar)")
        .eq("id", doc.student_profile_id).maybeSingle();
      if (e2) throw new Error(e2.message);

      const { data: status } = await sb.from("student_academic_status")
        .select("enrollment_status, academic_year:academic_years(name), semester:semesters(name), level:academic_levels(name)")
        .eq("student_profile_id", doc.student_profile_id)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();

      const { data: settings } = await sb.from("site_settings")
        .select("setting_key, setting_value").in("setting_key", ["university_name", "college_name", "logo_url", "college_logo_url"]);
      const settingMap = new Map<string, string>();
      (settings ?? []).forEach((r: { setting_key: string; setting_value: string }) =>
        settingMap.set(r.setting_key, r.setting_value));

      const site: SiteInfo = {
        university_name: settingMap.get("university_name") ?? "جامعة سبأ",
        college_name: settingMap.get("college_name") ?? "كلية تكنولوجيا المعلومات وعلوم الحاسوب",
        logo_url: settingMap.get("logo_url") ?? null,
        college_logo_url: settingMap.get("college_logo_url") ?? null,
      };

      const studentInfo: StudentInfo = {
        full_name_ar: student?.full_name_ar ?? "—",
        full_name_en: student?.full_name_en ?? null,
        academic_number: student?.academic_number ?? "—",
        national_id: student?.national_id ?? null,
        department_name: student?.department?.name_ar ?? null,
        program_name: student?.program?.name_ar ?? null,
        level_name: status?.level?.name ?? null,
        academic_year: status?.academic_year?.name ?? null,
        semester: status?.semester?.name ?? null,
        enrollment_status: status?.enrollment_status ?? null,
      };

      let courses: TranscriptCourse[] = [];
      if (doc.document_type === "official_transcript") {
        const { data: tx } = await sb.from("student_unofficial_transcript")
          .select("course_code, course_name, credit_hours, percentage, course_status, semester_name, academic_year_name")
          .eq("student_profile_id", doc.student_profile_id);
        courses = (tx ?? []) as TranscriptCourse[];
      }

      let receipt: ReceiptInfo | null = null;
      if (doc.document_type === "financial_receipt") {
        const meta = (doc.metadata ?? {}) as Record<string, unknown>;
        const paymentId = meta.student_payment_id as string | undefined;
        if (paymentId) {
          const { data: pay } = await sb.from("student_payments")
            .select("receipt_number, amount, payment_date, payment_method, fee:student_fees(fee_type:fee_types(name_ar))")
            .eq("id", paymentId).maybeSingle();
          if (pay) {
            receipt = {
              receipt_number: pay.receipt_number,
              amount: Number(pay.amount),
              payment_date: pay.payment_date,
              payment_method: pay.payment_method,
              fee_type: pay.fee?.fee_type?.name_ar ?? null,
            };
          }
        }
        if (!receipt) {
          receipt = {
            receipt_number: String(meta.receipt_number ?? doc.document_number),
            amount: Number(meta.amount ?? 0),
            payment_date: String(meta.payment_date ?? doc.issued_at),
            payment_method: String(meta.payment_method ?? "cash"),
            fee_type: (meta.fee_type as string | undefined) ?? null,
          };
        }
      }

      return { doc: doc as DocumentBase, student: studentInfo, site, courses, receipt };
    },
  });

  // Generate QR code data URL pointing to verification page (lazy-loaded qrcode lib)
  useEffect(() => {
    if (!data?.doc?.verification_code) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/verify-document?code=${encodeURIComponent(data.doc.verification_code)}`;
    let cancelled = false;
    import("qrcode")
      .then((mod) => mod.default.toDataURL(url, { width: 240, margin: 1, errorCorrectionLevel: "M" }))
      .then((u) => { if (!cancelled) setQrDataUrl(u); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [data?.doc?.verification_code]);

  // Best-effort: log print event (browser fires beforeprint on Ctrl+P too)
  useEffect(() => {
    if (!data) return;
    const onBeforePrint = () => {
      if (loggedPrintRef.current) return;
      loggedPrintRef.current = true;
      auditFn({ data: { documentId: id, action: "document_printed" } }).catch(() => undefined);
    };
    window.addEventListener("beforeprint", onBeforePrint);
    return () => window.removeEventListener("beforeprint", onBeforePrint);
  }, [data, id, auditFn]);

  useEffect(() => {
    if (autoprint && data && qrDataUrl !== null) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [autoprint, data, qrDataUrl]);

  const handlePrint = () => window.print();
  // Real PDF download: server authorizes ownership/status and returns a
  // short-lived signed URL. Never window.print().
  const handleDownload = async () => {
    setDownloadError(null);
    setDownloading(true);
    const res = await downloadOfficialDocumentPdf(
      id,
      data?.doc?.status,
      async (documentId) =>
        (await signFn({ data: { officialDocumentId: documentId } })) as {
          signedUrl: string;
          expiresInSeconds: number;
        },
    );
    setDownloading(false);
    if (!res.ok) { setDownloadError(res.error); return; }
    auditFn({ data: { documentId: id, action: "document_downloaded" } }).catch(() => undefined);
  };

  if (isLoading) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (error || !data) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="text-center">
          <XCircle className="h-10 w-10 text-destructive mx-auto" />
          <p className="mt-2 font-bold text-destructive">{(error as Error)?.message ?? "تعذر تحميل الوثيقة"}</p>
          <button onClick={() => navigate({ to: "/" })} className="mt-3 text-sm underline">العودة</button>
        </div>
      </div>
    );
  }

  const { doc, student, site, courses, receipt } = data;

  return (
    <div dir="rtl" className="min-h-screen bg-muted/30">
      <div className="print:hidden sticky top-0 z-10 bg-card border-b border-border p-3 flex items-center gap-3 justify-between">
        <button onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary">
          <ArrowRight className="h-4 w-4" /> رجوع
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleDownload()}
            disabled={downloading}
            data-testid="document-download"
            className="disabled:opacity-50 inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-primary hover:border-gold"
          >
            <Download className="h-4 w-4" /> تنزيل PDF
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            <Printer className="h-4 w-4" /> طباعة
          </button>
        </div>
      </div>
      {downloadError ? (
        <div className="print:hidden mx-auto mt-3 max-w-3xl rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-xs font-bold text-destructive">
          {downloadError}
        </div>
      ) : null}
      <div className="py-6 print:py-0">
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
