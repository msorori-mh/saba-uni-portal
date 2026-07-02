import { createLazyFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  getStudyPlansLookups,
  listCourses,
  listCoursesMinimal,
  listCoursePlanLinks,
  upsertCourse,
  deleteCourse,
  listStudyPlans,
  listStudyPlansByProgram,
  upsertStudyPlan,
  deleteStudyPlan,
  listStudyPlanCourses,
  upsertStudyPlanCourse,
  deleteStudyPlanCourse,
} from "@/lib/admin-study-plans.functions";
import { Plus, Pencil, Trash2, Loader2, BookOpen, GraduationCap, ListTree, Search, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createLazyFileRoute("/admin/study-plans")({
  component: StudyPlansPage,
});

type Course = {
  id: string; code: string; name_ar: string; name_en: string | null;
  credit_hours: number; theory_hours: number; practical_hours: number;
  department_id: string | null; status: string;
};
type Department = { id: string; name_ar: string };
type Program = { id: string; name_ar: string; code: string; department_id: string | null };
type Level = { id: string; name: string; level_number: number };
type Plan = {
  id: string; program_id: string; name: string; version: string;
  total_credit_hours: number; status: string; is_active: boolean;
  computed_credit_hours?: number;
};
type PlanCourse = {
  id: string; study_plan_id: string; course_id: string; level_id: string;
  semester_code: string; is_required: boolean; prerequisite_course_id: string | null; sort_order: number;
};

const SEMESTERS = [
  { code: "first", label: "الفصل الأول" },
  { code: "second", label: "الفصل الثاني" },
];

function StudyPlansPage() {
  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-primary">الخطط والمقررات</h1>
        <p className="text-sm text-muted-foreground mt-1">إدارة المقررات والخطط الدراسية وربط المقررات بالخطط</p>
      </div>

      <Tabs defaultValue="courses" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="courses"><BookOpen className="h-4 w-4 ml-2" />المقررات</TabsTrigger>
          <TabsTrigger value="plans"><GraduationCap className="h-4 w-4 ml-2" />الخطط الدراسية</TabsTrigger>
          <TabsTrigger value="plan-courses"><ListTree className="h-4 w-4 ml-2" />مقررات الخطة</TabsTrigger>
        </TabsList>

        <TabsContent value="courses" className="mt-6"><CoursesTab /></TabsContent>
        <TabsContent value="plans" className="mt-6"><PlansTab /></TabsContent>
        <TabsContent value="plan-courses" className="mt-6"><PlanCoursesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ====================== COURSES TAB ====================== */
function CoursesTab() {
  const qc = useQueryClient();
  const lookupsFn = useServerFn(getStudyPlansLookups);
  const coursesFn = useServerFn(listCourses);
  const linksFn = useServerFn(listCoursePlanLinks);
  const deleteFn = useServerFn(deleteCourse);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [programFilter, setProgramFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [semesterFilter, setSemesterFilter] = useState<string>("all");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [confirmDel, setConfirmDel] = useState<Course | null>(null);

  const { data: lookups } = useQuery({
    queryKey: ["study-plans-lookups"],
    queryFn: () => lookupsFn({ data: {} }),
  });
  const depts = lookups?.departments ?? [];
  const programs = lookups?.programs ?? [];
  const levels = lookups?.levels ?? [];

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["admin-courses"],
    queryFn: () => coursesFn({ data: {} }),
  });

  const { data: planLinks = [] } = useQuery({
    queryKey: ["admin-course-plan-links"],
    queryFn: () => linksFn({ data: {} }),
  });

  const programsInDept = useMemo(
    () => deptFilter === "all" ? programs : programs.filter((p) => p.department_id === deptFilter),
    [programs, deptFilter],
  );

  const useCurriculumFilter = programFilter !== "all" || levelFilter !== "all" || semesterFilter !== "all";

  const courseIdsMatchingCurriculum = useMemo(() => {
    if (!useCurriculumFilter) return null;
    const set = new Set<string>();
    for (const link of planLinks) {
      if (programFilter !== "all" && link.study_plans?.program_id !== programFilter) continue;
      if (levelFilter !== "all" && link.level_id !== levelFilter) continue;
      if (semesterFilter !== "all" && link.semester_code !== semesterFilter) continue;
      set.add(link.course_id);
    }
    return set;
  }, [planLinks, programFilter, levelFilter, semesterFilter, useCurriculumFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses.filter((c) => {
      if (deptFilter !== "all" && c.department_id !== deptFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (courseIdsMatchingCurriculum && !courseIdsMatchingCurriculum.has(c.id)) return false;
      if (q && !`${c.code} ${c.name_ar} ${c.name_en ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [courses, search, deptFilter, statusFilter, courseIdsMatchingCurriculum]);

  const resetFilters = () => {
    setSearch(""); setDeptFilter("all"); setStatusFilter("all");
    setProgramFilter("all"); setLevelFilter("all"); setSemesterFilter("all");
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    try {
      await deleteFn({ data: { id: confirmDel.id } });
      toast.success("تم حذف المقرر");
      setConfirmDel(null);
      qc.invalidateQueries({ queryKey: ["admin-courses"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-row-reverse flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالكود أو الاسم" className="pr-9" />
        </div>
        <Select value={deptFilter} onValueChange={(v) => {
          setDeptFilter(v);
          if (v !== "all" && programFilter !== "all") {
            const prog = programs.find((p) => p.id === programFilter);
            if (!prog || prog.department_id !== v) setProgramFilter("all");
          }
        }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="كل الأقسام" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام</SelectItem>
            {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={programFilter} onValueChange={setProgramFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="كل البرامج" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل البرامج</SelectItem>
            {programsInDept.map((p) => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="كل المستويات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المستويات</SelectItem>
            {levels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={semesterFilter} onValueChange={setSemesterFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="كل الفصول" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفصول</SelectItem>
            {SEMESTERS.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="inactive">معطل</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={resetFilters}>
          <RotateCcw className="h-3.5 w-3.5 ml-1" /> إعادة تعيين
        </Button>
        <Button onClick={() => { setEditing(null); setOpenForm(true); }}>
          <Plus className="h-4 w-4 ml-1" /> إضافة مقرر
        </Button>
      </div>


      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد مقررات.</div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr>
                <th className="p-3 text-right">الكود</th>
                <th className="p-3 text-right">الاسم</th>
                <th className="p-3 text-center">س.م</th>
                <th className="p-3 text-center">نظري</th>
                <th className="p-3 text-center">عملي</th>
                <th className="p-3 text-right">القسم</th>
                <th className="p-3 text-center">الحالة</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="p-3 font-mono font-bold">{c.code}</td>
                  <td className="p-3">
                    <div className="font-semibold">{c.name_ar}</div>
                    {c.name_en && <div className="text-xs text-muted-foreground" dir="ltr">{c.name_en}</div>}
                  </td>
                  <td className="p-3 text-center">{c.credit_hours}</td>
                  <td className="p-3 text-center">{c.theory_hours}</td>
                  <td className="p-3 text-center">{c.practical_hours}</td>
                  <td className="p-3 text-xs">{depts.find((d) => d.id === c.department_id)?.name_ar ?? "—"}</td>
                  <td className="p-3 text-center">
                    <Badge variant={c.status === "active" ? "default" : "secondary"}>
                      {c.status === "active" ? "نشط" : "معطل"}
                    </Badge>
                  </td>
                  <td className="p-3 text-left whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpenForm(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setConfirmDel(c)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CourseFormDialog
        open={openForm}
        onOpenChange={setOpenForm}
        editing={editing}
        depts={depts}
        onSaved={() => qc.invalidateQueries({ queryKey: ["admin-courses"] })}
      />

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المقرر</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف المقرر "{confirmDel?.name_ar}" نهائياً. لا يمكن التراجع.
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

function CourseFormDialog({
  open, onOpenChange, editing, depts, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editing: Course | null; depts: Department[]; onSaved: () => void;
}) {
  const upsertFn = useServerFn(upsertCourse);
  const [form, setForm] = useState<Partial<Course>>({});
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (open) {
      setForm(editing ?? {
        code: "", name_ar: "", name_en: "",
        credit_hours: 3, theory_hours: 2, practical_hours: 2,
        department_id: null, status: "active",
      });
    }
  }, [open, editing]);

  const theory = Number(form.theory_hours) || 0;
  const practical = Number(form.practical_hours) || 0;
  const computedCredits = theory + Math.ceil(practical / 2);

  const save = async () => {
    if (!form.code || !form.name_ar) { toast.error("الكود والاسم العربي مطلوبان"); return; }
    setSaving(true);
    try {
      await upsertFn({
        data: {
          id: editing?.id,
          code: form.code!,
          name_ar: form.name_ar!,
          name_en: form.name_en ?? null,
          credit_hours: computedCredits,
          theory_hours: theory,
          practical_hours: practical,
          department_id: form.department_id ?? null,
          status: (form.status ?? "active") as "active" | "inactive",
        },
      });
      toast.success(editing ? "تم تحديث المقرر" : "تم إضافة المقرر");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-xl">
        <DialogHeader><DialogTitle>{editing ? "تعديل مقرر" : "إضافة مقرر"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>الكود *</Label><Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
          <div>
            <Label>القسم</Label>
            <Select value={form.department_id ?? "none"} onValueChange={(v) => setForm({ ...form, department_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— بدون —</SelectItem>
                {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>الاسم (عربي) *</Label><Input value={form.name_ar ?? ""} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></div>
          <div className="col-span-2"><Label>الاسم (إنجليزي)</Label><Input dir="ltr" value={form.name_en ?? ""} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
          <div><Label>نظري</Label><Input type="number" min={0} value={form.theory_hours ?? 0} onChange={(e) => setForm({ ...form, theory_hours: Number(e.target.value) })} /></div>
          <div><Label>عملي</Label><Input type="number" min={0} value={form.practical_hours ?? 0} onChange={(e) => setForm({ ...form, practical_hours: Number(e.target.value) })} /></div>
          <div className="col-span-2">
            <Label>الساعات المعتمدة (محسوبة تلقائيًا)</Label>
            <Input type="number" value={computedCredits} readOnly disabled />
            <p className="text-xs text-muted-foreground mt-1">القاعدة: نظري + ⌈عملي ÷ 2⌉</p>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ====================== PLANS TAB ====================== */
function PlansTab() {
  const qc = useQueryClient();
  const lookupsFn = useServerFn(getStudyPlansLookups);
  const plansFn = useServerFn(listStudyPlans);
  const deleteFn = useServerFn(deleteStudyPlan);
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [confirmDel, setConfirmDel] = useState<Plan | null>(null);
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [programFilter, setProgramFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: lookups } = useQuery({
    queryKey: ["study-plans-lookups"],
    queryFn: () => lookupsFn({ data: {} }),
  });
  const depts = lookups?.departments ?? [];
  const programs = lookups?.programs ?? [];

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => plansFn({ data: {} }),
  });

  const programsInDept = useMemo(
    () => deptFilter === "all" ? programs : programs.filter((p) => p.department_id === deptFilter),
    [programs, deptFilter],
  );
  const programIdsInDept = useMemo(() => new Set(programsInDept.map((p) => p.id)), [programsInDept]);

  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      if (deptFilter !== "all" && !programIdsInDept.has(p.program_id)) return false;
      if (programFilter !== "all" && p.program_id !== programFilter) return false;
      if (statusFilter === "active" && !p.is_active) return false;
      if (statusFilter === "inactive" && p.is_active) return false;
      if (statusFilter === "archived" && p.status !== "archived") return false;
      return true;
    });
  }, [plans, deptFilter, programFilter, statusFilter, programIdsInDept]);

  const resetFilters = () => {
    setDeptFilter("all"); setProgramFilter("all"); setStatusFilter("all");
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    try {
      await deleteFn({ data: { id: confirmDel.id } });
      toast.success("تم حذف الخطة");
      setConfirmDel(null);
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-row-reverse flex-wrap items-center gap-3">
        <Select value={deptFilter} onValueChange={(v) => {
          setDeptFilter(v);
          if (v !== "all" && programFilter !== "all") {
            const prog = programs.find((p) => p.id === programFilter);
            if (!prog || prog.department_id !== v) setProgramFilter("all");
          }
        }}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="كل الأقسام" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام</SelectItem>
            {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={programFilter} onValueChange={setProgramFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="كل البرامج" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل البرامج</SelectItem>
            {programsInDept.map((p) => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="active">نشطة</SelectItem>
            <SelectItem value="inactive">معطلة</SelectItem>
            <SelectItem value="archived">مؤرشفة</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={resetFilters}>
          <RotateCcw className="h-3.5 w-3.5 ml-1" /> إعادة تعيين
        </Button>
        <div className="flex-1" />
        <Button onClick={() => { setEditing(null); setOpenForm(true); }}>
          <Plus className="h-4 w-4 ml-1" /> خطة جديدة
        </Button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filteredPlans.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد خطط دراسية مطابقة.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filteredPlans.map((p) => {
            const prog = programs.find((x) => x.id === p.program_id);
            return (
              <div key={p.id} className="rounded-lg border bg-card p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display font-bold text-primary truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {prog?.name_ar ?? "—"} • إصدار {p.version} • {p.total_credit_hours} ساعة
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "نشطة" : "معطلة"}</Badge>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setOpenForm(true); }}>
                    <Pencil className="h-3.5 w-3.5 ml-1" /> تعديل
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDel(p)}>
                    <Trash2 className="h-3.5 w-3.5 ml-1 text-destructive" /> حذف
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}


      <PlanFormDialog
        open={openForm} onOpenChange={setOpenForm}
        editing={editing} programs={programs}
        onSaved={() => qc.invalidateQueries({ queryKey: ["admin-plans"] })}
      />

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الخطة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الخطة "{confirmDel?.name}" وكل مقرراتها. لا يمكن التراجع.
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

function PlanFormDialog({
  open, onOpenChange, editing, programs, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editing: Plan | null; programs: Program[]; onSaved: () => void;
}) {
  const upsertFn = useServerFn(upsertStudyPlan);
  const [form, setForm] = useState<Partial<Plan>>({});
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (open) {
      setForm(editing ?? {
        program_id: programs[0]?.id, name: "", version: new Date().getFullYear().toString(),
        total_credit_hours: 0, status: "active", is_active: true,
      });
    }
  }, [open, editing, programs]);

  const save = async () => {
    if (!form.program_id || !form.name || !form.version) { toast.error("جميع الحقول مطلوبة"); return; }
    setSaving(true);
    try {
      await upsertFn({
        data: {
          id: editing?.id,
          program_id: form.program_id!,
          name: form.name!,
          version: form.version!,
          total_credit_hours: Number(form.total_credit_hours) || 0,
          status: (form.status ?? "active") as "active" | "archived",
          is_active: form.is_active ?? true,
        },
      });
      toast.success(editing ? "تم تحديث الخطة" : "تم إنشاء الخطة");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "تعديل خطة" : "خطة جديدة"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>البرنامج *</Label>
            <Select value={form.program_id ?? ""} onValueChange={(v) => setForm({ ...form, program_id: v })}>
              <SelectTrigger><SelectValue placeholder="اختر برنامج" /></SelectTrigger>
              <SelectContent>
                {programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>اسم الخطة *</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>الإصدار *</Label><Input value={form.version ?? ""} onChange={(e) => setForm({ ...form, version: e.target.value })} /></div>
            <div><Label>إجمالي الساعات</Label><Input type="number" value={form.total_credit_hours ?? 0} onChange={(e) => setForm({ ...form, total_credit_hours: Number(e.target.value) })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>الحالة</Label>
              <Select value={form.status ?? "active"} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">نشطة</SelectItem>
                  <SelectItem value="archived">مؤرشفة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>خطة فعّالة</Label>
              <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
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

/* ====================== PLAN COURSES TAB ====================== */
function PlanCoursesTab() {
  const qc = useQueryClient();
  const lookupsFn = useServerFn(getStudyPlansLookups);
  const plansByProgFn = useServerFn(listStudyPlansByProgram);
  const coursesFn = useServerFn(listCoursesMinimal);
  const planCoursesFn = useServerFn(listStudyPlanCourses);
  const deleteFn = useServerFn(deleteStudyPlanCourse);
  const [deptId, setDeptId] = useState<string>("all");
  const [programId, setProgramId] = useState<string>("");
  const [planId, setPlanId] = useState<string>("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [semesterFilter, setSemesterFilter] = useState<string>("all");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<PlanCourse | null>(null);
  const [confirmDel, setConfirmDel] = useState<PlanCourse | null>(null);

  const { data: lookups } = useQuery({
    queryKey: ["study-plans-lookups"],
    queryFn: () => lookupsFn({ data: {} }),
  });
  const depts = lookups?.departments ?? [];
  const programs = lookups?.programs ?? [];
  const levels = lookups?.levels ?? [];

  const programsInDept = useMemo(
    () => deptId === "all" ? programs : programs.filter((p) => p.department_id === deptId),
    [programs, deptId],
  );

  const { data: plans = [] } = useQuery({
    queryKey: ["admin-plans-by-prog", programId],
    queryFn: () => plansByProgFn({ data: { programId } }),
    enabled: !!programId,
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["admin-courses-all"],
    queryFn: () => coursesFn({ data: {} }),
  });

  const { data: planCourses = [], isLoading } = useQuery({
    queryKey: ["admin-plan-courses", planId],
    queryFn: () => planCoursesFn({ data: { studyPlanId: planId } }),
    enabled: !!planId,
  });

  const filteredPlanCourses = useMemo(() => {
    return planCourses.filter((pc) => {
      if (levelFilter !== "all" && pc.level_id !== levelFilter) return false;
      if (semesterFilter !== "all" && pc.semester_code !== semesterFilter) return false;
      return true;
    });
  }, [planCourses, levelFilter, semesterFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, PlanCourse[]>();
    for (const pc of filteredPlanCourses) {
      const key = `${pc.level_id}|${pc.semester_code}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(pc);
    }
    return map;
  }, [filteredPlanCourses]);

  const resetFilters = () => {
    setDeptId("all"); setProgramId(""); setPlanId("");
    setLevelFilter("all"); setSemesterFilter("all");
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    try {
      await deleteFn({ data: { id: confirmDel.id } });
      toast.success("تم حذف المقرر من الخطة");
      setConfirmDel(null);
      qc.invalidateQueries({ queryKey: ["admin-plan-courses", planId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-row-reverse flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <Label className="text-xs">القسم</Label>
          <Select value={deptId} onValueChange={(v) => {
            setDeptId(v);
            if (v !== "all" && programId) {
              const prog = programs.find((p) => p.id === programId);
              if (!prog || prog.department_id !== v) { setProgramId(""); setPlanId(""); }
            }
          }}>
            <SelectTrigger><SelectValue placeholder="كل الأقسام" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px]">
          <Label className="text-xs">البرنامج</Label>
          <Select value={programId} onValueChange={(v) => { setProgramId(v); setPlanId(""); }}>
            <SelectTrigger><SelectValue placeholder="اختر البرنامج" /></SelectTrigger>
            <SelectContent>
              {programsInDept.map((p) => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px]">
          <Label className="text-xs">الخطة الدراسية</Label>
          <Select value={planId} onValueChange={setPlanId} disabled={!programId}>
            <SelectTrigger><SelectValue placeholder="اختر الخطة" /></SelectTrigger>
            <SelectContent>
              {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.version})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <Label className="text-xs">المستوى</Label>
          <Select value={levelFilter} onValueChange={setLevelFilter} disabled={!planId}>
            <SelectTrigger><SelectValue placeholder="كل المستويات" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المستويات</SelectItem>
              {levels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <Label className="text-xs">الفصل</Label>
          <Select value={semesterFilter} onValueChange={setSemesterFilter} disabled={!planId}>
            <SelectTrigger><SelectValue placeholder="كل الفصول" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفصول</SelectItem>
              {SEMESTERS.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={resetFilters}>
          <RotateCcw className="h-3.5 w-3.5 ml-1" /> إعادة تعيين
        </Button>
        <div className="flex-1" />
        <Button onClick={() => { setEditing(null); setOpenForm(true); }} disabled={!planId}>
          <Plus className="h-4 w-4 ml-1" /> إضافة مقرر للخطة
        </Button>
      </div>

      {!planId ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          اختر البرنامج والخطة لعرض المقررات.
        </div>
      ) : isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filteredPlanCourses.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">لا توجد مقررات مطابقة في هذه الخطة.</div>
      ) : (
        <div className="space-y-4">
          {levels.map((lvl) => {
            const lvlHas = SEMESTERS.some((s) => (grouped.get(`${lvl.id}|${s.code}`)?.length ?? 0) > 0);
            if (!lvlHas) return null;
            return (

              <div key={lvl.id} className="rounded-lg border bg-card">
                <div className="px-4 py-2 border-b bg-muted/30 font-bold text-primary text-sm">{lvl.name}</div>
                <div className="grid md:grid-cols-3 gap-px bg-border">
                  {SEMESTERS.map((s) => {
                    const items = grouped.get(`${lvl.id}|${s.code}`) ?? [];
                    return (
                      <div key={s.code} className="bg-card p-3 min-h-[80px]">
                        <div className="text-[11px] font-bold text-muted-foreground mb-2">{s.label}</div>
                        {items.length === 0 ? (
                          <div className="text-xs text-muted-foreground">—</div>
                        ) : (
                          <ul className="space-y-1.5">
                            {items.map((pc) => {
                              const c = courses.find((x) => x.id === pc.course_id);
                              const pre = pc.prerequisite_course_id ? courses.find((x) => x.id === pc.prerequisite_course_id) : null;
                              return (
                                <li key={pc.id} className="flex items-start justify-between gap-2 rounded border p-2 text-xs">
                                  <div className="min-w-0">
                                    <div className="font-bold font-mono">{c?.code}</div>
                                    <div className="truncate">{c?.name_ar}</div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      {c?.credit_hours} س.م {pc.is_required ? "• إجباري" : "• اختياري"}
                                      {pre && <> • متطلب: <span className="font-mono">{pre.code}</span></>}
                                    </div>
                                  </div>
                                  <div className="flex flex-col gap-1 shrink-0">
                                    <button onClick={() => { setEditing(pc); setOpenForm(true); }} className="text-primary hover:underline"><Pencil className="h-3 w-3" /></button>
                                    <button onClick={() => setConfirmDel(pc)} className="text-destructive hover:underline"><Trash2 className="h-3 w-3" /></button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PlanCourseFormDialog
        open={openForm} onOpenChange={setOpenForm}
        editing={editing} planId={planId}
        courses={courses} levels={levels} existing={planCourses}
        onSaved={() => qc.invalidateQueries({ queryKey: ["admin-plan-courses", planId] })}
      />

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف من الخطة</AlertDialogTitle>
            <AlertDialogDescription>هل تريد حذف هذا المقرر من الخطة؟</AlertDialogDescription>
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

function PlanCourseFormDialog({
  open, onOpenChange, editing, planId, courses, levels, existing, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  editing: PlanCourse | null; planId: string;
  courses: Pick<Course, "id" | "code" | "name_ar" | "credit_hours">[];
  levels: Level[]; existing: PlanCourse[];
  onSaved: () => void;
}) {
  const upsertFn = useServerFn(upsertStudyPlanCourse);
  const [form, setForm] = useState<Partial<PlanCourse>>({});
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (open) {
      setForm(editing ?? {
        course_id: undefined, level_id: levels[0]?.id,
        semester_code: "first", is_required: true,
        prerequisite_course_id: null, sort_order: existing.length + 1,
      });
    }
  }, [open, editing, levels, existing.length]);

  const save = async () => {
    if (!form.course_id || !form.level_id || !form.semester_code) { toast.error("المقرر والمستوى والفصل مطلوبة"); return; }
    // Duplicate guard (client-side; DB enforces UNIQUE too)
    const dup = existing.find((e) =>
      e.id !== editing?.id &&
      e.course_id === form.course_id &&
      e.level_id === form.level_id &&
      e.semester_code === form.semester_code,
    );
    if (dup) { toast.error("هذا المقرر مضاف بالفعل في نفس المستوى والفصل"); return; }

    setSaving(true);
    try {
      await upsertFn({
        data: {
          id: editing?.id,
          study_plan_id: planId,
          course_id: form.course_id!,
          level_id: form.level_id!,
          semester_code: form.semester_code! as "first" | "second",
          is_required: form.is_required ?? true,
          prerequisite_course_id: form.prerequisite_course_id ?? null,
          sort_order: Number(form.sort_order) || 0,
        },
      });
      toast.success(editing ? "تم التحديث" : "تم الإضافة");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "تعديل مقرر الخطة" : "إضافة مقرر للخطة"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>المقرر *</Label>
            <Select value={form.course_id ?? ""} onValueChange={(v) => setForm({ ...form, course_id: v })}>
              <SelectTrigger><SelectValue placeholder="اختر المقرر" /></SelectTrigger>
              <SelectContent>
                {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>المستوى *</Label>
              <Select value={form.level_id ?? ""} onValueChange={(v) => setForm({ ...form, level_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {levels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الفصل *</Label>
              <Select value={form.semester_code ?? ""} onValueChange={(v) => setForm({ ...form, semester_code: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEMESTERS.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>المتطلب السابق</Label>
            <Select value={form.prerequisite_course_id ?? "none"} onValueChange={(v) => setForm({ ...form, prerequisite_course_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— بدون —</SelectItem>
                {courses.filter((c) => c.id !== form.course_id).map((c) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>إجباري</Label>
              <Switch checked={form.is_required ?? true} onCheckedChange={(v) => setForm({ ...form, is_required: v })} />
            </div>
            <div><Label>ترتيب العرض</Label><Input type="number" value={form.sort_order ?? 0} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
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
