# PORTAL-GP-GA-CURRENT-STATE-PRODUCTION-READONLY-AUDIT-01

MODE: PRODUCTION READ-ONLY AUDIT — PRODUCTION_WRITES=0 (SELECT / catalog inspection only; no DDL, no RPC mutation, no flags, no deploy)

## A — Graduation Projects (GP)

Tables present in production, all with RLS enabled: `graduation_projects`, `graduation_project_assignments`, `graduation_project_files`, `graduation_project_progress_entries`, `graduation_project_discussions`, `graduation_project_panel_members`, `graduation_project_evaluations`, `graduation_project_final_archives`, `graduation_project_events`, `graduation_project_approvals`, `graduation_project_department_coordinators`, `graduation_project_policies`.

1. Policy migrations are applied: `graduation_project_policies` exists, and the pinning columns plus guards/functions (`gp_guard_policy_pin_immutable`, `gp_guard_published_policy_immutable`, `gp_guard_policy_co_supervisor_deferred`, `gp_project_policy`, `gp_admin_save_policy_draft`, `gp_admin_publish_policy`) are live. (The migrations ledger schema itself is not readable by the audit role — evidence is catalog-based.)

2. `graduation_project_policies`: **0 rows** — no draft, no published, no superseded, no department/year scoped policy in production.

3. `graduation_projects` columns relevant to configuration: `policy_id`, `policy_snapshot`, `policy_pinned_at`, `policy_pin_source` exist. No `workflow_id` / `workflow_version_id`.

4. Pinning proof: 6 projects total; `policy_id` NULL for all 6; `policy_snapshot` present for all 6; `policy_pin_source = BUILTIN_DEFAULT_AT_CUTOVER` for all 6. So projects are pinned to an immutable snapshot (not dynamic), but the snapshot is the built-in default, not an approved academic policy.

5. Resolver behaviour:
   - `gp_effective_policy(dept, year)` resolves published policy by scope precedence, and falls back to hardcoded defaults (team 1–5, committee 2–5, passing 60, revisions 2, reports 1, one supervisor) with `status='default'`.
   - `gp_project_policy(project)` reads the pinned snapshot only and raises if unpinned — no pin-on-read.
   - Runtime functions using the **pinned** policy: `submit_graduation_project_proposal`, `resubmit_graduation_project_proposal`, `add_graduation_project_team_member`, `assign_graduation_project_committee_member`, `schedule_graduation_project_defense`, `submit_graduation_project_final`, `conclude_graduation_project_result`.
   - `create_graduation_project_team` still calls `gp_effective_policy` (correct: it pins at creation).

6. Field classification (production runtime):
   - RUNTIME_ENFORCED: `min_team_size`, `max_team_size`, `min_committee_members`, `max_committee_members`, `passing_score`, `max_revision_rounds`, `required_progress_reports`, `proposal_window_start/end`, `defense_window_start/end`.
   - RUNTIME_ENFORCED as a hard denial (deferred feature): `allow_co_supervisor`, `max_supervisors` — DB guard rejects co-supervision and any value > 1.

7. GP workflow/action/version configuration tables: **none exist**. The only workflow config catalogs in production belong to student services (`request_type_workflows`, `request_type_workflow_steps/transitions`, `request_workflow_action_catalog`, `request_workflow_transition_condition_catalog`, `request_eligibility_rule_catalog`, `b1_workflow_runtime_contract_snapshot`). GP lifecycle is code-defined.

8. Authorization: assignment-exact guards are live (`require_graduation_project_assignment`, `require_graduation_project_leader`, `require_graduation_project_accepted_supervisor`, `require_graduation_project_department_coordinator`, `guard_graduation_project_assignment`); no generic role bypass found in GP paths.

## B — Graduates Affairs (GA)

All listed GA tables exist with RLS enabled, including `graduate_followups`, `graduate_communication_events`, `graduate_account_continuity_policies`.

1. Foundation, completion, AUTH04 and remediation objects are all present (records/decisions/consents/employment/opportunities/surveys/events/domain events + followups + communication events + continuity policies, plus the full `graduate_affairs_*` authorization layer).

2. Continuity policies: 1 row, state `approved`, `is_current = true`, `valid_from = 2026-08-10T03:48Z`, no `expires_at`, no supersession yet. Capabilities: `portal_sign_in`, `profile_self_service`, `survey_participation`, `event_participation`, `employment_reporting`, `contact_management`.

3. Supersession machinery is operational (`graduate_supersede_account_continuity_policy` + one-current partial unique index), but has not been exercised in production (no superseded rows yet).

4. `graduate_followups`: state is enum `graduate_followup_state`; transitions are enforced by trigger `enforce_graduate_followup_update` (open→in_progress/cancelled, in_progress→completed/cancelled, outcome required on completion, identity immutable). `purpose_code` is free text with only a non-empty CHECK — **no type catalog table, no follow-up workflow/version tables exist**.

5. Follow-up lifecycle classification: **HARDCODED** (enum + trigger in DB, purpose codes hardcoded in the UI list).

6. Staffing: `graduate_affairs_create_followup` and siblings resolve authorization through locked staff-profile role resolution (`graduate_affairs_lock_caller_authorized_staff_profile`) and `staff_profile_departments`. EMPLOYEE_HARDCODING=0.

7. Manager = college-wide scope; specialist = explicit `staff_profile_departments` scope, verified in the create/transition follow-up paths.

8. No GA RLS policy or RPC grants mutation by `admin`/`system_admin`/`dean`/`registrar` app_role — no generic bypass found.

## C — Final classification

GP_IMPLEMENTED: domain kernel, authorization, policy storage + versioning + admin UI, per-project pinning, runtime enforcement of all policy fields.
GP_ALREADY_CONFIGURABLE: team size, committee size, passing score, revision rounds, progress reports, proposal/defense windows (per department/year, versioned).
GP_HARDCODED (DOMAIN_INVARIANT): lifecycle states and step order, L4 eligibility, one active team per student, role separation, one supervisor (co-supervision deferred by explicit guard).
GP_POLICY_RUNTIME_GAPS: none at field level; the real gap is that **no academic policy is published**, so every project is pinned to technical defaults and `gp_effective_policy` still invents 1–5 / 60.
GP_VERSION_PINNING: PRESENT but currently `BUILTIN_DEFAULT_AT_CUTOVER` for all 6 projects; `policy_id` NULL.
GP_WORKFLOW_CONFIG_STATUS: ABSENT (code-defined lifecycle, by design for now).

GA_IMPLEMENTED: records/decisions/consents/contacts/employment/opportunities/surveys/events, self-service, staff workspace, account continuity versioning, scoped authorization.
GA_ALREADY_CONFIGURABLE: account continuity policy (versioned, immutable once approved, fail-closed, capability list).
GA_HARDCODED: follow-up states and transitions (enum + trigger), follow-up purpose codes (UI literals), survey/event consent codes.
GA_POLICY_RUNTIME_GAPS: none for continuity; follow-ups have no policy layer at all.
GA_VERSION_PINNING: continuity policies versioned; follow-ups are not pinned to any version.
GA_FOLLOWUP_CONFIG_STATUS: HARDCODED.

PRODUCTION_WRITES = 0

FINAL DECISION: **PASS_GP_GA_CURRENT_STATE_PRODUCTION_READONLY_AUDIT_READY_FOR_GAP_PLAN**

## Remaining real work (for your item-by-item decision, not executed)

1. GP-A: publish an approved academic GP policy version (values decided by you), then re-pin new projects to it (`policy_id` non-NULL, `policy_pin_source = PUBLISHED_POLICY`).
2. GP-B: after a policy is published, remove the invented defaults from `gp_effective_policy` and fail closed when no published policy covers the scope.
3. GA-A: follow-up type catalog (`purpose_code` → catalog reference) replacing UI literals.
4. GA-B: versioned follow-up workflow (states + transitions as configuration) replacing the enum + trigger, with pinning per follow-up.
