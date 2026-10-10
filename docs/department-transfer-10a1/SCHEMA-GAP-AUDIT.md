# Department Transfer 10A1 — Schema Gap Audit

Status: `SOURCE_PACKAGE_READY — PRODUCTION_APPLY_GATED`

Reviewed source: `9d1633864b86afdff5ef276a69f532c1580db910`

## Finding

The source tree does not lack a single Department Transfer migration. The
contract is distributed across an existing forward-only B1 chain. The correct
remediation is to pin and verify that chain, not to create a duplicate
migration. Production application state remains unverified and the service
must remain hidden.

`SCHEMA_PENDING=true` is therefore an activation gate, not a permission to
apply SQL. It remains unchanged because the chain has not received the
required independent migration review, disposable PostgreSQL 17 execution,
production read-only preflight, authorized production apply, post-verifier,
and controlled TEST_ONLY E2E evidence.

## Required schema inventory

| Surface | Required objects | Source evidence | State |
|---|---|---|---|
| Request type | `request_types.code = department_transfer`, alias `transfer`, inactive-until-gated visibility | `20260630230114_*`, `20260706120000_*`, B1 workflow sources | Source present; production state unverified |
| Request detail | `transfer_request_details`: `id`, `request_id`, `current_program_id`, `requested_program_id`, `current_department_id`, `requested_department_id`, `transfer_reason`, `notes`, timestamps | `20260601003440_*` | Historical base present; final ACL requires later cutover |
| Detail invariants | unique `request_id`; current/target program or department must differ; FK references to requests/programs/departments | `20260601003440_*` | Source present |
| Detail indexes | current/requested program and department indexes | `20260604184423_*` | Source present |
| Secure detail writes | `persist_validated_b1_request_details`, dispatcher, trusted reference validators | `20260725110700_*`, `20260725110800_*`, `20260724061333_*` | Source present; apply order required |
| Attachment | `secondary_certificate` field, private bucket/object contract, owner binding, MIME/size/count checks | `20260725110500_*`, `REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql` | Source present; production storage state unverified |
| Workflow | six steps in the exact B1 sequence | `20260723070217_*`, `20260725111000_*`, `request-service-adapter.ts` | Source present; active workflow version unverified |
| Department scope | `current_user_matches_transfer_department_scope(uuid,text)` using active `position_assignments` and exact current/target department | `20260725150000_*` | Source present; production function body unverified |
| Atomic action | `act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)` | `20260816230440_*` and forward replacements | Source present; production signature/ACL unverified |
| Student submit | `submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])` | `20260814173946_*` | Source present; production signature/ACL unverified |
| Payment | `record_external_university_payment_confirmation(uuid,text)` | `20260725120000_*`, `20260816230440_*` | Source present; specialized RPC only |
| Draft/read RPCs | create/save draft, secure capability/options/student reads/assigned reads | `20260725130000_*`, `20260725140000_*` | Source present; production state unverified |
| Audit/events | workflow events and audit calls, actor/timestamp server-owned | B1 atomic and attachment sources | Source present; append-only/RLS production state unverified |

## Historical ACL hazard

The original `20260601003440_*` table migration grants authenticated direct
`SELECT, INSERT, UPDATE, DELETE` and contains broad role-based policies. The
later B1 detail-boundary package is the required cutover that revokes direct
client DML and leaves the atomic RPC as the write boundary. The historical
file is not edited and must not be replaced; the ordered chain must be applied
and post-verified as a separate approved operation.

## NOT_APPLIED versus unverified

- B1 files whose headers say `PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION`
  are explicitly not production authorization.
- Historical base migration presence in this repository does not prove that
  the production database has the same version.
- No production migration history, catalog, grants, RLS, workflow rows,
  assignment rows, or TEST_ONLY counts were queried in this package.

## Dependency order

The authoritative order is pinned by
`tests/b1-rpc-matrix/pg/20-draft-apply-order.txt`; it has 28 entries. The
transfer-specific dependency path is:

1. base request/detail schema and indexes;
2. B1 runtime foundation and atomic submit/action boundaries;
3. secure attachments and trusted references;
4. detail RPC dispatcher and ACL cutover;
5. external-payment workflow and predecessor guard;
6. secure reads and secure draft mutations;
7. position-assignment department scope;
8. latest actor/action hardening and local activation gate only.

No item in this package applies that order.
