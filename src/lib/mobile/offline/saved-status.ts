/**
 * What is actually saved on this device for the offline mode, per screen.
 *
 * Read straight from the persisted snapshot (not from memory), so the Settings
 * card tells the student — and whoever supports them — exactly which screens
 * will open without a network, and since when.
 */

import { classifyMobileOfflineScreen, type MobileOfflineQuerySegment } from "./config";
import { readMobileOfflineSnapshot, type MobileOfflineStoreOptions } from "./offline-store";

export const MOBILE_OFFLINE_STATUS_SCREENS = [
  { path: "/mobile/student", labelAr: "الرئيسية" },
  { path: "/mobile/student/academic-record", labelAr: "السجل الأكاديمي" },
  { path: "/mobile/student/study-plan", labelAr: "الخطة الدراسية" },
  { path: "/mobile/student/schedule", labelAr: "الجدول" },
  { path: "/mobile/student/grades", labelAr: "الدرجات" },
] as const;

export type MobileOfflineSavedScreen = {
  path: string;
  labelAr: string;
  saved: boolean;
  /** Oldest fetch time among the results the screen needs (ms); null when not saved. */
  updatedAt: number | null;
};

export function describeMobileOfflineSavedScreens(
  userId: string | null,
  options?: MobileOfflineStoreOptions,
): MobileOfflineSavedScreen[] {
  const snapshot = userId ? readMobileOfflineSnapshot(userId, options) : null;
  const bySegment = new Map<string, number>();
  for (const entry of snapshot?.queries ?? []) {
    const segment = String(entry.key[1]);
    const previous = bySegment.get(segment);
    if (previous === undefined || entry.updatedAt < previous) {
      bySegment.set(segment, entry.updatedAt);
    }
  }
  return MOBILE_OFFLINE_STATUS_SCREENS.map(({ path, labelAr }) => {
    const screen = classifyMobileOfflineScreen(path);
    const requires: readonly MobileOfflineQuerySegment[] =
      screen.kind === "cached" ? screen.requires : [];
    const times = requires.map((segment) => bySegment.get(segment));
    const saved = requires.length > 0 && times.every((time) => time !== undefined);
    return {
      path,
      labelAr,
      saved,
      updatedAt: saved ? Math.min(...(times as number[])) : null,
    };
  });
}
