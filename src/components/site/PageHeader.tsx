import techPattern from "@/assets/tech-pattern.jpg";

export function PageHeader({ title, subtitle, eyebrow }: { title: string; subtitle?: string; eyebrow?: string }) {
  return (
    <section className="relative overflow-hidden bg-hero-gradient text-primary-foreground">
      <img src={techPattern} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-15 mix-blend-screen" />
      <div className="absolute inset-0 bg-overlay-gradient" />
      <div className="container relative mx-auto px-4 py-20 md:py-28">
        {eyebrow && (
          <div className="inline-block text-xs font-bold tracking-widest text-gold mb-3 uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-4xl md:text-5xl font-extrabold text-balance">{title}</h1>
        <div className="divider-gold mt-5" />
        {subtitle && <p className="mt-5 max-w-2xl text-base md:text-lg text-primary-foreground/80 leading-8">{subtitle}</p>}
      </div>
    </section>
  );
}
