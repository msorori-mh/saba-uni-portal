import { describe, expect, it } from "bun:test";
import { validateClassSchedule, isJointLecture, type ScheduleLookups } from "@/lib/imports/class-schedule";

const ctx = { academic_year_id: "Y", semester_id: "S", program_id: "P", level_id: "L" } as never;
const lookups: ScheduleLookups = {
  offeringByCourseCode: new Map([["c1", "o1"], ["c2", "o2"]]),
  sectionByOfferingAndCode: new Map([["o1|a", "s1"], ["o1|b", "s2"], ["o2|a", "s3"]]),
  contextSectionIds: ["s1", "s2", "s3"],
  roomByCode: new Map([["r1", "R1"], ["r2", "R2"]]),
  facultyByEmployeeNumber: new Map([["f1", "F1"], ["f2", "F2"]]),
  timeSlotByKey: new Map(),
  courseByOffering: new Map([["o1", "C1"], ["o2", "C2"]]),
};
function row(course: string, section: string, room: string, fac: string) {
  return { course_code: course, section_code: section, day_of_week: "sunday", start_time: "08:00", end_time: "10:00", room_code: room, faculty_employee_number: fac };
}
async function run(rows: Record<string, unknown>[], db: Array<Record<string, unknown>> = [], secs: Array<Record<string, unknown>> = []) {
  const sb = { from: (t: string) => { const data = t === "class_schedule" ? db : secs; const q: any = { select: () => q, in: () => Promise.resolve({ data }) }; return q; } };
  return validateClassSchedule(rows, ctx, { ...lookups, timeSlotByKey: new Map([["sunday|08:00:00|10:00:00", "T1"]]) }, sb as never);
}

describe("joint lectures", () => {
  it("accepts same course/lecturer/room/slot in different sections", async () => {
    expect((await run([row("C1", "A", "R1", "F1"), row("C1", "B", "R1", "F1")])).blockingConflicts).toEqual([]);
  });
  it("rejects when course differs", async () => {
    expect((await run([row("C1", "A", "R1", "F1"), row("C2", "A", "R1", "F1")])).blockingConflicts.length).toBeGreaterThan(0);
  });
  it("rejects when lecturer differs", async () => {
    const r = await run([row("C1", "A", "R1", "F1"), row("C1", "B", "R1", "F2")]);
    expect(r.blockingConflicts.some((c) => c.message.includes("تعارض قاعة"))).toBe(true);
  });
  it("rejects when room differs with same lecturer", async () => {
    const r = await run([row("C1", "A", "R1", "F1"), row("C1", "B", "R2", "F1")]);
    expect(r.blockingConflicts.some((c) => c.message.includes("تعارض مدرس"))).toBe(true);
  });
  it("still rejects section conflict", async () => {
    const r = await run([row("C1", "A", "R1", "F1"), row("C1", "A", "R1", "F1")]);
    expect(r.blockingConflicts.some((c) => c.message.includes("تعارض مجموعة"))).toBe(true);
  });
  it("accepts joint lecture against an existing row of another program", async () => {
    const db = [{ course_section_id: "X9", room_id: "R1", faculty_profile_id: "F1", time_slot_id: "T1", status: "published" }];
    const secs = [{ id: "X9", offering: { course_id: "C1", academic_year_id: "Y", semester_id: "S" } }];
    expect((await run([row("C1", "A", "R1", "F1")], db, secs)).blockingConflicts).toEqual([]);
    const secs2 = [{ id: "X9", offering: { course_id: "C9", academic_year_id: "Y", semester_id: "S" } }];
    expect((await run([row("C1", "A", "R1", "F1")], db, secs2)).blockingConflicts.length).toBe(2);
  });
  it("requires a non-null lecturer", () => {
    const k = { section_id: "a", room_id: "R", faculty_profile_id: null, slot: "T", course_term: "C" };
    expect(isJointLecture(k, { ...k, section_id: "b" })).toBe(false);
  });
});
