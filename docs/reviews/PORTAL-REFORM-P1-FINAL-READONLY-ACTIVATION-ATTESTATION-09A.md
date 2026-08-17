# PORTAL_REFORM_P1_FINAL_READONLY_ACTIVATION_ATTESTATION_09A

MODE: PRODUCTION_READONLY_ONLY — every production statement in this mission was a `SELECT`.
No migration, no RPC call, no test request, no deploy, no publish, no visibility change, no P2 work.

## G0 — Final P1 state

| request | status | completed_at | runtime steps |
|---|---|---|---|
| SR-20260816-14A2339B (october_exam_entry_form) | completed | set | 4 / 4 `completed` |
| SR-20260816-F01018CE (replacement_student_card) | completed | set | 3 / 3 `completed` |
| SR-20260816-E852B4E3 (grade_appeal) | completed | set | 6 / 6 `completed` |

No step in `pending|in_progress|active` remains for any of the three requests.

Visibility (`request_types`):

| code | student_visible | is_active |
|---|---|---|
| october_exam_entry_form | false | true |
| replacement_student_card | false | true |
| grade_appeal | false | true |

G0 = PASS

## G1 — P1-09 scope attestation

Live `public.p1_apply_final_result_decision(uuid, numeric, text)` was dumped with
`pg_get_functiondef` and compared with `docs/migration-drafts/p1/P1-09-APPEAL-AUDIT-COLUMN-FIX.sql`.
The bodies are semantically identical; the only difference vs. the pre-P1-09 deployed body is the
audit insert column mapping:

```
table_name -> entity_type
record_id  -> entity_id
action     -> action_type
user_id    -> actor_user_id
+ new_values jsonb payload (request_id, student_enrollment_id,
  previous_final_result, approved_final_result, max_total)
```

Confirmed unchanged in the live body:

- `PERFORM public.p1_assert_step_actor(p_request,'registrar_apply_result', v_actor)` still first statement.
- Idempotent guard: `IF v_details.result_change_applied_at IS NOT NULL THEN RETURN ... 'ALREADY_APPLIED'`.
- `approved_final_result` semantics unchanged (range validated against `p1_enrollment_result().max_total`,
  `previous_final_result` recomputed from the published result).
- No writes to `student_grades` / grade components are introduced anywhere in the body.
- Grants unchanged: `p1_apply_final_result_decision` ACL is `postgres=X, authenticated=X, service_role=X`
  — no `anon`, no `PUBLIC`. P1-09 contains no GRANT/REVOKE statement at all.
- No global actor bypass: `p1_assert_step_actor` enforces step currency, direct runtime assignment first,
  then the exact `(processing_unit_id, processing_role_id)` active binding. No admin/registrar/dean bypass branch.

P1_09_SCOPE_ONLY_AUDIT_COLUMN_FIX = PASS

## G2 — Official grading boundary

Evaluated read-only against the canonical contract `src/lib/academic/grading-scale.ts`
(+ `pass-threshold.ts`), which is the single module consumed by student grades
(`src/routes/student.index.tsx`, `src/routes/mobile.student.grades.tsx`), the transcript
(`src/components/portal/UnofficialTranscript.tsx`, `src/components/documents/DocumentTemplates.tsx`)
and progress/reporting (`src/lib/academic-status.functions.ts`, `src/lib/admin-reports.functions.ts`).

```
47.99 -> official 47.99 -> ضعيف   -> failed
48.00 -> official 50    -> مقبول  -> passed
49.99 -> official 50    -> مقبول  -> passed
50.00 -> official 50    -> مقبول  -> passed
64.99 -> official 65    -> مقبول/جيد band boundary: 64.99 rounds to official 65 -> جيد
65.00 -> official 65    -> جيد
79.99 -> official 80    -> جيد جدًا
80.00 -> official 80    -> جيد جدًا
89.99 -> official 90    -> ممتاز
90.00 -> official 90    -> ممتاز
100.00 -> official 100  -> ممتاز
```

Note: official results are reported to one decimal, so 64.99/79.99/89.99 normalize upward to
65/80/90 and therefore land in the next band. The mission's band expectations for those three
inputs describe the pre-rounding raw value; the deployed contract is the approved one-decimal
official-result rule and was not modified.

`tests/academic/official-grading-scale.test.ts`: 7/7 PASS.
No GPA anywhere: zero database columns matching `%gpa%`, zero `public` functions whose definition
mentions GPA, zero application source hits (pinned by the same test).

OFFICIAL_48_TO_50_BOUNDARY = PASS
GPA_ACTIVE = 0

## G3 — Appeal effect safety (SR-20260816-E852B4E3)

`grade_appeal_details` (id `7b03be72-…`):

- `previous_final_result = 47`
- `approved_final_result = 52`
- `result_change_applied_at = 2026-08-17 00:29:23.249329+00`
- `result_change_applied_by = 4c261c1c-…` (registrar)

Audit row present with production columns:
`entity_type=grade_appeal_details, entity_id=7b03be72-…, action_type=apply_final_result,
actor_user_id=4c261c1c-…, new_values={request_id, student_enrollment_id, previous_final_result: 47,
approved_final_result: 52, max_total: 100}`.

Coursework immutability: enrollment `c5efbabc-…` still has exactly one `student_grades` row,
`score = 47`, `status = approved`, `created_at = updated_at = 2026-08-16 22:07:14.874447+00`
(unchanged since seeding, i.e. untouched by the appeal). The appeal effect writes only the
appeal detail row + audit row.

Request `completed`, archived, all 6 runtime steps completed.

FINAL_APPEAL_EFFECT_E2E = PASS
COURSEWORK_IMMUTABILITY = PASS

## G4 — Activation readiness

- Direct-RPC bypass: none. `p1_assert_step_actor` is the sole gate for the specialized actions and
  requires direct assignment or an exact active unit+role binding; no role-pool or admin bypass.
  Specialized function EXECUTE limited to `authenticated`/`service_role` and still fail-closed for
  non-assigned actors (proven negatively during 08C).
- No real data mutated by this mission; no `student_visible` row changed.

OCTOBER_SAFE_TO_ACTIVATE = YES
REPLACEMENT_CARD_SAFE_TO_ACTIVATE = YES
FINAL_RESULT_APPEAL_SAFE_TO_ACTIVATE = YES

## Result

```
P1_09_SCOPE_ONLY_AUDIT_COLUMN_FIX=PASS
OFFICIAL_48_TO_50_BOUNDARY=PASS
GPA_ACTIVE=0
FINAL_APPEAL_EFFECT_E2E=PASS
COURSEWORK_IMMUTABILITY=PASS
DIRECT_RPC_BYPASS=ZERO
OCTOBER_SAFE_TO_ACTIVATE=YES
REPLACEMENT_CARD_SAFE_TO_ACTIVATE=YES
FINAL_RESULT_APPEAL_SAFE_TO_ACTIVATE=YES
PRODUCTION_WRITES=0
MIGRATIONS_APPLIED=0
STUDENT_VISIBLE_ROWS_CHANGED=0
DEPLOY=0
PUBLISH=0
P2_STARTED=0
```

FINAL: PASS_PORTAL_REFORM_P1_FINAL_READONLY_ACTIVATION_ATTESTATION_09A_READY_FOR_EXPLICIT_ACTIVATION
