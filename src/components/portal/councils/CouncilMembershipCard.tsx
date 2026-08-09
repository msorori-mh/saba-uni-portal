import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MyCouncilMembershipV2 } from "@/lib/faculty-councils.functions";
import { councilTypeLabel, formatDate, roleLabel } from "./shared";

export type CurrentMembershipCardProps = {
  membership: MyCouncilMembershipV2;
  nextMeeting?: string;
  onOpen: () => void;
};

export function CurrentMembershipCard({
  membership,
  nextMeeting,
  onOpen,
}: CurrentMembershipCardProps) {
  return (
    <li className="rounded-lg border-2 border-gold/20 bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-primary">{membership.council_name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {councilTypeLabel(membership.council_type)}
            {membership.department_name ? ` · ${membership.department_name}` : ""}
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          فعّالة
        </Badge>
      </div>
      <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">الدور</dt>
          <dd className="mt-0.5 font-bold text-foreground">{roleLabel(membership.role)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">بداية العضوية</dt>
          <dd className="mt-0.5 font-bold text-foreground">{formatDate(membership.active_from)}</dd>
        </div>
        {nextMeeting ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">الاجتماع القادم</dt>
            <dd className="mt-0.5 font-medium text-foreground">{nextMeeting}</dd>
          </div>
        ) : null}
      </dl>
      <Button type="button" size="sm" variant="outline" className="mt-3 h-8" onClick={onOpen}>
        فتح المجلس
      </Button>
    </li>
  );
}

export function PreviousMembershipCard({ membership }: { membership: MyCouncilMembershipV2 }) {
  return (
    <li className="rounded-lg border border-border bg-muted/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-primary">{membership.council_name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {councilTypeLabel(membership.council_type)}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          عضوية سابقة
        </Badge>
      </div>
      <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">الدور السابق</dt>
          <dd className="mt-0.5 font-bold text-foreground">{roleLabel(membership.role)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">من</dt>
          <dd className="mt-0.5 font-bold text-foreground">{formatDate(membership.active_from)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">إلى</dt>
          <dd className="mt-0.5 font-bold text-foreground">
            {membership.active_to ? formatDate(membership.active_to) : "—"}
          </dd>
        </div>
      </dl>
    </li>
  );
}
