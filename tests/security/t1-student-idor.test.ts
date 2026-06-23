import type { SecurityTestConfig } from "./config";
import {
  fail,
  isAuthDenied,
  isSupabaseDenied,
  pass,
  skip,
  type TestResult,
} from "./assertions";
import { createAuthedClient, signIn } from "./roles";
import { callServerFn } from "./server-fn";

export async function runT1StudentIdorTests(config: SecurityTestConfig): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const suite = "T1";

  const needStudents =
    config.studentA.email &&
    config.studentA.password &&
    config.studentA.id &&
    config.studentB.id;

  if (!needStudents) {
    results.push(
      skip(
        "student IDOR suite",
        "configure SEC_TEST_STUDENT_A_* and SEC_TEST_STUDENT_B_ID",
      ),
    );
    return results.map((r) => ({ ...r, suite }));
  }

  let sessionA;
  try {
    sessionA = await signIn(
      config,
      config.studentA.email,
      config.studentA.password,
      "student A",
    );
  } catch (e) {
    results.push(fail("student A sign-in", (e as Error).message));
    return results.map((r) => ({ ...r, suite }));
  }
  if (!sessionA) {
    results.push(skip("student A sign-in", "credentials missing"));
    return results.map((r) => ({ ...r, suite }));
  }

  const clientA = createAuthedClient(config, sessionA.accessToken);
  const studentBId = config.studentB.id!;

  // --- progress (RLS: student_profiles / transcript view) ---
  {
    const { data, error } = await clientA
      .from("student_unofficial_transcript")
      .select("student_profile_id")
      .eq("student_profile_id", studentBId)
      .limit(1);
    if (error && isSupabaseDenied(error)) {
      results.push(pass("student A cannot read student B transcript rows (RLS)"));
    } else if ((data ?? []).length === 0) {
      results.push(pass("student A cannot read student B transcript rows (empty)"));
    } else {
      results.push(
        fail(
          "student A cannot read student B transcript rows",
          `got ${data?.length} row(s)`,
        ),
      );
    }
  }

  // --- progress via server fn ---
  {
    const fnId = config.serverFnIds.getStudentProgress;
    if (!fnId) {
      results.push(
        skip(
          "student A cannot access student B progress (server fn)",
          "SEC_TEST_FN_GET_STUDENT_PROGRESS not set",
        ),
      );
    } else {
      const res = await callServerFn(config, fnId, {
        token: sessionA.accessToken,
        payload: { data: { studentProfileId: studentBId } },
      });
      if (!res) {
        results.push(skip("student A progress server fn", "no response"));
      } else if (isAuthDenied(res.body, res.status)) {
        results.push(pass("student A cannot access student B progress (server fn)"));
      } else if (res.ok) {
        results.push(
          fail(
            "student A cannot access student B progress (server fn)",
            `unexpected success HTTP ${res.status}`,
          ),
        );
      } else {
        results.push(pass("student A cannot access student B progress (server fn)", res.body.slice(0, 120)));
      }
    }
  }

  // --- transcript server fn ---
  {
    const fnId = config.serverFnIds.getUnofficialTranscriptData;
    if (!fnId) {
      results.push(
        skip(
          "student A cannot access student B transcript (server fn)",
          "SEC_TEST_FN_GET_UNOFFICIAL_TRANSCRIPT_DATA not set",
        ),
      );
    } else {
      const res = await callServerFn(config, fnId, {
        token: sessionA.accessToken,
        payload: { data: { studentProfileId: studentBId } },
      });
      if (!res) {
        results.push(skip("student A transcript server fn", "no response"));
      } else if (isAuthDenied(res.body, res.status) || /صلاحية/.test(res.body)) {
        results.push(pass("student A cannot access student B transcript (server fn)"));
      } else if (res.ok && !/error/i.test(res.body)) {
        results.push(
          fail(
            "student A cannot access student B transcript (server fn)",
            `unexpected success HTTP ${res.status}`,
          ),
        );
      } else {
        results.push(pass("student A cannot access student B transcript (server fn)"));
      }
    }
  }

  // --- official documents (document-view surface) ---
  if (!config.documentBId) {
    results.push(
      skip(
        "student A cannot open student B official document",
        "SEC_TEST_DOCUMENT_B_ID not set",
      ),
    );
  } else {
    const { data, error } = await clientA
      .from("official_documents")
      .select("id, student_profile_id, document_number")
      .eq("id", config.documentBId)
      .maybeSingle();
    if (error && isSupabaseDenied(error)) {
      results.push(pass("student A cannot open student B official document (RLS)"));
    } else if (!data) {
      results.push(pass("student A cannot open student B official document (not visible)"));
    } else if (data.student_profile_id === studentBId) {
      results.push(
        fail(
          "student A cannot open student B official document",
          `document ${config.documentBId} visible`,
        ),
      );
    } else {
      results.push(pass("student A cannot open student B official document"));
    }
  }

  // --- student B profile direct read ---
  {
    const { data, error } = await clientA
      .from("student_profiles")
      .select("id, academic_number, full_name_ar")
      .eq("id", studentBId)
      .maybeSingle();
    if (error && isSupabaseDenied(error)) {
      results.push(pass("student A cannot read student B profile (RLS)"));
    } else if (!data) {
      results.push(pass("student A cannot read student B profile (empty)"));
    } else {
      results.push(
        fail("student A cannot read student B profile", `profile ${data.id} returned`),
      );
    }
  }

  // --- attachments (admin-only signed URL) ---
  {
    const fnId = config.serverFnIds.getStudentRequestAttachmentUrl;
    const path = config.attachmentPathB ?? "security-test/nonexistent.bin";
    if (!fnId) {
      results.push(
        skip(
          "student A cannot fetch request attachment URL",
          "SEC_TEST_FN_GET_STUDENT_REQUEST_ATTACHMENT_URL not set",
        ),
      );
    } else {
      const res = await callServerFn(config, fnId, {
        token: sessionA.accessToken,
        payload: { data: { path } },
      });
      if (!res) {
        results.push(skip("student A attachment URL", "no response"));
      } else if (isAuthDenied(res.body, res.status) || /صلاحية|Forbidden/i.test(res.body)) {
        results.push(pass("student A cannot fetch request attachment URL"));
      } else if (res.ok && /signedUrl/i.test(res.body)) {
        results.push(fail("student A cannot fetch request attachment URL", "signed URL returned"));
      } else {
        results.push(pass("student A cannot fetch request attachment URL"));
      }
    }
  }

  // --- UUID swap sanity (own progress fn should not accept arbitrary UUID without authz) ---
  {
    const fakeUuid = "00000000-0000-4000-8000-000000000099";
    const fnId = config.serverFnIds.getStudentProgress;
    if (!fnId) {
      results.push(skip("UUID swap on progress denied", "server fn id not set"));
    } else {
      const res = await callServerFn(config, fnId, {
        token: sessionA.accessToken,
        payload: { data: { studentProfileId: fakeUuid } },
      });
      if (!res) {
        results.push(skip("UUID swap on progress", "no response"));
      } else if (isAuthDenied(res.body, res.status) || /Forbidden|not found/i.test(res.body)) {
        results.push(pass("changing progress UUID to random id does not grant access"));
      } else if (res.ok) {
        results.push(fail("changing progress UUID to random id does not grant access", "success"));
      } else {
        results.push(pass("changing progress UUID to random id does not grant access"));
      }
    }
  }

  return results.map((r) => ({ ...r, suite }));
}
