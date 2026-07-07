import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  getEnrollmentsLookups,
  listOfferingsForEnrollment,
  listSectionsForOfferings,
  listSectionEnrollments,
  listEligibleStudentsForEnrollment,
  createStudentEnrollment,
  updateEnrollmentStatus,
  deleteStudentEnrollment,
} from "@/lib/admin-enrollments.functions";
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
  const lookupsFn = useServerFn(getEnrollmentsLookups);
  const offeringsFn = useServerFn(listOfferingsForEnrollment);
  const sectionsFn = useServerFn(listSectionsForOfferings);
  const enrollmentsFn = useServerFn(listSectionEnrollments);
  const eligibleFn = useServerFn(listEligibleStudentsForEnrollment);
  const createFn = useServerFn(createStudentEnrollment);
  const updateStatusFn = useServerFn(updateEnrollmentStatus);
  const deleteFn = useServerFn(deleteStudentEnrollment);

  const [yearId, setYearId] = useState<string>("");
  const [semId, setSemId] = useState<string>("");
  const [programId, setProgramId] = useState<string>("");
  const [levelId, setLevelId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [toRemove, setToRemove] = useState<Enrollment | null>(null);

  const { data: lookups } = useQuery({
    queryKey: ["enrollments-lookups"],
    queryFn: () => lookupsFn({ data: {} }),
  });
  const years = (lookups?.years ?? []) as Year[];
  const semesters = (lookups?.semesters ?? []) as Semester[];
  const programs = (lookups?.programs ?? []) as Program[];
  const levels = (lookups?.levels ?? []) as Level[];

  useEffect(() => {
    if (!yearId && years.length > 0) {
      const cur = years.find((y) => y.is_current) ?? years[0];
      if (cur) setYearId(cur.id);
    }
  }, [years, yearId]);

  const filtersReady = !!(yearId && semId && programId && levelId);

  const { data: offerings = [] } = useQuery({
    queryKey: ["en-offerings", yearId, semId, programId, levelId],
    enabled: filtersReady,
    queryFn: () => offeringsFn({
      data: {
        academicYearId: yearId,
        semesterId: semId,
        programId,
        levelId,
      },
    }),
  });

  const offeringIds = offerings.map((o) => o.id as string);

  const { data: sections = [] } = useQuery({
    queryKey: ["en-sections", offeringIds.join(",")],
    enabled: offeringIds.length > 0,
    queryFn: () => sectionsFn({ data: { offeringIds } }),
  });

  const sectionsWithCourse = useMemo(() => {
    const offMap = new Map(offerings.map((o) => [o.id as string, o.course as Offering["course"]]));
    return sections.map((s) => ({
      ...s,
      course: offMap.get(s.course_offering_id as string) ?? null,
    }));
  }, [sections, offerings]);

  const { data: enrollments = [], isLoading: enrollmentsLoading } = useQuery({
    queryKey: ["en-enrollments", sectionId],
    enabled: !!sectionId,
    queryFn: () => enrollmentsFn({ data: { sectionId } }),
  });

  const { data: eligibleStudents = [], isLoading: eligibleLoading } = useQuery({
    queryKey: ["en-eligible", programId, yearId, semId, levelId, sectionId, enrollments.length],
    enabled: filtersReady && !!sectionId,
    queryFn: () => eligibleFn({
      data: {
        programId,
        academicYearId: yearId,
        semesterId: semId,
        levelId,
        sectionId,
      },
    }),
  });

  const handleEnroll = async (studentProfileId: string) => {
    try {
      await createFn({
        data: { studentProfileId, courseSectionId: sectionId },
      });
      toast.success("تم تسجيل الطالب");
      qc.invalidateQueries({ queryKey: ["en-enrollments"] });
      qc.invalidateQueries({ queryKey: ["en-eligible"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleStatus = async (id: string, status: string) => {
    try {
      await updateStatusFn({
        data: {
          id,
          enrollmentStatus: status as "enrolled" | "dropped" | "completed",
        },
      });
      toast.success("تم تحديث الحالة");
      qc.invalidateQueries({ queryKey: ["en-enrollments"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDelete = async () => {
    if (!toRemove) return;
    try {
      await deleteFn({ data: { id: toRemove.id } });
      toast.success("تم حذف التسجيل");
      setToRemove(null);
      qc.invalidateQueries({ queryKey: ["en-enrollments"] });
      qc.invalidateQueries({ queryKey: ["en-eligible"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
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
          <h1 className="font-display text-xl font-extrabold text-primary">تقسيم المجموعات</h1>
          <p className="text-xs text-muted-foreground">تقسيم الطلاب على المجموعات الدراسية المتاحة</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <Label className="text-xs">السنة الأكاديمية</Label>
          <Select value={yearId} onValueChange={(v) => { setYearId(v); setSemId(""); setSectionId(""); }}>
            <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}{y.is_current && " ★"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">الفصل</Label>
          <Select value={semId} onValueChange={(v) => { setSemId(v); setSectionId(""); }} disabled={!yearId}>
            <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
            <SelectContent>
              {semesters.filter((s) => s.academic_year_id === yearId).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">البرنامج</Label>
          <Select value={programId} onValueChange={(v) => { setProgramId(v); setSectionId(""); }}>
            <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
            <SelectContent>
              {programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">المستوى</Label>
          <Select value={levelId} onValueChange={(v) => { setLevelId(v); setSectionId(""); }}>
            <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
            <SelectContent>
              {levels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">المجموعات الدراسيةة</Label>
          <Select value={sectionId} onValueChange={setSectionId} disabled={sectionsWithCourse.length === 0}>
            <SelectTrigger><SelectValue placeholder={sectionsWithCourse.length === 0 ? "لا توجد مجموعات" : "اختر..."} /></SelectTrigger>
            <SelectContent>
              {sectionsWithCourse.map((s) => (
                <SelectItem key={s.id as string} value={s.id as string}>
                  {s.course?.code} — مجموعة دراسية {s.section_code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!sectionId ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          اختر السنة والفصل والبرنامج والمستوى ثم المجموعات الدراسيةة لعرض التسجيلات.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center justify-between">
              <div className="text-sm font-bold text-primary">الطلاب المتاحون</div>
              <Badge variant="secondary">{eligibleStudents.length}</Badge>
            </div>
            {eligibleLoading ? (
              <div className="p-6 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
            ) : eligibleStudents.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">لا يوجد طلاب مطابقون لهذه المجموعات الدراسيةة</div>
            ) : (
              <ul className="divide-y">
                {(eligibleStudents as StudentRow[]).map((s) => (
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

          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center justify-between">
              <div className="text-sm font-bold text-primary">الطلاب المسجلون في المجموعات الدراسيةة</div>
              <Badge variant="secondary">{enrollments.length}</Badge>
            </div>
            {enrollmentsLoading ? (
              <div className="p-6 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
            ) : enrollments.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">لا يوجد طلاب مسجلون بعد</div>
            ) : (
              <ul className="divide-y">
                {(enrollments as Enrollment[]).map((e) => (
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
              هل تريد حذف تسجيل الطالب «{toRemove?.student?.full_name_ar}» من هذه المجموعات الدراسيةة؟
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
