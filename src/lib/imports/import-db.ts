import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ImportDbClient = any;

let overrideClient: ImportDbClient | null = null;

/** Active Supabase client for import lookups/validators (browser JWT by default). */
export function getImportDb(): ImportDbClient {
  return overrideClient ?? (supabase as ImportDbClient);
}

/** Run import validation with a specific client (e.g. supabaseAdmin on server). */
export async function runWithImportDb<T>(
  client: ImportDbClient,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = overrideClient;
  overrideClient = client;
  try {
    return await fn();
  } finally {
    overrideClient = prev;
  }
}

/**
 * PostgREST caps every response at the project's max-rows (1000 by default),
 * so an unbounded `.select()` silently returns only the first page. Import
 * validators use whole-table reads to build lookup maps (existing enrollments,
 * statuses, grades…); a truncated map makes valid rows fail ("الطالب غير مسجل
 * في هذه المجموعة") and update-existing rows look new. Read every page instead.
 */
export const IMPORT_PAGE_SIZE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function selectAllRows<T = any>(
  client: ImportDbClient,
  table: string,
  columns: string,
): Promise<{ data: T[]; error: null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += IMPORT_PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + IMPORT_PAGE_SIZE - 1);
    if (error) {
      throw new Error(`تعذر قراءة ${table} أثناء التحقق: ${error.message ?? String(error)}`);
    }
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < IMPORT_PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}
