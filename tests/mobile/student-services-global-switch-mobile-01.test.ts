/**
 * STUDENT-SERVICES-GLOBAL-SWITCH-01 — mobile app wiring (source assertions).
 * /mobile/student/requests*: banner, disabled (not hidden) service cards,
 * gated new-request routes, usable history, and the bottom tab stays.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const index = read("src/routes/mobile.student.requests.index.tsx");

describe("mobile services list", () => {
  it("shows the pause banner with the admin message", () => {
    expect(index).toContain("useStudentServicesStatus()");
    expect(index).toContain(
      "{servicesPaused ? <StudentServicesPausedBanner messageAr={servicesPausedMessageAr} /> : null}",
    );
  });

  it("keeps every service card visible but not navigable while paused", () => {
    expect(index.match(/paused=\{servicesPaused\}/g)?.length).toBe(2);
    expect(index).toContain("<ServiceCard key={type.id} type={type} paused={paused} />");
    const card = index.slice(index.indexOf("function ServiceCard("), index.indexOf("function ErrorBox("));
    const pausedBranch = card.indexOf("if (paused) {");
    expect(pausedBranch).toBeGreaterThan(-1);
    // the paused branch returns before either <Link> to a new-request form
    expect(pausedBranch).toBeLessThan(card.indexOf('to="/mobile/student/requests/b1/$service"'));
    expect(pausedBranch).toBeLessThan(card.indexOf('to="/mobile/student/requests/new"'));
    const pausedCard = card.slice(pausedBranch, card.indexOf("return isB1ServiceCode(canonical)"));
    expect(pausedCard).toContain('aria-disabled="true"');
    expect(pausedCard).toContain("{body}");
    expect(pausedCard).not.toContain("<Link");
    expect(card).toContain("متوقفة مؤقتًا");
    // the services sections themselves are never removed by the switch
    expect(index).not.toMatch(/servicesPaused\s*\?\s*null\s*:\s*\(?\s*<ServiceSection/);
  });

  it("«طلباتي السابقة» stays fully usable while paused", () => {
    const history = index.slice(index.indexOf("function RequestsHistory("), index.indexOf("function ServiceCard("));
    expect(history).toContain("طلباتي السابقة");
    expect(history).toContain('to="/mobile/student/requests/$id"');
    expect(history).not.toContain("paused");
    expect(index).toContain("<RequestsHistory requests={visibleRequests} />");
  });
});

describe("mobile deep links", () => {
  it("the legacy new-request route shows the notice instead of the form", () => {
    const route = read("src/routes/mobile.student.requests.new.tsx");
    expect(route).toMatch(
      /<StudentServicesNewRequestGate>\s*<NewStudentRequestScreen typeFromSearch=\{type\} \/>\s*<\/StudentServicesNewRequestGate>/,
    );
  });

  it("the B1 service route is gated but still reachable to resubmit a returned request", () => {
    const route = read("src/routes/mobile.student.requests.b1.$service.tsx");
    expect(route).toMatch(
      /<StudentServicesNewRequestGate resumeB1ServiceCode=\{service\}>\s*<B1StudentRequestForm serviceCode=\{service\} \/>\s*<\/StudentServicesNewRequestGate>/,
    );
    // the back link to the services list is outside the gate
    expect(route.indexOf("العودة إلى الخدمات الطلابية")).toBeLessThan(
      route.indexOf("<StudentServicesNewRequestGate"),
    );
  });

  it("the gate keeps the student inside the mobile container", () => {
    const notice = read("src/components/student-requests/StudentServicesPausedNotice.tsx");
    expect(notice).toContain("const routes = useStudentRequestRoutes();");
    expect(notice).not.toContain('"/student/requests');
    expect(notice).not.toContain('"/mobile/student/requests');
  });

  it("request details and documents on mobile are not gated", () => {
    for (const path of [
      "src/routes/mobile.student.requests.$id.tsx",
      "src/routes/mobile.student.requests.b1.view.$requestId.tsx",
      "src/routes/mobile.student.documents.index.tsx",
      "src/routes/mobile.student.documents.$id.tsx",
    ]) {
      expect(read(path)).not.toContain("StudentServices");
    }
  });
});

describe("mobile shell", () => {
  it("the bottom tab «الخدمات الطلابية» is unconditional", () => {
    const shell = read("src/routes/mobile.student.tsx");
    expect(shell).toContain(
      '{ label: "الخدمات الطلابية", icon: ClipboardList, to: "/mobile/student/requests" }',
    );
    expect(shell).not.toContain("StudentServices");
    expect(shell).not.toContain("student-services-switch");
  });
});
