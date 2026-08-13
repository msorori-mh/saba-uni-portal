import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Loader2,
  Plus,
  Upload,
  Send,
  Archive,
  FileText,
  BarChart3,
  ScrollText,
} from "lucide-react";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { readFileAsBase64 } from "@/lib/file-upload";
import {
  listMyCourseMaterials,
  listPlanSessionsForMaterials,
  createCourseMaterial,
  uploadCourseMaterialFile,
  publishCourseMaterial,
  archiveCourseMaterial,
  getCourseMaterialsUsageReport,
  listCourseMaterialAccessLogs,
} from "@/lib/faculty-materials.functions";
import { getCourseMaterialDownloadUrl } from "@/lib/student-materials.functions";
import {
  MATERIALS_ALLOWED_MIME,
  MATERIALS_ALLOWED_EXT,
  MATERIALS_MAX_BYTES_DEFAULT,
  STATUS_LABELS,
  MATERIAL_SCOPES,
  MATERIAL_SCOPE_LABELS,
  formatPlanSessionOptionLabel,
  studySystemLabel,
  SCAN_STATE_LABELS,
  MATERIAL_ACCESS_EVENT_LABELS,
  formatWeekLectureLabel,
  isMaterialFileDownloadable,
  isMaterialScanState,
  type MaterialAccessEvent,
  type MaterialsUsageReport,
  type MaterialAccessLogEntry,
  type MaterialScope,
  type MaterialPlanSessionOption,
  type MaterialScanState,
} from "@/lib/course-materials.shared";

type MaterialFileItem = {
  id: string;
  original_filename: string;
  version_number: number;
  scan_state: unknown;
};

type MaterialItem = {
  id: string;
  status: string;
  title: string;
  description: string | null;
  week_number: number | null;
  lecture_number: number | null;
  study_system: string;
  material_scope?: string | null;
  plan_session_id?: string | null;
  planned_topics?: string | null;
  files?: MaterialFileItem[];
};

export const Route = createFileRoute("/faculty-portal/materials/$sectionId")({
  component: FacultyMaterialsSection,
});

function formatEventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
}

function FacultyMaterialsSection() {
  const { sectionId } = Route.useParams();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showUsage, setShowUsage] = useState(false);

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["faculty", "materials", "list", sectionId],
    queryFn: () => listMyCourseMaterials({ data: { sectionId } }),
  });

  const publish = useMutation({
    mutationFn: (materialId: string) => publishCourseMaterial({ data: { materialId } }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["faculty", "materials", "list", sectionId] }),
  });
  const archive = useMutation({
    mutationFn: (materialId: string) => archiveCourseMaterial({ data: { materialId } }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["faculty", "materials", "list", sectionId] }),
  });

  return (
    <FacultyPortalShell
      title="بوابة عضو هيئة التدريس"
      breadcrumbs={[
        { label: "المواد التعليمية", to: "/faculty-portal/materials" },
        { label: "مواد المجموعة" },
      ]}
    >
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowUsage(true)}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-bold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BarChart3 className="h-4 w-4" aria-hidden /> تقرير الاستخدام
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-bold hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" aria-hidden /> إضافة مادة
          </button>
        </div>

        <h1 className="font-display text-xl font-extrabold text-primary mb-4">مواد المجموعة</h1>

        {showCreate && (
          <CreateMaterialDialog
            sectionId={sectionId}
            onClose={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false);
              qc.invalidateQueries({ queryKey: ["faculty", "materials", "list", sectionId] });
            }}
          />
        )}

        {showUsage && (
          <UsageReportDialog sectionId={sectionId} onClose={() => setShowUsage(false)} />
        )}

        {isLoading ? (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : materials.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            لا توجد مواد في هذه المجموعة بعد.
          </div>
        ) : (
          <div className="space-y-3">
            {(materials as MaterialItem[]).map((m) => (
              <MaterialRow
                key={m.id}
                material={m}
                onPublish={() => publish.mutate(m.id)}
                onArchive={() => archive.mutate(m.id)}
                onUploaded={() =>
                  qc.invalidateQueries({ queryKey: ["faculty", "materials", "list", sectionId] })
                }
                busy={publish.isPending || archive.isPending}
              />
            ))}
          </div>
        )}
      </main>
    </FacultyPortalShell>
  );
}

function CreateMaterialDialog({
  sectionId,
  onClose,
  onCreated,
}: {
  sectionId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [scope, setScope] = useState<MaterialScope>("lecture");
  const [planSessionId, setPlanSessionId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["faculty", "materials", "plan-sessions", sectionId],
    queryFn: () => listPlanSessionsForMaterials({ data: { sectionId } }),
  });

  const selected = (sessions as MaterialPlanSessionOption[]).find(
    (s) => s.plan_session_id === planSessionId,
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (scope === "lecture" && !planSessionId) {
      setError("يجب اختيار محاضرة من خطة التنفيذ المعتمدة");
      return;
    }
    if (scope === "general" && !title.trim()) {
      setError("العنوان مطلوب");
      return;
    }
    setBusy(true);
    try {
      await createCourseMaterial({
        data: {
          sectionId,
          scope,
          planSessionId: scope === "lecture" ? planSessionId : null,
          title: scope === "general" ? title.trim() : null,
          description: description.trim() || null,
        },
      });
      onCreated();
    } catch (e2) {
      setError((e2 as Error)?.message || "تعذّر إنشاء المادة. يرجى المحاولة مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md rounded-xl bg-card p-5 shadow-elegant space-y-3"
      >
        <h2 className="font-display text-lg font-extrabold text-primary">إضافة مادة تعليمية</h2>

        <fieldset className="space-y-1">
          <legend className="text-xs font-bold">نوع المادة *</legend>
          {MATERIAL_SCOPES.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="material-scope"
                value={s}
                checked={scope === s}
                onChange={() => setScope(s)}
              />
              {MATERIAL_SCOPE_LABELS[s]}
            </label>
          ))}
        </fieldset>

        {scope === "lecture" ? (
          <>
            <label className="block">
              <span className="text-xs font-bold">المحاضرة (من خطة التنفيذ الحالية) *</span>
              <select
                value={planSessionId}
                onChange={(e) => setPlanSessionId(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              >
                <option value="">— اختر المحاضرة —</option>
                {(sessions as MaterialPlanSessionOption[]).map((s) => (
                  <option key={s.plan_session_id} value={s.plan_session_id}>
                    {formatPlanSessionOptionLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            {sessionsLoading ? (
              <div className="text-xs text-muted-foreground">جاري تحميل خطة التنفيذ…</div>
            ) : sessions.length === 0 ? (
              <div className="text-xs text-destructive">
                لا توجد خطة تنفيذ حالية معتمدة لهذه المجموعة.
              </div>
            ) : null}
            {selected && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                <div>
                  <span className="font-bold">رقم المحاضرة:</span> {selected.session_number}
                </div>
                <div>
                  <span className="font-bold">الأسبوع:</span> {selected.week_number ?? "—"}
                </div>
                <div>
                  <span className="font-bold">عنوان المحاضرة:</span> {selected.planned_title}
                </div>
                <div>
                  <span className="font-bold">المفردات / الموضوعات:</span>{" "}
                  {selected.planned_topics?.trim() || "—"}
                </div>
                <div className="text-muted-foreground">
                  تُشتق هذه البيانات ونظام الدراسة تلقائياً من الخطة والمجموعة ولا يمكن تعديلها.
                </div>
              </div>
            )}
          </>
        ) : (
          <label className="block">
            <span className="text-xs font-bold">العنوان *</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
            />
          </label>
        )}
        <label className="block">
          <span className="text-xs font-bold">الوصف (اختياري)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
          />
        </label>
        {error && <div className="text-xs text-destructive">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            إلغاء
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-bold disabled:opacity-60"
          >
            {busy ? "جاري الحفظ…" : "حفظ كمسودة"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ScanStateBadge({ scanState }: { scanState: unknown }) {
  const state: MaterialScanState = isMaterialScanState(scanState) ? scanState : "pending";
  const styles: Record<MaterialScanState, string> = {
    clean: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-700",
    infected: "bg-red-100 text-red-700",
    failed: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${styles[state]}`}>
      {SCAN_STATE_LABELS[state]}
    </span>
  );
}

function MaterialRow({
  material,
  onPublish,
  onArchive,
  onUploaded,
  busy,
}: {
  material: MaterialItem;
  onPublish: () => void;
  onArchive: () => void;
  onUploaded: () => void;
  busy: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [showAccessLog, setShowAccessLog] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadErr(null);
    // UX pre-check against the compiled-in conservative baseline only. The
    // authoritative enforcement is server-side: uploadCourseMaterialFile applies
    // the effective narrow-only site_settings policy (which can only shrink this
    // baseline), so the server stays the source of truth if settings narrow it.
    if (!(MATERIALS_ALLOWED_MIME as readonly string[]).includes(file.type)) {
      setUploadErr("نوع الملف غير مسموح به");
      return;
    }
    if (file.size > MATERIALS_MAX_BYTES_DEFAULT) {
      setUploadErr("حجم الملف يتجاوز 25 ميجابايت");
      return;
    }
    setUploading(true);
    try {
      const b64 = await readFileAsBase64(file);
      await uploadCourseMaterialFile({
        data: {
          materialId: material.id,
          fileBase64: b64,
          filename: file.name,
          mimeType: file.type,
        },
      });
      onUploaded();
    } catch {
      setUploadErr("تعذّر رفع الملف. يرجى المحاولة مرة أخرى.");
    } finally {
      setUploading(false);
    }
  };

  const weekLecture = formatWeekLectureLabel(material.week_number, material.lecture_number);

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">
            {weekLecture ? `${weekLecture} • ` : ""}
            {MATERIAL_SCOPE_LABELS[material.material_scope === "lecture" ? "lecture" : "general"]} •{" "}
            {studySystemLabel(material.study_system)} •{" "}
            {STATUS_LABELS[material.status as keyof typeof STATUS_LABELS]}
          </div>
          <div className="font-bold text-primary truncate">{material.title}</div>
          {material.description && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {material.description}
            </div>
          )}
        </div>
      </div>

      {material.files?.length > 0 && (
        <ul className="mt-2 space-y-1">
          {material.files.map((f) => (
            <FileRow key={f.id} file={f} />
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <label
          className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-bold cursor-pointer ${material.status === "archived" ? "opacity-50 cursor-not-allowed" : "hover:bg-muted"}`}
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "جاري الرفع…" : "رفع ملف"}
          <input
            type="file"
            accept={MATERIALS_ALLOWED_EXT.map((e) => `.${e}`).join(",")}
            className="hidden"
            disabled={uploading || material.status === "archived"}
            onChange={onPick}
          />
        </label>
        {material.status !== "published" && material.status !== "archived" && (
          <button
            type="button"
            onClick={onPublish}
            disabled={busy || !material.files?.length}
            className="inline-flex items-center gap-1.5 rounded bg-primary text-primary-foreground px-2.5 py-1 text-xs font-bold disabled:opacity-50"
            title={!material.files?.length ? "أرفع ملفاً قبل النشر" : ""}
          >
            <Send className="h-3.5 w-3.5" /> نشر
          </button>
        )}
        {material.status !== "archived" && (
          <button
            type="button"
            onClick={onArchive}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-bold hover:bg-muted disabled:opacity-50"
          >
            <Archive className="h-3.5 w-3.5" /> أرشفة
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowAccessLog(true)}
          className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-bold hover:bg-muted"
        >
          <ScrollText className="h-3.5 w-3.5" /> سجل الوصول
        </button>
      </div>
      {uploadErr && <div className="text-xs text-destructive mt-2">{uploadErr}</div>}
      {showAccessLog && (
        <AccessLogDialog
          materialId={material.id}
          materialTitle={material.title}
          onClose={() => setShowAccessLog(false)}
        />
      )}
    </div>
  );
}

function FileRow({ file }: { file: MaterialFileItem }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const downloadable = isMaterialFileDownloadable(file.scan_state);
  const onDownload = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await getCourseMaterialDownloadUrl({ data: { fileId: file.id } });
      window.open(url, "_blank", "noopener");
    } catch {
      setError("تعذّر تنزيل الملف حالياً.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="text-xs bg-muted/30 rounded px-2 py-1">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-primary" />
        <span className="flex-1 truncate">{file.original_filename}</span>
        <span className="text-muted-foreground">v{file.version_number}</span>
        <ScanStateBadge scanState={file.scan_state} />
        <button
          onClick={onDownload}
          disabled={busy || !downloadable}
          className="text-primary hover:text-gold font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          title={downloadable ? "" : "الملف متاح بعد اكتمال الفحص"}
        >
          {busy ? "…" : "تنزيل"}
        </button>
      </div>
      {error && <div className="text-destructive mt-1">{error}</div>}
    </li>
  );
}

function UsageReportDialog({ sectionId, onClose }: { sectionId: string; onClose: () => void }) {
  const {
    data: report,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["faculty", "materials", "usage", sectionId],
    queryFn: () => getCourseMaterialsUsageReport({ data: { sectionId } }),
  });
  const typedReport = report as MaterialsUsageReport | undefined;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-xl bg-card p-5 shadow-elegant"
      >
        <h2 className="font-display text-lg font-extrabold text-primary mb-3">
          تقرير استخدام المواد
        </h2>
        {isLoading ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">
            تعذّر تحميل البيانات. يرجى المحاولة لاحقاً.
          </div>
        ) : !typedReport || typedReport.materials.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">لا توجد مواد بعد.</div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground mb-2">
              إجمالي التنزيلات:{" "}
              <span className="font-bold text-primary">{typedReport.totalDownloads}</span>
            </div>
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-right py-1.5 font-bold">المادة</th>
                    <th className="text-right py-1.5 font-bold">الحالة</th>
                    <th className="text-right py-1.5 font-bold">التنزيلات</th>
                    <th className="text-right py-1.5 font-bold">المنزّلون</th>
                    <th className="text-right py-1.5 font-bold">آخر تنزيل</th>
                    <th className="text-right py-1.5 font-bold">الملفات (آمن/الكل)</th>
                  </tr>
                </thead>
                <tbody>
                  {typedReport.materials.map((summary) => (
                    <tr key={summary.materialId} className="border-b last:border-0">
                      <td className="py-1.5">
                        <div className="font-bold text-primary">{summary.title}</div>
                        <div className="text-muted-foreground">
                          {formatWeekLectureLabel(summary.weekNumber, summary.lectureNumber) || "—"}
                        </div>
                      </td>
                      <td className="py-1.5">{STATUS_LABELS[summary.status]}</td>
                      <td className="py-1.5 font-bold">{summary.downloads}</td>
                      <td className="py-1.5">{summary.uniqueDownloaders}</td>
                      <td className="py-1.5">
                        {summary.lastDownloadAt ? formatEventTime(summary.lastDownloadAt) : "—"}
                      </td>
                      <td className="py-1.5">
                        {summary.filesClean}/{summary.filesTotal}
                        {summary.filesPending > 0 && (
                          <span className="text-amber-700">
                            {" "}
                            (+{summary.filesPending} قيد الفحص)
                          </span>
                        )}
                        {summary.filesInfected > 0 && (
                          <span className="text-red-700"> ({summary.filesInfected} مصاب)</span>
                        )}
                        {summary.filesFailed > 0 && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({summary.filesFailed} فشل الفحص)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="flex justify-end pt-3">
          <button type="button" onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

function AccessLogDialog({
  materialId,
  materialTitle,
  onClose,
}: {
  materialId: string;
  materialTitle: string;
  onClose: () => void;
}) {
  const {
    data: entries,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["faculty", "materials", "access-log", materialId],
    queryFn: () => listCourseMaterialAccessLogs({ data: { materialId, limit: 50 } }),
  });
  const typedEntries = (entries ?? []) as MaterialAccessLogEntry[];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl bg-card p-5 shadow-elegant"
      >
        <h2 className="font-display text-lg font-extrabold text-primary mb-1">سجل الوصول</h2>
        <div className="text-xs text-muted-foreground mb-3 truncate">{materialTitle}</div>
        {isLoading ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">
            تعذّر تحميل البيانات. يرجى المحاولة لاحقاً.
          </div>
        ) : typedEntries.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">لا توجد أحداث بعد.</div>
        ) : (
          <ul className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {typedEntries.map((entry, index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-2 rounded bg-muted/30 px-2 py-1.5 text-xs"
              >
                <span className="font-bold text-primary">
                  {MATERIAL_ACCESS_EVENT_LABELS[entry.event as MaterialAccessEvent] ?? entry.event}
                </span>
                <span className="text-muted-foreground">
                  {entry.actorUserId ? `…${entry.actorUserId.slice(-6)}` : "النظام"}
                </span>
                <span className="text-muted-foreground">{formatEventTime(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end pt-3">
          <button type="button" onClick={onClose} className="rounded border px-3 py-1.5 text-sm">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
