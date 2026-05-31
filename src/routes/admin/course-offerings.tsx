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
type Program = { id: string; name_ar: string; code: string };
type Level = { id: string; name: string; level_number: number };
type FacultyProfile = { id: string; full_name_ar: string; employee_number: string | null };

type Offering = {
  id: string; course_id: string; academic_year_id: string; semester_id: string;
  program_id: string; level_id: string; status: string;
};
type Section = {
  id: string; course_offering_id: string; section_code: string;
  faculty_profile_id: string | null; capacity: number | null; status: string;
};
type Schedule = {
  id: string; course_section_id: string; day_of_week: string;
  start_time: string; end_time: string; room: string | null; schedule_type: string;
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
      const { data, error } = await supabase.from("programs").select("id, name_ar, code").order("sort_order");
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
  };
}

// ============ Page ============
function CourseOfferingsPage() {
  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-primary">الطرح والشعب</h1>
        <p className="text-sm text-muted-foreground mt-1">إدارة طرح المقررات والشعب والجداول الدراسية</p>
      </div>

      <Tabs defaultValue="offerings" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="offerings"><CalendarDays className="h-4 w-4 ml-2" />الطرح الدراسي</TabsTrigger>
          <TabsTrigger value="sections"><Users2 className="h-4 w-4 ml-2" />الشعب</TabsTrigger>
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
    toast.success("تم حذف الطرح");
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
          <Plus className="h-4 w-4 ml-1" /> طرح جديد
        </Button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">لا يوجد طرح دراسي.</div>
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
            <AlertDialogTitle>حذف الطرح</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف الطرح وجميع شعبه وجداوله. لا يمكن التراجع.</AlertDialogDescription>
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
  const [form, setForm] = useState<Partial<Offering>>({});
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (open) setForm(editing ?? { status: "active" });
  }, [open, editing]);

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
    toast.success(editing ? "تم التحديث" : "تم إضافة الطرح");
    onOpenChange(false); onSaved();
  };

  const semestersForYear = lk.semesters.filter((s) => !form.academic_year_id || s.academic_year_id === form.academic_year_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-xl">
        <DialogHeader><DialogTitle>{editing ? "تعديل طرح" : "طرح مقرر جديد"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>المقرر *</Label>
            <Select value={form.course_id ?? ""} onValueChange={(v) => setForm({ ...form, course_id: v })}>
              <SelectTrigger><SelectValue placeholder="اختر المقرر" /></SelectTrigger>
              <SelectContent>
                {lk.courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>السنة الأكاديمية *</Label>
            <Select value={form.academic_year_id ?? ""} onValueChange={(v) => setForm({ ...form, academic_year_id: v, semester_id: undefined })}>
              <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {lk.years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}{y.is_current ? " (الحالية)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الفصل *</Label>
            <Select value={form.semester_id ?? ""} onValueChange={(v) => setForm({ ...form, semester_id: v })}>
              <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {semestersForYear.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>البرنامج *</Label>
            <Select value={form.program_id ?? ""} onValueChange={(v) => setForm({ ...form, program_id: v })}>
              <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {lk.programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>المستوى *</Label>
            <Select value={form.level_id ?? ""} onValueChange={(v) => setForm({ ...form, level_id: v })}>
              <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {lk.levels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>الحالة</Label>
            <Select value={form.status ?? "active"} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="inactive">معطل</SelectItem>
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
    toast.success("تم حذف الشعبة");
    setConfirmDel(null);
    qc.invalidateQueries({ queryKey: ["admin-sections"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 ml-1" /> شعبة جديدة
        </Button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : sections.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد شعب.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sections.map((s) => (
            <div key={s.id} className="rounded-lg border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-display font-bold text-primary">{offeringLabel(s.course_offering_id)}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    شعبة <span className="font-bold font-mono">{s.section_code}</span>
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
            <AlertDialogTitle>حذف الشعبة</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف الشعبة وجدولها. لا يمكن التراجع.</AlertDialogDescription>
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
    if (!form.course_offering_id || !form.section_code) { toast.error("الطرح ورمز الشعبة مطلوبان"); return; }
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
      if (error.message.includes("uq_section_code")) toast.error("رمز الشعبة موجود لهذا الطرح");
      else toast.error(error.message);
      return;
    }
    toast.success(editing ? "تم التحديث" : "تم إضافة الشعبة");
    onOpenChange(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-xl">
        <DialogHeader><DialogTitle>{editing ? "تعديل شعبة" : "شعبة جديدة"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>الطرح الدراسي *</Label>
            <Select value={form.course_offering_id ?? ""} onValueChange={(v) => setForm({ ...form, course_offering_id: v })}>
              <SelectTrigger><SelectValue placeholder="اختر الطرح" /></SelectTrigger>
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
            <Label>رمز الشعبة *</Label>
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

// ============ Schedule Tab ============
function ScheduleTab() {
  const qc = useQueryClient();
  const lk = useLookups();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [confirmDel, setConfirmDel] = useState<Schedule | null>(null);

  const { data: sections = [] } = useQuery({
    queryKey: ["admin-sections"],
    queryFn: async () => {
      const { data, error } = await supabase.from("course_sections").select("*");
      if (error) throw error; return data as Section[];
    },
  });
  const { data: offerings = [] } = useQuery({
    queryKey: ["admin-offerings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("course_offerings").select("*");
      if (error) throw error; return data as Offering[];
    },
  });
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["admin-schedule"],
    queryFn: async () => {
      const { data, error } = await supabase.from("class_schedule").select("*").order("day_of_week");
      if (error) throw error; return data as Schedule[];
    },
  });

  const sectionLabel = (id: string) => {
    const s = sections.find((x) => x.id === id); if (!s) return "—";
    const o = offerings.find((x) => x.id === s.course_offering_id);
    const c = lk.courses.find((x) => x.id === o?.course_id);
    return `${c?.code ?? ""} (${s.section_code})`;
  };
  const facultyForSection = (id: string) => {
    const s = sections.find((x) => x.id === id);
    return s?.faculty_profile_id ? lk.faculty.find((f) => f.id === s.faculty_profile_id)?.full_name_ar : null;
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    const { error } = await supabase.from("class_schedule").delete().eq("id", confirmDel.id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حذف الموعد");
    setConfirmDel(null);
    qc.invalidateQueries({ queryKey: ["admin-schedule"] });
  };

  // Group by day
  const grouped = useMemo(() => {
    const m = new Map<string, Schedule[]>();
    for (const d of DAYS) m.set(d.code, []);
    for (const s of schedules) m.get(s.day_of_week)?.push(s);
    return m;
  }, [schedules]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 ml-1" /> موعد جديد
        </Button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : schedules.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد مواعيد.</div>
      ) : (
        <div className="space-y-3">
          {DAYS.map((d) => {
            const items = grouped.get(d.code) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={d.code} className="rounded-lg border bg-card overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 text-sm font-bold text-primary border-b">{d.label}</div>
                <div className="divide-y">
                  {items.sort((a, b) => a.start_time.localeCompare(b.start_time)).map((sch) => (
                    <div key={sch.id} className="p-3 flex items-center gap-3 text-sm">
                      <div className="font-mono text-xs bg-muted px-2 py-1 rounded">
                        {sch.start_time.slice(0, 5)} - {sch.end_time.slice(0, 5)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold">{sectionLabel(sch.course_section_id)}</div>
                        <div className="text-xs text-muted-foreground">
                          {facultyForSection(sch.course_section_id) ?? "—"}
                          {sch.room && <> • {sch.room}</>}
                        </div>
                      </div>
                      <Badge variant="outline">{typeLabel(sch.schedule_type)}</Badge>
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(sch); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setConfirmDel(sch)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ScheduleFormDialog open={open} onOpenChange={setOpen} editing={editing}
        sections={sections} offerings={offerings} schedules={schedules} lk={lk}
        onSaved={() => qc.invalidateQueries({ queryKey: ["admin-schedule"] })} />

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الموعد</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف هذا الموعد. لا يمكن التراجع.</AlertDialogDescription>
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

function ScheduleFormDialog({ open, onOpenChange, editing, sections, offerings, schedules, lk, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Schedule | null;
  sections: Section[]; offerings: Offering[]; schedules: Schedule[];
  lk: ReturnType<typeof useLookups>; onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Schedule>>({});
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (open) setForm(editing ?? { day_of_week: "saturday", schedule_type: "lecture", start_time: "08:00", end_time: "10:00" });
  }, [open, editing]);

  const findCourse = (id: string) => lk.courses.find((c) => c.id === id);

  // Client-side conflict check
  const checkConflicts = (): string | null => {
    if (!form.course_section_id || !form.day_of_week || !form.start_time || !form.end_time) return null;
    const newSection = sections.find((s) => s.id === form.course_section_id);
    if (!newSection) return null;
    const newStart = form.start_time;
    const newEnd = form.end_time;
    for (const sch of schedules) {
      if (editing && sch.id === editing.id) continue;
      if (sch.day_of_week !== form.day_of_week) continue;
      const overlaps = sch.start_time < newEnd && sch.end_time > newStart;
      if (!overlaps) continue;
      // Same room
      if (form.room && sch.room && form.room.trim().toLowerCase() === sch.room.trim().toLowerCase()) {
        return `تعارض في القاعة "${sch.room}" مع موعد آخر في نفس اليوم`;
      }
      // Same faculty
      const otherSection = sections.find((s) => s.id === sch.course_section_id);
      if (newSection.faculty_profile_id && otherSection?.faculty_profile_id === newSection.faculty_profile_id) {
        return "تعارض في الوقت مع موعد آخر لنفس عضو هيئة التدريس";
      }
    }
    return null;
  };

  const save = async () => {
    if (!form.course_section_id || !form.day_of_week || !form.start_time || !form.end_time) {
      toast.error("جميع الحقول الأساسية مطلوبة"); return;
    }
    if (form.end_time <= form.start_time) { toast.error("وقت النهاية يجب أن يكون بعد البداية"); return; }
    const conflict = checkConflicts();
    if (conflict) { toast.error(conflict); return; }
    setSaving(true);
    const payload = {
      course_section_id: form.course_section_id,
      day_of_week: form.day_of_week,
      start_time: form.start_time, end_time: form.end_time,
      room: form.room ?? null, schedule_type: form.schedule_type ?? "lecture",
    };
    const { error } = editing
      ? await supabase.from("class_schedule").update(payload).eq("id", editing.id)
      : await supabase.from("class_schedule").insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "تم التحديث" : "تم إضافة الموعد");
    onOpenChange(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-xl">
        <DialogHeader><DialogTitle>{editing ? "تعديل موعد" : "موعد جديد"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>الشعبة *</Label>
            <Select value={form.course_section_id ?? ""} onValueChange={(v) => setForm({ ...form, course_section_id: v })}>
              <SelectTrigger><SelectValue placeholder="اختر الشعبة" /></SelectTrigger>
              <SelectContent>
                {sections.map((s) => {
                  const o = offerings.find((x) => x.id === s.course_offering_id);
                  const c = findCourse(o?.course_id ?? "");
                  return (
                    <SelectItem key={s.id} value={s.id}>{c?.code} — شعبة {s.section_code}</SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>اليوم *</Label>
            <Select value={form.day_of_week ?? ""} onValueChange={(v) => setForm({ ...form, day_of_week: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAYS.map((d) => <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>النوع</Label>
            <Select value={form.schedule_type ?? "lecture"} onValueChange={(v) => setForm({ ...form, schedule_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>وقت البداية *</Label>
            <Input type="time" value={form.start_time?.slice(0, 5) ?? ""} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </div>
          <div>
            <Label>وقت النهاية *</Label>
            <Input type="time" value={form.end_time?.slice(0, 5) ?? ""} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>القاعة</Label>
            <Input value={form.room ?? ""} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Lab-1 / Room-2" />
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
