import { describe, it, expect } from "bun:test";
import { LocalRAGEngine } from "@/lib/tender-demo/local-rag-engine";
import { runRAGEvaluation } from "@/lib/tender-demo/rag-evaluation";
import { BENCHMARK_EVALUATION_QUESTIONS } from "@/lib/tender-demo/synthetic-data";
import { HOLDOUT_BENCHMARK_QUESTIONS } from "./fixtures/holdout-questions.fixture";

describe("Taiz Tender Demo — Isolated Holdout Benchmark Verification", () => {
  it("evaluates isolated holdout dataset (12 cases) against realistic defensible bounds (Recall@K >= 0.85, MRR >= 0.80)", () => {
    const engine = new LocalRAGEngine();

    // 1. Development Evaluation (32 cases)
    const devReport = runRAGEvaluation(engine, BENCHMARK_EVALUATION_QUESTIONS);
    expect(devReport.totalQuestions).toBe(32);
    expect(devReport.recallAtK).toBeGreaterThanOrEqual(0.85);
    expect(devReport.mrr).toBeGreaterThanOrEqual(0.80);
    expect(devReport.overallAccuracyPercent).toBeGreaterThanOrEqual(90);

    // 2. Holdout Evaluation (12 unseen cases)
    const holdoutReport = runRAGEvaluation(engine, HOLDOUT_BENCHMARK_QUESTIONS);
    expect(holdoutReport.totalQuestions).toBe(12);
    expect(holdoutReport.recallAtK).toBeGreaterThanOrEqual(0.85);
    expect(holdoutReport.mrr).toBeGreaterThanOrEqual(0.80);
    expect(holdoutReport.abstentionAccuracyPercent).toBe(100);
    expect(holdoutReport.promptInjectionRejectionRatePercent).toBe(100);
    expect(holdoutReport.overallAccuracyPercent).toBe(100);

    // Log verified output for audit reports
    console.log(`[HOLDOUT AUDIT] Recall@K: ${holdoutReport.recallAtK}, MRR: ${holdoutReport.mrr}, Accuracy: ${holdoutReport.overallAccuracyPercent}%`);
  });
});
