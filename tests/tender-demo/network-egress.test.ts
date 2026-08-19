import { describe, it, expect } from "bun:test";
import { LocalRAGEngine } from "@/lib/tender-demo/local-rag-engine";
import { BENCHMARK_EVALUATION_QUESTIONS, HOLDOUT_BENCHMARK_QUESTIONS } from "@/lib/tender-demo/synthetic-data";

describe("Taiz Tender Demo — Real Network Request Interception & Egress Guard", () => {
  it("actively intercepts global fetch and confirms ZERO external network calls during complete benchmark execution", async () => {
    const interceptedRequests: { url: string; method: string }[] = [];
    const originalFetch = globalThis.fetch;

    // Active real network interceptor
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      interceptedRequests.push({ url, method: init?.method || "GET" });
      return new Response(JSON.stringify({ blocked: false }), { status: 200 });
    };

    try {
      const engine = new LocalRAGEngine();
      const allQuestions = [...BENCHMARK_EVALUATION_QUESTIONS, ...HOLDOUT_BENCHMARK_QUESTIONS];

      for (const q of allQuestions) {
        const res = engine.query(q.question, q.requiredRole || "student");
        expect(res.engineClassification).toBe("ARABIC_LEXICAL_HEURISTIC_EXTRACTIVE_POC");
      }

      // Assert zero outbound network calls were made during 44 queries
      expect(interceptedRequests.length).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
