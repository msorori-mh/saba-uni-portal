import { Lock } from "lucide-react";

type FeatureFrozenNoticeProps = {
  title?: string;
  message: string;
  homeHref?: string;
  homeLabel?: string;
  className?: string;
};

/** Soft freeze panel — used when finance (or similar) UI is centrally disabled. */
export function FeatureFrozenNotice({
  title = "الميزة مجمدة مؤقتًا",
  message,
  homeHref,
  homeLabel = "العودة للصفحة الرئيسية",
  className = "",
}: FeatureFrozenNoticeProps) {
  return (
    <div
      dir="rtl"
      className={`rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center ${className}`}
    >
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <Lock className="h-5 w-5" />
      </div>
      <h2 className="font-display text-base font-bold text-primary">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground leading-6">{message}</p>
      {homeHref && (
        <a
          href={homeHref}
          className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
        >
          {homeLabel}
        </a>
      )}
    </div>
  );
}
