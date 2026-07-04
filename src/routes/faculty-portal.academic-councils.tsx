import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  getMyAcademicCouncilMemberships,
  type MyAcademicCouncilMembership,
} from "@/lib/faculty-councils.functions";
import type { CouncilLinkMemberRole } from "@/lib/admin-councils.functions";

export const Route = createFileRoute("/faculty-portal/academic-councils")({
  head: () => ({
    meta: [
      { title: "مجالسي الأكاديمية — بوابة عضو هيئة التدريس" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FacultyAcademicCouncilsPage,
});

const MEMBER_ROLE_LABELS: Record<CouncilLinkMemberRole, string> = {
  chair: "رئيس المجلس",
  secretary: "أمين السر",
  member: "عضو",
  viewer: "مطّلع",
};

const COUNCIL_TYPE_LABELS: Record<string, string> = {
  college: "مجلس الكلية",
  department: "مجلس قسم",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar", { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function FacultyAcademicCouncilsPage() {
  const fetchMemberships = useServerFn(getMyAcademicCouncilMemberships);
  const { data: memberships = [], isLoading, isError } = useQuery({
    queryKey: ["faculty", "my-council-memberships"],
    queryFn: () => fetchMemberships(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return (
    <div dir="rtl" className="min-h-screen bg-surface">
      <header className="bg-primary-deep text-primary-foreground border-b-2 border-gold/40">
        <div className="container mx-auto px-4 py-4">
          <Link
            to="/faculty-portal"
            className="inline-flex items-center gap-1 text-xs font-bold text-gold hover:text-primary-foreground transition-colors mb-3"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            العودة إلى بوابة عضو هيئة التدريس
          </Link>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
              <ScrollText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-extrabold text-gold">مجالسي الأكاديمية</h1>
              <p className="text-xs text-primary-foreground/70 mt-0.5">
                المجالس الأكاديمية التي تم ربطك بها من قبل إدارة الكلية.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {isLoading ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive text-center">
            تعذّر تحميل عضويات المجالس. يرجى إعادة المحاولة لاحقاً.
          </div>
        ) : memberships.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <ScrollText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              لا توجد عضويات مجالس مرتبطة بحسابك حالياً.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {memberships.map((m) => (
              <MembershipCard key={m.membership_id} membership={m} />
            ))}
          </ul>
        )}

        <p className="mt-8 text-center text-[11px] text-muted-foreground leading-relaxed">
          هذه الصفحة للاطلاع فقط. إدارة الاجتماعات والموضوعات والقرارات ستُفعَّل في مراحل لاحقة.
        </p>
      </main>
    </div>
  );
}

function MembershipCard({ membership }: { membership: MyAcademicCouncilMembership }) {
  const roleLabel =
    MEMBER_ROLE_LABELS[membership.member_role as CouncilLinkMemberRole] ??
    membership.member_role;
  const typeLabel =
    COUNCIL_TYPE_LABELS[membership.council_type] ?? membership.council_type;

  return (
    <li className="rounded-xl border-2 border-gold/20 bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display font-bold text-primary text-base">
            {membership.council_name}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{typeLabel}</p>
        </div>
        <Badge variant="secondary" className="text-[10px] shrink-0">
          {membership.is_active ? "عضوية فعّالة" : "غير فعّالة"}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
        <div>
          <dt className="text-muted-foreground">دورك في المجلس</dt>
          <dd className="font-bold text-foreground mt-0.5">{roleLabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">بداية العضوية</dt>
          <dd className="font-bold text-foreground mt-0.5">{formatDate(membership.active_from)}</dd>
        </div>
      </dl>
    </li>
  );
}
