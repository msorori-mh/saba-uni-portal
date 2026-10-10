import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { describeMobileOfflineSavedScreens } from "@/lib/mobile/offline/saved-status";
import { writeMobileOfflineSnapshot } from "@/lib/mobile/offline/offline-store";

const USER = "11111111-2222-4333-8444-555555555555";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe("offline saved-status (what is really on the device)", () => {
  test("nothing saved: every screen reads as not saved", () => {
    const storage = memoryStorage();
    const screens = describeMobileOfflineSavedScreens(USER, { storage });
    expect(screens).toHaveLength(5);
    expect(screens.every((screen) => !screen.saved && screen.updatedAt === null)).toBe(true);
    expect(describeMobileOfflineSavedScreens(null, { storage }).some((s) => s.saved)).toBe(false);
  });

  test("a screen is saved only when every result it needs is stored", () => {
    const storage = memoryStorage();
    const now = Date.now();
    writeMobileOfflineSnapshot(
      USER,
      [
        { key: ["mobile-student", "context"], data: { ok: true }, updatedAt: now - 5_000 },
        { key: ["mobile-student", "schedule"], data: [], updatedAt: now - 1_000 },
        // Study plan needs program-id AND study-plan: only one is present.
        { key: ["mobile-student", "program-id"], data: "p", updatedAt: now - 2_000 },
      ],
      { storage, now },
    );
    const byPath = new Map(
      describeMobileOfflineSavedScreens(USER, { storage, now }).map((s) => [s.path, s]),
    );
    expect(byPath.get("/mobile/student")?.saved).toBe(true);
    expect(byPath.get("/mobile/student")?.updatedAt).toBe(now - 5_000);
    expect(byPath.get("/mobile/student/schedule")?.saved).toBe(true);
    expect(byPath.get("/mobile/student/study-plan")?.saved).toBe(false);
    // Academic record needs context + academic-record.
    expect(byPath.get("/mobile/student/academic-record")?.saved).toBe(false);
    expect(byPath.get("/mobile/student/grades")?.saved).toBe(false);
  });

  test("another student's snapshot is never reported", () => {
    const storage = memoryStorage();
    const now = Date.now();
    writeMobileOfflineSnapshot(
      USER,
      [{ key: ["mobile-student", "grades"], data: [], updatedAt: now }],
      { storage, now },
    );
    const other = "99999999-2222-4333-8444-555555555555";
    expect(describeMobileOfflineSavedScreens(other, { storage, now }).some((s) => s.saved)).toBe(
      false,
    );
  });

  test("the Settings card shows the status only while the mode is active", () => {
    const setting = readFileSync("src/components/mobile/MobileOfflineModeSetting.tsx", "utf8");
    expect(setting).toContain("{active ? <MobileOfflineSavedStatus /> : null}");
    expect(setting).toContain("describeMobileOfflineSavedScreens(readStoredSupabaseSession()?.userId ?? null)");
    expect(setting).toContain('data-testid="mobile-offline-saved-status"');
  });
});
