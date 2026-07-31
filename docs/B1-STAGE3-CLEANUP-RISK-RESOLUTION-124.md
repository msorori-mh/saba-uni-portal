# B1-STAGE3 — CLEANUP RISK RESOLUTION (124)

**Mission:** `B1_STAGE3_CLEANUP_MANIFEST_RISK_RESOLUTION_NO_EXECUTION-124`
**Mode:** READ-ONLY RISK RESOLUTION + DOCS UPDATE ONLY — **NO CLEANUP EXECUTED**
**Snapshot:** 2026-07-31 (UTC), production, `SELECT` only
**Input:** `docs/B1-STAGE3-CLEANUP-ID-MANIFEST-123.md`
**Companions:** `docs/B1-STAGE3-EVIDENCE-BUNDLE-122.md`, `docs/B1-STAGE3-CLEANUP-INVENTORY-122.md`

---

## 0. Invariants verified in this snapshot

| Item | Verified value |
|---|---|
| Migration head | `20260730175527` ✅ unchanged |
| `enrollment_suspension` / `excused_absence` / `department_transfer` / `final_chance` / `file_withdrawal` `student_visible` | `false` (all five) |
| `enrollment_certificate.student_visible` | `true` — untouched, no code/data change |
| Database writes this mission | **none** (read-only `SELECT`) |
| Migration / deploy / publish | **none** |
| Workflow RPC / action execution | **none** |
| Storage objects deleted | **none** |
| Change type | **docs-only** (this file + risk section of manifest 123) |

---

## 1. R1 — SR-20260727-695EC35B

| Field | Value |
|---|---|
| request_id | `36714880-7709-439e-b3d3-6446f3b0f5f9` |
| Service | `excused_absence` |
| Student | TEST_ONLY_B1_0003 (`65f55997-6fd0-40d0-9235-70ac65afeac2`) |
| Status | `completed` |
| Steps | 3 / 3 completed — `student_affairs_intake` (2026-07-29 21:20:25Z), `manager_review` (21:36:00Z), `record_apply` (22:18:08Z) |
| Events | 5 |
| Attachments | 1 (`b70847be-6a2f-40ba-851f-890c2c4e6db2`, `attached`) |
| Effect row | `student_excused_absences.33ed9e39-2f29-4bfb-8633-0fd203a1c2ba`, created 2026-07-29 22:18:08Z (same instant as `record_apply`) |

### Classification — **A) evidence-to-keep**

Rationale: it is a fully completed B1 workflow with a persisted academic effect row and a complete step/event chain, verified read-only in Mission-56 (`PORTAL-B1-EXCUSED-ABSENCE-FINAL-POST-TRANSITION-READONLY-VERIFICATION-56`). It is the earlier, independently verified excused_absence execution and corroborates the Stage-2 run. Deleting it would destroy verification evidence that a prior owner mission relied on.

**Recommendation (conservative):** keep permanently. Excluded from every executable batch, together with its attachment row, its storage object, its 3 steps, its 5 events, its `absence_excuse_details` row, and its effect row. Do-not-delete status is now equal to the six §2.1 evidence requests.

---

## 2. R2 — SR-20260727-F67CF366

| Field | Value |
|---|---|
| request_id | `d70cef24-2f2e-4bac-9125-47c22e8ab8d8` |
| Service | `enrollment_suspension` |
| Student | TEST_ONLY_B1_0002 (`b1e20002-0000-4000-8000-000000000002`) |
| Status | `submitted` (open / in-flight) |
| Steps | 3 total — `initial_review` **active**, `manager_approval` pending, `registrar_apply` pending; 0 completed |
| Events | 1 (`submitted`, 2026-07-27 20:29:55Z) |
| Attachments | 0 |
| Detail row | `enrollment_suspension_details` 1 row |
| Effects | **none** (no academic status row produced by this request; no effect table reference) |
| Last update | 2026-07-27 20:29:55Z — untouched for 4 days |

### Classification — **B) abandoned submitted fixture requiring an explicit cancel/cleanup plan later**

Rationale: it is open with an active first step and zero staff progress, so deleting it silently would remove an in-flight workflow row rather than a terminal artefact. It produced no effect, so it is not evidence either. The correct future path is an explicit, separately approved cancel (through the supported cancellation path, not DML) followed by cleanup — or an owner decision to keep it as a live in-flight fixture.

**Action in this mission:** none. Not cancelled, not modified. Moved from executable Batch B to **HOLD**.

---

## 3. R3 — storage object path export (20 cleanup-candidate objects)

Bucket for all rows: **`student-request-secure-attachments`** (private; no public URL, no `getPublicUrl` path). Export/list documented here only; **no object deleted, moved, or signed**.

| # | request_number | upload_status | object path | classification |
|---|---|---|---|---|
| 1 | SR-20260727-03DDF561 | attached | `student-requests/b1e20002-0000-4000-8000-000000000002/40ccc66a-d638-4c49-8ac6-ac771caea131/3ab89d66-9d74-4cd1-9fe7-8dfaa5b87498/content.pdf` | cleanup-candidate |
| 2 | SR-20260727-03DDF561 | attached | `student-requests/b1e20002-0000-4000-8000-000000000002/40ccc66a-d638-4c49-8ac6-ac771caea131/680a2f3d-dd23-427a-9f58-45a49ffb3691/content.pdf` | cleanup-candidate |
| 3 | SR-20260727-03DDF561 | attached | `student-requests/b1e20002-0000-4000-8000-000000000002/40ccc66a-d638-4c49-8ac6-ac771caea131/dac2772c-0d8b-4056-9383-c249a6f6d2f2/content.pdf` | cleanup-candidate |
| 4 | SR-20260727-15BF8956 | pending | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/acdbcc84-c54b-413a-bea0-ec9b88eeda44/4db6659b-a033-4a4f-a7a2-7b9bd28aa3b1/content.pdf` | cleanup-candidate |
| 5 | SR-20260727-44334F5D | attached | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/e3cc0366-b6fc-4d64-8c01-541030f83b00/6bb11dbc-66a6-4dda-969e-e4e0e26eaf2e/content.pdf` | cleanup-candidate |
| 6 | SR-20260727-5710AFB4 | attached | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/b093dc3d-9fc8-4b16-a0e6-0b767f597d71/b2c983be-5ab1-4961-bd78-edda522a642b/content.pdf` | cleanup-candidate |
| 7 | SR-20260727-5710AFB4 | pending | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/b093dc3d-9fc8-4b16-a0e6-0b767f597d71/7add82fc-f2ef-4a7d-ae05-49bbec51c3e7/content.pdf` | cleanup-candidate |
| 8 | SR-20260727-5710AFB4 | pending | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/b093dc3d-9fc8-4b16-a0e6-0b767f597d71/ad6204d8-e6ed-4ce0-beed-1eef7186300d/content.pdf` | cleanup-candidate |
| 9 | SR-20260727-5F154B51 | pending | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/09dabe40-1eb5-432e-b42d-0d05bfe2518e/ef7e6380-bc58-4f20-8fd3-088305719764/content.pdf` | cleanup-candidate |
| 10 | SR-20260727-6FC487C8 | attached | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/de9e6c7f-eaec-4d32-9e8c-7ce168d542c5/2828f54c-05bd-4703-aa68-933000799a8a/content.pdf` | cleanup-candidate |
| 11 | SR-20260727-6FC487C8 | rejected | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/de9e6c7f-eaec-4d32-9e8c-7ce168d542c5/2cc3c7a3-3e05-48da-9538-185ef1abc8ca/content.pdf` | cleanup-candidate |
| 12 | SR-20260727-7341CD80 | attached | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/421429ec-f165-4e07-bc3b-278268ec4f33/cc9b462c-8bca-4d6e-8fd7-267b11d57261/content.pdf` | cleanup-candidate |
| 13 | SR-20260727-7341CD80 | rejected | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/421429ec-f165-4e07-bc3b-278268ec4f33/604e81ac-e853-4eb8-adb3-79c13fddb9b1/content.pdf` | cleanup-candidate |
| 14 | SR-20260727-97BD982D | pending | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/24f1c63a-f14e-4595-882b-b6ba4bf52dd4/0402375c-901b-4ef2-955c-7cbacda3c628/content.pdf` | cleanup-candidate |
| 15 | SR-20260727-97BD982D | pending | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/24f1c63a-f14e-4595-882b-b6ba4bf52dd4/0581d940-6326-480c-8725-00863c272634/content.pdf` | cleanup-candidate |
| 16 | SR-20260727-97BD982D | pending | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/24f1c63a-f14e-4595-882b-b6ba4bf52dd4/c9807811-2282-45fd-b456-80753b7da17d/content.pdf` | cleanup-candidate |
| 17 | SR-20260727-9F00443A | attached | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/4953f79c-fcf1-4119-8ef3-a0c6c240534f/06405618-83a2-4cae-bd74-4c198e427b99/content.pdf` | cleanup-candidate |
| 18 | SR-20260727-FE7796D9 | pending | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/2b9107e5-548f-4154-8c63-a7c453ff22c8/d2dc486e-52f3-4b84-b1a2-af3ac11fc9b9/content.pdf` | cleanup-candidate |
| 19 | SR-20260727-FE7796D9 | pending | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/2b9107e5-548f-4154-8c63-a7c453ff22c8/b0ba9910-18dc-4bc8-9227-fb73ebc45f3d/content.pdf` | cleanup-candidate |
| 20 | SR-20260727-FE7796D9 | pending | `student-requests/7020e51d-19e3-4acb-9597-5145b65d117e/2b9107e5-548f-4154-8c63-a7c453ff22c8/a17d94ee-cf23-4061-9289-82fb62414028/content.pdf` | cleanup-candidate |

### Evidence-linked objects — DO NOT DELETE (not in the 20 above)

| request_number | attachment_id | classification |
|---|---|---|
| SR-20260727-695EC35B | `b70847be-6a2f-40ba-851f-890c2c4e6db2` | evidence-linked (R1 resolution: keep) |
| Evidence requests §2.1 of manifest 123 | remaining 7 attachment rows | evidence-linked |

Total attachment upload rows in the database = 28 → 20 cleanup-candidate + 8 evidence-linked. Objects belonging to non-TEST_ONLY profiles (e.g. `SR-20260727-3E20EA8D`, profile `51b9c5e9-…`) are structurally out of scope and appear in no batch.

**Storage hold:** the 20 paths above stay on HOLD until a byte-level export of exactly these paths is produced and stored outside the bucket. No object was listed via any public URL, none was signed, none was deleted.

---

## 4. Resulting executable batch counts (HOLD applied, still not executed)

| Batch | Content | Manifest 123 | HOLD | Executable after resolution |
|---|---|---|---|---|
| A | attachment rows | 20 | 20 (pending storage export) | 0 until export documented |
| A | storage objects | 20 | 20 | 0 until export documented |
| B | non-evidence TEST_ONLY requests | 38 | 1 (SR-20260727-F67CF366) | **37** |
| C | workflow steps | 138 | 3 | **135** |
| C | workflow events | 158 | 1 | **157** |
| D | service detail rows | 38 | 1 (`enrollment_suspension_details`) | **37** |
| D | effect rows | 2 | 0 | 2 |
| E | idempotency rows | 53 | 0 | 53 |
| F | profile 0001 + account + 2 rows | 1+1+2 | 0 | 1+1+2 |

SR-20260727-695EC35B was never inside any batch (manifest §2.3) and remains outside after this resolution — now as a permanent evidence record rather than a provisional exclusion.

---

## 5. Complete HOLD / DO-NOT-DELETE list after this mission

- Evidence requests: SR-20260727-78427CC5, -50BEDCE2, -88D885F0, -40E3E66B, -42393846, -3C550070
- Evidence (R1, promoted): SR-20260727-695EC35B
- HOLD (R2, open fixture): SR-20260727-F67CF366
- Protected legacy: SR-20260713-2DE64041, SR-20260715-FEDCB3E1, SR-20260716-26BAD4C8, USR-2026-000001, USR-2026-000002
- Profiles: TEST_ONLY_B1_0002, TEST_ONLY_B1_0003
- Storage: all 20 candidate objects HOLD until export; 8 evidence-linked objects permanent keep
- `enrollment_certificate` data and configuration: entirely out of scope

---

## 6. Remaining risks

| # | Risk | State |
|---|---|---|
| R1 | SR-20260727-695EC35B classification | **RESOLVED** — evidence-to-keep, permanent exclusion |
| R2 | SR-20260727-F67CF366 open submitted fixture | **RESOLVED to HOLD** — needs an explicit cancel-then-cleanup decision; not deletable as-is |
| R3 | Storage bytes unrecoverable | **RESOLVED to HOLD** — 20 exact paths documented; execution blocked until an export exists |
| R4 | ID drift if new TEST_ONLY activity occurs | Open — re-verify the full ID list immediately before any execution, fail closed on mismatch |
| R5 | FK cascade reaching evidence | Open — enforce the manifest §10 order; never cascade from `student_profiles` |

No technical blocker prevented this resolution.

---

**FINAL DECISION: PASS_B1_STAGE3_CLEANUP_RISKS_RESOLVED_READY_FOR_OWNER_CLEANUP_APPROVAL**
