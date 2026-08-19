import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("mobile student header actions", () => {
  const shell = read("src/routes/mobile.student.tsx");
  const more = read("src/routes/mobile.student.more.tsx");
  const notifications = read("src/routes/mobile.student.notifications.tsx");
  const services = read("src/lib/mobile/student-services.ts");

  test("shows notifications as a header bell with unread count", () => {
    expect(shell).toContain('to="/mobile/student/notifications"');
    expect(shell).toContain("<Bell");
    expect(shell).toContain('"unread-count"');
    expect(shell).toContain('.eq("is_read", false)');
    expect(shell).toContain('unreadNotifications > 99 ? "99+" : unreadNotifications');
  });

  test("removes the logout action from the global header", () => {
    const header = shell.slice(
      shell.indexOf("<header"),
      shell.indexOf("</header>") + "</header>".length,
    );
    expect(header).not.toContain("handleLogout");
    expect(header).not.toContain("تسجيل الخروج");
    expect(header).not.toContain("<LogOut");
  });

  test("keeps secure logout in the more hub only", () => {
    expect(more).toContain("تسجيل الخروج");
    expect(more).toContain('signOut({ scope: "global" })');
    expect(more).toContain("queryClient.clear();");
    expect(more).toContain("clearSessionArtifacts();");
    expect(more).toContain("await router.invalidate();");
  });

  test("does not duplicate notifications in home or more cards", () => {
    const homeKeys = services.slice(
      services.indexOf("export const MOBILE_HOME_SERVICE_KEYS"),
      services.indexOf("export const MOBILE_HEADER_SERVICE_KEYS"),
    );
    expect(homeKeys).not.toContain('"notifications"');
    expect(services).toContain(
      'export const MOBILE_HEADER_SERVICE_KEYS: readonly MobileServiceKey[]',
    );
    expect(services).toContain('!header.has(item.key)');
  });

  test("marks every unread notification, including rows older than the visible list", () => {
    expect(notifications).toContain(
      'queryKey: ["mobile-student", "notifications", "unread-count"]',
    );
    expect(notifications).toContain('.update({ is_read: true })');
    expect(notifications).toContain('.eq("is_read", false)');
    expect(notifications).not.toContain('.in("id", unread.map');
    expect(notifications).toContain("qc.setQueriesData(");
  });
});
