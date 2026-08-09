# PORTAL-FINAL-PRODUCTION-APPLY-ONE-OWNER-RUNBOOK-01

**دليل التطبيق الفردي والتحقق الإنتاجي النهائي لقاعدة البيانات — بروتوكول المالك الأحادي (Apply-One Policy)**

- **المعرّف**: `PORTAL-FINAL-PRODUCTION-APPLY-ONE-OWNER-RUNBOOK-01`
- **الفرع المصشتق**: `docs/portal-final-production-runbook-prep-01`
- **شجرة العمل**: `C:\projects\saba-final-runbook-316-repin`
- **تركيبة الإصدار المستهدفة**: `#293` + `#291` + `#299` + `#311` + `#312` + `#314` + `#315` + `#317` + `#310`
- **مرجع الـ RC الشامل (FINAL SOURCE RC)**: PR `#313` (`rc/portal-final-v4-prebuild-non-b1-01`)
- **FINAL_RC_HEAD_SHA**: `FINAL_RC_HEAD_SHA=2a283003957b4ea490959a10594a7eaf6a3e115d`
- **RC313_SHA**: `RC313_SHA=2a283003957b4ea490959a10594a7eaf6a3e115d` (alias مطابق لـ FINAL_RC_HEAD_SHA)
- **حالة دمج PR #314 في RC313**: `PR314_IN_RC=YES` (`PR314_SHA=faaf96533a6a4b54aed3d453309cfb5779c79e6f`)
- **حالة دمج PR #315 في RC313**: `PR315_IN_RC=YES` (`PR315_SHA=42a9586fe7b20ca883c2f45a6f683a1e2f2e909c`, `PR315_MIGRATIONS=0`)
- **حالة دمج PR #317 في RC313**: `PR317_IN_RC=YES` (`PR317_SHA=636e26f1d221f784d18bae00c9a4e7254e1be819`, `PR317_MIGRATIONS=0`)
- **مرجع B1**: PR `#310` (`B1_FINAL_HEAD_SHA=1bdd2fafd37515e18031ef79b4f62233ecb12e12`, `B1_INSERTION_MIGRATIONS=0`)
- **وضع التنفيذ**: **PREPARATION ONLY** (`PRODUCTION_EXECUTION=NOT_AUTHORIZED`)
- **سياسة التطبيق**: **STRICT APPLY-ONE POLICY** (`max_migrations_per_apply_session=1`, `batch_apply_forbidden=true`, `parallel_apply_forbidden=true`, `ci_auto_apply_forbidden=true`)

---

## 1. بروتوكول التسلسل الملزم (Mandatory Sequence Policy)

تُطبّق كل migration إنتاجية بشكل فردي ومفصل باتباع دورة الحركة الثمانية التالية حصراً:

```
[1. PREFLIGHT] 
       │
       ▼
[2. OWNER GO] 
       │
       ▼
[3. APPLY EXACTLY ONE MIGRATION] 
       │
       ▼
[4. VERIFY OBJECT CREATION] 
       │
       ▼
[5. PROTECTED SURFACE CHECK] 
       │
       ▼
[6. RECORD EVIDENCE] 
       │
       ▼
[7. OWNER GO FOR NEXT STEP] 
       │
       ▼
[8. NEXT MIGRATION IN GRAPH]
```

### قواعد البروتوكول المشددة:
1. **يُمنع منعاً باتاً التطبيق الجماعي (Batch Apply)**: كل ملف SQL يُنفّذ في معاملة مستقلة تماماً.
2. **قرار المالك المستقل (Owner Go Required)**: لا يجوز الانتقال لـ migration تالية دون قرار موافقة صريح ومستقل من المالك المسؤول لكل خطوة.
3. **التوقف الفوري عند أي انحراف (Stop-on-Anything)**: أي فشل في فحص ما قبل التشغيل (Preflight)، أو خطأ تنفيذ (Apply Failure)، أو عدم اكتمال الكائنات المتوقعة (Verify Failure)، أو أي خرق لثوابت السجلات المحمية ⇒ **توقف فوري وكامل للتسلسل**.
4. **التعافي إلى الأمام فقط (Forward-Only Recovery)**: يُمنع استخدام down-migrations أو `DELETE` أو إعادة كتابة السجلات التاريخية أو `migration repair`. أي تعافٍ يتم عبر migration جديدة مُراجعة ومُعتمدة تُطبق إلى الأمام (`ROLLBACK_BY_FORWARD`).

---

## 2. جدول إزالة واستبدال المداخل القديمة/الزائفة (Stale Entry Reconciliation Log)

تم تنظيف وحذف جميع مسميات الـ migrations التاريخية القديمة أو الزائفة التي لا تنتمي لشجرة الإصدار المعتمدة الحالية:

| STALE_ENTRY | WHY_INVALID | AUTHORITATIVE_REPLACEMENT |
|---|---|---|
| `20260708120000_council_topic_attachments.sql` | migration يوليو قديمة قبل إعادة الهيكلة؛ المعتمد هو C0 التكاملي | `20260808120000_councils_c0_write_surface_hardening_01.sql` |
| `20260709120000_department_councils_seed.sql` | migration بذرية قديمة غير موجودة في RC313 | `20260808121000_councils_c1_meeting_state_machine_01.sql` |
| `20260710120000_council_meeting_schedule_helpers.sql` | migration مساعدة قديمة تم استبدالها بدوال C2 | `20260808122000_councils_c2_topic_intake_review_01.sql` |
| `20260711000000_staff_profiles_university_email.sql` | migration تاريخية مدمجة سابقاً على main وليست خطوة إصدار جديدة | `20260808210000_ga_mvp_foundation_01.sql` |
| `20260713010000_restrict_workflow_activation_to_admins.sql` | migration تاريخية مدمجة سابقاً على main وليست خطوة إصدار جديدة | `20260808210100_ga_mvp_completion_01.sql` |
| `20260723061809_7f864e4b-262d-4dce-8475-d663377fb472.sql` | migration قديمة على main؛ استبدلت بـ GA Auth-04 المعتمدة | `20260808210200_ga_authorization_04.sql` |
| `20260727120000_gp_storage_insert_policy_auth_01.sql` | تسمية قديمة تم دمجها في PR #289؛ خطوة GP المحمية هي حارس L4 | `20260808010000_gp_student_level4_only_eligibility_guard_01.sql` |

---

## 3. رسم بياني للتسلسل المعتمد (Authoritative Release Migration Graph)

مخطط الإصدار المعتمد النهائي يتكون من 15 ملف migration تنفيذي مكرس ومفصل بالكامل. لا تُضاف مداخل migrations جديدة من `#315` أو `#317` أو إدراج B1 `#310` (`PR315_MIGRATIONS=0`, `PR317_MIGRATIONS=0`, `B1_INSERTION_MIGRATIONS=0`):

```
[مشاريع التخرج (GP Level-4 Guard)]
  GP-MIG-01 (20260808010000)
       │
       ▼
[المجالس الأكاديمية (Councils C0 → C9 - PR #311)]
  C0 (20260808120000) ──► C1 (20260808121000) ──► C2 (20260808122000) ──► C3 (20260808130000) ──► C4 (20260808140000)
                                                                                                        │
  C9 (20260808180000) ◄── C8 (20260808171000) ◄── C7 (20260808170000) ◄── C6 (20260808160000) ◄── C5 (20260808150000)
       │
       ▼
[شؤون الخريجين (Graduates Affairs GA - PR #299)]
  GA-Foundation (20260808210000) ──► GA-Completion (20260808210100) ──► GA-Auth-04 (20260808210200)
                                                                               │
                                                                               ▼
[تسوية الكتالوج والتوجيه (Main-Tip Catalog Reconciliation)]
  MAIN-TIP-MIG-01 (20260809183940)
                                                                               │
                                                                               ▼
[الخدمات الخمس B1 (PR #310 — source-integrated, INSERTION_MIGRATIONS=0)]
  No new release SQL files. Operational apply remains ONE→verify→next via historical B1 manifest only when owner-authorized.
  B1_FINAL_HEAD_SHA=1bdd2fafd37515e18031ef79b4f62233ecb12e12
```

---

## 4. مواصفات التنفيذ التفصيلية لكل Migration (Detailed Migration Execution Specifications)

---

### أولاً: مشاريع التخرج (Graduation Projects - GP)

#### 1.1 GP Level-4 Student Eligibility Guard
- **SEQUENCE**: `GP-MIG-01`
- **SYSTEM**: `Graduation Projects (GP Level-4 Guard)`
- **EXACT_FILENAME**: `20260808010000_gp_student_level4_only_eligibility_guard_01.sql`
- **SOURCE_PR**: PR `#290` / PR `#292` (Merged to main)
- **SOURCE_SHA/HASH**: `5815d99f2556336e4029dc1dda7dba4ded0e495d58cdb0fa7ecc46b40ea6ff3c`
- **DEPENDENCY**: `Base Schema / GP MVP (PR #288)`
- **PRODUCTION_PRESTATE**: `check_gp_student_level4_eligibility` function pending verification/execution in production schema.
- **READONLY_PREFLIGHT**:
  ```sql
  SELECT count(*) FROM pg_proc WHERE proname = 'check_gp_student_level4_eligibility';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_GP_LEVEL4_ACTIVATION`
- **EXACTLY_ONE_APPLY_TEMPLATE**:
  ```bash
  -- Apply strictly: 20260808010000_gp_student_level4_only_eligibility_guard_01.sql
  ```
- **POST_VERIFIER**:
  ```sql
  SELECT count(*) FROM pg_proc WHERE proname = 'check_gp_student_level4_eligibility';
  ```
  *المتوقع*: `1`
- **PROTECTED_SURFACES**: `graduation_projects` table and student level registration states.
- **STOP_CONDITION**: Any syntax error or invalid level check logic.
- **FORWARD_RECOVERY**: `CREATE OR REPLACE FUNCTION` forward patch (`ROLLBACK_BY_FORWARD`).

---

### ثانياً: نظام المجالس الأكاديمية (Academic Councils C0 → C9)

#### 2.1 Council C0: Write Surface Hardening
- **SEQUENCE**: `COUNCILS-MIG-01`
- **SYSTEM**: `Councils (C0 Write Surface Hardening)`
- **EXACT_FILENAME**: `20260808120000_councils_c0_write_surface_hardening_01.sql`
- **SOURCE_PR**: PR `#311` (Integrated in PR `#313`)
- **SOURCE_SHA/HASH**: `7b7686535e3f77cae5bc72146e2f65db2231a92de75a1815170305d7abac6029`
- **DEPENDENCY**: `GP-MIG-01`
- **PRODUCTION_PRESTATE**: `councils` write surface unhardened against direct postgrest mutators.
- **READONLY_PREFLIGHT**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'council_topic_attachments';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_COUNCILS_C0`
- **EXACTLY_ONE_APPLY_TEMPLATE**:
  ```bash
  -- Apply strictly: 20260808120000_councils_c0_write_surface_hardening_01.sql
  ```
- **POST_VERIFIER**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'council_topic_attachments';
  ```
  *المتوقع*: `1`
- **PROTECTED_SURFACES**: `councils` table and core schema definitions.
- **STOP_CONDITION**: Table creation failure or invalid constraint.
- **FORWARD_RECOVERY**: Forward-only table/policy repair (`ROLLBACK_BY_FORWARD`).

#### 2.2 Council C1: Meeting State Machine
- **SEQUENCE**: `COUNCILS-MIG-02`
- **SYSTEM**: `Councils (C1 Meeting State Machine)`
- **EXACT_FILENAME**: `20260808121000_councils_c1_meeting_state_machine_01.sql`
- **SOURCE_PR**: PR `#311` (Integrated in PR `#313`)
- **SOURCE_SHA/HASH**: `498a8d8c274277ff3ffc96e95fa30202e859aa2a2cfd74bcfaaa9f5d39a033d5`
- **DEPENDENCY**: `COUNCILS-MIG-01`
- **PRODUCTION_PRESTATE**: Meeting state machine RPCs and enum transitions missing.
- **READONLY_PREFLIGHT**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'council_meetings';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_COUNCILS_C1`
- **EXACTLY_ONE_APPLY_TEMPLATE**:
  ```bash
  -- Apply strictly: 20260808121000_councils_c1_meeting_state_machine_01.sql
  ```
- **POST_VERIFIER**:
  ```sql
  SELECT count(*) FROM pg_proc WHERE proname = 'create_council_meeting';
  ```
  *المتوقع*: `>= 1`
- **PROTECTED_SURFACES**: `council_meetings` table and historical session records.
- **STOP_CONDITION**: State transition trigger failure or invalid enum value.
- **FORWARD_RECOVERY**: Forward-only RPC patch (`ROLLBACK_BY_FORWARD`).

#### 2.3 Council C2: Topic Intake & Review Workflow
- **SEQUENCE**: `COUNCILS-MIG-03`
- **SYSTEM**: `Councils (C2 Topic Intake & Review)`
- **EXACT_FILENAME**: `20260808122000_councils_c2_topic_intake_review_01.sql`
- **SOURCE_PR**: PR `#311` (Integrated in PR `#313`)
- **SOURCE_SHA/HASH**: `f969c6c0f63a4758944cc59f6c78292f56f3a4ac360ae77f0b386bf72e0e364e`
- **DEPENDENCY**: `COUNCILS-MIG-02`
- **PRODUCTION_PRESTATE**: `council_topics` intake & review RPC functions missing.
- **READONLY_PREFLIGHT**:
  ```sql
  SELECT count(*) FROM pg_proc WHERE proname = 'submit_council_topic';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_COUNCILS_C2`
- **EXACTLY_ONE_APPLY_TEMPLATE**:
  ```bash
  -- Apply strictly: 20260808122000_councils_c2_topic_intake_review_01.sql
  ```
- **POST_VERIFIER**:
  ```sql
  SELECT count(*) FROM pg_proc WHERE proname = 'submit_council_topic';
  ```
  *المتوقع*: `1`
- **PROTECTED_SURFACES**: `council_topics` table.
- **STOP_CONDITION**: Intake RPC creation error or syntax violation.
- **FORWARD_RECOVERY**: Forward-only function patch (`ROLLBACK_BY_FORWARD`).

#### 2.4 Council C3: Attendance & Quorum Foundation
- **SEQUENCE**: `COUNCILS-MIG-04`
- **SYSTEM**: `Councils (C3 Attendance & Quorum)`
- **EXACT_FILENAME**: `20260808130000_councils_c3_attendance_quorum_01.sql`
- **SOURCE_PR**: PR `#311` (Integrated in PR `#313`)
- **SOURCE_SHA/HASH**: `e7361f6c85014fb37b6f8d97bd468dc1205700748a526cb7a8063f82ff6c0de6`
- **DEPENDENCY**: `COUNCILS-MIG-03`
- **PRODUCTION_PRESTATE**: `council_meeting_attendance` table and quorum calculators missing.
- **READONLY_PREFLIGHT**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'council_meeting_attendance';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_COUNCILS_C3`
- **EXACTLY_ONE_APPLY_TEMPLATE**:
  ```bash
  -- Apply strictly: 20260808130000_councils_c3_attendance_quorum_01.sql
  ```
- **POST_VERIFIER**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'council_meeting_attendance';
  ```
  *المتوقع*: `1`
- **PROTECTED_SURFACES**: `council_members` and attendance ledgers.
- **STOP_CONDITION**: Table creation failure or foreign key mismatch.
- **FORWARD_RECOVERY**: Forward-only DDL/policy patch (`ROLLBACK_BY_FORWARD`).

#### 2.5 Council C4: Session Voting Subsystem
- **SEQUENCE**: `COUNCILS-MIG-05`
- **SYSTEM**: `Councils (C4 Session Voting)`
- **EXACT_FILENAME**: `20260808140000_councils_c4_session_voting_01.sql`
- **SOURCE_PR**: PR `#311` (Integrated in PR `#313`)
- **SOURCE_SHA/HASH**: `d0825e1ddcce82c0e1123ea04cba2777e3b726bc0e4ae514940a714d322b05cd`
- **DEPENDENCY**: `COUNCILS-MIG-04`
- **PRODUCTION_PRESTATE**: `council_topic_votes` table and anonymous/open voting logic missing.
- **READONLY_PREFLIGHT**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'council_topic_votes';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_COUNCILS_C4`
- **EXACTLY_ONE_APPLY_TEMPLATE**:
  ```bash
  -- Apply strictly: 20260808140000_councils_c4_session_voting_01.sql
  ```
- **POST_VERIFIER**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'council_topic_votes';
  ```
  *المتوقع*: `1`
- **PROTECTED_SURFACES**: `council_topic_votes` ballot ledger.
- **STOP_CONDITION**: Voting table creation failure or vote recording error.
- **FORWARD_RECOVERY**: Forward-only voting patch (`ROLLBACK_BY_FORWARD`).

#### 2.6 Council C5: Minutes Lifecycle Management
- **SEQUENCE**: `COUNCILS-MIG-06`
- **SYSTEM**: `Councils (C5 Minutes Lifecycle)`
- **EXACT_FILENAME**: `20260808150000_councils_c5_minutes_lifecycle_01.sql`
- **SOURCE_PR**: PR `#311` (Integrated in PR `#313`)
- **SOURCE_SHA/HASH**: `85c5db5e273f529bac300a6f983098eea30add602ed7a51fbe4635addb353c25`
- **DEPENDENCY**: `COUNCILS-MIG-05`
- **PRODUCTION_PRESTATE**: `council_meeting_minutes` table and drafting/approval state functions missing.
- **READONLY_PREFLIGHT**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'council_meeting_minutes';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_COUNCILS_C5`
- **EXACTLY_ONE_APPLY_TEMPLATE**:
  ```bash
  -- Apply strictly: 20260808150000_councils_c5_minutes_lifecycle_01.sql
  ```
- **POST_VERIFIER**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'council_meeting_minutes';
  ```
  *المتوقع*: `1`
- **PROTECTED_SURFACES**: `council_meeting_minutes` table.
- **STOP_CONDITION**: Minutes schema error or lifecycle function failure.
- **FORWARD_RECOVERY**: Forward-only lifecycle patch (`ROLLBACK_BY_FORWARD`).

#### 2.7 Council C6: Decisions & Follow-up Execution
- **SEQUENCE**: `COUNCILS-MIG-07`
- **SYSTEM**: `Councils (C6 Decisions & Follow-up)`
- **EXACT_FILENAME**: `20260808160000_councils_c6_decisions_followup_01.sql`
- **SOURCE_PR**: PR `#311` (Integrated in PR `#313`)
- **SOURCE_SHA/HASH**: `1051df7e816fc2e260616a9f1f9dba457e5e39e001c5ab06a91f376b84d92b43`
- **DEPENDENCY**: `COUNCILS-MIG-06`
- **PRODUCTION_PRESTATE**: `council_decisions` table and action item tracking missing.
- **READONLY_PREFLIGHT**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'council_decisions';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_COUNCILS_C6`
- **EXACTLY_ONE_APPLY_TEMPLATE**:
  ```bash
  -- Apply strictly: 20260808160000_councils_c6_decisions_followup_01.sql
  ```
- **POST_VERIFIER**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'council_decisions';
  ```
  *المتوقع*: `1`
- **PROTECTED_SURFACES**: `council_decisions` table.
- **STOP_CONDITION**: Decision table creation error or trigger failure.
- **FORWARD_RECOVERY**: Forward-only decision patch (`ROLLBACK_BY_FORWARD`).

#### 2.8 Council C7: Audit Log & Archive Snapshots
- **SEQUENCE**: `COUNCILS-MIG-08`
- **SYSTEM**: `Councils (C7 Audit & Archive)`
- **EXACT_FILENAME**: `20260808170000_councils_c7_audit_archive_01.sql`
- **SOURCE_PR**: PR `#311` (Integrated in PR `#313`)
- **SOURCE_SHA/HASH**: `3fd74518d57722b7018b06ba9ce50f7fb9033c2d8527fe515d5ad133a4081f6a`
- **DEPENDENCY**: `COUNCILS-MIG-07`
- **PRODUCTION_PRESTATE**: `council_audit_log` audit trail and immutable archiving structures missing.
- **READONLY_PREFLIGHT**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'council_audit_log';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_COUNCILS_C7`
- **EXACTLY_ONE_APPLY_TEMPLATE**:
  ```bash
  -- Apply strictly: 20260808170000_councils_c7_audit_archive_01.sql
  ```
- **POST_VERIFIER**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'council_audit_log';
  ```
  *المتوقع*: `1`
- **PROTECTED_SURFACES**: Historical audit records and archiving tables.
- **STOP_CONDITION**: Audit schema creation error or log trigger failure.
- **FORWARD_RECOVERY**: Forward-only audit patch (`ROLLBACK_BY_FORWARD`).

#### 2.9 Council C8: Final Security Closure & RLS Hardening
- **SEQUENCE**: `COUNCILS-MIG-09`
- **SYSTEM**: `Councils (C8 Security Closure)`
- **EXACT_FILENAME**: `20260808171000_councils_c0_c8_final_security_closure_01.sql`
- **SOURCE_PR**: PR `#311` (Integrated in PR `#313`)
- **SOURCE_SHA/HASH**: `6cb87098f9f038d0d6174aa08c37c524b1b4d91cca49244251cbc03ab6df37c3`
- **DEPENDENCY**: `COUNCILS-MIG-08`
- **PRODUCTION_PRESTATE**: RLS policies across C0-C7 tables require final security hardening.
- **READONLY_PREFLIGHT**:
  ```sql
  SELECT count(*) FROM pg_policies WHERE tablename LIKE 'council_%';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_COUNCILS_C8`
- **EXACTLY_ONE_APPLY_TEMPLATE**:
  ```bash
  -- Apply strictly: 20260808171000_councils_c0_c8_final_security_closure_01.sql
  ```
- **POST_VERIFIER**:
  ```sql
  SELECT count(*) FROM pg_policies WHERE tablename = 'council_decisions' AND policyname LIKE '%security_closure%';
  ```
  *المتوقع*: `>= 1`
- **PROTECTED_SURFACES**: All C0-C7 tables and RLS policy bindings.
- **STOP_CONDITION**: RLS lock-out or authorization failure.
- **FORWARD_RECOVERY**: Forward-only RLS policy patch (`ROLLBACK_BY_FORWARD`).

#### 2.10 Council C9: Notifications & Operational Reporting
- **SEQUENCE**: `COUNCILS-MIG-10`
- **SYSTEM**: `Councils (C9 Notifications & Reporting)`
- **EXACT_FILENAME**: `20260808180000_councils_c9_notifications_reporting_01.sql`
- **SOURCE_PR**: PR `#311` (Integrated in PR `#313`)
- **SOURCE_SHA/HASH**: `c15f3378d12de10a0ef04d93ce033adca06f70fd7d9d53b764a21e828c329d4e`
- **DEPENDENCY**: `COUNCILS-MIG-09`
- **PRODUCTION_PRESTATE**: Notification functions and operational reporting summary views missing.
- **READONLY_PREFLIGHT**:
  ```sql
  SELECT count(*) FROM pg_proc WHERE proname = 'get_council_reporting_summary';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_COUNCILS_C9`
- **EXACTLY_ONE_APPLY_TEMPLATE**:
  ```bash
  -- Apply strictly: 20260808180000_councils_c9_notifications_reporting_01.sql
  ```
- **POST_VERIFIER**:
  ```sql
  SELECT count(*) FROM pg_proc WHERE proname = 'get_council_reporting_summary';
  ```
  *المتوقع*: `1`
- **PROTECTED_SURFACES**: Reporting summary views and notification event queues.
- **STOP_CONDITION**: View or reporting function creation failure.
- **FORWARD_RECOVERY**: Forward-only reporting view patch (`ROLLBACK_BY_FORWARD`).

---

### ثالثاً: نظام شؤون الخريجين (Graduates Affairs - GA)

#### 3.1 GA Foundation: Core Tables & Profiles
- **SEQUENCE**: `GA-MIG-01`
- **SYSTEM**: `Graduates Affairs (GA Foundation)`
- **EXACT_FILENAME**: `20260808210000_ga_mvp_foundation_01.sql`
- **SOURCE_PR**: PR `#299` (Integrated in PR `#313`)
- **SOURCE_SHA/HASH**: `3248cf641add2dde7f249eb366f5b7b9668ef028130d6f0caffb0936969e2f43`
- **DEPENDENCY**: `COUNCILS-MIG-10`
- **PRODUCTION_PRESTATE**: GA foundational tables (`graduate_profiles`, etc.) missing.
- **READONLY_PREFLIGHT**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'graduate_profiles';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_GA_FOUNDATION`
- **EXACTLY_ONE_APPLY_TEMPLATE**:
  ```bash
  -- Apply strictly: 20260808210000_ga_mvp_foundation_01.sql
  ```
- **POST_VERIFIER**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'graduate_profiles';
  ```
  *المتوقع*: `1`
- **PROTECTED_SURFACES**: `graduate_profiles` table.
- **STOP_CONDITION**: Table creation failure or constraint conflict.
- **FORWARD_RECOVERY**: Forward-only foundation patch (`ROLLBACK_BY_FORWARD`).

#### 3.2 GA Completion: Workflows & Admin Activations
- **SEQUENCE**: `GA-MIG-02`
- **SYSTEM**: `Graduates Affairs (GA Completion)`
- **EXACT_FILENAME**: `20260808210100_ga_mvp_completion_01.sql`
- **SOURCE_PR**: PR `#299` (Integrated in PR `#313`)
- **SOURCE_SHA/HASH**: `3e37afbadd9b4c2ca4ec593ad47fae77b4333e62770f926598fcbf51336806fa`
- **DEPENDENCY**: `GA-MIG-01`
- **PRODUCTION_PRESTATE**: GA clearance request workflows & document templates missing.
- **READONLY_PREFLIGHT**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'graduate_clearance_requests';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_GA_COMPLETION`
- **EXACTLY_ONE_APPLY_TEMPLATE**:
  ```bash
  -- Apply strictly: 20260808210100_ga_mvp_completion_01.sql
  ```
- **POST_VERIFIER**:
  ```sql
  SELECT count(*) FROM information_schema.tables WHERE table_name = 'graduate_clearance_requests';
  ```
  *المتوقع*: `1`
- **PROTECTED_SURFACES**: `graduate_clearance_requests` table.
- **STOP_CONDITION**: Clearance request table creation error.
- **FORWARD_RECOVERY**: Forward-only clearance workflow patch (`ROLLBACK_BY_FORWARD`).

#### 3.3 GA Authorization-04: Multi-Model Privileges Hardening
- **SEQUENCE**: `GA-MIG-03`
- **SYSTEM**: `Graduates Affairs (GA Auth-04)`
- **EXACT_FILENAME**: `20260808210200_ga_authorization_04.sql`
- **SOURCE_PR**: PR `#299` (Integrated in PR `#313`)
- **SOURCE_SHA/HASH**: `212865fb7c4077ce313a9b4707700520be275360b54470fd62fc08edd539060c`
- **DEPENDENCY**: `GA-MIG-02`
- **PRODUCTION_PRESTATE**: GA multi-model RPC guards & RLS privacy rules missing.
- **READONLY_PREFLIGHT**:
  ```sql
  SELECT count(*) FROM pg_proc WHERE proname LIKE 'ga_%' AND prosecdef = true;
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_GA_AUTH04`
- **EXACTLY_ONE_APPLY_TEMPLATE**:
  ```bash
  -- Apply strictly: 20260808210200_ga_authorization_04.sql
  ```
- **POST_VERIFIER**:
  ```sql
  SELECT count(*) FROM pg_proc WHERE proname LIKE 'ga_%' AND prosecdef = true;
  ```
  *المتوقع*: `>= 1`
- **PROTECTED_SURFACES**: GA authorization RPCs and privacy policies.
- **STOP_CONDITION**: Authorization bypass detected in negative matrix test.
- **FORWARD_RECOVERY**: Forward-only RPC security patch (`ROLLBACK_BY_FORWARD`).

---

### رابعاً: تسوية الكتالوج والتوجيه (Main-Tip Catalog & Navigation Reconciliation)

#### 4.1 Main-Tip Catalog & Navigation Alignment
- **SEQUENCE**: `MAIN-TIP-MIG-01`
- **SYSTEM**: `Catalog & Navigation Reconciliation (Main-Tip)`
- **EXACT_FILENAME**: `20260809183940_e3eff340-d709-46e7-911b-1728767e4f41.sql`
- **SOURCE_PR**: PR `#312` / PR `#310` / `origin/main`
- **SOURCE_SHA/HASH**: `59bbd66e6a65f35ec8b0317bfbe5a21d2564b3982ab41b91b5219eec9631d9f4`
- **DEPENDENCY**: `GA-MIG-03`
- **PRODUCTION_PRESTATE**: Admin/Academic request types catalog needs final tip alignment.
- **READONLY_PREFLIGHT**:
  ```sql
  SELECT count(*) FROM schema_migrations WHERE version = '20260809183940';
  ```
- **OWNER_GO_REQUIRED**: `GATE_OWNER_MAIN_TIP_RECONCILIATION`
- **EXACTLY_ONE_APPLY_TEMPLATE**:
  ```bash
  -- Apply strictly: 20260809183940_e3eff340-d709-46e7-911b-1728767e4f41.sql
  ```
- **POST_VERIFIER**:
  ```sql
  SELECT count(*) FROM schema_migrations WHERE version = '20260809183940';
  ```
  *المتوقع*: `1`
- **PROTECTED_SURFACES**: `student_request_types` catalog.
- **STOP_CONDITION**: Catalog reconciliation error.
- **FORWARD_RECOVERY**: Forward-only catalog patch (`ROLLBACK_BY_FORWARD`).

---

### خامساً: نظام الخدمات الخمس B1 (PR #310 — FINAL HEAD PINNED)

*(ملاحظة: تم تثبيت المصدر. `B1_FINAL_HEAD_SHA=1bdd2fafd37515e18031ef79b4f62233ecb12e12`. `B1_INSERTION_MIGRATIONS=0` — لا تُخترع مداخل SQL جديدة في كتالوج الإطلاق الـ 15. أي تطبيق تشغيلي لاحق يبقى Apply-One عبر الـ manifest التاريخي فقط بعد موافقة المالك.)*

#### 5.1 B1 Source Pin (No New Release Migration Entries)
- **SEQUENCE**: `B1-SOURCE-PIN` (لا يضيف EXACT_FILENAME إلى كتالوج الـ 15)
- **SYSTEM**: `Student Requests B1 (Five Services)`
- **RELEASE_SQL_ADDITIONS**: `0`
- **SOURCE_PR**: PR `#310`
- **SOURCE_SHA/HASH**: `B1_FINAL_HEAD_SHA=1bdd2fafd37515e18031ef79b4f62233ecb12e12`
- **DEPENDENCY**: FINAL SOURCE RC `#313` (`FINAL_RC_HEAD_SHA=2a283003957b4ea490959a10594a7eaf6a3e115d`)
- **PRODUCTION_PRESTATE**: Owner-gated operational steps only; no invented release migrations.
- **READONLY_PREFLIGHT**: Preflight queries documented in `B1-SEQUENTIAL-APPLY-MANIFEST.json` (historical ops reference).
- **OWNER_GO_REQUIRED**: `GATE_OWNER_B1_FRESH_BASELINE`
- **EXACTLY_ONE_APPLY_TEMPLATE**: If any historical B1 SQL step is ever re-authorized: apply exactly one → verify → only then next; STOP on any failure/partial.
- **POST_VERIFIER**: Expected object proofs per authorized step.
- **PROTECTED_SURFACES**: `enrollment_certificate` and historical reason ledgers.
- **STOP_CONDITION**: Any preflight, apply, or verifier error.
- **FORWARD_RECOVERY**: Forward-only recovery (`ROLLBACK_BY_FORWARD`).

---

## 5. خطة التنفيذ لما بعد قاعدة البيانات (Post-Database Execution Plan)

تُحدد هذه الخطة الخطوات التشغيلية التتبعية التي تُنفذ **بعد** اكتمال تطبيق كافة الـ migrations وتأكيد سلامة قاعدة البيانات. **يُمنع تنفيذ أي من هذه الخطوات في المهمة الحالية**:

```
[1. Build Provenance Check]
            │
            ▼
[2. Deployment Owner Gate] ──► [3. Deploy Execution] ──► [4. Deployed SHA Proof Verification]
                                                                     │
                                                                     ▼
[6. Student / Faculty / Admin Smoke Tests] ◄── [5. Feature & Visibility Owner Decisions]
            │
            ▼
[7. E2E Verification Suites (B1 / Councils / GP L4 / GA)]
            │
            ▼
[8. Enrollment Certificate Regression Suite]
            │
            ▼
[9. Final Evidence Package Compilation & Sign-off]
```

### التفاصيل الخطوية للخطة:
1. **فحص أصل البناء (Build Provenance Check)**: تأكيد مطابقة الـ Git Commit SHA مع الـ Artifact المبني عبر CI.
2. **بوابة المالك للنشر (Deployment Owner Gate)**: الحصول على التخويل الصريح والمستقل لإجراء عملية النشر على بيئة الإنتاج.
3. **التطبيق والنشر (Deploy Execution)**: رفع الأداة والملفات الثابتة إلى بيئة الاستضافة الإنتاجية.
4. **إثبات بصمة الكود المنشور (Deployed SHA Proof Verification)**: إجراء قراءة عادية (Read-back) من البيئة المباشرة لتأكيد أن `DEPLOYED_SHA` يطابق `FINAL_RC_HEAD_SHA=2a283003957b4ea490959a10594a7eaf6a3e115d` (`RC313_SHA` alias).
5. **قرارات المالك للظهور والخصائص (Feature/Visibility Owner Decisions)**: اتخاذ قرارات فردية لتفعيل رؤية الخدمات الخمس وخصائص المجالس وشؤون الخريجين (`student_visible=true`).
6. **الاختبارات الدخانية التفاعلية (Smoke Tests)**:
   - فحص واجهة الطالب (`student smoke`).
   - فحص واجهة عضو الهيئة التدريسية (`faculty smoke`).
   - فحص واجهة مسؤول النظام (`admin smoke`).
7. **حزم الاختبارات الطرفية الشاملة (E2E Verification Suites)**:
   - تشغيل اختبارات الخدمات الخمس B1.
   - تشغيل اختبارات المجالس الأكاديمية C0-C9.
   - تشغيل اختبار الإيجاب لطالب مستوى 4 في مشاريع التخرج.
   - تشغيل اختبار السلب لطلاب المستويات 1-3 في مشاريع التخرج.
   - تشغيل اختبارات شؤون الخريجين كاملة.
8. **فحص حماية شهادة القيد (Enrollment Certificate Regression Check)**: التأكد التام من أن خدمة شهادة القيد لم تتأثر بأي تعديل وبقيت مطابقة للـ Baseline المحمي.
9. **تجميع حزمة الأدلة النهائية (Final Evidence Package Compilation)**: حفظ جميع مخرجات الاستعلامات وسجلات الاختبارات وتواقيع الموافقة في حزمة أدلة رسمية.

---
