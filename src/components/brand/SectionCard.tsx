import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StandardCard } from "./StandardCard";

export interface SectionCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  density?: "default" | "compact";
  action?: React.ReactNode;
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  children,
  className,
  density = "default",
  action,
}: SectionCardProps) {
  return (
    <StandardCard density={density} className={cn("p-0 overflow-hidden", className)}>
      <div className="flex items-start justify-between gap-3 border-b border-border bg-gradient-to-l from-primary-soft/80 to-transparent px-4 py-3">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold text-primary-deep">{title}</h3>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className={density === "compact" ? "p-4" : "p-5"}>{children}</div>
    </StandardCard>
  );
}
