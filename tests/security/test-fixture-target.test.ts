import { describe, expect, test } from "bun:test";
import { assertTestFixtureTarget } from "../../scripts/test-fixture-target.mjs";

describe("test fixture target authorization", () => {
  test.each(["wpmicqriltrowwonknox", "pwapivqjofdsevycegph", "cldpnartkfnmllrkjaoi"])("production %s is blocked even when explicitly selected", (ref) => {
    expect(() => assertTestFixtureTarget({ ALLOW_TEST_FIXTURES: "1", TEST_ONLY_PROJECT_REF: ref, SUPABASE_URL: `https://${ref}.supabase.co` })).toThrow();
  });
  test("authorization alone cannot select an arbitrary remote project", () => {
    expect(() => assertTestFixtureTarget({ ALLOW_TEST_FIXTURES: "1", SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" })).toThrow();
  });
  test("an explicit disposable project or authorized localhost is allowed", () => {
    expect(assertTestFixtureTarget({ ALLOW_TEST_FIXTURES: "1", TEST_ONLY_PROJECT_REF: "abcdefghijklmnopqrst", SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" })).toBe("https://abcdefghijklmnopqrst.supabase.co/");
    expect(assertTestFixtureTarget({ ALLOW_TEST_FIXTURES: "1", SUPABASE_URL: "http://127.0.0.1:54321" })).toBe("http://127.0.0.1:54321/");
  });
  test.each([{}, { SUPABASE_URL: "http://localhost:54321" }, { ALLOW_TEST_FIXTURES: "1", SUPABASE_URL: "not a URL" }])("missing authorization or malformed targets fail before writes", (env) => {
    expect(() => assertTestFixtureTarget(env)).toThrow();
  });
});
