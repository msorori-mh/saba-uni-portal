import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The four data screens are downloaded in the background by their route
 * loaders (run by the layout's preloadRoute), so a student does not have to
 * open each one by hand before going offline.
 */
describe("offline screens are downloaded without opening them", () => {
  const helper = read("src/lib/mobile/offline/screen-prefetch.ts");
  const layout = read("src/routes/mobile.student.tsx");

  test("the helper is inert on the server, when the mode is off, and when offline", () => {
    expect(helper).toContain('if (typeof window === "undefined") return;');
    expect(helper).toContain("if (!isMobileOfflineActive() || !isMobileOnline()) return;");
    // A failed download never breaks the navigation that triggered it.
    expect(helper).toContain(".catch(() => undefined)");
  });

  test("the layout still preloads every offline-capable route after launch", () => {
    expect(layout).toContain("for (const to of MOBILE_OFFLINE_WARM_ROUTES)");
    expect(layout).toContain("void router.preloadRoute({ to })");
  });

  const screens: Array<{ file: string; keys: string[]; fetchers: string[] }> = [
    {
      file: "src/routes/mobile.student.schedule.tsx",
      keys: ['queryKey: ["mobile-student", "schedule"]'],
      fetchers: ["queryFn: fetchMobileSchedule"],
    },
    {
      file: "src/routes/mobile.student.grades.tsx",
      keys: ['queryKey: ["mobile-student", "grades"]'],
      fetchers: ["queryFn: fetchMobileGrades"],
    },
    {
      file: "src/routes/mobile.student.study-plan.tsx",
      keys: [
        'queryKey: ["mobile-student", "program-id"]',
        'queryKey: ["mobile-student", "study-plan", programId]',
      ],
      fetchers: ["queryFn: fetchMyProgramId", "fetchMyStudyPlan(programId)"],
    },
    {
      file: "src/routes/mobile.student.academic-record.tsx",
      keys: [
        'queryKey: ["mobile-student", "context"]',
        'queryKey: ["mobile-student", "academic-record", studentProfileId]',
      ],
      fetchers: ["queryFn: fetchMobileStudentContext", "getMyProgress()"],
    },
  ];

  for (const screen of screens) {
    test(`${screen.file} downloads the same queries its screen shows`, () => {
      const source = read(screen.file);
      const loader = source.slice(source.indexOf("loader: ({ context }) =>"), source.indexOf("  component:"));
      expect(loader).toContain("prefetchMobileOfflineScreen(context.queryClient");
      for (const key of screen.keys) {
        expect(loader).toContain(key);
      }
      // The screen's own key (the last one) is also the one its component reads.
      const ownKey = screen.keys[screen.keys.length - 1];
      expect(source.split(ownKey).length - 1).toBeGreaterThanOrEqual(2);
      expect(loader).toContain("...MOBILE_OFFLINE_PREFETCH_OPTIONS");
      for (const fetcher of screen.fetchers) expect(loader).toContain(fetcher);
    });
  }
});
