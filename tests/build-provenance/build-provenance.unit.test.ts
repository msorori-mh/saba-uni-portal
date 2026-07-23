import { describe, expect, test } from "bun:test";

import {
  BUILD_SHA,
  BUILD_SHA_SENTINEL,
  getBuildProvenance,
  normalizeBuildSha,
  serializeBuildProvenance,
} from "../../src/lib/build-provenance";

const VALID_FULL_SHA = "debf9d041f7c05794f6df33877f1dff91253625e";
const VALID_SHORT_SHA = "debf9d0";

describe("normalizeBuildSha", () => {
  test("accepts a valid 40-char hex SHA", () => {
    expect(normalizeBuildSha(VALID_FULL_SHA)).toBe(VALID_FULL_SHA);
  });

  test("accepts a valid 7-char short SHA", () => {
    expect(normalizeBuildSha(VALID_SHORT_SHA)).toBe(VALID_SHORT_SHA);
  });

  test("normalizes uppercase hex to lowercase", () => {
    expect(normalizeBuildSha(VALID_FULL_SHA.toUpperCase())).toBe(VALID_FULL_SHA);
  });

  test("trims surrounding whitespace of a valid SHA", () => {
    expect(normalizeBuildSha(`  ${VALID_FULL_SHA}\n`)).toBe(VALID_FULL_SHA);
  });

  test("missing SHA (undefined/null/empty) degrades to the unknown sentinel", () => {
    expect(normalizeBuildSha(undefined)).toBe(BUILD_SHA_SENTINEL);
    expect(normalizeBuildSha(null)).toBe(BUILD_SHA_SENTINEL);
    expect(normalizeBuildSha("")).toBe(BUILD_SHA_SENTINEL);
    expect(normalizeBuildSha("   ")).toBe(BUILD_SHA_SENTINEL);
  });

  test("malformed SHA values degrade to the unknown sentinel", () => {
    const malformed = [
      "not-a-sha",
      "g12345",
      "xyz" + VALID_FULL_SHA.slice(3),
      VALID_FULL_SHA + "0", // 41 chars - too long
      VALID_FULL_SHA.slice(0, 6), // 6 chars - too short
      "unknown",
      "main",
      "HEAD",
      `${VALID_FULL_SHA} extra`,
      `<script>alert(1)</script>`,
      `"; DROP TABLE users; --`,
      `${VALID_FULL_SHA}\n${VALID_FULL_SHA}`,
      "0".repeat(64), // sha256-length but > 40 chars
    ];
    for (const value of malformed) {
      expect(normalizeBuildSha(value)).toBe(BUILD_SHA_SENTINEL);
    }
  });

  test("non-string values degrade to the unknown sentinel", () => {
    for (const value of [0, 42, true, false, {}, [], ["abc1234"]]) {
      expect(normalizeBuildSha(value)).toBe(BUILD_SHA_SENTINEL);
    }
  });

  test("never throws on hostile input", () => {
    expect(() => normalizeBuildSha("\0\0\0")).not.toThrow();
    expect(() => normalizeBuildSha("\uFFFD".repeat(100))).not.toThrow();
  });
});

describe("provenance payload shape", () => {
  test("exposes exactly the allowed field set { sha }", () => {
    expect(Object.keys(getBuildProvenance())).toEqual(["sha"]);
  });

  test("sha is the sentinel or a valid SHA - never anything else", () => {
    const { sha } = getBuildProvenance();
    expect(sha === BUILD_SHA_SENTINEL || /^[0-9a-f]{7,40}$/.test(sha)).toBe(true);
  });

  test("BUILD_SHA module constant matches the payload", () => {
    expect(getBuildProvenance().sha).toBe(BUILD_SHA);
  });

  test("serialization is deterministic for a fixed build", () => {
    expect(serializeBuildProvenance()).toBe(serializeBuildProvenance());
    expect(JSON.parse(serializeBuildProvenance())).toEqual(getBuildProvenance());
  });

  test("serialized output contains no environment or secret material", () => {
    const serialized = serializeBuildProvenance();
    // The payload must be exactly {"sha":"..."} - no other keys, no env dumps.
    expect(serialized).toBe(JSON.stringify({ sha: BUILD_SHA }));
    for (const forbidden of [
      "SUPABASE",
      "SERVICE_ROLE",
      "process.env",
      "PASSWORD",
      "SECRET",
      "TOKEN",
      "KEY",
    ]) {
      expect(serialized.includes(forbidden)).toBe(false);
    }
  });
});
