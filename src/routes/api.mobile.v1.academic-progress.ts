import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  withMobileApiHandler,
  jsonOk,
  resolveMobileApiAuth,
} from "@/lib/mobile-api";
import { getMobileAcademicProgress } from "@/lib/mobile-api/academic-progress.service";

/**
 * MOBILE_ACADEMIC_PROGRESS — same DTO as getMyProgress.
 * GET|POST /api/mobile/v1/academic-progress
 */
async function handle(request: Request) {
  return withMobileApiHandler(request, async (req) => {
    const auth = await resolveMobileApiAuth(req);
    const dto = await getMobileAcademicProgress(auth.userId);
    return jsonOk(dto);
  });
}

export const Route = createFileRoute("/api/mobile/v1/academic-progress")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
      OPTIONS: async ({ request }) => withMobileApiHandler(request, async () => jsonOk({})),
    },
  },
});
