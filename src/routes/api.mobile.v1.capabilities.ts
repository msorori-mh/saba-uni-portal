import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { withMobileApiHandler, jsonOk, listMobileCapabilities } from "@/lib/mobile-api";

/**
 * Public capability discovery for Flutter (no secrets).
 * GET /api/mobile/v1/capabilities
 * Auth optional — returns static source contract.
 */
export const Route = createFileRoute("/api/mobile/v1/capabilities")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withMobileApiHandler(request, async () => jsonOk(listMobileCapabilities())),
      OPTIONS: async ({ request }) => withMobileApiHandler(request, async () => jsonOk({})),
    },
  },
});
