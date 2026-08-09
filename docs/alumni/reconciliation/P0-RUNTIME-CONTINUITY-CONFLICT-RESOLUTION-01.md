# Integration conflict classification — account-continuity.ts

## Classification
SEMANTIC_OVERLAP_RESOLVED_BY_MISSION_PRIORITY

Runtime worktree edited `account-continuity.ts` with OWNER_D2 header but kept the pre-P0 short capability list.
Accepted P0 SHA `a96c2474` closed D-AUTH with APPROVED_BASELINE + §6.1 vocabulary.

**Resolution:** keep P0 `account-continuity.ts`. Import runtime wiring without overwriting that module.
Mechanically widen Zod capability enums in `graduates-affairs.functions.ts` to the P0 vocabulary.
