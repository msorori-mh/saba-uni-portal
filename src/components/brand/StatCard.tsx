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

export function StatCard({ label, value, icon: Icon, trend, className, density = "default" }: StatCardProps) {
  return (
    <StandardCard density={density} className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 font-display text-2xl font-extrabold tracking-tight text-foreground">{value}</p>
        </div>
        {Icon && (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {trend && <div className="text-xs text-muted-foreground">{trend}</div>}
    </StandardCard>
  );
}
