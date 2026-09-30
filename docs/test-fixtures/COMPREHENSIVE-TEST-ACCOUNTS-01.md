# COMPREHENSIVE-TEST-ACCOUNTS-01

Target: an isolated test backend with the same approved source release as the application. The current isolated backend has 5 recorded migrations (latest `20260906233120`), 28 linked students, 4 active faculty, 7 active staff, 3 active council memberships, 1 active position assignment, and 1 active request-processing assignment as observed on 2026-09-30. Source baseline: `main@cfe5c2190fe4d153b7af07262f57ebff0830624d`. These counts do not establish release parity or account usability.

The read-only persona probe returned structural candidates for 11 of 14 rows. `vice_dean`, `archive`, and `department_council_secretary` returned `MISSING` under the probe's strict matching criteria. A missing match is a provisioning task or a mapping to verify, not proof that no similarly named account exists. None of the 11 candidate rows establishes a successful sign-in.

## Exit gates

1. Verify exact app SHA, database migration contract and security RPCs against the target. Stop if they disagree. A migration count alone cannot establish schema drift or parity.
2. Run `comprehensive-personas-readiness.sql`. Every required persona needs at least one confirmed, linked account. The query only identifies candidates; check the actual organization position and processing role for each candidate before accepting it.
3. Provision missing identities **only in the isolated test backend** through the supported Supabase Auth Admin API, using unique `TEST_ONLY` addresses and a securely generated temporary password. Never insert into `auth.users` directly and never reset an existing identity's password. Bind profiles, roles, memberships, positions and processing assignments with exact IDs and an audit marker. Abort on an email or ID collision.
4. Seed coherent, labeled data scoped to those identities: term, course offerings, sections, teaching assignment, schedules, enrollments, grade states, council meetings/topics, staff tasks, notifications, student request examples, and issued/cancelled document examples. Keep paid services outside fictitious payment approval. Capture before/after row counts for each table.
5. Sign in as each persona and exercise every visible module with meaningful content. For each workflow test authorized transitions, wrong-role refusal via the RPC, rejection, retry, and final outcome. Check desktop and mobile Arabic RTL views. Record pass/fail and evidence per persona and feature.
6. Deliver the exact account roster and scenario sheet without passwords in Git or chat. Deliver temporary credentials through a private channel and require rotation after the exercise. Do not classify this gate PASS until actual sign-in and E2E evidence exists.

## Minimum persona matrix

Student (including a senior student), ordinary faculty, faculty department council member, department head who also sits on the college council, vice dean with both appropriate memberships, dean, department council secretary, registrar, student affairs specialist and manager, finance, HR, archive, and administrator. Distinct accounts must be used wherever combined privileges would hide authorization mistakes.

## Current decision

`HOLD`: the current isolated target lacks demonstrated schema parity, several persona bindings, securely handed-over credentials, and actual sign-in/E2E evidence. No account or data mutation was performed by this package.
