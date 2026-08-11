import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  withMobileApiHandler,
  jsonOk,
  resolveMobileApiAuth,
} from "@/lib/mobile-api";
import { getMobileUnofficialTranscript } from "@/lib/mobile-api/unofficial-transcript.service";

/**
 * MOBILE_UNOFFICIAL_TRANSCRIPT — student-self only (no foreign profile id).
 * GET|POST /api/mobile/v1/unofficial-transcript
 */
async function handle(request: Request) {
  return withMobileApiHandler(request, async (req) => {
    const auth = await resolveMobileApiAuth(req);
    const data = await getMobileUnofficialTranscript(auth.userId);
    return jsonOk(data);
  });
}

export const Route = createFileRoute("/api/mobile/v1/unofficial-transcript")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
      OPTIONS: async ({ request }) => withMobileApiHandler(request, async () => jsonOk({})),
    },
  },
});
