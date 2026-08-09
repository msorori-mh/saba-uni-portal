# PORTAL-FINAL-READONLY-PREFLIGHT-PACKAGE-01

**حزمة الفحص المسبق للقراءة فقط لقواعد البيانات والبيئة الإنتاجية — بوابة الكلية**

- **المعرّف**: `PORTAL-FINAL-READONLY-PREFLIGHT-PACKAGE-01`
- **الفرع المصشتق**: `docs/portal-final-production-runbook-prep-01`
- **شجرة العمل**: `C:\projects\saba-production-runbook-prep`
- **حالة التنفيذ الإلزامية**: **DO NOT EXECUTE AGAINST PRODUCTION IN THIS MISSION** (مصممة للاستخدام المباشر قبل أي كتابة مستقبلية فقط).
- **القيود الأحدية**:
  - `SELECT` وقراءات كتالوج الكائنات وحالات النظام فقط (`SELECT / CATALOG READS ONLY`).
  - **يُمنع منعاً باتاً**: أي استدعاء لـ RPCs الأعمال (`NO RPC BUSINESS CALLS`).
  - **يُمنع منعاً باتاً**: أي تغيير بيانات DML (`INSERT`, `UPDATE`, `DELETE`).
  - **يُمنع منعاً باتاً**: أي تعديل هيكلي DDL (`CREATE`, `ALTER`, `DROP`).
  - **يُمنع منعاً باتاً**: أي منح أو سحب صلاحيات (`GRANT`, `REVOKE`).
  - **يُمنع منعاً باتاً**: تغيير الدور العملي (`SET ROLE`).
  - **يُمنع منعاً باتاً**: تطبيق أي migration (`NO MIGRATION APPLY`).

---

## 1. بروتوكول السلامة والاستعلامات المعتمدة (Safety Protocol & Read-Only Queries)

تتكون الحزمة من 11 فحصاً مستقلاً موثقاً بـ SQL صريح للقراءة فقط. تُشغّل هذه الاستعلامات في جلسة قراءة واحدة لا تحتوي على أي كود كتابي.

---

### الفحص 1: الهوية الأساسية لمشروع الإنتاج ومخطط النطاق (Production Project Identity)

```sql
-- Probe 01: Verify Database Name, Current User, and PostgreSQL Core Instance Attributes
SELECT 
    current_database() AS db_name,
    current_schema() AS schema_name,
    current_user AS connected_user,
    session_user AS session_user_name,
    inet_server_addr() AS server_ip,
    inet_server_port() AS server_port,
    pg_is_in_recovery() AS is_read_replica;
```

---

### الفحص 2: إصدار PostgreSQL والإضافات المسبارة (PostgreSQL Version & Extensions)

```sql
-- Probe 02: Check Engine Version and Active Security/Crypto Extensions
SELECT version() AS pg_full_version;

SELECT 
    extname AS extension_name,
    extversion AS installed_version
FROM pg_extension
WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm', 'pg_stat_statements')
ORDER BY extname;
```

---

### الفحص 3: حالة سجل التغييرات وقاع الجدول الحاكم (Ledger Tip & Migration Count)

```sql
-- Probe 03: Count Applied Schema Migrations and Fetch the Top 10 Latest Entries
SELECT count(*) AS total_applied_migrations
FROM supabase_migrations.schema_migrations;

SELECT version, inserted_at
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 10;
```

---

### الفحص 4: مصفوفة تواجد أو غياب التغيرات المطلوبة للإنتاج (Release Migration Presence/Absence Matrix)

```sql
-- Probe 04: Check exact absence or presence of specific key release migration versions
SELECT 
    v.migration_version,
    v.target_system,
    CASE 
        WHEN sm.version IS NOT NULL THEN 'APPLIED_IN_CATALOG'
        ELSE 'NOT_APPLIED'
    END AS execution_status
FROM (
    VALUES 
        ('20260708120000', 'Councils C0 Attachments'),
        ('20260709120000', 'Councils C1 Seed Data'),
        ('20260710120000', 'Councils C2 Schedule Helpers'),
        ('20260711000000', 'GA Foundation Email'),
        ('20260713010000', 'GA Workflow Restrict Admin'),
        ('20260723061809', 'GA Auth-04 Hardening'),
        ('20260808010000', 'GP Level-4 Eligibility Guard'),
        ('20260802070000', 'B1 Terminal Visibility Baseline')
) AS v(migration_version, target_system)
LEFT JOIN supabase_migrations.schema_migrations sm ON sm.version = v.migration_version
ORDER BY v.migration_version;
```

---

### الفحص 5: الفحص المسبق لمشاريع التخرج وجاهزية المستويات (GP Prerequisites & Level-4 Verification)

```sql
-- Probe 05: Verify Student Academic Level Distribution & Check for GP Guard Functions
SELECT 
    academic_level,
    count(*) AS student_count
FROM student_profiles
GROUP BY academic_level
ORDER BY academic_level;

SELECT 
    proname AS function_name,
    prosecdef AS is_security_definer
FROM pg_proc
WHERE proname IN ('check_gp_student_level4_eligibility', 'validate_gp_team_formation')
  AND pronamespace = 'public'::regnamespace;
```

---

### الفحص 6: الفحص المسبق لشؤون الخريجين وجداول الأساس (GA Prerequisites & Foundation Schema)

```sql
-- Probe 06: Inspect Staff Profiles Columns and Graduate Verification Tables
SELECT 
    column_name, 
    data_type, 
    is_nullable 
FROM information_schema.columns 
WHERE table_name = 'staff_profiles' 
  AND column_name IN ('university_email', 'college_role', 'department_id')
ORDER BY column_name;

SELECT 
    table_name,
    (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name) AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('graduates', 'graduation_clearances', 'staff_profiles');
```

---

### الفحص 7: مصنف حالات المجالس الأكاديمية وجداولها (Councils State Classifier & Structure)

```sql
-- Probe 07: Validate Presence and Row Counts of Councils Domain Tables
SELECT 
    table_name,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t.table_name) 
        THEN 'EXISTS'
        ELSE 'MISSING'
    END AS table_presence
FROM (
    VALUES 
        ('councils'),
        ('council_members'),
        ('council_meetings'),
        ('council_topics'),
        ('council_topic_attachments'),
        ('council_decisions')
) AS t(table_name);
```

---

### الفحص 8: فحص سلطة الدوال وحالات الخدمات الخمس B1 (B1 Function & State Authority)

```sql
-- Probe 08: Inspect B1 Workflow Runtime and Service Functions Integrity
SELECT 
    code,
    name_ar,
    is_active,
    student_visible
FROM student_request_types
WHERE code IN (
    'enrollment_suspension',
    'excused_absence',
    'file_withdrawal',
    'department_transfer',
    'final_chance'
)
ORDER BY code;

SELECT 
    proname,
    prosecdef
FROM pg_proc
WHERE proname IN (
    'submit_student_request',
    'execute_workflow_step',
    'verify_payment_confirmation'
)
  AND pronamespace = 'public'::regnamespace;
```

---

### الفحص 9: فحص أعلام ظهور الخصائص لطلبات الطلاب (Feature Visibility Flags Inspection)

```sql
-- Probe 09: Complete Visibility State Analysis for All Registered Student Request Types
SELECT 
    code,
    name_ar,
    student_visible,
    is_active,
    requires_attachment
FROM student_request_types
ORDER BY code;
```

---

### الفحص 10: فحص حماية النطاق المحمي شهادة القيد (Protected Enrollment Certificate Baseline)

```sql
-- Probe 10: Verify enrollment_certificate workflow definitions & policy immutable baseline
SELECT 
    id,
    code,
    version,
    is_active
FROM student_request_workflows
WHERE request_type_code = 'enrollment_certificate';

SELECT 
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'document_issuance'
ORDER BY policyname;
```

---

### الفحص 11: أثر بصمة أداة النشر والأدلة المباشرة (Deployed Build SHA & Provenance Evidence)

```sql
-- Probe 11: Check system configuration / metadata version tables for deployed SHA evidence
SELECT 
    table_name
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE '%version%' OR table_name LIKE '%build%';
```

---
