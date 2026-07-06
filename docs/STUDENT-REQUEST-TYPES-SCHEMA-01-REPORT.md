# STUDENT-REQUEST-TYPES-SCHEMA-01 Report

**التاريخ:** 2026-07-06 (توثيق لاحق — أُنشئ بعد مراجعة LAST-3-STAGES)  
**المستودع:** `C:\projects\saba-uni-portal-git`  
**القرار:** **PASS_WITH_NOTES**  
**المرحلة التالية عند التنفيذ:** **STUDENT-REQUEST-TYPES-RPC-RLS-01**

---

## 1. Executive Summary

| البند | النتيجة |
|-------|---------|
| **القرار** | **PASS_WITH_NOTES** |
| **ما تم** | migration schema-only يضيف `request_audience` و`ineligible_display_mode`، يستبدل `sr_type_chk` بـ FK `NOT VALID` |
| **تطبيق DB** | ❌ لم يُطبَّق |

**ملاحظة:** FK `NOT VALID` يحتاج `VALIDATE CONSTRAINT` لاحقاً بعد DATA-NORMALIZATION.

---

## 2. Scope

- schema-only — ملف migration مُعدّ للتطبيق لاحقاً.
- لا seed، لا data writes، لا DB apply في مرحلة الإنشاء.

---

## 3. Migration Created

| البند | التفاصيل |
|-------|----------|
| **الملف** | `supabase/migrations/20260710130000_student_request_types_schema.sql` |
| **Timestamp** | بعد `20260710120000_council_meeting_schedule_helpers.sql` |

---

## 4. request_types Changes

### `request_audience`

- `ADD COLUMN IF NOT EXISTS text NOT NULL DEFAULT 'active_student'`
- CHECK: `active_student`, `graduate`, `both`
- Constraint: `request_types_request_audience_chk` (idempotent DO block)

### `ineligible_display_mode`

- `ADD COLUMN IF NOT EXISTS text NOT NULL DEFAULT 'hidden'`
- CHECK: `hidden`, `disabled`
- Constraint: `request_types_ineligible_display_mode_chk` (idempotent DO block)

### COMMENT

يوضح أن الحماية النهائية في RPC/RLS وليس UI فقط.

---

## 5. student_requests Type Constraint / FK

| الإجراء | تم؟ |
|---------|-----|
| `DROP CONSTRAINT IF EXISTS sr_type_chk` | ✅ |
| FK `student_requests_type_request_types_code_fk` | ✅ |
| `request_type` → `request_types(code)` | ✅ |
| `NOT VALID` | ✅ |
| `VALIDATE CONSTRAINT` | ❌ مؤجّل |
| unique إضافي على `code` | ❌ غير مطلوب — UNIQUE منذ `20260601000207` |

---

## 6. Data Normalization Deferred

- لا UPDATE / توحيد `reenrollment` / `department_transfer`
- لا seed `request_audience` per type

---

## 7. Safety Notes

- ❌ لا seed، لا تطبيق migration، لا service role
- ❌ لا UI/RPC في هذه المرحلة

---

## 8. Recommended Next Phase

**STUDENT-REQUEST-TYPES-RPC-RLS-01** (مكتمل لاحقاً في المستودع)

---

## 9. No-Write Assurance

| العنصر | تم؟ |
|--------|-----|
| تشغيل migration | ❌ |
| تعديل DB | ❌ |
| data writes | ❌ |
| **الملف الأصلي** | migration فقط |

---

*نهاية التقرير — STUDENT-REQUEST-TYPES-SCHEMA-01 (توثيق)*
