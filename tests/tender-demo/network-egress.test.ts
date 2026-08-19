import { describe, it, expect } from "bun:test";
import { LocalRAGEngine } from "@/lib/tender-demo/local-rag-engine";
import { BENCHMARK_EVALUATION_QUESTIONS } from "@/lib/tender-demo/synthetic-data";

describe("Taiz Tender Demo — Network Egress & Air-Gap Audit", () => {
  it("guarantees zero external network requests during query execution (NO_EXTERNAL_NETWORK_REQUESTS_OBSERVED)", () => {
    const engine = new LocalRAGEngine();

    for (const q of BENCHMARK_EVALUATION_QUESTIONS) {
      const res = engine.query(q.question, q.requiredRole || "student");
      expect(res.externalNetworkRequestsCount).toBe(0);
      expect(res.observedHosts).toContain("localhost");
      expect(res.observedHosts).not.toContain("api.openai.com");
      expect(res.observedHosts).not.toContain("generativelanguage.googleapis.com");
      expect(res.observedHosts).not.toContain("api.anthropic.com");
    }

    expect(engine.getExternalNetworkCallsCount()).toBe(0);
  });
});
