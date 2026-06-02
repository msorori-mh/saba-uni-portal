import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Activity, CalendarRange, BookMarked, Layers, ClipboardList, ClipboardCheck,
  CalendarDays, FileText, Wallet, GraduationCap, Loader2, ArrowLeft,
  CheckCircle2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/admin/academic-operations")({
  head: () => ({ meta: [{ title: "مركز العمليات الأكاديمية — لوحة الإدارة" }] }),
  component: AcademicOpsPage,
});

type Year = { id: string; name: string; is_current: boolean; status: string };
type Semester = { id: string; academic_year_id: string; name: string; is_current: boolean; status: string };

async function safeCount(table: string, filter?: (q: any) => any): Promise<number> {
  try {
    let q = supabase.from(table as any).select("id", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) return -1;
    return count ?? 0;
  } catch { return -1; }
}

function AcademicOpsPage() {
  const qc = useQueryClient();

  const years = useQuery({
    queryKey: ["aops-years"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("id, name, is_current, status")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Year[];
    },
  });

  const semesters = useQuery({
    queryKey: ["aops-semesters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("semesters")
        .select("id, academic_year_id, name, is_current, status")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Semester[];
    },
  });

  const currentYear = useMemo(() => (years.data ?? []).find((y) => y.is_current) ?? null, [years.data]);
  const currentSem = useMemo(
    () => (semesters.data ?? []).find((s) => s.is_current && (!currentYear || s.academic_year_id === currentYear.id)) ?? null,
    [semesters.data, currentYear],
  );

  const kpis = useQuery({
    queryKey: ["aops-kpis", currentYear?.id, currentSem?.id],
    enabled: !!currentYear && !!currentSem,
    queryFn: async () => {
      const yearId = currentYear!.id;
      const semId = currentSem!.id;

      // Offerings & sections in current year/semester
      const { data: offerings } = await supabase
        .from("course_offerings")
        .select("id, status")
        .eq("academic_year_id", yearId)
        .eq("semester_id", semId);
      const offeringIds = (offerings ?? []).map((o: any) => o.id);
      const activeOfferings = (offerings ?? []).filter((o: any) => o.status === "active").length;

      let sectionsTotal = 0;
      let sectionsActive = 0;
      let sectionIds: string[] = [];
      if (offeringIds.length) {
        const { data: secs } = await supabase
          .from("course_sections")
          .select("id, status")
          .in("course_offering_id", offeringIds);
        sectionsTotal = (secs ?? []).length;
        sectionsActive = (secs ?? []).filter((s: any) => s.status === "active").length;
        sectionIds = (secs ?? []).map((s: any) => s.id);
      }

      const [enrolledCount, droppedCount, statusActive, gradeComps, pendingReceipts, unpaidFees] = await Promise.all([
        sectionIds.length
          ? safeCount("student_enrollments", (q) => q.in("course_section_id", sectionIds).eq("enrollment_status", "enrolled"))
          : Promise.resolve(0),
        sectionIds.length
          ? safeCount("student_enrollments", (q) => q.in("course_section_id", sectionIds).eq("enrollment_status", "dropped"))
          : Promise.resolve(0),
        safeCount("student_academic_status", (q) =>
          q.eq("academic_year_id", yearId).eq("semester_id", semId).eq("enrollment_status", "active"),
        ),
        sectionIds.length
          ? safeCount("grade_components", (q) => q.in("course_section_id", sectionIds))
          : Promise.resolve(0),
        safeCount("payment_receipts", (q) => q.eq("status", "submitted")),
        safeCount("student_fees" as any, (q) => q.eq("payment_status", "unpaid")),
      ]);

      const sectionsWithoutComponents = Math.max(0, sectionsActive - new Set(gradeComps >= 0 ? [] : []).size);
      return {
        activeOfferings,
        totalOfferings: offerings?.length ?? 0,
        sectionsTotal,
        sectionsActive,
        enrolledCount,
        droppedCount,
        statusActive,
        pendingReceipts,
        unpaidFees,
        gradeComponentsTotal: gradeComps,
        sectionsWithoutComponents,
      };
    },
  });

  const setCurrentYear = async (id: string) => {
    if (id === currentYear?.id) return;
    const { error: e1 } = await supabase.from("academic_years").update({ is_current: false }).neq("id", id);
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await supabase.from("academic_years").update({ is_current: true }).eq("id", id);
    if (e2) return toast.error(e2.message);
    toast.success("تم تعيين السنة الحالية");
    qc.invalidateQueries({ queryKey: ["aops-years"] });
    qc.invalidateQueries({ queryKey: ["aops-kpis"] });
  };

  const setCurrentSemester = async (id: string) => {
    const target = (semesters.data ?? []).find((s) => s.id === id);
    if (!target || id === currentSem?.id) return;
    // Clear is_current within the same year scope, then set this one
    const { error: e1 } = await supabase
      .from("semesters")
      .update({ is_current: false })
      .eq("academic_year_id", target.academic_year_id);
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await supabase.from("semesters").update({ is_current: true }).eq("id", id);
    if (e2) return toast.error(e2.message);
    toast.success("تم تعيين الفصل الحالي");
    qc.invalidateQueries({ queryKey: ["aops-semesters"] });
    qc.invalidateQueries({ queryKey: ["aops-kpis"] });
  };

  const semsInYear = (semesters.data ?? []).filter((s) => s.academic_year_id === currentYear?.id);

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
          <Activity className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="font-display text-xl font-extrabold text-primary">مركز العمليات الأكاديمية</h1>
          <p className="text-xs text-muted-foreground">
            لوحة موحّدة لمؤشرات الفصل الحالي مع روابط وإجراءات سريعة. لا يتم تكرار منطق التسجيل أو الدرجات — جميع الإجراءات تستخدم آليات النظام الموجودة.
          </p>
        </div>
      </div>

      {/* Quick actions: set current year/semester */}
      <div className="rounded-xl border bg-card p-4 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs font-bold text-muted-foreground mb-1.5">السنة الأكاديمية الحالية</div>
          {years.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Select value={currentYear?.id ?? ""} onValueChange={setCurrentYear}>
              <SelectTrigger><SelectValue placeholder="اختر السنة..." /></SelectTrigger>
              <SelectContent>
                {(years.data ?? []).map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.name} {y.is_current && "★"} {y.status !== "active" && `(${y.status})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div>
          <div className="text-xs font-bold text-muted-foreground mb-1.5">الفصل الدراسي الحالي</div>
          {semesters.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Select value={currentSem?.id ?? ""} onValueChange={setCurrentSemester} disabled={!currentYear}>
              <SelectTrigger><SelectValue placeholder={currentYear ? "اختر الفصل..." : "حدد السنة أولاً"} /></SelectTrigger>
              <SelectContent>
                {semsInYear.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} {s.is_current && "★"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Context banner */}
      {currentYear && currentSem ? (
        <div className="rounded-lg border bg-emerald-50 border-emerald-200 px-4 py-2.5 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span className="font-bold text-emerald-900">السياق الحالي:</span>
          <span className="text-emerald-900">{currentYear.name} — {currentSem.name}</span>
        </div>
      ) : (
        <div className="rounded-lg border bg-amber-50 border-amber-200 px-4 py-2.5 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="text-amber-900">لم يتم تحديد سنة/فصل حالي — يرجى ضبطهما لعرض المؤشرات.</span>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="المقررات المطروحة"
          value={kpis.data?.activeOfferings}
          sub={kpis.data ? `من ${kpis.data.totalOfferings} طرح` : undefined}
          icon={CalendarDays}
          to="/admin/course-offerings"
          loading={kpis.isLoading}
        />
        <KpiCard
          label="الشعب النشطة"
          value={kpis.data?.sectionsActive}
          sub={kpis.data ? `من ${kpis.data.sectionsTotal} شعبة` : undefined}
          icon={Layers}
          to="/admin/course-offerings"
          loading={kpis.isLoading}
        />
        <KpiCard
          label="تسجيلات نشطة"
          value={kpis.data?.enrolledCount}
          sub={kpis.data ? `${kpis.data.droppedCount} محذوف` : undefined}
          icon={ClipboardList}
          to="/admin/enrollments"
          loading={kpis.isLoading}
        />
        <KpiCard
          label="حالة الطلاب الأكاديمية"
          value={kpis.data?.statusActive}
          sub="نشط هذا الفصل"
          icon={GraduationCap}
          to="/admin/students"
          loading={kpis.isLoading}
        />
        <KpiCard
          label="مكونات الدرجات"
          value={kpis.data?.gradeComponentsTotal}
          sub="عناصر التقييم المعرّفة"
          icon={ClipboardCheck}
          to="/admin/grades"
          loading={kpis.isLoading}
        />
        <KpiCard
          label="إيصالات قيد المراجعة"
          value={kpis.data?.pendingReceipts}
          icon={Wallet}
          to="/admin/finance"
          loading={kpis.isLoading}
          highlight={kpis.data && kpis.data.pendingReceipts > 0 ? "warn" : undefined}
        />
        <KpiCard
          label="رسوم غير مدفوعة"
          value={kpis.data?.unpaidFees}
          icon={Wallet}
          to="/admin/finance"
          loading={kpis.isLoading}
        />
        <KpiCard
          label="السجلات الأكاديمية"
          value={null}
          sub="عرض وإصدار"
          icon={FileText}
          to="/admin/transcripts"
          loading={false}
        />
      </div>

      {/* Quick links */}
      <div className="rounded-xl border bg-card">
        <div className="px-4 py-2.5 bg-muted/50 border-b text-sm font-bold text-primary">روابط سريعة</div>
        <div className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLink to="/admin/academic-core" icon={CalendarRange} label="البنية الأكاديمية" desc="السنوات والفصول والمستويات" />
          <QuickLink to="/admin/study-plans" icon={BookMarked} label="الخطط والمقررات" desc="إدارة المقررات والخطط الدراسية" />
          <QuickLink to="/admin/course-offerings" icon={CalendarDays} label="الطرح والشعب" desc="فتح/إغلاق الشعب وتعيين الأساتذة" />
          <QuickLink to="/admin/enrollments" icon={ClipboardList} label="تسجيل الطلاب" desc="تسجيل الطلاب في الشعب" />
          <QuickLink to="/admin/grades" icon={ClipboardCheck} label="الدرجات" desc="رصد وإدارة الدرجات" />
          <QuickLink to="/admin/transcripts" icon={FileText} label="السجلات الأكاديمية" desc="إصدار سجلات الطلاب" />
          <QuickLink to="/admin/imports" icon={ClipboardList} label="الاستيراد الجماعي" desc="استيراد البيانات من ملفات Excel" />
          <QuickLink to="/admin/finance" icon={Wallet} label="الشؤون المالية" desc="الرسوم والإيصالات والخصومات" />
          <QuickLink to="/admin/students" icon={GraduationCap} label="إدارة الطلاب" desc="ملفات الطلاب والحسابات" />
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label, value, sub, icon: Icon, to, loading, highlight,
}: {
  label: string; value: number | null | undefined; sub?: string;
  icon: any; to: string; loading: boolean; highlight?: "warn";
}) {
  return (
    <Link
      to={to}
      className={`group rounded-xl border bg-card p-4 hover:border-primary hover:shadow-md transition ${
        highlight === "warn" ? "border-amber-300 bg-amber-50/40" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary transition" />
      </div>
      <div className="mt-3 text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-primary tabular-nums">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : value === null || value === undefined ? "—" : value < 0 ? <Badge variant="destructive" className="text-[10px]">خطأ</Badge> : value.toLocaleString("ar-EG")}
      </div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </Link>
  );
}

function QuickLink({ to, icon: Icon, label, desc }: { to: string; icon: any; label: string; desc: string }) {
  return (
    <Link to={to} className="group rounded-lg border bg-card p-3 hover:border-primary hover:bg-primary/5 transition flex items-start gap-3">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-primary truncate">{label}</div>
        <div className="text-[11px] text-muted-foreground truncate">{desc}</div>
      </div>
    </Link>
  );
}
