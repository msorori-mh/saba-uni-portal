import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckCircle2, Clock, Circle, AlertCircle } from "lucide-react";

// Compile the actual pure timeline subtree without loading account/server
// modules from the parent screen. No query or authorization implementation is mocked.
const source = readFileSync("src/components/student-requests/StudentRequestDetailsScreen.tsx", "utf8");
const ast = ts.createSourceFile("screen.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const subtree = ast.statements.filter((node) =>
  (ts.isFunctionDeclaration(node) && node.name?.text === "WorkflowTimelineSection")
  || (ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => d.name.getText(ast) === "STEP_STATUS_META")),
).map((node) => node.getText(ast)).join("\n");
const compiled = ts.transpileModule(subtree, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
const Timeline = new Function("React", "CheckCircle2", "Clock", "Circle", "AlertCircle", `${compiled}\nreturn WorkflowTimelineSection;`)(React, CheckCircle2, Clock, Circle, AlertCircle);

test("all six timeline states render with one current step and retained start/end dates", () => {
  const statuses = ["completed", "current", "upcoming", "skipped", "returned", "cancelled"];
  const html = renderToStaticMarkup(React.createElement(Timeline, { steps: statuses.map((status, i) => ({
    status, stepKey: `step-${i}`, stepOrder: i + 1, stepNameAr: `مرحلة ${i + 1}`,
    enteredAt: i === 0 || i === 1 ? "2026-10-10T08:00:00Z" : null,
    completedAt: i === 0 ? "2026-10-11T09:00:00Z" : null,
  })) }));
  expect(html.match(/<li\b/g)).toHaveLength(6);
  expect(html.match(/aria-current="step"/g)).toHaveLength(1);
  for (const label of ["مكتملة", "المرحلة الحالية", "معلقة", "غير مطلوبة", "معادة", "ملغاة"]) expect(html).toContain(label);
  expect(html.match(/بدأت:/g)).toHaveLength(2);
  expect(html.match(/انتهت:/g)).toHaveLength(1);
  expect(html).not.toMatch(/[٠-٩]/);
  expect(html).not.toContain("undefined");
});

test("an empty timeline has a useful message and no invented stages", () => {
  const html = renderToStaticMarkup(React.createElement(Timeline, { steps: [] }));
  expect(html).toContain("لم يبدأ مسار الطلب بعد.");
  expect(html).not.toContain("<li");
});
