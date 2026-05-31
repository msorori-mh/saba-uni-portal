import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Calendar, MapPin, Clock, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";
import { eventsQuery } from "@/lib/queries";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "الفعاليات والأنشطة — كلية تكنولوجيا المعلومات | جامعة إقليم سبأ" },
      { name: "description", content: "الفعاليات والأنشطة الأكاديمية والطلابية في كلية تكنولوجيا المعلومات وعلوم الحاسوب." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(eventsQuery()),
  component: EventsPage,
});

function EventsPage() {
  const { data: events = [] } = useQuery(eventsQuery());

  return (
    <>
      <PageHeader
        eyebrow="الأنشطة"
        title="الفعاليات والأنشطة"
        subtitle="ندوات، ورش عمل، ملتقيات، ومسابقات تنظمها الكلية على مدار العام الأكاديمي."
      />

      <section className="container mx-auto px-4 py-14">
        {events.length === 0 ? (
          <div className="text-center py-20">
            <Calendar className="mx-auto h-16 w-16 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">لا توجد فعاليات منشورة حاليًا.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {events.map((e) => {
              const d = new Date(e.event_date);
              return (
                <article key={e.id} className="grid gap-6 md:grid-cols-[180px_1fr] rounded-2xl border border-border bg-card overflow-hidden shadow-card hover:shadow-elegant hover:border-gold/40 transition-all">
                  <div className="bg-hero-gradient text-primary-foreground p-6 flex flex-col items-center justify-center text-center">
                    <div className="text-xs font-bold tracking-widest text-gold uppercase">{d.toLocaleDateString("ar-EG", { month: "long" })}</div>
                    <div className="font-display text-5xl font-extrabold mt-1">{d.getDate()}</div>
                    <div className="text-sm text-primary-foreground/70 mt-1">{d.getFullYear()}</div>
                    {e.is_featured && <div className="mt-3 inline-block rounded-full bg-gold px-3 py-1 text-[10px] font-bold text-primary-deep">مميز</div>}
                  </div>
                  <div className="p-6 md:p-7">
                    <h2 className="font-display text-xl md:text-2xl font-extrabold text-primary">{e.title_ar}</h2>
                    {e.description_ar && <p className="mt-3 text-muted-foreground leading-7">{e.description_ar}</p>}
                    <div className="mt-5 flex flex-wrap gap-4 text-sm text-muted-foreground">
                      {e.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-gold" />{e.location}</span>}
                      {e.event_time && <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-gold" />{e.event_time.slice(0, 5)}</span>}
                    </div>
                    {e.registration_url && (
                      <a href={e.registration_url} target="_blank" rel="noreferrer"
                         className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary-deep">
                        سجل الآن <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
