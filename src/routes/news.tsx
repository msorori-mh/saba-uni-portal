import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/site/PageHeader";
import { Calendar } from "lucide-react";
import { newsQuery } from "@/lib/queries";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "الأخبار والفعاليات — كلية تكنولوجيا المعلومات | جامعة إقليم سبأ" },
      { name: "description", content: "آخر الأخبار والفعاليات والإعلانات في كلية تكنولوجيا المعلومات وعلوم الحاسوب." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(newsQuery()),
  component: NewsPage,
});

function NewsPage() {
  const { data: news } = useSuspenseQuery(newsQuery());

  return (
    <>
      <PageHeader
        eyebrow="الإعلام"
        title="الأخبار والفعاليات"
        subtitle="تابع آخر مستجدات الكلية من إعلانات، فعاليات أكاديمية، ورش تدريبية، وأخبار طلابية."
      />

      <section className="container mx-auto px-4 py-16">
        {news.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-16 text-center text-muted-foreground">
            لا توجد أخبار منشورة حاليًا.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {news.map((n) => (
              <article key={n.id} className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40">
                <div className="relative h-44 bg-hero-gradient flex items-end p-5 overflow-hidden">
                  {n.featured_image && (
                    <img src={n.featured_image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" loading="lazy" />
                  )}
                  <div className="absolute inset-0 bg-overlay-gradient opacity-40" />
                  <div className="relative">
                    <span className="inline-block rounded-full bg-gold px-3 py-1 text-xs font-bold text-primary-deep">{n.category}</span>
                  </div>
                </div>
                <div className="flex-1 p-6 flex flex-col">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" /> {new Date(n.published_at).toLocaleDateString("ar-EG")}
                  </div>
                  <h2 className="mt-3 font-display text-lg font-bold text-primary leading-7 line-clamp-2">{n.title_ar}</h2>
                  <p className="mt-3 text-sm text-muted-foreground leading-7 line-clamp-3">{n.excerpt_ar}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
