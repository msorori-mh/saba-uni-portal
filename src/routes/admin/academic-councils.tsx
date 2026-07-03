import { createFileRoute } from "@tanstack/react-router";
import {
  ScrollText, Users2, CalendarClock, FilePlus2, ListChecks, FileText,
  ClipboardCheck, Archive, Bell, Info,
} from "lucide-react";

export const Route = createFileRoute("/admin/academic-councils")({
  head: () => ({
    meta: [
      { title: "بوابة إدارة المجالس الأكاديمية — قيد التأسيس" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AcademicCouncilsFoundationPage,
});

const SECTIONS: { icon: typeof ScrollText; title: string; desc: string }[] = [
  { icon: Users2, title: "مجلس الكلية", desc: "إدارة أعضاء مجلس الكلية وجلساته الدورية." },
  { icon: Users2, title: "مجالس الأقسام", desc: "متابعة مجالس الأقسام الأكاديمية داخل الكلية." },
  { icon: CalendarClock, title: "الاجتماعات القادمة", desc: "جدولة الاجتماعات وإرسال الدعوات للأعضاء." },
  { icon: FilePlus2, title: "رفع موضوع جديد", desc: "استقبال الموضوعات المقترحة للإدراج في جدول الأعمال." },
  { icon: ListChecks, title: "جدول الأعمال", desc: "إعداد وترتيب بنود جدول الأعمال لكل اجتماع." },
  { icon: FileText, title: "المحاضر والقرارات", desc: "توثيق المحاضر واعتماد القرارات رسمياً." },
  { icon: ClipboardCheck, title: "متابعة تنفيذ القرارات", desc: "تتبع حالة تنفيذ التوصيات والقرارات." },
  { icon: Archive, title: "الأرشيف", desc: "أرشفة أعمال المجالس السابقة للرجوع إليها." },
  { icon: Bell, title: "إعدادات الجدولة والتنبيهات", desc: "ضبط مواعيد التنبيهات والتذكيرات الآلية." },
];

function AcademicCouncilsFoundationPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-gold-gradient text-primary-deep shrink-0">
          <ScrollText className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-primary">
            بوابة إدارة المجالس الأكاديمية
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-3xl leading-relaxed">
            بوابة رقمية متخصصة لإدارة مجالس الكلية ومجالس الأقسام، تشمل جدولة الاجتماعات،
            استقبال الموضوعات، إعداد جداول الأعمال، توثيق المحاضر والقرارات، متابعة تنفيذ
            التوصيات، وأرشفة أعمال المجالس وفق صلاحيات مؤسسية دقيقة.
          </p>
        </div>
      </div>

      <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4 flex items-start gap-3 text-amber-900">
        <Info className="h-5 w-5 shrink-0 mt-0.5 text-amber-700" />
        <div className="text-sm">
          <div className="font-bold">ملاحظة داخلية</div>
          <div className="mt-0.5">
            هذه البوابة قيد التأسيس ولا تستخدم حالياً بيانات حقيقية. جميع الأقسام أدناه
            معروضة كتصميم أولي فقط لأغراض العرض على مجلس الجامعة.
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <div
            key={s.title}
            className="rounded-xl border border-border bg-card p-4 shadow-card opacity-90"
            aria-disabled="true"
          >
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary shrink-0">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-primary truncate">{s.title}</div>
                <div className="mt-0.5 text-[11px] font-bold text-muted-foreground">
                  قريباً
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
        سيتم تفعيل الوظائف التشغيلية للبوابة في مراحل لاحقة بعد اعتماد التصميم التفصيلي والصلاحيات.
      </div>
    </div>
  );
}
