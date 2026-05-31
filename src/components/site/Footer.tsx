import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, MapPin, Facebook, Twitter, Youtube, Linkedin, GraduationCap } from "lucide-react";
import { settingsQuery } from "@/lib/queries";

export function Footer() {
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
  const address = s.contact_address || "مأرب، الجمهورية اليمنية";
  const universityName = s.university_name_ar || "جامعة إقليم سبأ";

  return (
    <footer className="bg-primary-deep text-primary-foreground mt-20 border-t-4 border-gold">
      <div className="container mx-auto grid gap-10 px-4 py-14 md:grid-cols-2 lg:grid-cols-4">
        {/* About */}
        <div>
          <div className="font-display text-xl font-extrabold text-gold mb-3">عن الكلية</div>
          <div className="divider-gold mb-4" />
          <p className="text-sm text-primary-foreground/70 leading-7">
            كلية تكنولوجيا المعلومات وعلوم الحاسوب — إحدى كليات جامعة إقليم سبأ، تسعى لإعداد كوادر متخصصة قادرة على المساهمة في بناء مجتمع المعرفة.
          </p>
        </div>

        {/* Quick Links */}
        <div>
          <div className="font-display text-xl font-extrabold text-gold mb-3">روابط سريعة</div>
          <div className="divider-gold mb-4" />
          <ul className="space-y-2 text-sm text-primary-foreground/75">
            <li><Link to="/" className="hover:text-gold transition-colors">الرئيسية</Link></li>
            <li><Link to="/about" className="hover:text-gold transition-colors">عن الكلية</Link></li>
            <li><Link to="/departments" className="hover:text-gold transition-colors">الأقسام والبرامج</Link></li>
            <li><Link to="/faculty" className="hover:text-gold transition-colors">هيئة التدريس</Link></li>
            <li><Link to="/research" className="hover:text-gold transition-colors">الأبحاث العلمية</Link></li>
            <li><Link to="/news" className="hover:text-gold transition-colors">الأخبار والفعاليات</Link></li>
          </ul>
        </div>

        {/* Contact */}
        <div>
          <div className="font-display text-xl font-extrabold text-gold mb-3">تواصل معنا</div>
          <div className="divider-gold mb-4" />
          <ul className="space-y-3 text-sm text-primary-foreground/75">
            <li className="flex items-start gap-2"><MapPin className="h-4 w-4 mt-0.5 text-gold shrink-0" /><span>{address}</span></li>
            {phone && (
              <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-gold shrink-0" /><span dir="ltr">{phone}</span></li>
            )}
            {email && (
              <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-gold shrink-0" /><span dir="ltr">{email}</span></li>
            )}
            <li className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-gold shrink-0" /><span>{universityName}</span></li>
          </ul>
        </div>

        {/* Social — only render if real verified links exist */}
        <div>
          <div className="font-display text-xl font-extrabold text-gold mb-3">تابعنا</div>
          <div className="divider-gold mb-4" />
          {socials.length > 0 ? (
            <>
              <p className="text-sm text-primary-foreground/70 leading-7 mb-4">
                تابع آخر أخبار الكلية وفعالياتها عبر منصات التواصل الاجتماعي.
              </p>
              <div className="flex items-center gap-3">
                {socials.map(({ key, Icon, label }) => (
                  <a
                    key={key}
                    href={s[key]}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={label}
                    className="grid h-10 w-10 place-items-center rounded-md bg-white/10 hover:bg-gold hover:text-primary-deep transition-colors"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-primary-foreground/60 leading-7">
              سيتم نشر روابط حسابات الكلية على منصات التواصل الاجتماعي قريباً.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-gold/30">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-4 text-xs text-primary-foreground/60">
          <div>{universityName} — كلية تكنولوجيا المعلومات © {new Date().getFullYear()}</div>
          <div className="text-gold/80">جميع الحقوق محفوظة</div>
        </div>
      </div>
    </footer>
  );
}
