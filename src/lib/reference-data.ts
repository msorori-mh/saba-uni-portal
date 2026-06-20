// Shared reference-data fetchers with long staleTime.
// Use ONLY for semi-static dictionaries (programs, departments, levels,
// semesters, academic years, request types, document types). Never use
// for student-scoped, financial, or per-user data.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const REF_STALE = 30 * 60 * 1000; // 30 minutes
const REF_GC = 60 * 60 * 1000; // 1 hour

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as unknown as { from: (t: string) => any };

type RefTable =
  | "programs"
  | "departments"
  | "academic_levels"
  | "semesters"
  | "academic_years"
  | "request_types"
  | "document_types"
  | "fee_types";

async function fetchRef<T>(table: RefTable, columns = "*"): Promise<T[]> {
  const { data, error } = await sb.from(table).select(columns);
  if (error) throw error;
  return (data ?? []) as T[];
}

export function useReferenceData<T = unknown>(table: RefTable, columns?: string) {
  return useQuery({
    queryKey: ["ref-data", table, columns ?? "*"],
    queryFn: () => fetchRef<T>(table, columns),
    staleTime: REF_STALE,
    gcTime: REF_GC,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useCurrentTerm() {
  return useQuery({
    queryKey: ["ref-data", "current-term"],
    queryFn: async () => {
      const [yRes, sRes] = await Promise.all([
        sb.from("academic_years").select("id, name").eq("is_current", true).maybeSingle(),
        sb.from("semesters").select("id, name").eq("is_current", true).maybeSingle(),
      ]);
      return {
        year: (yRes.data as { id: string; name: string } | null) ?? null,
        semester: (sRes.data as { id: string; name: string } | null) ?? null,
      };
    },
    staleTime: REF_STALE,
    gcTime: REF_GC,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
