# B1 Stage 3 — Migration 128 pre-apply risk closure (read-only)

Mission: `B1_STAGE3_CLEANUP_MIGRATION_128_PRE_APPLY_RISK_CLOSURE-131`
Mode: READ-ONLY. No apply, no DML/DDL, no deploy, no publish, no visibility change.
Target: `docs/migration-drafts/B1-STAGE3-TESTONLY-LIMITED-CLEANUP-FORWARD-ONLY-128.NOT_APPLIED.sql`
Snapshot taken: 2026-07-31 ~19:2x UTC (production, read-only role).

---

## 1. R-a — enrollment_certificate explicit baseline

Frozen baseline to compare against after any future apply.

| Metric | Baseline value |
|---|---|
| `student_requests` where `request_type = 'enrollment_certificate'` | **4** |
| status split | `completed` 2, `in_review` 1, `cancelled` 1 |
| latest `updated_at` (EC requests) | `2026-07-16 04:44:29.338193+00` |
| `enrollment_certificate_document_details` rows | **2** |
| `official_documents` total / issued / archived | 2 / 0 / 2 |
| `official_documents` latest `updated_at` | `2026-07-16 04:44:29.338193+00` |
| `request_types.student_visible` for `enrollment_certificate` | **true** |

Migration 128 contains **no** statement touching any of these tables/rows; its
only EC-related step is a `RAISE NOTICE` count. This document now supplies the
explicit numeric baseline the notice must be compared against
(`enrollment_certificate_document_details = 2`). **R-a CLOSED.**

## 2. R-d — precondition revalidation against current DB

| Precondition (migration 128) | Expected | Measured now | Result |
|---|---|---|---|
| candidate ID list size | 37 | 37 | PASS |
| candidates present in DB | 37 | 37 | PASS |
| candidates owned by `TEST_ONLY_B1_%` profiles | 37 | 37 | PASS |
| intersection with evidence/HOLD/legacy numbers | 0 | 0 | PASS |
| candidates in non-terminal status | 0 | 0 | PASS |
| ID drift (`updated_at > 2026-07-31 04:00:00+00`) | 0 | 0 | PASS |
| attachment metadata rows | 20 | 20 | PASS |
| workflow steps | 135 | 135 | PASS |
| workflow events | 157 | 157 | PASS |
| idempotency rows (3 profile IDs) | 53 | 53 | PASS |
| `student_excused_absences` effect rows | 1 | 1 | PASS |
| `student_extra_chances` effect rows | 1 | 1 | PASS |
| `file_withdrawal_details` | 10 | 10 | PASS |
| `absence_excuse_details` | 6 | 6 | PASS |
| `enrollment_suspension_details` | 6 | 6 | PASS |
| `extra_chance_details` | 9 | 9 | PASS |
| `transfer_request_details` | 6 | 6 | PASS |
| evidence + HOLD B1 requests present | ≥8 | 8 | PASS |
| protected legacy requests present | 3 | 3 | PASS |
| five B1 services `student_visible` | all `false` | all `false` | PASS |
| `enrollment_certificate` `student_visible` | `true` | `true` | PASS |
| migration head | `20260730175527` | `20260730175527` (199 applied) | PASS |

Whole-table totals vs. migration-128 postconditions (arithmetic consistency):

| Table | Now | Deleted by 128 | Post value | 128 postcheck | Result |
|---|---|---|---|---|---|
| `student_requests` | 70 | 37 | 33 | 33 | PASS |
| `student_request_workflow_steps` | 191 | 135 | 56 | 56 | PASS |
| `student_request_workflow_events` | 240 | 157 | 83 | 83 | PASS |
| `student_request_attachment_uploads` | 28 | 20 | 8 | 8 | PASS |
| `student_profiles` | 849 | 1 | 848 | 848 | PASS |
| `student_academic_status` | 851 | 1 | 850 | 850 | PASS |

**No drift. No intersection. R-d CLOSED for this snapshot** — it must be
re-run immediately before apply, because the guard window
(`updated_at > 2026-07-31 04:00:00+00`) only protects against changes after
that timestamp and the totals are exact-match assertions.

## 3. R-e — logical dump / export plan (NOT EXECUTED)

Migration 128 has no rollback after COMMIT. The pre-apply logical export below
is the only recovery path. It is a **plan only**; no dump was executed in this
mission.

Restrict every dump to the 37 candidate IDs (`:cand` = the explicit ID list from
the migration draft, section `INSERT INTO cand_request`).

| # | Table | WHERE filter | Expected rows |
|---|---|---|---|
| 1 | `student_requests` | `id IN (:cand)` | 37 |
| 2 | `student_request_attachment_uploads` | `student_request_id IN (:cand)` | 20 |
| 3 | `student_request_workflow_steps` | `student_request_id IN (:cand)` | 135 |
| 4 | `student_request_workflow_events` | `student_request_id IN (:cand)` | 157 |
| 5 | `b1_draft_mutation_idempotency` | `student_profile_id IN ('7020e51d-…d117e','b1e20002-…0002','65f55997-…eac2')` | 53 |
| 6 | `student_excused_absences` | `absence_excuse_request_id IN (:cand)` | 1 |
| 7 | `student_extra_chances` | `request_id IN (:cand)` | 1 |
| 8 | `file_withdrawal_details` | `request_id IN (:cand)` | 10 |
| 9 | `absence_excuse_details` | `request_id IN (:cand)` | 6 |
| 10 | `enrollment_suspension_details` | `request_id IN (:cand)` | 6 |
| 11 | `extra_chance_details` | `request_id IN (:cand)` | 9 |
| 12 | `transfer_request_details` | `request_id IN (:cand)` | 6 |
| 13 | `student_profiles` | `id = '7020e51d-19e3-4acb-9597-5145b65d117e'` | 1 |
| 14 | `student_academic_status` | `id = 'f864d89a-0017-4051-b627-61e587e946af'` | 1 |
| 15 | `student_enrollments` | `id = 'fb71eb0c-2f44-4deb-99ee-ac79ffdcbc2b'` | 1 |

Mechanism: per-table `COPY (SELECT … WHERE …) TO STDOUT WITH (FORMAT csv, HEADER)`
from a read-only session, written outside the repo. No `pg_dump`, no full dump
(project rule).

Restore limitations (must be accepted before apply):

- Re-insert order is the reverse of the delete order; FKs are `RESTRICT`/`NO ACTION`,
  so parents (`student_profiles` → `student_requests`) must precede children.
- `guard_b1_runtime_mutation_boundary()` blocks re-inserting workflow rows unless
  `b1.atomic_init` is set transaction-locally, and the sandbox role has no write
  privilege at all — restore also requires a privileged forward-only migration.
- Restore reproduces rows, not the auth account or storage bytes.
- Triggers/`updated_at` values may be rewritten on re-insert; the restored data is
  evidence-grade for inspection, not byte-identical.
- Sequences/derived aggregates are not covered (none are in scope for these tables).

**R-e CLOSED as a plan.** Executing the export requires explicit owner approval.

## 4. R-b — storage byte-level export decision

Migration 128 deletes only the **metadata rows** in
`student_request_attachment_uploads`. It issues **no** storage operation; all 20
objects stay physically present in the private bucket
`student-request-secure-attachments`. After metadata deletion they become
**orphaned** — unreferenced, unreachable through the authorize-before-sign RPC
(which resolves coordinates from the metadata row), and removable only through a
separate, separately-approved storage cleanup step.

All 20 objects belong to TEST_ONLY fixtures (profiles `TEST_ONLY_B1_0001` and
`TEST_ONLY_B1_0002`), all `content.pdf`, all in the private bucket:

| # | upload_status | object path (bucket `student-request-secure-attachments`) |
|---|---|---|
| 1 | pending | `student-requests/7020e51d-…d117e/09dabe40-1eb5-432e-b42d-0d05bfe2518e/ef7e6380-bc58-4f20-8fd3-088305719764/content.pdf` |
| 2 | pending | `student-requests/7020e51d-…d117e/24f1c63a-f14e-4595-882b-b6ba4bf52dd4/0402375c-901b-4ef2-955c-7cbacda3c628/content.pdf` |
| 3 | pending | `student-requests/7020e51d-…d117e/24f1c63a-f14e-4595-882b-b6ba4bf52dd4/0581d940-6326-480c-8725-00863c272634/content.pdf` |
| 4 | pending | `student-requests/7020e51d-…d117e/24f1c63a-f14e-4595-882b-b6ba4bf52dd4/c9807811-2282-45fd-b456-80753b7da17d/content.pdf` |
| 5 | pending | `student-requests/7020e51d-…d117e/2b9107e5-548f-4154-8c63-a7c453ff22c8/a17d94ee-cf23-4061-9289-82fb62414028/content.pdf` |
| 6 | pending | `student-requests/7020e51d-…d117e/2b9107e5-548f-4154-8c63-a7c453ff22c8/b0ba9910-18dc-4bc8-9227-fb73ebc45f3d/content.pdf` |
| 7 | pending | `student-requests/7020e51d-…d117e/2b9107e5-548f-4154-8c63-a7c453ff22c8/d2dc486e-52f3-4b84-b1a2-af3ac11fc9b9/content.pdf` |
| 8 | rejected | `student-requests/7020e51d-…d117e/421429ec-f165-4e07-bc3b-278268ec4f33/604e81ac-e853-4eb8-adb3-79c13fddb9b1/content.pdf` |
| 9 | attached | `student-requests/7020e51d-…d117e/421429ec-f165-4e07-bc3b-278268ec4f33/cc9b462c-8bca-4d6e-8fd7-267b11d57261/content.pdf` |
| 10 | attached | `student-requests/7020e51d-…d117e/4953f79c-fcf1-4119-8ef3-a0c6c240534f/06405618-83a2-4cae-bd74-4c198e427b99/content.pdf` |
| 11 | pending | `student-requests/7020e51d-…d117e/acdbcc84-c54b-413a-bea0-ec9b88eeda44/4db6659b-a033-4a4f-a7a2-7b9bd28aa3b1/content.pdf` |
| 12 | pending | `student-requests/7020e51d-…d117e/b093dc3d-9fc8-4b16-a0e6-0b767f597d71/7add82fc-f2ef-4a7d-ae05-49bbec51c3e7/content.pdf` |
| 13 | pending | `student-requests/7020e51d-…d117e/b093dc3d-9fc8-4b16-a0e6-0b767f597d71/ad6204d8-e6ed-4ce0-beed-1eef7186300d/content.pdf` |
| 14 | attached | `student-requests/7020e51d-…d117e/b093dc3d-9fc8-4b16-a0e6-0b767f597d71/b2c983be-5ab1-4961-bd78-edda522a642b/content.pdf` |
| 15 | attached | `student-requests/7020e51d-…d117e/de9e6c7f-eaec-4d32-9e8c-7ce168d542c5/2828f54c-05bd-4703-aa68-933000799a8a/content.pdf` |
| 16 | rejected | `student-requests/7020e51d-…d117e/de9e6c7f-eaec-4d32-9e8c-7ce168d542c5/2cc3c7a3-3e05-48da-9538-185ef1abc8ca/content.pdf` |
| 17 | attached | `student-requests/7020e51d-…d117e/e3cc0366-b6fc-4d64-8c01-541030f83b00/6bb11dbc-66a6-4dda-969e-e4e0e26eaf2e/content.pdf` |
| 18 | attached | `student-requests/b1e20002-…0002/40ccc66a-d638-4c49-8ac6-ac771caea131/3ab89d66-9d74-4cd1-9fe7-8dfaa5b87498/content.pdf` |
| 19 | attached | `student-requests/b1e20002-…0002/40ccc66a-d638-4c49-8ac6-ac771caea131/680a2f3d-dd23-427a-9f58-45a49ffb3691/content.pdf` |
| 20 | attached | `student-requests/b1e20002-…0002/40ccc66a-d638-4c49-8ac6-ac771caea131/dac2772c-0d8b-4056-9383-c249a6f6d2f2/content.pdf` |

(Full untruncated profile IDs: `7020e51d-19e3-4acb-9597-5145b65d117e`,
`b1e20002-0000-4000-8000-000000000002`.)

**Recommendation: byte-level export NOT required.** All 20 objects are synthetic
TEST_ONLY fixture PDFs uploaded by this delivery's harness; they contain no real
student data and no evidentiary value beyond the metadata already captured in the
evidence bundle (122) and the CSV plan in section 3. The bytes are not deleted by
migration 128 and remain retrievable from the private bucket afterwards if ever
needed. **R-b CLOSED — no export required, orphan cleanup deferred to a separate
approved storage step.**

## 5. Confirmations

- No DB write: only `SELECT` statements plus a session-local `TEMP` table used to
  hold the candidate ID list. No DML, no DDL on persistent objects.
- No migration applied; draft remains under `docs/migration-drafts/`, still
  `NOT_APPLIED`; migration head unchanged at `20260730175527`.
- No deploy, no publish, no workflow RPC, no workflow action.
- No visibility change: five B1 services still `student_visible = false`;
  `enrollment_certificate` still `true`.
- No storage object, auth account, evidence, HOLD, legacy or real record touched.

## 6. Final recommendation

**READY_FOR_OWNER_APPLY_APPROVAL**, conditional on two apply-time obligations:

1. Re-run the section-2 revalidation immediately before apply (counts are exact
   assertions; the migration fails closed if anything moved).
2. Execute the section-3 logical export first if the owner wants any recovery
   path — there is none after COMMIT.
