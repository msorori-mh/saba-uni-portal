import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot, CalendarClock, GraduationCap, TrendingUp, Wallet,
  Loader2, AlertCircle, CheckCircle2, Clock, Info,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  getAutomationSettings, updateAutomationSetting,
  getAutomationPreview, logAutomationViewed,
  type AutomationKey,
} from "@/lib/automation.functions";

export const Route = createFileRoute("/admin/automation")({
  head: () => ({ meta: [{ title: "مركز الأتمتة الأكاديمية" }] }),
  component: AutomationPage,
});

const AUTOMATION_META: Record<AutomationKey, { title: string; desc: string; icon: typeof Bot; tone: string }> = {
  registration: {
    title: "أتمتة التسجيل",
    desc: "إدارة فتح وإغلاق التسجيل تلقائيًا بناءً على تواريخ الفصل الدراسي.",
    icon: CalendarClock,
    tone: "text-blue-600",
  },
  progression: {
    title: "أتمتة التقدم الأكاديمي",
    desc: "ترقية الطلاب، إصدار الإنذارات، وتطبيق المراقبة الأكاديمية تلقائيًا.",
    icon: TrendingUp,
    tone: "text-emerald-600",
  },
  graduation: {
    title: "أتمتة التخرج",
    desc: "تحديد المرشحين للتخرج وإصدار الحالات تلقائيًا.",
    icon: GraduationCap,
    tone: "text-amber-600",
  },
  finance: {
    title: "أتمتة الشؤون المالية",
    desc: "توليد الرسوم ومتابعة المستحقات تلقائيًا.",
    icon: Wallet,
    tone: "text-rose-600",
  },
};

function AutomationPage() {
  const fetchSettings = useServerFn(getAutomationSettings);
  const fetchPreview = useServerFn(getAutomationPreview);
  const logView = useServerFn(logAutomationViewed);
  const updateSetting = useServerFn(updateAutomationSetting);
  const qc = useQueryClient();

  useEffect(() => { logView().catch(() => {}); }, [logView]);

  const settings = useQuery({
    queryKey: ["automation-settings"],
    queryFn: () => fetchSettings(),
    staleTime: 30_000,
  });

  const preview = useQuery({
    queryKey: ["automation-preview"],
    queryFn: () => fetchPreview(),
    staleTime: 60_000,
  });

  const mut = useMutation({
    mutationFn: (vars: { key: AutomationKey; enabled: boolean }) =>
      updateSetting({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automation-settings"] }),
  });

  if (settings.isLoading) {
    return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (settings.error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />{(settings.error as Error).message}
      </div>
    );
  }

  const data = settings.data!;
  const map = new Map(data.settings.map((s) => [s.key, s]));
  const pv = preview.data;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-primary flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" /> مركز الأتمتة الأكاديمية
          </h1>
          <p className="text-sm text-muted-foreground">
            تكوين وعرض الأتمتة الأكاديمية والمالية. لا يتم تنفيذ أي إجراء تلقائي في هذه المرحلة — معاينة وإعداد فقط.
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Info className="h-3 w-3" /> المرحلة 12A.1 — معاينة فقط
        </Badge>
      </div>

      {/* Status overview */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {(Object.keys(AUTOMATION_META) as AutomationKey[]).map((k) => {
          const m = AUTOMATION_META[k];
          const s = map.get(k);
          const Icon = m.icon;
          return (
            <div key={k} className="rounded-2xl border border-border bg-card shadow-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${m.tone}`} />
                  <span className="font-bold text-sm">{m.title}</span>
                </div>
                {s?.enabled ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600">مفعّلة</Badge>
                ) : (
                  <Badge variant="secondary">معطّلة</Badge>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Configuration panels */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(Object.keys(AUTOMATION_META) as AutomationKey[]).map((k) => {
          const m = AUTOMATION_META[k];
          const s = map.get(k);
          const Icon = m.icon;
          return (
            <div key={k} className="rounded-2xl border border-border bg-card shadow-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Icon className={`h-6 w-6 ${m.tone} mt-0.5`} />
                  <div>
                    <h2 className="font-bold text-base">{m.title}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                  </div>
                </div>
                <Switch
                  checked={!!s?.enabled}
                  disabled={!data.canManage || mut.isPending}
                  onCheckedChange={(checked) => mut.mutate({ key: k, enabled: checked })}
                />
              </div>

              <div className="border-t pt-3">
                {k === "registration" && <RegistrationPreview pv={pv} loading={preview.isLoading} />}
                {k === "progression" && <ProgressionPreview pv={pv} loading={preview.isLoading} />}
                {k === "graduation" && <GraduationPreview pv={pv} loading={preview.isLoading} />}
                {k === "finance" && <FinancePreview pv={pv} loading={preview.isLoading} />}
              </div>

              {s?.updated_at && (
                <p className="text-[10px] text-muted-foreground">
                  آخر تحديث: {new Date(s.updated_at).toLocaleString("ar-EG-u-nu-latn")}
                </p>
              )}
            </div>
          );
        })}
      </section>

      {!data.canManage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-center gap-2">
          <Info className="h-4 w-4" /> لديك صلاحية الاطلاع فقط. تعديل الإعدادات متاح لمسؤول النظام.
        </div>
      )}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-lg font-extrabold ${tone ?? "text-primary"}`}>{value}</div>
    </div>
  );
}

function LoadingMini() {
  return <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> جاري التحميل…</div>;
}

function RegistrationPreview({ pv, loading }: { pv: any; loading: boolean }) {
  if (loading) return <LoadingMini />;
  if (!pv) return null;
  const r = pv.registration;
  const statusLabel: Record<string, { label: string; tone: string; icon: typeof Clock }> = {
    open: { label: "التسجيل مفتوح", tone: "text-emerald-600", icon: CheckCircle2 },
    not_started: { label: "لم يبدأ بعد", tone: "text-blue-600", icon: Clock },
    closed: { label: "التسجيل مغلق", tone: "text-rose-600", icon: AlertCircle },
    unknown: { label: "غير محدد", tone: "text-muted-foreground", icon: Info },
  };
  const st = statusLabel[r.status] ?? statusLabel.unknown;
  const Icon = st.icon;
  return (
    <div className="space-y-2 text-xs">
      <div className={`flex items-center gap-2 ${st.tone} font-bold`}>
        <Icon className="h-4 w-4" /> {st.label}
      </div>
      {r.current_semester && (
        <div className="text-muted-foreground">
          الفصل الحالي: <span className="text-foreground font-medium">{r.current_semester.name}</span>
          <span className="block">من {r.current_semester.start_date} إلى {r.current_semester.end_date}</span>
        </div>
      )}
      {r.upcoming_action && (
        <div className="rounded bg-blue-50 border border-blue-200 p-2 text-blue-800">{r.upcoming_action}</div>
      )}
      {r.next_semester && (
        <div className="text-muted-foreground">الفصل القادم: {r.next_semester.name} ({r.next_semester.start_date})</div>
      )}
    </div>
  );
}

function ProgressionPreview({ pv, loading }: { pv: any; loading: boolean }) {
  if (loading) return <LoadingMini />;
  if (!pv) return null;
  const p = pv.progression;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Stat label="ترقية" value={p.eligible_for_promotion} tone="text-emerald-600" />
      <Stat label="إنذار" value={p.eligible_for_warning} tone="text-amber-600" />
      <Stat label="مراقبة" value={p.eligible_for_probation} tone="text-orange-600" />
      <Stat label="إيقاف" value={p.eligible_for_suspension} tone="text-rose-600" />
    </div>
  );
}

function GraduationPreview({ pv, loading }: { pv: any; loading: boolean }) {
  if (loading) return <LoadingMini />;
  if (!pv) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      <Stat label="مؤهل للتخرج" value={pv.graduation.eligible} tone="text-emerald-600" />
      <Stat label="قريب من التخرج" value={pv.graduation.near_graduation} tone="text-amber-600" />
    </div>
  );
}

function FinancePreview({ pv, loading }: { pv: any; loading: boolean }) {
  if (loading) return <LoadingMini />;
  if (!pv) return null;
  const f = pv.finance;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Stat label="مستحقات" value={f.fees_pending} tone="text-rose-600" />
      <Stat label="جزئي" value={f.fees_partial} tone="text-amber-600" />
      <Stat label="مدفوع" value={f.fees_paid} tone="text-emerald-600" />
      <Stat label="نسبة التحصيل" value={`${f.collection_rate}%`} />
    </div>
  );
}
