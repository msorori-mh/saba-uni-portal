import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { GraduationCap, Search, FileText, ArrowRight, Crown, BookOpen, Users } from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";
import { facultyQuery } from "@/lib/queries";
import { Input } from "@/components/ui/input";
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

type FacultyRow = {
  id: string;
  full_name_ar: string;
  full_name_en: string | null;
  rank: string | null;
  degree: string | null;
  specialization: string | null;
  photo: string | null;
  bio_ar: string | null;
  bio_en: string | null;
  category: string;
  start_year: number | null;
  programs: { code: string; name_ar: string } | null;
};

type CategoryDef = { key: string; title: string; subtitle: string; Icon: typeof Crown };

const CATEGORIES: CategoryDef[] = [
  { key: "leadership", title: "قيادة الكلية", subtitle: "العميد ونوّاب العميد", Icon: Crown },
  { key: "phd_faculty", title: "أعضاء هيئة التدريس", subtitle: "حملة درجة الدكتوراه", Icon: BookOpen },
  { key: "assistant_staff", title: "الهيئة المساعدة", subtitle: "المعيدون والمحاضرون المساعدون", Icon: Users },
];

export const Route = createFileRoute("/faculty")({
  head: () => ({
    meta: [
      { title: "هيئة التدريس | كلية تكنولوجيا المعلومات — جامعة إقليم سبأ" },
      {
        name: "description",
        content:
          "تعرّف على قيادة الكلية وأعضاء هيئة التدريس والهيئة المساعدة في كلية تكنولوجيا المعلومات وعلوم الحاسوب بجامعة إقليم سبأ.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(facultyQuery);
  },
  component: FacultyPage,
});

function FacultyPage() {
  const { data: faculty = [], isLoading } = useQuery(facultyQuery);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<FacultyRow | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return faculty as FacultyRow[];
    return (faculty as FacultyRow[]).filter((f) => {
      const hay = `${f.full_name_ar} ${f.full_name_en ?? ""} ${f.rank ?? ""} ${f.degree ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [faculty, search]);

  return (
    <>
      <PageHeader
        eyebrow="الكادر الأكاديمي"
        title="أعضاء هيئة التدريس والهيئة المساعدة"
        subtitle="قيادة الكلية وأعضاء هيئة التدريس والهيئة المساعدة في كلية تكنولوجيا المعلومات وعلوم الحاسوب."
      />

      <section className="container mx-auto px-4 py-12">
        {/* Search */}
        <div className="max-w-md mx-auto mb-12">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الرتبة..."
              className="pr-10 h-12"
              aria-label="بحث"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>

        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <GraduationCap className="mx-auto h-16 w-16 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">لا يوجد أعضاء مطابقون للبحث.</p>
          </div>
        ) : (
          <div className="space-y-16">
            {CATEGORIES.map((cat) => {
              const members = filtered.filter((f) => f.category === cat.key);
              if (members.length === 0) return null;
              const Icon = cat.Icon;
              return (
                <div key={cat.key}>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-gold/15 text-gold ring-1 ring-gold/30">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h2 className="font-display text-2xl font-extrabold text-primary">{cat.title}</h2>
                      <p className="text-sm text-muted-foreground">{cat.subtitle} — {members.length} عضو</p>
                    </div>
                  </div>
                  <div className="divider-gold mb-8" />
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {members.map((f) => (
                      <FacultyCard key={f.id} f={f} onSelect={setSelected} />
                    ))}
                  </div>

                </div>
              );
            })}
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
                    {selected.start_year && (
                      <DialogDescription className="mt-2">
                        ملتحق منذ عام {selected.start_year}
                      </DialogDescription>
                    )}
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-5 mt-2">
                {selected.bio_ar && (
                  <Section title="نبذة">
                    <p className="text-foreground/80 leading-relaxed whitespace-pre-line">
                      {selected.bio_ar}
                    </p>
                  </Section>
                )}

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

function FacultyCard({ f, onSelect }: { f: FacultyRow; onSelect: (f: FacultyRow) => void }) {
  const initials = f.full_name_ar.trim().split(/\s+/).slice(0, 2).map((s) => s.charAt(0)).join("");
  return (
    <article
      className="group rounded-xl border border-border bg-card p-4 shadow-card hover:shadow-elegant hover:border-gold/50 hover:-translate-y-0.5 transition-all duration-300 flex flex-col"
    >
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 shrink-0 rounded-full overflow-hidden bg-hero-gradient grid place-items-center ring-2 ring-gold/20 group-hover:ring-gold/50 transition-all">
          {f.photo ? (
            <img src={f.photo} alt={f.full_name_ar} className="w-full h-full object-cover" />
          ) : (
            <span className="font-display text-base font-extrabold text-gold/90" aria-hidden>
              {initials}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-sm font-bold text-primary leading-snug line-clamp-2">
            {f.full_name_ar}
          </h3>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {f.rank && (
              <Badge className="bg-gold/15 text-gold border border-gold/30 hover:bg-gold/20 text-[10px] px-1.5 py-0">
                {f.rank}
              </Badge>
            )}
            {f.degree && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{f.degree}</Badge>
            )}
          </div>
          {f.specialization && (
            <div className="mt-1 text-[11px] text-muted-foreground line-clamp-1">{f.specialization}</div>
          )}
        </div>
      </div>

      <div className="mt-3 pt-3 flex items-center justify-end border-t border-border/60">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-gold/40 text-primary hover:bg-gold/10 hover:border-gold"
          onClick={() => onSelect(f)}
        >
          <FileText className="h-3 w-3 ml-1" />
          التفاصيل
        </Button>
      </div>
    </article>
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
