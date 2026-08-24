import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Award,
  Bell,
  BookOpen,
  Box,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ClipboardCheck,
  Clock3,
  FileBadge,
  FileText,
  GraduationCap,
  History,
  Home,
  Mail,
  Menu,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { StaffSelfServiceLiveActions } from "@/components/staff-showcase/StaffSelfServiceLiveActions";
import { StaffSelfServiceLiveDashboard } from "@/components/staff-showcase/StaffSelfServiceLiveDashboard";
import { StaffValueAddedEmployeePanel } from "@/components/staff-showcase/StaffValueAddedEmployeePanel";
import { StaffEmployeeHome } from "@/components/staff-portal/StaffEmployeeHome";
import { B1StaffWorkspace } from "@/components/student-requests/b1/B1StaffWorkspace";
import { portalFeatures } from "@/lib/portal-features";

export type StaffPortalSection =
  | "home"
  | "requests"
  | "student-requests"
  | "leave"
  | "payroll"
  | "communications"
  | "custody"
  | "notifications"
  | "profile"
  | "career"
  | "documents"
  | "performance"
  | "attendance"
  | "overtime"
  | "training"
  | "promotions"
  | "clearance";

export type StaffPortalProfile = {
  employee_number: string | null;
  full_name_ar: string;
  full_name_en: string | null;
  job_title: string;
  role_type: string;
  status: string;
};

type NavItem = {
  id: StaffPortalSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "الرئيسية",
    items: [
      { id: "home", label: "الرئيسية", icon: Home },
      { id: "profile", label: "ملفي الوظيفي", icon: UserRound },
      { id: "requests", label: "طلباتي ومعاملاتي", icon: FileText },
      { id: "student-requests", label: "الطلبات الطلابية المسندة", icon: ClipboardCheck },
      { id: "notifications", label: "الإشعارات", icon: Bell },
    ],
  },
  {
    title: "الخدمات الأساسية",
    items: [
      { id: "leave", label: "الإجازات والمغادرات", icon: CalendarDays },
      { id: "payroll", label: "كشوف الرواتب", icon: WalletCards },
      { id: "career", label: "المسار الوظيفي", icon: History },
      { id: "communications", label: "المراسلات والتعاميم", icon: Mail },
      { id: "custody", label: "العُهد", icon: Box },
    ],
  },
  {
    title: "التطوير والخدمات المساندة",
    items: [
      { id: "documents", label: "الإفادات والشهادات", icon: FileBadge },
      { id: "performance", label: "تقييم الأداء", icon: Award },
      { id: "attendance", label: "الحضور والانصراف", icon: CalendarCheck },
      { id: "overtime", label: "التكليفات والعمل الإضافي", icon: Clock3 },
      { id: "training", label: "التدريب والتطوير", icon: BookOpen },
      { id: "promotions", label: "الترقيات والتسويات", icon: TrendingUp },
      { id: "clearance", label: "إخلاء الطرف", icon: ShieldCheck },
    ],
  },
];

const TITLES = Object.fromEntries(
  GROUPS.flatMap((group) => group.items.map((item) => [item.id, item.label])),
) as Record<StaffPortalSection, string>;

const LIVE_FILTER: Partial<Record<StaffPortalSection, string>> = {
  leave: "leave",
  payroll: "payroll",
  career: "career",
  communications: "correspondence",
  custody: "custody",
  notifications: "notifications",
};

const VALUE_FILTER: Partial<Record<StaffPortalSection, string>> = {
  documents: "documents",
  performance: "evaluations",
  attendance: "attendance",
  overtime: "overtime",
  training: "training",
  promotions: "promotions",
  clearance: "clearance",
};

function initialSection(): StaffPortalSection {
  if (typeof window === "undefined") return "home";
  const value = window.location.hash.replace(/^#\/?/, "") as StaffPortalSection;
  return GROUPS.some((group) => group.items.some((item) => item.id === value))
    ? value
    : "home";
}

function PortalNavigation({
  active,
  onSelect,
}: {
  active: StaffPortalSection;
  onSelect: (section: StaffPortalSection) => void;
}) {
  return (
    <nav aria-label="خدمات بوابة الموظفين" className="space-y-5">
      {GROUPS.map((group) => (
        <div key={group.title}>
          <div className="mb-2 px-3 text-[11px] font-black text-muted-foreground">{group.title}</div>
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const selected = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={selected ? "page" : undefined}
                  onClick={() => onSelect(item.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-right text-sm font-bold transition ${
                    selected
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">{item.label}</span>
                  {selected && <ChevronLeft className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {portalFeatures.staffGraduatesAffairs && (
        <div className="border-t border-border pt-4">
          <Link
            to="/staff/graduates-affairs"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-foreground transition hover:bg-muted"
          >
            <GraduationCap className="h-4 w-4" />
            شؤون الخريجين
          </Link>
        </div>
      )}
    </nav>
  );
}

function StaffProfileView({ profile }: { profile: StaffPortalProfile }) {
  const rows = [
    ["الاسم", profile.full_name_ar],
    ["الاسم بالإنجليزية", profile.full_name_en || "—"],
    ["الرقم الوظيفي", profile.employee_number || "—"],
    ["المسمى الوظيفي", profile.job_title],
    ["نوع الدور", profile.role_type],
    ["حالة الملف", profile.status === "active" ? "نشط" : profile.status],
  ];
  return (
    <section dir="rtl" className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <span className="rounded-2xl bg-primary/10 p-3 text-primary"><BriefcaseBusiness className="h-6 w-6" /></span>
        <div>
          <h2 className="text-lg font-black text-foreground">الملف الوظيفي</h2>
          <p className="text-xs text-muted-foreground">بياناتك الشخصية والوظيفية المعتمدة.</p>
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-muted/40 p-3">
            <dt className="text-xs font-bold text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-sm font-black text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function FilteredLiveView({ section }: { section: StaffPortalSection }) {
  const filter = LIVE_FILTER[section];
  return (
    <div className={`staff-live-filter staff-live-filter--${filter ?? "timeline"}`}>
      <StaffSelfServiceLiveDashboard />
    </div>
  );
}

function FilteredValueView({ section }: { section: StaffPortalSection }) {
  const filter = VALUE_FILTER[section];
  return (
    <div className={`staff-value-filter staff-value-filter--${filter}`}>
      <StaffValueAddedEmployeePanel />
    </div>
  );
}

function PortalView({
  section,
  profile,
  onSelect,
}: {
  section: StaffPortalSection;
  profile: StaffPortalProfile;
  onSelect: (section: StaffPortalSection) => void;
}) {
  if (section === "home") return <StaffEmployeeHome profile={profile} onOpen={(value) => onSelect(value as StaffPortalSection)} />;
  if (section === "profile") return <StaffProfileView profile={profile} />;
  if (section === "student-requests") return <B1StaffWorkspace />;
  if (section === "requests") {
    return (
      <div className="space-y-5">
        <StaffSelfServiceLiveActions variant="employee" />
        <div className="staff-live-filter staff-live-filter--timeline">
          <StaffSelfServiceLiveDashboard />
        </div>
      </div>
    );
  }
  if (section in LIVE_FILTER) return <FilteredLiveView section={section} />;
  if (!portalFeatures.staffSelfServiceValueAdded) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        هذه الخدمة غير متاحة مؤقتاً.
      </div>
    );
  }
  return <FilteredValueView section={section} />;
}

export function StaffEmployeePortal({ profile }: { profile: StaffPortalProfile }) {
  const [active, setActive] = useState<StaffPortalSection>(initialSection);
  const [menuOpen, setMenuOpen] = useState(false);

  const select = (section: StaffPortalSection) => {
    setActive(section);
    setMenuOpen(false);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#/${section}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  useEffect(() => {
    const onHashChange = () => setActive(initialSection());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const activeIcon = useMemo(
    () => GROUPS.flatMap((group) => group.items).find((item) => item.id === active)?.icon ?? Home,
    [active],
  );
  const ActiveIcon = activeIcon;

  return (
    <div dir="rtl" data-testid="staff-employee-portal" className="container mx-auto max-w-[1500px] px-3 py-4 sm:px-4 sm:py-6">
      <style>{`
        .staff-live-filter [data-testid="staff-self-service-live-read-dashboard"] > * { display: none; }
        .staff-live-filter--leave [data-testid="staff-self-service-live-read-dashboard"] > div:has(> [data-testid="staff-02d-leave"]),
        .staff-live-filter--career [data-testid="staff-self-service-live-read-dashboard"] > div:has(> [data-testid="staff-02d-career"]),
        .staff-live-filter--custody [data-testid="staff-self-service-live-read-dashboard"] > div:has(> [data-testid="staff-02d-custody"]),
        .staff-live-filter--notifications [data-testid="staff-self-service-live-read-dashboard"] > div:has(> [data-testid="staff-02d-notifications"]) { display: grid; }
        .staff-live-filter--leave [data-testid="staff-02d-career"],
        .staff-live-filter--career [data-testid="staff-02d-leave"],
        .staff-live-filter--custody [data-testid="staff-02d-notifications"],
        .staff-live-filter--notifications [data-testid="staff-02d-custody"] { display: none; }
        .staff-live-filter--payroll [data-testid="staff-02d-payroll"],
        .staff-live-filter--correspondence [data-testid="staff-02d-correspondence"],
        .staff-live-filter--timeline [data-testid="staff-02d-timeline"] { display: block; }
        .staff-value-filter [data-testid="staff-02e-employee-panel"] > * { display: none; }
        .staff-value-filter [data-testid="staff-02e-employee-panel"] { display: block; }
        .staff-value-filter--documents [data-testid="staff-02e-documents"],
        .staff-value-filter--evaluations [data-testid="staff-02e-evaluations"],
        .staff-value-filter--attendance [data-testid="staff-02e-attendance"],
        .staff-value-filter--overtime [data-testid="staff-02e-overtime"],
        .staff-value-filter--training [data-testid="staff-02e-training"],
        .staff-value-filter--promotions [data-testid="staff-02e-promotions"],
        .staff-value-filter--clearance [data-testid="staff-02e-clearance"],
        .staff-value-filter [data-testid="staff-02e-notice"] { display: block; }
      `}</style>

      <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-card p-3 shadow-sm lg:hidden">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-primary/10 p-2 text-primary"><ActiveIcon className="h-5 w-5" /></span>
          <div><div className="text-[11px] text-muted-foreground">بوابة الموظفين</div><div className="text-sm font-black">{TITLES[active]}</div></div>
        </div>
        <button type="button" onClick={() => setMenuOpen(true)} aria-label="فتح قائمة الخدمات" className="rounded-xl border border-border p-2.5 text-primary">
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="إغلاق القائمة" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-foreground/45 backdrop-blur-sm" />
          <aside className="absolute inset-y-0 right-0 w-[86%] max-w-sm overflow-y-auto bg-background p-4 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div><div className="font-black text-primary">بوابة الموظفين</div><div className="text-xs text-muted-foreground">{profile.full_name_ar}</div></div>
              <button type="button" onClick={() => setMenuOpen(false)} className="rounded-lg border border-border p-2"><X className="h-4 w-4" /></button>
            </div>
            <PortalNavigation active={active} onSelect={select} />
          </aside>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-5 border-b border-border pb-4">
              <div className="text-sm font-black text-primary">{profile.full_name_ar}</div>
              <div className="mt-1 text-xs text-muted-foreground">{profile.job_title}</div>
            </div>
            <PortalNavigation active={active} onSelect={select} />
          </div>
        </aside>

        <main className="min-w-0">
          {active !== "home" && (
            <header className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-primary/10 p-2 text-primary"><ActiveIcon className="h-5 w-5" /></span>
                <div>
                  <div className="text-[11px] font-bold text-muted-foreground">بوابة الموظفين / خدماتي</div>
                  <h1 className="text-lg font-black text-foreground">{TITLES[active]}</h1>
                </div>
              </div>
            </header>
          )}
          <PortalView section={active} profile={profile} onSelect={select} />
        </main>
      </div>
    </div>
  );
}
