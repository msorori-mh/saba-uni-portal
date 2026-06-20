import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Calendar, ArrowRight, Share2, Link2, Check, Megaphone } from "lucide-react";
import { newsBySlugQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const CATEGORY_LABEL: Record<string, string> = {
  news: "أخبار",
  announcement: "إعلانات",
  event: "فعاليات",
};

export const Route = createFileRoute("/news/$slug")({
  head: ({ loaderData, params }) => {
    const data = loaderData as { title_ar?: string; excerpt_ar?: string; featured_image?: string; published_at?: string } | undefined;
    const title = data?.title_ar
      ? `${data.title_ar} — كلية تكنولوجيا المعلومات`
      : "خبر — كلية تكنولوجيا المعلومات";
    const description = data?.excerpt_ar ?? "خبر من كلية تكنولوجيا المعلومات وعلوم الحاسوب بجامعة إقليم سبأ.";
    const url = `https://quboolye.com/news/${params.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        ...(data?.featured_image ? [{ property: "og:image", content: data.featured_image } as const] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [{
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: data?.title_ar,
          description: data?.excerpt_ar,
          image: data?.featured_image,
          datePublished: data?.published_at,
          mainEntityOfPage: url,
          publisher: {
            "@type": "EducationalOrganization",
            name: "كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ",
          },
        }),
      }],
    };
  },
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(newsBySlugQuery(params.slug));
    if (!data) throw notFound();
    return data;
  },
  component: NewsDetailPage,
  notFoundComponent: () => (
    <div className="container mx-auto px-4 py-32 text-center">
      <Megaphone className="mx-auto h-16 w-16 text-muted-foreground/30" />
      <h1 className="mt-6 font-display text-2xl font-extrabold text-primary">
        الخبر غير موجود
      </h1>
      <p className="mt-2 text-muted-foreground">
        قد يكون الخبر قد تم حذفه أو نقله إلى أرشيف آخر.
      </p>
      <Button asChild className="mt-6">
        <Link to="/news">
          <ArrowRight className="h-4 w-4 ml-2" /> العودة إلى الأخبار
        </Link>
      </Button>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="container mx-auto px-4 py-32 text-center text-destructive">
      تعذّر تحميل الخبر: {error.message}
    </div>
  ),
});

function NewsDetailPage() {
  const { slug } = Route.useParams();
  const { data: item } = useSuspenseQuery(newsBySlugQuery(slug));
  const [copied, setCopied] = useState(false);

  if (!item) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  return (
    <article className="bg-background">
      {/* Hero */}
      <div className="relative h-72 md:h-96 bg-hero-gradient overflow-hidden">
        {item.featured_image && (
          <img
            src={item.featured_image}
            alt={item.title_ar}
            className="absolute inset-0 h-full w-full object-cover opacity-50"
          />
        )}
        <div className="absolute inset-0 bg-overlay-gradient" />
        <div className="relative container mx-auto px-4 h-full flex flex-col justify-end pb-8">
          <Link
            to="/news"
            className="inline-flex items-center gap-2 text-sm text-primary-foreground/80 hover:text-gold mb-4 w-fit"
          >
            <ArrowRight className="h-4 w-4" /> العودة إلى الأخبار
          </Link>
          <div className="flex items-center gap-3 mb-3">
            <Badge className="bg-gold text-primary-deep border-0">
              {CATEGORY_LABEL[item.category] ?? item.category}
            </Badge>
            <span className="inline-flex items-center gap-1.5 text-sm text-primary-foreground/80">
              <Calendar className="h-4 w-4" />
              {new Date(item.published_at).toLocaleDateString("ar-EG", {
                year: "numeric", month: "long", day: "numeric",
              })}
            </span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold text-primary-foreground leading-tight max-w-4xl">
            {item.title_ar}
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        {item.excerpt_ar && (
          <p className="font-display text-xl text-foreground/80 leading-relaxed border-r-4 border-gold pr-5 mb-8">
            {item.excerpt_ar}
          </p>
        )}

        {item.content_ar ? (
          <div className="prose prose-lg max-w-none text-foreground/85 leading-loose whitespace-pre-line">
            {item.content_ar}
          </div>
        ) : (
          <p className="text-muted-foreground">لا يوجد محتوى تفصيلي لهذا الخبر.</p>
        )}

        {/* Share */}
        <div className="mt-12 pt-6 border-t border-border flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-primary">
            <Share2 className="h-4 w-4" /> شارك الخبر:
          </span>
          <Button
            onClick={copyLink}
            variant="outline"
            size="sm"
            className="border-gold/40 hover:bg-gold/10"
          >
            {copied ? (
              <><Check className="h-3.5 w-3.5 ml-1.5" /> تم النسخ</>
            ) : (
              <><Link2 className="h-3.5 w-3.5 ml-1.5" /> نسخ الرابط</>
            )}
          </Button>
          <Button asChild variant="ghost" size="sm" className="mr-auto">
            <Link to="/news">
              <ArrowRight className="h-4 w-4 ml-1.5" /> العودة إلى الأخبار
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
