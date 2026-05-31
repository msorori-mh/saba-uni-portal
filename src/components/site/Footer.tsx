import { Link } from "@tanstack/react-router";
import { Mail, Phone, MapPin, Facebook, Twitter, Youtube } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-primary-deep text-primary-foreground mt-20">
      <div className="container mx-auto grid gap-10 px-4 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="font-display text-2xl font-extrabold text-gold">كلية تكنولوجيا المعلومات وعلوم الحاسوب</div>
          <p className="mt-3 text-sm text-primary-foreground/70 leading-7 max-w-md">
            إحدى كليات جامعة إقليم سبأ، تسعى لإعداد جيل من المتخصصين في علوم الحاسوب والتقنية
            القادرين على المساهمة في بناء مجتمع المعرفة وخدمة الوطن.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <a href="#" className="grid h-10 w-10 place-items-center rounded-md bg-white/10 hover:bg-gold hover:text-primary-deep transition-colors"><Facebook className="h-4 w-4" /></a>
            <a href="#" className="grid h-10 w-10 place-items-center rounded-md bg-white/10 hover:bg-gold hover:text-primary-deep transition-colors"><Twitter className="h-4 w-4" /></a>
            <a href="#" className="grid h-10 w-10 place-items-center rounded-md bg-white/10 hover:bg-gold hover:text-primary-deep transition-colors"><Youtube className="h-4 w-4" /></a>
          </div>
        </div>

        <div>
          <div className="font-bold text-gold mb-4">روابط سريعة</div>
          <ul className="space-y-2 text-sm text-primary-foreground/75">
            <li><Link to="/about" className="hover:text-gold">عن الكلية</Link></li>
            <li><Link to="/departments" className="hover:text-gold">الأقسام الأكاديمية</Link></li>
            <li><Link to="/news" className="hover:text-gold">الأخبار والفعاليات</Link></li>
            <li><Link to="/contact" className="hover:text-gold">تواصل معنا</Link></li>
          </ul>
        </div>

        <div>
          <div className="font-bold text-gold mb-4">اتصل بنا</div>
          <ul className="space-y-3 text-sm text-primary-foreground/75">
            <li className="flex items-start gap-2"><MapPin className="h-4 w-4 mt-0.5 text-gold shrink-0" /><span>مأرب، الجمهورية اليمنية</span></li>
            <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-gold shrink-0" /><span>+967 1 234 5678</span></li>
            <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-gold shrink-0" /><span>it@usr.edu.ye</span></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-4 text-xs text-primary-foreground/55">
          <div>© {new Date().getFullYear()} جامعة إقليم سبأ — جميع الحقوق محفوظة</div>
          <div>كلية تكنولوجيا المعلومات وعلوم الحاسوب</div>
        </div>
      </div>
    </footer>
  );
}
