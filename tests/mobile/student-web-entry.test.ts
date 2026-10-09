import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolveStudentAppPath } from "../../src/lib/mobile/student-web-entry";

// Every registered legacy student screen must retain a destination (including
// nested request/project IDs), while mandatory password change stays in place.
describe("shared student web/mobile entry", () => {
  for (const file of readdirSync("src/routes").filter((f) => /^student[.]/.test(f) && f.endsWith(".tsx"))) {
    const source = readFileSync(`src/routes/${file}`, "utf8");
    const path = source.match(/createFileRoute\("([^"]+)"\)/)?.[1];
    if (!path) continue;
    test(`preserves ${path}`, () => {
      const target = resolveStudentAppPath(path);
      if (path === "/student/change-password") expect(target).toBeNull();
      else {
        expect(target).toStartWith("/mobile/student");
        const routeSources = readdirSync("src/routes").filter((f) => f.startsWith("mobile.student") && f.endsWith(".tsx"));
        expect(routeSources.some((f) => readFileSync(`src/routes/${f}`, "utf8").includes(`createFileRoute("${target}")`) || readFileSync(`src/routes/${f}`, "utf8").includes(`createFileRoute("${target}/")`))).toBe(true);
      }
    });
  }
  test("does not redirect non-student or unknown paths", () => {
    for (const path of ["/student-evil", "/admin", "/student/unknown", "//example.com/student"]) expect(resolveStudentAppPath(path)).toBeNull();
  });
  test("retains historical request bookmarks", () => {
    expect(resolveStudentAppPath("/student", "#requests")).toBe("/mobile/student/requests");
    expect(resolveStudentAppPath("/student/", "#student-requests")).toBe("/mobile/student/requests");
  });
  test("guards run before routing to shared app", () => {
    const source = readFileSync("src/routes/student.tsx", "utf8");
    expect(source.indexOf("if (profile.must_change_password")).toBeLessThan(source.indexOf("const appPath ="));
    expect(source.indexOf("if (!profile)")).toBeLessThan(source.indexOf("const appPath ="));
    expect(source).toContain("location.searchStr");
  });
});
