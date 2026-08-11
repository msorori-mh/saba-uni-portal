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
import { mintOfficialDocumentSignedUrl } from "@/lib/mobile-api/official-document-download.service";

/**
 * MOBILE_OFFICIAL_DOCUMENT_DOWNLOAD — stable public contract.
 * POST /api/mobile/v1/official-documents/download
 * Body: { document_id: uuid }
 */
export const Route = createFileRoute("/api/mobile/v1/official-documents/download")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withMobileApiHandler(request, async (req) => {
          const auth = await resolveMobileApiAuth(req);
          assertMobileRateLimit({
            key: `doc-dl:${auth.userId}`,
            limit: 30,
            windowMs: 60_000,
          });
          const body = await readJsonBody(req, (raw) =>
            z
              .object({
                document_id: z.string().uuid(),
              })
              .parse(raw),
          );
          const result = await mintOfficialDocumentSignedUrl({
            officialDocumentId: body.document_id,
            userId: auth.userId,
            sessionClient: auth.supabase as {
              rpc: (
                fn: string,
                args: Record<string, unknown>,
              ) => Promise<{ data: unknown; error: { message: string } | null }>;
            },
            studentSelfOnly: true,
          });
          return jsonOk({
            signed_url: result.signedUrl,
            expires_in_seconds: result.expiresInSeconds,
            document_id: result.documentId,
            status: result.status,
          });
        }),
      OPTIONS: async ({ request }) => withMobileApiHandler(request, async () => jsonOk({})),
    },
  },
});
