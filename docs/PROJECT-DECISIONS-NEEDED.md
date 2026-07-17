# Project Decisions Needed — B1-02

## Department transfer fee configuration

- Status: `NEEDS_USER_DECISION`
- Required decision: approve an existing `fee_type.code` and the service's free/paid configuration.
- Not decided here: fee code, amount, or currency.
- Fail-closed behavior: `department_transfer` remains blocked with `BLOCKED_UNTIL_FEE_TYPE_CODE_APPROVED`.
- Proposed production command: none. A later migration/SQL application would require a separate explicit approval.
- Expected production impact now: none.

## Final-chance fee and academic mapping

- Status: `NEEDS_USER_DECISION`
- Required decisions: approve the free/paid configuration and the authoritative mapping between contract values `additional_exam|grade_recovery` and stored values `final_chance|additional_chance` (or approve a schema change).
- Not decided here: `fee_type.code`, amount, currency, or `chance_type` mapping.
- Fail-closed behavior: `final_chance` remains blocked with `NEEDS_USER_DECISION_FOR_ACADEMIC_MAPPING`.
- Proposed production command: none. A later migration/SQL application would require a separate explicit approval.
- Expected production impact now: none.
