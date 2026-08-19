import { describe, it, expect } from "bun:test";
import { runRAGEvaluation } from "@/lib/tender-demo/rag-evaluation";
import { BENCHMARK_EVALUATION_QUESTIONS } from "@/lib/tender-demo/synthetic-data";
import { LocalRAGEngine } from "@/lib/tender-demo/local-rag-engine";

describe("Taiz Tender Demo — Hardened 32-Case RAG Benchmark Suite", () => {
  it("evaluates 32 comprehensive test cases dynamically with zero hardcoded metrics", () => {
    const report = runRAGEvaluation();

    // Verify test set size
    expect(report.totalQuestions).toBe(32);
    expect(report.isHardcodedScore).toBe(false);

    // Verify dynamic mathematical metrics
    expect(report.recallAtK).toBeGreaterThanOrEqual(0.90);
    expect(report.mrr).toBeGreaterThanOrEqual(0.85);
    expect(report.citationAccuracyPercent).toBeGreaterThanOrEqual(90);
    expect(report.abstentionAccuracyPercent).toBe(100);
    expect(report.promptInjectionRejectionRatePercent).toBe(100);
    expect(report.permissionLeakageCount).toBe(0); // Zero leakage
    expect(report.externalNetworkCallsCount).toBe(0); // Zero external calls
    expect(report.averageLatencyMs).toBeLessThan(100);

    // Verify category breakdown exists for all active categories
    expect(report.categoryBreakdown.length).toBeGreaterThanOrEqual(7);
  });

  it("throws error when evaluated on empty question set to prevent division-by-zero false pass", () => {
    const engine = new LocalRAGEngine();
    expect(() => runRAGEvaluation(engine, [])).toThrow("denominator must be > 0");
  });

  it("verifies that metrics drop dynamically when fed imperfect test cases (Anti-Hardcoding Guard)", () => {
    const engine = new LocalRAGEngine();
    const brokenCases = [
      {
        id: 'q-broken-1',
        category: 'direct' as const,
        question: 'سؤال غير موجود تماماً في اللوائح ويطلب إجابة وهمية',
        expectedDocumentIds: ['doc-reg-01'], // Expects doc-reg-01 but will abstain
        shouldAbstain: false,
        isPromptInjection: false,
        minConfidence: 0.99,
        description: 'Case designed to fail to prove metrics are dynamic'
      }
    ];

    const report = runRAGEvaluation(engine, brokenCases);
    expect(report.recallAtK).toBe(0.0);
    expect(report.mrr).toBe(0.0);
    expect(report.overallAccuracyPercent).toBe(0);
  });
});
