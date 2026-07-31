# B1-STAGE3 — EXACT CLEANUP ID MANIFEST (123)

**Mission:** `B1_STAGE3_PREPARE_EXACT_CLEANUP_ID_MANIFEST_NO_EXECUTION-123`
**Mode:** READ-ONLY DB INSPECTION + DOCS MANIFEST ONLY — **NO CLEANUP EXECUTED**
**Snapshot:** 2026-07-31 (UTC), production, `SELECT` only
**Companions:** `docs/B1-STAGE3-EVIDENCE-BUNDLE-122.md`, `docs/B1-STAGE3-CLEANUP-INVENTORY-122.md`

---

## 0. Invariants verified in this snapshot

| Item | Verified value |
|---|---|
| Migration head | `20260730175527` ✅ unchanged |
| `enrollment_suspension.student_visible` | `false` |
| `excused_absence.student_visible` | `false` |
| `department_transfer.student_visible` | `false` |
| `final_chance.student_visible` | `false` |
| `file_withdrawal.student_visible` | `false` |
| `enrollment_certificate.student_visible` | `true` — untouched, no code/data change |
| Database writes this mission | **none** (read-only) |
| Migration / deploy / publish this mission | **none** |
| Workflow RPC / action execution | **none** |
| Change type | **docs-only** (this single new file) |

---

## 1. Scope definition

TEST_ONLY population (`student_profiles.academic_number LIKE 'TEST_ONLY_B1_%'`):

| Profile | profile_id | user_id | requests |
|---|---|---|---|
| TEST_ONLY_B1_0001 | `7020e51d-19e3-4acb-9597-5145b65d117e` | `2e3ca4d6-603c-4f06-a23e-462bf92fcfd3` | 35 |
| TEST_ONLY_B1_0002 | `b1e20002-0000-4000-8000-000000000002` | `57e805dc-f975-4834-b1cb-f99c09756980` | 5 |
| TEST_ONLY_B1_0003 | `65f55997-6fd0-40d0-9235-70ac65afeac2` | `3a279561-f8e6-41d9-b8ca-ce60682c9eab` | 5 |

Total TEST_ONLY requests: **45**. Candidate set = TEST_ONLY requests **minus** every do-not-delete / protected record below = **38**.

---

## 2. DO-NOT-DELETE exclusion proof

### 2.1 Evidence requests (excluded by explicit request_number match)

| request_number | request_id | present in candidate set? |
|---|---|---|
| SR-20260727-78427CC5 | `ee24e59d-a05f-454e-b4bd-de8023eb6835` | NO |
| SR-20260727-50BEDCE2 | `85edca41-6bf8-4cec-b3bf-f9c5130fd771` | NO |
| SR-20260727-88D885F0 | `d8aba0e3-ae3b-4fab-ab49-1697b1e94a3a` | NO |
| SR-20260727-40E3E66B | `66908bb6-7b38-4488-b4d2-75a4243f7a2b` | NO |
| SR-20260727-42393846 | `7d600a3b-8d17-4a6b-a27a-7a98625d06c4` | NO |
| SR-20260727-3C550070 | `b9193b39-e30c-401c-9729-1836b6555843` | NO |

### 2.2 Protected legacy records

SR-20260713-2DE64041, SR-20260715-FEDCB3E1, SR-20260716-26BAD4C8, USR-2026-000001, USR-2026-000002 — none belong to a `TEST_ONLY_B1_%` profile, therefore structurally outside the candidate filter, and additionally excluded by explicit number match.

### 2.3 Additional protection applied by this manifest (agent-initiated, conservative)

| request_number | request_id | Why protected |
|---|---|---|
| SR-20260727-695EC35B | `36714880-7709-439e-b3d3-6446f3b0f5f9` | Mission-56 verified completed excused_absence with academic effect row `student_excused_absences.33ed9e39-2f29-4bfb-8633-0fd203a1c2ba`. Treated as evidence; **excluded from all batches** pending explicit owner instruction. |

### 2.4 Profiles / accounts excluded

- TEST_ONLY_B1_0002 (`b1e20002-…-000000000002`) — profile, `auth` user, and `student_academic_status` rows: **NOT candidates** (FK parents of evidence).
- TEST_ONLY_B1_0003 (`65f55997-…`) — same: **NOT candidates**.
- Only their **non-evidence child request rows** (3 rows, listed in Batch B) are candidates.

### 2.5 Real / non-TEST_ONLY data

Every batch is filtered by `student_profile_id ∈ {the three TEST_ONLY profile ids}`. No row outside that set appears in any batch. `enrollment_certificate` data, workflow configuration, staff, programs, and courses are out of scope entirely.

---

## 3. Candidate counts by batch

| Batch | Content | Count |
|---|---|---|
| A | TEST_ONLY attachment upload rows + secure storage objects, non-evidence | 20 |
| B | Non-evidence TEST_ONLY requests (draft / cancelled / completed exploratory / submitted) | 38 |
| C | Workflow steps (138) + workflow events (158) for Batch B only | 296 |
| D | Service-specific detail + effect rows for Batch B only | 40 |
| E | Orphan draft form-data / idempotency rows (`b1_draft_mutation_idempotency`) | 53 |
| F | TEST_ONLY_B1_0001 profile + account + its remaining rows | 1 profile + 1 user + 3 rows |

Batch D breakdown: `absence_excuse_details` 6, `enrollment_suspension_details` 7, `extra_chance_details` 9, `transfer_request_details` 6, `file_withdrawal_details` 10, plus effect rows in §7.

---

## 4. Batch B — non-evidence TEST_ONLY requests (exact IDs)

Reason eligible for every row: belongs to a TEST_ONLY profile, is not in §2.1/§2.2/§2.3, and produced no evidence cited in `docs/B1-STAGE3-EVIDENCE-BUNDLE-122.md`.

### B.1 — TEST_ONLY_B1_0001 (35 rows)

| # | request_number | request_id | service | status | steps | events | att |
|---|---|---|---|---|---|---|---|
| 1 | SR-20260727-0106E11C | `30482047-e7e4-4e5a-accd-5a9a097d9e14` | final_chance | completed | 5 | 8 | 0 |
| 2 | SR-20260727-058FD839 | `f2a8e4bb-b305-4dc9-8ec7-570a2c35c993` | file_withdrawal | completed | 7 | 9 | 0 |
| 3 | SR-20260727-0917B700 | `47e6eefe-7ff4-48a0-9c50-bf10af63a99a` | final_chance | completed | 5 | 8 | 0 |
| 4 | SR-20260727-15BF8956 | `acdbcc84-c54b-413a-bea0-ec9b88eeda44` | excused_absence | cancelled | 0 | 0 | 1 |
| 5 | SR-20260727-1A2EAC5E | `dea68f8a-9fa8-4525-9685-745212604ec7` | department_transfer | draft | 0 | 0 | 0 |
| 6 | SR-20260727-1D4022A1 | `96eec10e-5552-40b6-9a40-61011a68e798` | file_withdrawal | draft | 0 | 0 | 0 |
| 7 | SR-20260727-216510DF | `70ea684d-fe11-4505-8d94-73f035770b39` | final_chance | completed | 5 | 8 | 0 |
| 8 | SR-20260727-34806E2D | `fda9e39c-ab82-44e2-aef6-0b422d401e0e` | final_chance | cancelled | 5 | 1 | 0 |
| 9 | SR-20260727-3FB77E5F | `24b7ba1f-04c9-44c1-a188-52f74ef908bb` | final_chance | cancelled | 5 | 6 | 0 |
| 10 | SR-20260727-3FD03446 | `0f7f11f3-1cdd-492e-a971-5d4479c7e155` | file_withdrawal | cancelled | 7 | 6 | 0 |
| 11 | SR-20260727-407AE418 | `7df02398-bf56-4c75-b63b-f5ec20e39360` | file_withdrawal | completed | 7 | 9 | 0 |
| 12 | SR-20260727-44334F5D | `e3cc0366-b6fc-4d64-8c01-541030f83b00` | excused_absence | completed | 3 | 4 | 1 |
| 13 | SR-20260727-4532F769 | `85d7068a-8443-4a96-b3bb-b7c658616820` | file_withdrawal | completed | 7 | 8 | 0 |
| 14 | SR-20260727-491F8309 | `ade49963-0a68-4c87-a24b-5e067c1be7fd` | file_withdrawal | cancelled | 7 | 1 | 0 |
| 15 | SR-20260727-5710AFB4 | `b093dc3d-9fc8-4b16-a0e6-0b767f597d71` | excused_absence | completed | 3 | 4 | 3 |
| 16 | SR-20260727-5F154B51 | `09dabe40-1eb5-432e-b42d-0d05bfe2518e` | department_transfer | cancelled | 0 | 0 | 1 |
| 17 | SR-20260727-6FC487C8 | `de9e6c7f-eaec-4d32-9e8c-7ce168d542c5` | excused_absence | completed | 3 | 5 | 2 |
| 18 | SR-20260727-72610DE6 | `27e5d06b-c1c6-45d6-b96d-cbf89e18e697` | enrollment_suspension | completed | 3 | 4 | 0 |
| 19 | SR-20260727-7341CD80 | `421429ec-f165-4e07-bc3b-278268ec4f33` | department_transfer | completed | 6 | 9 | 2 |
| 20 | SR-20260727-754812CE | `c876eb00-4677-4b7b-ba8f-d8a15392f0df` | enrollment_suspension | cancelled | 3 | 1 | 0 |
| 21 | SR-20260727-7CE38765 | `4cf1fda2-0218-4403-a676-a6697b08aa34` | file_withdrawal | completed | 7 | 8 | 0 |
| 22 | SR-20260727-80B5739A | `53710937-4a69-4fc6-96b1-c2727c551c6e` | file_withdrawal | completed | 7 | 9 | 0 |
| 23 | SR-20260727-8CE10383 | `e8f72662-5dd6-45d2-9bab-555c39f7a136` | enrollment_suspension | completed | 3 | 4 | 0 |
| 24 | SR-20260727-96245A20 | `bf38217e-9edb-4527-bde2-dc30e56a9f47` | final_chance | cancelled | 5 | 1 | 0 |
| 25 | SR-20260727-97BD982D | `24f1c63a-f14e-4595-882b-b6ba4bf52dd4` | department_transfer | cancelled | 0 | 0 | 3 |
| 26 | SR-20260727-9F00443A | `4953f79c-fcf1-4119-8ef3-a0c6c240534f` | department_transfer | completed | 6 | 8 | 1 |
| 27 | SR-20260727-A2C3678F | `54b96b02-872d-4c8e-b326-98e3e4986afa` | file_withdrawal | completed | 7 | 9 | 0 |
| 28 | SR-20260727-A99E2634 | `c3acb770-2a89-441a-93cd-d0ff882a3e4b` | enrollment_suspension | completed | 3 | 5 | 0 |
| 29 | SR-20260727-ADD5838A | `d3f5be81-0760-459b-8d30-a3377ab33aa1` | final_chance | cancelled | 5 | 6 | 0 |
| 30 | SR-20260727-CB3833D1 | `37093986-4030-499f-9377-9301f3403a2f` | final_chance | draft | 0 | 0 | 0 |
| 31 | SR-20260727-E0DB6A55 | `9e97eeac-640b-4778-ba72-3463c1c438d3` | enrollment_suspension | completed | 3 | 5 | 0 |
| 32 | SR-20260727-E388053F | `0277c36b-462f-410c-830b-6960a01dd163` | enrollment_suspension | completed | 3 | 4 | 0 |
| 33 | SR-20260727-E46C7742 | `6c4ca023-11d4-41e9-91ce-55d353795909` | final_chance | completed | 5 | 7 | 0 |
| 34 | SR-20260727-F08CEC55 | `30b5af9e-533a-428d-a166-43eeebc03d82` | excused_absence | draft | 0 | 0 | 0 |
| 35 | SR-20260727-FE7796D9 | `2b9107e5-548f-4154-8c63-a7c453ff22c8` | excused_absence | cancelled | 0 | 0 | 3 |

### B.2 — child rows of protected profiles (3 rows; profiles themselves are NOT candidates)

| # | request_number | request_id | profile | service | status | steps | events | att |
|---|---|---|---|---|---|---|---|---|
| 36 | SR-20260727-03DDF561 | `40ccc66a-d638-4c49-8ac6-ac771caea131` | TEST_ONLY_B1_0002 | department_transfer | draft | 0 | 0 | 3 |
| 37 | SR-20260727-85E124BE | `7fce2743-1940-488d-b434-aba98967985d` | TEST_ONLY_B1_0002 | file_withdrawal | draft | 0 | 0 | 0 |
| 38 | SR-20260727-F67CF366 | `d70cef24-2f2e-4bac-9125-47c22e8ab8d8` | TEST_ONLY_B1_0002 | enrollment_suspension | submitted | 3 | 1 | 0 |

> Row 38 is an open (`submitted`) request. If the owner wants a live in-flight fixture retained, exclude row 38 explicitly.

---

## 5. Batch A — attachment rows + storage objects (20)

Table: `public.student_request_attachment_uploads` (PK `id`).
Storage bucket for all rows: **`student-request-secure-attachments`** (private; no public URL).
Object path pattern: `student-requests/<profile_id>/<request_id>/<attachment_id>/content.pdf`.

| attachment_id | parent request_id | parent request_number |
|---|---|---|
| `b2c983be-5ab1-4961-bd78-edda522a642b` | `b093dc3d-…f597d71` | SR-20260727-5710AFB4 |
| `7add82fc-f2ef-4a7d-ae05-49bbec51c3e7` | `b093dc3d-…f597d71` | SR-20260727-5710AFB4 |
| `ad6204d8-e6ed-4ce0-beed-1eef7186300d` | `b093dc3d-…f597d71` | SR-20260727-5710AFB4 |
| `06405618-83a2-4cae-bd74-4c198e427b99` | `4953f79c-…c240534f` | SR-20260727-9F00443A |
| `6bb11dbc-66a6-4dda-969e-e4e0e26eaf2e` | `e3cc0366-…1030f83b00` | SR-20260727-44334F5D |
| `d2dc486e-52f3-4b84-b1a2-af3ac11fc9b9` | `2b9107e5-…3ff22c8` | SR-20260727-FE7796D9 |
| `b0ba9910-18dc-4bc8-9227-fb73ebc45f3d` | `2b9107e5-…3ff22c8` | SR-20260727-FE7796D9 |
| `a17d94ee-cf23-4061-9289-82fb62414028` | `2b9107e5-…3ff22c8` | SR-20260727-FE7796D9 |
| `0402375c-901b-4ef2-955c-7cbacda3c628` | `24f1c63a-…b6ba4bf52dd4` | SR-20260727-97BD982D |
| `0581d940-6326-480c-8725-00863c272634` | `24f1c63a-…b6ba4bf52dd4` | SR-20260727-97BD982D |
| `c9807811-2282-45fd-b456-80753b7da17d` | `24f1c63a-…b6ba4bf52dd4` | SR-20260727-97BD982D |
| `4db6659b-a033-4a4f-a7a2-7b9bd28aa3b1` | `acdbcc84-…8ebeda44` | SR-20260727-15BF8956 |
| `ef7e6380-bc58-4f20-8fd3-088305719764` | `09dabe40-…0d05bfe2518e` | SR-20260727-5F154B51 |
| `2cc3c7a3-3e05-48da-9538-185ef1abc8ca` | `de9e6c7f-…168d542c5` | SR-20260727-6FC487C8 |
| `2828f54c-05bd-4703-aa68-933000799a8a` | `de9e6c7f-…168d542c5` | SR-20260727-6FC487C8 |
| `604e81ac-e853-4eb8-adb3-79c13fddb9b1` | `421429ec-…268ec4f33` | SR-20260727-7341CD80 |
| `cc9b462c-8bca-4d6e-8fd7-267b11d57261` | `421429ec-…268ec4f33` | SR-20260727-7341CD80 |
| `3ab89d66-9d74-4cd1-9fe7-8dfaa5b87498` | `40ccc66a-…71caea131` | SR-20260727-03DDF561 |
| `680a2f3d-dd23-427a-9f58-45a49ffb3691` | `40ccc66a-…71caea131` | SR-20260727-03DDF561 |
| `dac2772c-0d8b-4056-9383-c249a6f6d2f2` | `40ccc66a-…71caea131` | SR-20260727-03DDF561 |

Full object path for any row = `student-requests/{7020e51d-19e3-4acb-9597-5145b65d117e | b1e20002-0000-4000-8000-000000000002}/{request_id}/{attachment_id}/content.pdf`.

Proof of exclusion: total attachment upload rows in the database = 28; the 8 not listed here belong to evidence requests (§2.1) and SR-20260727-695EC35B and are **not** candidates.

Rollback note: storage objects are synthetic TEST_ONLY PDFs; they can be re-uploaded through the normal secure upload path but the original bytes are not recoverable after deletion. Take a bucket export of exactly these 20 object paths before any future execution.

---

## 6. Batch C — workflow steps and events (Batch B only)

| Table | PK | Filter | Count |
|---|---|---|---|
| `public.student_request_workflow_steps` | `id` | `student_request_id IN (Batch B 38 ids)` | 138 |
| `public.student_request_workflow_events` | `id` | `student_request_id IN (Batch B 38 ids)` | 158 |

Exclusion proof: totals in the database are 191 steps / 240 events; the difference (53 steps / 82 events) belongs to evidence, protected legacy, and non-TEST_ONLY requests and is untouched by this filter.

---

## 7. Batch D — service-specific rows (Batch B only)

| Table | Key column | Count |
|---|---|---|
| `absence_excuse_details` | `request_id` | 6 |
| `enrollment_suspension_details` | `request_id` | 7 |
| `extra_chance_details` | `request_id` | 9 |
| `transfer_request_details` | `request_id` | 6 |
| `file_withdrawal_details` | `request_id` | 10 |

Effect rows produced by Batch B requests (also candidates, delete before their parent request):

| Table | row id | request_id | parent request |
|---|---|---|---|
| `student_extra_chances` | `b2137c6e-7566-4ddc-8994-bf15321b33be` | `30482047-e7e4-4e5a-accd-5a9a097d9e14` | SR-20260727-0106E11C |
| `student_excused_absences` | `383d4630-359b-4ad9-a33d-8c4c040ec899` | `de9e6c7f-eaec-4d32-9e8c-7ce168d542c5` | SR-20260727-6FC487C8 |

Effect rows explicitly **NOT** candidates: `student_extra_chances.f8d8b87a-623f-4bc0-a612-c8403d9d597b` (SR-20260727-40E3E66B), `student_excused_absences.2a61d3f0-2139-4b99-9ab4-52cf6954cfd0` (SR-20260727-78427CC5), `student_excused_absences.33ed9e39-2f29-4bfb-8633-0fd203a1c2ba` (SR-20260727-695EC35B).

---

## 8. Batch E — draft/idempotency rows (53)

Table: `public.b1_draft_mutation_idempotency` (composite key `student_profile_id, operation, idempotency_key`).
Filter: `student_profile_id IN (three TEST_ONLY profile ids)` → 53 rows, **all** of which have `request_id` pointing at a Batch B request.

Exclusion proof (measured): rows referencing an evidence request = **0**; rows with `request_id IS NULL` = **0**; rows for TEST_ONLY_B1_0002/0003 = **0** (all 53 belong to TEST_ONLY_B1_0001).

Rollback note: purely an idempotency guard cache; deletion has no business effect and no recreation is needed.

---

## 9. Batch F — TEST_ONLY_B1_0001 profile and account

Eligible only after batches A–E complete, because every remaining reference belongs to Batch B/D/E.

| Table / object | ID | Notes |
|---|---|---|
| `student_profiles` | `7020e51d-19e3-4acb-9597-5145b65d117e` | academic_number `TEST_ONLY_B1_0001` |
| `auth.users` | `2e3ca4d6-603c-4f06-a23e-462bf92fcfd3` | via approved account-removal path only |
| `student_academic_status` | `f864d89a-0017-4051-b627-61e587e946af` | `withdrawn`, created 2026-07-27 07:20:59Z |
| `student_enrollments` | 1 row for this profile | resolve exact id at execution time |

Reference audit for this profile (measured now): requests 35 (all Batch B), academic_status 1, enrollments 1, official_documents 0, notifications 0, user_roles 0, excused_absence effect 1 (Batch D), extra_chance effect 1 (Batch D). **Zero references from any evidence record.**

`student_academic_status` rows that are **NOT** candidates: `5bb91e82-…` and `93e6afd6-…` (TEST_ONLY_B1_0003), `cc7248b5-…` and `adec0796-…` (TEST_ONLY_B1_0002 — includes the Option B `active` fixture).

Rollback note: the profile and account are synthetic fixtures and can be recreated by the documented TEST_ONLY provisioning steps, but the original UUIDs cannot be restored.

---

## 10. Dependency order for a future, separately approved execution

```text
1. A  storage objects           (20 objects, secure removal path only)
2. A  attachment upload rows    (20 rows)
3. D  effect rows               (student_extra_chances 1, student_excused_absences 1)
4. D  service detail rows       (38 rows across 5 detail tables)
5. C  workflow events           (158 rows)
6. C  workflow steps            (138 rows)
7. E  idempotency rows          (53 rows)
8. B  student_requests          (38 rows, explicit id list)
9. F  student_academic_status + student_enrollments for 0001
10. F student_profiles 0001, then the auth account
```

Deletion must be by **explicit ID list only** — no `LIKE` mass delete, no `TRUNCATE`, no cascade from profiles.

---

## 11. Expected counts before / after (not executed)

| Table | Before | Expected after (all batches) | Delta |
|---|---|---|---|
| `student_requests` | 70 | 32 | −38 |
| `student_request_workflow_steps` | 191 | 53 | −138 |
| `student_request_workflow_events` | 240 | 82 | −158 |
| `student_request_attachment_uploads` | 28 | 8 | −20 |
| `b1_draft_mutation_idempotency` | 53 | 0 | −53 |
| `student_academic_status` | 851 | 850 | −1 |
| `student_profiles` (TEST_ONLY) | 3 | 2 | −1 |
| Evidence requests (6) | 6 | 6 | 0 |
| Protected legacy records (5) | 5 | 5 | 0 |
| `enrollment_certificate` data | unchanged | unchanged | 0 |

---

## 12. Risks and blockers

| # | Risk | Mitigation |
|---|---|---|
| R1 | SR-20260727-695EC35B is a completed request with a real effect row but is absent from the owner's do-not-delete list | Excluded from all batches in this manifest; owner must confirm classification before it is ever deleted |
| R2 | Batch B row 38 (SR-20260727-F67CF366) is an open `submitted` request | Flag explicitly at approval; drop from the list if a live fixture is wanted |
| R3 | Storage bytes are not recoverable | Export the 20 listed object paths before execution |
| R4 | Manifest IDs could drift if new TEST_ONLY activity occurs | Re-verify the full ID list immediately before execution; fail closed on any mismatch |
| R5 | FK cascade could reach evidence if profiles are deleted first | Enforce the §10 order; never cascade from `student_profiles` |

No technical blocker prevents preparing this manifest.

---

**FINAL DECISION: PASS_B1_STAGE3_CLEANUP_ID_MANIFEST_READY_FOR_OWNER_DECISION**
