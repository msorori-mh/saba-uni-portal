import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
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
  admin_position: string | null;
  admin_position_order: number | null;
  programs: { code: string; name_ar: string } | null;
};

type SectionDef = { title: string; subtitle: string; Icon: typeof Crown };

const LEADERSHIP_SECTION: SectionDef = {
  title: "قيادة الكلية",
  subtitle: "العميد والنواب ورؤساء الأقسام",
  Icon: Crown,
};

// ترجمة الرتب الأكاديمية إلى العربية للعرض الموحّد
const RANK_AR: Record<string, string> = {
  "Professor": "أستاذ",
  "Associate Professor": "أستاذ مشارك",
  "Assistant Professor": "أستاذ مساعد",
  "Lecturer": "مدرّس",
  "محاضر": "مدرّس",
  "Lecturer Assistant": "محاضر مساعد",
  "Teaching Assistant": "معيد",
};

function displayRank(rank: string | null): string | null {
  if (!rank) return null;
  return RANK_AR[rank.trim()] ?? rank;
}

// تحديد مستوى المنصب القيادي
function getLeaderTier(adminPosition: string | null): 1 | 2 | 3 {
  if (!adminPosition) return 3;
  const p = adminPosition.trim();
  if (p.startsWith("عميد")) return 1;
  if (p.startsWith("نائب") || p.startsWith("وكيل")) return 2;
  return 3;
}

// أقسام الرتب بالترتيب المطلوب بعد قسم القيادة
const RANK_SECTIONS: Array<{ key: string; title: string; subtitle: string; ranks: string[]; Icon: typeof Crown }> = [
  { key: "associate", title: "الأساتذة المشاركون", subtitle: "برتبة أستاذ مشارك", ranks: ["Associate Professor", "أستاذ مشارك"], Icon: BookOpen },
  { key: "assistant", title: "الأساتذة المساعدون", subtitle: "برتبة أستاذ مساعد", ranks: ["Assistant Professor", "أستاذ مساعد"], Icon: GraduationCap },
  { key: "lecturer",  title: "المدرّسون", subtitle: "برتبة مدرّس (محاضر)", ranks: ["Lecturer", "محاضر", "مدرّس", "مدرس"], Icon: GraduationCap },
  { key: "lecturer_assistant", title: "المحاضرون المساعدون", subtitle: "برتبة محاضر مساعد", ranks: ["Lecturer Assistant", "محاضر مساعد", "محاضرة مساعد"], Icon: GraduationCap },
  { key: "teaching",  title: "المعيدون", subtitle: "برتبة معيد", ranks: ["Teaching Assistant", "معيد"], Icon: Users },
];

const OTHERS_SECTION: SectionDef = {
  title: "محاضر مساعد",
  subtitle: "أعضاء برتبة محاضر مساعد",
  Icon: GraduationCap,
};



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
  loader: ({ context }) => context.queryClient.ensureQueryData(facultyQuery),

  component: FacultyPage,
});

function FacultyPage() {
  const { data: faculty = [] } = useSuspenseQuery(facultyQuery);
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

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <GraduationCap className="mx-auto h-16 w-16 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">لا يوجد أعضاء مطابقون للبحث.</p>
          </div>
        ) : (
          <div className="space-y-16">
            {(() => {
              const leaders = filtered
                .filter((f) => !!f.admin_position)
                .sort(
                  (a, b) =>
                    (a.admin_position_order ?? 999) - (b.admin_position_order ?? 999),
                );
              const rest = filtered.filter((f) => !f.admin_position);

              const sections: Array<{ key: string; def: SectionDef; members: FacultyRow[] }> = [];
              if (leaders.length > 0) {
                sections.push({ key: "__leadership", def: LEADERSHIP_SECTION, members: leaders });
              }

              const used = new Set<string>();
              const byName = (a: FacultyRow, b: FacultyRow) =>
                a.full_name_ar.localeCompare(b.full_name_ar, "ar");

              for (const sec of RANK_SECTIONS) {
                const members = rest
                  .filter((f) => f.rank && sec.ranks.includes(f.rank.trim()))
                  .sort(byName);
                if (members.length === 0) continue;
                members.forEach((m) => used.add(m.id));
                sections.push({
                  key: sec.key,
                  def: { title: sec.title, subtitle: sec.subtitle, Icon: sec.Icon },
                  members,
                });
              }

              const others = rest.filter((f) => !used.has(f.id)).sort(byName);
              if (others.length > 0) {
                sections.push({ key: "__others", def: OTHERS_SECTION, members: others });
              }


              return sections.map(({ key, def, members }) => {
                const Icon = def.Icon;
                return (
                  <div key={key}>
                    <div className="flex items-center gap-4 mb-6">
                      <div className="grid h-12 w-12 place-items-center rounded-xl bg-gold/15 text-gold ring-1 ring-gold/30">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h2 className="font-display text-2xl font-extrabold text-primary">{def.title}</h2>
                        <p className="text-sm text-muted-foreground">{def.subtitle} — {members.length} عضو</p>
                      </div>
                    </div>
                    <div className="divider-gold mb-8" />
                    {key === "__leadership" ? (
                      <LeadershipGroup members={members} onSelect={setSelected} />
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 auto-rows-fr">
                        {members.map((f) => (
                          <FacultyCard key={f.id} f={f} onSelect={setSelected} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
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
                      {selected.admin_position && (
                        <Badge className="bg-gold/15 text-gold border border-gold/40">
                          <Crown className="h-3 w-3 ml-1" />
                          {selected.admin_position}
                        </Badge>
                      )}
                      {selected.rank && (
                        <Badge className="bg-primary/10 text-primary border border-primary/20">
                          {displayRank(selected.rank)}
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
                <Section title="السيرة الذاتية">
                  {selected.bio_ar ? (
                    <p className="text-foreground/80 leading-relaxed whitespace-pre-line">
                      {selected.bio_ar}
                    </p>
                  ) : (
                    <p className="text-muted-foreground leading-relaxed">
                      لا توجد سيرة ذاتية مضافة حالياً.
                    </p>
                  )}
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
          {f.admin_position && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-gold/15 text-gold border border-gold/40 px-2 py-0.5 text-[11px] font-bold">
              <Crown className="h-3 w-3" />
              {f.admin_position}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {f.rank && (
              <Badge className="bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 text-[10px] px-1.5 py-0">
                {displayRank(f.rank)}
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
          عرض السيرة الذاتية
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

function LeadershipGroup({ members, onSelect }: { members: FacultyRow[]; onSelect: (f: FacultyRow) => void }) {
  const tier1 = members.filter((m) => getLeaderTier(m.admin_position) === 1);
  const tier2 = members.filter((m) => getLeaderTier(m.admin_position) === 2);
  const tier3 = members.filter((m) => getLeaderTier(m.admin_position) === 3);

  return (
    <div className="space-y-12">
      {tier1.length > 0 && (
        <div className="flex justify-center">
          <div className="w-full max-w-md">
            {tier1.map((f) => (
              <DeanCard key={f.id} f={f} onSelect={onSelect} />
            ))}
          </div>
        </div>
      )}
      {tier2.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 max-w-4xl mx-auto w-full">
          {tier2.map((f) => (
            <ViceDeanCard key={f.id} f={f} onSelect={onSelect} />
          ))}
        </div>
      )}
      {tier3.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tier3.map((f) => (
            <DepartmentHeadCard key={f.id} f={f} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeanCard({ f, onSelect }: { f: FacultyRow; onSelect: (f: FacultyRow) => void }) {
  return (
    <article className="relative rounded-2xl border-2 border-gold bg-card p-8 pt-10 text-center shadow-elegant hover:-translate-y-1 transition-all duration-300">
      <div className="absolute -top-4 right-1/2 translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-gold text-primary-foreground px-6 py-1.5 text-sm font-display font-bold shadow-lg ring-2 ring-gold/30 whitespace-nowrap">
        <Crown className="h-4 w-4" />
        {f.admin_position}
      </div>
      <div className="mx-auto mb-5 h-28 w-28 rounded-full overflow-hidden bg-hero-gradient ring-4 ring-gold/40 grid place-items-center">
        {f.photo ? (
          <img src={f.photo} alt={f.full_name_ar} className="w-full h-full object-cover" />
        ) : (
          <span className="font-display text-3xl font-extrabold text-gold/90">
            {f.full_name_ar.charAt(0)}
          </span>
        )}
      </div>
      <h3 className="font-display text-xl font-extrabold text-primary">{f.full_name_ar}</h3>
      <div className="mt-2 flex flex-wrap gap-2 justify-center">
        {f.rank && (
          <Badge className="bg-primary/10 text-primary border border-primary/20 text-[11px]">
            {displayRank(f.rank)}
          </Badge>
        )}
        {f.degree && <Badge variant="outline" className="text-[11px]">{f.degree}</Badge>}
      </div>
      {f.specialization && (
        <p className="mt-3 text-xs text-muted-foreground">{f.specialization}</p>
      )}
      <div className="mt-5 pt-4 border-t border-gold/30 flex justify-center">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs border-gold/50 text-primary hover:bg-gold/10 hover:border-gold"
          onClick={() => onSelect(f)}
        >
          <FileText className="h-3.5 w-3.5 ml-1" />
          عرض السيرة الذاتية
        </Button>
      </div>
    </article>
  );
}

function ViceDeanCard({ f, onSelect }: { f: FacultyRow; onSelect: (f: FacultyRow) => void }) {
  return (
    <article className="relative rounded-xl border border-border border-t-4 border-t-gold/70 bg-card p-6 pt-5 text-center shadow-lg hover:shadow-elegant hover:-translate-y-0.5 transition-all duration-300">
      <div className="mb-4 mx-auto flex items-center justify-center gap-1.5 rounded-full bg-gold text-primary-foreground px-4 py-1.5 text-xs font-bold shadow-md max-w-[90%]">
        <Crown className="h-3.5 w-3.5 shrink-0" />
        <span className="line-clamp-2">{f.admin_position}</span>
      </div>
      <div className="mx-auto mb-4 h-20 w-20 rounded-full overflow-hidden bg-hero-gradient ring-2 ring-gold/30 grid place-items-center">
        {f.photo ? (
          <img src={f.photo} alt={f.full_name_ar} className="w-full h-full object-cover" />
        ) : (
          <span className="font-display text-2xl font-extrabold text-gold/90">
            {f.full_name_ar.charAt(0)}
          </span>
        )}
      </div>
      <h4 className="font-display text-base font-bold text-primary">{f.full_name_ar}</h4>
      <div className="mt-2 flex flex-wrap gap-1 justify-center">
        {f.rank && (
          <Badge className="bg-primary/10 text-primary border border-primary/20 text-[10px] px-1.5 py-0">
            {displayRank(f.rank)}
          </Badge>
        )}
        {f.degree && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{f.degree}</Badge>}
      </div>
      <div className="mt-4 pt-3 border-t border-border/60 flex justify-center">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-gold/40 text-primary hover:bg-gold/10 hover:border-gold"
          onClick={() => onSelect(f)}
        >
          <FileText className="h-3 w-3 ml-1" />
          عرض السيرة الذاتية
        </Button>
      </div>
    </article>
  );
}


function DepartmentHeadCard({ f, onSelect }: { f: FacultyRow; onSelect: (f: FacultyRow) => void }) {
  const initials = f.full_name_ar.trim().split(/\s+/).slice(0, 2).map((s) => s.charAt(0)).join("");
  return (
    <article className="group rounded-xl border border-border bg-card p-4 shadow-card hover:shadow-elegant hover:border-gold/50 hover:-translate-y-0.5 transition-all duration-300 flex flex-col">
      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 text-center">
        رئيس قسم
      </div>
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
          {f.admin_position && (
            <div className="mt-1 text-[11px] font-bold text-gold line-clamp-1">
              {f.admin_position}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {f.rank && (
              <Badge className="bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 text-[10px] px-1.5 py-0">
                {displayRank(f.rank)}
              </Badge>
            )}
            {f.degree && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{f.degree}</Badge>}
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
          عرض السيرة الذاتية
        </Button>
      </div>
    </article>
  );
}

