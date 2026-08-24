import { useState } from "react";
import {
  Activity,
  BadgeCheck,
  Banknote,
  Bell,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  Clock3,
  Download,
  FileBadge2,
  FileCheck2,
  FileClock,
  FilePlus2,
  FileText,
  GraduationCap,
  HandCoins,
  History,
  IdCard,
  Inbox,
  Laptop,
  MailCheck,
  Menu,
  MessageSquareText,
  PackageCheck,
  Printer,
  QrCode,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  UserCheck,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  TENDER_SHOWCASE_MARKER,
  formatYemeniRial,
  staffShowcase,
  type StaffShowcaseModule,
} from "@/lib/staff-self-service-showcase";

type StaffProfileLike = {
  employee_number?: string | null;
  full_name_ar?: string | null;
  full_name_en?: string | null;
  job_title?: string | null;
  role_type?: string | null;
  status?: string | null;
};

type NavItem = { key: StaffShowcaseModule; label: string; icon: LucideIcon; badge?: number };

const CORE_NAV: NavItem[] = [
  { key: "dashboard", label: "الرئيسية", icon: Activity },
  { key: "profile", label: "ملفي الوظيفي", icon: UserRound },
  { key: "leave", label: "الإجازات والمغادرات", icon: CalendarDays, badge: 1 },
  { key: "payroll", label: "كشوف الرواتب", icon: Banknote },
  { key: "career", label: "المسار الوظيفي", icon: TrendingUp },
  { key: "communications", label: "المراسلات والتعاميم", icon: Inbox, badge: 1 },
  { key: "custody", label: "العُهد", icon: Laptop, badge: 1 },
  { key: "requests", label: "طلباتي ومعاملاتي", icon: FileClock },
  { key: "approvals", label: "مهام الاعتماد", icon: UserCheck, badge: 3 },
  { key: "notifications", label: "الإشعارات", icon: Bell, badge: 3 },
  { key: "audit", label: "سجل النشاط", icon: History },
];

const VALUE_NAV: NavItem[] = [
  { key: "certificates", label: "الإفادات وشهادات الخبرة", icon: FileBadge2 },
  { key: "performance", label: "الأداء السنوي", icon: Star },
  { key: "attendance", label: "الحضور والانصراف", icon: Clock3 },
  { key: "assignments", label: "التكليفات والعمل الإضافي", icon: BriefcaseBusiness },
  { key: "training", label: "التدريب والتطوير", icon: GraduationCap },
  { key: "promotions", label: "الترقيات والتسويات", icon: TrendingUp },
  { key: "clearance", label: "إخلاء الطرف", icon: PackageCheck },
];

const ALL_MODULES = [...CORE_NAV, ...VALUE_NAV];

export function StaffSelfServiceShowcase({ profile }: { profile?: StaffProfileLike | null }) {
  const [active, setActive] = useState<StaffShowcaseModule>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [printPack, setPrintPack] = useState(false);
  const current = ALL_MODULES.find((item) => item.key === active) ?? CORE_NAV[0];
  const name = profile?.full_name_ar?.trim() || staffShowcase.employee.name;

  const open = (key: StaffShowcaseModule) => {
    setActive(key);
    setPrintPack(false);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const printCurrent = () => window.print();
  const printServicePack = () => {
    setPrintPack(true);
    window.setTimeout(() => window.print(), 120);
  };

  return (
    <div className="min-h-[calc(100vh-82px)] bg-surface" data-testid="staff-self-service-showcase">
      <div className="border-b border-gold/30 bg-primary-deep px-4 py-2 text-center text-[11px] font-bold text-gold print:hidden">
        استعراض متكامل لخدمات الموظفين — بيانات تجريبية مخصصة للعرض
      </div>
      <div className="mx-auto flex max-w-[1600px] items-start">
        <aside className={`${mobileOpen ? "fixed inset-y-0 right-0 z-50 block w-80" : "hidden"} shrink-0 border-l border-border bg-card shadow-card lg:sticky lg:top-0 lg:block lg:h-[calc(100vh-82px)] lg:w-72 lg:overflow-y-auto print:hidden`}>
          <div className="flex items-center justify-between border-b border-border p-4 lg:hidden">
            <div className="font-bold text-primary">خدمات الموظفين</div>
            <button type="button" onClick={() => setMobileOpen(false)} className="rounded-md p-2 hover:bg-secondary" aria-label="إغلاق القائمة"><X className="h-5 w-5" /></button>
          </div>
          <div className="p-4">
            <div className="rounded-xl bg-gold-gradient p-3 text-primary-deep">
              <div className="text-[10px] font-bold opacity-70">حساب العرض</div>
              <div className="mt-1 font-display text-sm font-extrabold">{name}</div>
              <div className="text-[11px] opacity-75">موظف · مسؤول مباشر</div>
            </div>
          </div>
          <NavGroup title="الخدمات الأساسية" items={CORE_NAV} active={active} onOpen={open} />
          <NavGroup title="قيمة مضافة" items={VALUE_NAV} active={active} onOpen={open} />
          <div className="m-4 rounded-lg border border-dashed border-gold/50 bg-gold/5 p-3 text-[11px] leading-5 text-muted-foreground">
            بُنيت الواجهات بعقد بيانات قابل للاستبدال في المرحلة الثانية بتكاملات HR والمالية والعُهد.
          </div>
        </aside>

        {mobileOpen ? <button type="button" aria-label="إغلاق القائمة" className="fixed inset-0 z-40 bg-black/40 lg:hidden print:hidden" onClick={() => setMobileOpen(false)} /> : null}

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8 print:p-0">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setMobileOpen(true)} className="rounded-lg border border-border bg-card p-2.5 text-primary lg:hidden" aria-label="فتح قائمة الخدمات"><Menu className="h-5 w-5" /></button>
              <div>
                <div className="text-xs font-bold text-gold">بوابة الموظفين / خدماتي</div>
                <h1 className="font-display text-xl font-extrabold text-primary sm:text-2xl">{current.label}</h1>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={printCurrent} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-bold text-primary hover:border-gold"><Printer className="h-4 w-4" /> طباعة الصفحة</button>
              <button type="button" onClick={printServicePack} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground"><FileCheck2 className="h-4 w-4" /> طباعة حزمة الخدمات</button>
            </div>
          </div>

          {printPack ? (
            <div data-testid="staff-services-print-pack">
              <PrintCover name={name} />
              {ALL_MODULES.map((item) => (
                <section key={item.key} className="break-after-page py-4" data-evidence-module={item.key}>
                  <PrintHeading title={item.label} />
                  <ModuleView module={item.key} profile={profile} onOpen={open} />
                </section>
              ))}
            </div>
          ) : (
            <section data-evidence-module={active}>
              <PrintHeading title={current.label} />
              <ModuleView module={active} profile={profile} onOpen={open} />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function NavGroup({ title, items, active, onOpen }: { title: string; items: NavItem[]; active: StaffShowcaseModule; onOpen: (key: StaffShowcaseModule) => void }) {
  return (
    <div className="px-3 pb-4">
      <div className="px-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">{title}</div>
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const selected = active === item.key;
          return (
            <button key={item.key} type="button" onClick={() => onOpen(item.key)} className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-right text-xs font-bold transition ${selected ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-secondary"}`}>
              <Icon className={`h-4 w-4 shrink-0 ${selected ? "text-gold" : "text-primary"}`} />
              <span className="flex-1">{item.label}</span>
              {item.badge ? <span className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] ${selected ? "bg-gold text-primary-deep" : "bg-gold/15 text-gold"}`}>{item.badge}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PrintCover({ name }: { name: string }) {
  return (
    <section className="hidden min-h-[90vh] place-items-center text-center print:grid print:break-after-page">
      <div>
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-primary text-gold"><BriefcaseBusiness className="h-10 w-10" /></div>
        <div className="mt-6 text-sm font-bold text-gold">جامعة إقليم سبأ</div>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-primary">بوابة خدمات الموظفين</h1>
        <p className="mt-3 text-muted-foreground">كلية تكنولوجيا المعلومات وعلوم الحاسوب</p>
        <div className="mx-auto mt-8 max-w-md rounded-xl border border-border p-4 text-sm">
          حزمة واجهات الموظف والمسؤول المباشر — حساب العرض: {name}
        </div>
        <div className="mt-8 font-mono text-[10px] text-muted-foreground">{TENDER_SHOWCASE_MARKER}</div>
      </div>
    </section>
  );
}

function PrintHeading({ title }: { title: string }) {
  return (
    <div className="mb-5 hidden items-center justify-between border-b-2 border-gold pb-3 print:flex">
      <div>
        <div className="text-[10px] font-bold text-gold">بوابة الموظفين — كلية تكنولوجيا المعلومات وعلوم الحاسوب</div>
        <h2 className="font-display text-xl font-extrabold text-primary">{title}</h2>
      </div>
      <div className="font-mono text-[9px] text-muted-foreground">{TENDER_SHOWCASE_MARKER}</div>
    </div>
  );
}

function ModuleView({ module, profile, onOpen }: { module: StaffShowcaseModule; profile?: StaffProfileLike | null; onOpen: (key: StaffShowcaseModule) => void }) {
  switch (module) {
    case "dashboard": return <Dashboard profile={profile} onOpen={onOpen} />;
    case "profile": return <Profile profile={profile} />;
    case "leave": return <Leave />;
    case "payroll": return <Payroll />;
    case "career": return <Career />;
    case "communications": return <Communications />;
    case "custody": return <Custody />;
    case "requests": return <Requests />;
    case "notifications": return <Notifications />;
    case "approvals": return <Approvals />;
    case "certificates": return <Certificates />;
    case "performance": return <Performance />;
    case "attendance": return <Attendance />;
    case "assignments": return <Assignments />;
    case "training": return <Training />;
    case "promotions": return <Promotions />;
    case "clearance": return <Clearance />;
    case "audit": return <Audit />;
  }
}

function Dashboard({ profile, onOpen }: { profile?: StaffProfileLike | null; onOpen: (key: StaffShowcaseModule) => void }) {
  const name = profile?.full_name_ar?.trim() || staffShowcase.employee.name;
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl bg-hero-gradient p-5 text-primary-foreground shadow-elegant sm:p-7">
        <div className="absolute -left-10 -top-10 h-36 w-36 rounded-full bg-gold/20 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-gold">مرحباً بك</div>
            <h2 className="mt-1 font-display text-2xl font-extrabold">{name}</h2>
            <div className="mt-1 text-sm text-primary-foreground/75">{profile?.job_title || staffShowcase.employee.title} · {staffShowcase.employee.department}</div>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-center backdrop-blur-sm">
            <div className="text-[10px] text-primary-foreground/70">حالة الحساب</div>
            <div className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-emerald-300"><ShieldCheck className="h-4 w-4" /> نشط وآمن</div>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={CalendarCheck} label="رصيد الإجازة الاعتيادية" value="18 يوماً" detail="من أصل 30 يوماً" />
        <Kpi icon={FileClock} label="طلبات مفتوحة" value="1" detail="بانتظار الموارد البشرية" />
        <Kpi icon={MailCheck} label="تعاميم غير مقروءة" value="1" detail="تعميم عاجل" />
        <Kpi icon={Laptop} label="العهد المسجلة" value="3" detail="واحدة قيد الإرجاع" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.2fr,.8fr]">
        <Panel title="يحتاج انتباهك" icon={Bell}>
          <Alert tone="amber" title="تعميم عاجل يتطلب تأكيد الاستلام" detail="تنظيم الدوام خلال فترة الاختبارات — آخر موعد 22 أغسطس 2026." action="فتح التعميم" onAction={() => onOpen("communications")} />
          <Alert tone="blue" title="طلب الإجازة وصل إلى الموارد البشرية" detail="اعتمده المسؤول المباشر؛ يمكنك متابعة السجل الزمني." action="متابعة الطلب" onAction={() => onOpen("leave")} />
          <Alert tone="red" title="طلب إرجاع عهدة يحتاج فحصاً" detail="جهاز قارئ باركود مرتبط بإخلاء الطرف الإلكتروني." action="فتح العهدة" onAction={() => onOpen("custody")} />
        </Panel>
        <Panel title="إجراءات سريعة" icon={Sparkles}>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <Quick label="تقديم إجازة أو مغادرة" icon={FilePlus2} onClick={() => onOpen("leave")} />
            <Quick label="طلب إفادة وظيفية" icon={FileBadge2} onClick={() => onOpen("certificates")} />
            <Quick label="عرض آخر كشف راتب" icon={Banknote} onClick={() => onOpen("payroll")} />
            <Quick label="طلب نقل أو إرجاع عهدة" icon={PackageCheck} onClick={() => onOpen("custody")} />
          </div>
        </Panel>
      </div>
      <Panel title="آخر المعاملات" icon={History}><RequestsTable limit={3} /></Panel>
    </div>
  );
}

function Profile({ profile }: { profile?: StaffProfileLike | null }) {
  const e = staffShowcase.employee;
  return (
    <div className="grid gap-5 xl:grid-cols-[.7fr,1.3fr]">
      <Panel title="بطاقة الموظف" icon={IdCard}>
        <div className="text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gold-gradient text-2xl font-extrabold text-primary-deep">أم</div>
          <div className="mt-3 font-display text-lg font-extrabold text-primary">{profile?.full_name_ar || e.name}</div>
          <div className="text-xs text-muted-foreground">{profile?.full_name_en || e.nameEn}</div>
          <div className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">موظف نشط</div>
          <div className="mt-4 border-t border-border pt-4 font-mono text-sm font-bold text-primary">{profile?.employee_number || e.number}</div>
        </div>
      </Panel>
      <div className="space-y-5">
        <Panel title="البيانات الوظيفية" icon={BriefcaseBusiness}><FieldGrid fields={[["القسم", e.department], ["المسمى الوظيفي", profile?.job_title || e.title], ["الدرجة", e.grade], ["المربوط", e.step], ["المسؤول المباشر", e.manager], ["تاريخ التعيين", e.hireDate], ["المؤهل", e.qualification], ["مقر العمل", e.location]]} /></Panel>
        <Panel title="البيانات الشخصية ووسائل التواصل" icon={UserRound}><FieldGrid fields={[["رقم الهوية", e.nationalIdMasked], ["البريد الجامعي", e.email], ["رقم الجوال", e.phone], ["حالة التحقق", "متحقق من البريد والجوال"]]} /></Panel>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-6 text-blue-900">أي تعديل على البيانات الحساسة ينشئ طلب تحديث وسجل تدقيق؛ لا يتم تغيير السجل الوظيفي مباشرة من هذه الصفحة.</div>
      </div>
    </div>
  );
}

function Leave() {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{staffShowcase.leaveBalances.map((b) => <Kpi key={b.type} icon={CalendarDays} label={`رصيد ${b.type}`} value={`${b.remaining} ${b.unit}`} detail={`مستخدم ${b.used} من ${b.total}`} />)}</div>
      <div className="grid gap-5 xl:grid-cols-[.85fr,1.15fr]">
        <Panel title="طلب إجازة أو مغادرة جديد" icon={FilePlus2}>
          <div className="grid gap-3 sm:grid-cols-2">
            <ShowField label="نوع الطلب"><select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"><option>إجازة اعتيادية</option><option>إجازة عارضة</option><option>إجازة مرضية</option><option>مغادرة شخصية</option><option>مغادرة رسمية</option></select></ShowField>
            <ShowField label="البديل الوظيفي"><select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"><option>سارة عبدالله حسن</option><option>محمد علي أحمد</option></select></ShowField>
            <ShowField label="من تاريخ"><input type="date" defaultValue="2026-08-25" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></ShowField>
            <ShowField label="إلى تاريخ"><input type="date" defaultValue="2026-08-29" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></ShowField>
          </div>
          <ShowField label="السبب"><textarea defaultValue="إجازة اعتيادية مع تسليم المهام للبديل المحدد." className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></ShowField>
          <div className="mt-3 rounded-lg border border-dashed border-gold/60 bg-gold/5 p-4 text-center text-xs text-muted-foreground"><FileText className="mx-auto mb-1 h-5 w-5 text-gold" /> رفع المستندات الداعمة — PDF أو صورة، بحد أقصى 10MB</div>
          <div className="mt-3 flex gap-2"><button className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">إرسال للاعتماد</button><button className="rounded-lg border border-border px-4 py-2 text-xs font-bold">حفظ كمسودة</button></div>
        </Panel>
        <Panel title="مسار الاعتماد للطلب LV-2026-0184" icon={ClipboardCheck}>
          <Timeline items={[["19 أغسطس — 9:12 ص", "أرسل الموظف الطلب", "تم التحقق من عدم التداخل والرصيد"], ["19 أغسطس — 1:40 م", "اعتماد المسؤول المباشر", "موافق — تم تحديد البديل الوظيفي"], ["20 أغسطس — 10:14 ص", "مراجعة الموارد البشرية", "قيد الاعتماد النهائي"], ["الخطوة التالية", "تحديث الرصيد وإشعار الموظف", "تُنفذ بعد قرار HR"]]} />
        </Panel>
      </div>
      <Panel title="سجل الإجازات والمغادرات" icon={History}><RequestsTable /></Panel>
    </div>
  );
}

function Payroll() {
  const p = staffShowcase.payroll;
  const allowances = p.allowances.reduce((sum, item) => sum + item.value, 0);
  const deductions = p.deductions.reduce((sum, item) => sum + item.value, 0);
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><ShieldCheck className="ml-2 inline h-4 w-4" /> بيانات مالية حساسة — يتطلب العرض والتنزيل تحققاً إضافياً، ولا يستطيع أي موظف رؤية كشف موظف آخر.</div>
      <div className="grid gap-5 xl:grid-cols-[1.25fr,.75fr]">
        <Panel title={`كشف راتب ${p.period}`} icon={Banknote}>
          <div className="grid gap-3 sm:grid-cols-3"><Kpi icon={HandCoins} label="الراتب الأساسي" value={formatYemeniRial(p.basic)} /><Kpi icon={TrendingUp} label="إجمالي البدلات" value={formatYemeniRial(allowances)} /><Kpi icon={Banknote} label="إجمالي الاستقطاعات" value={formatYemeniRial(deductions)} /></div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <MoneyList title="البدلات والاستحقاقات" items={p.allowances} tone="green" />
            <MoneyList title="الاستقطاعات" items={p.deductions} tone="red" />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary p-4 text-primary-foreground"><div><div className="text-xs text-primary-foreground/70">صافي المستحق</div><div className="font-display text-2xl font-extrabold text-gold">{formatYemeniRial(p.net)}</div></div><button className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-xs font-bold text-primary-deep"><Download className="h-4 w-4" /> تنزيل PDF</button></div>
          <div className="mt-3 text-[10px] text-muted-foreground">نُشر في {p.publishedAt} · نموذج تجريبي غير صالح للصرف</div>
        </Panel>
        <Panel title="سجل الكشوف" icon={FileText}><div className="space-y-2">{staffShowcase.payrollHistory.map((row) => <div key={row.period} className="flex items-center justify-between rounded-lg border border-border p-3"><div><div className="text-sm font-bold text-primary">{row.period}</div><div className="text-[10px] text-emerald-700">{row.status}</div></div><div className="text-left"><div className="text-xs font-bold">{formatYemeniRial(row.net)}</div><button className="mt-1 text-[10px] font-bold text-primary">عرض الكشف</button></div></div>)}</div></Panel>
      </div>
    </div>
  );
}

function Career() { return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><Kpi icon={IdCard} label="الدرجة الحالية" value={staffShowcase.employee.grade} detail={staffShowcase.employee.step} /><Kpi icon={TrendingUp} label="الترقية المتوقعة" value="يناير 2027" detail="بعد استكمال التقييم" /><Kpi icon={Star} label="آخر تقييم" value="91%" detail="ممتاز" /></div><Panel title="التدرج الوظيفي والترقيات" icon={TrendingUp}><Timeline items={staffShowcase.career.map((c) => [c.date, c.title, `${c.detail} — ${c.status}`])} /></Panel></div>; }

function Communications() {
  return <div className="grid gap-5 xl:grid-cols-[.8fr,1.2fr]"><Panel title="البحث والتصنيف" icon={Search}><input placeholder="ابحث في العنوان أو الجهة..." className="w-full rounded-lg border border-border px-3 py-2 text-sm" /><div className="mt-3 grid grid-cols-2 gap-2"><select className="rounded-lg border border-border px-3 py-2 text-sm"><option>كل الجهات</option><option>العمادة</option><option>الموارد البشرية</option></select><select className="rounded-lg border border-border px-3 py-2 text-sm"><option>كل الأولويات</option><option>عاجل</option><option>مهم</option></select></div><div className="mt-4 space-y-2">{staffShowcase.circulars.map((c) => <div key={c.id} className={`rounded-lg border p-3 ${!c.read ? "border-gold bg-gold/5" : "border-border"}`}><div className="flex items-start justify-between gap-2"><div className="text-sm font-bold text-primary">{c.title}</div><Status tone={c.priority === "عاجل" ? "red" : c.priority === "مهم" ? "amber" : "blue"}>{c.priority}</Status></div><div className="mt-1 text-[10px] text-muted-foreground">{c.sender} · {c.date}</div></div>)}</div></Panel><Panel title="تعميم: تنظيم الدوام خلال فترة الاختبارات" icon={MessageSquareText}><div className="flex flex-wrap gap-2 text-[10px]"><Status tone="red">عاجل</Status><Status tone="blue">عمادة الكلية</Status><Status tone="amber">يتطلب تأكيد الاستلام</Status></div><div className="mt-4 space-y-3 text-sm leading-7 text-foreground"><p>حرصاً على انتظام أعمال الاختبارات، يعتمد جدول الدوام المرفق ابتداءً من يوم الأحد، وعلى جميع الموظفين الالتزام بنقاط العمل المحددة.</p><ul className="list-disc space-y-1 pr-5"><li>الحضور قبل بدء الاختبار بثلاثين دقيقة.</li><li>تأكيد استلام التعميم قبل 22 أغسطس 2026.</li><li>توجيه الاستفسارات إلى مكتب العمادة عبر المراسلات الداخلية.</li></ul></div><div className="mt-4 flex flex-wrap gap-2"><button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"><MailCheck className="h-4 w-4" /> تأكيد القراءة والاستلام</button><button className="rounded-lg border border-border px-4 py-2 text-xs font-bold">تنزيل المرفق</button><button className="rounded-lg border border-border px-4 py-2 text-xs font-bold">أرشفة</button></div><div className="mt-4 rounded-lg bg-secondary p-3 text-[11px] text-muted-foreground">سجل القراءة: لم يتم التأكيد بعد · آخر تنبيه منذ 5 ساعات</div></Panel></div>;
}

function Custody() { return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><Kpi icon={Laptop} label="إجمالي العهد" value="3" detail="مسجلة باسم الموظف" /><Kpi icon={CheckCircle2} label="حالة جيدة" value="2" detail="لا تحتاج إجراء" /><Kpi icon={PackageCheck} label="قيد الإرجاع" value="1" detail="يمنع إخلاء الطرف" /></div><Panel title="الأجهزة والمعدات المسجلة باسمي" icon={Laptop}><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary"><tr>{["العهدة", "رقم الأصل", "الرقم التسلسلي", "تاريخ التسليم", "الحالة", "الإجراء"].map((h) => <th key={h} className="px-3 py-2 text-right text-xs">{h}</th>)}</tr></thead><tbody>{staffShowcase.custody.map((a) => <tr key={a.id} className="border-t border-border"><td className="px-3 py-3 font-bold text-primary">{a.item}</td><td className="px-3 py-3 font-mono text-xs">{a.id}</td><td className="px-3 py-3 font-mono text-xs">{a.serial}</td><td className="px-3 py-3 text-xs">{a.delivered}</td><td className="px-3 py-3"><Status tone={a.status === "طلب إرجاع" ? "amber" : "green"}>{a.status}</Status></td><td className="px-3 py-3"><button className="text-xs font-bold text-primary">عرض المحضر</button></td></tr>)}</tbody></table></div></Panel><div className="grid gap-5 lg:grid-cols-2"><Panel title="طلب نقل أو إرجاع عهدة" icon={PackageCheck}><ShowField label="العهدة"><select className="w-full rounded-lg border border-border px-3 py-2 text-sm"><option>جهاز قارئ باركود — AST-IT-0314</option></select></ShowField><div className="grid grid-cols-2 gap-3"><ShowField label="نوع الإجراء"><select className="w-full rounded-lg border border-border px-3 py-2 text-sm"><option>إرجاع للمخزن</option><option>نقل إلى موظف آخر</option></select></ShowField><ShowField label="حالة العهدة"><select className="w-full rounded-lg border border-border px-3 py-2 text-sm"><option>تحتاج فحصاً</option><option>جيدة</option><option>متضررة</option></select></ShowField></div><ShowField label="ملاحظات"><textarea defaultValue="يحتاج الجهاز إلى فحص قبل الاستلام النهائي." className="min-h-20 w-full rounded-lg border border-border px-3 py-2 text-sm" /></ShowField><button className="mt-3 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">إرسال الطلب</button></Panel><Panel title="محضر الاستلام والتسليم الإلكتروني" icon={ClipboardCheck}><FieldGrid fields={[["رقم المحضر", "HDO-2026-0031"], ["المسلّم", staffShowcase.employee.name], ["المستلم", "أمين المخزن"], ["العهدة", "جهاز قارئ باركود"], ["حالة التوقيع", "وقّع الموظف — بانتظار المستلم"], ["التحقق", "QR-HDO-31-26"]]} /><div className="mt-4 flex items-center justify-center rounded-xl border border-dashed border-border p-5"><QrCode className="h-16 w-16 text-primary" /></div></Panel></div></div>; }

function Requests() { return <Panel title="جميع طلباتي ومعاملاتي" icon={FileClock}><div className="mb-3 flex flex-wrap gap-2"><input placeholder="بحث برقم المعاملة..." className="rounded-lg border border-border px-3 py-2 text-sm" /><select className="rounded-lg border border-border px-3 py-2 text-sm"><option>كل الحالات</option><option>قيد المعالجة</option><option>معتمد</option><option>مرفوض</option></select></div><RequestsTable /></Panel>; }

function Notifications() { return <Panel title="مركز الإشعارات" icon={Bell}><div className="mb-4 flex justify-between"><div className="text-xs text-muted-foreground">3 إشعارات جديدة</div><button className="text-xs font-bold text-primary">تحديد الكل كمقروء</button></div><div className="space-y-2">{staffShowcase.notifications.map((n) => <Alert key={n.title} tone={n.tone} title={n.title} detail={`${n.detail} — ${n.time}`} />)}</div><div className="mt-5 rounded-xl border border-border p-4"><div className="font-bold text-primary">قنوات الإشعار</div><div className="mt-3 grid gap-3 sm:grid-cols-3">{["داخل البوابة", "البريد الجامعي", "إشعارات الجوال"].map((c, i) => <label key={c} className="flex items-center gap-2 rounded-lg bg-secondary p-3 text-xs"><input type="checkbox" defaultChecked={i < 2} /> {c}</label>)}</div></div></Panel>; }

function Approvals() { return <div className="space-y-5"><div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><UsersRound className="ml-2 inline h-4 w-4" /> هذه المساحة تظهر للمسؤول المباشر فقط، وتعرض مرؤوسيه ضمن نطاقه التنظيمي.</div><Panel title="طلبات مرؤوسي المباشرين" icon={UserCheck}><div className="grid gap-3 xl:grid-cols-3">{staffShowcase.approvals.map((a) => <div key={a.id} className="rounded-xl border border-border p-4"><div className="flex justify-between"><Status tone="amber">{a.status}</Status><span className="font-mono text-[10px] text-muted-foreground">{a.id}</span></div><div className="mt-3 font-bold text-primary">{a.employee}</div><div className="mt-1 text-xs text-muted-foreground">{a.type} · {a.duration}</div><div className="mt-3 rounded-lg bg-secondary p-2 text-[11px]">الرصيد المتاح: {a.balance}</div><div className="mt-3 flex gap-2"><button className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">اعتماد</button><button className="flex-1 rounded-lg border border-red-300 px-3 py-2 text-xs font-bold text-red-700">رفض مع السبب</button></div></div>)}</div></Panel></div>; }

function Certificates() { return <div className="grid gap-5 xl:grid-cols-[.8fr,1.2fr]"><Panel title="طلب مستند وظيفي" icon={FileBadge2}><ShowField label="نوع المستند"><select className="w-full rounded-lg border border-border px-3 py-2 text-sm"><option>إفادة وظيفية</option><option>شهادة خبرة</option><option>بيان راتب موجه</option></select></ShowField><ShowField label="الجهة الموجه إليها"><input defaultValue="إلى من يهمه الأمر" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></ShowField><ShowField label="لغة المستند"><select className="w-full rounded-lg border border-border px-3 py-2 text-sm"><option>العربية</option><option>الإنجليزية</option><option>ثنائي اللغة</option></select></ShowField><button className="mt-3 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">إرسال الطلب</button></Panel><Panel title="المستندات الصادرة" icon={FileCheck2}><div className="space-y-3">{staffShowcase.certificates.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"><div><div className="font-bold text-primary">{c.type}</div><div className="mt-1 font-mono text-[10px] text-muted-foreground">{c.id} · {c.requested}</div></div><div className="flex items-center gap-2"><Status tone="green">{c.status}</Status><QrCode className="h-8 w-8 text-primary" /><button className="rounded-lg border border-border px-3 py-2 text-xs font-bold"><Download className="ml-1 inline h-3 w-3" /> PDF</button></div></div>)}</div></Panel></div>; }

function Performance() { const p = staffShowcase.performance; return <div className="grid gap-5 xl:grid-cols-[.7fr,1.3fr]"><Panel title={p.cycle} icon={Star}><div className="text-center"><div className="mx-auto grid h-28 w-28 place-items-center rounded-full border-8 border-gold bg-gold/10"><div><div className="font-display text-3xl font-extrabold text-primary">{p.score}%</div><div className="text-xs font-bold text-gold">{p.rating}</div></div></div><div className="mt-4 text-xs text-muted-foreground">أُغلق التقييم واعتمدته الموارد البشرية</div></div></Panel><Panel title="نتيجة التقييم وخطة التطوير" icon={ClipboardCheck}><div className="grid gap-3 sm:grid-cols-3">{p.strengths.map((s) => <div key={s} className="rounded-lg bg-emerald-50 p-3 text-center text-xs font-bold text-emerald-800"><CheckCircle2 className="mx-auto mb-1 h-4 w-4" />{s}</div>)}</div><div className="mt-4 rounded-xl border border-border p-4"><div className="text-xs font-bold text-primary">هدف التطوير المعتمد</div><div className="mt-1 text-sm">{p.development}</div></div><button className="mt-4 rounded-lg border border-border px-4 py-2 text-xs font-bold">إضافة تعليق الموظف</button></Panel></div>; }

function Attendance() { const a = staffShowcase.attendance; return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Kpi icon={CalendarCheck} label="أيام الحضور" value={String(a.present)} /><Kpi icon={Clock3} label="إجمالي الساعات" value={a.hours} /><Kpi icon={Clock3} label="مرات التأخير" value={String(a.late)} /><Kpi icon={X} label="الغياب" value={String(a.absence)} /><Kpi icon={CalendarDays} label="الإجازات" value={String(a.leave)} /></div><Panel title={`سجل الحضور — ${a.month}`} icon={Clock3}><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary"><tr>{["التاريخ", "الحضور", "الانصراف", "الساعات", "الحالة"].map((h) => <th key={h} className="px-3 py-2 text-right text-xs">{h}</th>)}</tr></thead><tbody>{[["20 أغسطس", "08:01", "03:02", "7:01", "منتظم"], ["19 أغسطس", "08:08", "03:05", "6:57", "تأخير 8 دقائق"], ["18 أغسطس", "07:55", "03:00", "7:05", "منتظم"], ["17 أغسطس", "—", "—", "—", "إجازة معتمدة"]].map((r) => <tr key={r[0]} className="border-t border-border">{r.map((c, i) => <td key={i} className="px-3 py-3 text-xs">{c}</td>)}</tr>)}</tbody></table></div></Panel></div>; }

function Assignments() { return <div className="space-y-5"><Panel title="التكليفات والعمل الإضافي" icon={BriefcaseBusiness}><div className="grid gap-3 lg:grid-cols-2">{staffShowcase.assignments.map((a) => <div key={a.id} className="rounded-xl border border-border p-4"><div className="flex justify-between"><Status tone={a.status === "معتمد" ? "green" : "amber"}>{a.status}</Status><span className="font-mono text-[10px]">{a.id}</span></div><div className="mt-3 font-bold text-primary">{a.title}</div><div className="mt-1 text-xs text-muted-foreground">{a.period} · {a.hours}</div><button className="mt-3 text-xs font-bold text-primary">عرض أمر التكليف</button></div>)}</div></Panel><Panel title="طلب عمل إضافي جديد" icon={FilePlus2}><div className="grid gap-3 sm:grid-cols-3"><ShowField label="التاريخ"><input type="date" defaultValue="2026-08-24" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></ShowField><ShowField label="من"><input type="time" defaultValue="15:00" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></ShowField><ShowField label="إلى"><input type="time" defaultValue="18:00" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /></ShowField></div><ShowField label="مبرر العمل"><textarea className="min-h-20 w-full rounded-lg border border-border px-3 py-2 text-sm" defaultValue="دعم أعمال الاختبارات بعد انتهاء الدوام الرسمي." /></ShowField><button className="mt-3 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">إرسال للمسؤول المباشر</button></Panel></div>; }

function Training() { return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><Kpi icon={GraduationCap} label="دورات مكتملة" value="6" detail="48 ساعة تدريبية" /><Kpi icon={CalendarDays} label="دورات قادمة" value="1" detail="سبتمبر 2026" /><Kpi icon={Star} label="متوسط التقييم" value="94%" detail="آخر 3 برامج" /></div><Panel title="خطة التدريب والتطوير المهني" icon={GraduationCap}><div className="grid gap-3 lg:grid-cols-2">{staffShowcase.training.map((t) => <div key={t.title} className="rounded-xl border border-border p-4"><div className="flex justify-between"><Status tone={t.status.startsWith("مكتمل") ? "green" : "blue"}>{t.status}</Status><GraduationCap className="h-5 w-5 text-gold" /></div><div className="mt-3 font-bold text-primary">{t.title}</div><div className="mt-1 text-xs text-muted-foreground">{t.provider} · {t.date}</div><button className="mt-3 text-xs font-bold text-primary">عرض التفاصيل والشهادة</button></div>)}</div></Panel></div>; }

function Promotions() { return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><Kpi icon={IdCard} label="الدرجة الحالية" value={staffShowcase.employee.grade} detail={staffShowcase.employee.step} /><Kpi icon={CalendarDays} label="مدة الخدمة" value="6 سنوات و11 شهراً" detail="منذ سبتمبر 2019" /><Kpi icon={TrendingUp} label="الاستحقاق القادم" value="يناير 2027" detail="متبقي 5 أشهر" /></div><Panel title="متابعة الترقية والتسوية" icon={TrendingUp}><Timeline items={[["مكتمل", "التحقق من مدة الخدمة", "مستوفاة حتى 31 يوليو 2026"], ["مكتمل", "آخر تقييم أداء", "91% — ممتاز"], ["قيد التنفيذ", "مراجعة المؤهل والخبرة", "لدى الموارد البشرية"], ["لم يبدأ", "قرار لجنة شؤون الموظفين", "متوقع ديسمبر 2026"], ["لم يبدأ", "إصدار قرار الترقية", "بعد اعتماد اللجنة"]]} /></Panel></div>; }

function Clearance() { return <div className="space-y-5"><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><PackageCheck className="ml-2 inline h-4 w-4" /> إخلاء الطرف مرتبط تلقائياً بالمالية والمكتبة والعُهد وتقنية المعلومات، ولا يغلق مع وجود التزام مفتوح.</div><Panel title="إخلاء الطرف الإلكتروني CL-2026-0019" icon={PackageCheck}><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{staffShowcase.clearance.map((c) => <div key={c.unit} className="rounded-xl border border-border p-4 text-center"><div className={`mx-auto grid h-10 w-10 place-items-center rounded-full ${c.status === "مكتمل" ? "bg-emerald-100 text-emerald-700" : c.status === "متوقف" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{c.status === "مكتمل" ? <CheckCircle2 className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}</div><div className="mt-2 text-sm font-bold text-primary">{c.unit}</div><div className="mt-1 text-[10px] font-bold">{c.status}</div><div className="mt-1 text-[10px] text-muted-foreground">{c.note}</div></div>)}</div><div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-secondary p-4"><div><div className="text-xs font-bold text-primary">الحالة العامة</div><div className="text-sm text-red-700">متوقف حتى استلام عهدة قارئ الباركود</div></div><button className="rounded-lg border border-border bg-card px-4 py-2 text-xs font-bold">طباعة ملخص الحالة</button></div></Panel></div>; }

function Audit() { return <div className="space-y-5"><div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><ShieldCheck className="ml-2 inline h-4 w-4" /> سجل زمني للعرض فقط؛ السجل التشغيلي في المرحلة الثانية يُنشأ من الخادم ولا يقبل التعديل أو الحذف.</div><Panel title="السجل الزمني للمعاملة LV-2026-0184" icon={History}><Timeline items={staffShowcase.audit.map((a) => [a.at, a.action, `${a.actor} — ${a.result}`])} /></Panel></div>; }

function RequestsTable({ limit }: { limit?: number }) { const rows = staffShowcase.leaveRequests.slice(0, limit); return <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary"><tr>{["رقم الطلب", "النوع", "الفترة", "المدة", "المرفقات", "الحالة"].map((h) => <th key={h} className="px-3 py-2 text-right text-xs font-bold">{h}</th>)}</tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-t border-border"><td className="px-3 py-3 font-mono text-xs font-bold text-primary">{r.id}</td><td className="px-3 py-3 text-xs">{r.type}</td><td className="px-3 py-3 text-xs">{r.period}</td><td className="px-3 py-3 text-xs">{r.duration}</td><td className="px-3 py-3 text-xs">{r.attachment}</td><td className="px-3 py-3"><Status tone={r.tone}>{r.status}</Status></td></tr>)}</tbody></table></div>; }

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) { return <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5"><h3 className="mb-4 flex items-center gap-2 font-display text-base font-extrabold text-primary"><span className="grid h-8 w-8 place-items-center rounded-lg bg-gold/15 text-gold"><Icon className="h-4 w-4" /></span>{title}</h3>{children}</section>; }
function Kpi({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail?: string }) { return <div className="rounded-xl border border-border bg-card p-4 shadow-card"><div className="flex items-start justify-between gap-2"><div><div className="text-[11px] font-bold text-muted-foreground">{label}</div><div className="mt-1 font-display text-xl font-extrabold text-primary">{value}</div>{detail ? <div className="mt-1 text-[10px] text-muted-foreground">{detail}</div> : null}</div><div className="grid h-9 w-9 place-items-center rounded-lg bg-gold/15 text-gold"><Icon className="h-4 w-4" /></div></div></div>; }
function Quick({ label, icon: Icon, onClick }: { label: string; icon: LucideIcon; onClick: () => void }) { return <button type="button" onClick={onClick} className="flex min-h-12 items-center gap-3 rounded-lg border border-border p-3 text-right text-xs font-bold text-primary hover:border-gold"><Icon className="h-4 w-4 text-gold" /><span className="flex-1">{label}</span><ChevronLeft className="h-3 w-3 text-muted-foreground" /></button>; }
function Alert({ tone, title, detail, action, onAction }: { tone: string; title: string; detail: string; action?: string; onAction?: () => void }) { const colors: Record<string, string> = { amber: "border-amber-200 bg-amber-50 text-amber-900", red: "border-red-200 bg-red-50 text-red-900", green: "border-emerald-200 bg-emerald-50 text-emerald-900", blue: "border-blue-200 bg-blue-50 text-blue-900" }; return <div className={`mb-2 rounded-lg border p-3 ${colors[tone] || colors.blue}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="text-xs font-extrabold">{title}</div><div className="mt-1 text-[11px] opacity-80">{detail}</div></div>{action ? <button type="button" onClick={onAction} className="text-[11px] font-extrabold underline">{action}</button> : null}</div></div>; }
function Status({ tone, children }: { tone: string; children: React.ReactNode }) { const colors: Record<string, string> = { green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-800", blue: "bg-blue-100 text-blue-800" }; return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold ${colors[tone] || colors.blue}`}>{children}</span>; }
function Timeline({ items }: { items: readonly (readonly string[])[] }) { return <div className="relative space-y-0 before:absolute before:bottom-3 before:right-[9px] before:top-3 before:w-px before:bg-gold/40">{items.map((item, i) => <div key={`${item[0]}-${i}`} className="relative flex gap-3 pb-5 last:pb-0"><div className="relative z-10 mt-1 h-[19px] w-[19px] shrink-0 rounded-full border-4 border-card bg-gold ring-1 ring-gold/40" /><div><div className="text-[10px] font-bold text-gold">{item[0]}</div><div className="text-sm font-extrabold text-primary">{item[1]}</div><div className="mt-0.5 text-xs text-muted-foreground">{item[2]}</div></div></div>)}</div>; }
function FieldGrid({ fields }: { fields: readonly (readonly [string, string | null | undefined])[] }) { return <dl className="grid gap-3 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="rounded-lg bg-secondary/60 p-3"><dt className="text-[10px] font-bold text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-bold text-foreground">{value || "—"}</dd></div>)}</dl>; }
function ShowField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="mt-3 block"><span className="mb-1.5 block text-xs font-bold text-primary">{label}</span>{children}</label>; }
function MoneyList({ title, items, tone }: { title: string; items: readonly { label: string; value: number }[]; tone: "green" | "red" }) { return <div className={`rounded-xl border p-4 ${tone === "green" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}><div className={`mb-2 text-xs font-extrabold ${tone === "green" ? "text-emerald-800" : "text-red-800"}`}>{title}</div>{items.map((item) => <div key={item.label} className="flex justify-between border-b border-current/10 py-2 text-xs last:border-0"><span>{item.label}</span><span className="font-bold">{formatYemeniRial(item.value)}</span></div>)}</div>; }
