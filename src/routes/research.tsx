import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Search,
  FileText,
  Download,
  ExternalLink,
  BookOpen,
  Calendar,
  Users,
  Quote,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";
import { researchPapersQuery, facultyQuery, programsQuery } from "@/lib/queries";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 10;

type Paper = {
  id: string;
  title_ar: string;
  title_en: string | null;
  abstract_ar: string | null;
  authors: string;
  journal_name: string | null;
  publication_year: number;
  doi: string | null;
  pdf_url: string | null;
  external_url: string | null;
  keywords: string | null;
  citations_count: number;
  faculty_id: string | null;
  programs: { code: string; name_ar: string } | null;
};

export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: "الأبحاث العلمية — كلية تكنولوجيا المعلومات | جامعة إقليم سبأ" },
      {
        name: "description",
        content:
          "الإنتاج البحثي لأعضاء هيئة التدريس في كلية تكنولوجيا المعلومات وعلوم الحاسوب.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(researchPapersQuery);
    context.queryClient.ensureQueryData(facultyQuery);
    context.queryClient.ensureQueryData(programsQuery);
  },
  component: ResearchPage,
});

function ResearchPage() {
  const { data: papers = [], isLoading } = useQuery(researchPapersQuery);
  const { data: faculty = [] } = useQuery(facultyQuery);
  const { data: programs = [] } = useQuery(programsQuery);

  const [search, setSearch] = useState("");
  const [year, setYear] = useState("all");
  const [programCode, setProgramCode] = useState("all");
  const [facultyId, setFacultyId] = useState("all");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const facultyNames = useMemo(
    () =>
      new Map(
        (faculty as Array<{ id: string; full_name_ar: string }>).map((f) => [
          f.id,
          f.full_name_ar,
        ]),
      ),
    [faculty],
  );

  const years = useMemo(() => {
    const set = new Set((papers as Paper[]).map((p) => p.publication_year));
    return [...set].sort((a, b) => b - a);
  }, [papers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (papers as Paper[]).filter((p) => {
      if (year !== "all" && p.publication_year !== Number(year)) return false;
      if (programCode !== "all" && p.programs?.code !== programCode) return false;
      if (facultyId !== "all" && p.faculty?.id !== facultyId) return false;
      if (q) {
        const hay = `${p.title_ar} ${p.title_en ?? ""} ${p.authors} ${p.journal_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [papers, search, year, programCode, facultyId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const stats = useMemo(() => {
    const totalCitations = (papers as Paper[]).reduce((s, p) => s + (p.citations_count ?? 0), 0);
    const yearsActive = years.length > 0 ? new Date().getFullYear() - Math.min(...years) + 1 : 0;
    return {
      total: (papers as Paper[]).length,
      citations: totalCitations,
      years: yearsActive,
    };
  }, [papers, years]);

  const resetFilters = () => {
    setSearch("");
    setYear("all");
    setProgramCode("all");
    setFacultyId("all");
    setPage(1);
  };

  return (
    <>
      <PageHeader
        eyebrow="الإنتاج العلمي"
        title="الأبحاث والمنشورات العلمية"
        subtitle="استكشف الأبحاث والمنشورات العلمية لأعضاء هيئة التدريس في الكلية."
      />

      {/* Stats Banner */}
      <section className="bg-hero-gradient text-primary-foreground">
        <div className="container mx-auto px-4 py-10 grid gap-6 grid-cols-1 sm:grid-cols-3">
          <StatCard icon={BookOpen} label="إجمالي الأبحاث" value={stats.total} />
          <StatCard icon={Quote} label="الاستشهادات" value={stats.citations} />
          <StatCard icon={Calendar} label="سنوات النشاط البحثي" value={stats.years} />
        </div>
      </section>

      <section className="container mx-auto px-4 py-12">
        {/* Filters */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 mb-8 p-4 rounded-2xl border border-border bg-card shadow-card">
          <div className="relative lg:col-span-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="بحث بالعنوان أو المؤلف..."
              className="pr-10"
            />
          </div>
          <Select value={year} onValueChange={(v) => { setYear(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="السنة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل السنوات</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={programCode} onValueChange={(v) => { setProgramCode(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="القسم" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأقسام</SelectItem>
              {programs.map((p) => (
                <SelectItem key={p.id} value={p.code}>
                  {p.name_ar.replace("برنامج ", "")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={facultyId} onValueChange={(v) => { setFacultyId(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="الباحث" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الباحثين</SelectItem>
              {faculty.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.full_name_ar}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-dashed border-border bg-card">
            <FileText className="mx-auto h-16 w-16 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">لا توجد أبحاث متاحة حالياً.</p>
            {(search || year !== "all" || programCode !== "all" || facultyId !== "all") && (
              <Button variant="link" className="mt-2 text-gold" onClick={resetFilters}>
                إعادة تعيين الفلاتر
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground mb-4">
              عرض <strong className="text-foreground">{paged.length}</strong> من أصل{" "}
              <strong className="text-foreground">{filtered.length}</strong> بحث
            </div>
            <div className="space-y-4">
              {paged.map((p) => {
                const isOpen = expanded[p.id];
                const isLong = (p.abstract_ar ?? "").length > 220;
                const shownAbstract = !isLong || isOpen
                  ? p.abstract_ar
                  : (p.abstract_ar ?? "").slice(0, 220).trimEnd() + "…";
                return (
                  <article
                    key={p.id}
                    className="group rounded-2xl border border-border bg-card p-6 shadow-card hover:shadow-elegant hover:border-gold/50 transition-all"
                  >
                    <div className="flex flex-wrap items-start gap-3 mb-3">
                      <Badge className="bg-gold/15 text-gold border border-gold/30 hover:bg-gold/20">
                        <Calendar className="h-3 w-3 ml-1" /> {p.publication_year}
                      </Badge>
                      {p.programs?.name_ar && (
                        <Badge variant="outline">{p.programs.name_ar}</Badge>
                      )}
                      {p.citations_count > 0 && (
                        <Badge variant="secondary" className="gap-1">
                          <Quote className="h-3 w-3" /> {p.citations_count} استشهاد
                        </Badge>
                      )}
                    </div>

                    <h2 className="font-display text-xl font-bold text-primary leading-snug">
                      {p.title_ar}
                    </h2>
                    {p.title_en && (
                      <p className="text-sm text-muted-foreground mt-1" dir="ltr">{p.title_en}</p>
                    )}

                    <div className="mt-3 flex items-center gap-2 text-sm text-foreground/70">
                      <Users className="h-4 w-4 text-gold shrink-0" />
                      <span>{p.authors}</span>
                    </div>

                    {p.journal_name && (
                      <div className="mt-1 flex items-center gap-2 text-sm text-foreground/70">
                        <BookOpen className="h-4 w-4 text-gold shrink-0" />
                        <span className="italic">{p.journal_name}</span>
                      </div>
                    )}

                    {shownAbstract && (
                      <div className="mt-4 text-sm text-foreground/80 leading-relaxed">
                        {shownAbstract}
                        {isLong && (
                          <button
                            onClick={() => setExpanded((s) => ({ ...s, [p.id]: !isOpen }))}
                            className="mr-2 font-bold text-gold hover:underline"
                          >
                            {isOpen ? "عرض أقل" : "قراءة المزيد"}
                          </button>
                        )}
                      </div>
                    )}

                    {p.keywords && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {p.keywords.split(/[،,]/).map((k, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-full bg-secondary text-xs text-foreground/70"
                          >
                            {k.trim()}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-5 pt-4 border-t border-border/60 flex flex-wrap items-center gap-3 justify-between">
                      {p.faculty?.full_name_ar ? (
                        <span className="text-xs text-muted-foreground">
                          الباحث الرئيسي:{" "}
                          <span className="text-primary font-bold">{p.faculty.full_name_ar}</span>
                        </span>
                      ) : <span />}
                      <div className="flex flex-wrap gap-2">
                        {p.external_url && (
                          <Button asChild size="sm" variant="outline">
                            <a href={p.external_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3.5 w-3.5 ml-1" /> رابط خارجي
                            </a>
                          </Button>
                        )}
                        {p.pdf_url ? (
                          <Button asChild size="sm" className="bg-gold-gradient text-primary-deep hover:opacity-90">
                            <a href={p.pdf_url} target="_blank" rel="noopener noreferrer">
                              <Download className="h-3.5 w-3.5 ml-1" /> تحميل PDF
                            </a>
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" disabled>
                            <Download className="h-3.5 w-3.5 ml-1" /> PDF غير متاح
                          </Button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronRight className="h-4 w-4" /> السابق
                </Button>
                <span className="text-sm text-muted-foreground px-3">
                  صفحة <strong className="text-foreground">{currentPage}</strong> من{" "}
                  <strong className="text-foreground">{totalPages}</strong>
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
      </section>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 p-6 text-center">
      <Icon className="mx-auto h-8 w-8 text-gold mb-2" />
      <div className="font-display text-4xl font-extrabold text-gold">
        {value.toLocaleString("ar-EG")}
      </div>
      <div className="mt-1 text-sm text-primary-foreground/80">{label}</div>
    </div>
  );
}
