# B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01

## Outcome

Root cause: the current runtime authorization function validates actor assignment and basic step state but does not bind the active runtime step to a complete, unambiguous predecessor graph. A prematurely active successor can therefore pass actor authorization.

The new forward-only draft adds a fail-closed predecessor helper and replaces `can_current_user_act_on_step(uuid,text)`. It requires the same request, workflow/version, runtime/config step, active status, exact direct assignee, exact action, and exactly one legal transition. Every incoming required predecessor must have exactly one runtime row and be completed, or skipped only when its canonical config permits skipping. Missing config/runtime rows, duplicate mappings, missing/ambiguous transitions, and malformed workflow entry all deny.

Parallel all-required joins are represented by multiple incoming edges: every member must satisfy the same exact completed-or-legally-skipped predicate before the successor is actionable. Optional predecessors are not inferred as required, but an explicit incoming optional edge must still end legally. There is no admin, registrar, dean, owner, role-wide, pending-step, or completed-step bypass.

The HIGH review finding is closed source-side: a non-entry step rejects every null-from entry edge; duplicate incoming edges deny; incoming results must match the canonical action/result mapping (`reviewed`, `approved`, `applied`, `cleared`, `archived`, `payment_confirmed`, `signed`, `issued`); and every earlier required config step must have one terminal-valid runtime plus a legal recursive directed path to the target. A disconnected runtime row cannot satisfy the guard.

The follow-up MEDIUM finding is also closed: every transition in the selected workflow is rejected if either non-null endpoint belongs to another workflow/version. Recursive traversal joins both source and target config rows on `t.workflow_id` and again on the active runtime's `workflow_id`; cross-version edges cannot enter the reachable graph.

## Mutation ordering

The guard is read-only. Atomic action paths call `can_current_user_act_on_step` before their first mutation; denial therefore produces no step mutation, event, notification, or advancement. The composed PR #166 PostgreSQL 17 harness directly verified the atomic finance and attachment specialized paths preserve zero mutation on denial.

## Verification

- Isolated PostgreSQL 17 compile and behavioral matrix: `285/285 PASS` after the remediation was loaded over the reviewed authorization draft.
- Independent focused PostgreSQL 17 suite: `5/5 PASS` for null entry to non-first, disconnected pending required config, malformed edge result, duplicate ambiguous edge, and cross-version traversal. Every denial preserves the target runtime row, workflow-event count, and advancement state.
- The harness seeds explicit entry and outgoing transitions, then adds a canonical pending predecessor/config/edge per service to prove premature activation denies.
- Direct cases include exact assignee ALLOW; same-role, bypass, anonymous, wrong action/unit/role, inactive/completed, other request, department isolation, and incomplete predecessor DENY; specialized finance/attachment denial proves zero mutation.
- Source-contract tests cover exact request/workflow/config/runtime correspondence, required and optional legal-skip semantics, missing/duplicate fail-closed counts, all-incoming-edge (parallel join) completion, exact transition cardinality, and absence of role bypass or writes.

## Production effect and decision

Source-only: no production/Supabase connection, SQL apply, migration, workflow activation, `student_visible` change, deploy, or publish. Applied migrations and deferred services are unchanged.

- CRITICAL: 0
- HIGH: 0
- Residual risk: application still requires a separately authorized preflight, catalog/ACL/RLS/signature verification against the actual target, and independent review; none was attempted here.
- Decision: `PASS_SOURCE_REMEDIATION_READY_FOR_INDEPENDENT_REVIEW`; apply remains `HOLD_REQUIRES_SEPARATE_EXPLICIT_AUTHORIZATION`.
