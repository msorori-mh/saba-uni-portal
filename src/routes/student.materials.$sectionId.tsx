import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, ArrowRight, FileText } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { NotificationsBell } from "@/components/portal/NotificationsBell";
import { supabase } from "@/integrations/supabase/client";
import { listStudentMaterialsForCourse, getCourseMaterialDownloadUrl } from "@/lib/student-materials.functions";
import { STUDY_SYSTEM_LABELS, formatWeekLectureLabel, type StudySystemTag } from "@/lib/course-materials.shared";
import { CourseDeliveryPlanGrid } from "@/components/portal/CourseDeliveryPlanGrid";

export const Route = createFileRoute("/student/materials/$sectionId")({
  component: StudentMaterialsCourse,
});

function StudentMaterialsCourse() {
  const { sectionId } = Route.useParams();
  const navigate = useNavigate();
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["student", "materials", "course", sectionId],
    queryFn: () => listStudentMaterialsForCourse({ data: { sectionId } }),
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/portal-login", replace: true });
  };

  return (
    <PortalShell title="بوابة الطالب" actions={<NotificationsBell />} onLogout={handleLogout}>
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-4">
          <Link to="/student/materials" className="text-sm text-primary hover:text-gold inline-flex items-center gap-1">
            <ArrowRight className="h-4 w-4" /> العودة
          </Link>
        </div>
        <div className="mb-6">
          <CourseDeliveryPlanGrid sectionId={sectionId} />
        </div>

        <h1 className="font-display text-xl font-extrabold text-primary mb-4">محاضرات المادة</h1>

        {isLoading ? (
          <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : error ? (
          <div className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-destructive">
            {(error as Error).message}
          </div>
        ) : data.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            لا توجد محاضرات منشورة بعد.
          </div>
        ) : (
          <div className="space-y-3">
            {(data as any[]).map((m) => (
              <div key={m.id} className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground">
                  {formatWeekLectureLabel(m.week_number, m.lecture_number)}
                  {m.study_system !== "both" && <> • {STUDY_SYSTEM_LABELS[m.study_system as StudySystemTag]}</>}
                </div>
                <div className="font-bold text-primary">{m.title}</div>
                {m.description && <div className="text-xs text-muted-foreground mt-1">{m.description}</div>}
                {m.files?.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {m.files.map((f: any) => <StudentFileRow key={f.id} file={f} />)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </PortalShell>
  );
}

function StudentFileRow({ file }: { file: any }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onDownload = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { url } = await getCourseMaterialDownloadUrl({ data: { fileId: file.id } });
      window.open(url, "_blank", "noopener");
    } catch (e: any) {
      setErr(e.message ?? "فشل التنزيل");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex items-center gap-2 text-xs bg-muted/30 rounded px-2 py-1.5">
      <FileText className="h-3.5 w-3.5 text-primary" />
      <span className="flex-1 truncate">{file.original_filename}</span>
      <button onClick={onDownload} disabled={busy} className="text-primary hover:text-gold font-bold">
        {busy ? "…" : "تنزيل"}
      </button>
      {err && <span className="text-destructive text-[10px]">{err}</span>}
    </li>
  );
}
