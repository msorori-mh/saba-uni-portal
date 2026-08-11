# Mobile Public API v1

**Mission:** PORTAL-MOBILE-PUBLIC-BACKEND-BRIDGE-LONGRUN-04  
**Consumer:** Flutter Student Mobile App  
**Auth:** Supabase user session JWT (`Authorization: Bearer <access_token>`)  
**Version:** `v1`

Flutter must **never** embed `service_role`, database passwords, admin credentials, or private storage privileged keys.

---

## Transport preference

| Prefer | Used when |
|--------|-----------|
| Postgres RPC | Pure DB authz + mutation (push tokens) |
| Authenticated HTTP (`/api/mobile/v1/*`) | Signed URLs, rich DTOs needing Node/service-role after authz |
| ~~createServerFn names~~ | **Not** a Flutter contract |

---

## Error contract

All HTTP responses use:

```json
{ "ok": false, "error": { "family": "AUTH_REQUIRED", "code": "...", "message": "...", "message_ar": "..." } }
```

| Family | HTTP |
|--------|------|
| `AUTH_REQUIRED` | 401 |
| `STUDENT_CONTEXT_REQUIRED` | 403 |
| `NOT_FOUND` | 404 |
| `NOT_ALLOWED` | 403 |
| `INVALID_STATE` | 409 |
| `VALIDATION_ERROR` | 400 |
| `SERVICE_UNAVAILABLE` | 503 |
| `RATE_LIMITED` | 429 |

No raw SQL, stack traces, or storage credentials are returned to clients.

RPC errors raise stable codes (`AUTH_REQUIRED`, `VALIDATION_ERROR:*`, `NOT_FOUND`) mapped by Flutter to the same families.

---

## Capabilities

### 1. `official_document_download` — READY_PUBLIC_API

| | |
|--|--|
| **Operation** | `POST /api/mobile/v1/official-documents/download` |
| **Input** | `{ "document_id": "<uuid>" }` |
| **Output** | `{ "ok": true, "data": { "signed_url", "expires_in_seconds": 180, "document_id", "status" } }` |
| **Auth** | Bearer JWT + student owns document |
| **Rules** | Only `issued` \| `archived`. `draft` / `cancelled` → `INVALID_STATE`. Cross-student → `NOT_ALLOWED`. Private bucket retained; short-lived signed URL only. |

### 2. `certificate_pdf_generation` — HOLD

| | |
|--|--|
| **Status** | `HOLD` |
| **Blocker** | Generation is staff-only via `document_issuance` / `issue_document` (`executeEnrollmentCertificatePdfStorageSaga`). Students must use **download** of already issued/archived documents. Exposing generation to Flutter would change the lifecycle authorization contract. |
| **Mobile path** | Use `official_document_download` after staff issuance. |

### 3. `academic_progress` — READY_PUBLIC_API

| | |
|--|--|
| **Operation** | `GET` or `POST /api/mobile/v1/academic-progress` |
| **Input** | none (identity from JWT) |
| **Output** | `{ "ok": true, "data": StudentProgressDTO }` — **same** canonical DTO as web `getMyProgress` / `computeStudentProgress` |
| **Auth** | Bearer JWT + student profile |

### 4. `unofficial_transcript` — READY_PUBLIC_API

| | |
|--|--|
| **Operation** | `GET` or `POST /api/mobile/v1/unofficial-transcript` |
| **Input** | none (no foreign `studentProfileId`) |
| **Output** | `{ "ok": true, "data": { "student_profile_id", "rows", "summary" } }` |
| **Auth** | Bearer JWT + student-self only |

### 5. `course_materials` — READY_PUBLIC_API

| | |
|--|--|
| **List** | `GET` or `POST /api/mobile/v1/course-materials` → `{ sections: [...] }` |
| **Download** | `POST /api/mobile/v1/course-materials/download` body `{ "file_id": "<uuid>" }` |
| **Output (download)** | `{ signed_url, expires_in_seconds: 60, file_id }` |
| **Rules** | Enrolled + published + study-system match + `scan_state=clean`. Non-enrolled → `NOT_ALLOWED`. |

### 6. `push_token_registration` — SOURCE_READY

Postgres RPCs (migration `20260812010000_mobile_push_token_registration_01.sql` — **not applied by this mission**):

| RPC | Input | Behavior |
|-----|-------|----------|
| `register_mobile_push_token(p_token, p_platform, p_device_id?, p_app_version?)` | platform ∈ `android\|ios\|web` | Upsert own token; bind `auth.uid()` |
| `revoke_mobile_push_token(p_token?, p_device_id?, p_all?)` | at least one target | Deactivate own tokens (logout / reset) |
| `touch_mobile_push_token(p_token)` | token | Update `last_seen_at` |

Outbound FCM delivery is a **separate mission**.

---

## Discovery

`GET /api/mobile/v1/capabilities` — static capability registry (no secrets).

---

## Security invariants

- `SERVICE_ROLE_IN_FLUTTER=NO`
- `CROSS_STUDENT_ACCESS=DENY`
- `DRAFT_DOCUMENT_DOWNLOAD=DENY`
- `CANCELLED_DOCUMENT_DOWNLOAD=DENY`
- `PRIVATE_BUCKET_PUBLICATION=NO`
- `RAW_STACK_TRACE_TO_CLIENT=NO`
- `RAW_SQL_ERROR_TO_CLIENT=NO`
