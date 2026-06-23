import type { SecurityTestConfig } from "./config";
import {
  fail,
  findPiiLeaks,
  manual,
  pass,
  skip,
  type TestResult,
} from "./assertions";
import { createAnonClient } from "./roles";

const ALLOWED_VERIFY_FIELDS = new Set([
  "valid",
  "reason",
  "document_type",
  "document_number",
  "status",
  "issued_at",
]);

export async function runT4AnonPublicSurfaceTests(
  config: SecurityTestConfig,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const suite = "T4";
  const anon = createAnonClient(config);

  // --- verify_document fake code ---
  {
    const { data, error } = await anon.rpc("verify_document", {
      _query: config.fakeVerifyCode,
    });
    if (error) {
      results.push(
        pass("fake verify code does not leak data", `RPC error: ${error.message}`),
      );
    } else {
      const leaks = findPiiLeaks(data);
      const obj = data as Record<string, unknown>;
      if (leaks.length > 0) {
        results.push(
          fail("fake verify code does not leak PII", `fields: ${leaks.join(", ")}`),
        );
      } else if (obj.valid === true) {
        results.push(fail("fake verify code returns valid:true", "unexpected valid document"));
      } else {
        results.push(pass("fake verify code returns invalid without PII"));
      }
    }
  }

  // --- verify_document valid test code (optional) ---
  if (!config.validVerifyCode) {
    results.push(
      skip(
        "authorized verify code returns minimal fields only",
        "SEC_TEST_VALID_VERIFY_CODE not set",
      ),
    );
  } else {
    const { data, error } = await anon.rpc("verify_document", {
      _query: config.validVerifyCode,
    });
    if (error) {
      results.push(skip("authorized verify code minimal fields", error.message));
    } else {
      const leaks = findPiiLeaks(data);
      const obj = data as Record<string, unknown>;
      const extraKeys = Object.keys(obj).filter((k) => !ALLOWED_VERIFY_FIELDS.has(k));
      if (leaks.length > 0) {
        results.push(
          fail("authorized verify code returns minimal fields only", `PII: ${leaks.join(", ")}`),
        );
      } else if (extraKeys.length > 0) {
        results.push(
          manual(
            "authorized verify code field allowlist",
            `extra keys present: ${extraKeys.join(", ")} — human review`,
          ),
        );
      } else if (obj.valid === true) {
        results.push(pass("authorized verify code returns minimal fields only"));
      } else {
        results.push(
          manual(
            "authorized verify code on staging",
            `valid=${String(obj.valid)} — confirm test document exists`,
          ),
        );
      }
    }
  }

  // --- class_schedule anon SELECT ---
  {
    const { data, error } = await anon
      .from("class_schedule")
      .select("id, course_section_id, day_of_week, start_time, end_time, room, schedule_type")
      .limit(5);
    if (error) {
      results.push(pass("anon class_schedule read blocked or empty", error.message));
    } else if ((data ?? []).length === 0) {
      results.push(
        manual(
          "anon class_schedule public policy",
          "0 rows returned — confirm staging has schedule data for PII review",
        ),
      );
    } else {
      const leaks = findPiiLeaks(data);
      const columns = Object.keys(data![0] ?? {});
      const unexpected = columns.filter(
        (c) =>
          ![
            "id",
            "course_section_id",
            "day_of_week",
            "start_time",
            "end_time",
            "room",
            "schedule_type",
            "created_at",
            "updated_at",
          ].includes(c),
      );
      if (leaks.length > 0) {
        results.push(fail("anon class_schedule has no sensitive columns", leaks.join(", ")));
      } else if (unexpected.length > 0) {
        results.push(
          manual(
            "anon class_schedule column review",
            `unexpected columns: ${unexpected.join(", ")}`,
          ),
        );
      } else {
        results.push(
          manual(
            "anon class_schedule PII policy",
            "schedule rows visible to anon by design — confirm no joined student PII in UI/API",
          ),
        );
      }
    }
  }

  return results.map((r) => ({ ...r, suite }));
}
