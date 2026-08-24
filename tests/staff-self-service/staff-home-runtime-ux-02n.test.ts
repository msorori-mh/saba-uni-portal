import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const client = readFileSync("src/integrations/supabase/client.ts", "utf8");
const route = readFileSync("src/routes/staff.index.tsx", "utf8");
const actions = readFileSync(
  "src/components/staff-showcase/StaffSelfServiceLiveActions.tsx",
  "utf8",
);
const dashboard = readFileSync(
  "src/components/staff-showcase/StaffSelfServiceLiveDashboard.tsx",
  "utf8",
);
const valueAdded = readFileSync(
  "src/components/staff-showcase/StaffValueAddedEmployeePanel.tsx",
  "utf8",
);

describe("PORTAL_STAFF_HOME_RUNTIME_AND_UX_02N", () => {
  test("preserves the SupabaseClient receiver for extracted methods", () => {
    expect(client).toContain("Reflect.get(_supabase, prop, _supabase)");
    expect(client).toContain('typeof value === "function" ? value.bind(_supabase) : value');
    expect(client).not.toContain("Reflect.get(_supabase, prop, receiver)");
  });

  test("renders one operational employee home without the legacy showcase", () => {
    expect(route).toContain("<StaffSelfServiceLiveActions");
    expect(route).toContain("<StaffSelfServiceLiveDashboard");
    expect(route).toContain("<StaffValueAddedEmployeePanel");
    expect(route).not.toContain("StaffSelfServiceShowcase");
    expect(route).not.toContain("StaffGovernanceEmployeePanel");
    expect(route).not.toContain("staff-02g-demo-badge");
  });

  test("removes internal presentation language from the active staff route", () => {
    const activeSurface = [route, actions, dashboard, valueAdded].join("\n");
    for (const phrase of [
      "بيانات تجريبية للعرض",
      "لا تمثل سجلات موارد بشرية أو مالية حقيقية",
      "الاتصال التشغيلي الآمن مفعّل",
      "العمليات هنا حية",
      "تقديم طلب حي",
      "طباعة حزمة العرض",
      "بُنيت الواجهات بعقد بيانات",
    ]) {
      expect(activeSurface).not.toContain(phrase);
    }
  });

  test("does not expose raw technical read errors to employees", () => {
    expect(dashboard).toContain(
      "تعذر تحميل البيانات حالياً. يرجى المحاولة مرة أخرى.",
    );
    expect(dashboard).not.toContain("{(error as Error).message}");
    expect(valueAdded).not.toContain("error instanceof Error ? error.message");
  });
});
