import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, Download, Loader2 } from "lucide-react";
import {
  getCourseMaterialDownloadUrl,
  listStudentMaterialsForCourse,
} from "@/lib/student-materials.functions";
import { formatWeekLectureLabel } from "@/lib/course-materials.shared";
import { CourseDeliveryPlanGrid } from "@/components/portal/CourseDeliveryPlanGrid";

export const Route = createFileRoute("/mobile/student/materials/$sectionId")({
  head: () => ({ meta: [{ title: "مواد المقرر" }] }),
  component: MobileStudentMaterialsCourse,
});

/* eslint-disable @typescript-eslint/no-explicit-any */

function MobileStudentMaterialsCourse() {
  const { sectionId } = Route.useParams();
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["mobile-student", "materials", "course", sectionId],
    queryFn: () => listStudentMaterialsForCourse({ data: { sectionId } }),
  });

  const lectureMaterials = (data as any[]).filter((m) => m.material_scope === "lecture");
  const generalMaterials = (data as any[]).filter((m) => m.material_scope !== "lecture");

  return (
    <div className="px-4 py-5 space-y-4" dir="rtl">
      <Link
        to="/mobile/student/materials"
        className="inline-flex items-center gap-1 text-xs font-bold text-primary"
      >
        <ArrowRight className="h-4 w-4" /> العودة
      </Link>

      <CourseDeliveryPlanGrid sectionId={sectionId} />

      {isLoading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {(error as Error).message}
        </p>
      ) : data.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          لا توجد مواد منشورة بعد.
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="font-display text-sm font-extrabold text-primary">مواد المحاضرات</h2>
            {lectureMaterials.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">لا توجد مواد مرتبطة بمحاضرات بعد.</p>
            ) : (
              lectureMaterials.map((m) => <MobileMaterialCard key={m.id} material={m} showLecture />)
            )}
          </section>

          {generalMaterials.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-display text-sm font-extrabold text-primary">مواد عامة للمقرر</h2>
              {generalMaterials.map((m) => (
                <MobileMaterialCard key={m.id} material={m} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function MobileMaterialCard({ material: m, showLecture }: { material: any; showLecture?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5 shadow-card">
      {showLecture && (
        <div className="text-[10px] font-bold text-muted-foreground">
          {formatWeekLectureLabel(m.week_number, m.lecture_number)}
        </div>
      )}
      <div className="text-sm font-extrabold text-primary">{m.title}</div>
      {showLecture && m.planned_topics && (
        <div className="mt-1 text-[11px] text-muted-foreground">المفردات: {m.planned_topics}</div>
      )}
      {m.description && <div className="mt-1 text-[11px] text-muted-foreground">{m.description}</div>}
      {m.files?.length > 0 && (
        <ul className="mt-2 space-y-1">
          {m.files.map((f: any) => (
            <MobileFileRow key={f.id} file={f} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MobileFileRow({ file }: { file: any }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onDownload = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { url } = await getCourseMaterialDownloadUrl({ data: { fileId: file.id } });
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذر تحميل الملف");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li>
      <button
        type="button"
        onClick={onDownload}
        disabled={busy}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2 text-right text-[11px] font-bold text-primary disabled:opacity-60"
      >
        <span className="truncate">{file.original_filename}</span>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 text-gold" />}
      </button>
      {err && <p className="mt-1 text-[10px] text-destructive">{err}</p>}
    </li>
  );
}
