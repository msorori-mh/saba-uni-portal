import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X, GraduationCap } from "lucide-react";

const navItems = [
  { to: "/", label: "الرئيسية" },
  { to: "/about", label: "عن الكلية" },
  { to: "/departments", label: "الأقسام" },
  { to: "/news", label: "الأخبار" },
  { to: "/contact", label: "اتصل بنا" },
] as const;

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-lg">
      {/* Top strip */}
      <div className="bg-primary-deep text-primary-foreground/90 text-xs">
        <div className="container mx-auto flex items-center justify-between px-4 py-1.5">
          <span>جامعة إقليم سبأ — اليمن</span>
          <span className="hidden sm:inline text-gold">بوابة كلية تكنولوجيا المعلومات وعلوم الحاسوب</span>
        </div>
      </div>

      <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-4">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-gold-gradient text-primary shadow-gold">
            <GraduationCap className="h-7 w-7" strokeWidth={2.4} />
          </div>
          <div className="leading-tight">
            <div className="font-display font-extrabold text-primary text-lg">كلية تكنولوجيا المعلومات</div>
            <div className="text-xs text-muted-foreground">وعلوم الحاسوب — جامعة إقليم سبأ</div>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="px-4 py-2 text-sm font-semibold text-foreground/75 rounded-md transition-colors hover:text-primary hover:bg-secondary"
              activeProps={{ className: "px-4 py-2 text-sm font-semibold rounded-md text-primary bg-secondary" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden lg:block">
          <a
            href="#"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:bg-primary-deep shadow-elegant"
          >
            بوابة الطالب
          </a>
        </div>

        <button
          className="lg:hidden p-2 text-primary"
          onClick={() => setOpen(!open)}
          aria-label="القائمة"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-border bg-background">
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
            <a href="#" className="mt-3 rounded-md bg-primary px-5 py-3 text-center text-sm font-bold text-primary-foreground">
              بوابة الطالب
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
