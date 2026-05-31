import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/site/PageHeader";
import { Calendar, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "الأخبار والفعاليات — كلية تكنولوجيا المعلومات | جامعة إقليم سبأ" },
      { name: "description", content: "آخر الأخبار والفعاليات والإعلانات في كلية تكنولوجيا المعلومات وعلوم الحاسوب." },
    ],
  }),
  component: NewsPage,
});

const news = [
  { tag: "إعلان", date: "2026-05-20", title: "فتح باب التقديم للفصل الدراسي الأول 2026/2027", excerpt: "تعلن عمادة الكلية عن فتح باب التسجيل للطلاب الجدد في جميع الأقسام، وتستمر فترة التقديم حتى نهاية شهر يوليو." },
  { tag: "فعالية", date: "2026-05-10", title: "ندوة حول مستقبل الذكاء الاصطناعي وتطبيقاته", excerpt: "نظّم قسم الذكاء الاصطناعي ندوة علمية بحضور نخبة من الأساتذة والباحثين لمناقشة آفاق التطور في هذا المجال." },
  { tag: "تكريم", date: "2026-04-28", title: "الكلية تكرم الطلاب المتفوقين للعام الأكاديمي 2025", excerpt: "احتفلت الكلية بتكريم الطلاب المتفوقين في مختلف الأقسام، تقديرًا لجهودهم وتميزهم الأكاديمي خلال العام المنصرم." },
  { tag: "أخبار", date: "2026-04-15", title: "توقيع اتفاقية تعاون مع شركة تقنية رائدة", excerpt: "وقّعت الكلية مذكرة تفاهم مع إحدى الشركات التقنية لتدريب الطلاب وتأهيلهم لمتطلبات سوق العمل." },
  { tag: "ورشة", date: "2026-03-30", title: "ورشة تدريبية في الأمن السيبراني واختبار الاختراق", excerpt: "أقام قسم الأمن السيبراني ورشة عمل تدريبية للطلاب حول أحدث تقنيات اختبار الاختراق وتقييم المخاطر." },
  { tag: "مسابقة", date: "2026-03-15", title: "انطلاق مسابقة البرمجة السنوية للطلاب", excerpt: "أُطلقت النسخة الخامسة من مسابقة البرمجة السنوية بمشاركة طلاب من مختلف الأقسام الأكاديمية." },
];

function NewsPage() {
  return (
    <>
      <PageHeader
        eyebrow="الإعلام"
        title="الأخبار والفعاليات"
        subtitle="تابع آخر مستجدات الكلية من إعلانات، فعاليات أكاديمية، ورش تدريبية، وأخبار طلابية."
      />

      <section className="container mx-auto px-4 py-16">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {news.map((n) => (
            <article key={n.title} className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40">
              <div className="relative h-44 bg-hero-gradient flex items-end p-5">
                <div className="absolute inset-0 bg-overlay-gradient opacity-40" />
                <div className="relative">
                  <span className="inline-block rounded-full bg-gold px-3 py-1 text-xs font-bold text-primary-deep">{n.tag}</span>
                </div>
              </div>
              <div className="flex-1 p-6 flex flex-col">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" /> {n.date}
                </div>
                <h2 className="mt-3 font-display text-lg font-bold text-primary leading-7 line-clamp-2">{n.title}</h2>
                <p className="mt-3 text-sm text-muted-foreground leading-7 line-clamp-3">{n.excerpt}</p>
                <Link to="/news" className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-primary group-hover:text-gold transition-colors">
                  اقرأ المزيد <ArrowLeft className="h-4 w-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
