# B1 service runtime drafts 05 — executable readiness

Status: SOURCE-ONLY / FAIL-CLOSED / NO APPLY

## Proven storage aliases

| Canonical service | Stored request type | Existing detail relation | Required action |
|---|---|---|---|
| `enrollment_suspension` | `enrollment_suspension` | `enrollment_suspension_details` | replace client writes with the atomic dispatcher |
| `excused_absence` | `absence_excuse` | `absence_excuse_details` | reconcile reason vocabulary and secure attachment binding before persistence |
| `department_transfer` | `transfer` | `transfer_request_details` | prove exact column/FK contract and source/target department isolation |
| `final_chance` | `extra_chance` | `extra_chance_details` | write only `chance_type='final_chance'`; require trusted year/semester/reason inputs |
| `file_withdrawal` | `file_withdrawal` | draft-only `file_withdrawal_details` | create the detail relation before installing its dispatcher branch |

Canonical aliases are accepted only at the RPC boundary. Persistence uses the proven
stored alias and relation; it does not rename or backfill historical rows.

## Fail-closed implementation split

1. `REQUEST-B1-SERVICE-DETAILS-05A.sql` must validate trusted references and replace
   `persist_validated_b1_request_details`. It may dispatch only the five closed services.
2. `REQUEST-B1-SERVICE-WORKFLOWS-05B.sql` must create or structurally verify inactive,
   versioned workflow drafts and exact transitions. It must resolve no staff identity.
3. Runtime activation remains separate. Missing/ambiguous direct assignments, processing
   identities, workflow tuples, or reference relationships abort the transaction.

The split prevents an incomplete detail schema from silently enabling a workflow and
keeps the atomic draft's `B1_SERVICE_PERSISTENCE_NOT_INSTALLED` default until 05A is
complete and independently reviewed.

## Required schema proofs before 05A

- Verify the exact current columns, constraints, triggers, grants and RLS policies for
  all five detail relations in a safe schema snapshot.
- Reconcile the historical `absence_excuse_details.aed_reason_chk` vocabulary
  (`medical`, `family`, `emergency`, `other`) with the source contract vocabulary
  (`medical`, `family_emergency`, `official`, `other`) without rewriting history.
  Draft 05A now widens the constraint with exact catalog preflight and preserves
  both historical values without mapping or backfill; it remains unapplied.
- Prove the secure attachment table/function contract used by `excused_absence`; the
  detail row must never accept a client URL or attachment metadata.
- Prove `transfer_request_details` source/target department and program foreign keys.
  Current program and department are server-derived from the locked student profile;
  the student supplies only the trusted target IDs and required `transfer_reason`.
- Prove the required academic year, semester and reason inputs for `extra_chance_details`;
  `chance_type` is always server-written as `final_chance`.
- Create `file_withdrawal_details` with restrictive grants and RPC-only writes; do not
  retain the documentary draft's broad or implicit client mutation surface.
  The 05A detail draft now creates an owner-read/RPC-write-only relation with exact
  catalog signature checks; it remains unapplied and does not activate the service.

## Invariants

- No fee type, amount, currency, invoice, gateway transaction, payment reference or
  internal balance is stored.
- `department_transfer` and `final_chance` use external university payment confirmation;
  the other three services create no payment step or financial data.
- Validation and detail persistence complete before workflow initialization. Any failure
  creates no detail, runtime step, transition, event, or attachment mutation.
- No admin, registrar or dean authorization bypass exists. Runtime action remains exact
  active direct-assignee only.
- No migration application, `student_visible` change, production access, deploy, publish,
  historical backfill, or protected-record mutation is part of this source task.

## Next source action

Build 05A only after the five exact relation contracts above are encoded as catalog
preflight assertions. Any unresolved relation stays unavailable through the existing
fail-closed dispatcher rather than receiving a partial persistence branch.
