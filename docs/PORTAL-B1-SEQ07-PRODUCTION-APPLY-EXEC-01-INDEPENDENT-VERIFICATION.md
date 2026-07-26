# PORTAL-B1-SEQ07-PRODUCTION-APPLY-EXEC-01 — Independent Verification

## Decision

**HOLD_B1_SEQ07_APPLY_TOOL_REJECTS_STORAGE_BUCKETS_INSERT_IN_UNMODIFIED_MIGRATION**

Independent review of Lovable `PORTAL-B1-SEQ07-PRODUCTION-APPLY-EXEC-01-RESULT` against source pins and the promoted SEQ07 file.

| Prior status | New status |
|---|---|
| `READY_FOR_SEPARATE_SEQ07_APPLY_APPROVAL` | **REVOKED** — apply channel cannot execute unmodified SEQ07 |
| Production catalog | **unchanged** — SEQ07 not applied; no partial objects |

**No SEQ07 apply succeeded. No SEQ08→24. No Gate 25. No Deploy/Publish. No `student_visible` change.**

---

## G0 — Source pins (recomputed)

| Field | Value | Match |
|---|---|---|
| Project ref | `wpmicqriltrowwonknox` | ✅ (report) |
| PostgreSQL | 17.6 (report) | accepted |
| `origin/main` | `765e1a4367a2b12e9d69ad46d9d8eec6c8c999bf` | ✅ recomputed |
| Migration path | `supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql` | ✅ |
| LF SHA-256 | `66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8` | ✅ recomputed (16622 LF bytes) |
| `SOURCE_SHA_CHANGED` | no | ✅ |

---

## Independent confirmation of blocker

Promoted SEQ07 lines 10–13 (inside `BEGIN`…`COMMIT`):

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('student-request-secure-attachments','student-request-secure-attachments',false,5242880,
  ARRAY['application/pdf','image/jpeg','image/png']::text[])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=5242880,allowed_mime_types=EXCLUDED.allowed_mime_types;
```

| Claim | Independent verdict |
|---|---|
| Statement writes `storage.buckets` | **TRUE** — first DDL/DML body statement after `BEGIN` |
| Statement is inside the same atomic transaction as table/RPCs/policies | **TRUE** |
| Managed apply tool rejects `storage.buckets` writes | **ACCEPTED** (operator evidence; pre-execution rejection) |
| No SQL statement executed on Production | **ACCEPTED** — history tip still `20260725002136`; SEQ07 objects remain ABSENT |
| Modifying/splitting the file without new approval | **FORBIDDEN** under standing rules |

Pre-creating the bucket via a separate storage tool **does not** clear this blocker by itself: the unmodified migration still contains the `INSERT INTO storage.buckets` and the tool would still reject the file before execution.

---

## Post-attempt Production state (accepted)

| Check | Result |
|---|---|
| Latest history | `20260725002136` (last-5 tip unchanged) |
| `20260725110000` registered | **no** |
| SEQ07 table / RPCs / trigger / policy / bucket | **0** — `NO PARTIAL APPLY` |
| SEQ08–SEQ24 | **not applied** |
| Five services | hidden; requests = 0 |
| Protected digests | unchanged vs G4 / pre-check |
| Attestations | `SEQ07_NOT_APPLIED` · `NO_DDL` · `NO_DML` · `NO_HISTORY_REPAIR` · `NO_DEPLOY` · `NO_PUBLISH` · `GATE25_NOT_ACTIVATED` · `NO_STUDENT_VISIBLE_CHANGE` |

---

## Allowed forward paths (documentation only — not authorized here)

Stop until **one** of the following receives **explicit separate human approval**:

1. **Apply-channel upgrade** that accepts the unmodified SEQ07 file (including `storage.buckets` upsert) in a single transaction, **or**
2. **Forward-only reviewed remediation** that:
   - creates private bucket `student-request-secure-attachments` (`public=false`, 5 MiB, PDF/JPEG/PNG) via an approved storage path, **and**
   - introduces a **new** reviewed migration/SHA path that does not require forbidden in-place edit of the pinned SEQ07 bytes without a new promotion pin,

   **or**
3. **Explicit alternate apply channel** (e.g. operator-controlled `psql` / SQL editor with full DDL rights) authorized to run the **byte-identical** SEQ07 file in one transaction — still ONE MIGRATION ONLY = SEQ07.

Forbidden without new approval: edit SEQ07 SQL, delete/reorder statements, manual partial apply, history repair, SEQ08+ in the same session.

---

## Impact on SEQ08 preflight

SEQ08 sequential predecessor is SEQ07 (`B1-SECURE-ATTACHMENTS-SOURCE-07`). While SEQ07 remains unapplied, SEQ08 Production apply readiness is **blocked** (see `PORTAL-B1-SEQ08-PRODUCTION-PREFLIGHT-01-REPORT.md`).
