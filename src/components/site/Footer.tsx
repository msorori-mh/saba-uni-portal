import { Link, useHydrated } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, MapPin, Facebook, Twitter, Youtube, Linkedin, GraduationCap, BookOpen, Briefcase, ShieldCheck } from "lucide-react";
import { settingsQuery } from "@/lib/queries";
import universityLogo from "@/assets/university-logo.jpeg.asset.json";

export function Footer() {
  const hydrated = useHydrated();
  const { data: s = {} } = useQuery(settingsQuery);


  const socials = [
    { key: "facebook_url", Icon: Facebook, label: "Facebook" },
    { key: "twitter_url", Icon: Twitter, label: "Twitter" },
    { key: "youtube_url", Icon: Youtube, label: "YouTube" },
    { key: "linkedin_url", Icon: Linkedin, label: "LinkedIn" },
  ].filter((x) => {
    const v = (s[x.key] ?? "").trim();
    return v.length > 0 && /^https?:\/\//i.test(v);
  });

  const phone = s.contact_phone || "";
  const email = s.contact_email || "";
  const address = s.contact_address || "";
  const universityName = (hydrated && s.university_name_ar) || "جامعة إقليم سبأ";

  return (
    <footer className="bg-primary-deep text-primary-foreground mt-20 border-t-4 border-gold">
      <div className="container mx-auto grid gap-10 px-4 py-14 md:grid-cols-2 lg:grid-cols-4">
        {/* About */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-white p-1 shadow-elegant ring-1 ring-gold/40">
              <img src={universityLogo.url} alt="شعار الجامعة" className="h-full w-full object-contain" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-base font-extrabold text-gold">{universityName}</div>
              <div className="text-[11px] text-primary-foreground/70">كلية تكنولوجيا المعلومات وعلوم الحاسوب</div>
            </div>
          </div>
          <div className="divider-gold mb-4" />
          <p className="text-sm text-primary-foreground/70 leading-7">
            البوابة الإلكترونية الرسمية للكلية — منصة رقمية متكاملة للخدمات الأكاديمية والإدارية للطلاب وأعضاء هيئة التدريس والموظفين.
          </p>
        </div>

        {/* Portals */}
        <div>
          <div className="font-display text-xl font-extrabold text-gold mb-3">البوابات الإلكترونية</div>
          <div className="divider-gold mb-4" />
          <ul className="space-y-2.5 text-sm text-primary-foreground/80">
            <li>
              <Link to="/portal-login" search={{ type: "student" }} className="inline-flex items-center gap-2 hover:text-gold transition-colors">
                <GraduationCap className="h-4 w-4 text-gold" /> بوابة الطالب
              </Link>
            </li>
            <li>
              <Link to="/portal-login" search={{ type: "faculty" }} className="inline-flex items-center gap-2 hover:text-gold transition-colors">
                <BookOpen className="h-4 w-4 text-gold" /> بوابة أعضاء هيئة التدريس
              </Link>
            </li>
            <li>
              <Link to="/portal-login" search={{ type: "staff" }} className="inline-flex items-center gap-2 hover:text-gold transition-colors">
                <Briefcase className="h-4 w-4 text-gold" /> بوابة الموظفين
              </Link>
            </li>
            <li>
              <Link to="/admin" className="inline-flex items-center gap-2 hover:text-gold transition-colors">
                <ShieldCheck className="h-4 w-4 text-gold" /> لوحة الإدارة
              </Link>
            </li>
          </ul>
        </div>

        {/* Quick links */}
        <div>
          <div className="font-display text-xl font-extrabold text-gold mb-3">روابط سريعة</div>
          <div className="divider-gold mb-4" />
          <ul className="space-y-2 text-sm text-primary-foreground/75">
            <li><Link to="/about" className="hover:text-gold transition-colors">عن الكلية</Link></li>
            <li><Link to="/departments" className="hover:text-gold transition-colors">البرامج الأكاديمية</Link></li>
            <li><Link to="/faculty" className="hover:text-gold transition-colors">هيئة التدريس</Link></li>
            <li><Link to="/news" className="hover:text-gold transition-colors">الأخبار</Link></li>
            <li><Link to="/events" className="hover:text-gold transition-colors">الفعاليات</Link></li>
            <li><Link to="/research" className="hover:text-gold transition-colors">الأبحاث</Link></li>
            <li><Link to="/verify-document" className="hover:text-gold transition-colors">التحقق من وثيقة</Link></li>
          </ul>
        </div>

        {/* Contact */}
        <div>
          <div className="font-display text-xl font-extrabold text-gold mb-3">تواصل معنا</div>
          <div className="divider-gold mb-4" />
          <ul className="space-y-3 text-sm text-primary-foreground/75">
            {hydrated && address && (
              <li className="flex items-start gap-2"><MapPin className="h-4 w-4 mt-0.5 text-gold shrink-0" /><span>{address}</span></li>
            )}
            {hydrated && phone && (
              <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-gold shrink-0" /><span dir="ltr">{phone}</span></li>
            )}
            {hydrated && email && (
              <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-gold shrink-0" /><span dir="ltr">{email}</span></li>
            )}
            <li className="pt-2">
              <Link to="/contact" className="inline-flex items-center gap-2 rounded-md bg-white/10 hover:bg-gold hover:text-primary-deep transition-colors px-3 py-2 text-xs font-bold">
                صفحة التواصل
              </Link>
            </li>
          </ul>

          {hydrated && socials.length > 0 && (
            <div className="mt-5">
              <div className="text-xs font-bold text-gold mb-2">تابعنا</div>
              <div className="flex items-center gap-2">
                {socials.map(({ key, Icon, label }) => (
                  <a
                    key={key}
                    href={s[key]}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={label}
                    className="grid h-9 w-9 place-items-center rounded-md bg-white/10 hover:bg-gold hover:text-primary-deep transition-colors"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gold/30">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-4 text-xs text-primary-foreground/60">
          <div>{universityName} — كلية تكنولوجيا المعلومات وعلوم الحاسوب © {new Date().getFullYear()}</div>
          <div className="flex items-center gap-3 text-gold/80">
            <a href="/privacy" className="hover:text-gold transition-colors">سياسة الخصوصية</a>
            <span aria-hidden="true">·</span>
            <span>جميع الحقوق محفوظة</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
