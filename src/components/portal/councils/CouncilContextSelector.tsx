import { Users2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MyCouncilMembershipV2 } from "@/lib/faculty-councils.functions";
import { roleLabel } from "./shared";

export function CouncilContextSelector({
  memberships,
  selectedCouncilId,
  onSelect,
  nextMeetingLabel,
}: {
  memberships: MyCouncilMembershipV2[];
  selectedCouncilId: string | null;
  onSelect: (councilId: string) => void;
  nextMeetingLabel?: string | null;
}) {
  const selected = memberships.find((m) => m.council_id === selectedCouncilId) ?? null;

  return (
    <section
      data-testid="councils-context-selector"
      className="rounded-lg border bg-card px-3 py-3 space-y-2"
      dir="rtl"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Users2 className="h-4 w-4 text-primary shrink-0" aria-hidden />
          <label
            htmlFor="councils-context-select"
            className="text-xs font-bold text-primary whitespace-nowrap"
          >
            المجلس الحالي
          </label>
          <Select
            value={selectedCouncilId ?? ""}
            onValueChange={onSelect}
            dir="rtl"
          >
            <SelectTrigger
              id="councils-context-select"
              className="min-h-9 sm:max-w-sm text-xs font-medium"
              aria-label="اختيار المجلس"
            >
              <SelectValue placeholder="اختر المجلس" />
            </SelectTrigger>
            <SelectContent dir="rtl">
              {memberships.map((m) => (
                <SelectItem key={m.council_id} value={m.council_id}>
                  {m.council_name} — {roleLabel(m.role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selected ? (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <Badge variant="secondary">{roleLabel(selected.role)}</Badge>
            {selected.department_name ? (
              <Badge variant="outline">{selected.department_name}</Badge>
            ) : null}
            {nextMeetingLabel ? (
              <span className="text-muted-foreground">
                الاجتماع القادم: {nextMeetingLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        كل ما يظهر أدناه يخص المجلس المحدد فقط، ووفق دورك المعتمد فيه.
      </p>
    </section>
  );
}
