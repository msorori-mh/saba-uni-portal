import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, CalendarDays, Users2, Clock, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/course-offerings")({
  component: CourseOfferingsPage,
});

// ============ Types ============
type Course = { id: string; code: string; name_ar: string };
type Year = { id: string; name: string; is_current: boolean };
type Semester = { id: string; academic_year_id: string; name: string; code: string };
type Program = { id: string; name_ar: string; code: string; department_id: string | null };
type Level = { id: string; name: string; level_number: number };
type Department = { id: string; name_ar: string };
type FacultyProfile = { id: string; full_name_ar: string; employee_number: string | null };

type Offering = {
  id: string; course_id: string; academic_year_id: string; semester_id: string;
  program_id: string; level_id: string; status: string;
};
type Section = {
  id: string; course_offering_id: string; section_code: string;
  faculty_profile_id: string | null; capacity: number | null; status: string;
};

const DAYS = [
  { code: "saturday", label: "السبت" },
  { code: "sunday", label: "الأحد" },
  { code: "monday", label: "الإثنين" },
  { code: "tuesday", label: "الثلاثاء" },
  { code: "wednesday", label: "الأربعاء" },
  { code: "thursday", label: "الخميس" },
  { code: "friday", label: "الجمعة" },
];
const TYPES = [
  { code: "lecture", label: "محاضرة" },
  { code: "lab", label: "عملي" },
  { code: "tutorial", label: "تمارين" },
];

const dayLabel = (c: string) => DAYS.find((d) => d.code === c)?.label ?? c;
const typeLabel = (c: string) => TYPES.find((t) => t.code === c)?.label ?? c;

// ============ Shared lookups hook ============
function useLookups() {
  const courses = useQuery({
    queryKey: ["lk-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, code, name_ar").order("code");
      if (error) throw error; return data as Course[];
    },
  });
  const years = useQuery({
    queryKey: ["lk-years"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academic_years").select("id, name, is_current").order("start_date", { ascending: false });
      if (error) throw error; return data as Year[];
    },
  });
  const semesters = useQuery({
    queryKey: ["lk-semesters"],
    queryFn: async () => {
      const { data, error } = await supabase.from("semesters").select("id, academic_year_id, name, code").order("start_date");
      if (error) throw error; return data as Semester[];
    },
  });
  const programs = useQuery({
    queryKey: ["lk-programs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("programs").select("id, name_ar, code, department_id").order("sort_order");
      if (error) throw error; return data as Program[];
    },
  });
  const levels = useQuery({
    queryKey: ["lk-levels"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academic_levels").select("id, name, level_number").order("level_number");
      if (error) throw error; return data as Level[];
    },
  });
  const departments = useQuery({
    queryKey: ["lk-departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name_ar").order("name_ar");
      if (error) throw error; return data as Department[];
    },
  });
  const faculty = useQuery({
    queryKey: ["lk-faculty-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("faculty_profiles").select("id, full_name_ar, employee_number").order("full_name_ar");
      if (error) throw error; return data as FacultyProfile[];
    },
  });
  return {
    courses: courses.data ?? [], years: years.data ?? [], semesters: semesters.data ?? [],
    programs: programs.data ?? [], levels: levels.data ?? [], faculty: faculty.data ?? [],
    departments: departments.data ?? [],
  };
}

// ============ Page ============
function CourseOfferingsPage() {
  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-primary">إسناد المقررات والمجموعات الدراسية</h1>
        <p className="text-sm text-muted-foreground mt-1">إدارة إسناد المقررات والمجموعات الدراسية والجداول الدراسية</p>
      </div>

      <Tabs defaultValue="offerings" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="offerings"><CalendarDays className="h-4 w-4 ml-2" />إسناد المقررات</TabsTrigger>
          <TabsTrigger value="sections"><Users2 className="h-4 w-4 ml-2" />المجموعات الدراسية</TabsTrigger>
          <TabsTrigger value="schedule"><Clock className="h-4 w-4 ml-2" />الجدول</TabsTrigger>
        </TabsList>

        <TabsContent value="offerings" className="mt-6"><OfferingsTab /></TabsContent>
        <TabsContent value="sections" className="mt-6"><SectionsTab /></TabsContent>
        <TabsContent value="schedule" className="mt-6"><ScheduleTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============ Offerings Tab ============
function OfferingsTab() {
  const qc = useQueryClient();
  const lk = useLookups();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Offering | null>(null);
  const [confirmDel, setConfirmDel] = useState<Offering | null>(null);
  const [yearF, setYearF] = useState<string>("all");
  const [semF, setSemF] = useState<string>("all");

  const { data: offerings = [], isLoading } = useQuery({
    queryKey: ["admin-offerings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("course_offerings").select("*").order("created_at", { ascending: false });
      if (error) throw error; return data as Offering[];
    },
  });

  const filtered = useMemo(() => offerings.filter((o) =>
    (yearF === "all" || o.academic_year_id === yearF) &&
    (semF === "all" || o.semester_id === semF)
  ), [offerings, yearF, semF]);

  const handleDelete = async () => {
    if (!confirmDel) return;
    const { error } = await supabase.from("course_offerings").delete().eq("id", confirmDel.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حذف إسناد المقررات");
    setConfirmDel(null);
    qc.invalidateQueries({ queryKey: ["admin-offerings"] });
  };

  const findCourse = (id: string) => lk.courses.find((c) => c.id === id);
  const findYear = (id: string) => lk.years.find((y) => y.id === id);
  const findSem = (id: string) => lk.semesters.find((s) => s.id === id);
  const findProg = (id: string) => lk.programs.find((p) => p.id === id);
  const findLvl = (id: string) => lk.levels.find((l) => l.id === id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={yearF} onValueChange={setYearF}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="كل السنوات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل السنوات</SelectItem>
            {lk.years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={semF} onValueChange={setSemF}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="كل الفصول" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفصول</SelectItem>
            {lk.semesters.filter((s) => yearF === "all" || s.academic_year_id === yearF).map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 ml-1" /> إسناد جديد
        </Button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">لا يوجد إسناد دراسي.</div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr>
                <th className="p-3 text-right">المقرر</th>
                <th className="p-3 text-right">السنة</th>
                <th className="p-3 text-right">الفصل</th>
                <th className="p-3 text-right">البرنامج</th>
                <th className="p-3 text-right">المستوى</th>
                <th className="p-3 text-center">الحالة</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const c = findCourse(o.course_id);
                return (
                  <tr key={o.id} className="border-t">
                    <td className="p-3">
                      <div className="font-mono font-bold">{c?.code}</div>
                      <div className="text-xs text-muted-foreground">{c?.name_ar}</div>
                    </td>
                    <td className="p-3">{findYear(o.academic_year_id)?.name ?? "—"}</td>
                    <td className="p-3">{findSem(o.semester_id)?.name ?? "—"}</td>
                    <td className="p-3 text-xs">{findProg(o.program_id)?.name_ar ?? "—"}</td>
                    <td className="p-3 text-xs">{findLvl(o.level_id)?.name ?? "—"}</td>
                    <td className="p-3 text-center">
                      <Badge variant={o.status === "active" ? "default" : "secondary"}>
                        {o.status === "active" ? "نشط" : "معطل"}
                      </Badge>
                    </td>
                    <td className="p-3 text-left whitespace-nowrap">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(o); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setConfirmDel(o)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <OfferingFormDialog open={open} onOpenChange={setOpen} editing={editing} lk={lk}
        onSaved={() => qc.invalidateQueries({ queryKey: ["admin-offerings"] })} />

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف إسناد المقررات</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف إسناد المقررات وجميع مجموعاته الدراسية وجداوله. لا يمكن التراجع.</AlertDialogDescription>
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

function OfferingFormDialog({ open, onOpenChange, editing, lk, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Offering | null;
  lk: ReturnType<typeof useLookups>; onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Offering> & { department_id?: string }>({});
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (open) {
      if (editing) {
        const prog = lk.programs.find((p) => p.id === editing.program_id);
        setForm({ ...editing, department_id: prog?.department_id ?? undefined });
      } else {
        setForm({ status: "active" });
      }
    }
  }, [open, editing, lk.programs]);

  const semestersForYear = lk.semesters.filter((s) => !form.academic_year_id || s.academic_year_id === form.academic_year_id);
  const programsForDept = lk.programs.filter((p) => !form.department_id || p.department_id === form.department_id);

  const curriculumReady = Boolean(form.academic_year_id && form.semester_id && form.program_id && form.level_id);

  // Curriculum-aware course query: only from active study_plan for selected program & level
  const planCoursesQ = useQuery({
    queryKey: ["plan-courses", form.program_id, form.level_id],
    enabled: Boolean(form.program_id && form.level_id),
    queryFn: async () => {
      // Find active study plan(s) for program
      const { data: plans, error: pErr } = await supabase
        .from("study_plans")
        .select("id")
        .eq("program_id", form.program_id!)
        .eq("is_active", true)
        .eq("status", "active");
      if (pErr) throw pErr;
      if (!plans || plans.length === 0) return { noPlan: true, courses: [] as Course[] };

      const planIds = plans.map((p) => p.id);
      const { data: spc, error: sErr } = await supabase
        .from("study_plan_courses")
        .select("course_id, sort_order")
        .in("study_plan_id", planIds)
        .eq("level_id", form.level_id!)
        .order("sort_order");
      if (sErr) throw sErr;
      const ids = Array.from(new Set((spc ?? []).map((r) => r.course_id)));
      if (ids.length === 0) return { noPlan: false, courses: [] as Course[] };
      const { data: cs, error: cErr } = await supabase
        .from("courses")
        .select("id, code, name_ar")
        .in("id", ids);
      if (cErr) throw cErr;
      const order = new Map(ids.map((id, i) => [id, i]));
      const courses = ((cs ?? []) as Course[]).slice().sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      return { noPlan: false, courses };
    },
  });

  const save = async () => {
    if (!form.course_id || !form.academic_year_id || !form.semester_id || !form.program_id || !form.level_id) {
      toast.error("جميع الحقول مطلوبة"); return;
    }
    setSaving(true);
    const payload = {
      course_id: form.course_id, academic_year_id: form.academic_year_id,
      semester_id: form.semester_id, program_id: form.program_id,
      level_id: form.level_id, status: form.status ?? "active",
    };
    const { error } = editing
      ? await supabase.from("course_offerings").update(payload).eq("id", editing.id)
      : await supabase.from("course_offerings").insert(payload);
    setSaving(false);
    if (error) {
      if (error.message.includes("uq_course_offering")) toast.error("هذا المقرر مطروح مسبقاً بنفس التركيبة");
      else toast.error(error.message);
      return;
    }
    toast.success(editing ? "تم التحديث" : "تم إضافة إسناد المقررات");
    onOpenChange(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-xl">
        <DialogHeader><DialogTitle>{editing ? "تعديل إسناد" : "إسناد مقرر جديد"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>السنة الأكاديمية *</Label>
            <Select value={form.academic_year_id ?? ""} onValueChange={(v) => setForm({ ...form, academic_year_id: v, semester_id: undefined, course_id: undefined })}>
              <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {lk.years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}{y.is_current ? " (الحالية)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الفصل *</Label>
            <Select value={form.semester_id ?? ""} onValueChange={(v) => setForm({ ...form, semester_id: v, course_id: undefined })}>
              <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {semestersForYear.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>القسم *</Label>
            <Select value={form.department_id ?? ""} onValueChange={(v) => setForm({ ...form, department_id: v, program_id: undefined, course_id: undefined })}>
              <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {lk.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>البرنامج *</Label>
            <Select value={form.program_id ?? ""} onValueChange={(v) => setForm({ ...form, program_id: v, course_id: undefined })} disabled={!form.department_id}>
              <SelectTrigger><SelectValue placeholder={form.department_id ? "اختر" : "اختر القسم أولاً"} /></SelectTrigger>
              <SelectContent>
                {programsForDept.map((p) => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>المستوى *</Label>
            <Select value={form.level_id ?? ""} onValueChange={(v) => setForm({ ...form, level_id: v, course_id: undefined })}>
              <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {lk.levels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الحالة</Label>
            <Select value={form.status ?? "active"} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="inactive">معطل</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>المقرر *</Label>
            <Select
              value={form.course_id ?? ""}
              onValueChange={(v) => setForm({ ...form, course_id: v })}
              disabled={!curriculumReady || planCoursesQ.isLoading || !planCoursesQ.data || planCoursesQ.data.noPlan || planCoursesQ.data.courses.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  !curriculumReady ? "اختر السنة والفصل والبرنامج والمستوى أولاً" :
                  planCoursesQ.isLoading ? "جارٍ التحميل..." :
                  planCoursesQ.data?.noPlan ? "لا توجد خطة دراسية معتمدة لهذا البرنامج." :
                  (planCoursesQ.data?.courses.length ?? 0) === 0 ? "لا توجد مقررات مرتبطة بهذا المستوى." :
                  "اختر المقرر"
                } />
              </SelectTrigger>
              <SelectContent>
                {(planCoursesQ.data?.courses ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.code} — {c.name_ar}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {curriculumReady && planCoursesQ.data?.noPlan && (
              <p className="text-xs text-destructive mt-1">لا توجد خطة دراسية معتمدة لهذا البرنامج.</p>
            )}
            {curriculumReady && !planCoursesQ.isLoading && planCoursesQ.data && !planCoursesQ.data.noPlan && planCoursesQ.data.courses.length === 0 && (
              <p className="text-xs text-destructive mt-1">لا توجد مقررات مرتبطة بهذا المستوى.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ============ Sections Tab ============
function SectionsTab() {
  const qc = useQueryClient();
  const lk = useLookups();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);
  const [confirmDel, setConfirmDel] = useState<Section | null>(null);

  const { data: offerings = [] } = useQuery({
    queryKey: ["admin-offerings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("course_offerings").select("*");
      if (error) throw error; return data as Offering[];
    },
  });

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["admin-sections"],
    queryFn: async () => {
      const { data, error } = await supabase.from("course_sections").select("*").order("section_code");
      if (error) throw error; return data as Section[];
    },
  });

  const findOff = (id: string) => offerings.find((o) => o.id === id);
  const findCourse = (id: string) => lk.courses.find((c) => c.id === id);
  const findFac = (id: string | null) => id ? lk.faculty.find((f) => f.id === id) : null;
  const findSem = (id: string) => lk.semesters.find((s) => s.id === id);

  const offeringLabel = (id: string) => {
    const o = findOff(id); if (!o) return "—";
    const c = findCourse(o.course_id);
    return `${c?.code ?? ""} — ${findSem(o.semester_id)?.name ?? ""}`;
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    const { error } = await supabase.from("course_sections").delete().eq("id", confirmDel.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حذف المجموعات الدراسيةة");
    setConfirmDel(null);
    qc.invalidateQueries({ queryKey: ["admin-sections"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 ml-1" /> مجموعة دراسية جديدة
        </Button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : sections.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد مجموعات.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sections.map((s) => (
            <div key={s.id} className="rounded-lg border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-display font-bold text-primary">{offeringLabel(s.course_offering_id)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    مجموعة دراسية <span className="font-bold font-mono">{s.section_code}</span>
                    {s.capacity != null && <> • السعة {s.capacity}</>}
                  </div>
                  <div className="text-xs mt-1">
                    <span className="text-muted-foreground">المدرّس: </span>
                    {findFac(s.faculty_profile_id)?.full_name_ar ?? "غير محدد"}
                  </div>
                </div>
                <Badge variant={s.status === "active" ? "default" : "secondary"}>
                  {s.status === "active" ? "نشطة" : "معطلة"}
                </Badge>
              </div>
              <div className="mt-3 flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setOpen(true); }}>
                  <Pencil className="h-3.5 w-3.5 ml-1" /> تعديل
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDel(s)}>
                  <Trash2 className="h-3.5 w-3.5 ml-1 text-destructive" /> حذف
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SectionFormDialog open={open} onOpenChange={setOpen} editing={editing}
        offerings={offerings} lk={lk}
        onSaved={() => qc.invalidateQueries({ queryKey: ["admin-sections"] })} />

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المجموعات الدراسيةة</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف المجموعات الدراسيةة وجدولها. لا يمكن التراجع.</AlertDialogDescription>
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

function SectionFormDialog({ open, onOpenChange, editing, offerings, lk, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Section | null;
  offerings: Offering[]; lk: ReturnType<typeof useLookups>; onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Section>>({});
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (open) setForm(editing ?? { section_code: "A", status: "active", capacity: 30 });
  }, [open, editing]);

  const findCourse = (id: string) => lk.courses.find((c) => c.id === id);
  const findSem = (id: string) => lk.semesters.find((s) => s.id === id);

  const save = async () => {
    if (!form.course_offering_id || !form.section_code) { toast.error("إسناد المقررات ورمز المجموعات الدراسيةة مطلوبان"); return; }
    setSaving(true);
    const payload = {
      course_offering_id: form.course_offering_id,
      section_code: form.section_code.toUpperCase(),
      faculty_profile_id: form.faculty_profile_id ?? null,
      capacity: form.capacity ?? null,
      status: form.status ?? "active",
    };
    const { error } = editing
      ? await supabase.from("course_sections").update(payload).eq("id", editing.id)
      : await supabase.from("course_sections").insert(payload);
    setSaving(false);
    if (error) {
      if (error.message.includes("uq_section_code")) toast.error("رمز المجموعات الدراسيةة موجود لهذا إسناد المقررات");
      else toast.error(error.message);
      return;
    }
    toast.success(editing ? "تم التحديث" : "تم إضافة المجموعات الدراسيةة");
    onOpenChange(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-xl">
        <DialogHeader><DialogTitle>{editing ? "تعديل مجموعة دراسية" : "مجموعة دراسية جديدة"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>إسناد المقررات *</Label>
            <Select value={form.course_offering_id ?? ""} onValueChange={(v) => setForm({ ...form, course_offering_id: v })}>
              <SelectTrigger><SelectValue placeholder="اختر الإسناد" /></SelectTrigger>
              <SelectContent>
                {offerings.map((o) => {
                  const c = findCourse(o.course_id);
                  return (
                    <SelectItem key={o.id} value={o.id}>
                      {c?.code} — {c?.name_ar} ({findSem(o.semester_id)?.name})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>رمز المجموعات الدراسيةة *</Label>
            <Input value={form.section_code ?? ""} onChange={(e) => setForm({ ...form, section_code: e.target.value })} placeholder="A / B / C" />
          </div>
          <div>
            <Label>السعة</Label>
            <Input type="number" value={form.capacity ?? ""} onChange={(e) => setForm({ ...form, capacity: e.target.value ? Number(e.target.value) : null })} />
          </div>
          <div className="col-span-2">
            <Label>عضو هيئة التدريس</Label>
            <Select value={form.faculty_profile_id ?? "none"} onValueChange={(v) => setForm({ ...form, faculty_profile_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— غير محدد —</SelectItem>
                {lk.faculty.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.full_name_ar}{f.employee_number ? ` (${f.employee_number})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>الحالة</Label>
            <Select value={form.status ?? "active"} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشطة</SelectItem>
                <SelectItem value="inactive">معطلة</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ Schedule Tab (moved) ============
function ScheduleTab() {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center space-y-3">
      <Clock className="mx-auto h-8 w-8 text-muted-foreground" />
      <div className="font-bold text-primary">انتقلت إدارة الجداول الدراسية إلى صفحة مستقلة</div>
      <p className="text-sm text-muted-foreground">
        أصبحت إدارة المباني والقاعات والفترات الزمنية والجداول الدراسية مع كشف التعارضات في صفحة موحّدة.
      </p>
      <a
        href="/admin/schedules"
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
      >
        فتح إدارة الجداول
      </a>
    </div>
  );
}

