import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X, GraduationCap, BookOpen, Briefcase, ShieldCheck } from "lucide-react";
import collegeLogo from "@/assets/college-logo.jpg";
import universityLogo from "@/assets/university-logo.jpeg.asset.json";

const navItems = [
  { to: "/", label: "الرئيسية" },
  { to: "/about", label: "عن الكلية" },
  { to: "/departments", label: "البرامج" },
  { to: "/faculty", label: "هيئة التدريس" },
  { to: "/news", label: "الأخبار" },
  { to: "/events", label: "الفعاليات" },
  { to: "/research", label: "الأبحاث" },
  { to: "/verify-document", label: "التحقق" },
  { to: "/contact", label: "اتصل بنا" },
] as const;

const portalButtons = [
  { label: "دخول الطالب", Icon: GraduationCap, tone: "gold" as const, type: "student" as const },
  { label: "دخول الأكاديمي", Icon: BookOpen, tone: "light" as const, type: "faculty" as const },
  { label: "دخول الموظف", Icon: Briefcase, tone: "light" as const, type: "staff" as const },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-lg">
      {/* Top strip */}
      <div className="bg-primary-deep text-primary-foreground/90 text-xs">
        <div className="container mx-auto flex items-center justify-between px-4 py-1.5">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-gold" />
            البوابة الإلكترونية الرسمية
          </span>
          <span className="hidden sm:inline text-gold">جامعة إقليم سبأ — كلية تكنولوجيا المعلومات وعلوم الحاسوب</span>
        </div>
      </div>

      {/* Main row */}
      <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
        {/* Branding: dual logos */}
        <Link to="/" className="flex items-center gap-3 group min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="grid h-12 w-12 lg:h-14 lg:w-14 place-items-center rounded-lg bg-white p-1 shadow-card ring-1 ring-gold/30">
              <img src={universityLogo.url} alt="شعار جامعة إقليم سبأ" className="h-full w-full object-contain" />
            </div>
            <div className="h-10 w-px bg-border" />
            <div className="grid h-12 w-12 lg:h-14 lg:w-14 place-items-center rounded-lg bg-white p-1 shadow-card ring-1 ring-gold/30">
              <img src={collegeLogo} alt="شعار كلية تكنولوجيا المعلومات وعلوم الحاسوب" className="h-full w-full object-contain" />
            </div>
          </div>
          <div className="leading-tight hidden md:block min-w-0">
            <div className="font-display font-extrabold text-primary text-sm lg:text-base">البوابة الإلكترونية</div>
            <div className="text-[11px] lg:text-xs text-muted-foreground truncate">كلية تكنولوجيا المعلومات وعلوم الحاسوب</div>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden 2xl:flex items-center gap-0.5">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="relative px-2.5 py-2 text-[13px] font-semibold text-foreground/75 rounded-md transition-colors hover:text-primary"
              activeProps={{ className: "relative px-2.5 py-2 text-[13px] font-semibold rounded-md text-primary after:absolute after:left-2.5 after:right-2.5 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-gold-gradient" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Portal buttons — desktop */}
        <div className="hidden lg:flex items-center gap-1.5">
          {portalButtons.map(({ label, Icon, tone }) => (
            <Link
              key={label}
              to="/portal-login"
              className={
                tone === "gold"
                  ? "inline-flex items-center gap-1.5 rounded-md bg-gold-gradient px-3.5 py-2 text-[12px] font-extrabold text-primary-deep transition-all hover:-translate-y-0.5 shadow-gold"
                  : "inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-secondary px-3.5 py-2 text-[12px] font-bold text-primary transition-all hover:border-gold/50 hover:text-primary-deep"
              }
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </Link>
          ))}
        </div>

        {/* Mobile toggle */}
        <button
          className="lg:hidden p-2 text-primary"
          onClick={() => setOpen(!open)}
          aria-label="القائمة"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Secondary nav row for tablet/intermediate widths */}
      <div className="hidden lg:block 2xl:hidden border-t border-border/40 bg-surface/50">
        <nav className="container mx-auto flex items-center gap-0.5 overflow-x-auto px-4 py-1.5">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="whitespace-nowrap px-3 py-1.5 text-[12px] font-semibold text-foreground/70 rounded-md transition-colors hover:text-primary"
              activeProps={{ className: "whitespace-nowrap px-3 py-1.5 text-[12px] font-semibold rounded-md text-primary bg-secondary" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden border-t border-border bg-background">
          <nav className="container mx-auto flex flex-col px-4 py-3">
            <div className="grid grid-cols-1 gap-2 pb-3 border-b border-border">
              {portalButtons.map(({ label, Icon, tone }) => (
                <Link
                  key={label}
                  to="/portal-login"
                  onClick={() => setOpen(false)}
                  className={
                    tone === "gold"
                      ? "inline-flex items-center justify-center gap-2 rounded-md bg-gold-gradient px-5 py-3 text-sm font-extrabold text-primary-deep shadow-gold"
                      : "inline-flex items-center justify-center gap-2 rounded-md border border-primary/20 bg-secondary px-5 py-3 text-sm font-bold text-primary"
                  }
                >
                  <Icon className="h-4 w-4" /> {label}
                </Link>
              ))}
            </div>
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="py-3 text-base font-semibold text-foreground/80 border-b border-border last:border-0"
                activeProps={{ className: "py-3 text-base font-semibold text-primary border-b border-border last:border-0" }}
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
