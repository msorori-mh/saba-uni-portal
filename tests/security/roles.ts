import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SecurityTestConfig } from "./config";

export interface SignedInSession {
  accessToken: string;
  userId: string;
  email: string;
}

export function createAnonClient(config: SecurityTestConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAuthedClient(
  config: SecurityTestConfig,
  accessToken: string,
): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signIn(
  config: SecurityTestConfig,
  email: string | undefined,
  password: string | undefined,
  label: string,
): Promise<SignedInSession | null> {
  if (!email || !password) return null;
  const client = createAnonClient(config);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token || !data.user?.id) {
    throw new Error(`${label} sign-in failed: ${error?.message ?? "no session"}`);
  }
  return {
    accessToken: data.session.access_token,
    userId: data.user.id,
    email: data.user.email ?? email,
  };
}

export async function trySignIn(
  config: SecurityTestConfig,
  email: string | undefined,
  password: string | undefined,
): Promise<SignedInSession | null> {
  if (!email || !password) return null;
  try {
    return await signIn(config, email, password, "account");
  } catch {
    return null;
  }
}
