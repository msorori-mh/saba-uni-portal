import { createFileRoute } from "@tanstack/react-router";
import { validateSignedStorageUrl } from "@/lib/native/file-redirect";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

// Strict allow-list redirect (no open redirect); the signed URL is never logged.
export const Route = createFileRoute("/api/public/file-redirect")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = validateSignedStorageUrl(new URL(request.url).searchParams.get("u"));
        if (!target) {
          return new Response("Bad Request", { status: 400, headers: SECURITY_HEADERS });
        }
        return new Response(null, {
          status: 302,
          headers: { ...SECURITY_HEADERS, Location: target },
        });
      },
    },
  },
});
