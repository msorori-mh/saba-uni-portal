# P0-C — Account continuity reconciliation

| Field | Value |
|---|---|
| Mission | `ALUMNI-P0-IMPLEMENTATION-RECONCILIATION-AND-GAP-CLOSURE-01` / STREAM C |
| Contract | `docs/alumni/ALUMNI-P0-ACCOUNT-CONTINUITY-CONTRACT-01.md` |
| Evaluator | `src/lib/graduates-affairs/account-continuity.ts` |
| Completion policy surface | `docs/migration-drafts/GRADUATES-AFFAIRS-MVP-COMPLETION-01.sql` |
| Mode | SOURCE RECONCILIATION — no second IdP |

## Required identity model

| Layer | Contract | Existing | Status |
|---|---|---|---|
| Same `auth.users` | No second alumni IdP | No second-auth create path in GA drafts | `IMPLEMENTED_MAIN` |
| Same `student_profiles.user_id` | Continuity on existing profile | Foundation FK / request ownership model | `IMPLEMENTED_MAIN` |
| Separate student vs graduate capabilities | Allow-list + audience gates | Continuity evaluator + `assert_student_can_use_request_type` | `PARTIALLY_IMPLEMENTED` |

## Runtime gap map

| Concern | Finding | Class / action |
|---|---|---|
| Graduated audience resolution | Request audience graduate/both gating exists | `IMPLEMENTED_MAIN` |
| Continuity product decision drift (D-13 undecided label) | Evaluator previously claimed undecided product | **FIXED** — closed D-AUTH baseline + expanded §6.1 vocabulary; undecided default retained fail-closed |
| Capability vocabulary incomplete | Pre-fix short allow-list | **FIXED** |
| Login / session continuity wiring | `portal-login` does not call evaluator | `P0_BLOCKING` remaining → runtime wiring NEXT_STEP |
| Recovery continuity (personal channel) | forgot-password university-email oriented | `P1_LATER` / runtime |
| Reused university email | Baseline `allowUniversityEmailReuse=false`; deny flag enforced | `IMPLEMENTED_MAIN` (policy encoding); import detach procedure `P1_LATER` |
| Former student capability blocking | Active-only DENY via request RPC; continuity gate unwired at login | `PARTIALLY_IMPLEMENTED` |
| Graduate portal capability activation | Domain RPCs exist in Auth-04; continuity not wired | runtime wiring |

## Gaps implemented this mission

- `ACCOUNT_CONTINUITY_POLICY_APPROVED_BASELINE` encodes closed product content.
- Capability vocabulary aligned to contract §6.1 (plus legacy aliases kept for existing callers).
- Evaluator still requires provenance / in-force window — **no silent grant**.

## Verdict

**P0-C: PARTIAL** — identity model correct; product baseline encoded; login/recovery wiring remains the true remaining P0 runtime gap.
