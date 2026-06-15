import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * LazyMount — defers rendering its children until the placeholder enters
 * the viewport (or after an idle fallback). Lets heavy sections (with their
 * own queries) avoid running on first paint.
 */
export function LazyMount({
  children,
  fallback = null,
  rootMargin = "200px",
  minHeight = 80,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (show) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show, rootMargin]);

  if (show) return <>{children}</>;
  return (
    <div ref={ref} style={{ minHeight }} aria-hidden="true">
      {fallback}
    </div>
  );
}
