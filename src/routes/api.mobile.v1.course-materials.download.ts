import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { z } from "zod";
import {
  withMobileApiHandler,
  jsonOk,
  readJsonBody,
  assertMobileRateLimit,
  resolveMobileApiAuth,
} from "@/lib/mobile-api";
import { mintMobileCourseMaterialDownloadUrl } from "@/lib/mobile-api/course-materials.service";

/**
 * MOBILE_COURSE_MATERIALS download — short-lived signed URL.
 * POST /api/mobile/v1/course-materials/download
 * Body: { file_id: uuid }
 */
export const Route = createFileRoute("/api/mobile/v1/course-materials/download")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withMobileApiHandler(request, async (req) => {
          const auth = await resolveMobileApiAuth(req);
          assertMobileRateLimit({
            key: `mat-dl:${auth.userId}`,
            limit: 60,
            windowMs: 60_000,
          });
          const body = await readJsonBody(req, (raw) =>
            z.object({ file_id: z.string().uuid() }).parse(raw),
          );
          const result = await mintMobileCourseMaterialDownloadUrl({
            userId: auth.userId,
            fileId: body.file_id,
          });
          return jsonOk({
            signed_url: result.url,
            expires_in_seconds: result.expiresInSeconds,
            file_id: body.file_id,
          });
        }),
      OPTIONS: async ({ request }) => withMobileApiHandler(request, async () => jsonOk({})),
    },
  },
});
