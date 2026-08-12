import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const programsQuery = queryOptions({
  queryKey: ["programs"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("programs")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    return data;
  },
  // lookup table — rarely changes; cached for the session
  staleTime: Infinity,
  gcTime: Infinity,
});

export const programByCodeQuery = (code: string) =>
  queryOptions({
    queryKey: ["programs", code],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs")
        .select("*")
        .eq("code", code)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });

export const facultyQuery = queryOptions({
  queryKey: ["faculty"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("get_public_faculty_directory");
    if (error) throw error;
    return data ?? [];
  },
  staleTime: 1000 * 60 * 5,
});

export const newsQuery = (limit?: number) =>
  queryOptions({
    queryKey: ["news", limit ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("news")
        .select("*")
        .eq("is_published", true)
        .order("published_at", { ascending: false });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });

export const newsBySlugQuery = (slug: string) =>
  queryOptions({
    queryKey: ["news", "slug", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news")
        .select("*")
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });

export const eventsQuery = (limit?: number) =>
  queryOptions({
    queryKey: ["events", limit ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("events")
        .select("*")
        .eq("is_published", true)
        .order("event_date", { ascending: true });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });

export const statsQuery = queryOptions({
  queryKey: ["dashboard_stats"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("dashboard_stats")
      .select("*")
      .order("sort_order");
    if (error) throw error;
    return data;
  },
  // lookup-like; rarely changes
  staleTime: Infinity,
  gcTime: Infinity,
});

export const liveCountsQuery = queryOptions({
  queryKey: ["live_counts"],
  queryFn: async () => {
    const [programs, facultyCount, papers, news] = await Promise.all([
      supabase.from("programs").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.rpc("get_public_faculty_count"),
      supabase.from("research_papers").select("id", { count: "exact", head: true }).eq("is_published", true),
      supabase.from("news").select("id", { count: "exact", head: true }).eq("is_published", true),
    ]);
    const facultyNum = Number(facultyCount.data ?? 0);
    return {
      programs: programs.count ?? 0,
      faculty: Number.isFinite(facultyNum) ? facultyNum : 0,
      research: papers.count ?? 0,
      news: news.count ?? 0,
    };
  },
  staleTime: 1000 * 60 * 5,
});

export const settingsQuery = queryOptions({
  queryKey: ["site_settings"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("site_settings")
      .select("setting_key, setting_value, setting_group");
    if (error) throw error;
    const PUBLIC_GROUPS = new Set(["general", "contact", "social", "about"]);
    const PUBLIC_KEYS = new Set(["logo_url", "college_logo_url", "university_name", "college_name"]);
    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      if (PUBLIC_GROUPS.has(row.setting_group) || PUBLIC_KEYS.has(row.setting_key)) {
        map[row.setting_key] = row.setting_value ?? "";
      }
    }
    return map;
  },
  // settings rarely change during a session
  staleTime: Infinity,
  gcTime: Infinity,
});

export const pageBySlugQuery = (slug: string) =>
  queryOptions({
    queryKey: ["site_pages", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_pages")
        .select("*")
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });

export const researchPapersQuery = queryOptions({
  queryKey: ["research_papers"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("research_papers")
      // `faculty` is not readable by `anon` (PII hardening); the public researcher
      // name comes from `get_public_faculty_directory` and is joined client-side.
      .select("*, programs:program_id(code, name_ar)")
      .eq("is_published", true)
      .order("publication_year", { ascending: false })
      .order("sort_order");
    if (error) throw error;
    return data;
  },
  staleTime: 1000 * 60 * 5,
});
