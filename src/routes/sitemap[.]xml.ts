import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { renderSitemap, STATIC_SITEMAP_ENTRIES, type SitemapEntry } from "@/lib/sitemap";

async function programEntries(): Promise<SitemapEntry[]> {
  // The sitemap must never fail because of a backend hiccup: on any error the
  // static entries are still served.
  try {
    const { data, error } = await supabase
      .from("programs")
      .select("code, updated_at")
      .eq("is_active", true)
      .order("sort_order");
    if (error || !data) return [];
    return data.map((p) => ({
      path: `/departments/${encodeURIComponent(p.code)}`,
      changefreq: "monthly" as const,
      priority: "0.6",
      lastmod: p.updated_at ? p.updated_at.slice(0, 10) : undefined,
    }));
  } catch {
    return [];
  }
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const xml = renderSitemap([...STATIC_SITEMAP_ENTRIES, ...(await programEntries())]);

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
