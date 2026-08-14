# COUNCILS_VOTING_COMPLETION_NOTIFICATIONS_AND_DATE_INVARIANTS_04 — PG17 matrix

Disposable local PostgreSQL 17 rehearsal for the package 04 drafts. It never
touches production: it creates a throwaway cluster, loads a minimal schema with
stubs, then loads the **real** migration drafts verbatim.

## Run

```bash
UID_L=$(id -u lovable); GID_L=$(id -g lovable)
rm -rf /tmp/pg17c && mkdir -p /tmp/pg17c && chown -R $UID_L:$GID_L /tmp/pg17c
setpriv --reuid=$UID_L --regid=$GID_L --clear-groups initdb -D /tmp/pg17c/data -U pg
setpriv --reuid=$UID_L --regid=$GID_L --clear-groups \
  pg_ctl -D /tmp/pg17c/data -o "-k /tmp/pg17c -p 55433 -c listen_addresses=''" \
  -l /tmp/pg17c/log start

P="psql -h /tmp/pg17c -p 55433 -U pg -d postgres -v ON_ERROR_STOP=1 -q"
$P -f scripts/councils-voting-date-invariants-04-pg17/00-schema.sql
$P -f docs/migration-drafts/COUNCILS-VOTE-COMPLETION-GUARD-04.sql
$P -f docs/migration-drafts/COUNCILS-MEETING-DATE-INVARIANTS-04.sql
$P -f scripts/councils-voting-date-invariants-04-pg17/01-cases.sql

setpriv --reuid=$UID_L --regid=$GID_L --clear-groups pg_ctl -D /tmp/pg17c/data stop
```

A clean run ends with `PASS_COUNCILS_VOTING_DATE_INVARIANTS_04_PG17_MATRIX`;
any failing case raises and aborts.

## Coverage (16 assertions, all PASS on 2026-08-14)

Vote parity
1. ELIGIBLE excludes `viewer` and absent members
2. a `viewer` cannot cast a vote
3. close denied at CAST=1 / ELIGIBLE=2 with an explicit `COUNCIL_VOTING_INCOMPLETE` payload
4. progress read model reports the same eligible / cast / can_close values
5. `vote_completed` dispatched exactly at CAST = ELIGIBLE; close then succeeds
6. `abstain` counts as a cast vote

Date invariants
7. `intake_opens_at >= intake_closes_at` rejected
8. `intake_closes_at > scheduled_at` rejected
9. half-open intake window rejected
10. valid chronology accepted
11. legacy row with broken dates can still change status (not stranded)
12. correcting a legacy row's dates is still validated

## Notes

- The `cron.schedule` block in the notifications draft is not exercised here
  (`pg_cron` is not installed on the disposable cluster); it is verified by the
  source guard test instead.
- The table-level `CHECK` remains a deferred, commented step in the date draft.
