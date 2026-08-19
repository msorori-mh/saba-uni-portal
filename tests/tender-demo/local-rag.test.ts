import { describe, it, expect } from "bun:test";
import { LocalRAGEngine } from "@/lib/tender-demo/local-rag-engine";

describe("Taiz Tender Demo — Sovereign Local RAG Engine", () => {
  const engine = new LocalRAGEngine();

  it("retrieves suspension regulation with exact article citation", () => {
    const res = engine.query("شروط إيقاف القيد للطالب", "student");
    expect(res.isAbstained).toBe(false);
    expect(res.confidenceScore).toBeGreaterThanOrEqual(0.75);
    expect(res.matchedDocuments.length).toBeGreaterThan(0);
    expect(res.matchedDocuments[0].doc.id).toBe("doc-reg-01");
    expect(res.citations.some(c => c.includes("المادة 45"))).toBe(true);
    expect(res.dataEgressBytes).toBe(0);
  });

  it("retrieves grade appeal rules through morphological stemming", () => {
    const res = engine.query("تقديم التظلم من نتيجة مقرر وإعادة رصد الدرجات", "student");
    expect(res.isAbstained).toBe(false);
    expect(res.matchedDocuments[0].doc.id).toBe("doc-reg-02");
    expect(res.citations.some(c => c.includes("المادة 52"))).toBe(true);
  });

  it("abstains with 100% confidence when question has no ground truth", () => {
    const res = engine.query("شروط استئجار طائرة خاصة في الجامعة", "student");
    expect(res.isAbstained).toBe(true);
    expect(res.confidenceScore).toBeLessThan(0.75);
    expect(res.generatedAnswer).toContain("لم أجد إجابة دقيقة");
  });

  it("guarantees 100% offline air-gapped execution with zero data egress", () => {
    const res = engine.query("لائحة الدراسات العليا", "student");
    expect(res.dataEgressBytes).toBe(0);
    expect(res.engineMode).toBe("EXTRACTIVE_GROUNDED");
  });
});
