import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Calendar,
  MapPin,
  Clock,
  ExternalLink,
  ArrowLeft,
  ChevronDown,
  Newspaper,
  Megaphone,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";
import { newsQuery, eventsQuery } from "@/lib/queries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const PAGE_SIZE = 6;

const CATEGORY_LABEL: Record<string, string> = {
  all: "الكل",
  news: "أخبار",
  announcement: "إعلانات",
  event: "فعاليات",
};

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "الأخبار والفعاليات — كلية تكنولوجيا المعلومات | جامعة إقليم سبأ" },
      {
        name: "description",
        content:
          "آخر الأخبار والإعلانات والفعاليات في كلية تكنولوجيا المعلومات وعلوم الحاسوب.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(newsQuery());
    context.queryClient.ensureQueryData(eventsQuery());
  },
  component: NewsEventsPage,
});

function NewsEventsPage() {
  return (
    <>
      <PageHeader
        eyebrow="الإعلام والأنشطة"
        title="الأخبار والفعاليات"
        subtitle="تابع آخر مستجدات الكلية من إعلانات، أخبار، فعاليات، وورش تدريبية."
      />

      <section className="container mx-auto px-4 py-12">
        <Tabs defaultValue="news" className="w-full">
          <TabsList className="mx-auto mb-10 grid w-full max-w-md grid-cols-2 h-12 p-1 bg-secondary">
            <TabsTrigger value="news" className="text-base font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Newspaper className="h-4 w-4 ml-2" /> الأخبار
            </TabsTrigger>
            <TabsTrigger value="events" className="text-base font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Calendar className="h-4 w-4 ml-2" /> الفعاليات والأنشطة
            </TabsTrigger>
          </TabsList>

          <TabsContent value="news"><NewsTab /></TabsContent>
          <TabsContent value="events"><EventsTab /></TabsContent>
        </Tabs>
      </section>
    </>
  );
}

// =================== NEWS TAB ===================

function NewsTab() {
  const { data: news = [], isLoading } = useQuery(newsQuery());
  const [category, setCategory] = useState<string>("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return category === "all" ? news : news.filter((n) => n.category === category);
  }, [news, category]);

  const featured = filtered[0];
  const rest = filtered.slice(1);
  const totalPages = Math.max(1, Math.ceil(rest.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = rest.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-72 rounded-2xl" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (news.length === 0) {
    return (
      <EmptyState
        icon={Newspaper}
        message="لا توجد أخبار منشورة حالياً."
      />
    );
  }

  return (
    <div>
      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-8 justify-center">
        {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setCategory(key); setPage(1); }}
            className={`px-5 py-2 rounded-full text-sm font-bold transition-colors ${
              category === key
                ? "bg-primary text-primary-foreground shadow-card"
                : "bg-secondary text-foreground/70 hover:bg-secondary/70"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Newspaper} message="لا توجد أخبار في هذه الفئة." />
      ) : (
        <>
          {/* Featured */}
          {featured && <FeaturedNewsCard item={featured} />}

          {/* Grid */}
          {paged.length > 0 && (
            <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {paged.map((n) => <NewsCard key={n.id} item={n} />)}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-10 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronRight className="h-4 w-4" /> السابق
              </Button>
              <span className="text-sm text-muted-foreground px-3">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                التالي <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FeaturedNewsCard({ item }: { item: any }) {
  const hasImage = !!item.featured_image;
  return (
    <Link
      to="/news/$slug"
      params={{ slug: item.slug }}
      className={`group grid gap-0 rounded-2xl border border-border bg-card overflow-hidden shadow-card hover:shadow-elegant transition-all border-t-4 border-t-primary ${
        hasImage ? "md:grid-cols-2" : ""
      }`}
    >
      {hasImage && (
        <div className="relative h-52 md:h-auto bg-hero-gradient overflow-hidden">
          <img
            src={item.featured_image}
            alt={item.title_ar}
            className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <Badge className="absolute top-3 right-3 bg-gold text-primary-deep border-0">
            مميز
          </Badge>
        </div>
      )}
      <div className="p-6 md:p-7 flex flex-col justify-center">
        <div className="flex items-center gap-2 flex-wrap mb-2.5">
          <Badge className="bg-gold/15 text-gold border border-gold/30 hover:bg-gold/20 text-[10px] px-2 py-0">
            مميز
          </Badge>
          <Badge variant="outline" className="border-primary/40 text-primary text-[10px] px-2 py-0">
            {CATEGORY_LABEL[item.category] ?? item.category}
          </Badge>
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(item.published_at).toLocaleDateString("ar-EG")}
          </span>
        </div>
        <h2 className="font-display text-xl md:text-2xl font-extrabold text-primary leading-snug group-hover:text-gold transition-colors line-clamp-2">
          {item.title_ar}
        </h2>
        {item.excerpt_ar && (
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">
            {item.excerpt_ar}
          </p>
        )}
        <span className="mt-4 inline-flex items-center gap-1.5 text-gold font-bold text-xs">
          اقرأ المزيد <ArrowLeft className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}


function NewsCard({ item }: { item: any }) {
  const hasImage = !!item.featured_image;
  return (
    <Link
      to="/news/$slug"
      params={{ slug: item.slug }}
      className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-card hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40 transition-all border-t-4 border-t-primary/80"
    >
      {hasImage && (
        <div className="relative h-36 bg-hero-gradient overflow-hidden">
          <img
            src={item.featured_image}
            alt={item.title_ar}
            className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
          <Badge className="absolute top-2.5 right-2.5 bg-gold text-primary-deep border-0 text-[10px] px-2 py-0.5">
            {CATEGORY_LABEL[item.category] ?? item.category}
          </Badge>
        </div>
      )}
      <div className="flex-1 p-4 flex flex-col">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(item.published_at).toLocaleDateString("ar-EG")}
          </span>
          {!hasImage && (
            <Badge className="bg-gold/15 text-gold border border-gold/30 text-[10px] px-2 py-0">
              {CATEGORY_LABEL[item.category] ?? item.category}
            </Badge>
          )}
        </div>
        <h3 className="mt-2 font-display text-base font-bold text-primary leading-7 line-clamp-2 group-hover:text-gold transition-colors">
          {item.title_ar}
        </h3>
        {item.excerpt_ar && (
          <p className="mt-1.5 text-xs text-muted-foreground leading-6 line-clamp-3">
            {item.excerpt_ar}
          </p>
        )}
        <span className="mt-auto pt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-gold">
          اقرأ المزيد <ArrowLeft className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}


// =================== EVENTS TAB ===================

function EventsTab() {
  const { data: events = [], isLoading } = useQuery(eventsQuery());

  const { upcoming, past } = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const up: typeof events = [];
    const pa: typeof events = [];
    for (const e of events) {
      const d = new Date(e.event_date);
      if (d >= today) up.push(e);
      else pa.push(e);
    }
    up.sort((a, b) => +new Date(a.event_date) - +new Date(b.event_date));
    pa.sort((a, b) => +new Date(b.event_date) - +new Date(a.event_date));
    return { upcoming: up, past: pa };
  }, [events]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return <EmptyState icon={Calendar} message="لا توجد فعاليات منشورة حالياً." />;
  }

  return (
    <div>
      {upcoming.length > 0 && (
        <div>
          <h2 className="font-display text-xl font-extrabold text-primary mb-5">
            الفعاليات القادمة
          </h2>
          <div className="space-y-5">
            {upcoming.map((e) => <EventCard key={e.id} item={e} />)}
          </div>
        </div>
      )}

      {upcoming.length === 0 && (
        <div className="text-center py-10 mb-8 rounded-2xl border border-dashed border-border bg-card">
          <Calendar className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <p className="mt-3 text-muted-foreground">لا توجد فعاليات قادمة حالياً.</p>
        </div>
      )}

      {past.length > 0 && (
        <Collapsible className="mt-12">
          <CollapsibleTrigger className="w-full group flex items-center justify-between p-5 rounded-2xl border border-border bg-card hover:bg-secondary/40 transition-colors">
            <span className="font-display text-lg font-bold text-primary">
              أرشيف الفعاليات السابقة
              <span className="mr-2 text-sm text-muted-foreground font-normal">
                ({past.length})
              </span>
            </span>
            <ChevronDown className="h-5 w-5 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 mt-4">
            {past.map((e) => <EventCard key={e.id} item={e} isPast />)}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function EventCard({ item, isPast = false }: { item: any; isPast?: boolean }) {
  const d = new Date(item.event_date);
  return (
    <article
      className={`grid gap-0 grid-cols-[88px_1fr] md:grid-cols-[120px_1fr] rounded-xl border border-border bg-card overflow-hidden shadow-card hover:shadow-elegant hover:border-gold/40 transition-all ${
        isPast ? "opacity-75" : ""
      }`}
    >
      <div className="bg-hero-gradient text-primary-foreground p-3 flex flex-col items-center justify-center text-center">
        <div className="font-display text-2xl md:text-3xl font-extrabold text-gold leading-none">
          {d.getDate()}
        </div>
        <div className="text-[10px] font-bold tracking-wider text-gold/90 uppercase mt-0.5">
          {d.toLocaleDateString("ar-EG", { month: "short" })}
        </div>
        <div className="text-[10px] text-primary-foreground/70 mt-0.5">{d.getFullYear()}</div>
        {item.is_featured && !isPast && (
          <Badge className="mt-1.5 bg-gold text-primary-deep border-0 text-[9px] px-1.5 py-0">
            مميز
          </Badge>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-display text-base md:text-lg font-extrabold text-primary line-clamp-2 leading-snug">
          {item.title_ar}
        </h3>
        {item.description_ar && (
          <p className="mt-1.5 text-xs text-muted-foreground leading-6 line-clamp-2">
            {item.description_ar}
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {item.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3 text-gold" /> {item.location}
            </span>
          )}
          {item.event_time && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3 text-gold" /> {item.event_time.slice(0, 5)}
            </span>
          )}
        </div>
        {item.registration_url && !isPast && (
          <Button asChild size="sm" className="mt-3 h-7 text-xs bg-primary hover:bg-primary-deep">
            <a href={item.registration_url} target="_blank" rel="noreferrer">
              التفاصيل والتسجيل <ExternalLink className="h-3 w-3 mr-1" />
            </a>
          </Button>
        )}
      </div>
    </article>
  );
}


function EmptyState({
  icon: Icon,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>;
  message: string;
}) {
  return (
    <div className="text-center py-20 rounded-2xl border border-dashed border-border bg-card">
      <Icon className="mx-auto h-16 w-16 text-muted-foreground/30" />
      <p className="mt-4 text-muted-foreground">{message}</p>
    </div>
  );
}
