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
