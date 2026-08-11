# PORTAL-MOBILE-PUBLIC-BACKEND-BRIDGE-LONGRUN-04

## Mission Report

**Mission:** `PORTAL-MOBILE-PUBLIC-BACKEND-BRIDGE-LONGRUN-04`  
**Branch:** `feat/mobile-public-api-bridge-01`  
**Worktree:** `C:\projects\saba-uni-portal-mobile-api-bridge`  
**Mode:** BACKEND SOURCE IMPLEMENTATION — PUBLIC MOBILE-SAFE CONTRACTS  
**Consumer:** Flutter Student Mobile App  

```
START_SHA=2bbf43378bf71497d7ebabbcd00671e271ef683c
MAIN_SHA=2bbf43378bf71497d7ebabbcd00671e271ef683c
FINAL_SHA=<filled after commit>
```

---

## Capability status

| Capability | Status |
|------------|--------|
| DOCUMENT_DOWNLOAD | `READY_PUBLIC_API` — `POST /api/mobile/v1/official-documents/download` |
| CERTIFICATE_PDF | `HOLD` — staff-only `document_issuance` / `issue_document`; students download issued/archived only |
| ACADEMIC_PROGRESS | `READY_PUBLIC_API` — shared `computeStudentProgress` |
| TRANSCRIPT | `READY_PUBLIC_API` — student-self JWT only (no foreign profile id) |
| COURSE_MATERIALS | `READY_PUBLIC_API` — list + signed download |
| PUSH_TOKEN_REGISTRATION | `SOURCE_READY` — migration + RPCs (not applied) |

```
MIGRATION_CREATED=YES (20260812010000_mobile_push_token_registration_01.sql)
MIGRATION_APPLIED=NO

SERVICE_ROLE_EXPOSED=NO
PRODUCTION_WRITE=0
PRODUCTION_RPC_MUTATION=0
DEPLOY=NO
MERGE=NO
```

---

## Architecture

Preferred order honored:

1. **Postgres RPC** — push token register/revoke/touch  
2. **Authenticated HTTP** — `/api/mobile/v1/*` TanStack server handlers (stable paths; **not** createServerFn names)  
3. No Edge Functions directory existed; not introduced for this bridge  

Shared domain:

- `mintOfficialDocumentSignedUrl` reused by web createServerFn + mobile HTTP  
- `computeStudentProgress` exported and reused by mobile academic progress  
- Course materials audience + scan gate reused from `materials-audience` / shared helpers  

---

## G1 audit summary

| Symbol | Classification |
|--------|----------------|
| getMyProgress | SAFE_TO_WRAP → wrapped |
| getUnofficialTranscriptData | SAFE_TO_WRAP → student-self mine wrapper |
| listStudentCourseMaterials / getCourseMaterialDownloadUrl | SAFE_TO_WRAP → wrapped |
| getEnrollmentCertificateDocumentSignedUrl | SAFE_TO_WRAP → shared mint |
| buildEnrollmentCertificatePdfBytes | NODE_SERVER_ONLY / NOT_SAFE_TO_EXPOSE |
| getStudentRequestFeeProcessingContext | EXISTING_RPC — staff; NOT exposed to student mobile |

---

## CERTIFICATE_PDF HOLD blocker (exact)

PDF generation is authorized only for staff actors who can `issue_document` on the active `document_issuance` step (`executeEnrollmentCertificatePdfStorageSaga` + SECURITY DEFINER prepare/act chain). Students never hold that authorization. Exposing generation to Flutter would change the lifecycle contract. Mobile uses **official document download** after staff issuance.

---

## Security review

| Invariant | Result |
|-----------|--------|
| SERVICE_ROLE_IN_FLUTTER | NO |
| CROSS_STUDENT_ACCESS | DENY (studentSelfOnly + resolveOwnStudentProfile) |
| DRAFT_DOCUMENT_DOWNLOAD | DENY |
| CANCELLED_DOCUMENT_DOWNLOAD | DENY |
| PRIVATE_BUCKET_PUBLICATION | NO (signed URLs only; 60s / 180s) |
| RAW_STACK_TRACE_TO_CLIENT | NO (`sanitizeClientMessage` / mapped families) |
| RAW_SQL_ERROR_TO_CLIENT | NO |

Push token SECURITY DEFINER RPCs: fixed `search_path`, revoke from PUBLIC/anon, grant EXECUTE to authenticated only, bind to `auth.uid()`, RLS own-row SELECT, no client INSERT/UPDATE/DELETE.

---

## Artifacts

| Artifact | Path |
|----------|------|
| API docs | `docs/mobile/MOBILE-PUBLIC-API-V1.md` |
| Flutter contract | `docs/mobile/MOBILE-PUBLIC-API-V1-FLUTTER-CONTRACT.json` |
| Migration | `supabase/migrations/20260812010000_mobile_push_token_registration_01.sql` |
| Tests | `tests/mobile-api/*` |
| Lib | `src/lib/mobile-api/*` |
| Routes | `src/routes/api.mobile.v1.*.ts` |

---

## Validation

```
TESTS=PASS (tests/mobile-api 17/17 + tests/student-requests 1071/1071)
TYPECHECK=PASS (tsc --noEmit)
BUILD=PASS (bun run build)
PG17=PASS (disposable postgres:17 push-token harness)
DIFF_CHECK=PASS
```

---

## Production boundaries

- No production apply / write / deploy / main merge  
- No fake staff accounts  
- No touch of existing production requests/documents  

## Verdict

`PASS_PORTAL_MOBILE_PUBLIC_BACKEND_BRIDGE_LONGRUN_04_SOURCE_READY`

(Certificate PDF generation remains HOLD within that source-ready bridge; documented above.)
