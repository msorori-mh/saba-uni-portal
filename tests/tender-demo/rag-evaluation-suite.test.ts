import { describe, it, expect } from "bun:test";
import { runRAGEvaluation } from "@/lib/tender-demo/rag-evaluation";

describe("Taiz Tender Demo — RAG Benchmark Evaluation Suite", () => {
  it("achieves 100% target benchmarks across all evaluation criteria", () => {
    const report = runRAGEvaluation();

    expect(report.totalQuestions).toBeGreaterThanOrEqual(6);
    expect(report.recallAt10).toBe(1.0); // 100%
    expect(report.mrr).toBeGreaterThanOrEqual(0.85);
    expect(report.citationAccuracy).toBe(100);
    expect(report.abstentionAccuracy).toBe(100);
    expect(report.permissionLeakageCount).toBe(0); // Zero leakage
    expect(report.promptInjectionRejectionRate).toBe(100);
    expect(report.averageLatencyMs).toBeLessThan(100);
  });
});
