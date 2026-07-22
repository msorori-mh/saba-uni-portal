import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { serializeBuildProvenance } from "@/lib/build-provenance";

// Deployed-commit provenance endpoint (track F - RUNTIME-DEPLOYED-SHA-PROVENANCE-SOURCE-01).
// Returns the frozen { sha } payload built from the SAME build-time-injected
// constant as the <meta name="build-sha"> tag. `Cache-Control: no-store` is
// deliberate: public/sw.js exists, and a cached version payload would lie
// about the deployed commit.
export const Route = createFileRoute("/version.json")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(serializeBuildProvenance(), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
