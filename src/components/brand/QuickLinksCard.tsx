import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { StandardCard } from "./StandardCard";

export type QuickLinkItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  search?: Record<string, unknown>;
};

export interface QuickLinksCardProps {
  title: string;
  links: QuickLinkItem[];
  className?: string;
  density?: "default" | "compact";
}

export function QuickLinksCard({ title, links, className, density = "default" }: QuickLinksCardProps) {
  return (
    <StandardCard density={density} className={cn("p-0 overflow-hidden", className)}>
      <div className="border-b border-border bg-primary-soft/50 px-4 py-3">
        <h3 className="font-display text-sm font-bold text-primary-deep">{title}</h3>
      </div>
      <ul className="divide-y divide-border">
        {links.map(({ label, to, icon: Icon, search }) => (
          <li key={to + label}>
            <Link
              to={to}
              search={search}
              className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-primary-soft/40 hover:text-primary"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </StandardCard>
  );
}
