import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, ArrowRight, Plus, Upload, Send, Archive, FileText } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { NotificationsBell } from "@/components/portal/NotificationsBell";
import { supabase } from "@/integrations/supabase/client";
import { readFileAsBase64 } from "@/lib/file-upload";
import {
  listMyCourseMaterials,
  createCourseMaterial,
  uploadCourseMaterialFile,
  publishCourseMaterial,
  archiveCourseMaterial,
} from "@/lib/faculty-materials.functions";
import { getCourseMaterialDownloadUrl } from "@/lib/student-materials.functions";
import {
  MATERIALS_ALLOWED_MIME,
  MATERIALS_ALLOWED_EXT,
  MATERIALS_MAX_BYTES_DEFAULT,
  STATUS_LABELS,
  STUDY_SYSTEM_LABELS,
  type StudySystemTag,
} from "@/lib/course-materials.shared";

export const Route = createFileRoute("/faculty-portal/materials/$sectionId")({
  component: FacultyMaterialsSection,
});

function FacultyMaterialsSection() {
  const { sectionId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["faculty", "materials", "list", sectionId],
    queryFn: () => listMyCourseMaterials({ data: { sectionId } }),
  });

  const publish = useMutation({
    mutationFn: (materialId: string) => publishCourseMaterial({ data: { materialId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faculty", "materials", "list", sectionId] }),
  });
  const archive = useMutation({
    mutationFn: (materialId: string) => archiveCourseMaterial({ data: { materialId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faculty", "materials", "list", sectionId] }),
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/portal-login", replace: true });
  };

  return (
    <PortalShell title="بوابة عضو هيئة التدريس" actions={<NotificationsBell />} onLogout={handleLogout}>
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Link to="/faculty-portal/materials" className="text-sm text-primary hover:text-gold inline-flex items-center gap-1">
            <ArrowRight className="h-4 w-4" /> العودة
          </Link>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-bold hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> إضافة محاضرة
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

        {isLoading ? (
          <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : materials.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            لا توجد مواد في هذه المجموعة بعد.
          </div>
        ) : (
          <div className="space-y-3">
            {(materials as any[]).map((m) => (
              <MaterialRow
                key={m.id}
                material={m}
                onPublish={() => publish.mutate(m.id)}
                onArchive={() => archive.mutate(m.id)}
                onUploaded={() => qc.invalidateQueries({ queryKey: ["faculty", "materials", "list", sectionId] })}
                busy={publish.isPending || archive.isPending}
              />
            ))}
          </div>
        )}
      </main>
    </PortalShell>
  );
}

function CreateMaterialDialog({ sectionId, onClose, onCreated }: { sectionId: string; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lectureNumber, setLectureNumber] = useState<string>("");
  const [studySystem, setStudySystem] = useState<StudySystemTag>("both");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) { setError("العنوان مطلوب"); return; }
    setBusy(true);
    try {
      await createCourseMaterial({
        data: {
          sectionId,
          title: title.trim(),
          description: description.trim() || null,
          lecture_number: lectureNumber ? parseInt(lectureNumber, 10) : null,
          study_system: studySystem,
        },
      });
      onCreated();
    } catch (err: any) {
      setError(err.message ?? "تعذّر الإنشاء");
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
        <h2 className="font-display text-lg font-extrabold text-primary">إضافة محاضرة</h2>
        <label className="block">
          <span className="text-xs font-bold">العنوان *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-bold">رقم المحاضرة (اختياري)</span>
          <input type="number" min={1} max={200} value={lectureNumber} onChange={(e) => setLectureNumber(e.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-bold">نظام الدراسة *</span>
          <select value={studySystem} onChange={(e) => setStudySystem(e.target.value as StudySystemTag)} className="mt-1 w-full rounded border px-3 py-2 text-sm">
            <option value="both">{STUDY_SYSTEM_LABELS.both}</option>
            <option value="regular">{STUDY_SYSTEM_LABELS.regular}</option>
            <option value="parallel">{STUDY_SYSTEM_LABELS.parallel}</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-bold">الوصف (اختياري)</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} className="mt-1 w-full rounded border px-3 py-2 text-sm" />
        </label>
        {error && <div className="text-xs text-destructive">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded border px-3 py-1.5 text-sm">إلغاء</button>
          <button type="submit" disabled={busy} className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-sm font-bold disabled:opacity-60">
            {busy ? "جاري الحفظ…" : "حفظ كمسودة"}
          </button>
        </div>
      </form>
    </div>
  );
}

function MaterialRow({
  material,
  onPublish,
  onArchive,
  onUploaded,
  busy,
}: {
  material: any;
  onPublish: () => void;
  onArchive: () => void;
  onUploaded: () => void;
  busy: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadErr(null);
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
        data: { materialId: material.id, fileBase64: b64, filename: file.name, mimeType: file.type },
      });
      onUploaded();
    } catch (err: any) {
      setUploadErr(err.message ?? "فشل الرفع");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">
            {material.lecture_number ? `المحاضرة ${material.lecture_number} • ` : ""}
            {STUDY_SYSTEM_LABELS[material.study_system as StudySystemTag]} • {STATUS_LABELS[material.status as keyof typeof STATUS_LABELS]}
          </div>
          <div className="font-bold text-primary truncate">{material.title}</div>
          {material.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{material.description}</div>}
        </div>
      </div>

      {material.files?.length > 0 && (
        <ul className="mt-2 space-y-1">
          {material.files.map((f: any) => (
            <FileRow key={f.id} file={f} />
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <label className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-bold cursor-pointer ${material.status === "archived" ? "opacity-50 cursor-not-allowed" : "hover:bg-muted"}`}>
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
      </div>
      {uploadErr && <div className="text-xs text-destructive mt-2">{uploadErr}</div>}
    </div>
  );
}

function FileRow({ file }: { file: any }) {
  const [busy, setBusy] = useState(false);
  const onDownload = async () => {
    setBusy(true);
    try {
      const { url } = await getCourseMaterialDownloadUrl({ data: { fileId: file.id } });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      // ignore
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex items-center gap-2 text-xs bg-muted/30 rounded px-2 py-1">
      <FileText className="h-3.5 w-3.5 text-primary" />
      <span className="flex-1 truncate">{file.original_filename}</span>
      <span className="text-muted-foreground">v{file.version_number}</span>
      <button onClick={onDownload} disabled={busy} className="text-primary hover:text-gold font-bold">
        {busy ? "…" : "تنزيل"}
      </button>
    </li>
  );
}
