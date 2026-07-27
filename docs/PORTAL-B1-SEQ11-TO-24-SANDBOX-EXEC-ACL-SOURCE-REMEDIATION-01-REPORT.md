# PORTAL-B1-SEQ11-TO-24-SANDBOX-EXEC-ACL-SOURCE-REMEDIATION-01

## Decision

`PASS_SEQ11_TO_24_SANDBOX_EXEC_ACL_SOURCE_REMEDIATION_PR_READY`

## Production binding (read-only)

- SEQ09 actual = `20260727044849`
- SEQ10 actual = `20260727051942`
- migration_count = 155
- SEQ10 post-verifier 7/7 PASS
- SEQ11 not applied / not attempted
- Five services `student_visible=false`
- Protected records stable
- `enrollment_certificate` regression = NONE
- `pg_default_acl` for owner `postgres` in `public` grants `sandbox_exec=ar`

## Affected-surface inventory SEQ11→24

| Order | Migration | CREATE public table/view/seq | Strict ACL inventory | Executable change |
|---|---|---|---|---|
| 11 | `20260725110400_b1_11_file_withdrawal_details_05a.sql` | YES `file_withdrawal_details` | YES `aclexplode` | **YES — sandbox_exec REVOKE** |
| 12 | transfer secure attachment | NO | NO | NO |
| 13 | final chance write | NO | NO | NO |
| 14 | `20260725110700_b1_14_detail_rpc_write_boundaries_05a.sql` | NO (existing tables) | YES in loop | **YES — per-table sandbox_exec REVOKE** |
| 15 | dispatcher | NO | NO | NO |
| 16 | free workflows | NO | NO | NO |
| 17 | payment workflows | NO | NO | NO |
| 18 | detail ACL cutover | NO | `has_table_privilege` anon/auth/service only | NO (depends on 11/14) |
| 19/20 | payment predecessor | NO | NO | NO |
| 21 | secure read | NO | NO | NO |
| 22 | secure draft | NO public durable table ACL guard | NO | NO |
| 23 | transfer position scope | NO | NO | NO |
| 24 | withdrawal ack null guard | NO | NO | NO |

Executable remediation limited to **SEQ11** and **SEQ14**. SEQ10 migration SHA frozen; preflight-only remediable ACL classification updated.

## Pins

| Artifact | LF SHA-256 |
|---|---|
| SEQ11 migration | `35468e00c544833626ddec23a8cf5d81659d4a51a16bbaa1d1f3ad99944e6401` |
| SEQ11 draft | `febf7a9bedd9d62f6fefe1533784d7e1f8fa7d995ea90a5fc3b16812a392ca71` |
| SEQ14 migration | `3d3f274d1d0f864b8ed387138f92a78bb3952e1cedfe9232d9a657564f50399b` |
| SEQ14 draft | `7c53e89a0cfa48545d115ee7aad1d08c3cbd8719620663e80d3df2217e2b06e0` |
| SEQ10 migration (unchanged) | `ff61ae4a400b2b7d9dfbbec03212d04032103d5343f54a4ad42e274cbb9ab505` |
| SEQ10 preflight | `8d338df25d7810791b048851376fd0712be8f41491be7e5ed82e953de9508cab` |
| SEQ11 preflight | `5e1ffa4699f784f3506289577176793dea46af34b7998ceb8f6e1118f7d65b22` |
| SEQ11 post-verifier | `b852c1de28dcba1fb7705dc9434c3968301d7a68ac57052e2383877e09458b23` |
| SEQ14 preflight | `ad3742fe7dc4841596ad96a3800f365548665164a570a2df91dafd210a3fbc6a` |
| SEQ14 post-verifier | `e26356764e000d301cd3fb351361e61622de0291b13d1c9e91c6aebc052eb614` |

## SEQ10 preflight-only fix

Preflight treats remediable pre-state as:
`sandbox_exec` + `PUBLIC`/`anon`/`authenticated`/`service_role` privileges that SEQ10 rewrites.
Any other grantee remains fail-closed. Migration SEQ10 SHA unchanged.

## Verification

| Check | Result |
|---|---|
| ACL harness scenarios 1–6 + 8 | `PASS_B1_SEQ11_24_SANDBOX_EXEC_ACL_HARNESS` |
| Sequential chain SEQ07-B→24 | `PASS_B1_FIRST_DELIVERY_SEQUENTIAL_CHAIN` |
| `bun test tests/student-requests` | 832 pass / 0 fail |
| `bun test` | 1890 pass / 0 fail |
| `bunx tsc --noEmit` | PASS |
| `bun run build` | PASS |
| `git diff --check` | CLEAN |
| SEQ10 migration LF SHA | unchanged `ff61ae4a…` |
| `enrollment_certificate` | regression NONE |
| Production types generation | not performed |
| Production write / Deploy / SEQ11 apply | NONE |

## Assumptions

- Production `pg_default_acl` remains `sandbox_exec=ar` for new public tables until operators change it outside this mission.
- SEQ12–13 and SEQ15–24 do not introduce new public durable tables with strict ACL inventory guards that would fail under the same default ACL.

## Risks

- SEQ18 still asserts anon/authenticated/service_role privileges only; it depends on SEQ11/SEQ14 having already stripped `sandbox_exec`.
- Global `pg_default_acl` is intentionally untouched; every future CREATE TABLE in `public` must continue to REVOKE `sandbox_exec` before ACL inventory.

## Blockers

None for source PR.

## Production impact

SOURCE-ONLY. No Production write. SEQ11 remains unapplied. No Deploy/Publish. No `types.ts` regeneration from Production. No `student_visible` change. No `pg_default_acl` mutation.

## NO_PRODUCTION_WRITE
