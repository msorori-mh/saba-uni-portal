import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpDown, Brain, Cpu, Database, GraduationCap, Search, Shield } from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";
import { programsQuery } from "@/lib/queries";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/departments")({
  head: () => ({
    meta: [
      { title: "الأقسام والبرامج — كلية تكنولوجيا المعلومات" },
      { name: "description", content: "الأقسام والبرامج الأكاديمية الأربعة في كلية تكنولوجيا المعلومات وعلوم الحاسوب: علوم الحاسوب، نظم المعلومات الحاسوبية، الأمن السيبراني، والذكاء الاصطناعي." },
      { property: "og:title", content: "الأقسام والبرامج الدراسية" },
      { property: "og:url", content: "/departments" },
    ],
    links: [{ rel: "canonical", href: "/departments" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(programsQuery),
  component: DepartmentsPage,
});

const ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  computer: Cpu,
  database: Database,
  shield: Shield,
  brain: Brain,
};

// Per-program visual + meta hints (image gradient + degree/duration)
const PROGRAM_META: Record<string, { gradient: string; degree: string; years: number }> = {
  CS:  { gradient: "from-primary via-primary-deep to-[hsl(220_70%_18%)]", degree: "بكالوريوس", years: 4 },
  IT:  { gradient: "from-[hsl(200_60%_28%)] via-primary to-primary-deep", degree: "بكالوريوس", years: 4 },
  CIS: { gradient: "from-[hsl(195_70%_30%)] via-primary to-primary-deep", degree: "بكالوريوس", years: 4 },
  CYB: { gradient: "from-[hsl(220_50%_20%)] via-[hsl(220_60%_25%)] to-primary-deep", degree: "بكالوريوس", years: 4 },
  AI:  { gradient: "from-[hsl(260_50%_30%)] via-primary to-primary-deep", degree: "بكالوريوس", years: 4 },
  MCS: { gradient: "from-[hsl(240_55%_25%)] via-primary to-primary-deep", degree: "ماجستير", years: 2 },
  MIT: { gradient: "from-[hsl(180_55%_25%)] via-primary to-primary-deep", degree: "ماجستير", years: 2 },
};

const STATUS_LABEL: Record<string, { label: string; tone: "active" | "warn" | "muted" }> = {
  active: { label: "فعّال", tone: "active" },
  launching_2026_2027: { label: "قيد التدشين 2026-2027", tone: "warn" },
  under_review: { label: "قيد التحديث", tone: "muted" },
};

function StatusBadge({ status }: { status?: string | null }) {
  const meta = STATUS_LABEL[status ?? "active"] ?? STATUS_LABEL.active;
  const cls =
    meta.tone === "active"
      ? "bg-emerald-500/15 text-emerald-700 border border-emerald-600/30 dark:text-emerald-300"
      : meta.tone === "warn"
      ? "bg-amber-500/15 text-amber-700 border border-amber-600/30 dark:text-amber-300"
      : "bg-muted text-muted-foreground border border-border";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>{meta.label}</span>;
}

function DepartmentsPage() {
  // Suspense read: the loader already ensured this data, so server and client
  // render the same tree (no loading-skeleton hydration mismatch).
  const { data: programs } = useSuspenseQuery(programsQuery);
  const [query, setQuery] = useState("");
  const [sortAsc, setSortAsc] = useState(true);

  const list = programs ?? [];

  const filtered = useMemo(() => {
    const q = query.trim();
    const base = q
      ? list.filter((p) => p.name_ar.includes(q) || (p.name_en ?? "").toLowerCase().includes(q.toLowerCase()) || p.code.toLowerCase().includes(q.toLowerCase()))
      : list;
    return [...base].sort((a, b) => (sortAsc ? a.name_ar.localeCompare(b.name_ar, "ar") : b.name_ar.localeCompare(a.name_ar, "ar")));
  }, [list, query, sortAsc]);

  return (
    <>
      <PageHeader
        eyebrow="أكاديمي"
        title="الأقسام والبرامج الدراسية"
        subtitle="أربعة برامج متخصصة تغطي أحدث مجالات تكنولوجيا المعلومات وعلوم الحاسوب، تجمع بين الأساس النظري المتين والتطبيق العملي."
      />

      {/* Departments Grid */}
      <section className="container mx-auto px-4 py-16">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
          <div>
            <div className="text-xs font-bold tracking-widest text-gold uppercase">استكشف</div>
            <h2 className="mt-2 font-display text-3xl font-extrabold text-primary">الأقسام الأكاديمية</h2>
            <div className="divider-gold mt-3" />
          </div>
        </div>

        {list.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => {
              const Icon = ICONS[p.icon ?? ""] ?? GraduationCap;
              const meta = PROGRAM_META[p.code] ?? PROGRAM_META.CS;
              return (
                <article
                  key={p.id}
                  className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40"
                >
                  {/* Compact gradient strip with icon */}
                  <div className={`relative h-24 bg-gradient-to-br ${meta.gradient} px-4 flex items-center justify-between`}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,hsl(var(--gold)/0.25),transparent_55%)]" />
                    <div className="relative grid h-12 w-12 place-items-center rounded-xl bg-white/15 backdrop-blur-md text-primary-foreground ring-1 ring-white/20">
                      <Icon className="h-6 w-6" strokeWidth={2} />
                    </div>
                    <div className="relative flex flex-col items-end gap-1.5">
                      <Badge className="bg-gold text-primary-deep hover:bg-gold text-[10px] font-bold tracking-wide px-2 py-0.5">{p.code}</Badge>
                      <StatusBadge status={(p as any).status} />
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col p-4">
                    <h3 className="font-display text-lg font-extrabold text-primary leading-snug line-clamp-2">{p.name_ar}</h3>
                    {p.name_en && <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">{p.name_en}</div>}
                    <p className="mt-2 text-xs text-muted-foreground leading-6 line-clamp-3">{p.description_ar}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded-full bg-secondary px-2 py-0.5 font-bold text-primary">{p.degree_type || meta.degree}</span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 font-bold text-primary">{p.years ?? meta.years} سنوات</span>
                    </div>

                    <Link
                      to="/departments/$code"
                      params={{ code: p.code }}
                      className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md border-2 border-gold bg-transparent px-4 py-2 text-xs font-extrabold text-gold transition-all hover:bg-gold hover:text-primary-deep"
                    >
                      عرض التفاصيل <ArrowLeft className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

        )}
      </section>

      {/* Programs detail — Accordion */}
      {list.length > 0 && (
        <section className="bg-surface border-y border-border">
          <div className="container mx-auto px-4 py-16">
            <div className="max-w-2xl mb-8">
              <div className="text-xs font-bold tracking-widest text-gold uppercase">تفاصيل</div>
              <h2 className="mt-2 font-display text-3xl font-extrabold text-primary">نظرة على كل قسم</h2>
              <div className="divider-gold mt-3" />
              <p className="mt-4 text-muted-foreground leading-8">
                اضغط على أي قسم لعرض الوصف المختصر، شروط القبول، وأبرز فرص العمل.
              </p>
            </div>

            <Accordion type="single" collapsible className="max-w-4xl mx-auto space-y-3">
              {list.map((p) => {
                const Icon = ICONS[p.icon ?? ""] ?? GraduationCap;
                return (
                  <AccordionItem
                    key={p.id}
                    value={p.code}
                    className="rounded-xl border border-border bg-card px-5 shadow-card data-[state=open]:border-gold/40 data-[state=open]:shadow-elegant"
                  >
                    <AccordionTrigger className="py-5 hover:no-underline">
                      <div className="flex items-center gap-4 text-right">
                        <div className="grid h-11 w-11 place-items-center rounded-lg bg-secondary text-primary shrink-0">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-display text-lg font-extrabold text-primary">{p.name_ar}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{p.code} — {PROGRAM_META[p.code]?.degree ?? "بكالوريوس"}</div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-6 pt-2">
                      <div className="grid gap-5 md:grid-cols-2">
                        <div>
                          <h3 className="font-display font-bold text-primary mb-2">الوصف</h3>
                          <p className="text-sm text-muted-foreground leading-7">{p.description_ar}</p>
                        </div>
                        {p.admission_requirements && (
                          <div>
                            <h3 className="font-display font-bold text-primary mb-2">شروط القبول</h3>
                            <p className="text-sm text-muted-foreground leading-7 whitespace-pre-line">{p.admission_requirements}</p>
                          </div>
                        )}
                        {p.career_opportunities && (
                          <div className="md:col-span-2">
                            <h3 className="font-display font-bold text-primary mb-2">فرص العمل</h3>
                            <p className="text-sm text-muted-foreground leading-7 whitespace-pre-line">{p.career_opportunities}</p>
                          </div>
                        )}
                      </div>
                      <div className="mt-6">
                        <Link
                          to="/departments/$code"
                          params={{ code: p.code }}
                          className="inline-flex items-center gap-1 text-sm font-bold text-gold hover:underline"
                        >
                          عرض التفاصيل الكاملة والخطة الدراسية <ArrowLeft className="h-4 w-4" />
                        </Link>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        </section>
      )}

      {/* Programs Table */}
      {list.length > 0 && (
        <section className="container mx-auto px-4 py-16">
          <div className="max-w-2xl mb-8">
            <div className="text-xs font-bold tracking-widest text-gold uppercase">مقارنة</div>
            <h2 className="mt-2 font-display text-3xl font-extrabold text-primary">جدول البرامج</h2>
            <div className="divider-gold mt-3" />
          </div>

          <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
            <div className="border-b border-border p-4 bg-surface">
              <div className="relative max-w-sm">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث عن برنامج..."
                  className="pr-9"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface hover:bg-surface">
                    <TableHead className="text-right">
                      <button onClick={() => setSortAsc((s) => !s)} className="inline-flex items-center gap-1 font-bold text-primary hover:text-gold">
                        البرنامج <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right font-bold text-primary">الرمز</TableHead>
                    <TableHead className="text-right font-bold text-primary">الدرجة</TableHead>
                    <TableHead className="text-right font-bold text-primary">المدة</TableHead>
                    <TableHead className="text-right font-bold text-primary">الحالة</TableHead>
                    <TableHead className="text-right font-bold text-primary"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        لا توجد نتائج مطابقة.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((p) => {
                      const meta = PROGRAM_META[p.code] ?? PROGRAM_META.CS;
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-bold text-primary">{p.name_ar}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="border-gold text-gold">{p.code}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{p.degree_type || meta.degree}</TableCell>
                          <TableCell className="text-muted-foreground">{p.years ?? meta.years} سنوات</TableCell>
                          <TableCell><StatusBadge status={(p as any).status} /></TableCell>
                          <TableCell>
                            <Link
                              to="/departments/$code"
                              params={{ code: p.code }}
                              className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:text-gold"
                            >
                              التفاصيل <ArrowLeft className="h-3.5 w-3.5" />
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border p-16 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-secondary text-primary">
        <GraduationCap className="h-8 w-8" />
      </div>
      <h3 className="mt-5 font-display text-xl font-bold text-primary">لا توجد أقسام متاحة حاليًا</h3>
      <p className="mt-2 text-sm text-muted-foreground">سيتم نشر الأقسام والبرامج فور تفعيلها من قبل إدارة الكلية.</p>
    </div>
  );
}
