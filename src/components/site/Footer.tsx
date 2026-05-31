import { Link } from "@tanstack/react-router";
import { Mail, Phone, MapPin, Facebook, Twitter, Youtube, Linkedin, GraduationCap } from "lucide-react";

export function Footer() {
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
            <li className="flex items-start gap-2"><MapPin className="h-4 w-4 mt-0.5 text-gold shrink-0" /><span>مأرب، الجمهورية اليمنية</span></li>
            <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-gold shrink-0" /><span dir="ltr">+967 1 234 5678</span></li>
            <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-gold shrink-0" /><span>it@usr.edu.ye</span></li>
            <li className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-gold shrink-0" /><span>جامعة إقليم سبأ</span></li>
          </ul>
        </div>

        {/* Social */}
        <div>
          <div className="font-display text-xl font-extrabold text-gold mb-3">تابعنا</div>
          <div className="divider-gold mb-4" />
          <p className="text-sm text-primary-foreground/70 leading-7 mb-4">
            تابع آخر أخبار الكلية وفعالياتها عبر منصات التواصل الاجتماعي.
          </p>
          <div className="flex items-center gap-3">
            <a href="#" aria-label="Facebook" className="grid h-10 w-10 place-items-center rounded-md bg-white/10 hover:bg-gold hover:text-primary-deep transition-colors"><Facebook className="h-4 w-4" /></a>
            <a href="#" aria-label="Twitter" className="grid h-10 w-10 place-items-center rounded-md bg-white/10 hover:bg-gold hover:text-primary-deep transition-colors"><Twitter className="h-4 w-4" /></a>
            <a href="#" aria-label="YouTube" className="grid h-10 w-10 place-items-center rounded-md bg-white/10 hover:bg-gold hover:text-primary-deep transition-colors"><Youtube className="h-4 w-4" /></a>
            <a href="#" aria-label="LinkedIn" className="grid h-10 w-10 place-items-center rounded-md bg-white/10 hover:bg-gold hover:text-primary-deep transition-colors"><Linkedin className="h-4 w-4" /></a>
          </div>
        </div>
      </div>

      <div className="border-t border-gold/30">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-4 text-xs text-primary-foreground/60">
          <div>جامعة إقليم سبأ — كلية تكنولوجيا المعلومات © {new Date().getFullYear()}</div>
          <div className="text-gold/80">جميع الحقوق محفوظة</div>
        </div>
      </div>
    </footer>
  );
}
