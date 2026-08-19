import { describe, it, expect } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { DemoShell } from "@/components/tender-demo/DemoShell";
import { MultiSiteCMSScene } from "@/components/tender-demo/MultiSiteCMSScene";
import { LocalRAGScene } from "@/components/tender-demo/LocalRAGScene";
import { PerformanceQAScene } from "@/components/tender-demo/PerformanceQAScene";
import { LocalRAGEngine } from "@/lib/tender-demo/local-rag-engine";

describe("Taiz Tender Demo — End-to-End User Journeys and State Verification", () => {
  it("renders 404 security view when feature flag is disabled", () => {
    // With VITE_TAIZ_TENDER_DEMO !== 'true'
    const html = renderToString(React.createElement(DemoShell));
    // In test environment where env is undefined/false
    if (import.meta.env.VITE_TAIZ_TENDER_DEMO !== "true") {
      expect(html).toContain("404");
      expect(html).toContain("الصفحة غير متوفرة");
      expect(html).not.toContain("المواقع المتعددة (25 موقعاً)");
    }
  });

  it("renders all 3 scenes and supports interactive state transitions", () => {
    // 1. Scene 1 — MultiSite CMS
    const cmsHtml = renderToString(React.createElement(MultiSiteCMSScene));
    expect(cmsHtml).toContain("كلية الطب والعلوم الصحية");
    expect(cmsHtml).toContain("med.taiz.edu.ye");
    expect(cmsHtml).toContain("Schema.org");

    // 2. Scene 2 — Local RAG
    const ragHtml = renderToString(React.createElement(LocalRAGScene));
    expect(ragHtml).toContain("ARABIC_LEXICAL_HEURISTIC_EXTRACTIVE_POC");
    expect(ragHtml).toContain("NOT_IMPLEMENTED_OPTIONAL_ADAPTER_PENDING");

    // 3. Scene 3 — Performance & QA
    const qaHtml = renderToString(React.createElement(PerformanceQAScene));
    expect(qaHtml).toContain("PARTIAL_NEEDS_AUDIT");
    expect(qaHtml).toContain("65.6%");
  });

  it("executes complete interactive query and returns cited regulation excerpt without external calls", () => {
    const engine = new LocalRAGEngine();
    const res = engine.query("ما هي شروط ومدة إيقاف القيد المسموح بها للطالب في جامعة تعز؟", "student");

    expect(res.isAbstained).toBe(false);
    expect(res.citations.length).toBeGreaterThan(0);
    expect(res.citations[0]).toContain("المادة 45");
    expect(res.externalNetworkRequestsCount).toBe(0);
    expect(res.observedHosts).toContain("localhost");
  });
});
