import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StandardCard } from "./StandardCard";

export interface ActionCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actionLabel: string;
  actionTo?: string;
  onAction?: () => void;
  accent?: "gold" | "primary";
  className?: string;
}

export function ActionCard({
  title,
  description,
  icon: Icon,
  actionLabel,
  actionTo,
  onAction,
  accent = "primary",
  className,
}: ActionCardProps) {
  const accentBar = accent === "gold" ? "bg-gold-gradient" : "bg-primary";

  return (
    <StandardCard className={cn("relative overflow-hidden p-0", className)}>
      <div className={cn("h-1 w-full", accentBar)} />
      <div className="p-5">
        <div className="flex items-start gap-3">
          {Icon && (
            <div
              className={cn(
                "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                accent === "gold" ? "bg-gold-soft text-gold-dark" : "bg-primary-soft text-primary",
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-bold text-foreground">{title}</h3>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            <div className="mt-4">
              {actionTo ? (
                <Button variant={accent === "gold" ? "gold" : "default"} size="sm" asChild>
                  <Link to={actionTo}>{actionLabel}</Link>
                </Button>
              ) : (
                <Button variant={accent === "gold" ? "gold" : "default"} size="sm" onClick={onAction}>
                  {actionLabel}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </StandardCard>
  );
}
