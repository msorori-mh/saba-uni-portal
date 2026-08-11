import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  withMobileApiHandler,
  jsonOk,
  resolveMobileApiAuth,
} from "@/lib/mobile-api";
import { listMobileCourseMaterials } from "@/lib/mobile-api/course-materials.service";

/**
 * MOBILE_COURSE_MATERIALS list — enrolled/authorized sections only.
 * GET|POST /api/mobile/v1/course-materials
 */
async function handle(request: Request) {
  return withMobileApiHandler(request, async (req) => {
    const auth = await resolveMobileApiAuth(req);
    const sections = await listMobileCourseMaterials(auth.userId);
    return jsonOk({ sections });
  });
}

export const Route = createFileRoute("/api/mobile/v1/course-materials")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
      OPTIONS: async ({ request }) => withMobileApiHandler(request, async () => jsonOk({})),
    },
  },
});
