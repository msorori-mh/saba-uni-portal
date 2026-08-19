import { describe, it, expect } from "bun:test";
import { GlobalWindow } from "happy-dom";
import axe from "axe-core";
import React from "react";
import { renderToString } from "react-dom/server";
import { MultiSiteCMSScene } from "@/components/tender-demo/MultiSiteCMSScene";
import { LocalRAGScene } from "@/components/tender-demo/LocalRAGScene";
import { PerformanceQAScene } from "@/components/tender-demo/PerformanceQAScene";

describe("Taiz Tender Demo — Real axe-core Accessibility Scan", () => {
  it("executes real axe-core accessibility audit across all 3 interactive demo scenes", async () => {
    const window = new GlobalWindow();
    globalThis.window = window as any;
    globalThis.document = window.document as any;
    globalThis.Node = window.Node as any;
    globalThis.Element = window.Element as any;
    globalThis.HTMLElement = window.HTMLElement as any;

    const scenes = [
      { name: "MultiSiteCMSScene", element: React.createElement(MultiSiteCMSScene) },
      { name: "LocalRAGScene", element: React.createElement(LocalRAGScene) },
      { name: "PerformanceQAScene", element: React.createElement(PerformanceQAScene) }
    ];

    let totalViolations = 0;
    const auditSummary: { scene: string; violations: number; passes: number }[] = [];

    for (const scene of scenes) {
      const html = renderToString(scene.element);
      window.document.body.innerHTML = `<main id="main-content" lang="ar" dir="rtl">${html}</main>`;

      const results = await axe.run(window.document.body, {
        rules: {
          "color-contrast": { enabled: false }
        }
      });

      if (results.violations.length > 0) {
        console.log(`[AXE VIOLATION] Scene ${scene.name}:`, JSON.stringify(results.violations, null, 2));
      }

      totalViolations += results.violations.length;
      auditSummary.push({
        scene: scene.name,
        violations: results.violations.length,
        passes: results.passes.length
      });
    }

    expect(auditSummary.length).toBe(3);
    expect(auditSummary.every(s => s.passes > 0)).toBe(true);
    expect(totalViolations).toBe(0);
  });
});
