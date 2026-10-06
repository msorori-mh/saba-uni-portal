/**
 * STUDENT-SERVICES-GLOBAL-SWITCH-01 — web UI wiring (source assertions).
 *
 * The UI is presentation only (the database guard and the server gate enforce
 * the pause); these tests keep the presentation honest: banner with the
 * message, start buttons DISABLED not hidden, deep links gated, history usable,
 * and the admin card where admin student-request settings live.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const notice = read("src/components/student-requests/StudentServicesPausedNotice.tsx");
const webIndex = read("src/routes/student.requests.index.tsx");

describe("student notice component", () => {
  it("shows the admin message (or the default) plus what stays available", () => {
    expect(notice).toContain('data-testid="student-services-paused-banner"');
    expect(notice).toContain('role="alert"');
    expect(notice).toContain("resolveStudentServicesNoticeAr(messageAr)");
    expect(notice).toContain("STUDENT_SERVICES_DISABLED_SCOPE_NOTE_AR");
    // plain text: rendered as a text node, line breaks preserved, never as HTML
    expect(notice).toContain("whitespace-pre-line");
    expect(notice).not.toContain("dangerouslySetInnerHTML");
    const contract = read("src/lib/student-requests/student-services-switch.ts");
    expect(contract).toContain("إعادة إرسال طلب أُعيد إليك للاستكمال");
    expect(contract).toContain("تنزيل وثائقك الصادرة");
  });

  it("treats the services as paused only on an explicit server answer", () => {
    expect(notice).toContain("paused: query.data ? query.data.enabled === false : false");
    expect(notice).toContain("useServerFn(getStudentServicesStatus)");
  });

  it("the paused start button is a real disabled button, not a hidden one", () => {
    const button = notice.slice(notice.indexOf("export function StudentServicesPausedButton"));
    expect(button).toContain("<button");
    expect(button).toContain("disabled");
    expect(button).toContain('aria-disabled="true"');
    expect(button).toContain("متوقفة مؤقتًا");
  });

  it("gate: never mounts the form before the state is known, and shows the notice instead of the form", () => {
    const gate = notice.slice(notice.indexOf("export function StudentServicesNewRequestGate"));
    const loading = gate.indexOf("if (isLoading");
    const pass = gate.indexOf("if (!paused || returnedQuery.data === true) return <>{children}</>;");
    const blocked = gate.indexOf('data-testid="student-services-paused-gate"');
    expect(loading).toBeGreaterThan(-1);
    expect(pass).toBeGreaterThan(loading);
    expect(blocked).toBeGreaterThan(pass);
    expect(gate).toContain("<StudentServicesPausedBanner messageAr={messageAr} />");
    // resubmission of a RETURNED request stays reachable; a plain draft does not
    expect(gate).toContain('row.serviceCode === resumeB1ServiceCode && row.status === "returned"');
    expect(gate).not.toContain('row.status === "draft"');
    expect(gate).toContain("to={routes.list}");
  });
});

describe("web services list (/student/requests)", () => {
  it("shows the banner and disables every start button while keeping the cards visible", () => {
    expect(webIndex).toContain("useStudentServicesStatus()");
    expect(webIndex).toContain(
      "{servicesPaused ? <StudentServicesPausedBanner messageAr={servicesPausedMessageAr} /> : null}",
    );
    const cards = webIndex.slice(webIndex.indexOf("{services.map((type) => {"));
    const paused = cards.indexOf("{servicesPaused ? (");
    expect(paused).toBeGreaterThan(-1);
    expect(cards.slice(paused, paused + 120)).toContain("<StudentServicesPausedButton />");
    // the paused branch comes BEFORE any link to a new-request form
    expect(paused).toBeLessThan(cards.indexOf('to="/student/requests/b1/$service"'));
    expect(paused).toBeLessThan(cards.indexOf('to="/student/requests/new"'));
    // the card itself is not conditional on the switch
    expect(webIndex).not.toMatch(/servicesPaused\s*\?\s*null\s*:\s*\(?\s*<div className="grid gap-2/);
  });

  it("the five B1 service cards are disabled, not removed", () => {
    const list = read("src/components/student-requests/b1/B1StudentServiceList.tsx");
    expect(list).toContain("const { paused } = useStudentServicesStatus();");
    const card = list.slice(list.indexOf("{services.map((service) => ("));
    expect(card.indexOf("{paused ? (")).toBeGreaterThan(-1);
    expect(card.indexOf("<StudentServicesPausedButton")).toBeLessThan(card.indexOf("to={routes.b1Service}"));
    expect(card).toContain("تقديم طلب");
  });

  it("«طلباتي السابقة» stays fully usable while paused", () => {
    const history = webIndex.slice(webIndex.indexOf('{activeTab === "requests" ? ('));
    expect(history).toContain("طلباتي السابقة");
    expect(history).not.toContain("servicesPaused");
    expect(history).toContain('to="/student/requests/$id"');
    expect(history).toContain('to="/student/requests/b1/view/$requestId"');
    // the tab switcher is not disabled either
    const tabs = webIndex.slice(webIndex.indexOf('role="tablist"'), webIndex.indexOf('{activeTab === "services" ? ('));
    expect(tabs).not.toContain("servicesPaused &&");
    expect(tabs).not.toContain("disabled");
  });

  it("deep links to a new-request form are gated on the web portal", () => {
    const legacy = read("src/routes/student.requests.new.tsx");
    expect(legacy).toMatch(
      /<StudentServicesNewRequestGate>\s*<NewStudentRequestScreen typeFromSearch=\{type\} \/>\s*<\/StudentServicesNewRequestGate>/,
    );
    const b1 = read("src/routes/student.requests.b1.$service.tsx");
    expect(b1).toMatch(
      /<StudentServicesNewRequestGate resumeB1ServiceCode=\{service\}>\s*<B1StudentRequestForm serviceCode=\{service\} \/>\s*<\/StudentServicesNewRequestGate>/,
    );
  });

  it("read-only screens are not gated: details, timeline, documents", () => {
    for (const path of [
      "src/routes/student.requests.$id.tsx",
      "src/routes/student.requests.b1.view.$requestId.tsx",
      "src/components/student-requests/StudentRequestDetailsScreen.tsx",
      "src/components/student-requests/b1/B1StudentRequestDetail.tsx",
      "src/lib/student-requests/student-tracking.functions.ts",
    ]) {
      const source = read(path);
      expect(source).not.toContain("StudentServicesNewRequestGate");
      expect(source).not.toContain("assertStudentServicesOpenForNewRequest");
    }
  });
});

describe("admin card «الخدمات الطلابية»", () => {
  const card = read("src/components/admin/StudentServicesSwitchCard.tsx");

  it("lives on the existing admin student-request settings page (no new nav entry)", () => {
    const page = read("src/routes/admin/request-types.tsx");
    expect(page).toContain(
      'import { StudentServicesSwitchCard } from "@/components/admin/StudentServicesSwitchCard";',
    );
    expect(page).toContain("<StudentServicesSwitchCard />");
    for (const nav of ["src/lib/admin-nav.ts", "src/lib/admin-navigation-config.ts"]) {
      expect(read(nav)).not.toMatch(/student-services-switch|StudentServicesSwitch/);
    }
  });

  it("shows state, toggle, message field and who/when", () => {
    expect(card).toContain("الخدمات الطلابية");
    expect(card).toContain('data-testid="student-services-switch-state"');
    expect(card).toContain('{data.enabled ? "مفعّلة" : "متوقفة مؤقتًا"}');
    expect(card).toContain("<Switch");
    expect(card).toContain("<Textarea");
    expect(card).toContain("maxLength={STUDENT_SERVICES_MESSAGE_MAX_LENGTH}");
    expect(card).toContain("placeholder={STUDENT_SERVICES_DISABLED_DEFAULT_MESSAGE_AR}");
    expect(card).toContain("آخر تغيير:");
    expect(card).toContain("بواسطة ${data.updatedByName}");
  });

  it("asks for confirmation before disabling, never before re-enabling", () => {
    const toggle = card.slice(card.indexOf("const onToggle"), card.indexOf('data-testid="student-services-switch-card"'));
    expect(toggle).toContain("if (!next) setConfirmOpen(true);");
    expect(toggle).toContain("else void apply(true);");
    expect(card).toContain("<AlertDialog open={confirmOpen}");
    expect(card).toContain("إيقاف الخدمات الطلابية مؤقتًا؟");
    const action = card.slice(card.indexOf("<AlertDialogAction"));
    expect(action).toContain("void apply(false);");
    // the only place that disables is behind the dialog
    expect(card.match(/apply\(false\)/g)?.length).toBe(1);
  });

  it("is read-only unless the server says the caller may manage it", () => {
    expect(card).toContain("const canEdit = data.canManage && data.installed;");
    expect(card).toContain("disabled={!canEdit || saving}");
    expect(card).toContain("if (!canEdit || saving) return;");
    expect(card).toContain("useServerFn(setAdminStudentServicesSwitch)");
    // no direct database access from the browser
    expect(card).not.toContain("@/integrations/supabase/client");
  });
});

describe("submit that races the switch", () => {
  it("the legacy form and the details screen show the plain pause message", () => {
    const form = read("src/components/student-requests/NewStudentRequestScreen.tsx");
    expect(form).toContain("const msg = studentServicesDisabledMessageAr(e) ?? (e as Error).message;");
    const details = read("src/components/student-requests/StudentRequestDetailsScreen.tsx");
    expect(details).toContain("description: studentServicesDisabledMessageAr(e) ?? (e as Error).message,");
  });

  it("the B1 form renders adapter errors through the mapper that knows the pause", () => {
    const form = read("src/components/student-requests/b1/B1StudentRequestForm.tsx");
    expect(form).toContain("setFatalError(b1AdapterErrorMessageAr(error));");
    const types = read("src/lib/student-requests/b1-ui/adapter.types.ts");
    const mapper = types.slice(types.indexOf("export function b1AdapterErrorMessageAr"));
    expect(mapper.indexOf("studentServicesDisabledMessageAr(error)")).toBeLessThan(
      mapper.indexOf("if (isB1AdapterError(error)) {"),
    );
  });
});
