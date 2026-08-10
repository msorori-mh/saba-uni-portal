# PORTAL-PRODUCTION-COUNCILS-C2-LOVABLE-APPLY-ONE-01

Mode: PRODUCTION MANAGED APPLY — EXACTLY C2 ONLY
Authorization: OWNER_APPROVE_COUNCILS_C2

## A — Source identity

| Item | Value |
| --- | --- |
| CURRENT_SOURCE_HEAD | `acf2e48c6f4dfdf2816c364743d35809ff26ddb7` |
| SOURCE_C2_VERSION | `20260808122000` |
| SOURCE_SHA256_LF | `f969c6c0f63a4758944cc59f6c78292f56f3a4ac360ae77f0b386bf72e0e364e` |
| SOURCE_PIN_MATCH | YES |
| SOURCE_C2_UNMODIFIED | YES (file untouched; `git diff --check` clean, no working-tree change to migrations) |

## B — Prestate (read-only)

- `20260810003111` = APPLIED, `20260810003305` = APPLIED (C1 functional predecessor via accepted ledger alias)
- `minutes_review` enum label = EXISTS
- `academic_council_meeting_transition_events` = EXISTS
- `council_transition_meeting`, `council_meeting_transition_is_legal` = EXISTS
- C2 signature functions = 0/5 present → C2_PRESTATE = COMPATIBLE_NOT_APPLIED
- C3–C9 literal versions applied = 0
- Ledger tip pre-apply: `20260810003305`, total 215

## C — Pre-apply data snapshot

| Table | Rows | Fingerprint (md5) |
| --- | --- | --- |
| academic_council_topics | 2 | `0be7b67929edd53e6a5245b83ebcd490` |
| academic_council_meetings | 1 | `827f91453b848846a4947f492e63ef48` |
| academic_council_agenda_items | 0 | `d41d8cd98f00b204e9800998ecf8427e` |

## D — Managed version policy

The managed runner assigned one version for the exact C2 semantic body.

```
SOURCE_C2_VERSION=20260808122000
LOVABLE_MANAGED_C2_VERSION=20260810010400
C2_LEDGER_MAPPING=PASS
```

Original source migration not edited, not deleted; ledger untouched manually; no `db push`.

## E — Semantic body contract

Only the outer `BEGIN;` (line 17) and `COMMIT;` (line 583) were removed because the runner
supplies its own transaction. Remaining body is normalized-equivalent to the source.

```
C2_SEMANTIC_BODY_MATCH=YES
C2_NONTRANSACTIONAL_BOUNDARY=NONE
C2_APPLY_ATTEMPT_COUNT=1
```

## H — Structural poststate (observed, derived from pinned source)

The pinned C2 source creates **no tables and no policies**. `academic_council_topic_attachments`
already existed from predecessor `20260708120000`; `academic_council_topic_reviews` is not
defined anywhere in the pinned C2 source. The mission brief's "expected source packet"
(2 tables / 9 functions / 5 triggers / 2 policies) does not correspond to the pinned file;
the pinned SHA is authoritative and matches exactly.

| Item | Expected (from source) | Observed |
| --- | --- | --- |
| TABLES_CREATED | 0 | 0 |
| FUNCTIONS_CREATED_OR_REPLACED | 10 | 10 |
| TRIGGERS_CREATED | 1 (`trg_actopics_lifecycle`) | 1 |
| POLICIES_CREATED | 0 | 0 |

Functions present: `can_submit_to_council_meeting_intake`, `can_review_council_topic_prepare`,
`can_review_council_topic_final`, `council_topic_transition_is_legal`,
`tg_enforce_council_topic_lifecycle`, `council_submit_topic(uuid,uuid,text,text,text)`,
`council_resubmit_topic`, `council_review_topic(…topic_status,text,…topic_status)`,
`council_update_own_topic_draft`, `council_add_topic_to_agenda`.

## I — Authorization contract

- Submit/resubmit gated by `can_submit_to_council_meeting_intake` (meeting must be `intake_open`
  inside its intake window, caller must be an active council member) → TOPIC_INTAKE_GATE=PASS
- `submitted→under_review` and `under_review→needs_completion` require
  `can_review_council_topic_prepare` (chair or secretary) → SECRETARY_PREP_AUTHORITY=PASS
- `under_review→accepted_for_agenda|rejected` require `can_review_council_topic_final`
  (chair only) → CHAIR_FINAL_AUTHORITY=PASS
- Canonical transitions enforced twice (RPC + `trg_actopics_lifecycle`) → TOPIC_LIFECYCLE_GUARD=PASS
- `authenticated` has no INSERT/UPDATE/DELETE table privilege on `academic_council_topics`;
  C0 deny-all write policies intact (2 non-SELECT deny policies) → DIRECT_WRITE_SURFACE_CLOSED=YES
- No role-name branch for system_admin / admin / dean / registrar exists in any C2 function
  → UNIVERSAL_ADMIN_OPERATIONAL_BYPASS=0, UNIVERSAL_DEAN_BYPASS=0, UNIVERSAL_REGISTRAR_BYPASS=0

## J — RLS / ACL / functions

- RLS enabled on all council lifecycle tables = TRUE
- `anon` EXECUTE on all C2 functions = false; `authenticated`, `service_role` = true
- Four mandatory RPC/helper functions are SECURITY DEFINER; `council_topic_transition_is_legal`
  is IMMUTABLE (pure, non-definer by source design)
- All ten functions carry `search_path=public, pg_temp`

```
C2_RLS=PASS
C2_ACL=PASS
C2_SECURITY_DEFINER=PASS
C2_SEARCH_PATH=PASS
```

## K — Business data preservation

Post-apply fingerprints identical to pre-apply for topics, meetings and agenda items.

```
EXISTING_TOPIC_ROWS_MUTATED=0
EXISTING_MEETING_ROWS_MUTATED=0
EXISTING_AGENDA_ROWS_MUTATED=0
MIGRATION_CREATED_TOPIC_REVIEW_ROWS=0 (table not part of pinned C2 source)
MIGRATION_CREATED_TOPIC_ATTACHMENT_ROWS=0
C1_FUNCTIONAL_STATE_PRESERVED=YES
C0_SECURITY_PRESERVED=YES
GP_L4_GUARD_PRESERVED=YES
B1_VISIBILITY_CHANGED=NO (five services still student_visible=true, unchanged)
ENROLLMENT_CERTIFICATE_REGRESSION=NO
```

## L — Focused verification

| Gate | Result |
| --- | --- |
| `councils-c2-topic-intake-review.test.ts` | 7 pass / 1 fail — sole failure is `docker is required for the PG17 disposable harness` (environment, not C2) |
| `councils-c0-c9-production-readiness-package.test.ts` | 7 pass / 1 fail — same docker-unavailable harness |
| `bun test tests/academic-councils` | 63 pass / 16 fail — all 16 are docker-unavailable PG17 harness launches |
| `bunx tsc --noEmit` | PASS |
| `git diff --check` | PASS (clean) |

## M — Ledger poststate

```
MIGRATIONS_APPLIED_THIS_MISSION=1
UNAUTHORIZED_ADDITIONAL_MIGRATIONS=0
Ledger total: 215 → 216
Ledger tip: 20260810010400
C3_APPLIED=NO  C4..C9_APPLIED=NO
DEPLOY=NO  PUBLISH=NO  MERGE=NO
```

## Decision

CRITICAL_COUNT=0, HIGH_COUNT=0, MEDIUM_COUNT=0
(one LOW documentation discrepancy: mission brief expected-object counts do not match the
pinned C2 source packet; source SHA is authoritative and matched)

```
PASS_PORTAL_PRODUCTION_COUNCILS_C2_LOVABLE_APPLY_ONE_01
```

STOPPED. C3 NOT APPLIED.
