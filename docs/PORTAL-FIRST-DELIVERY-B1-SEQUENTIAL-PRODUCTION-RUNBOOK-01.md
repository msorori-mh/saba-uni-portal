# PORTAL-FIRST-DELIVERY-B1-SEQUENTIAL-PRODUCTION-RUNBOOK-01

**DOCUMENTATION ONLY — NOT AUTHORIZED TO EXECUTE.**

This runbook describes the forward-only Production sequence after source merge of SEQ07-B.
It does **not** authorize, schedule, or perform any Production/Staging write, cloud migration apply, bucket create, Deploy, Publish, activation, `student_visible`, Gate 25, or SEQ08 Production apply.

Binding companion sources:

- `docs/migration-drafts/b1-backend-verifiers/PROMOTION-MAP.json`
- `docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json`
- `docs/b1/B1-SEQ07-B-SEQUENTIAL-MANIFEST-ADDENDUM-01.json`
- `docs/PORTAL-B1-SEQ07-B-ALTERNATE-APPLY-PACKAGE-PREFLIGHT-01-REPORT.md`
- `docs/PORTAL-B1-SEQ07-B-LOVABLE-EXECUTION-PACKAGE-01.md`

---

## Global rules (every stage)

| Rule | Binding |
|---|---|
| Max migrations per apply session | **1** |
| Batch / parallel / CI auto-apply | **Forbidden** |
| History proof | Object-level catalog evidence only; never invent `schema_migrations` rows |
| Repair / reset / delete / down-migration | **Forbidden** |
| Remediation | Forward-only reviewed follow-up only |
| Protected records | enrollment_certificate workflow v2; historical absence reasons; historical chance_type aliases; audit_logs history; uploaded attachment objects — no rewrite/backfill/delete |
| Hidden services | Until Gate 25: five B1 services remain `status='draft'` / `is_active=false` / not student-visible |
| Separate approval boundary | Each stage below requires its **own** explicit human approval after the prior stage’s post-verifier + protected-record + hidden-services checks pass |

### Universal stop conditions

- Any preflight failure
- Any apply error
- Any post-verifier failure
- Any PARTIAL / AMBIGUOUS object vs history state
- Any protected-record invariant violation
- Any unexpected service visibility / activation drift
- Any attempt to apply superseded original SEQ07 (`20260725110000`) on Lovable after SEQ07-B

On stop: halt the entire sequence; do **not** continue to later orders; classify; remediate only by forward-only reviewed package.

### Universal post-stage checks

1. Post-verifier companion (READ ONLY / ROLLBACK)
2. Protected-record digests / counts unchanged for out-of-scope surfaces
3. Hidden-services check (five B1 services still draft/inactive/not student-visible) until Gate 25
4. Record evidence; only then request approval for the next stage

---

## Stage 1 — SEQ07-B B0 (Storage tool; non-migration)

| Field | Value |
|---|---|
| Exact identity | Bucket id/name `student-request-secure-attachments` |
| SHA / version | N/A (non-migration Storage tool) |
| Channel | Lovable managed Storage tool |
| Required contract | `public=false`; `file_size_limit=5242880`; MIME `application/pdf`,`image/jpeg`,`image/png`; no public URL; no broad policies |
| Preflight | Fresh Production RO: bucket absent **or** already exact private contract; uploads table absent; tip/digests stable; SEQ07/`20260725110000` not falsely APPLIED |
| Apply | Create/update bucket to exact private contract only |
| Post-verifier | Confirm bucket row matches contract; uploads/RPCs still absent |
| Protected records | Unchanged |
| Hidden-services | Unchanged (still hidden) |
| Stop conditions | Public bucket; wrong MIME/size; broad policies; any SQL migration applied in same session |
| Forward-only remediation | Correct via Storage tool only; no SQL DELETE of production data |
| Approval boundary | **Separate** approval for B0 only; does not authorize B1 |

---

## Stage 2 — SEQ07-B B1 (SQL-only secure attachments)

| Field | Value |
|---|---|
| Exact file | `supabase/migrations/20260725110050_b1_07b_secure_attachments_sql_only_01.sql` |
| Version | `20260725110050` |
| LF SHA-256 | `a49d615b11949f3c8594b282d2241e9dbd2d7be42d37bb5ac4b1d1952ddd4eec` |
| Superseded (do not apply) | `20260725110000_b1_07_secure_attachments_source_01.sql` · LF SHA `66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8` |
| Channel | Lovable managed migration runner (SQL without `storage.buckets` DML) |
| Preflight | `docs/migration-drafts/b1-backend-verifiers/07B-B1_07B_SECURE_ATTACHMENTS_SQL_ONLY_01-PREFLIGHT.sql` |
| Apply | **Only** this one migration |
| Post-verifier | `…/07B-B1_07B_SECURE_ATTACHMENTS_SQL_ONLY_01-POST-VERIFIER.sql` (+ optional original `07-…-POST-VERIFIER.sql` for equivalence) |
| History proof | `20260725110050` present once; `20260725110000` remains absent |
| Protected records | Unchanged |
| Hidden-services | Still hidden |
| Stop conditions | B1 without exact private bucket; runner rejects SQL; false APPLIED for `20260725110000`; partial SQL objects without history; any SEQ08+ in session |
| Forward-only remediation | If txn rolled back: fix then re-run B1; if committed+verifier fail: STOP, classify, forward package only — no repair/delete |
| Approval boundary | **Separate** from B0; does **not** authorize SEQ08 |

---

## Stage 3 — SEQ08 → SEQ20 (one migration per approved session)

For each row: preflight → apply **one** → post-verifier → protected records → hidden-services → stop if any fail → separate approval for the next row.

| Order | File | Version | LF SHA-256 | Preflight | Post-verifier |
|---:|---|---|---|---|---|
| 8 | `20260725110100_b1_08_trusted_reference_validators_05a.sql` | `20260725110100` | `e04d7b0b2d3fa8cd9748796a2a9e59131894fdd726339ced594ba36d836df0a2` | `08-…-PREFLIGHT.sql` | `08-…-POST-VERIFIER.sql` |
| 9 | `20260725110200_b1_09_excused_absence_vocabulary_05a.sql` | `20260725110200` | `9ecf6c57167a748399edd0798e9b100e3a6ec9bbad4d09975df448f73fa41ae0` | `09-…-PREFLIGHT.sql` | `09-…-POST-VERIFIER.sql` |
| 10 | `20260725110300_b1_10_excused_absence_detail_05a.sql` | `20260725110300` | `7b9dc57ffef4e69ae79dffbeb42dcc5778dd28b5f3984d0a6d2af894eba0c113` | `10-…-PREFLIGHT.sql` | `10-…-POST-VERIFIER.sql` |
| 11 | `20260725110400_b1_11_file_withdrawal_details_05a.sql` | `20260725110400` | `d655077c41cd9bc81ac935cfceb152433da3cd13746bd981f6f936c2577492ba` | `11-…-PREFLIGHT.sql` | `11-…-POST-VERIFIER.sql` |
| 12 | `20260725110500_b1_12_transfer_secure_attachment_05a.sql` | `20260725110500` | `224186f4b9b06b9b57e9460492e7bc74383e8bd18a949bf66b4946aff9d84cd9` | `12-…-PREFLIGHT.sql` | `12-…-POST-VERIFIER.sql` |
| 13 | `20260725110600_b1_13_final_chance_canonical_write_03.sql` | `20260725110600` | `21406c4ffce2ef22c9ef4115ffc2c8df6e9a54e53a9df5467a01a56ddfc64c70` | `13-…-PREFLIGHT.sql` | `13-…-POST-VERIFIER.sql` |
| 14 | `20260725110700_b1_14_detail_rpc_write_boundaries_05a.sql` | `20260725110700` | `e2b15df0ff031deb2534957cdd67cbc954965edadefa74f0c2ae6291bed8b57a` | `14-…-PREFLIGHT.sql` | `14-…-POST-VERIFIER.sql` |
| 15 | `20260725110800_b1_15_service_details_dispatcher_05a.sql` | `20260725110800` | `a1d1e143e89ca457b0776f06d11e0e50f1e8c471e8799debad3ef5dd79d0b8c2` | `15-…-PREFLIGHT.sql` | `15-…-POST-VERIFIER.sql` |
| 16 | `20260725110900_b1_16_free_service_workflows_08.sql` | `20260725110900` | `b6034a7f61b8de71c5cd0eb8648c6ff16df4a685dcc43c140f19dfe51ca380ae` | `16-…-PREFLIGHT.sql` | `16-…-POST-VERIFIER.sql` |
| 17 | `20260725111000_b1_17_external_university_payment_workflows_02.sql` | `20260725111000` | `841daba372958e2e7d53d3bc3364dd93cfd67e1b95057c0d58c2a0207c4a8f01` | `17-…-PREFLIGHT.sql` | `17-…-POST-VERIFIER.sql` |
| 18 | `20260725111100_b1_18_detail_acl_cutover_06.sql` | `20260725111100` | `3eb6501f03ccab78ed739253e1ce64f2d5b48ac2b812121397d924f045359e3c` | `18-…-PREFLIGHT.sql` | `18-…-POST-VERIFIER.sql` |
| 19 / manifest 20 | `20260725120000_b1_confirm_payment_predecessor_guard_01.sql` | `20260725120000` | `e4a9f7f3a9a9fe060fdf325a5aa39e8d3437170b71795ce431ca629166622335` | `19-…-PREFLIGHT.sql` | `19-…-POST-VERIFIER.sql` |

Verifier paths live under `docs/migration-drafts/b1-backend-verifiers/`.

| Per-stage field | Binding |
|---|---|
| Apply channel | Lovable managed migration runner; one file only |
| SEQ08 predecessor | Object proof: uploads table + private bucket (SEQ07 **or** SEQ07-B). Do **not** require version `20260725110000` |
| Protected records | Universal set above; no historical vocabulary rewrite |
| Hidden-services | Workflow drafts from 16/17 remain `status='draft'`, `is_active=false` |
| Stop conditions | Universal + predecessor object missing + any batch attempt |
| Forward-only remediation | Reviewed forward migration only; no repair |
| Approval boundary | **One order per approval**; never approve SEQ08–20 as a batch |

Namespace note: promotion-map order **19** ≡ manifest sequence_order **20** (payment predecessor guard). Order **20** bridge in PROMOTION-MAP is the same file — do not apply twice.

---

## Stage 4 — SEQ21 → SEQ24 (one migration per approved session)

| Order | File | Version | LF SHA-256 | Preflight | Post-verifier |
|---:|---|---|---|---|---|
| 21 | `20260725130000_b1_21_secure_read_contracts_01.sql` | `20260725130000` | `cd71670022c534d15639c530acd4135b72a15cb053debf554d90c6e2405385ca` | `21-…-PREFLIGHT.sql` | `21-…-POST-VERIFIER.sql` |
| 22 | `20260725140000_b1_22_secure_draft_mutations_01.sql` | `20260725140000` | `da6754dc3b9e6830f666321447558227612e616ec592f312d092fff0f009d242` | `22-…-PREFLIGHT.sql` | `22-…-POST-VERIFIER.sql` |
| 23 | `20260725150000_b1_23_transfer_department_scope_position_assignment_01.sql` | `20260725150000` | `4bc35f9b1e17c9dc6155b6b7c26d4ba6b8cf203297e66bcf9c8771e358130c85` | `23-…-PREFLIGHT.sql` | `23-…-POST-VERIFIER.sql` |
| 24 | `20260725160000_b1_24_file_withdrawal_impact_ack_null_guard_01.sql` | `20260725160000` | `67257aa9201538b1a4691ec4602e1ae4dcbd7a2f2b511dcac1da8a714ae9d70b` | `24-…-PREFLIGHT.sql` | `24-…-POST-VERIFIER.sql` |

| Per-stage field | Binding |
|---|---|
| Apply channel | Lovable managed migration runner; one file only |
| Notes | 21 = secure reads only (no draft writes); 22 = draft create/save (submit remains atomic RPC); 23 = transfer department scope; 24 = null-safe withdrawal ack guards |
| Protected records / hidden-services | Universal; services still not activated |
| Stop conditions | Universal; any premature activation/visibility |
| Forward-only remediation | Reviewed forward package only |
| Approval boundary | Separate per order; **does not** authorize Gate 25 |

---

## Stage 5 — Authorization matrices (readiness documentation)

| Matrix | Purpose | When |
|---|---|---|
| Student intent / upload / download | Owner-only intents; anon denied; other-student denied; spoof denied | After SEQ07-B B1 (and re-check after SEQ12/21 as applicable) |
| Staff download assignment | Unassigned staff denied; assigned path per secure-read contracts | After SEQ21 |
| Actor / step actions | `act_on_b1_student_request_step_atomic` role boundaries | After SEQ16–18 |
| Payment confirmation | `record_external_university_payment_confirmation` predecessor guards; no ledger fields | After SEQ19/20 |
| Draft mutations | Secure draft create/save ACL; submit remains separate | After SEQ22 |
| Transfer scope | Department/position assignment alignment | After SEQ23 |

These matrices are **verification checklists**, not apply steps. Failures are stop conditions for the related stage’s post-verifier / behavioral proof.

---

## Stage 6 — Gate 25 (activation; non-migration)

| Field | Value |
|---|---|
| Exact identity | B1 activation / student visibility gate (Gate 25) |
| File / SHA | **Not a migration entry** in PROMOTION-MAP |
| Channel | Separate reviewed activation procedure (not this runbook’s apply channel) |
| Preflight | SEQ07-B through SEQ24 all verified green; auth matrices green; protected records stable; no open PARTIAL |
| Apply | Explicit activation of intended services only under separate approval |
| Post-verifier | Service catalog shows intended `is_active` / visibility only for approved codes; others remain hidden |
| Protected records | Unchanged for out-of-scope workflows |
| Hidden-services check | Becomes selective — only approved services leave hidden state |
| Stop conditions | Any SEQ07-B…24 gap; any auth matrix failure; any unexpected mass visibility |
| Forward-only remediation | Deactivation / forward corrective package only — no history rewrite |
| Approval boundary | **Hard separate** from SEQ24; never bundled with migrations or Deploy |

---

## Stage 7 — Deploy / Smoke (post-activation)

| Field | Value |
|---|---|
| Exact identity | Application Deploy + smoke against Production runtime |
| Channel | Normal release pipeline **after** Gate 25 approval evidence |
| Preflight | Gate 25 evidence attached; CI green on release SHA; no pending migration PARTIAL |
| Apply | Deploy approved release only |
| Post-verifier / smoke | Student happy-path per activated services; staff inbox/actions; attachment intent/download deny matrix; payment confirm path if enabled; no public attachment URLs |
| Protected records | enrollment_certificate and historical data unchanged |
| Hidden-services | Non-activated B1 services remain hidden |
| Stop conditions | Smoke failure; visibility leak; storage public URL leak; auth matrix regression |
| Forward-only remediation | Hotfix forward release only; no migration repair from Deploy track |
| Approval boundary | **Separate** from Gate 25 and from every migration stage |

---

## Forbidden (entire runbook)

- Production/Staging writes from this document alone
- Applying original SEQ07 `20260725110000` on Lovable Cloud
- SEQ08 Production apply in the same session as B0/B1
- Batch apply of SEQ08→SEQ24
- Gate 25 / activation / `student_visible` without its own approval
- Deploy/Publish without Gate 25 evidence
- `migration repair`, manual `schema_migrations` inserts, reset/hard delete cleanup

---

## Status of this document

```
DOCUMENTATION_ONLY
NO_PRODUCTION_EXECUTION
REQUIRES_SEPARATE_PER_STAGE_HUMAN_APPROVAL
```
