# PORTAL-PRODUCTION-MIGRATIONS-SEQUENTIAL-APPLY-G1-01 — REPORT

**التاريخ:** 2026-07-09
**Lovable Project ID:** `4b291119-790f-4484-9285-c2b774e1ba6f`
**Supabase Production Ref:** `wpmicqriltrowwonknox` ✅
**Migration Preflight Reference:** `docs/PORTAL-PRODUCTION-MIGRATIONS-PREFLIGHT-01-REPORT.md` → `GO_READY_FOR_SEQUENTIAL_APPLY`

---

## 1. Target Supabase Verification
- `supabase--project_info` أعاد `ref = wpmicqriltrowwonknox` ✅ — مطابق للـref الإلزامي.

## 2. Migration Filename
- `supabase/migrations/20260710130000_student_request_types_schema.sql` — الوحيدة المطبَّقة في هذه المرحلة.
- Migrations لاحقة (`20260710140000` وما بعدها) **لم تُلمس**.

## 3. Pre-Apply Verification
| فحص | النتيجة |
|-----|---------|
| `schema_migrations WHERE version='20260710130000'` | ❌ غير موجودة (لم تُطبَّق) |
| `request_types.request_audience` عمود موجود | ❌ غير موجود |
| `request_types.ineligible_display_mode` عمود موجود | ❌ غير موجود |
| `sr_type_chk` قائم | ✅ موجود (سيُحذف) |
| `student_requests_type_request_types_code_fk` قائم | ❌ غير موجود |

الحالة مطابقة تماماً لِما وصفه تقرير الـPreflight — سلامة الفحص مؤكَّدة.

## 4. Apply Start & Finish
- تم استدعاء `supabase--migration` مرة واحدة بمحتوى الـSQL كما هو في الملف، وأُقرّت وشُغّلت.
- النتيجة: `The migration completed successfully.` ✅

## 5. SQL Execution Result
- 3 `ALTER TABLE` + 3 `DO $$ … END $$` (idempotent guards) + 3 `COMMENT ON`.
- لا أخطاء SQL، لا rollback جزئي.

## 6. Migration History Result
```
version         | name
20260710130000  | student_request_types_schema
```
مسجَّلة **مرة واحدة فقط** ✅

## 7. Objects Created / Modified
| كائن | نوع التغيير |
|------|-------------|
| `public.request_types.request_audience` | **ADD COLUMN** — `text NOT NULL DEFAULT 'active_student'` |
| `public.request_types.ineligible_display_mode` | **ADD COLUMN** — `text NOT NULL DEFAULT 'hidden'` |
| `request_types_request_audience_chk` | **ADD CONSTRAINT CHECK** (`IN ('active_student','graduate','both')`) |
| `request_types_ineligible_display_mode_chk` | **ADD CONSTRAINT CHECK** (`IN ('hidden','disabled')`) |
| `sr_type_chk` | **DROPPED** من `student_requests` |
| `student_requests_type_request_types_code_fk` | **ADDED** — FK `request_type → request_types(code)` **NOT VALID** |
| 3 × `COMMENT ON` | تعليقات توثيقية |

## 8. Schema Verification (post-apply)
```
col:request_audience         → text / NOT NULL / default 'active_student'::text  ✅
col:ineligible_display_mode  → text / NOT NULL / default 'hidden'::text          ✅
```

## 9. Constraints & Indexes Verification
```
request_types_request_audience_chk         CHECK (…IN ('active_student','graduate','both')) valid=true  ✅
request_types_ineligible_display_mode_chk  CHECK (…IN ('hidden','disabled'))                valid=true  ✅
sr_type_chk                                (غير موجود — DROPPED)                                        ✅
student_requests_type_request_types_code_fk FK … NOT VALID                                  valid=false ✅ (متوقع)
```
لا فهارس جديدة (الـmigration لا تنشئ فهارس).

## 10. Functions & Triggers Verification
- الملف لا ينشئ أي `FUNCTION` أو `TRIGGER` — لا شيء لفحصه. ✅

## 11. RLS & Grants Verification
- لم تُنشأ جداول جديدة → لا `ENABLE ROW LEVEL SECURITY` مطلوب.
- لم يُصدر أي `GRANT` أو `REVOKE` أو `CREATE POLICY` — الصلاحيات القائمة على `request_types` و`student_requests` **لم تتغير**.
- لم تُمنح `anon`/`authenticated` أي صلاحيات إضافية.

## 12. Existing-Data Impact
| جدول | قبل | بعد |
|------|-----|-----|
| `request_types` | 12 صف | 12 صف — كلها احتفظت بالقيم الافتراضية الجديدة (`request_audience='active_student'`, `ineligible_display_mode='hidden'`) عبر `DEFAULT` القائم على العمود ✅ |
| `student_requests` | 15 صف | 15 صف — بدون تغيير (الـFK أُضيف `NOT VALID`، لم تُفحص الصفوف الحالية) ✅ |
- لا حذف، لا UPDATE، لا cleanup، لا seed.

## 13. Partial-Apply Audit
- كل الكائنات المتوقعة موجودة، كل الحذوف تمت، لا كائنات مكررة، لا triggers مكررة.
- سجل migration واحد فقط بلا كائنات ناقصة. ✅

## 14. Errors & Warnings
- **أخطاء SQL:** لا شيء.
- **Security Linter:** أعاد 174 تحذيراً — **جميعها موجودة مسبقاً في المشروع** (Public Buckets، SECURITY DEFINER functions، إلخ)، لا علاقة لها بهذه الـmigration لأنها لم تنشئ buckets ولا functions ولا policies. لا تحذيرات **جديدة** ناتجة عن G1.

## 15. Read-Only Smoke Test
```sql
SELECT COUNT(*), COUNT(*) FILTER (WHERE request_audience='active_student' AND ineligible_display_mode='hidden') FROM public.request_types;
→ (12, 12)  ✅ استعلام العمودين الجديدين ينفَّذ ويعيد قيماً صحيحة.

SELECT COUNT(*) FROM public.student_requests;
→ 15  ✅ الجدول مقروء وسليم.
```

## 16. Readiness for G2
- G1 مطبَّقة ومتحقق منها بالكامل.
- لا partial apply، لا objects ناقصة.
- بيئة الإنتاج نظيفة ومستقرة.
- ملف G2 (`20260710140000_...`) **لم يُلمس بعد** — جاهز للمرحلة التالية بأمر صريح.

---

## 17. القرار النهائي

# ✅ PASS_G1_APPLIED_READY_FOR_G2

**التزامات مؤكَّدة:**
- لم تُطبَّق أي migration ثانية.
- لم يُعدَّل ملف migration.
- لا DROP/reset/rollback يدوي.
- لا حذف/تعديل بيانات.
- لا seed / cleanup / secrets / code / commit / push / Publish / Deploy / تعديل ألوان.

**التوصية:** الانتظار لأمر صريح لبدء G2 (`PORTAL-PRODUCTION-MIGRATIONS-SEQUENTIAL-APPLY-G2-01`).

---
*نهاية التقرير — G1*
