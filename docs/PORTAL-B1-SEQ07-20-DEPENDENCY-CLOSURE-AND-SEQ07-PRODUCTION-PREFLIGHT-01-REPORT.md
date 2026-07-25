# PORTAL-B1-SEQ07-20-DEPENDENCY-CLOSURE-AND-SEQ07-PRODUCTION-PREFLIGHT-01

## Decision

| Gate | Decision |
|---|---|
| SEQ07→SEQ20 dependency closure | **PASS_B1_SEQ07_20_DEPENDENCY_CLOSURE** |
| SEQ07 local PG17 + static review | **PASS** (local; not re-run — SEQ07 SHA stable) |
| SEQ07 Production read-only / preflight | **PASS_B1_SEQ07_PRODUCTION_PREFLIGHT** |
| SEQ07 apply approval readiness | **READY_FOR_SEPARATE_SEQ07_APPLY_APPROVAL** |

Prepared apply package for **SEQ07 alone** is documented below. It remains **documentation only** until a **separate explicit human approval** authorizes SEQ07 only.

PR **#254** remains Draft evidence for SEQ21 and stays **HOLD** (missing `student_request_attachment_uploads` until SEQ07→20 apply). This report does **not** claim SEQ21 is apply-ready.

**No migration applied. No Production DDL/DML. No Gate 25. No activation. No `student_visible`. No Deploy/Publish.**

### Decision change log

| Stage | Decision |
|---|---|
| Prior (no SEQ07-specific RO) | `HOLD_B1_SEQ07_PRODUCTION_READONLY_EVIDENCE_INCOMPLETE` |
| After Lovable `PORTAL-B1-SEQ07-PRODUCTION-READONLY-G4-01-RESULT` | **`PASS_B1_SEQ07_PRODUCTION_PREFLIGHT`** / **`READY_FOR_SEPARATE_SEQ07_APPLY_APPROVAL`** |

---

## G0 — Source pins

| Field | Value |
|---|---|
| Repository | `msorori-mh/saba-uni-portal` |
| Production project | `wpmicqriltrowwonknox` |
| `origin/main` at G5 resume | `765e1a4367a2b12e9d69ad46d9d8eec6c8c999bf` |
| Prior binding tip (local harness era) | `121e5bfbf0e8e21a2740009d29a477b8dda74ddc` (ancestor of current tip) |
| PR #221 merge commit | `c1a6a8e317fcd79ce2a4d19d0e15184ae2dd6ff4` (ancestor of tip) |
| PR #254 HEAD (Draft; do not merge) | `99143eda920c376b75ef4ef61efb60b4bdf28a5c` |
| Production history cutoff (accepted) | latest applied **`20260725002136`** (unchanged; total migrations **151**) |
| SEQ07 LF SHA-256 on `origin/main` | `66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8` (**unchanged**) |
| Worktree / branch | `C:\projects\saba-uni-portal-b1-seq07-preflight-01` / `preflight/b1-seq07-20-dependency-closure-01` |
| Mode | READ-ONLY / PREPARATION-ONLY |

`origin/main` advanced (`121e5bf` → `765e1a4`; tip message “Checked SEQ07 read-only G4-01”, `routeTree.gen.ts` only). **SEQ07 migration bytes / PROMOTION-MAP pin unchanged** → local PG17 harness **not re-run**.

---

## Namespace clarification (not HOLD_AMBIGUOUS)

Two numbering systems coexist and are documented in source of truth:

| System | SEQ07 attachments identity | Payment predecessor |
|---|---|---|
| **PROMOTION-MAP `order` / filename `b1_NN`** | **order 7** / `b1_07_…` | order **19** (= order **20** bridge alias) |
| **Manifest `sequence_order`** | **sequence_order 8** (`plan_order` 7) | **sequence_order 20** |

This mission’s **SEQ07→SEQ20** band uses **PROMOTION-MAP order** (filename `b1_07` … payment guard), matching the SEQ21 blocker language.

**Order 19 = order 20** in `PROMOTION-MAP.json` is an intentional **namespace bridge** (same physical file, same SHA, same verifiers). Unique physical migrations in the band = **13**, not 14.

Stop conditions for ambiguity were evaluated:

| Condition | Result |
|---|---|
| Missing number in unique apply order | none |
| Conflicting different files for one order | none |
| Migration without paired preflight/post-verifier | none |
| SHA unpinned / mismatch on tip | none (13/13 match) |
| Duplicate map rows 19/20 | documented bridge → **accepted**, not ambiguous |

---

## G1 — Official chain table (PROMOTION-MAP order 7→20)

Authoritative sources: `docs/migration-drafts/b1-backend-verifiers/PROMOTION-MAP.json`, `docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json`, promoted files under `supabase/migrations/`, paired verifiers, Contract Freeze / B1 sequential package reports.

All LF SHA-256 values recomputed on `121e5bf` (CR stripped).

| Seq (promo) | Manifest seq | Migration filename | Path | LF SHA-256 | Goal (short) | Objects created/replaced (summary) | Direct deps | Preflight | Post-verifier | Txn | Expected locks | Mutates existing data? | Separate Prod approval? |
|---:|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| **7** | 8 | `20260725110000_b1_07_secure_attachments_source_01.sql` | `supabase/migrations/` | `66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8` | Secure attachment source (bucket + uploads table + RPCs) | `student_request_attachment_uploads`; private bucket; 8 RPCs; identity trigger; storage INSERT policy | Payment confirmation + audit/auth hardening (preflight); sequential pred: EXT-UNI-PAYMENT-CONFIRMATION | `07-…-PREFLIGHT.sql` | `07-…-POST-VERIFIER.sql` | `BEGIN`/`COMMIT` | CREATE TABLE / bucket upsert / function replaces; `FOR UPDATE` on request in RPCs at runtime | **No** historical rewrite | **Yes** |
| 8 | 9 | `20260725110100_b1_08_trusted_reference_validators_05a.sql` | same | `e04d7b0b2d3fa8cd9748796a2a9e59131894fdd726339ced594ba36d836df0a2` | Trusted reference validators | validator functions | SEQ07 | `08-…` | `08-…` | txn-wrapped | function DDL | No | Yes |
| 9 | 10 | `20260725110200_b1_09_excused_absence_vocabulary_05a.sql` | same | `9ecf6c57167a748399edd0798e9b100e3a6ec9bbad4d09975df448f73fa41ae0` | Excused-absence vocabulary (new writes) | CHECK widen + enforce fn | SEQ08 | `09-…` | `09-…` | txn | ALTER CONSTRAINT | No rewrite of historical values | Yes |
| 10 | 11 | `20260725110300_b1_10_excused_absence_detail_05a.sql` | same | `7b9dc57ffef4e69ae79dffbeb42dcc5778dd28b5f3984d0a6d2af894eba0c113` | Excused-absence detail foundation | detail columns/policies/fns | SEQ09 | `10-…` | `10-…` | txn | ALTER/CREATE | No | Yes |
| 11 | 12 | `20260725110400_b1_11_file_withdrawal_details_05a.sql` | same | `d655077c41cd9bc81ac935cfceb152433da3cd13746bd981f6f936c2577492ba` | File-withdrawal detail table | `file_withdrawal_details` + RLS | SEQ10 | `11-…` | `11-…` | txn | CREATE TABLE | No | Yes |
| 12 | 13 | `20260725110500_b1_12_transfer_secure_attachment_05a.sql` | same | `224186f4b9b06b9b57e9460492e7bc74383e8bd18a949bf66b4946aff9d84cd9` | Transfer certificate attachment field | widens `field_key` CHECK; replaces intent/assert fns | **SEQ07 table** + SEQ11 | `12-…` | `12-…` | txn | ALTER CONSTRAINT / REPLACE fn | No | Yes |
| 13 | 14 | `20260725110600_b1_13_final_chance_canonical_write_03.sql` | same | `21406c4ffce2ef22c9ef4115ffc2c8df6e9a54e53a9df5467a01a56ddfc64c70` | Final-chance canonical write | NOT VALID constraints + enforce fns | SEQ12 | `13-…` | `13-…` | txn | ALTER CONSTRAINT | No historical rewrite | Yes |
| 14 | 15 | `20260725110700_b1_14_detail_rpc_write_boundaries_05a.sql` | same | `e2b15df0ff031deb2534957cdd67cbc954965edadefa74f0c2ae6291bed8b57a` | Detail RPC write-boundary primitive | `apply_b1_detail_rpc_write_boundaries()` | SEQ13 | `14-…` | `14-…` | txn | CREATE FUNCTION | No (inert until cutover) | Yes |
| 15 | 16 | `20260725110800_b1_15_service_details_dispatcher_05a.sql` | same | `a1d1e143e89ca457b0776f06d11e0e50f1e8c471e8799debad3ef5dd79d0b8c2` | Five-service details dispatcher | `persist_validated_b1_request_details` | SEQ14 | `15-…` | `15-…` | txn | CREATE FUNCTION | No | Yes |
| 16 | 17 | `20260725110900_b1_16_free_service_workflows_08.sql` | same | `b6034a7f61b8de71c5cd0eb8648c6ff16df4a685dcc43c140f19dfe51ca380ae` | Free-service inactive workflow drafts | draft workflow rows | SEQ15 | `16-…` | `16-…` | txn (DO) | INSERT drafts | Inserts inactive drafts only | Yes |
| 17 | 18 | `20260725111000_b1_17_external_university_payment_workflows_02.sql` | same | `841daba372958e2e7d53d3bc3364dd93cfd67e1b95057c0d58c2a0207c4a8f01` | Paid-service inactive workflow drafts | draft workflow rows | SEQ16 | `17-…` | `17-…` | txn | INSERT drafts | Inserts inactive drafts only | Yes |
| 18 | 19 | `20260725111100_b1_18_detail_acl_cutover_06.sql` | same | `3eb6501f03ccab78ed739253e1ce64f2d5b48ac2b812121397d924f045359e3c` | Detail ACL cutover | privilege/policy cutover via boundaries | SEQ17 | `18-…` | `18-…` | txn | ACL/policy locks | ACL only | Yes |
| **19** | **20** | `20260725120000_b1_confirm_payment_predecessor_guard_01.sql` | same | `e4a9f7f3a9a9fe060fdf325a5aa39e8d3437170b71795ce431ca629166622335` | Confirm-payment predecessor guard | REPLACE `record_external_university_payment_confirmation(uuid,text)` | SEQ18 + payment confirmation | `19-…` | `19-…` | txn | REPLACE FUNCTION | No data DML | Yes |
| **20** | *(bridge)* | **same file as 19** | same | **same SHA** | Namespace bridge only — **do not re-apply** | — | — | same as 19 | same as 19 | — | — | — | N/A (alias) |

Global policies: `batch_apply_forbidden=true`, `max_migrations_per_apply_session=1`, activation gate **25** is non-migration and out of this band.

---

## G2 — First required migration for `student_request_attachment_uploads`

| Question | Answer |
|---|---|
| Creating migration | **SEQ07** `20260725110000_b1_07_secure_attachments_source_01.sql` |
| First unapplied migration needed for the table | **SEQ07** (Production history stops at `20260725002136`; `20260725110000` absent) |
| Later dependents | SEQ12 (field_key widen + intent replace); SEQ21/22 (`b1_attachment_meta_json` / list helpers); SEQ21 official preflight requires the relation |

### Table shape (from SEQ07 SQL)

- Columns: `id`, `student_request_id`→`student_requests`, `student_profile_id`→`student_profiles`, `field_key` CHECK `excuse_documents`, `original_file_name`, `mime_type` ∈ pdf/jpeg/png, `size_bytes` 1..5MiB, `storage_bucket` CHECK private bucket id, `storage_object_path`, `upload_status` ∈ pending/uploaded/attached/rejected, optional `checksum_sha256`, `created_by`→`auth.users`, timestamps, rejection fields  
- UNIQUE `(storage_bucket, storage_object_path)`  
- RLS: **ENABLED**; **REVOKE ALL** from PUBLIC/anon/authenticated (fail-closed; no table policies)  
- Trigger: `protect_student_request_attachment_identity` blocks ownership/path spoof on UPDATE  
- Storage: private bucket `student-request-secure-attachments`; INSERT-only policy `secure_attachment_insert` bound to pending owner row  
- Grants: EXECUTE on listed RPCs to `authenticated` only; anon/PUBLIC revoked  
- Ownership: functions/table created as migration owner (`postgres` in prod convention)

No other migration in 08–20 creates this table; SEQ12 alters it.

---

## G3 — SEQ07 static SQL review

| Requirement | Result |
|---|---|
| Transaction-safe (`BEGIN`/`COMMIT`) | PASS |
| Forward-only / no reset/delete/cleanup | PASS |
| No protected-record mutation | PASS |
| No `student_visible` / activation | PASS |
| No broad admin/dean/registrar bypass | PASS (download requires exact direct assignee + processing binding) |
| No anon grants | PASS |
| No public storage URLs (`public=false`) | PASS |
| RLS fail-closed on uploads table | PASS |
| Functions `SET search_path` | PASS (`public[,storage],pg_temp`) |
| Ownership spoofing blocked | PASS (trigger) |
| No overwrite of existing attachments (`upsert: false` path; UNIQUE path) | PASS |
| No migration-history repair | PASS |

**Documented residual shape (not a rename blocker):**

- SQL `create_student_request_attachment_upload_intent` returns `storage_bucket` + `storage_object_path` in jsonb. Browser server fn strips to `{ attachmentId }` only (`secure-attachments.functions.ts`). Upload uses server admin + `get_owned_*` server-side.  
- `list_my_student_request_attachments` returns `SETOF` table rows (includes coordinates at SQL layer). Browser/list DTO hardening remains an application concern; do not treat as Production apply blocker for this frozen promoted file without a separate forward remediation.

Deferred by design: revoke of authenticated `submit_student_request(uuid)` (live enrollment_certificate path).

---

## G4 — Local PostgreSQL 17 (SEQ07 only)

Harness: `tests/b1-seq07-attachments/run-harness.ps1`  
Image: `postgres:17-alpine` → **17.10**  
Baseline: minimal schema + foundation drafts + release stamp + `20260725002135_…` (payment confirmation present in repo; Production latest is `20260725002136`).

| Step | Result |
|---|---|
| SEQ07 preflight | PASS (3/3) |
| Apply SEQ07 alone | PASS |
| SEQ07 post-verifier | PASS (4/4) |
| Behavioral matrix | **8/8 PASS** |
| Second apply | REFUSED (already exists) |
| Forced failure rollback | PASS (marker absent) |
| SEQ08 in same session | **not executed** |

Behavioral cells: owner intent allow; other student deny + zero mutation; anon deny + zero mutation; ownership spoof trigger deny; unassigned staff download deny; grants fail-closed; private bucket; intent SQL coords documented.

Source-contract: `bun test tests/student-requests/secure-attachments-source-contract.test.ts` → **19 pass / 0 fail**.

---

## G5 — Production read-only (accepted)

Source: Lovable `PORTAL-B1-SEQ07-PRODUCTION-READONLY-G4-01-RESULT` against Production **`wpmicqriltrowwonknox`** (PostgreSQL 17).  
Prompt: `docs/PORTAL-B1-SEQ07-PRODUCTION-READONLY-G4-01-LOVABLE-PROMPT.md`.  
Operator decision line: **`DECISION=PASS_SEQ07_PROD_RO`**.

Independent acceptance checklist (this resume; SELECT-evidence review only):

| Required check | Evidence accepted | Verdict |
|---|---|---|
| Production ref = `wpmicqriltrowwonknox` | Report target header | PASS |
| SEQ07 migration SHA matches pin | LF SHA `66ba4c96…` ✅ exact | PASS |
| SEQ07 not applied | `seq07_version_rows=0`; `%b1_07_secure_attachments%=0`; latest still `20260725002136`; total **151** | PASS |
| No partial objects | table/trigger/9 functions/storage policy/bucket all ABSENT; no conflicting same-name relation | PASS |
| Prior dependencies present | atomic submit, payment confirmation, storage catalog, student_requests/profiles, `log_audit(text,uuid,text,jsonb,jsonb,text,uuid)` | PASS |
| Five services hidden | all five `student_visible=false`, active workflows 0, workflows 0 | PASS |
| Five-service requests = 0 | all five request counts 0 | PASS |
| Protected records stable | digests identical to SEQ21 G4 baseline (G6) | PASS |
| No Production write | NO DDL/DML/apply/repair/RPC invoke/Deploy/activation/`student_visible` | PASS |

### A — Migration history

| Check | Evidence | Result |
|---|---|---|
| version `20260725110000` | `seq07_version_rows = 0` | ABSENT_EXPECTED |
| latest applied | `20260725002136` | UNCHANGED |
| total applied | `151` | UNCHANGED |
| `%b1_07_secure_attachments%` | `0` | NONE |

### B — No partial SEQ07 creation

| Object | State |
|---|---|
| `public.student_request_attachment_uploads` | ABSENT |
| any schema relation same name | ABSENT (0) |
| trigger `protect_student_request_attachment_identity` | ABSENT |
| all 9 SEQ07 functions | ABSENT |
| storage policy `secure_attachment_insert` | ABSENT |
| bucket `student-request-secure-attachments` | ABSENT |

Zero partial apply. No conflicting table definition.

### C — Prior dependencies

| Dependency | State |
|---|---|
| `submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])` | PRESENT |
| `record_external_university_payment_confirmation(uuid,text)` | PRESENT |
| `storage.buckets` / `storage.objects` | PRESENT |
| `public.student_requests` / `public.student_profiles` | PRESENT |
| `public.log_audit` (7-arg signature) | PRESENT (not invoked) |

SEQ07 creates `student_request_attachment_uploads` — absence of that table is expected and is **not** a SEQ07 blocker (contrast SEQ21).

### D — Grants / policies

No grants on the absent uploads table; no anon EXECUTE on SEQ07 RPCs (absent). Pre-existing public content buckets (`news-images`, `faculty-images`, `department-images`, `events-images`, `research-pdfs`) are unrelated; no secure-attachment public URL surface.

### E — Five services

| Service | student_visible | active workflows | total workflows | student_requests |
|---|---|---|---|---|
| department_transfer | false | 0 | 0 | 0 |
| enrollment_suspension | false | 0 | 0 | 0 |
| excused_absence | false | 0 | 0 | 0 |
| file_withdrawal | false | 0 | 0 | 0 |
| final_chance | false | 0 | 0 | 0 |

### G — Non-write attestation

Accepted: SELECT/catalog only. Official SEQ07 preflight/post-verifier SQL were **not** executed in the Lovable RO gate (both are ROLLBACK-terminated companions for the future apply session).

Non-blocking note from Lovable: operator tree tip `d58b0dbb` ≠ mandated main SHA at their session — superseded for this resume by recomputing SEQ07 SHA on `origin/main` `765e1a4` (**match**).

---

## G6 — Protected records (read-only; non-sensitive)

From SEQ07 Lovable G4-01 (identical to SEQ21 baseline):

| record | status | updated_at | digest(md5 status+updated_at) | vs SEQ21 |
|---|---|---|---|---|
| SR-20260713-2DE64041 | in_review | 2026-07-13 17:59:19.782271+00 | `c49518ae2ed2c26dda23ac16539cf534` | identical |
| SR-20260715-FEDCB3E1 | completed | 2026-07-16 03:05:57.517147+00 | `806b9995a8036ae8fc3d00b59598ae11` | identical |
| SR-20260716-26BAD4C8 | completed | 2026-07-16 04:44:29.338193+00 | `3a3b6136cb2cf50c9594b2cdb981a174` | identical |
| USR-2026-000001 | archived | 2026-07-16 03:05:57.517147+00 | `ba8ff47b98d29ec9a992ad52325b83e3` | identical |
| USR-2026-000002 | archived | 2026-07-16 04:44:29.338193+00 | `f337d9efbd6184c155b7b45f6e02293e` | identical |

Exactly one row each. Re-check required after any future SEQ07 apply session (not authorized here).

---

## G7 — SEQ07 apply package (**DOCUMENTATION ONLY — DO NOT EXECUTE**)

```
ONE MIGRATION ONLY = SEQ07
FORBIDDEN IN THIS PACKAGE:
  SEQ08→SEQ20
  SEQ21→SEQ24
  Gate 25
  Deploy / Publish
  activation
  student_visible changes
  migration history repair
  reset / cleanup / delete
```

### Identity

| Field | Value |
|---|---|
| Exact filename | `20260725110000_b1_07_secure_attachments_source_01.sql` |
| Repository path | `supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql` |
| Exact LF SHA-256 | `66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8` |

### Pre-apply read-only checks

1. ~~Complete `PORTAL-B1-SEQ07-PRODUCTION-READONLY-G4-01`~~ → **PASS** (accepted this resume)  
2. Immediately before apply: re-run official preflight SQL (ROLLBACK): `docs/migration-drafts/b1-backend-verifiers/07-B1_07_SECURE_ATTACHMENTS_SOURCE_01-PREFLIGHT.sql`  
3. Reconfirm LF SHA-256 `66ba4c96…` on the exact operator checkout  
4. Reconfirm five services still hidden; five-service request count = 0  
5. Recapture protected-record digests (must match G6)

### Exact apply command (not executed)

```powershell
# DOCUMENTATION ONLY — requires separate explicit SEQ07 human approval
# Target: production project wpmicqriltrowwonknox AFTER approval. NOT authorized by this package.

$migrationPath = 'supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql'
$expectedSha  = '66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8'

# 1) Verify LF SHA-256 of $migrationPath == $expectedSha
# 2) Apply ONE file only inside a single transaction (psql -1 / BEGIN..COMMIT already in file)
# 3) Do NOT pass --include-all, do NOT batch SEQ08+, do NOT repair history

# Example shape (operator-controlled; choose the approved channel):
#   supabase db execute --project-ref wpmicqriltrowwonknox -f $migrationPath
# OR psql single-file with ON_ERROR_STOP after SHA gate.
```

### Post-apply (after future approval)

1. `07-…-POST-VERIFIER.sql` (ROLLBACK)  
2. Protected-record recheck (digests unchanged)  
3. Migration history contains exactly `20260725110000` as new tip (or next version row for that file) with no SEQ08+ rows  
4. Stop on any ERROR / PARTIAL / digest drift  

### Stop conditions

- Any preflight failure  
- SHA mismatch  
- Partial object set  
- Protected-record digest delta  
- Accidental SEQ08+ apply  
- Any attempt to activate / flip `student_visible`

### Forward-only remediation

No down migration. No DELETE of production attachment objects. Remediate only via a **new reviewed forward migration**.

---

## G8 — Explicit non-actions

- Did **not** apply SEQ07 (or SEQ08→24) — including this G5 resume  
- Did **not** write Production  
- Did **not** repair migration history  
- Did **not** run Gate 25 / activation / `student_visible`  
- Did **not** Deploy/Publish  
- Did **not** re-run local PG17 (SEQ07 SHA unchanged on `origin/main`)  
- Did **not** rewrite PR #254 to claim SEQ21 readiness  

---

## Assumptions

- Production latest history row `20260725002136` / total **151** remains valid until the authorized SEQ07 apply session.  
- Repo `20260725002135_…` remains an adequate local baseline surrogate for pre-SEQ07 payment-confirmation presence.  
- PROMOTION-MAP order-20 bridge will never be applied as a second physical migration.  
- Lovable G4-01 SELECT evidence is truthful and complete for the listed catalog probes.

## Risks

- Time gap between this RO snapshot and a future apply session could admit concurrent catalog drift — re-run official SEQ07 preflight + digest recheck immediately before apply.  
- Intent SQL returns storage coordinates; browser strips on create path — list SQL still returns full rows (application residual; not a Production RO blocker).  
- Manifest `sequence_order` ≠ promotion-map `order` for this band (+1) — operators must use filename/SHA, not integer alone.

## Obstacles

- Agent session has no direct Production SQL access; G5 closure depends on accepted Lovable SELECT evidence (now available).

## Production impact

**Zero** from this preparation track. SEQ07 apply remains unauthorized until separate human approval.

## Files touched (this prep)

| Path | Role |
|---|---|
| `docs/PORTAL-B1-SEQ07-20-DEPENDENCY-CLOSURE-AND-SEQ07-PRODUCTION-PREFLIGHT-01-REPORT.md` | This report |
| `docs/PORTAL-B1-SEQ07-PRODUCTION-READONLY-G4-01-LOVABLE-PROMPT.md` | Production RO prompt |
| `tests/b1-seq07-attachments/run-harness.ps1` | Local SEQ07-only PG17 harness |
| `tests/b1-seq07-attachments/pg/20-behavioral.sql` | Local behavioral matrix |

---

## Final decision codes

```
PASS_B1_SEQ07_20_DEPENDENCY_CLOSURE
PASS_B1_SEQ07_PRODUCTION_PREFLIGHT
READY_FOR_SEPARATE_SEQ07_APPLY_APPROVAL
```

**Still forbidden without a new explicit approval:** applying SEQ07, SEQ08→24, Gate 25, activation, `student_visible`, Deploy/Publish, history repair.
