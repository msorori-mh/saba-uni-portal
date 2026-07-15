// Project-specific replacement for the generated attachSupabaseAuth.
// Reason: the generated middleware calls supabase.auth.getSession() which
// returns the cached session even when the access_token has expired,
// causing `JWT has expired` in requireSupabaseAuth. This version refreshes
// the token proactively when it is expired or within a 60s safety window.
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

const REFRESH_SKEW_SECONDS = 60;

async function getFreshAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = session.expires_at ?? 0;
  const isStale = expiresAt - nowSec <= REFRESH_SKEW_SECONDS;

  if (!isStale) return session.access_token;

  const { data: refreshed, error } = await supabase.auth.refreshSession();
  if (error || !refreshed.session) {
    // Refresh failed (expired refresh token, network, etc.) — sign out so
    // the auth gate can redirect to /auth instead of looping on 401s.
    await supabase.auth.signOut().catch(() => {});
    return null;
  }
  return refreshed.session.access_token;
}

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = await getFreshAccessToken();
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
