import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getAcademicOpsContext,
  getAcademicOpsKpis,
  setCurrentAcademicYear as setCurrentAcademicYearServer,
  setCurrentSemester as setCurrentSemesterServer,
} from "@/lib/admin-academic-operations.functions";
import {
  Activity, CalendarRange, BookMarked, Layers, ClipboardList, ClipboardCheck,
  CalendarDays, FileText, Wallet, GraduationCap, Loader2, ArrowLeft,
  CheckCircle2, AlertTriangle, RefreshCw,
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

function AcademicOpsPage() {
  const qc = useQueryClient();
  const contextFn = useServerFn(getAcademicOpsContext);
  const kpisFn = useServerFn(getAcademicOpsKpis);
  const setYearFn = useServerFn(setCurrentAcademicYearServer);
  const setSemFn = useServerFn(setCurrentSemesterServer);

  const context = useQuery({
    queryKey: ["aops-context"],
    queryFn: () => contextFn({ data: {} }),
    retry: 1,
  });

  const years = (context.data?.years ?? []) as Year[];
  const semesters = (context.data?.semesters ?? []) as Semester[];

  const currentYear = useMemo(() => years.find((y) => y.is_current) ?? null, [years]);
  const currentSem = useMemo(
    () => semesters.find((s) => s.is_current && (!currentYear || s.academic_year_id === currentYear.id)) ?? null,
    [semesters, currentYear],
  );

  const kpis = useQuery({
    queryKey: ["aops-kpis", currentYear?.id, currentSem?.id],
    enabled: !!currentYear && !!currentSem && !context.isError,
    queryFn: () =>
      kpisFn({
        data: {
          academicYearId: currentYear!.id,
          semesterId: currentSem!.id,
        },
      }),
    retry: 1,
  });

  const handleSetCurrentYear = async (id: string) => {
    if (id === currentYear?.id) return;
    try {
      await setYearFn({ data: { yearId: id } });
      toast.success("تم تعيين السنة الحالية");
      qc.invalidateQueries({ queryKey: ["aops-context"] });
      qc.invalidateQueries({ queryKey: ["aops-kpis"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تعيين السنة");
    }
  };

  const handleSetCurrentSemester = async (id: string) => {
    const target = semesters.find((s) => s.id === id);
    if (!target || id === currentSem?.id) return;
    try {
      await setSemFn({ data: { semesterId: id } });
      toast.success("تم تعيين الفصل الحالي");
      qc.invalidateQueries({ queryKey: ["aops-context"] });
      qc.invalidateQueries({ queryKey: ["aops-kpis"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل تعيين الفصل");
    }
  };

  const semsInYear = semesters.filter((s) => s.academic_year_id === currentYear?.id);

  if (context.isError) {
    return (
      <div dir="rtl" className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
            <Activity className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-xl font-extrabold text-primary">مركز العمليات الأكاديمية</h1>
          </div>
        </div>
        <div
          className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-6 text-center space-y-4"
          role="alert"
          data-testid="aops-context-error"
        >
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" />
          <p className="text-sm font-bold text-amber-900">تعذّر تحميل بيانات مركز العمليات الأكاديمية</p>
          <p className="text-xs text-amber-800">
            لم نتمكن من جلب السنة والفصل الحاليين. يمكنك إعادة المحاولة أو العودة إلى لوحة الإدارة.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => context.refetch()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              إعادة تحميل البيانات
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/admin">العودة إلى لوحة الإدارة</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
      <div className="rounded-2xl border border-border bg-card shadow-card p-4 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs font-bold text-muted-foreground mb-1.5">السنة الأكاديمية الحالية</div>
          {context.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Select value={currentYear?.id ?? ""} onValueChange={handleSetCurrentYear}>
              <SelectTrigger><SelectValue placeholder="اختر السنة..." /></SelectTrigger>
              <SelectContent>
                {years.map((y) => (
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
          {context.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Select value={currentSem?.id ?? ""} onValueChange={handleSetCurrentSemester} disabled={!currentYear}>
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
      <div className="space-y-3">
        {kpis.isError && (
          <div
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2"
            role="alert"
            data-testid="aops-kpis-error"
          >
            <div className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>تعذّر تحميل المؤشرات. بقية الصفحة والروابط السريعة ما زالت متاحة.</span>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => kpis.refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              إعادة تحميل المؤشرات
            </Button>
          </div>
        )}
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
            label="المجموعات الدراسية النشطة"
            value={kpis.data?.sectionsActive}
            sub={kpis.data ? `من ${kpis.data.sectionsTotal} مجموعة دراسية` : undefined}
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
      </div>

      {/* Quick links */}
      <div className="rounded-2xl border border-border bg-card shadow-card">
        <div className="px-4 py-2.5 bg-muted/50 border-b text-sm font-bold text-primary">روابط سريعة</div>
        <div className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLink to="/admin/academic-core" icon={CalendarRange} label="البنية الأكاديمية" desc="السنوات والفصول والمستويات" />
          <QuickLink to="/admin/study-plans" icon={BookMarked} label="الخطط والمقررات" desc="إدارة المقررات والخطط الدراسية" />
          <QuickLink to="/admin/course-offerings" icon={CalendarDays} label="إسناد المقررات والمجموعات الدراسية" desc="فتح/إغلاق المجموعات الدراسية وتعيين الأساتذة" />
          <QuickLink to="/admin/enrollments" icon={ClipboardList} label="تقسيم المجموعات" desc="تقسيم الطلاب على المجموعات الدراسية" />
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
  icon: React.ComponentType<{ className?: string }>; to: string; loading: boolean; highlight?: "warn";
}) {
  return (
    <Link
      to={to}
      className={`group rounded-2xl border border-border bg-card shadow-card p-4 hover:border-primary hover:shadow-md transition ${
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

function QuickLink({ to, icon: Icon, label, desc }: { to: string; icon: React.ComponentType<{ className?: string }>; label: string; desc: string }) {
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
