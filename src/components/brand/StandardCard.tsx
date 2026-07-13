import * as React from "react";
import { cn } from "@/lib/utils";

export interface StandardCardProps extends React.HTMLAttributes<HTMLDivElement> {
  density?: "default" | "compact";
}

export function StandardCard({
  className,
  density = "default",
  children,
  ...props
}: StandardCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card text-card-foreground shadow-card",
        density === "compact" ? "p-3" : "p-5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
