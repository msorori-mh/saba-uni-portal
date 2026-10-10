import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("mobile student app — navigation cost", () => {
  const layout = read("src/routes/mobile.student.tsx");
  const identity = read("src/lib/mobile/student-identity.ts");

  it("the per-navigation guard uses the local session and a cached profile check", () => {
    const guard = layout.slice(layout.indexOf("beforeLoad"), layout.indexOf("component: MobileStudentLayout"));
    expect(guard).toContain("getMobileSessionUserId()");
    expect(guard).toContain("getMobileStudentIdentity()");
    expect(guard).not.toContain("auth.getUser()");
    expect(guard).not.toContain('.from("student_profiles")');
  });

  it("a non-student account is still signed out, a transient error is not", () => {
    const guard = layout.slice(layout.indexOf("beforeLoad"), layout.indexOf("component: MobileStudentLayout"));
    expect(guard.indexOf("catch")).toBeLessThan(guard.indexOf("supabase.auth.signOut()"));
    expect(guard).toContain("if (!identity)");
    expect(identity).toContain("if (error) throw error;");
  });

  it("identity is cached per user, deduplicated and cleared on sign-out", () => {
    expect(identity).toContain("supabase.auth.getSession()");
    expect(identity).not.toContain("auth.getUser(");
    expect(identity).toContain("cached.userId === userId");
    expect(identity).toContain("inflight.userId === userId");
    expect(layout).toContain("clearMobileStudentIdentity();");
  });

  it("shows a pending screen instead of a frozen page on cold start", () => {
    expect(layout).toContain("pendingComponent: MobileStudentLoading");
  });

  it("page queries do not repeat the auth round-trip", () => {
    for (const p of [
      "src/lib/mobile/student-context.ts",
      "src/routes/mobile.student.grades.tsx",
      "src/routes/mobile.student.schedule.tsx",
      "src/routes/mobile.student.finance.tsx",
      "src/routes/mobile.student.documents.index.tsx",
      "src/routes/mobile.student.documents.$id.tsx",
      "src/routes/mobile.student-login.tsx",
    ]) {
      const src = read(p);
      expect(src).toContain("getMobileStudentIdentity()");
      expect(src).not.toContain("auth.getUser()");
    }
  });

  it("independent reads go out together", () => {
    expect(read("src/lib/mobile/student-context.ts")).toContain("await Promise.all([");
    expect(read("src/routes/mobile.student.grades.tsx")).toContain("await Promise.all([");
    expect(read("src/routes/mobile.student.documents.$id.tsx")).toContain("await Promise.all([");
    const finance = read("src/routes/mobile.student.finance.tsx");
    expect(finance.match(/\.from\("student_payments"\)/g)?.length).toBe(1);
    expect(finance).toContain("student_fee_id, receipt_number");
  });

  it("the document read stays owner-scoped", () => {
    const detail = read("src/routes/mobile.student.documents.$id.tsx");
    expect(detail).toContain('.eq("id", id).eq("student_profile_id", spId)');
    // Explicit columns since 2026-10 (see mobile-server-performance-2026-10).
    expect(detail.match(/\.from\("official_documents"\)/g)?.length).toBe(1);
  });
});

describe("android shell hardening (takes effect in the next APK/AAB build)", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");

  it("session storage is excluded from backup and device transfer", () => {
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
    const rules = read("android/app/src/main/res/xml/data_extraction_rules.xml");
    expect(rules).toContain("<cloud-backup>");
    expect(rules).toContain("<device-transfer>");
  });

  it("cleartext traffic and user-installed CAs are refused", () => {
    expect(manifest).toContain('android:networkSecurityConfig="@xml/network_security_config"');
    const nsc = read("android/app/src/main/res/xml/network_security_config.xml");
    expect(nsc).toContain('cleartextTrafficPermitted="false"');
    expect(nsc).not.toContain('src="user"');
  });
});

describe("mobile student app — naming", () => {
  it("the requests tab is named «الخدمات الطلابية» everywhere in the app shell", () => {
    const layout = read("src/routes/mobile.student.tsx");
    expect(layout).toContain('{ label: "الخدمات الطلابية", icon: ClipboardList, to: "/mobile/student/requests" }');
    expect(layout).not.toContain('label: "الطلبات"');
    expect(read("src/routes/mobile.student.requests.b1.$service.tsx")).toContain("العودة إلى الخدمات الطلابية");
  });
});
