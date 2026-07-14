import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StandardCard } from "./StandardCard";

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  trend?: React.ReactNode;
  className?: string;
  density?: "default" | "compact";
}

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  className,
  density = "default",
}: StatCardProps) {
  const compact = density === "compact";
  return (
    <StandardCard
      density={density}
      className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2", className)}
    >
      <div className={cn("flex gap-2.5", compact ? "items-center" : "items-start justify-between")}>
        {Icon && (
          <div
            className={cn(
              "grid shrink-0 place-items-center rounded-lg bg-primary-soft text-primary",
              compact ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl",
            )}
          >
            <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] sm:text-xs font-medium text-muted-foreground leading-tight">
            {label}
          </p>
          <p
            className={cn(
              "font-display font-extrabold tracking-tight text-foreground",
              compact ? "mt-0.5 text-base sm:text-lg leading-snug" : "mt-1 text-2xl",
            )}
          >
            {value}
          </p>
        </div>
      </div>
      {trend && <div className="text-xs text-muted-foreground">{trend}</div>}
    </StandardCard>
  );
}
