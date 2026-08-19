import { describe, it, expect } from "bun:test";
import { LocalRAGEngine } from "@/lib/tender-demo/local-rag-engine";
import { BENCHMARK_EVALUATION_QUESTIONS } from "@/lib/tender-demo/synthetic-data";
import { HOLDOUT_BENCHMARK_QUESTIONS } from "./fixtures/holdout-questions.fixture";

describe("Taiz Tender Demo — Real Multi-Protocol Network Interception (fetch, XHR, WebSocket, EventSource)", () => {
  it("intercepts fetch, XMLHttpRequest, WebSocket, and EventSource and verifies ZERO external calls during 44 queries", () => {
    const interceptedCalls: { api: string; target: string }[] = [];

    // 1. Intercept fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      interceptedCalls.push({ api: "fetch", target: url });
      return new Response(JSON.stringify({ blocked: false }), { status: 200 });
    };

    // 2. Intercept XMLHttpRequest
    const originalXHR = (globalThis as any).XMLHttpRequest;
    (globalThis as any).XMLHttpRequest = class MockXHR {
      open(method: string, url: string) {
        interceptedCalls.push({ api: "XMLHttpRequest", target: url });
      }
      send() {}
      setRequestHeader() {}
    };

    // 3. Intercept WebSocket
    const originalWS = (globalThis as any).WebSocket;
    (globalThis as any).WebSocket = class MockWebSocket {
      constructor(url: string) {
        interceptedCalls.push({ api: "WebSocket", target: url });
      }
      send() {}
      close() {}
    };

    // 4. Intercept EventSource
    const originalES = (globalThis as any).EventSource;
    (globalThis as any).EventSource = class MockEventSource {
      constructor(url: string) {
        interceptedCalls.push({ api: "EventSource", target: url });
      }
      close() {}
    };

    try {
      const engine = new LocalRAGEngine();
      const allQueries = [...BENCHMARK_EVALUATION_QUESTIONS, ...HOLDOUT_BENCHMARK_QUESTIONS];

      for (const q of allQueries) {
        const res = engine.query(q.question, q.requiredRole || "student");
        expect(res.engineClassification).toBe("ARABIC_LEXICAL_HEURISTIC_EXTRACTIVE_POC");
        expect(res.externalNetworkRequestsCount).toBe(0);
      }

      // Assert zero outbound calls across all 4 intercepted APIs
      expect(interceptedCalls.length).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
      (globalThis as any).XMLHttpRequest = originalXHR;
      (globalThis as any).WebSocket = originalWS;
      (globalThis as any).EventSource = originalES;
    }
  });
});
