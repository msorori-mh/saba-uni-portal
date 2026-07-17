# Project Decisions Needed

Updated: 2026-07-17 (Asia/Riyadh)

## Functional decisions requiring explicit owner approval

| Decision | Why it is blocked | Production action proposed | Expected production effect |
|---|---|---|---|
| Approve `fee_type.code` for applicable B1 services | Inventing or approving a fee code is prohibited | None until a code is approved; any later migration/apply requires a separate approval | Would define the external/manual financial verification classification |
| Approve academic mapping for final/extra chance (`chance_type`) | The repository must not invent academic semantics | None until the authoritative mapping is supplied; any later migration/apply requires separate approval | Would determine the persisted academic chance classification |
| Apply future reviewed B1/attachment migrations | All SQL and migration application is production-impacting | Proposed later: an exact reviewed Supabase migration command, not yet selected or executed | Would create or alter runtime database/storage contracts |

No production command is authorized or scheduled in the current source-only cycle.
