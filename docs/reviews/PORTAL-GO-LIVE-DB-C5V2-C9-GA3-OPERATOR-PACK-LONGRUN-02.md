# PORTAL-GO-LIVE-DB-C5V2-C9-GA3-OPERATOR-PACK-LONGRUN-02

MISSION=`PORTAL-GO-LIVE-DB-C5V2-C9-GA3-OPERATOR-PACK-LONGRUN-02`
MODE=`SOURCE + DISPOSABLE POSTGRESQL 17 / ZERO PRODUCTION WRITES`
DATE=`2026-08-10`
MAIN_SHA=`38578b6533f20407c02ed775b5af18d11fcb85eb`
PR326_HEAD=`62c6bb374b15503dfa93c5d8066e4b61837169aa`

## Release truth and source identity

Remote state was fetched first. PR323 is merged and its merge commit is reachable from `origin/main`; PR321 is the current main tip. PR326 is open at the expected head and is the sole canonical C5 source for this qualification. V1 remains byte-identical to main and is explicitly `SUPERSEDED_DO_NOT_APPLY`; its stale hash is irrelevant to V2 readiness.

`C5V2_FILENAME=20260810180000_councils_c5_minutes_lifecycle_02.sql`
`C5V2_SHA256_RAW=b493c65215f899c59d0e0eb3fcdc0682719f32197da8514dcb1c4a0c134eb888` (checked-out CRLF bytes on Windows)
`C5V2_SHA256_LF=0d945a6a886ea2b8be15de6dbd0b4a2a5f15b8bdf16e7b68a2ef2bb4644212e8` (authoritative cross-platform contract)

C5 V2 has unique timestamp `20260810180000`; fail-closed prerequisite `extensions.digest(text,text)`; schema-qualified `extensions.digest`; SECURITY DEFINER search path exactly `public, pg_temp`; no extension creation/search-path widening; and no auth, quorum, locking, or apply-time business-DML change beyond the minimum digest correction.

## Old HIGH closure

`OLD_HIGH_1_FINAL_CLASS=STALE_PACKET` — the old untracked packet had 17 inaccurate fields and must not be used; the eight new packets are source-hash pinned.

`OLD_HIGH_2_FINAL_CLASS=INHERITED_ACL_INVARIANT` — C6 intentionally contains function EXECUTE grants/revokes only. C0 line 94 already revokes INSERT/UPDATE/DELETE on `academic_council_decisions` from PUBLIC/anon/authenticated, grants authenticated SELECT, and reserves ALL for service_role. Full C0→C9 PG17 and real PostgREST HTTP matrices prove this inherited state remains effective. No repeated C6 table REVOKE is required.

The old C5 hash discrepancy is `RESOLVED_BY_C5V2`, not a V2 blocker. The C6 enum concern is a qualified runtime risk: `blocked` appears in the ALTER statement and function runtime input/casts, but is not used as a newly-added literal while C6 is being applied. A real `BEGIN; C6; COMMIT;` path on PG17 passed with no `55P04`.

## Disposable qualification

All work used Docker `postgres:17`; no production endpoint or credential was accessed.

| Evidence | Result |
|---|---|
| C5 Rev02 focused test | 2 pass / 0 fail; V1 freeze, source delta, C0→C5, fingerprint, immutability and auth negatives |
| Academic Councils suite | 83 pass / 0 fail / 1536 assertions; 882.55s |
| Council full-chain rehearsal | C0→C9 apply-one with post-verifiers PASS |
| Council HTTP authorization | 34 direct-DML + 19 RPC denials, zero mutation PASS |
| Council concurrency | vote/close, archive/follow-up, notifications/minutes races PASS |
| Production lineage classifier | C1 split and C2/C3/C4 managed aliases PASS |
| Graduates Affairs suite | 175 pass / 0 fail / 974 assertions; 35.92s |
| GA promoted PG17 matrices | authorization, concurrency, authority-loss, profile binding, context RPC PASS |

`C6_NEW_ENUM_REFERENCE_IN_SAME_TRANSACTION=NO`
`C6_55P04=NO`
`C6_APPLY=PASS`

The council readiness rehearsal runs the production-like predecessor topology, applies each remaining council migration and its post-verifier immediately. GA's promoted-migration tests apply GA1→GA3 and run authorization/concurrency verifiers. The combined source order C5V2→C6→C7→C8→C9→GA1→GA2→GA3 is therefore qualified on disposable PG17, with sequence-policy rather than a false GA1 SQL dependency on C9.

## Authorization and cross-domain regression

Councils: admin alone has no mutation path; chair is council-local; secretary is limited to defined operations; member is member-only; responsible actor is exact-assignment scoped; cross-council department/college cases deny; role resolution remains per-council for multi-council users.

GA: app_role admin/dean/registrar alone denies; manager requires active GA manager assignment; specialist is limited to assigned departments; direct assignee is limited to the exact case; outside scope denies. No direct client table mutation path exists.

Migrations contain no unrelated business-row DML. Static source inventory plus zero-mutation runtime fingerprints cover GP, student requests/B1 visibility, official documents, enrollment_certificate, faculty profiles, departments, and programs. The packets require these fingerprints before/after every production step rather than assuming them.

## Operator artifacts

Eight Apply-One packets, one automatic sequential master packet, and one read-only post-GA3 ledger reconciliation packet were generated under `docs/go-live/operator-packets`. Every Apply-One packet pins exact source/hash and predecessor, detects absence/partial state, applies one transaction, records managed alias mapping, runs a post-verifier and ACL/RLS/auth checks, fingerprints business data, checks B1 and enrollment_certificate, and stops on actual failure. None pauses for an owner token; none recommends `supabase db push`; none repairs the ledger.

## Verification ledger

- `bun test tests/academic-councils`: PASS (83/83).
- `bun test tests/graduates-affairs`: PASS (175/175).
- `bun test tests/graduation-projects`: PASS (119/119; 1455 assertions).
- `bun test tests/student-requests`: PASS (1066/1066; 8080 assertions).
- `bun test tests/release`: N/A — the repository contains no matching `tests/release` test path.
- `bunx tsc --noEmit`: PASS.
- `bun run build`: PASS (Vite client/server build; dependency directive warnings only).
- `git diff --check`: PASS.

## Agent report

FILES_MODIFIED=`8 Apply-One packets; master sequential packet; ledger reconciliation packet; this report`
ASSUMPTIONS=`Lovable provides one atomic transaction per semantic body and returns a managed version; production prestate will be probed read-only at execution time.`
RISKS=`Managed ledger names may differ from logical source versions; partial-state and data fingerprints must remain hard STOP gates; production was deliberately not inspected in this mission.`
BLOCKERS=`None in source/disposable qualification.`
PRODUCTION_IMPACT=`NONE; no production access, write, migration, deploy, publish, or data mutation.`
DECISION=`PASS`

```text
C5V1_SUPERSEDED=YES
C5V2_READY=YES
C6_READY=YES
C7_READY=YES
C8_READY=YES
C9_READY=YES
GA1_READY=YES
GA2_READY=YES
GA3_READY=YES
FULL_DISPOSABLE_CHAIN=PASS
COUNCILS_AUTHZ=PASS
GA_AUTHZ=PASS
B1_REGRESSION=PASS
GP_REGRESSION=PASS
OPERATOR_PACKETS_READY=8
MASTER_LOVABLE_PACKET_READY=YES
LEDGER_RECON_PACKET_READY=YES
CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=0
```

`PASS_PORTAL_GO_LIVE_DB_C5V2_C9_GA3_OPERATOR_PACK_LONGRUN_02`
