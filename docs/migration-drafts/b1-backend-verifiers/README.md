# B1 Backend Implementation 01 — Preflight / Post-Verifier Index

SOURCE-ONLY companions for promoted migrations orders 7–18.
Each verifier is READ-ONLY and ends with ROLLBACK. Never apply as a migration.

| Order | Migration | Preflight | Post-verifier |
|---:|---|---|---|
| 7 | `supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql` | `docs/migration-drafts/b1-backend-verifiers/07-B1_07_SECURE_ATTACHMENTS_SOURCE_01-PREFLIGHT.sql` | `docs/migration-drafts/b1-backend-verifiers/07-B1_07_SECURE_ATTACHMENTS_SOURCE_01-POST-VERIFIER.sql` |
| 8 | `supabase/migrations/20260725110100_b1_08_trusted_reference_validators_05a.sql` | `docs/migration-drafts/b1-backend-verifiers/08-B1_08_TRUSTED_REFERENCE_VALIDATORS_05A-PREFLIGHT.sql` | `docs/migration-drafts/b1-backend-verifiers/08-B1_08_TRUSTED_REFERENCE_VALIDATORS_05A-POST-VERIFIER.sql` |
| 9 | `supabase/migrations/20260725110200_b1_09_excused_absence_vocabulary_05a.sql` | `docs/migration-drafts/b1-backend-verifiers/09-B1_09_EXCUSED_ABSENCE_VOCABULARY_05A-PREFLIGHT.sql` | `docs/migration-drafts/b1-backend-verifiers/09-B1_09_EXCUSED_ABSENCE_VOCABULARY_05A-POST-VERIFIER.sql` |
| 10 | `supabase/migrations/20260725110300_b1_10_excused_absence_detail_05a.sql` | `docs/migration-drafts/b1-backend-verifiers/10-B1_10_EXCUSED_ABSENCE_DETAIL_05A-PREFLIGHT.sql` | `docs/migration-drafts/b1-backend-verifiers/10-B1_10_EXCUSED_ABSENCE_DETAIL_05A-POST-VERIFIER.sql` |
| 11 | `supabase/migrations/20260725110400_b1_11_file_withdrawal_details_05a.sql` | `docs/migration-drafts/b1-backend-verifiers/11-B1_11_FILE_WITHDRAWAL_DETAILS_05A-PREFLIGHT.sql` | `docs/migration-drafts/b1-backend-verifiers/11-B1_11_FILE_WITHDRAWAL_DETAILS_05A-POST-VERIFIER.sql` |
| 12 | `supabase/migrations/20260725110500_b1_12_transfer_secure_attachment_05a.sql` | `docs/migration-drafts/b1-backend-verifiers/12-B1_12_TRANSFER_SECURE_ATTACHMENT_05A-PREFLIGHT.sql` | `docs/migration-drafts/b1-backend-verifiers/12-B1_12_TRANSFER_SECURE_ATTACHMENT_05A-POST-VERIFIER.sql` |
| 13 | `supabase/migrations/20260725110600_b1_13_final_chance_canonical_write_03.sql` | `docs/migration-drafts/b1-backend-verifiers/13-B1_13_FINAL_CHANCE_CANONICAL_WRITE_03-PREFLIGHT.sql` | `docs/migration-drafts/b1-backend-verifiers/13-B1_13_FINAL_CHANCE_CANONICAL_WRITE_03-POST-VERIFIER.sql` |
| 14 | `supabase/migrations/20260725110700_b1_14_detail_rpc_write_boundaries_05a.sql` | `docs/migration-drafts/b1-backend-verifiers/14-B1_14_DETAIL_RPC_WRITE_BOUNDARIES_05A-PREFLIGHT.sql` | `docs/migration-drafts/b1-backend-verifiers/14-B1_14_DETAIL_RPC_WRITE_BOUNDARIES_05A-POST-VERIFIER.sql` |
| 15 | `supabase/migrations/20260725110800_b1_15_service_details_dispatcher_05a.sql` | `docs/migration-drafts/b1-backend-verifiers/15-B1_15_SERVICE_DETAILS_DISPATCHER_05A-PREFLIGHT.sql` | `docs/migration-drafts/b1-backend-verifiers/15-B1_15_SERVICE_DETAILS_DISPATCHER_05A-POST-VERIFIER.sql` |
| 16 | `supabase/migrations/20260725110900_b1_16_free_service_workflows_08.sql` | `docs/migration-drafts/b1-backend-verifiers/16-B1_16_FREE_SERVICE_WORKFLOWS_08-PREFLIGHT.sql` | `docs/migration-drafts/b1-backend-verifiers/16-B1_16_FREE_SERVICE_WORKFLOWS_08-POST-VERIFIER.sql` |
| 17 | `supabase/migrations/20260725111000_b1_17_external_university_payment_workflows_02.sql` | `docs/migration-drafts/b1-backend-verifiers/17-B1_17_EXTERNAL_UNIVERSITY_PAYMENT_WORKFLOWS_02-PREFLIGHT.sql` | `docs/migration-drafts/b1-backend-verifiers/17-B1_17_EXTERNAL_UNIVERSITY_PAYMENT_WORKFLOWS_02-POST-VERIFIER.sql` |
| 18 | `supabase/migrations/20260725111100_b1_18_detail_acl_cutover_06.sql` | `docs/migration-drafts/b1-backend-verifiers/18-B1_18_DETAIL_ACL_CUTOVER_06-PREFLIGHT.sql` | `docs/migration-drafts/b1-backend-verifiers/18-B1_18_DETAIL_ACL_CUTOVER_06-POST-VERIFIER.sql` |
