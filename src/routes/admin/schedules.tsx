import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CalendarClock, Building2, DoorOpen, Clock, CalendarDays, AlertTriangle,
  Plus, Pencil, Loader2, CheckCircle2, LayoutGrid, Printer, FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { exportScheduleXlsx, logScheduleAudit, todayLabel, type ScheduleRow } from "@/lib/schedule-export";
import { PRINT_CSS, PrintHeader, WeeklyGrid, DayList, useSiteIdentity } from "@/components/schedule/ScheduleView";

export const Route = createFileRoute("/admin/schedules")({
  head: () => ({ meta: [{ title: "الجداول الدراسية — لوحة الإدارة" }] }),
  component: SchedulesPage,
});

const DAYS = [
  { code: "saturday", label: "السبت" },
  { code: "sunday", label: "الأحد" },
  { code: "monday", label: "الإثنين" },
  { code: "tuesday", label: "الثلاثاء" },
  { code: "wednesday", label: "الأربعاء" },
  { code: "thursday", label: "الخميس" },
  { code: "friday", label: "الجمعة" },
];
const dayLabel = (c: string) => DAYS.find((d) => d.code === c)?.label ?? c;

const ROOM_TYPES = [
  { code: "lecture", label: "قاعة محاضرات" },
  { code: "lab", label: "مختبر" },
  { code: "office", label: "مكتب" },
  { code: "hall", label: "قاعة كبرى" },
];
const SCHED_TYPES = [
  { code: "lecture", label: "محاضرة" },
  { code: "lab", label: "عملي" },
  { code: "tutorial", label: "تمارين" },
  { code: "exam", label: "امتحان" },
];
const STATUSES = [
  { code: "draft", label: "مسودة" },
  { code: "published", label: "منشور" },
  { code: "cancelled", label: "ملغي" },
];

type Building = { id: string; name_ar: string; name_en: string | null; code: string; is_active: boolean };
type Room = { id: string; building_id: string; name_ar: string; name_en: string | null; code: string; room_type: string; capacity: number; is_active: boolean };
type TimeSlot = { id: string; name_ar: string; day_of_week: string; start_time: string; end_time: string; is_active: boolean };
type Schedule = {
  id: string; course_section_id: string; room_id: string; faculty_profile_id: string | null;
  time_slot_id: string; schedule_type: string; status: string;
};

function SchedulesPage() {
  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
          <CalendarClock className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-xl font-extrabold text-primary">الجداول الدراسية</h1>
          <p className="text-xs text-muted-foreground">إدارة المباني والقاعات والفترات الزمنية والجداول الأسبوعية مع كشف التعارضات.</p>
        </div>
      </div>

      <Tabs defaultValue="views">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 gap-2 h-auto">
          <TabsTrigger value="views"><LayoutGrid className="h-4 w-4 ml-2" />عرض الجداول</TabsTrigger>
          <TabsTrigger value="rooms"><Building2 className="h-4 w-4 ml-2" />المباني والقاعات</TabsTrigger>
          <TabsTrigger value="slots"><Clock className="h-4 w-4 ml-2" />الفترات الزمنية</TabsTrigger>
          <TabsTrigger value="schedule"><CalendarDays className="h-4 w-4 ml-2" />الجدول الدراسي</TabsTrigger>
          <TabsTrigger value="conflicts"><AlertTriangle className="h-4 w-4 ml-2" />التعارضات</TabsTrigger>
        </TabsList>
        <TabsContent value="views" className="mt-5"><TimetableViewsTab /></TabsContent>
        <TabsContent value="rooms" className="mt-5"><BuildingsRoomsTab /></TabsContent>
        <TabsContent value="slots" className="mt-5"><TimeSlotsTab /></TabsContent>
        <TabsContent value="schedule" className="mt-5"><ScheduleTab /></TabsContent>
        <TabsContent value="conflicts" className="mt-5"><ConflictsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ====================== Buildings & Rooms ======================
function BuildingsRoomsTab() {
  const qc = useQueryClient();
  const [bOpen, setBOpen] = useState(false);
  const [bEdit, setBEdit] = useState<Building | null>(null);
  const [rOpen, setROpen] = useState(false);
  const [rEdit, setREdit] = useState<Room | null>(null);

  const buildings = useQuery({
    queryKey: ["adm-buildings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buildings" as any).select("*").order("name_ar");
      if (error) throw error; return (data ?? []) as unknown as Building[];
    },
  });
  const rooms = useQuery({
    queryKey: ["adm-rooms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms" as any).select("*").order("code");
      if (error) throw error; return (data ?? []) as unknown as Room[];
    },
  });

  const toggleBuilding = async (b: Building) => {
    const { error } = await supabase.from("buildings" as any).update({ is_active: !b.is_active }).eq("id", b.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["adm-buildings"] });
  };
  const toggleRoom = async (r: Room) => {
    const { error } = await supabase.from("rooms" as any).update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["adm-rooms"] });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Buildings */}
      <div className="rounded-xl border bg-card">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-bold text-primary flex items-center gap-2"><Building2 className="h-4 w-4" /> المباني</div>
          <Button size="sm" onClick={() => { setBEdit(null); setBOpen(true); }}>
            <Plus className="h-4 w-4 ml-1" /> مبنى جديد
          </Button>
        </div>
        <div className="divide-y">
          {buildings.isLoading ? (
            <div className="p-6 text-center"><Loader2 className="inline h-5 w-5 animate-spin text-primary" /></div>
          ) : (buildings.data ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">لا توجد مبانٍ بعد.</div>
          ) : (
            (buildings.data ?? []).map((b) => (
              <div key={b.id} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{b.name_ar}</div>
                  <div className="text-xs text-muted-foreground">{b.code}{b.name_en && <> • {b.name_en}</>}</div>
                </div>
                <Switch checked={b.is_active} onCheckedChange={() => toggleBuilding(b)} />
                <Button size="icon" variant="ghost" onClick={() => { setBEdit(b); setBOpen(true); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Rooms */}
      <div className="rounded-xl border bg-card">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-bold text-primary flex items-center gap-2"><DoorOpen className="h-4 w-4" /> القاعات</div>
          <Button size="sm" onClick={() => { setREdit(null); setROpen(true); }} disabled={!(buildings.data ?? []).length}>
            <Plus className="h-4 w-4 ml-1" /> قاعة جديدة
          </Button>
        </div>
        <div className="divide-y">
          {rooms.isLoading ? (
            <div className="p-6 text-center"><Loader2 className="inline h-5 w-5 animate-spin text-primary" /></div>
          ) : (rooms.data ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">لا توجد قاعات بعد.</div>
          ) : (
            (rooms.data ?? []).map((r) => {
              const b = (buildings.data ?? []).find((x) => x.id === r.building_id);
              return (
                <div key={r.id} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{r.name_ar} <span className="text-xs text-muted-foreground">({r.code})</span></div>
                    <div className="text-xs text-muted-foreground">
                      {b?.name_ar ?? "—"} • {ROOM_TYPES.find((t) => t.code === r.room_type)?.label ?? r.room_type} • سعة {r.capacity}
                    </div>
                  </div>
                  <Switch checked={r.is_active} onCheckedChange={() => toggleRoom(r)} />
                  <Button size="icon" variant="ghost" onClick={() => { setREdit(r); setROpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <BuildingDialog open={bOpen} onOpenChange={setBOpen} editing={bEdit}
        onSaved={() => qc.invalidateQueries({ queryKey: ["adm-buildings"] })} />
      <RoomDialog open={rOpen} onOpenChange={setROpen} editing={rEdit} buildings={buildings.data ?? []}
        onSaved={() => qc.invalidateQueries({ queryKey: ["adm-rooms"] })} />
    </div>
  );
}

function BuildingDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Building | null; onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Building>>({});
  const [saving, setSaving] = useState(false);
  useMemo(() => { if (open) setForm(editing ?? { is_active: true }); }, [open, editing]);

  const save = async () => {
    if (!form.name_ar || !form.code) return toast.error("الاسم والرمز مطلوبان");
    setSaving(true);
    const payload = { name_ar: form.name_ar, name_en: form.name_en ?? null, code: form.code, is_active: form.is_active ?? true };
    const { error } = editing
      ? await supabase.from("buildings" as any).update(payload).eq("id", editing.id)
      : await supabase.from("buildings" as any).insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    if (!editing) {
      // best-effort audit
      try {
        await supabase.rpc("log_audit" as any, {
          _entity_type: "schedule", _entity_id: "00000000-0000-0000-0000-000000000000",
          _action_type: "building_created", _old: null, _new: payload, _notes: null,
        });
      } catch {/* ignore */}
    }
    toast.success(editing ? "تم التحديث" : "تم إنشاء المبنى");
    onOpenChange(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>{editing ? "تعديل المبنى" : "مبنى جديد"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>الاسم (عربي) *</Label><Input value={form.name_ar ?? ""} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></div>
          <div><Label>الاسم (إنجليزي)</Label><Input value={form.name_en ?? ""} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
          <div><Label>الرمز *</Label><Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="MAIN" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoomDialog({ open, onOpenChange, editing, buildings, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Room | null; buildings: Building[]; onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Room>>({});
  const [saving, setSaving] = useState(false);
  useMemo(() => { if (open) setForm(editing ?? { is_active: true, room_type: "lecture", capacity: 30 }); }, [open, editing]);

  const save = async () => {
    if (!form.name_ar || !form.code || !form.building_id) return toast.error("الاسم والرمز والمبنى مطلوبة");
    setSaving(true);
    const payload = {
      name_ar: form.name_ar, name_en: form.name_en ?? null, code: form.code,
      building_id: form.building_id, room_type: form.room_type ?? "lecture",
      capacity: form.capacity ?? 30, is_active: form.is_active ?? true,
    };
    const { error } = editing
      ? await supabase.from("rooms" as any).update(payload).eq("id", editing.id)
      : await supabase.from("rooms" as any).insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    if (!editing) {
      try {
        await supabase.rpc("log_audit" as any, {
          _entity_type: "schedule", _entity_id: "00000000-0000-0000-0000-000000000000",
          _action_type: "room_created", _old: null, _new: payload, _notes: null,
        });
      } catch {/* ignore */}
    }
    toast.success(editing ? "تم التحديث" : "تم إنشاء القاعة");
    onOpenChange(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>{editing ? "تعديل القاعة" : "قاعة جديدة"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>المبنى *</Label>
            <Select value={form.building_id ?? ""} onValueChange={(v) => setForm({ ...form, building_id: v })}>
              <SelectTrigger><SelectValue placeholder="اختر المبنى" /></SelectTrigger>
              <SelectContent>{buildings.map((b) => <SelectItem key={b.id} value={b.id}>{b.name_ar}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>الاسم (عربي) *</Label><Input value={form.name_ar ?? ""} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} /></div>
          <div><Label>الاسم (إنجليزي)</Label><Input value={form.name_en ?? ""} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
          <div><Label>الرمز *</Label><Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ROOM-101" /></div>
          <div><Label>السعة</Label><Input type="number" min={0} value={form.capacity ?? 30} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} /></div>
          <div className="col-span-2"><Label>النوع *</Label>
            <Select value={form.room_type ?? "lecture"} onValueChange={(v) => setForm({ ...form, room_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ROOM_TYPES.map((t) => <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>)}</SelectContent>
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

// ====================== Time Slots ======================
function TimeSlotsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<TimeSlot | null>(null);

  const slots = useQuery({
    queryKey: ["adm-time-slots"],
    queryFn: async () => {
      const { data, error } = await supabase.from("time_slots" as any).select("*").order("day_of_week").order("start_time");
      if (error) throw error; return (data ?? []) as unknown as TimeSlot[];
    },
  });

  const toggle = async (s: TimeSlot) => {
    const { error } = await supabase.from("time_slots" as any).update({ is_active: !s.is_active }).eq("id", s.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["adm-time-slots"] });
  };

  const grouped = useMemo(() => {
    const m = new Map<string, TimeSlot[]>();
    for (const d of DAYS) m.set(d.code, []);
    for (const s of slots.data ?? []) m.get(s.day_of_week)?.push(s);
    return m;
  }, [slots.data]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEdit(null); setOpen(true); }}><Plus className="h-4 w-4 ml-1" /> فترة جديدة</Button>
      </div>
      {slots.isLoading ? (
        <div className="grid place-items-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {DAYS.map((d) => {
            const items = grouped.get(d.code) ?? [];
            return (
              <div key={d.code} className="rounded-lg border bg-card overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 text-sm font-bold text-primary border-b">{d.label}</div>
                {items.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground">لا توجد فترات.</div>
                ) : (
                  <div className="divide-y">
                    {items.map((s) => (
                      <div key={s.id} className="p-2 flex items-center gap-2 text-sm">
                        <div className="font-mono text-xs bg-muted px-2 py-1 rounded">{s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}</div>
                        <div className="flex-1 min-w-0 truncate">{s.name_ar}</div>
                        <Switch checked={s.is_active} onCheckedChange={() => toggle(s)} />
                        <Button size="icon" variant="ghost" onClick={() => { setEdit(s); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <TimeSlotDialog open={open} onOpenChange={setOpen} editing={edit}
        onSaved={() => qc.invalidateQueries({ queryKey: ["adm-time-slots"] })} />
    </div>
  );
}

function TimeSlotDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: TimeSlot | null; onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<TimeSlot>>({});
  const [saving, setSaving] = useState(false);
  useMemo(() => {
    if (open) setForm(editing ?? { is_active: true, day_of_week: "saturday", start_time: "08:00", end_time: "10:00", name_ar: "" });
  }, [open, editing]);

  const save = async () => {
    if (!form.name_ar || !form.day_of_week || !form.start_time || !form.end_time) return toast.error("جميع الحقول مطلوبة");
    if ((form.start_time ?? "") >= (form.end_time ?? "")) return toast.error("وقت النهاية يجب أن يكون بعد البداية");
    setSaving(true);
    const payload = {
      name_ar: form.name_ar, day_of_week: form.day_of_week,
      start_time: form.start_time, end_time: form.end_time, is_active: form.is_active ?? true,
    };
    const { error } = editing
      ? await supabase.from("time_slots" as any).update(payload).eq("id", editing.id)
      : await supabase.from("time_slots" as any).insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    if (!editing) {
      try {
        await supabase.rpc("log_audit" as any, {
          _entity_type: "schedule", _entity_id: "00000000-0000-0000-0000-000000000000",
          _action_type: "time_slot_created", _old: null, _new: payload, _notes: null,
        });
      } catch {/* ignore */}
    }
    toast.success(editing ? "تم التحديث" : "تمت إضافة الفترة");
    onOpenChange(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>{editing ? "تعديل الفترة الزمنية" : "فترة زمنية جديدة"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>الاسم *</Label>
            <Input value={form.name_ar ?? ""} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} placeholder="السبت 08:00 - 10:00" />
          </div>
          <div><Label>اليوم *</Label>
            <Select value={form.day_of_week ?? ""} onValueChange={(v) => setForm({ ...form, day_of_week: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DAYS.map((d) => <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div /> {/* spacer */}
          <div><Label>وقت البداية *</Label>
            <Input type="time" value={(form.start_time ?? "").slice(0, 5)} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </div>
          <div><Label>وقت النهاية *</Label>
            <Input type="time" value={(form.end_time ?? "").slice(0, 5)} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
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

// ====================== Class Schedule ======================
type Year = { id: string; name: string; is_current: boolean };
type Semester = { id: string; academic_year_id: string; name: string; is_current: boolean };
type Program = { id: string; name_ar: string; department_id: string | null };
type Offering = { id: string; course_id: string; program_id: string; academic_year_id: string; semester_id: string; level_id: string };
type Course = { id: string; code: string; name_ar: string };
type Section = { id: string; course_offering_id: string; section_code: string; faculty_profile_id: string | null };
type Faculty = { id: string; full_name_ar: string };

function ScheduleTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Schedule | null>(null);

  const lookups = useScheduleLookups();
  const schedules = useQuery({
    queryKey: ["adm-class-schedule"],
    queryFn: async () => {
      const { data, error } = await supabase.from("class_schedule").select("*");
      if (error) throw error; return (data ?? []) as unknown as Schedule[];
    },
  });

  const sectionLabel = (id: string) => {
    const s = lookups.sections.find((x) => x.id === id); if (!s) return "—";
    const o = lookups.offerings.find((x) => x.id === s.course_offering_id);
    const c = lookups.courses.find((x) => x.id === o?.course_id);
    return `${c?.code ?? ""} — شعبة ${s.section_code}`;
  };
  const slotLabel = (id: string) => {
    const s = lookups.slots.find((x) => x.id === id); if (!s) return "—";
    return `${dayLabel(s.day_of_week)} ${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)}`;
  };
  const roomLabel = (id: string) => {
    const r = lookups.rooms.find((x) => x.id === id); return r?.name_ar ?? r?.code ?? "—";
  };
  const facultyLabel = (id: string | null) => {
    if (!id) return "—";
    return lookups.faculty.find((f) => f.id === id)?.full_name_ar ?? "—";
  };

  const setStatus = async (s: Schedule, status: string) => {
    const { error } = await supabase.from("class_schedule").update({ status: status as "draft" | "published" | "cancelled" }).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("تم تحديث الحالة");
    qc.invalidateQueries({ queryKey: ["adm-class-schedule"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEdit(null); setOpen(true); }} disabled={!lookups.ready}>
          <Plus className="h-4 w-4 ml-1" /> جدولة شعبة
        </Button>
      </div>
      {schedules.isLoading ? (
        <div className="grid place-items-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (schedules.data ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد جداول بعد.</div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs">
                <tr>
                  <th className="px-3 py-2 text-right">الشعبة</th>
                  <th className="px-3 py-2 text-right">الفترة</th>
                  <th className="px-3 py-2 text-right">القاعة</th>
                  <th className="px-3 py-2 text-right">المُدرّس</th>
                  <th className="px-3 py-2 text-right">النوع</th>
                  <th className="px-3 py-2 text-right">الحالة</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(schedules.data ?? []).map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-2 font-bold">{sectionLabel(s.course_section_id)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{slotLabel(s.time_slot_id)}</td>
                    <td className="px-3 py-2">{roomLabel(s.room_id)}</td>
                    <td className="px-3 py-2">{facultyLabel(s.faculty_profile_id)}</td>
                    <td className="px-3 py-2"><Badge variant="outline">{SCHED_TYPES.find((t) => t.code === s.schedule_type)?.label ?? s.schedule_type}</Badge></td>
                    <td className="px-3 py-2">
                      <Badge variant={s.status === "published" ? "default" : s.status === "cancelled" ? "destructive" : "secondary"}>
                        {STATUSES.find((x) => x.code === s.status)?.label ?? s.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-left">
                      <div className="flex items-center gap-1 justify-end">
                        {s.status !== "published" && (
                          <Button size="sm" variant="ghost" onClick={() => setStatus(s, "published")}>نشر</Button>
                        )}
                        {s.status !== "cancelled" && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setStatus(s, "cancelled")}>إلغاء</Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => { setEdit(s); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <ScheduleDialog open={open} onOpenChange={setOpen} editing={edit} lookups={lookups}
        onSaved={() => qc.invalidateQueries({ queryKey: ["adm-class-schedule"] })} />
    </div>
  );
}

function useScheduleLookups() {
  const years = useQuery({ queryKey: ["lk-years"], queryFn: async () => {
    const { data, error } = await supabase.from("academic_years").select("id, name, is_current").order("start_date", { ascending: false });
    if (error) throw error; return (data ?? []) as Year[];
  }});
  const semesters = useQuery({ queryKey: ["lk-sems"], queryFn: async () => {
    const { data, error } = await supabase.from("semesters").select("id, academic_year_id, name, is_current");
    if (error) throw error; return (data ?? []) as Semester[];
  }});
  const programs = useQuery({ queryKey: ["lk-programs"], queryFn: async () => {
    const { data, error } = await supabase.from("programs").select("id, name_ar, department_id").eq("is_active", true);
    if (error) throw error; return (data ?? []) as Program[];
  }});
  const offerings = useQuery({ queryKey: ["lk-offerings"], queryFn: async () => {
    const { data, error } = await supabase.from("course_offerings").select("id, course_id, program_id, academic_year_id, semester_id, level_id");
    if (error) throw error; return (data ?? []) as Offering[];
  }});
  const courses = useQuery({ queryKey: ["lk-courses"], queryFn: async () => {
    const { data, error } = await supabase.from("courses").select("id, code, name_ar");
    if (error) throw error; return (data ?? []) as Course[];
  }});
  const sections = useQuery({ queryKey: ["lk-sections"], queryFn: async () => {
    const { data, error } = await supabase.from("course_sections").select("id, course_offering_id, section_code, faculty_profile_id");
    if (error) throw error; return (data ?? []) as Section[];
  }});
  const faculty = useQuery({ queryKey: ["lk-faculty"], queryFn: async () => {
    const { data, error } = await supabase.from("faculty_profiles").select("id, full_name_ar");
    if (error) throw error; return (data ?? []) as Faculty[];
  }});
  const rooms = useQuery({ queryKey: ["lk-rooms-active"], queryFn: async () => {
    const { data, error } = await supabase.from("rooms" as any).select("*").eq("is_active", true);
    if (error) throw error; return (data ?? []) as unknown as Room[];
  }});
  const slots = useQuery({ queryKey: ["lk-slots-active"], queryFn: async () => {
    const { data, error } = await supabase.from("time_slots" as any).select("*").eq("is_active", true);
    if (error) throw error; return (data ?? []) as unknown as TimeSlot[];
  }});
  return {
    years: years.data ?? [], semesters: semesters.data ?? [], programs: programs.data ?? [],
    offerings: offerings.data ?? [], courses: courses.data ?? [], sections: sections.data ?? [],
    faculty: faculty.data ?? [], rooms: rooms.data ?? [], slots: slots.data ?? [],
    ready: !years.isLoading && !semesters.isLoading && !rooms.isLoading && !slots.isLoading,
  };
}

function ScheduleDialog({ open, onOpenChange, editing, lookups, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Schedule | null;
  lookups: ReturnType<typeof useScheduleLookups>; onSaved: () => void;
}) {
  const [yearId, setYearId] = useState<string>("");
  const [semId, setSemId] = useState<string>("");
  const [programId, setProgramId] = useState<string>("");
  const [offeringId, setOfferingId] = useState<string>("");
  const [form, setForm] = useState<Partial<Schedule>>({});
  const [saving, setSaving] = useState(false);

  useMemo(() => {
    if (!open) return;
    if (editing) {
      const sec = lookups.sections.find((s) => s.id === editing.course_section_id);
      const off = lookups.offerings.find((o) => o.id === sec?.course_offering_id);
      setYearId(off?.academic_year_id ?? ""); setSemId(off?.semester_id ?? "");
      setProgramId(off?.program_id ?? ""); setOfferingId(off?.id ?? "");
      setForm(editing);
    } else {
      const cy = lookups.years.find((y) => y.is_current);
      const cs = lookups.semesters.find((s) => s.is_current && s.academic_year_id === cy?.id);
      setYearId(cy?.id ?? ""); setSemId(cs?.id ?? ""); setProgramId(""); setOfferingId("");
      setForm({ schedule_type: "lecture", status: "draft" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const filteredSems = lookups.semesters.filter((s) => s.academic_year_id === yearId);
  const filteredOfferings = lookups.offerings.filter((o) => o.academic_year_id === yearId && o.semester_id === semId && (!programId || o.program_id === programId));
  const sectionsForOffering = lookups.sections.filter((s) => s.course_offering_id === offeringId);

  const onSectionPick = (sectionId: string) => {
    const sec = lookups.sections.find((s) => s.id === sectionId);
    setForm({
      ...form,
      course_section_id: sectionId,
      faculty_profile_id: form.faculty_profile_id ?? sec?.faculty_profile_id ?? null,
    });
  };

  const save = async () => {
    if (!form.course_section_id || !form.room_id || !form.time_slot_id) {
      return toast.error("الشعبة والقاعة والفترة الزمنية مطلوبة");
    }
    setSaving(true);
    const payload = {
      course_section_id: form.course_section_id,
      room_id: form.room_id,
      faculty_profile_id: form.faculty_profile_id ?? null,
      time_slot_id: form.time_slot_id,
      schedule_type: (form.schedule_type ?? "lecture") as "lecture" | "lab" | "tutorial" | "exam",
      status: (form.status ?? "draft") as "draft" | "published" | "cancelled",
    };
    const { error } = editing
      ? await supabase.from("class_schedule").update(payload).eq("id", editing.id)
      : await supabase.from("class_schedule").insert(payload);
    setSaving(false);
    if (error) {
      // Log conflict block attempt (audit)
      if (/تعارض/.test(error.message)) {
        try {
          await supabase.rpc("log_audit" as any, {
            _entity_type: "schedule",
            _entity_id: "00000000-0000-0000-0000-000000000000",
            _action_type: "schedule_conflict_blocked",
            _old: null, _new: payload, _notes: error.message,
          });
        } catch {/* ignore */}
      }
      return toast.error(error.message);
    }
    toast.success(editing ? "تم التحديث" : "تم إنشاء الجدول");
    onOpenChange(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader><DialogTitle>{editing ? "تعديل جدول" : "جدولة شعبة"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>السنة الأكاديمية</Label>
            <Select value={yearId} onValueChange={(v) => { setYearId(v); setSemId(""); setOfferingId(""); }}>
              <SelectTrigger><SelectValue placeholder="اختر السنة" /></SelectTrigger>
              <SelectContent>{lookups.years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}{y.is_current && " ★"}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>الفصل</Label>
            <Select value={semId} onValueChange={(v) => { setSemId(v); setOfferingId(""); }} disabled={!yearId}>
              <SelectTrigger><SelectValue placeholder="اختر الفصل" /></SelectTrigger>
              <SelectContent>{filteredSems.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.is_current && " ★"}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>البرنامج</Label>
            <Select value={programId || "__all"} onValueChange={(v) => { setProgramId(v === "__all" ? "" : v); setOfferingId(""); }}>
              <SelectTrigger><SelectValue placeholder="اختر البرنامج" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">جميع البرامج</SelectItem>
                {lookups.programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>المقرر (الطرح)</Label>
            <Select value={offeringId} onValueChange={(v) => { setOfferingId(v); setForm({ ...form, course_section_id: undefined }); }} disabled={!semId}>
              <SelectTrigger><SelectValue placeholder="اختر المقرر" /></SelectTrigger>
              <SelectContent>
                {filteredOfferings.map((o) => {
                  const c = lookups.courses.find((x) => x.id === o.course_id);
                  return <SelectItem key={o.id} value={o.id}>{c?.code} — {c?.name_ar}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
          <div><Label>الشعبة *</Label>
            <Select value={form.course_section_id ?? ""} onValueChange={onSectionPick} disabled={!offeringId}>
              <SelectTrigger><SelectValue placeholder="اختر الشعبة" /></SelectTrigger>
              <SelectContent>{sectionsForOffering.map((s) => <SelectItem key={s.id} value={s.id}>شعبة {s.section_code}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>عضو هيئة التدريس</Label>
            <Select value={form.faculty_profile_id ?? "__none"} onValueChange={(v) => setForm({ ...form, faculty_profile_id: v === "__none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="بدون" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— بدون —</SelectItem>
                {lookups.faculty.map((f) => <SelectItem key={f.id} value={f.id}>{f.full_name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>القاعة *</Label>
            <Select value={form.room_id ?? ""} onValueChange={(v) => setForm({ ...form, room_id: v })}>
              <SelectTrigger><SelectValue placeholder="اختر القاعة" /></SelectTrigger>
              <SelectContent>{lookups.rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name_ar} ({r.code})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>الفترة الزمنية *</Label>
            <Select value={form.time_slot_id ?? ""} onValueChange={(v) => setForm({ ...form, time_slot_id: v })}>
              <SelectTrigger><SelectValue placeholder="اختر الفترة" /></SelectTrigger>
              <SelectContent>
                {lookups.slots.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{dayLabel(s.day_of_week)} {s.start_time.slice(0, 5)}-{s.end_time.slice(0, 5)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label>النوع</Label>
            <Select value={form.schedule_type ?? "lecture"} onValueChange={(v) => setForm({ ...form, schedule_type: v as Schedule["schedule_type"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SCHED_TYPES.map((t) => <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>الحالة</Label>
            <Select value={form.status ?? "draft"} onValueChange={(v) => setForm({ ...form, status: v as Schedule["status"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent>
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

// ====================== Conflicts ======================
function ConflictsTab() {
  const schedules = useQuery({
    queryKey: ["adm-class-schedule"],
    queryFn: async () => {
      const { data, error } = await supabase.from("class_schedule").select("*");
      if (error) throw error; return (data ?? []) as unknown as Schedule[];
    },
  });

  const conflicts = useMemo(() => {
    const items = (schedules.data ?? []).filter((s) => s.status !== "cancelled");
    const room: Schedule[][] = []; const fac: Schedule[][] = []; const sec: Schedule[][] = [];
    const groupBy = (keyFn: (s: Schedule) => string | null, out: Schedule[][]) => {
      const m = new Map<string, Schedule[]>();
      for (const s of items) {
        const k = keyFn(s); if (!k) continue;
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(s);
      }
      for (const arr of m.values()) if (arr.length > 1) out.push(arr);
    };
    groupBy((s) => `${s.room_id}|${s.time_slot_id}`, room);
    groupBy((s) => s.faculty_profile_id ? `${s.faculty_profile_id}|${s.time_slot_id}` : null, fac);
    groupBy((s) => `${s.course_section_id}|${s.time_slot_id}`, sec);
    return { room, fac, sec };
  }, [schedules.data]);

  const total = conflicts.room.length + conflicts.fac.length + conflicts.sec.length;

  return (
    <div className="space-y-4">
      {schedules.isLoading ? (
        <div className="grid place-items-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : total === 0 ? (
        <div className="rounded-lg border bg-emerald-50 border-emerald-200 p-6 flex items-center gap-3">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          <div>
            <div className="font-bold text-emerald-900">لا توجد تعارضات حالية</div>
            <div className="text-xs text-emerald-700">حماية قاعدة البيانات نشطة (تعارض القاعة/الأستاذ/الشعبة).</div>
          </div>
        </div>
      ) : (
        <>
          <ConflictGroup title="تعارضات القاعات" groups={conflicts.room} />
          <ConflictGroup title="تعارضات أعضاء هيئة التدريس" groups={conflicts.fac} />
          <ConflictGroup title="تعارضات الشعب" groups={conflicts.sec} />
        </>
      )}
    </div>
  );
}
function ConflictGroup({ title, groups }: { title: string; groups: Schedule[][] }) {
  if (groups.length === 0) return null;
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm font-bold text-amber-900 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" /> {title} <Badge variant="destructive" className="ms-1">{groups.length}</Badge>
      </div>
      <div className="divide-y">
        {groups.map((g, i) => (
          <div key={i} className="p-3 text-xs font-mono">
            {g.map((s) => s.id.slice(0, 8)).join(" • ")}
          </div>
        ))}
      </div>
    </div>
  );
}

// ====================== Timetable Views (read-only with filters + print/export) ======================
type ViewType = "program" | "level" | "department" | "room" | "faculty";
const VIEW_OPTIONS: Array<{ code: ViewType; label: string }> = [
  { code: "program", label: "حسب البرنامج" },
  { code: "level", label: "حسب المستوى" },
  { code: "department", label: "حسب القسم" },
  { code: "room", label: "حسب القاعة" },
  { code: "faculty", label: "حسب عضو هيئة التدريس" },
];

function TimetableViewsTab() {
  const lookups = useScheduleLookups();
  const [viewType, setViewType] = useState<ViewType>("program");
  const [yearId, setYearId] = useState<string>("");
  const [semId, setSemId] = useState<string>("");
  const [programId, setProgramId] = useState<string>("");
  const [levelId, setLevelId] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [roomId, setRoomId] = useState<string>("");
  const [facultyId, setFacultyId] = useState<string>("");
  const [status, setStatus] = useState<string>("published");

  // Defaults to current year/semester
  useMemo(() => {
    if (yearId || !lookups.years.length) return;
    const cy = lookups.years.find((y) => y.is_current) ?? lookups.years[0];
    if (cy) setYearId(cy.id);
    const cs = lookups.semesters.find((s) => s.is_current && s.academic_year_id === cy?.id);
    if (cs) setSemId(cs.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookups.years.length, lookups.semesters.length]);

  // Levels & departments
  const levels = useQuery({
    queryKey: ["lk-levels"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academic_levels").select("id, name, level_number").order("level_number");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; level_number: number }>;
    },
  });
  const departments = useQuery({
    queryKey: ["lk-departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name_ar").eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name_ar: string }>;
    },
  });

  // Fetch enriched schedules (filtered)
  const schedules = useQuery({
    queryKey: ["adm-tt-views", { yearId, semId, status, viewType }],
    enabled: !!yearId && !!semId,
    queryFn: async () => {
      let q = supabase
        .from("class_schedule")
        .select("id, schedule_type, status, course_section_id, room_id, time_slot_id, faculty_profile_id");
      if (status !== "all") q = q.eq("status", status as "draft" | "published" | "cancelled");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; schedule_type: string; status: string;
        course_section_id: string; room_id: string; time_slot_id: string;
        faculty_profile_id: string | null;
      }>;
    },
  });

  // Build display rows
  const rows: ScheduleRow[] = useMemo(() => {
    if (!schedules.data) return [];
    const out: ScheduleRow[] = [];
    for (const s of schedules.data) {
      const sec = lookups.sections.find((x) => x.id === s.course_section_id); if (!sec) continue;
      const off = lookups.offerings.find((o) => o.id === sec.course_offering_id); if (!off) continue;
      if (off.academic_year_id !== yearId || off.semester_id !== semId) continue;
      if (programId && off.program_id !== programId) continue;
      if (levelId && off.level_id !== levelId) continue;
      if (departmentId) {
        const prog = lookups.programs.find((p) => p.id === off.program_id);
        if (!prog || prog.department_id !== departmentId) continue;
      }
      const course = lookups.courses.find((c) => c.id === off.course_id);
      const slot = lookups.slots.find((t) => t.id === s.time_slot_id); if (!slot) continue;
      const room = lookups.rooms.find((r) => r.id === s.room_id);
      const fac = s.faculty_profile_id ? lookups.faculty.find((f) => f.id === s.faculty_profile_id) : null;
      if (roomId && s.room_id !== roomId) continue;
      if (facultyId && s.faculty_profile_id !== facultyId) continue;
      out.push({
        id: s.id,
        course_code: course?.code ?? "—",
        course_name: course?.name_ar ?? "—",
        section_code: sec.section_code,
        faculty: fac?.full_name_ar ?? null,
        room: room?.name_ar ?? room?.code ?? null,
        schedule_type: s.schedule_type,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
      });
    }
    return out;
  }, [schedules.data, lookups, yearId, semId, programId, roomId, facultyId, levelId, departmentId]);

  const handlePrint = () => {
    logScheduleAudit("timetable_printed", `admin:${viewType}`, { yearId, semId, programId, levelId, departmentId, roomId, facultyId, status });
    window.print();
  };
  const handleExport = () => {
    if (!rows.length) return;
    const yearName = lookups.years.find((y) => y.id === yearId)?.name ?? "current";
    const semName = lookups.semesters.find((s) => s.id === semId)?.name ?? "term";
    const safe = (s: string) => s.replace(/[^\dA-Za-z\u0600-\u06FF]+/g, "_");
    exportScheduleXlsx({
      filename: `admin_schedule_${viewType}_${safe(yearName)}_${safe(semName)}.xlsx`,
      sheetName: "الجدول",
      header: [
        ["جامعة سبأ", "كلية الإدارة والعلوم الإنسانية"],
        ["نوع العرض", VIEW_OPTIONS.find((v) => v.code === viewType)?.label ?? viewType],
        ["السنة الأكاديمية", yearName],
        ["الفصل", semName],
        ["الحالة", status],
        ["تاريخ الإصدار", todayLabel()],
      ],
      rows,
      includeFaculty: true,
    });
    logScheduleAudit("timetable_exported", `admin:${viewType}`, { yearId, semId });
  };

  const filteredSems = lookups.semesters.filter((s) => s.academic_year_id === yearId);

  return (
    <div className="space-y-4 print-page">
      <style>{PRINT_CSS}</style>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 no-print">
        <div>
          <Label className="text-xs">نوع العرض</Label>
          <Select value={viewType} onValueChange={(v) => setViewType(v as ViewType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{VIEW_OPTIONS.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">السنة الأكاديمية</Label>
          <Select value={yearId} onValueChange={(v) => { setYearId(v); setSemId(""); }}>
            <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
            <SelectContent>{lookups.years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}{y.is_current && " ★"}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">الفصل</Label>
          <Select value={semId} onValueChange={setSemId} disabled={!yearId}>
            <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
            <SelectContent>{filteredSems.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">الحالة</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="draft">مسودة</SelectItem>
              <SelectItem value="published">منشور</SelectItem>
              <SelectItem value="cancelled">ملغي</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">البرنامج</Label>
          <Select value={programId || "__all"} onValueChange={(v) => setProgramId(v === "__all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">جميع البرامج</SelectItem>
              {lookups.programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">المستوى</Label>
          <Select value={levelId || "__all"} onValueChange={(v) => setLevelId(v === "__all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">جميع المستويات</SelectItem>
              {(levels.data ?? []).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">القسم</Label>
          <Select value={departmentId || "__all"} onValueChange={(v) => setDepartmentId(v === "__all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">جميع الأقسام</SelectItem>
              {(departments.data ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">القاعة</Label>
          <Select value={roomId || "__all"} onValueChange={(v) => setRoomId(v === "__all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">جميع القاعات</SelectItem>
              {lookups.rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name_ar} ({r.code})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label className="text-xs">عضو هيئة التدريس</Label>
          <Select value={facultyId || "__all"} onValueChange={(v) => setFacultyId(v === "__all" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">الكل</SelectItem>
              {lookups.faculty.map((f) => <SelectItem key={f.id} value={f.id}>{f.full_name_ar}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2 no-print">
        <Button size="sm" variant="outline" onClick={handlePrint} disabled={!rows.length}>
          <Printer className="h-4 w-4 ml-1" /> طباعة
        </Button>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={!rows.length}>
          <FileSpreadsheet className="h-4 w-4 ml-1" /> تصدير Excel
        </Button>
      </div>

      <PrintHeader
        title={`الجدول الدراسي — ${VIEW_OPTIONS.find((v) => v.code === viewType)?.label ?? ""}`}
        lines={[
          ["السنة الأكاديمية", lookups.years.find((y) => y.id === yearId)?.name ?? "—"],
          ["الفصل", lookups.semesters.find((s) => s.id === semId)?.name ?? "—"],
          ["الحالة", status],
          ["تاريخ الإصدار", todayLabel()],
        ]}
      />

      {schedules.isLoading ? (
        <div className="grid place-items-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          لم يتم إنشاء جدول مطابق للفلاتر المحددة.
        </div>
      ) : (
        <>
          <div className="hidden md:block"><WeeklyGrid rows={rows} showFaculty /></div>
          <div className="md:hidden"><DayList rows={rows} showFaculty /></div>
        </>
      )}
    </div>
  );
}
