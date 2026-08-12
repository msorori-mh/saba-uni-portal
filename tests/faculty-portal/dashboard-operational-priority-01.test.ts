/**
 * Faculty dashboard operational-priority redesign guards.
 *
 * SOURCE-LEVEL + pure helper unit tests. No DB, no production access.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getTodayDayCode,
  getTodaySessions,
  jsDayToCode,
  processingAccessSummaryLabel,
  type TeachingSection,
} from "@/lib/faculty-portal/dashboard-schedule";
import { portalFeatures } from "@/lib/portal-features";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const INDEX_SRC = read("src/routes/faculty-portal.index.tsx");
const GRADES_SRC = read("src/components/portal/FacultyGradesManager.tsx");
const ANN_SRC = read("src/components/communications/AnnouncementsWidget.tsx");
const FEATURES_SRC = read("src/lib/portal-features.ts");

const SAMPLE_TEACHING: TeachingSection[] = [
  {
    id: "sec-1",
    section_code: "A",
    course: { code: "CS101", name_ar: "مقدمة حاسب" },
    schedule: [
      {
        day_of_week: "sunday",
        start_time: "10:00:00",
        end_time: "12:00:00",
        room: "قاعة 1",
        schedule_type: "lecture",
      },
      {
        day_of_week: "tuesday",
        start_time: "08:00:00",
        end_time: "10:00:00",
        room: "معمل 2",
        schedule_type: "lab",
      },
    ],
  },
  {
    id: "sec-2",
    section_code: "B",
    course: { code: "CS202", name_ar: "هياكل بيانات" },
    schedule: [
      {
        day_of_week: "sunday",
        start_time: "08:00:00",
        end_time: "09:30:00",
        room: null,
        schedule_type: "tutorial",
      },
    ],
  },
];

describe("dashboard-schedule helpers — today sessions", () => {
  it("maps JS getDay indices to DB day codes", () => {
    expect(jsDayToCode(0)).toBe("sunday");
    expect(jsDayToCode(6)).toBe("saturday");
    expect(jsDayToCode(1)).toBe("monday");
  });

  it("getTodayDayCode returns a known week code", () => {
    const code = getTodayDayCode(new Date(2026, 7, 9, 12, 0, 0)); // 9 Aug 2026 = Sunday
    expect(code).toBe("sunday");
  });

  it("counts and sorts today's sessions from real teaching rows", () => {
    const today = getTodaySessions(SAMPLE_TEACHING, "sunday");
    expect(today).toHaveLength(2);
    expect(today[0]!.courseCode).toBe("CS202"); // 08:00 before 10:00
    expect(today[0]!.start_time).toBe("08:00:00");
    expect(today[1]!.courseCode).toBe("CS101");
    expect(today[1]!.room).toBe("قاعة 1");
    expect(today[1]!.schedule_type).toBe("lecture");
  });

  it("returns empty today list when weekly teaching exists on other days", () => {
    const today = getTodaySessions(SAMPLE_TEACHING, "friday");
    expect(today).toHaveLength(0);
  });

  it("processingAccessSummaryLabel never invents numeric pending counts", () => {
    expect(processingAccessSummaryLabel(undefined)).toBe("جارٍ التحقق…");
    expect(processingAccessSummaryLabel({ hasAssignment: true, isAdmin: false })).toBe(
      "تحتاج متابعة",
    );
    expect(processingAccessSummaryLabel({ hasAssignment: false, isAdmin: true })).toBe(
      "تحتاج متابعة",
    );
    expect(processingAccessSummaryLabel({ hasAssignment: false, isAdmin: false })).toBe(
      "لا توجد صلاحية معالجة",
    );
    expect(processingAccessSummaryLabel({ hasAssignment: true, isAdmin: false })).not.toMatch(
      /\d/,
    );
  });
});

describe("faculty dashboard IA — operational priority order", () => {
  it("removes the duplicate weekly schedule action card", () => {
    expect(INDEX_SRC).not.toMatch(/جدول التدريس الأسبوعي/);
    const teachingHeadings = INDEX_SRC.match(/جدولي التدريسي/g) ?? [];
    expect(teachingHeadings.length).toBe(1);
  });

  it("keeps a single full-schedule route link", () => {
    expect(INDEX_SRC).toMatch(/to="\/faculty-portal\/schedule"/);
    expect(INDEX_SRC).toMatch(/عرض الجدول الكامل/);
    expect(INDEX_SRC).toMatch(/data-testid="faculty-full-schedule-link"/);
  });

  it("places grades before operational actions and announcements", () => {
    const grades = INDEX_SRC.indexOf('data-testid="faculty-grades-section"');
    const actions = INDEX_SRC.indexOf('data-testid="faculty-operational-actions"');
    const announcements = INDEX_SRC.indexOf('data-testid="faculty-announcements-section"');
    const profile = INDEX_SRC.indexOf('data-testid="faculty-profile-details"');
    expect(grades).toBeGreaterThan(-1);
    expect(actions).toBeGreaterThan(grades);
    expect(announcements).toBeGreaterThan(actions);
    expect(profile).toBeGreaterThan(announcements);
  });

  it("places schedule before grades", () => {
    const schedule = INDEX_SRC.indexOf('data-testid="faculty-teaching-schedule"');
    const grades = INDEX_SRC.indexOf('data-testid="faculty-grades-section"');
    expect(schedule).toBeGreaterThan(-1);
    expect(grades).toBeGreaterThan(schedule);
  });

  it("renders daily summary with truthful today/courses/processing markers", () => {
    expect(INDEX_SRC).toMatch(/data-testid="faculty-daily-summary"/);
    expect(INDEX_SRC).toMatch(/data-testid="faculty-summary-today-sessions"/);
    expect(INDEX_SRC).toMatch(/data-testid="faculty-summary-courses"/);
    expect(INDEX_SRC).toMatch(/data-testid="faculty-summary-processing"/);
    expect(INDEX_SRC).toMatch(/getTodaySessions/);
    expect(INDEX_SRC).toMatch(/processingAccessSummaryLabel/);
    // no hard-coded fake counters in summary
    expect(INDEX_SRC).not.toMatch(/محاضرات اليوم:\s*2/);
    expect(INDEX_SRC).not.toMatch(/pendingRequests\s*=\s*3/);
  });

  it("handles empty teaching and no-today states", () => {
    expect(INDEX_SRC).toMatch(/data-testid="faculty-teaching-empty"/);
    expect(INDEX_SRC).toMatch(/لا توجد مجموعات مرتبطة بك حالياً/);
    expect(INDEX_SRC).toMatch(/data-testid="faculty-teaching-no-today"/);
    expect(INDEX_SRC).toMatch(/لا توجد محاضرات اليوم/);
  });

  it("relocates academic profile details to the bottom section", () => {
    expect(INDEX_SRC).toMatch(/بياناتي الأكاديمية/);
    expect(INDEX_SRC).toMatch(/data-testid="faculty-profile-details"/);
    const header = INDEX_SRC.indexOf('data-testid="faculty-dashboard-header"');
    const profile = INDEX_SRC.indexOf('data-testid="faculty-profile-details"');
    expect(profile).toBeGreaterThan(header);
  });

  it("preserves existing routes", () => {
    expect(INDEX_SRC).toMatch(/to="\/faculty-portal\/processing-requests"/);
    expect(INDEX_SRC).toMatch(/to="\/faculty-portal\/academic-councils"/);
    expect(INDEX_SRC).toMatch(/to="\/faculty-portal\/schedule"/);
  });
});

describe("faculty dashboard — processing / councils / materials gates", () => {
  it("processing card still obeys processingAccess (hasAssignment || isAdmin)", () => {
    expect(INDEX_SRC).toMatch(
      /showProcessingCard\s*=[\s\S]*hasAssignment[\s\S]*isAdmin/,
    );
    expect(INDEX_SRC).toMatch(
      /\{showProcessingCard\s*&&\s*\(\s*<Link[\s\S]*data-testid="faculty-processing-card"/,
    );
  });

  it("councils card remains and links correctly", () => {
    expect(INDEX_SRC).toMatch(/data-testid="faculty-councils-card"/);
    expect(INDEX_SRC).toMatch(/to="\/faculty-portal\/academic-councils"/);
    // must not fabricate an upcoming-meeting count
    expect(INDEX_SRC).not.toMatch(/upcomingMeetings\.length/);
    expect(INDEX_SRC).not.toMatch(/اجتماعات قادمة:\s*\d/);
  });

  it("materials card still obeys facultyCourseMaterials feature flag", () => {
    expect(INDEX_SRC).toMatch(/portalFeatures\.facultyCourseMaterials/);
    expect(INDEX_SRC).toMatch(
      /\{portalFeatures\.facultyCourseMaterials\s*&&\s*\(\s*<Link[\s\S]*to="\/faculty-portal\/materials"/,
    );
    expect(FEATURES_SRC).toMatch(/facultyCourseMaterials:\s*true/);
    expect(portalFeatures.facultyCourseMaterials).toBe(true);
  });
});

describe("announcements + grades presentation", () => {
  it("uses compact empty announcements on the dashboard", () => {
    expect(INDEX_SRC).toMatch(/<AnnouncementsWidget[^>]*compactEmpty/);
    expect(ANN_SRC).toMatch(/compactEmpty/);
    expect(ANN_SRC).toMatch(/لا توجد إعلانات جديدة/);
  });

  it("grades manager keeps persistence APIs and improves entry cards", () => {
    expect(GRADES_SRC).toMatch(/from\("grade_components"\)/);
    expect(GRADES_SRC).toMatch(/from\("student_grades"\)/);
    expect(GRADES_SRC).toMatch(/data-testid="faculty-grades-section-cards"/);
    expect(GRADES_SRC).toMatch(/إدارة الدرجات/);
  });
});
