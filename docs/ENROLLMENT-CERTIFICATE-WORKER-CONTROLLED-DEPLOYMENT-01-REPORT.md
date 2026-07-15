# ENROLLMENT_CERTIFICATE_WORKER_CONTROLLED_DEPLOYMENT_01 — REPORT

## 1. Final Decision
`HOLD_ENROLLMENT_CERTIFICATE_WORKER_CONTROLLED_DEPLOYMENT_FAILED`

**Reason:** Publish/Deploy was blocked pre-flight by the platform security gate
because the latest security scan contains **1 unresolved critical finding
unrelated to the enrollment-certificate scope**. Per the mandate
(single publish, no retries, no unrelated remediation, no ignore actions,
no Migration/DDL/DML/Policy/Secret modifications), execution halts here
without a second publish attempt.

## 2. Owner Authorization
Explicit owner approval received for
`ENROLLMENT_CERTIFICATE_WORKER_CONTROLLED_DEPLOYMENT_01`
(single controlled publish, no Saga, no E2E, no touching the blocked trial
request, no Migration/DDL/Storage writes).

## 3. Source & Repository
- GitHub Repository: `msorori-mh/saba-uni-portal`
- Expected source commit: `8f6336ff1e5ff826766b01d60151cbcd313116f2`
- Lovable Production HEAD (verified): `8f6336ff1e5ff826766b01d60151cbcd313116f2` (`Verified readiness, no E2E`)
- **G0 result:** SYNC OK. All required files present.

## 4. Previously-Deployed Version (G1)
Not re-published in this phase; the previously deployed production version
is retained unchanged. No Deployment ID was minted in this phase because
publish did not execute.

## 5. Deployment Result (G7)
- Deployment ID: **N/A — publish did not execute**
- Start / End: **N/A**
- Source commit deployed: **none**
- Production URL: unchanged (`https://saba-uni-portal.lovable.app`,
  `https://quboolye.com`, `https://www.quboolye.com`)
- Publish tool response:
  > "I did not publish because the latest security scan results contain
  > 1 unresolved critical security finding."

## 6. Pre-Publish Baseline (G2) — Read-only SQL
| Check | Result |
|---|---|
| `storage.buckets.official-documents` `public` | `false` |
| `official-documents` `file_size_limit` / `allowed_mime_types` | `NULL` / `NULL` (B4 unchanged) |
| `storage.objects` files in `official-documents` | `0` |
| Policy `official_documents_deny_client_select` | `RESTRICTIVE`, `SELECT`, `{anon,authenticated}`, `bucket_id <> 'official-documents'` |
| `EXECUTE` on `public._ec_new_verification_token()` | `anon=f`, `authenticated=f`, `public=f` |
| `EXECUTE` on `public._ec_sha256_hex(text)` | `anon=f`, `authenticated=f`, `public=f` |
| Blocked request `93807768-…` status | `in_review` |
| Blocked request `updated_at` | `2026-07-13 17:59:19.782271+00` |
| Blocked request official_documents / details / attempts | `0 / 0 / 0` |

**G2 result:** MATCH — production baseline intact.

## 7. Live-Execution Exposure Gate (G3)
| Check | Result |
|---|---|
| `request_types.enrollment_certificate.is_active` | `false` |
| `request_types.enrollment_certificate.student_visible` | `false` |
| Total EC requests other than blocked trial | `1` (`7d5375ab-…`, status `cancelled`, **0 workflow steps**) |
| EC requests currently at `document_issuance` (status `current`, excluding blocked) | `0` |
| EC requests eligible to show the issue button post-publish | `0` |

**G3 result:** PASS — no live production request would expose the issue
button after publish. Hidden E2E submit window remains closed.

## 8. Secrets Verification (G4) — names only, no values
| Secret | Present |
|---|---|
| `SITE_URL` (server-only) | ✅ present |
| `LOVABLE_API_KEY` | ✅ present (managed) |
| `RESEND_API_KEY` | ✅ present (connector-managed) |

Supabase server runtime keys (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_PUBLISHABLE_KEY`) are Lovable Cloud managed runtime injections
(not listed by `fetch_secrets`; expected). `SITE_URL` does not carry the
`VITE_` prefix. No secret values were read, printed, or modified.

**G4 result:** PASS.

## 9. Pre-Deploy Validation (G5)
| Check | Result |
|---|---|
| `bunx tsgo --noEmit` | ✅ 0 errors |
| `bun test enrollment-certificate-worker-storage-implementation-01` | ✅ 16 pass / 0 fail |
| `bun test enrollment-certificate-arabic-pdf-worker-runtime` | ✅ 1 pass / 0 fail |
| `bun run build` | ✅ built in 17.19s |
| Nitro preset / compatibility flags | `cloudflare-module`, `nodejs_compat`, `compatibility_date=2026-07-15` |
| Forbidden APIs in `src/lib/documents` + `src/lib/student-requests` (`node:fs`, `node:path`, `readFileSync`, `process.cwd()`, `example.invalid`, `VITE_PUBLIC_APP_URL`) | ✅ none |
| Client-bundle contains `Cairo-Variable` or `college-logo.jpg` | ✅ none |
| Client-bundle contains literal `SITE_URL` string | ✅ none |
| Client-bundle contains base64 font marker `AAEAAAA` | ✅ none |
| Client-bundle contains name string `SUPABASE_SERVICE_ROLE_KEY` | ⚠️ present only as an env-var *name* in `client.server-*.js` alongside `t={}` — pre-existing chunk unrelated to this phase; no secret value leaked. Out of scope for this deployment; recorded for a future audit. |

**G5 result:** PASS.

## 10. Worker Bundle Size (G6)
Largest server chunks emitted:
- `enrollment-certificate-pdf-storage-saga.functions-…mjs` — **839.21 kB**
- `pdf-lib.mjs` — 480.80 kB
- `pdf-lib__fontkit.mjs` — 1,138.40 kB
- `xlsx.mjs` — 866.53 kB
- `recharts.mjs` — 534.81 kB
- `react-dom.mjs` — 499.25 kB

No CPU/Memory/bundle warnings from the build. Data-module font+logo embed
succeeded (regression test `builds a valid PDF from fixture snapshot with
correct SHA length` passed). Actual Cloudflare account limits were not
enforced because publish did not execute.

**G6 result:** PASS at build level.

## 11. Publish/Deploy Gate (G7)
- Called `preview_ui--publish` **once** with no slug and no metadata change.
- Tool refused: pre-flight security gate reports 1 critical unresolved
  finding.
- **No second attempt was made** (per mandate).
- Blocking finding (verbatim from `security--get_scan_results`):
  - `id`: `EXPOSED_SENSITIVE_DATA`
  - `internal_id`: `faculty_public_email_phone_exposure`
  - `level`: `error`
  - Summary: policy `Public can view active faculty` on `public.faculty`
    exposes `email`/`phone` to `anon` + `authenticated`.
  - Scope: **Unrelated to the enrollment-certificate Worker.**
- No fix, no ignore, no policy change, no Migration executed — all outside
  this phase's authorization.

## 12. Post-Deploy Smoke (G8), Saga Non-Execution (G9), Post-Deploy Security Re-check (G10), Version-Match (G11)
**Not executed.** Publish did not occur, so no post-deploy state to verify.
Production remains on the previously deployed version.

## 13. Non-Mutation Proofs
- ✅ No Migration created or applied in this phase.
- ✅ No DDL/DML executed (all SQL was `SELECT` only).
- ✅ No Secret added, updated, or deleted.
- ✅ No Storage upload, delete, or bucket configuration change.
- ✅ No Saga / Prepare / mark_generating / mark_uploaded / finalize / fail /
  generation attempt / PDF generation / signed URL for a production doc.
- ✅ No interaction with the blocked trial request `93807768-…`.
- ✅ No E2E, no button click, no Server Function invoke.
- ✅ Bucket, Policy, Helper ACL, blocked request rows all unchanged
  post-phase (identical to the G2 baseline table above).

## 14. B4 Status
`B4_NON_BLOCKING_FOR_SINGLE_CONTROLLED_E2E_BUT_REQUIRED_BEFORE_GENERAL_LAUNCH`
— unchanged, not addressed in this phase.

## 15. Remaining Blockers
1. **Unrelated critical security finding**
   `faculty_public_email_phone_exposure` — must be resolved (fix or
   explicit ignore) in a dedicated, separately-authorized phase before
   any Publish/Deploy can proceed, whether for the enrollment-certificate
   Worker or anything else.
2. Pre-existing `client.server-*.js` chunk referencing the name
   `SUPABASE_SERVICE_ROLE_KEY` (name only; value never present). Non-
   blocking but recommended for the next security audit.

## 16. Next Phase
`ENROLLMENT_CERTIFICATE_WORKER_CONTROLLED_DEPLOYMENT_01_RETRY_AFTER_FACULTY_PII_REMEDIATION`
— **do not start automatically.** Requires:
1. A separately-authorized phase to remediate
   `faculty_public_email_phone_exposure` (restrict the public faculty
   policy to non-sensitive columns).
2. Fresh security scan returning zero critical findings.
3. Renewed owner authorization for a new single controlled publish.

Then, on `PASS`, proceed to `ENROLLMENT_CERTIFICATE_WORKER_POST_DEPLOYMENT_INSPECTION_01`.

## 17. Remaining Phases Until Enrollment-Certificate Launch
1. Remediate faculty PII exposure (separate authorized phase).
2. Re-run this controlled deployment (single publish).
3. Post-deployment inspection (read-only, no Saga).
4. Approve Controlled E2E protocol.
5. Select or create a dedicated test request (not the blocked trial).
6. Execute Controlled E2E.
7. Verify Arabic PDF / font / logo / QR + verify URL / SHA-256 + size /
   private upload / Signed URL / issuance + archive.
8. B4 hardening: `file_size_limit`, `allowed_mime_types=['application/pdf']`.
9. Final security audit for the certificate.
10. General service activation approval.

## 18. Remaining Phases Until Final Portal Launch
1. Approve enrollment certificate.
2. Shared foundation for the eight student services.
3. Forms and workflows.
4. E2E per service.
5. Progressive service activation.
6. Academic-councils reports.
7. Academic-affairs reports center.
8. Lecture attendance tracking.
9. Course materials uploads + reports.
10. Migrate course-materials feature into GitHub and merge.
11. Security / data / UI audit.
12. Final approved Publish/Deploy.
13. Post-launch testing and handover.

## 19. Readiness Percentages
| Item | % |
|---|---|
| G3 code/runtime | 100% |
| G3 post-apply security | 100% |
| Worker implementation | 100% |
| Worker readiness | 100% |
| Worker controlled deployment | **0% (blocked pre-flight, no publish executed)** |
| Post-deployment inspection | 0% |
| Enrollment certificate E2E | 0% |
| B4 Storage hardening | 0% (required before general launch) |
| Enrollment certificate launch readiness | ~60% |
| Overall final portal launch readiness | ~30% |

## 20. Publish/Deploy Authorization Status
`PUBLISH_DEPLOY_AUTHORIZATION_CONSUMED_UNSUCCESSFULLY_NO_RETRY_IN_THIS_PHASE`

A new explicit owner authorization is required to attempt this phase again
after the blocking security finding is resolved in its own phase.
