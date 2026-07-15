import { createStart, createMiddleware } from "@tanstack/react-start";
// Project-specific replacement for the auto-generated attach-attacher.
// Proactively refreshes the access token when expired to avoid
// `JWT has expired` from requireSupabaseAuth on stale sessions.
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher.local";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
