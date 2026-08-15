import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText, Loader2, Eye, ShieldCheck, Printer, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StandardCard } from "@/components/brand";

function openDoc(id: string, withPrint = false) {
  const url = withPrint ? `/document-view/${id}?print=1` : `/document-view/${id}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const TYPE_LABEL: Record<string, string> = {
  enrollment_certificate: "شهادة قيد",
  student_status_certificate: "إفادة بالحالة الدراسية",
  official_transcript: "السجل الأكاديمي الرسمي",
  financial_receipt: "سند مالي رسمي",
};

export function StudentDocumentsSection({ studentProfileId }: { studentProfileId: string }) {
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["student-official-documents", studentProfileId],
    enabled: !!studentProfileId,
    queryFn: async () => {
      const { data, error } = await sb.from("official_documents")
        .select("id, document_type, document_number, verification_code, status, issued_at")
        .eq("student_profile_id", studentProfileId)
        .order("issued_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  return (
    <section className="mt-6">
      <h2 className="font-display text-base font-bold text-primary mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-gold" /> الوثائق الرسمية
      </h2>

      {isLoading ? (
        <StandardCard className="grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </StandardCard>
      ) : docs.length === 0 ? (
        <StandardCard className="border-dashed text-center text-sm text-muted-foreground space-y-1.5 py-6">
          <p className="font-semibold text-primary">لا توجد وثائق رسمية صادرة لك حالياً.</p>
          <p className="text-xs">يمكنك طلب الوثائق المتاحة من قسم الخدمات الطلابية.</p>
        </StandardCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {docs.map((d: { id: string; document_type: string; document_number: string; verification_code: string; status: string; issued_at: string }) => (
            <div key={d.id} className="rounded-xl bg-card border border-border p-4 flex flex-col gap-2 hover:border-gold transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-gold-gradient text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-bold text-primary text-sm">{TYPE_LABEL[d.document_type] ?? d.document_type}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{d.document_number}</div>
                  </div>
                </div>
                <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                  d.status === "issued" ? "bg-emerald-100 text-emerald-700" :
                  d.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {d.status === "issued" ? "صادرة" : d.status === "cancelled" ? "ملغاة" : "مسودة"}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                تاريخ الإصدار: {new Date(d.issued_at).toLocaleDateString("ar-EG")}
              </div>
              <div className="text-[11px] text-muted-foreground">
                رمز التحقق: <span className="font-mono">{d.verification_code}</span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <Link
                  to="/verify-document"
                  search={{ code: d.verification_code }}
                  target="_blank"
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-bold text-primary hover:border-gold col-span-2"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> تحقق
                </Link>
                {d.status === "cancelled" ? (
                  <div
                    data-testid="student-doc-cancelled-notice"
                    className="col-span-2 rounded-lg border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[11px] font-bold text-destructive text-center"
                  >
                    الوثيقة ملغاة وغير صالحة للاستخدام
                  </div>
                ) : d.status === "issued" || d.status === "archived" ? (
                  <>
                    <Link
                      to="/document-view/$id"
                      params={{ id: d.id }}
                      target="_blank"
                      className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-bold text-primary-foreground"
                    >
                      <Eye className="h-3.5 w-3.5" /> عرض
                    </Link>
                    <button
                      type="button"
                      onClick={() => openDoc(d.id, true)}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-bold text-primary hover:border-gold"
                    >
                      <Printer className="h-3.5 w-3.5" /> طباعة
                    </button>
                    <button
                      type="button"
                      onClick={() => openDoc(d.id, true)}
                      className="col-span-2 inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-[11px] font-bold text-primary hover:border-gold"
                    >
                      <Download className="h-3.5 w-3.5" /> PDF
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
