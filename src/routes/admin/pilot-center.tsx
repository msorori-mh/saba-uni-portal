import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Rocket, Users, Bug, MessageSquare, ClipboardCheck, ListChecks, CheckCircle2,
  XCircle, AlertCircle, Loader2, Plus, FileDown, FileSpreadsheet, Trash2, Pencil, RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getPilotOverview, updatePilotConfig,
  listPilotParticipants, upsertPilotParticipant, deletePilotParticipant,
  listPilotScenarios, setPilotScenarioResult, resetPilotScenarios,
  getPilotChecklist, togglePilotChecklist,
  listPilotIssues, upsertPilotIssue,
  listPilotFeedback, recordPilotFeedback,
  logPilotReportExported,
} from "@/lib/pilot.functions";
import { exportCsv, exportXlsx } from "@/lib/reports/export";

export const Route = createFileRoute("/admin/pilot-center")({
  head: () => ({ meta: [{ title: "إدارة التشغيل التجريبي" }] }),
  component: PilotCenterPage,
});

const STATUS_LABEL: Record<string, string> = {
  planning: "تخطيط", ready: "جاهز", active: "نشط", suspended: "معلّق", completed: "مكتمل",
};
const READINESS_LABEL: Record<string, { label: string; tone: string }> = {
  not_ready: { label: "غير جاهز", tone: "bg-rose-100 text-rose-700 border-rose-200" },
  ready: { label: "جاهز للإطلاق", tone: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  pilot_active: { label: "تشغيل تجريبي نشط", tone: "bg-blue-100 text-blue-700 border-blue-200" },
  pilot_successful: { label: "تشغيل تجريبي ناجح", tone: "bg-amber-100 text-amber-800 border-amber-200" },
};

function PilotCenterPage() {
  const fetchOverview = useServerFn(getPilotOverview);
  const overview = useQuery({ queryKey: ["pilot-overview"], queryFn: () => fetchOverview(), staleTime: 30_000 });

  if (overview.isLoading) {
    return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (overview.error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />{(overview.error as Error).message}
      </div>
    );
  }
  const o = overview.data!;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-primary flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" /> إدارة التشغيل التجريبي
          </h1>
          <p className="text-sm text-muted-foreground">
            حوكمة إطلاق التشغيل التجريبي داخل كلية تكنولوجيا المعلومات — متابعة، اختبار، تتبع، وملاحظات.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={READINESS_LABEL[o.readiness.status].tone} variant="outline">
            {READINESS_LABEL[o.readiness.status].label}
          </Badge>
          <Badge variant="outline">الحالة: {STATUS_LABEL[o.config.status] ?? o.config.status}</Badge>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="نسبة الجاهزية" value={`${o.readiness.score}%`} tone="text-primary" icon={Rocket} />
        <Kpi label="مشاركون نشطون" value={o.participants.active} icon={Users} />
        <Kpi label="مشاكل مفتوحة" value={o.issues.open} tone={o.issues.open ? "text-amber-600" : "text-emerald-600"} icon={Bug} />
        <Kpi label="مشاكل حرجة" value={o.issues.critical} tone={o.issues.critical ? "text-rose-600" : "text-emerald-600"} icon={AlertCircle} />
        <Kpi label="معدل إنجاز الاختبارات" value={`${o.tests.completion_rate}%`} icon={ClipboardCheck} />
        <Kpi label="نجح / فشل" value={`${o.tests.pass} / ${o.tests.fail}`} icon={CheckCircle2} />
        <Kpi label="ملاحظات مسجلة" value={o.feedback} icon={MessageSquare} />
        <Kpi label="القائمة اليومية" value={`${o.checklist.done_today}/${o.checklist.total}`} icon={ListChecks} />
      </section>

      <Tabs defaultValue="participants" dir="rtl">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="participants">المشاركون</TabsTrigger>
          <TabsTrigger value="scenarios">سيناريوهات الاختبار</TabsTrigger>
          <TabsTrigger value="checklist">القائمة اليومية</TabsTrigger>
          <TabsTrigger value="issues">المشاكل</TabsTrigger>
          <TabsTrigger value="feedback">الملاحظات</TabsTrigger>
          <TabsTrigger value="config">إعدادات التجريب</TabsTrigger>
          <TabsTrigger value="reports">التقارير</TabsTrigger>
        </TabsList>

        <TabsContent value="participants" className="mt-4"><ParticipantsTab canManage={o.canManage} /></TabsContent>
        <TabsContent value="scenarios" className="mt-4"><ScenariosTab canManage={o.canManage} /></TabsContent>
        <TabsContent value="checklist" className="mt-4"><ChecklistTab canManage={o.canManage} /></TabsContent>
        <TabsContent value="issues" className="mt-4"><IssuesTab canManage={o.canManage} /></TabsContent>
        <TabsContent value="feedback" className="mt-4"><FeedbackTab canManage={o.canManage} /></TabsContent>
        <TabsContent value="config" className="mt-4"><ConfigTab cfg={o.config} canManage={o.canManage} /></TabsContent>
        <TabsContent value="reports" className="mt-4"><ReportsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value, tone, icon: Icon }: { label: string; value: string | number; tone?: string; icon: typeof Rocket }) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className={`mt-2 font-display text-2xl font-extrabold ${tone ?? "text-primary"}`}>{value}</div>
    </div>
  );
}

/* ============================ PARTICIPANTS ============================ */

const ROLE_LABEL: Record<string, string> = { student: "طالب", faculty: "هيئة تدريس", staff: "موظف", admin: "مسؤول" };
const PSTATUS_LABEL: Record<string, string> = { invited: "مدعو", active: "نشط", inactive: "غير نشط", suspended: "معلّق" };

function ParticipantsTab({ canManage }: { canManage: boolean }) {
  const fetchList = useServerFn(listPilotParticipants);
  const upsert = useServerFn(upsertPilotParticipant);
  const del = useServerFn(deletePilotParticipant);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["pilot-participants"], queryFn: () => fetchList(), staleTime: 30_000 });
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any>(null);

  const mut = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (vars: any) => upsert({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pilot-participants"] });
      qc.invalidateQueries({ queryKey: ["pilot-overview"] });
      setOpen(false); setEditing(null);
    },
  });
  const dmut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pilot-participants"] });
      qc.invalidateQueries({ queryKey: ["pilot-overview"] });
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">
          الحجم الموصى به: 30–60 طالب، 5–10 أعضاء هيئة تدريس، 2–5 موظفين، 2 مسؤولين
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 ml-1" /> إضافة مشارك</Button></DialogTrigger>
            <ParticipantDialog editing={editing} onSubmit={(v) => mut.mutate(v)} pending={mut.isPending} />
          </Dialog>
        )}
      </div>
      {list.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : (
        <div className="rounded-2xl border border-border bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr><th className="p-2 text-right">الاسم</th><th className="p-2 text-right">الدور</th><th className="p-2 text-right">الحالة</th><th className="p-2 text-right">تاريخ الإضافة</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2 font-medium">{p.full_name}</td>
                  <td className="p-2">{ROLE_LABEL[p.role] ?? p.role}</td>
                  <td className="p-2"><Badge variant="outline">{PSTATUS_LABEL[p.status] ?? p.status}</Badge></td>
                  <td className="p-2 text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString("ar-EG-u-nu-latn")}</td>
                  <td className="p-2 text-left">
                    {canManage && (
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => { if (confirm("حذف المشارك؟")) dmut.mutate(p.id); }}><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {(list.data ?? []).length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">لا يوجد مشاركون بعد.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ParticipantDialog({ editing, onSubmit, pending }: { editing: any; onSubmit: (v: any) => void; pending: boolean }) {
  const [name, setName] = useState(editing?.full_name ?? "");
  const [role, setRole] = useState(editing?.role ?? "student");
  const [status, setStatus] = useState(editing?.status ?? "invited");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  useEffect(() => {
    setName(editing?.full_name ?? ""); setRole(editing?.role ?? "student");
    setStatus(editing?.status ?? "invited"); setNotes(editing?.notes ?? "");
  }, [editing]);
  return (
    <DialogContent dir="rtl">
      <DialogHeader><DialogTitle>{editing ? "تعديل المشارك" : "إضافة مشارك"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Input placeholder="الاسم الكامل" value={name} onChange={(e) => setName(e.target.value)} />
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(ROLE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(PSTATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <Textarea placeholder="ملاحظات (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <DialogFooter>
        <Button disabled={!name.trim() || pending} onClick={() => onSubmit({ id: editing?.id, full_name: name.trim(), role, status, notes: notes || null })}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ============================ SCENARIOS ============================ */

const CATEGORY_LABEL: Record<string, string> = {
  academic: "أكاديمي", financial: "مالي", requests: "طلبات", documents: "وثائق", operations: "عمليات",
};

const SCENARIO_STEPS: Record<string, string[]> = {
  ACA_LOGIN: ["افتح /portal-login وسجّل دخول طالب", "افتح /faculty-portal وسجّل دخول عضو هيئة", "تحقق من رسالة الخطأ لحساب معطّل"],
  ACA_PROFILE: ["من بوابة الطالب: افتح الملف الشخصي", "تحقق من صحة البيانات الأساسية"],
  ACA_ENROLL: ["تأكد من وجود مجموعات مفتوحة", "سجّل طالباً في مقرر من /admin/enrollments"],
  ACA_GRADES: ["ادخل درجة من بوابة الأستاذ", "تحقق من ظهورها في بوابة الطالب"],
  ACA_TRANSCRIPT: ["افتح السجل الأكاديمي غير الرسمي", "تحقق من النتائج الرسمية والتقديرات"],
  FIN_FEES: ["افتح المالية في بوابة الطالب", "تحقق من عرض الرسوم"],
  FIN_DISCOUNTS: ["طبّق خصماً من /admin/finance", "تحقق من انعكاسه على الطالب"],
  FIN_RECEIPTS: ["ارفع سند دفع", "راجعه من الإدارة واعتمد الرفض/القبول"],
  REQ_ABSENCE: ["قدّم طلب عذر غياب", "راجعه من الإدارة"],
  REQ_SUSPEND: ["قدّم طلب تأجيل", "تحقق من workflow الموافقة"],
  REQ_TRANSFER: ["قدّم طلب نقل", "تحقق من الحقول الإلزامية"],
  REQ_EQUIV: ["قدّم طلب معادلة", "تحقق من المرفقات"],
  DOC_CERT: ["أصدر شهادة قيد من الإدارة", "تحقق من QR والتحقق"],
  DOC_TRANSCRIPT: ["أصدر سجل أكاديمي رسمي", "تحقق من الرقم التسلسلي"],
  DOC_VERIFY: ["افتح /verify-document", "أدخل رمز تحقق صالح"],
  OPS_AUDIT: ["افتح /admin/audit-log", "تحقق من تسجيل العمليات الأخيرة"],
  OPS_NOTIF: ["أرسل إشعاراً", "تحقق من وصوله للمستهدف"],
  OPS_REPORTS: ["صدّر تقريراً من /admin/reports", "تحقق من تسجيل التصدير"],
};

function ScenariosTab({ canManage }: { canManage: boolean }) {
  const fetchList = useServerFn(listPilotScenarios);
  const setResult = useServerFn(setPilotScenarioResult);
  const resetAll = useServerFn(resetPilotScenarios);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["pilot-scenarios"], queryFn: () => fetchList(), staleTime: 30_000 });
  const mut = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (vars: any) => setResult({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pilot-scenarios"] });
      qc.invalidateQueries({ queryKey: ["pilot-overview"] });
    },
  });
  const resetMut = useMutation({
    mutationFn: () => resetAll(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pilot-scenarios"] });
      qc.invalidateQueries({ queryKey: ["pilot-overview"] });
    },
  });

  if (list.isLoading) return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grouped: Record<string, any[]> = {};
  for (const s of (list.data ?? [])) {
    (grouped[s.category] ||= []).push(s);
  }
  const tested = (list.data ?? []).filter((s) => s.result !== "not_tested").length;
  const passed = (list.data ?? []).filter((s) => s.result === "pass").length;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-bold">قبل الاختبار</div>
          <p className="mt-1 leading-6">
            1) نظّف البيانات التجريبية من{" "}
            <Link to="/admin/operations" search={{ tab: "cleanup" }} className="font-bold underline">مركز العمليات → تنظيف البيانات</Link>
            {" "}· 2) أعد إعداد المجموعات والجداول · 3) نفّذ كل سيناريو وسجّل النتيجة.
          </p>
          <p className="mt-2 text-xs">التقدم: {passed} نجح / {tested} مُختبر من {(list.data ?? []).length} — الهدف ≥ 80%</p>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" disabled={resetMut.isPending} onClick={() => resetMut.mutate()}>
            {resetMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4 ml-1" />}
            إعادة تعيين الكل
          </Button>
        )}
      </div>
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="rounded-2xl border border-border bg-card shadow-card">
          <div className="px-4 py-2 border-b bg-muted/30 font-bold">{CATEGORY_LABEL[cat] ?? cat}</div>
          <div className="divide-y">
            {items.map((s) => (
              <div key={s.id} className="p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{s.name}</div>
                  <div className="text-[11px] text-muted-foreground">{s.code}{s.tested_at ? ` — آخر اختبار ${new Date(s.tested_at).toLocaleDateString("ar-EG-u-nu-latn")}` : ""}</div>
                  {SCENARIO_STEPS[s.code] && (
                    <ol className="mt-2 text-[11px] text-muted-foreground list-decimal list-inside space-y-0.5">
                      {SCENARIO_STEPS[s.code].map((step, i) => <li key={i}>{step}</li>)}
                    </ol>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <ResultBadge r={s.result} />
                  {canManage && (
                    <Select value={s.result} onValueChange={(v) => mut.mutate({ scenario_id: s.id, result: v })}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_tested">لم يُختبر</SelectItem>
                        <SelectItem value="pass">نجح</SelectItem>
                        <SelectItem value="fail">فشل</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
function ResultBadge({ r }: { r: string }) {
  if (r === "pass") return <Badge className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3 ml-1" />نجح</Badge>;
  if (r === "fail") return <Badge variant="destructive"><XCircle className="h-3 w-3 ml-1" />فشل</Badge>;
  return <Badge variant="secondary">لم يُختبر</Badge>;
}

/* ============================ CHECKLIST ============================ */

const PERIOD_LABEL: Record<string, string> = {
  morning: "صباحًا", during_day: "خلال اليوم", end_of_day: "نهاية اليوم",
};

function ChecklistTab({ canManage }: { canManage: boolean }) {
  const fetchList = useServerFn(getPilotChecklist);
  const toggle = useServerFn(togglePilotChecklist);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["pilot-checklist"], queryFn: () => fetchList(), staleTime: 30_000 });
  const mut = useMutation({
    mutationFn: (vars: { item_id: string; completed: boolean }) => toggle({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pilot-checklist"] });
      qc.invalidateQueries({ queryKey: ["pilot-overview"] });
    },
  });
  if (list.isLoading) return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grouped: Record<string, any[]> = {};
  for (const i of (list.data ?? [])) (grouped[i.period] ||= []).push(i);
  return (
    <div className="grid md:grid-cols-3 gap-3">
      {Object.entries(grouped).map(([period, items]) => (
        <div key={period} className="rounded-2xl border border-border bg-card shadow-card">
          <div className="px-4 py-2 border-b bg-muted/30 font-bold text-sm">{PERIOD_LABEL[period] ?? period}</div>
          <div className="p-3 space-y-2">
            {items.map((i) => (
              <label key={i.id} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={i.completed_today}
                  disabled={!canManage || mut.isPending}
                  onCheckedChange={(c) => mut.mutate({ item_id: i.id, completed: !!c })}
                />
                <span className={`text-sm ${i.completed_today ? "text-muted-foreground line-through" : ""}`}>{i.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================ ISSUES ============================ */

const SEV_LABEL: Record<string, { label: string; tone: string }> = {
  low: { label: "منخفضة", tone: "bg-slate-100 text-slate-700 border-slate-200" },
  medium: { label: "متوسطة", tone: "bg-blue-100 text-blue-700 border-blue-200" },
  high: { label: "مرتفعة", tone: "bg-amber-100 text-amber-800 border-amber-200" },
  critical: { label: "حرجة", tone: "bg-rose-100 text-rose-700 border-rose-200" },
};
const ISTATUS_LABEL: Record<string, string> = {
  open: "مفتوحة", in_progress: "قيد المعالجة", resolved: "محلولة", closed: "مغلقة",
};

function IssuesTab({ canManage }: { canManage: boolean }) {
  const fetchList = useServerFn(listPilotIssues);
  const upsert = useServerFn(upsertPilotIssue);
  const qc = useQueryClient();
  const [status, setStatus] = useState<"open"|"in_progress"|"resolved"|"closed"|"all">("all");
  const list = useQuery({
    queryKey: ["pilot-issues", status],
    queryFn: () => fetchList({ data: { status, page: 1 } }),
    staleTime: 30_000,
  });
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any>(null);
  const mut = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (vars: any) => upsert({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pilot-issues"] });
      qc.invalidateQueries({ queryKey: ["pilot-overview"] });
      setOpen(false); setEditing(null);
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {Object.entries(ISTATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        {canManage && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 ml-1" /> مشكلة جديدة</Button></DialogTrigger>
            <IssueDialog editing={editing} pending={mut.isPending} onSubmit={(v) => mut.mutate(v)} />
          </Dialog>
        )}
      </div>
      {list.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : (
        <div className="rounded-2xl border border-border bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr>
                <th className="p-2 text-right">العنوان</th>
                <th className="p-2 text-right">الفئة</th>
                <th className="p-2 text-right">الخطورة</th>
                <th className="p-2 text-right">الحالة</th>
                <th className="p-2 text-right">التاريخ</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {(list.data?.rows ?? []).map((i: any) => (
                <tr key={i.id} className="border-t">
                  <td className="p-2 font-medium">{i.title}</td>
                  <td className="p-2">{i.category}</td>
                  <td className="p-2"><Badge variant="outline" className={SEV_LABEL[i.severity].tone}>{SEV_LABEL[i.severity].label}</Badge></td>
                  <td className="p-2"><Badge variant="outline">{ISTATUS_LABEL[i.status]}</Badge></td>
                  <td className="p-2 text-xs text-muted-foreground">{new Date(i.created_at).toLocaleDateString("ar-EG-u-nu-latn")}</td>
                  <td className="p-2 text-left">
                    {canManage && <Button size="icon" variant="ghost" onClick={() => { setEditing(i); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>}
                  </td>
                </tr>
              ))}
              {(list.data?.rows ?? []).length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-sm">لا توجد مشاكل.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IssueDialog({ editing, onSubmit, pending }: { editing: any; onSubmit: (v: any) => void; pending: boolean }) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [category, setCategory] = useState(editing?.category ?? "general");
  const [severity, setSeverity] = useState(editing?.severity ?? "medium");
  const [status, setStatus] = useState(editing?.status ?? "open");
  const [description, setDescription] = useState(editing?.description ?? "");
  useEffect(() => {
    setTitle(editing?.title ?? ""); setCategory(editing?.category ?? "general");
    setSeverity(editing?.severity ?? "medium"); setStatus(editing?.status ?? "open");
    setDescription(editing?.description ?? "");
  }, [editing]);
  return (
    <DialogContent dir="rtl">
      <DialogHeader><DialogTitle>{editing ? "تعديل مشكلة" : "إضافة مشكلة"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <Input placeholder="العنوان" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input placeholder="الفئة (مثل: مالي، أكاديمي، تقني)" value={category} onChange={(e) => setCategory(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(SEV_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(ISTATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Textarea placeholder="الوصف" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <DialogFooter>
        <Button disabled={!title.trim() || pending} onClick={() => onSubmit({ id: editing?.id, title: title.trim(), category, severity, status, description: description || null })}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ============================ FEEDBACK ============================ */

const FB_TYPE_LABEL: Record<string, string> = {
  bug: "خطأ", suggestion: "اقتراح", training_need: "حاجة تدريب", process_issue: "مشكلة إجراء",
};

function FeedbackTab({ canManage }: { canManage: boolean }) {
  const fetchList = useServerFn(listPilotFeedback);
  const record = useServerFn(recordPilotFeedback);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["pilot-feedback"], queryFn: () => fetchList({ data: { page: 1 } }), staleTime: 30_000 });
  const [open, setOpen] = useState(false);
  const mut = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (vars: any) => record({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pilot-feedback"] });
      qc.invalidateQueries({ queryKey: ["pilot-overview"] });
      setOpen(false);
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 ml-1" /> تسجيل ملاحظة</Button></DialogTrigger>
            <FeedbackDialog pending={mut.isPending} onSubmit={(v) => mut.mutate(v)} />
          </Dialog>
        )}
      </div>
      {list.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : (
        <div className="rounded-2xl border border-border bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs">
              <tr>
                <th className="p-2 text-right">الفئة</th><th className="p-2 text-right">النوع</th>
                <th className="p-2 text-right">العنوان</th><th className="p-2 text-right">الملاحظة</th>
                <th className="p-2 text-right">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {(list.data?.rows ?? []).map((f: any) => (
                <tr key={f.id} className="border-t">
                  <td className="p-2">{ROLE_LABEL[f.category] ?? f.category}</td>
                  <td className="p-2"><Badge variant="outline">{FB_TYPE_LABEL[f.type]}</Badge></td>
                  <td className="p-2">{f.subject ?? "—"}</td>
                  <td className="p-2 max-w-md truncate" title={f.message}>{f.message}</td>
                  <td className="p-2 text-xs text-muted-foreground">{new Date(f.created_at).toLocaleDateString("ar-EG-u-nu-latn")}</td>
                </tr>
              ))}
              {(list.data?.rows ?? []).length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">لا توجد ملاحظات بعد.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
function FeedbackDialog({ onSubmit, pending }: { onSubmit: (v: any) => void; pending: boolean }) {
  const [category, setCategory] = useState("student");
  const [type, setType] = useState("bug");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  return (
    <DialogContent dir="rtl">
      <DialogHeader><DialogTitle>تسجيل ملاحظة</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(ROLE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(FB_TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Input placeholder="العنوان (اختياري)" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea placeholder="نص الملاحظة" value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <DialogFooter>
        <Button disabled={!message.trim() || pending} onClick={() => onSubmit({ category, type, subject: subject || null, message: message.trim() })}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ============================ CONFIG ============================ */

function ConfigTab({ cfg, canManage }: { cfg: any; canManage: boolean }) {
  const update = useServerFn(updatePilotConfig);
  const qc = useQueryClient();
  const [status, setStatus] = useState(cfg.status);
  const [launchDate, setLaunchDate] = useState(cfg.launch_date ?? "");
  const [notes, setNotes] = useState(cfg.notes ?? "");
  const mut = useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: (vars: any) => update({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pilot-overview"] }),
  });
  return (
    <div className="rounded-2xl border border-border bg-card shadow-card p-5 space-y-4 max-w-xl">
      <div className="space-y-1">
        <label className="text-xs font-bold">حالة التشغيل التجريبي</label>
        <Select value={status} onValueChange={setStatus} disabled={!canManage}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold">تاريخ الإطلاق</label>
        <Input type="date" value={launchDate ?? ""} disabled={!canManage} onChange={(e) => setLaunchDate(e.target.value)} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold">ملاحظات</label>
        <Textarea value={notes ?? ""} disabled={!canManage} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {canManage && (
        <Button onClick={() => mut.mutate({ status, launch_date: launchDate || null, notes: notes || null })} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ التغييرات"}
        </Button>
      )}
    </div>
  );
}

/* ============================ REPORTS ============================ */

function ReportsTab() {
  const fetchOverview = useServerFn(getPilotOverview);
  const fetchScenarios = useServerFn(listPilotScenarios);
  const fetchIssues = useServerFn(listPilotIssues);
  const fetchFeedback = useServerFn(listPilotFeedback);
  const fetchParts = useServerFn(listPilotParticipants);
  const logExport = useServerFn(logPilotReportExported);

  const buildRows = async (report: "daily"|"weekly"|"final") => {
    const [ov, scens, issues, feedback, parts] = await Promise.all([
      fetchOverview(), fetchScenarios(),
      fetchIssues({ data: { status: "all", page: 1 } }),
      fetchFeedback({ data: { page: 1 } }),
      fetchParts(),
    ]);
    const summary = {
      التقرير: report, نسبة_الجاهزية: ov.readiness.score, الحالة: ov.config.status,
      مشاركون_نشطون: ov.participants.active, مشاكل_مفتوحة: ov.issues.open,
      مشاكل_حرجة: ov.issues.critical, اختبارات_ناجحة: ov.tests.pass, اختبارات_فاشلة: ov.tests.fail,
      معدل_الإنجاز: `${ov.tests.completion_rate}%`, ملاحظات: ov.feedback,
    };
    const rows: any[] = [summary];
    rows.push({});
    rows.push({ القسم: "--- المشاركون ---" });
    for (const p of parts) rows.push({ الاسم: p.full_name, الدور: ROLE_LABEL[p.role] ?? p.role, الحالة: PSTATUS_LABEL[p.status] ?? p.status });
    rows.push({});
    rows.push({ القسم: "--- السيناريوهات ---" });
    for (const s of scens) rows.push({ الفئة: CATEGORY_LABEL[s.category] ?? s.category, الاسم: s.name, النتيجة: s.result });
    rows.push({});
    rows.push({ القسم: "--- المشاكل ---" });
    for (const i of issues.rows) rows.push({ العنوان: i.title, الخطورة: SEV_LABEL[i.severity].label, الحالة: ISTATUS_LABEL[i.status] });
    rows.push({});
    rows.push({ القسم: "--- الملاحظات ---" });
    for (const f of feedback.rows) rows.push({ الفئة: ROLE_LABEL[f.category] ?? f.category, النوع: FB_TYPE_LABEL[f.type], الملاحظة: f.message });
    return rows;
  };

  const exp = async (report: "daily"|"weekly"|"final", format: "csv"|"xlsx") => {
    const rows = await buildRows(report);
    const name = `pilot_${report}_report`;
    if (format === "csv") await exportCsv(name, rows); else await exportXlsx(name, rows);
    await logExport({ data: { report, format, rows: rows.length } });
  };

  const REPORTS: Array<{ key: "daily"|"weekly"|"final"; label: string }> = [
    { key: "daily", label: "التقرير اليومي" },
    { key: "weekly", label: "التقرير الأسبوعي" },
    { key: "final", label: "التقرير النهائي للتشغيل التجريبي" },
  ];
  return (
    <div className="grid md:grid-cols-3 gap-3">
      {REPORTS.map((r) => (
        <div key={r.key} className="rounded-2xl border border-border bg-card shadow-card p-4 space-y-3">
          <div className="font-bold text-sm">{r.label}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => exp(r.key, "csv")}><FileDown className="h-3.5 w-3.5 ml-1" />CSV</Button>
            <Button size="sm" onClick={() => exp(r.key, "xlsx")}><FileSpreadsheet className="h-3.5 w-3.5 ml-1" />Excel</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
