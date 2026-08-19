import { describe, it, expect } from "bun:test";
import { LocalRAGEngine } from "@/lib/tender-demo/local-rag-engine";
import { runRAGEvaluation } from "@/lib/tender-demo/rag-evaluation";
import { BENCHMARK_EVALUATION_QUESTIONS, HOLDOUT_BENCHMARK_QUESTIONS } from "@/lib/tender-demo/synthetic-data";

describe("Taiz Tender Demo — Development vs Holdout Evaluation Sets", () => {
  it("evaluates development dataset (32 cases) and holdout dataset (12 cases) separately", () => {
    const engine = new LocalRAGEngine();

    // 1. Development Evaluation
    const devReport = runRAGEvaluation(engine, BENCHMARK_EVALUATION_QUESTIONS);
    expect(devReport.totalQuestions).toBe(32);
    expect(devReport.recallAtK).toBeGreaterThanOrEqual(0.90);
    expect(devReport.mrr).toBeGreaterThanOrEqual(0.85);
    expect(devReport.overallAccuracyPercent).toBe(100);

    // 2. Holdout Evaluation (Completely unseen test questions)
    const holdoutReport = runRAGEvaluation(engine, HOLDOUT_BENCHMARK_QUESTIONS);
    expect(holdoutReport.totalQuestions).toBe(12);
    expect(holdoutReport.recallAtK).toBe(1.000);
    expect(holdoutReport.mrr).toBe(1.000);
    expect(holdoutReport.abstentionAccuracyPercent).toBe(100);
    expect(holdoutReport.promptInjectionRejectionRatePercent).toBe(100);
    expect(holdoutReport.overallAccuracyPercent).toBe(100);
  });
});
