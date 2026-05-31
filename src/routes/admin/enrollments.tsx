import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, UserPlus, Trash2, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/enrollments")({
  component: EnrollmentsPage,
});

type Year = { id: string; name: string; is_current: boolean };
type Semester = { id: string; academic_year_id: string; name: string };
type Program = { id: string; name_ar: string; code: string };
type Level = { id: string; name: string; level_number: number };
type Offering = { id: string; course_id: string; course: { code: string; name_ar: string } | null };
type Section = { id: string; section_code: string; course_offering_id: string; capacity: number | null };
type Enrollment = {
  id: string; enrollment_status: string;
  student: { id: string; academic_number: string; full_name_ar: string } | null;
};
type StudentRow = {
  id: string; academic_number: string; full_name_ar: string; status: string;
};

function EnrollmentsPage() {
  const qc = useQueryClient();
  const [yearId, setYearId] = useState<string>("");
  const [semId, setSemId] = useState<string>("");
  const [programId, setProgramId] = useState<string>("");
  const [levelId, setLevelId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [toRemove, setToRemove] = useState<Enrollment | null>(null);

  const years = useQuery({
    queryKey: ["en-years"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academic_years").select("id, name, is_current").order("start_date", { ascending: false });
      if (error) throw error; return data as Year[];
    },
  });
  const semesters = useQuery({
    queryKey: ["en-semesters", yearId],
    queryFn: async () => {
      const q = supabase.from("semesters").select("id, academic_year_id, name").order("start_date");
      const { data, error } = yearId ? await q.eq("academic_year_id", yearId) : await q;
      if (error) throw error; return data as Semester[];
    },
  });
  const programs = useQuery({
    queryKey: ["en-programs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("programs").select("id, name_ar, code").eq("is_active", true).order("name_ar");
      if (error) throw error; return data as Program[];
    },
  });
  const levels = useQuery({
    queryKey: ["en-levels"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academic_levels").select("id, name, level_number").order("level_number");
      if (error) throw error; return data as Level[];
    },
  });

  const offerings = useQuery({
    queryKey: ["en-offerings", yearId, semId, programId, levelId],
    enabled: !!(yearId && semId && programId && levelId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_offerings")
        .select("id, course_id, course:courses(code, name_ar)")
        .eq("academic_year_id", yearId).eq("semester_id", semId)
        .eq("program_id", programId).eq("level_id", levelId)
        .eq("status", "active");
      if (error) throw error; return (data ?? []) as unknown as Offering[];
    },
  });

  const sections = useQuery({
    queryKey: ["en-sections", offerings.data?.map((o) => o.id).join(",")],
    enabled: !!offerings.data && offerings.data.length > 0,
    queryFn: async () => {
      const ids = (offerings.data ?? []).map((o) => o.id);
      const { data, error } = await supabase
        .from("course_sections")
        .select("id, section_code, course_offering_id, capacity")
        .in("course_offering_id", ids).eq("status", "active")
        .order("section_code");
      if (error) throw error; return (data ?? []) as Section[];
    },
  });

  const sectionsWithCourse = useMemo(() => {
    const offMap = new Map((offerings.data ?? []).map((o) => [o.id, o.course]));
    return (sections.data ?? []).map((s) => ({
      ...s,
      course: offMap.get(s.course_offering_id) ?? null,
    }));
  }, [sections.data, offerings.data]);

  const enrollments = useQuery({
    queryKey: ["en-enrollments", sectionId],
    enabled: !!sectionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_enrollments")
        .select("id, enrollment_status, student:student_profiles(id, academic_number, full_name_ar)")
        .eq("course_section_id", sectionId)
        .order("enrolled_at");
      if (error) throw error; return (data ?? []) as unknown as Enrollment[];
    },
  });

  // Eligible students: matching program + current academic_status with year/sem/level
  const eligibleStudents = useQuery({
    queryKey: ["en-eligible", programId, yearId, semId, levelId, enrollments.data?.length],
    enabled: !!(programId && yearId && semId && levelId && sectionId),
    queryFn: async () => {
      const { data: statuses, error: sErr } = await supabase
        .from("student_academic_status")
        .select("student_profile_id, student:student_profiles(id, academic_number, full_name_ar, status, program_id)")
        .eq("academic_year_id", yearId)
        .eq("semester_id", semId)
        .eq("level_id", levelId)
        .eq("enrollment_status", "active");
      if (sErr) throw sErr;
      type Raw = { student_profile_id: string; student: { id: string; academic_number: string; full_name_ar: string; status: string; program_id: string | null } | null };
      const enrolledIds = new Set((enrollments.data ?? []).map((e) => e.student?.id));
      return ((statuses ?? []) as unknown as Raw[])
        .map((r) => r.student)
        .filter((s): s is NonNullable<typeof s> => !!s)
        .filter((s) => s.program_id === programId && s.status === "active")
        .filter((s) => !enrolledIds.has(s.id))
        .map((s): StudentRow => ({ id: s.id, academic_number: s.academic_number, full_name_ar: s.full_name_ar, status: s.status }));
    },
  });

  // Set defaults
  if (!yearId && years.data) {
    const cur = years.data.find((y) => y.is_current) ?? years.data[0];
    if (cur) setYearId(cur.id);
  }

  const handleEnroll = async (studentProfileId: string) => {
    const { error } = await supabase
      .from("student_enrollments")
      .insert({ student_profile_id: studentProfileId, course_section_id: sectionId });
    if (error) { toast.error(error.message); return; }
    toast.success("تم تسجيل الطالب");
    qc.invalidateQueries({ queryKey: ["en-enrollments"] });
    qc.invalidateQueries({ queryKey: ["en-eligible"] });
  };

  const handleStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("student_enrollments").update({ enrollment_status: status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم تحديث الحالة");
    qc.invalidateQueries({ queryKey: ["en-enrollments"] });
  };

  const handleDelete = async () => {
    if (!toRemove) return;
    const { error } = await supabase.from("student_enrollments").delete().eq("id", toRemove.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حذف التسجيل");
    setToRemove(null);
    qc.invalidateQueries({ queryKey: ["en-enrollments"] });
    qc.invalidateQueries({ queryKey: ["en-eligible"] });
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      enrolled: { label: "مُسجَّل", cls: "bg-emerald-100 text-emerald-800" },
      dropped: { label: "محذوف", cls: "bg-rose-100 text-rose-800" },
      completed: { label: "مكتمل", cls: "bg-blue-100 text-blue-800" },
    };
    const v = map[s] ?? { label: s, cls: "bg-muted" };
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${v.cls}`}>{v.label}</span>;
  };

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-xl font-extrabold text-primary">تسجيل الطلاب في الشعب</h1>
          <p className="text-xs text-muted-foreground">إدارة تسجيل الطلاب يدوياً في الشعب الدراسية المتاحة</p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border bg-card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <Label className="text-xs">السنة الأكاديمية</Label>
          <Select value={yearId} onValueChange={(v) => { setYearId(v); setSemId(""); setSectionId(""); }}>
            <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
            <SelectContent>
              {(years.data ?? []).map((y) => <SelectItem key={y.id} value={y.id}>{y.name}{y.is_current && " ★"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">الفصل</Label>
          <Select value={semId} onValueChange={(v) => { setSemId(v); setSectionId(""); }} disabled={!yearId}>
            <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
            <SelectContent>
              {(semesters.data ?? []).filter((s) => s.academic_year_id === yearId).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">البرنامج</Label>
          <Select value={programId} onValueChange={(v) => { setProgramId(v); setSectionId(""); }}>
            <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
            <SelectContent>
              {(programs.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">المستوى</Label>
          <Select value={levelId} onValueChange={(v) => { setLevelId(v); setSectionId(""); }}>
            <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
            <SelectContent>
              {(levels.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">الشعبة</Label>
          <Select value={sectionId} onValueChange={setSectionId} disabled={sectionsWithCourse.length === 0}>
            <SelectTrigger><SelectValue placeholder={sectionsWithCourse.length === 0 ? "لا توجد شعب" : "اختر..."} /></SelectTrigger>
            <SelectContent>
              {sectionsWithCourse.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.course?.code} — شعبة {s.section_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!sectionId ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          اختر السنة والفصل والبرنامج والمستوى ثم الشعبة لعرض التسجيلات.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Eligible */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center justify-between">
              <div className="text-sm font-bold text-primary">الطلاب المتاحون</div>
              <Badge variant="secondary">{eligibleStudents.data?.length ?? 0}</Badge>
            </div>
            {eligibleStudents.isLoading ? (
              <div className="p-6 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
            ) : (eligibleStudents.data ?? []).length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">لا يوجد طلاب مطابقون لهذه الشعبة</div>
            ) : (
              <ul className="divide-y">
                {(eligibleStudents.data ?? []).map((s) => (
                  <li key={s.id} className="p-3 flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-muted-foreground">{s.academic_number}</div>
                      <div className="font-semibold truncate">{s.full_name_ar}</div>
                    </div>
                    <Button size="sm" onClick={() => handleEnroll(s.id)} className="gap-1">
                      <UserPlus className="h-3.5 w-3.5" /> تسجيل
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Enrolled */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center justify-between">
              <div className="text-sm font-bold text-primary">الطلاب المسجلون في الشعبة</div>
              <Badge variant="secondary">{enrollments.data?.length ?? 0}</Badge>
            </div>
            {enrollments.isLoading ? (
              <div className="p-6 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
            ) : (enrollments.data ?? []).length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">لا يوجد طلاب مسجلون بعد</div>
            ) : (
              <ul className="divide-y">
                {(enrollments.data ?? []).map((e) => (
                  <li key={e.id} className="p-3 flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-muted-foreground">{e.student?.academic_number}</div>
                      <div className="font-semibold truncate">{e.student?.full_name_ar}</div>
                      <div className="mt-1">{statusBadge(e.enrollment_status)}</div>
                    </div>
                    <Select value={e.enrollment_status} onValueChange={(v) => handleStatus(e.id, v)}>
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="enrolled">مُسجَّل</SelectItem>
                        <SelectItem value="dropped">محذوف</SelectItem>
                        <SelectItem value="completed">مكتمل</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setToRemove(e)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={!!toRemove} onOpenChange={(o) => !o && setToRemove(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف التسجيل</AlertDialogTitle>
            <AlertDialogDescription>
              هل تريد حذف تسجيل الطالب «{toRemove?.student?.full_name_ar}» من هذه الشعبة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
