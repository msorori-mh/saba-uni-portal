import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { usePagePerf } from "@/lib/perf-probe";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, FileText, Plus, Eye, XCircle, ShieldCheck } from "lucide-react";
import {
  listOfficialDocuments,
  searchStudentsForDocument,
  issueOfficialDocument,
  cancelOfficialDocument,
} from "@/lib/admin-documents.functions";
import { sendNotificationEmail } from "@/lib/email.functions";

import { portalFeatures } from "@/lib/portal-features";

export const Route = createLazyFileRoute("/admin/documents")({
  component: AdminDocumentsPage,
});

const TYPE_LABEL: Record<string, string> = {
  enrollment_certificate: "شهادة قيد",
  student_status_certificate: "إفادة بالحالة الدراسية",
  official_transcript: "السجل الأكاديمي الرسمي",
  financial_receipt: "سند مالي رسمي",
};

const TYPES = ALL_TYPES.filter((t) => portalFeatures.adminFinance || t !== "financial_receipt");

function AdminDocumentsPage() {
  usePagePerf("/admin/documents");
  const qc = useQueryClient();
  const listDocsFn = useServerFn(listOfficialDocuments);
  const cancelDocFn = useServerFn(cancelOfficialDocument);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [issueOpen, setIssueOpen] = useState(false);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["admin-documents", typeFilter, statusFilter, search],
    queryFn: () => listDocsFn({
      data: {
        type: typeFilter && TYPES.includes(typeFilter)
          ? (typeFilter as "enrollment_certificate" | "student_status_certificate" | "official_transcript" | "financial_receipt")
          : undefined,
        status: statusFilter ? (statusFilter as "issued" | "cancelled" | "draft") : undefined,
        search: search.trim() || undefined,
      },
    }),
  });

  const counts = {
    total: docs.length,
    certs: docs.filter(d => d.document_type.includes("certificate")).length,
    transcripts: docs.filter(d => d.document_type === "official_transcript").length,
    receipts: docs.filter(d => d.document_type === "financial_receipt").length,
  };

  const handleCancel = async (id: string) => {
    if (!confirm("هل تريد إلغاء هذه الوثيقة؟ لن يمكن استخدامها بعد ذلك.")) return;
    try {
      await cancelDocFn({ data: { documentId: id } });
      qc.invalidateQueries({ queryKey: ["admin-documents"] });
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-primary">الوثائق الرسمية</h1>
          <p className="text-sm text-muted-foreground mt-1">إصدار وإدارة الشهادات والسجلات الأكاديمية والسندات المالية.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/verify-document" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold text-primary">
            <ShieldCheck className="h-4 w-4" /> صفحة التحقق
          </Link>
          <button onClick={() => setIssueOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
            <Plus className="h-4 w-4" /> إصدار وثيقة
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "إجمالي", value: counts.total },
          { label: "الشهادات", value: counts.certs },
          { label: "السجلات", value: counts.transcripts },
          ...(portalFeatures.adminFinance ? [{ label: "السندات المالية", value: counts.receipts }] : []),
        ].map(c => (
          <div key={c.label} className="rounded-xl bg-card border border-border p-4">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="font-display text-2xl font-extrabold text-primary mt-1">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-card border border-border p-4 flex flex-wrap gap-3 items-end">
        <label className="flex-1 min-w-[200px]">
          <span className="text-xs font-bold text-muted-foreground">بحث (الرقم الأكاديمي / الاسم / رقم الوثيقة)</span>
          <div className="relative mt-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={e=>setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-9 py-2 text-sm" />
          </div>
        </label>
        <label>
          <span className="text-xs font-bold text-muted-foreground">النوع</span>
          <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className="block mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">الكل</option>
            {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </label>
        <label>
          <span className="text-xs font-bold text-muted-foreground">الحالة</span>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="block mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">الكل</option>
            <option value="issued">صادرة</option>
            <option value="cancelled">ملغاة</option>
            <option value="draft">مسودة</option>
          </select>
        </label>
      </div>

      <div className="rounded-xl bg-card border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : docs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">لا توجد وثائق.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary text-primary">
              <tr>
                <th className="p-3 text-right">رقم الوثيقة</th>
                <th className="p-3 text-right">النوع</th>
                <th className="p-3 text-right">الطالب</th>
                <th className="p-3 text-right">الرقم الأكاديمي</th>
                <th className="p-3 text-right">رمز التحقق</th>
                <th className="p-3 text-right">الحالة</th>
                <th className="p-3 text-right">التاريخ</th>
                <th className="p-3 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id} className="border-t border-border">
                  <td className="p-3 font-mono text-xs">{d.document_number}</td>
                  <td className="p-3">{TYPE_LABEL[d.document_type]}</td>
                  <td className="p-3">{d.student?.full_name_ar ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{d.student?.academic_number ?? "—"}</td>
                  <td className="p-3 font-mono text-xs">{d.verification_code}</td>
                  <td className="p-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${
                      d.status === "issued" ? "bg-emerald-100 text-emerald-700" :
                      d.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {d.status === "issued" ? "صادرة" : d.status === "cancelled" ? "ملغاة" : "مسودة"}
                    </span>
                  </td>
                  <td className="p-3 text-xs">{new Date(d.issued_at).toLocaleDateString("ar-EG")}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Link to="/document-view/$id" params={{ id: d.id }} target="_blank"
                        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-bold text-primary">
                        <Eye className="h-3 w-3" /> عرض
                      </Link>
                      {d.status === "issued" && (
                        <button onClick={() => handleCancel(d.id)}
                          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-bold text-destructive">
                          <XCircle className="h-3 w-3" /> إلغاء
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {issueOpen && <IssueDialog onClose={() => setIssueOpen(false)} onIssued={() => { setIssueOpen(false); qc.invalidateQueries({ queryKey: ["admin-documents"] }); }} />}
    </div>
  );
}

function IssueDialog({ onClose, onIssued }: { onClose: () => void; onIssued: () => void }) {
  const searchFn = useServerFn(searchStudentsForDocument);
  const issueFn = useServerFn(issueOfficialDocument);
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState<string>("");
  const [studentLabel, setStudentLabel] = useState<string>("");
  const [docType, setDocType] = useState<string>("enrollment_certificate");
  const [loading, setLoading] = useState(false);

  const { data: results = [] } = useQuery({
    queryKey: ["issue-doc-search", search],
    enabled: search.length >= 2,
    queryFn: () => searchFn({ data: { query: search } }),
  });

  const handleIssue = async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const result = await issueFn({
        data: {
          studentProfileId: studentId,
          documentType: docType as "enrollment_certificate" | "student_status_certificate" | "official_transcript" | "financial_receipt",
        },
      });
      alert(`تم إصدار الوثيقة: ${result.document_number}`);
      if (result.student_email && result.document_number) {
        sendNotificationEmail({ data: {
          templateKey: "document_issued",
          recipientEmail: result.student_email,
          recipientName: result.student_name,
          variables: {
            document_type: TYPE_LABEL[docType] ?? docType,
            document_number: result.document_number,
            verification_code: result.verification_code ?? "",
            document_url: result.document_url ?? null,
            verify_url: result.verify_url ?? null,
          },
          relatedEntityType: "official_document",
          relatedEntityId: result.id ?? null,
        } }).catch(() => undefined);
      }
      onIssued();
    } catch (e) { alert((e as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} className="bg-card rounded-xl border border-border p-6 max-w-md w-full space-y-4" dir="rtl">
        <h2 className="font-display text-lg font-extrabold text-primary flex items-center gap-2"><FileText className="h-5 w-5" /> إصدار وثيقة جديدة</h2>

        <label className="block">
          <span className="text-xs font-bold">نوع الوثيقة</span>
          <select value={docType} onChange={e=>setDocType(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-bold">الطالب</span>
          {studentId ? (
            <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
              <span>{studentLabel}</span>
              <button onClick={()=>{setStudentId(""); setStudentLabel("");}} className="text-xs text-destructive">تغيير</button>
            </div>
          ) : (
            <>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث بالرقم الأكاديمي أو الاسم..."
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              {results.length > 0 && (
                <div className="mt-1 rounded-lg border border-border max-h-40 overflow-y-auto">
                  {results.map((r) => (
                    <button key={r.id} onClick={() => { setStudentId(r.id); setStudentLabel(`${r.full_name_ar} (${r.academic_number})`); setSearch(""); }}
                      className="block w-full text-right px-3 py-2 text-sm hover:bg-secondary">
                      {r.full_name_ar} <span className="font-mono text-xs text-muted-foreground">({r.academic_number})</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </label>

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border">إلغاء</button>
          <button onClick={handleIssue} disabled={!studentId || loading} className="px-4 py-2 text-sm font-bold rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "إصدار"}
          </button>
        </div>
      </div>
    </div>
  );
}
