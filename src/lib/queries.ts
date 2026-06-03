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
  staleTime: 1000 * 60 * 5,
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
    const { data, error } = await supabase
      .from("faculty")
      .select(
        "id, employee_id, full_name_ar, full_name_en, degree, specialization, program_id, rank, photo, bio_ar, bio_en, sort_order, is_active, category, start_year, programs(code, name_ar)"
      )
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw error;
    return data;
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
  staleTime: 1000 * 60 * 10,
});

export const liveCountsQuery = queryOptions({
  queryKey: ["live_counts"],
  queryFn: async () => {
    const [programs, faculty, papers, news] = await Promise.all([
      supabase.from("programs").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("faculty").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("research_papers").select("id", { count: "exact", head: true }).eq("is_published", true),
      supabase.from("news").select("id", { count: "exact", head: true }).eq("is_published", true),
    ]);
    return {
      programs: programs.count ?? 0,
      faculty: faculty.count ?? 0,
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
    const map: Record<string, string> = {};
    for (const row of data ?? []) map[row.setting_key] = row.setting_value ?? "";
    return map;
  },
  staleTime: 1000 * 60 * 10,
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
      .select("*, faculty:faculty_id(id, full_name_ar), programs:program_id(code, name_ar)")
      .eq("is_published", true)
      .order("publication_year", { ascending: false })
      .order("sort_order");
    if (error) throw error;
    return data;
  },
  staleTime: 1000 * 60 * 5,
});
