import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X, GraduationCap } from "lucide-react";
import collegeLogo from "@/assets/college-logo.jpg";

const navItems = [
  { to: "/", label: "الرئيسية" },
  { to: "/about", label: "عن الكلية" },
  { to: "/departments", label: "البرامج" },
  { to: "/faculty", label: "هيئة التدريس" },
  { to: "/news", label: "الأخبار" },
  { to: "/events", label: "الفعاليات" },
  { to: "/research", label: "الأبحاث" },
  { to: "/contact", label: "اتصل بنا" },
] as const;

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-lg">
      <div className="bg-primary-deep text-primary-foreground/90 text-xs">
        <div className="container mx-auto flex items-center justify-between px-4 py-1.5">
          <span>جامعة إقليم سبأ — اليمن</span>
          <span className="hidden sm:inline text-gold">بوابة كلية تكنولوجيا المعلومات وعلوم الحاسوب</span>
        </div>
      </div>

      <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-4">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="grid h-14 w-14 place-items-center rounded-lg bg-white p-1 shadow-elegant ring-1 ring-gold/40">
            <img src={collegeLogo} alt="شعار الكلية" className="h-full w-full object-contain" />
          </div>
          <div className="leading-tight">
            <div className="font-display font-extrabold text-primary text-base lg:text-lg">كلية تكنولوجيا المعلومات</div>
            <div className="text-xs text-muted-foreground">وعلوم الحاسوب — جامعة إقليم سبأ</div>
          </div>
        </Link>

        <nav className="hidden xl:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="relative px-3 py-2 text-sm font-semibold text-foreground/75 rounded-md transition-colors hover:text-primary after:absolute after:left-3 after:right-3 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-transparent"
              activeProps={{ className: "relative px-3 py-2 text-sm font-semibold rounded-md text-primary after:absolute after:left-3 after:right-3 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-gold-gradient" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:block">
          <Link
            to="/portal-login"
            className="inline-flex items-center gap-2 rounded-md bg-gold-gradient px-5 py-2.5 text-sm font-extrabold text-primary-deep transition-all hover:-translate-y-0.5 shadow-gold"
          >
            <GraduationCap className="h-4 w-4" /> بوابة الطالب
          </Link>
        </div>

        <button
          className="xl:hidden p-2 text-primary"
          onClick={() => setOpen(!open)}
          aria-label="القائمة"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="xl:hidden border-t border-border bg-background">
          <nav className="container mx-auto flex flex-col px-4 py-3">
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
            <Link
              to="/portal-login"
              onClick={() => setOpen(false)}
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-md bg-gold-gradient px-5 py-3 text-sm font-extrabold text-primary-deep shadow-gold"
            >
              <GraduationCap className="h-4 w-4" /> بوابة الطالب
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
