/**
 * TEST_ONLY_ASSURANCE_03 — fixture constants.
 *
 * This phase creates NO accounts. It targets exactly the three existing
 * TEST_ONLY_ASSURANCE_02 identities pinned by the owner and adds, at most:
 *   - 2 student_enrollments (one per student, same labelled 04B section)
 *   - 4 student_grades (two components per enrollment)
 *   - 2 student_requests (one per student, free TEST_ONLY request type)
 *
 * Every row id that this phase controls is PREALLOCATED here so it can be
 * checkpointed before the write and collision-checked before the run. Request
 * ids are produced by the application RPC and are checkpointed on return.
 */

export const ASSURANCE_03_NAMESPACE = "TEST_ONLY_ASSURANCE_03";

/** Owner-pinned existing auth users. Nothing else may be targeted. */
export const PINNED_USERS = {
  studentA: "98d8a06e-6822-4501-9a68-30da597f22c8",
  studentB: "a4d5e399-0032-4178-8102-df07105f78d0",
  registrar: "fb617692-8089-4cae-bb0a-b7cf01483226",
} as const;

export type PinnedKey = keyof typeof PINNED_USERS;

/** Exact fixture emails (ASSURANCE_02 namespace) — identity checks only. */
export const PINNED_EMAILS: Readonly<Record<PinnedKey, string>> = {
  studentA: "a02-student-a@assurance02.test.invalid",
  studentB: "a02-student-b@assurance02.test.invalid",
  registrar: "a02-registrar@assurance02.test.invalid",
};

/** Canonical single-role expectation in `user_roles`. */
export const PINNED_ROLES: Readonly<Record<PinnedKey, string>> = {
  studentA: "student",
  studentB: "student",
  registrar: "registrar",
};

/** The four namespace metadata fields every pinned auth user must carry. */
export const PINNED_METADATA: Readonly<Record<PinnedKey, Record<string, string>>> = {
  studentA: {
    fixture_namespace: "TEST_ONLY_ASSURANCE_02",
    fixture_key: "studentA",
    fixture_identifier: "A02-STU-0001",
    test_only: "true",
  },
  studentB: {
    fixture_namespace: "TEST_ONLY_ASSURANCE_02",
    fixture_key: "studentB",
    fixture_identifier: "A02-STU-0002",
    test_only: "true",
  },
  registrar: {
    fixture_namespace: "TEST_ONLY_ASSURANCE_02",
    fixture_key: "registrar",
    fixture_identifier: "A02-STF-0002",
    test_only: "true",
  },
};

/** Historical IDs-only manifest of the ASSURANCE_02 phase (read for IDs only). */
export const HISTORICAL_MANIFEST_FILE = "tests/security/assurance-02/manifest.public.json";

/**
 * Reference data. Every id below is LABEL-VERIFIED synthetic (04B / TEST_ONLY),
 * never inferred from UUID shape, and is used strictly read-only.
 */
export const REFERENCE = {
  departmentId: "00000000-0000-4000-8000-04b000000001",
  programId: "00000000-0000-4000-8000-04b000000002",
  courseId: "00000000-0000-4000-8000-04b000000006",
  courseCode: "T04B-101",
  offeringId: "00000000-0000-4000-8000-04b000000007",
  sectionId: "00000000-0000-4000-8000-04b000000008",
  sectionCode: "T04B-FAC",
  /** Both components MUST belong to `sectionId`; verified live before any write. */
  components: [
    { id: "00000000-0000-4000-8000-04d000000020", maxScore: 40, score: 32 },
    { id: "00000000-0000-4000-8000-04d000000021", maxScore: 60, score: 51 },
  ],
} as const;

/** Preallocated enrollment ids — checkpointed before the insert. */
export const ENROLLMENT_IDS: Readonly<Record<"studentA" | "studentB", string>> = {
  studentA: "00000000-0000-4000-8000-a03e00000001",
  studentB: "00000000-0000-4000-8000-a03e00000002",
};

/** Preallocated grade ids — checkpointed before the insert. */
export const GRADE_IDS: Readonly<Record<"studentA" | "studentB", readonly [string, string]>> = {
  studentA: ["00000000-0000-4000-8000-a03d00000001", "00000000-0000-4000-8000-a03d00000002"],
  studentB: ["00000000-0000-4000-8000-a03d00000003", "00000000-0000-4000-8000-a03d00000004"],
};

/** Free, student-visible TEST_ONLY request type with no fee and no attachment. */
export const REQUEST_TYPE_CODE = "test04b_general_inquiry";
export const REQUEST_TITLE_PREFIX = `${ASSURANCE_03_NAMESPACE} inquiry`;

export function requestTitle(key: "studentA" | "studentB"): string {
  return `${REQUEST_TITLE_PREFIX} ${key}`;
}

/** Grade rows are seeded as approved by the registrar (RLS-allowed actor). */
export const GRADE_STATUS = "approved";

/** Every preallocated id this phase may ever write. */
export function allPreallocatedIds(): string[] {
  return [
    ...Object.values(ENROLLMENT_IDS),
    ...Object.values(GRADE_IDS).flatMap((pair) => [...pair]),
  ];
}

