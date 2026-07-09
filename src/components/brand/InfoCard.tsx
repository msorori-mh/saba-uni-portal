import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StandardCard } from "@/components/brand/StandardCard";

export interface InfoCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}

export function InfoCard({ icon: Icon, label, value, mono, className }: InfoCardProps) {
  return (
    <StandardCard density="compact" className={cn("flex items-start gap-3", className)}>
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className={cn("mt-0.5 text-sm font-bold text-foreground", mono && "font-en")} dir={mono ? "ltr" : undefined}>
          {value}
        </div>
      </div>
    </StandardCard>
  );
}
