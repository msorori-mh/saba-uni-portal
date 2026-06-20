import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listAcademicYears,
  upsertAcademicYear,
  deleteAcademicYear,
  listSemesters,
  upsertSemester,
  deleteSemester,
  listAcademicLevels,
  upsertAcademicLevel,
  deleteAcademicLevel,
} from "@/lib/admin-academic-core.functions";
import { Plus, Pencil, Trash2, Loader2, CalendarRange, BookMarked, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/academic-core")({
  component: AcademicCorePage,
});

type Year = { id: string; name: string; start_date: string; end_date: string; is_current: boolean; status: string };
type Semester = { id: string; academic_year_id: string; name: string; code: string; start_date: string; end_date: string; is_current: boolean; status: string };
type Level = { id: string; name: string; level_number: number; status: string };

function AcademicCorePage() {
  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-primary">البنية الأكاديمية</h1>
        <p className="text-sm text-muted-foreground mt-1">إدارة السنوات الأكاديمية والفصول الدراسية والمستويات</p>
      </div>

      <Tabs defaultValue="years" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-xl">
          <TabsTrigger value="years"><CalendarRange className="h-4 w-4 ml-2" />السنوات</TabsTrigger>
          <TabsTrigger value="semesters"><BookMarked className="h-4 w-4 ml-2" />الفصول</TabsTrigger>
          <TabsTrigger value="levels"><Layers className="h-4 w-4 ml-2" />المستويات</TabsTrigger>
        </TabsList>

        <TabsContent value="years" className="mt-6"><YearsTab /></TabsContent>
        <TabsContent value="semesters" className="mt-6"><SemestersTab /></TabsContent>
        <TabsContent value="levels" className="mt-6"><LevelsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Years ---------------- */
function YearsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAcademicYears);
  const deleteFn = useServerFn(deleteAcademicYear);

  const { data = [], isLoading } = useQuery({
    queryKey: ["academic_years"],
    queryFn: () => listFn({ data: {} }),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Year | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["academic_years"] });

  const onDelete = async () => {
    if (!delId) return;
    try {
      await deleteFn({ data: { id: delId } });
      toast.success("تم الحذف");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحذف");
    }
    setDelId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 ml-1" /> إضافة سنة أكاديمية
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-right p-3">الاسم</th>
              <th className="text-right p-3">من</th>
              <th className="text-right p-3">إلى</th>
              <th className="text-right p-3">الحالية</th>
              <th className="text-right p-3">الحالة</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="p-6 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></td></tr>}
            {!isLoading && data.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد بيانات</td></tr>}
            {(data as Year[]).map((y) => (
              <tr key={y.id} className="border-t border-border">
                <td className="p-3 font-bold">{y.name}</td>
                <td className="p-3 font-mono text-xs">{y.start_date}</td>
                <td className="p-3 font-mono text-xs">{y.end_date}</td>
                <td className="p-3">{y.is_current ? <span className="text-xs bg-gold/20 text-gold-foreground px-2 py-1 rounded">حالية</span> : "—"}</td>
                <td className="p-3 text-xs">{y.status}</td>
                <td className="p-3 text-left whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(y); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setDelId(y.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <YearDialog open={open} onOpenChange={setOpen} editing={editing} onDone={refresh} />
      <AlertDialog open={!!delId} onOpenChange={(o) => !o && setDelId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader><AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف السنة وما يرتبط بها من فصول.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function YearDialog({ open, onOpenChange, editing, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Year | null; onDone: () => void }) {
  const upsertFn = useServerFn(upsertAcademicYear);
  const [name, setName] = useState(editing?.name ?? "");
  const [start, setStart] = useState(editing?.start_date ?? "");
  const [end, setEnd] = useState(editing?.end_date ?? "");
  const [isCurrent, setIsCurrent] = useState(editing?.is_current ?? false);
  const [status, setStatus] = useState(editing?.status ?? "active");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setStart(editing?.start_date ?? "");
      setEnd(editing?.end_date ?? "");
      setIsCurrent(editing?.is_current ?? false);
      setStatus(editing?.status ?? "active");
    }
  }, [open, editing]);

  const save = async () => {
    if (!name || !start || !end) { toast.error("الحقول مطلوبة"); return; }
    setSaving(true);
    try {
      await upsertFn({
        data: {
          id: editing?.id,
          name,
          start_date: start,
          end_date: end,
          is_current: isCurrent,
          status: status as "active" | "archived",
        },
      });
      toast.success(editing ? "تم التحديث" : "تمت الإضافة");
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>{editing ? "تعديل" : "إضافة"} سنة أكاديمية</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2025-2026" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>تاريخ البداية</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label>تاريخ النهاية</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div className="flex items-center justify-between"><Label>السنة الحالية</Label><Switch checked={isCurrent} onCheckedChange={setIsCurrent} /></div>
          <div><Label>الحالة</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشطة</SelectItem>
                <SelectItem value="archived">مؤرشفة</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Semesters ---------------- */
function SemestersTab() {
  const qc = useQueryClient();
  const yearsFn = useServerFn(listAcademicYears);
  const listFn = useServerFn(listSemesters);
  const deleteFn = useServerFn(deleteSemester);

  const { data: years = [] } = useQuery({
    queryKey: ["academic_years"],
    queryFn: () => yearsFn({ data: {} }),
  });
  const { data = [], isLoading } = useQuery({
    queryKey: ["semesters"],
    queryFn: () => listFn({ data: {} }),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Semester | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["semesters"] });

  const onDelete = async () => {
    if (!delId) return;
    try {
      await deleteFn({ data: { id: delId } });
      toast.success("تم الحذف");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحذف");
    }
    setDelId(null);
  };

  const yearName = (id: string) => (years as Year[]).find((y) => y.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }} disabled={years.length === 0}>
          <Plus className="h-4 w-4 ml-1" /> إضافة فصل
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-right p-3">الاسم</th>
              <th className="text-right p-3">الرمز</th>
              <th className="text-right p-3">السنة</th>
              <th className="text-right p-3">من</th>
              <th className="text-right p-3">إلى</th>
              <th className="text-right p-3">الحالي</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="p-6 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></td></tr>}
            {!isLoading && data.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">لا توجد بيانات</td></tr>}
            {(data as Semester[]).map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="p-3 font-bold">{s.name}</td>
                <td className="p-3 font-mono text-xs">{s.code}</td>
                <td className="p-3 text-xs">{yearName(s.academic_year_id)}</td>
                <td className="p-3 font-mono text-xs">{s.start_date}</td>
                <td className="p-3 font-mono text-xs">{s.end_date}</td>
                <td className="p-3">{s.is_current ? <span className="text-xs bg-gold/20 text-gold-foreground px-2 py-1 rounded">حالي</span> : "—"}</td>
                <td className="p-3 text-left whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setDelId(s.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SemesterDialog open={open} onOpenChange={setOpen} editing={editing} years={years as Year[]} onDone={refresh} />
      <AlertDialog open={!!delId} onOpenChange={(o) => !o && setDelId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader><AlertDialogTitle>تأكيد الحذف</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SemesterDialog({ open, onOpenChange, editing, years, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Semester | null; years: Year[]; onDone: () => void }) {
  const upsertFn = useServerFn(upsertSemester);
  const [yearId, setYearId] = useState(editing?.academic_year_id ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? "first");
  const [start, setStart] = useState(editing?.start_date ?? "");
  const [end, setEnd] = useState(editing?.end_date ?? "");
  const [isCurrent, setIsCurrent] = useState(editing?.is_current ?? false);
  const [status, setStatus] = useState(editing?.status ?? "active");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setYearId(editing?.academic_year_id ?? (years[0]?.id ?? ""));
      setName(editing?.name ?? "");
      setCode(editing?.code ?? "first");
      setStart(editing?.start_date ?? "");
      setEnd(editing?.end_date ?? "");
      setIsCurrent(editing?.is_current ?? false);
      setStatus(editing?.status ?? "active");
    }
  }, [open, editing, years]);

  const save = async () => {
    if (!yearId || !name || !code || !start || !end) { toast.error("الحقول مطلوبة"); return; }
    setSaving(true);
    try {
      await upsertFn({
        data: {
          id: editing?.id,
          academic_year_id: yearId,
          name,
          code: code as "first" | "second",
          start_date: start,
          end_date: end,
          is_current: isCurrent,
          status: status as "active" | "archived",
        },
      });
      toast.success(editing ? "تم التحديث" : "تمت الإضافة");
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>{editing ? "تعديل" : "إضافة"} فصل دراسي</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>السنة الأكاديمية</Label>
            <Select value={yearId} onValueChange={setYearId}>
              <SelectTrigger><SelectValue placeholder="اختر السنة" /></SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="الفصل الأول" /></div>
          <div><Label>الرمز</Label>
            <Select value={code} onValueChange={setCode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="first">first - الأول</SelectItem>
                <SelectItem value="second">second - الثاني</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>من</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label>إلى</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div className="flex items-center justify-between"><Label>الفصل الحالي</Label><Switch checked={isCurrent} onCheckedChange={setIsCurrent} /></div>
          <div><Label>الحالة</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="archived">مؤرشف</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Levels ---------------- */
function LevelsTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAcademicLevels);
  const deleteFn = useServerFn(deleteAcademicLevel);

  const { data = [], isLoading } = useQuery({
    queryKey: ["academic_levels"],
    queryFn: () => listFn({ data: {} }),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Level | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["academic_levels"] });

  const onDelete = async () => {
    if (!delId) return;
    try {
      await deleteFn({ data: { id: delId } });
      toast.success("تم الحذف");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحذف");
    }
    setDelId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 ml-1" /> إضافة مستوى
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="text-right p-3">رقم المستوى</th>
              <th className="text-right p-3">الاسم</th>
              <th className="text-right p-3">الحالة</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} className="p-6 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></td></tr>}
            {!isLoading && data.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">لا توجد بيانات</td></tr>}
            {(data as Level[]).map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="p-3 font-bold">{l.level_number}</td>
                <td className="p-3">{l.name}</td>
                <td className="p-3 text-xs">{l.status}</td>
                <td className="p-3 text-left whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(l); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setDelId(l.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LevelDialog open={open} onOpenChange={setOpen} editing={editing} onDone={refresh} />
      <AlertDialog open={!!delId} onOpenChange={(o) => !o && setDelId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader><AlertDialogTitle>تأكيد الحذف</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LevelDialog({ open, onOpenChange, editing, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Level | null; onDone: () => void }) {
  const upsertFn = useServerFn(upsertAcademicLevel);
  const [name, setName] = useState(editing?.name ?? "");
  const [num, setNum] = useState<number | "">(editing?.level_number ?? "");
  const [status, setStatus] = useState(editing?.status ?? "active");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setNum(editing?.level_number ?? "");
      setStatus(editing?.status ?? "active");
    }
  }, [open, editing]);

  const save = async () => {
    if (!name || num === "" || Number(num) < 1) { toast.error("الحقول مطلوبة"); return; }
    setSaving(true);
    try {
      await upsertFn({
        data: {
          id: editing?.id,
          name,
          level_number: Number(num),
          status: status as "active" | "archived",
        },
      });
      toast.success(editing ? "تم التحديث" : "تمت الإضافة");
      onDone();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>{editing ? "تعديل" : "إضافة"} مستوى</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="المستوى الأول" /></div>
          <div><Label>رقم المستوى</Label><Input type="number" min={1} value={num} onChange={(e) => setNum(e.target.value === "" ? "" : Number(e.target.value))} /></div>
          <div><Label>الحالة</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="archived">مؤرشف</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin ml-1" />}حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
