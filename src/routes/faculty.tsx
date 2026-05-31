import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Mail, Phone, GraduationCap, Search, FileText, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";
import { facultyQuery, programsQuery } from "@/lib/queries";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const RANKS = [
  "أستاذ",
  "أستاذ مشارك",
  "أستاذ مساعد",
  "محاضر",
  "معيد",
];

type FacultyRow = {
  id: string;
  full_name_ar: string;
  full_name_en: string | null;
  rank: string | null;
  degree: string | null;
  specialization: string | null;
  email: string | null;
  phone: string | null;
  photo: string | null;
  bio_ar: string | null;
  bio_en: string | null;
  programs: { code: string; name_ar: string } | null;
};

export const Route = createFileRoute("/faculty")({
  head: () => ({
    meta: [
      { title: "هيئة التدريس — كلية تكنولوجيا المعلومات | جامعة إقليم سبأ" },
      {
        name: "description",
        content:
          "تعرّف على أعضاء هيئة التدريس في كلية تكنولوجيا المعلومات وعلوم الحاسوب بجامعة إقليم سبأ.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(facultyQuery);
    context.queryClient.ensureQueryData(programsQuery);
  },
  component: FacultyPage,
});

function FacultyPage() {
  const { data: faculty = [], isLoading } = useQuery(facultyQuery);
  const { data: programs = [] } = useQuery(programsQuery);

  const [search, setSearch] = useState("");
  const [program, setProgram] = useState<string>("all");
  const [rank, setRank] = useState<string>("all");
  const [selected, setSelected] = useState<FacultyRow | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (faculty as FacultyRow[]).filter((f) => {
      if (program !== "all" && f.programs?.code !== program) return false;
      if (rank !== "all" && f.rank !== rank) return false;
      if (q) {
        const hay = `${f.full_name_ar} ${f.full_name_en ?? ""} ${f.specialization ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [faculty, search, program, rank]);

  return (
    <>
      <PageHeader
        eyebrow="الكادر الأكاديمي"
        title="أعضاء هيئة التدريس"
        subtitle="نخبة من الأساتذة والباحثين في تخصصات تكنولوجيا المعلومات وعلوم الحاسوب."
      />

      <section className="container mx-auto px-4 py-12">
        {/* Filters */}
        <div className="grid gap-3 md:grid-cols-[1fr_220px_220px] mb-10 p-4 rounded-2xl border border-border bg-card shadow-card">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو التخصص..."
              className="pr-10"
            />
          </div>
          <Select value={program} onValueChange={setProgram}>
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
          <Select value={rank} onValueChange={setRank}>
            <SelectTrigger><SelectValue placeholder="الرتبة الأكاديمية" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الرتب</SelectItem>
              {RANKS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-80 rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <GraduationCap className="mx-auto h-16 w-16 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">
              لا يوجد أعضاء هيئة تدريس مطابقون للبحث.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((f) => (
              <article
                key={f.id}
                className="group rounded-2xl border border-border bg-card p-6 shadow-card hover:shadow-elegant hover:border-gold/50 hover:-translate-y-1 transition-all duration-300 flex flex-col"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="relative">
                    <div className="w-28 h-28 rounded-full overflow-hidden bg-hero-gradient grid place-items-center ring-4 ring-gold/20 group-hover:ring-gold/50 transition-all">
                      {f.photo ? (
                        <img src={f.photo} alt={f.full_name_ar} className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-display text-4xl font-extrabold text-gold/90">
                          {f.full_name_ar.charAt(0)}
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="mt-4 font-display text-lg font-bold text-primary">
                    {f.full_name_ar}
                  </h3>
                  {f.rank && (
                    <Badge className="mt-2 bg-gold/15 text-gold border border-gold/30 hover:bg-gold/20">
                      {f.rank}
                    </Badge>
                  )}
                  {f.programs?.name_ar && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {f.programs.name_ar}
                    </div>
                  )}
                  {f.specialization && (
                    <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                      {f.specialization.split(/[،,]/).slice(0, 3).map((tag, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-full bg-secondary text-xs text-foreground/70"
                        >
                          {tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-5 flex items-center gap-2 justify-between border-t border-border/60 mt-5">
                  {f.email ? (
                    <a
                      href={`mailto:${f.email}`}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold transition-colors"
                      title={f.email}
                    >
                      <Mail className="h-4 w-4" />
                      تواصل
                    </a>
                  ) : <span />}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-gold/40 text-primary hover:bg-gold/10 hover:border-gold"
                    onClick={() => setSelected(f)}
                  >
                    <FileText className="h-3.5 w-3.5 ml-1" />
                    السيرة الذاتية
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          {selected && (
            <>
              <DialogHeader>
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-right">
                  <div className="w-24 h-24 shrink-0 rounded-full overflow-hidden bg-hero-gradient grid place-items-center ring-4 ring-gold/30">
                    {selected.photo ? (
                      <img src={selected.photo} alt={selected.full_name_ar} className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-display text-3xl font-extrabold text-gold/90">
                        {selected.full_name_ar.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    <DialogTitle className="font-display text-2xl text-primary">
                      {selected.full_name_ar}
                    </DialogTitle>
                    {selected.full_name_en && (
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {selected.full_name_en}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 justify-center sm:justify-start">
                      {selected.rank && (
                        <Badge className="bg-gold/15 text-gold border border-gold/30">
                          {selected.rank}
                        </Badge>
                      )}
                      {selected.degree && (
                        <Badge variant="outline">{selected.degree}</Badge>
                      )}
                    </div>
                    {selected.programs?.name_ar && (
                      <DialogDescription className="mt-2">
                        {selected.programs.name_ar}
                      </DialogDescription>
                    )}
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-5 mt-2">
                {selected.specialization && (
                  <Section title="التخصص">
                    <p className="text-foreground/80 leading-relaxed">{selected.specialization}</p>
                  </Section>
                )}
                {selected.bio_ar && (
                  <Section title="نبذة">
                    <p className="text-foreground/80 leading-relaxed whitespace-pre-line">
                      {selected.bio_ar}
                    </p>
                  </Section>
                )}

                <Section title="معلومات التواصل">
                  <div className="space-y-2">
                    {selected.email && (
                      <a
                        href={`mailto:${selected.email}`}
                        className="flex items-center gap-2 text-sm text-primary hover:text-gold"
                      >
                        <Mail className="h-4 w-4" /> {selected.email}
                      </a>
                    )}
                    {selected.phone && (
                      <div className="flex items-center gap-2 text-sm text-foreground/80">
                        <Phone className="h-4 w-4" /> {selected.phone}
                      </div>
                    )}
                    {!selected.email && !selected.phone && (
                      <p className="text-sm text-muted-foreground">لا توجد معلومات تواصل متاحة.</p>
                    )}
                  </div>
                </Section>
              </div>

              <div className="flex justify-end pt-4 border-t mt-4">
                <Button variant="outline" onClick={() => setSelected(null)}>
                  <ArrowRight className="h-4 w-4 ml-1" />
                  رجوع
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="font-display font-bold text-primary mb-2 text-sm uppercase tracking-wide">
        {title}
      </h4>
      {children}
    </div>
  );
}
