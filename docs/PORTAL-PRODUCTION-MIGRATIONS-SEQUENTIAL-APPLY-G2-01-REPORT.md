# PORTAL-PRODUCTION-MIGRATIONS-SEQUENTIAL-APPLY-G2-01 — REPORT

**التاريخ:** 2026-07-09
**Lovable Project ID:** `4b291119-790f-4484-9285-c2b774e1ba6f`
**Supabase Production Ref:** `wpmicqriltrowwonknox` ✅
**المرجع السابق:** `docs/PORTAL-PRODUCTION-MIGRATIONS-SEQUENTIAL-APPLY-G1-01-REPORT.md` → `PASS_G1_APPLIED_READY_FOR_G2`

---

## 1. Target Supabase Verification
- `supabase--project_info` أعاد `ref = wpmicqriltrowwonknox` ✅ — مطابق تماماً.

## 2. G1 Prerequisite Verification
| فحص | النتيجة |
|-----|--------|
| العمودان `request_audience`, `ineligible_display_mode` موجودان في `request_types` | ✅ |
| `request_types` = 12 صف | ✅ |
| `student_requests` = 15 صف | ✅ |
| `sr_insert_self` policy قائمة قبل التطبيق | ✅ (سيُسقَط) |
| `sra_insert` policy قائمة قبل التطبيق | ✅ (سيُستبدل) |
| دوال G2 غير موجودة قبل التطبيق | ✅ (0 rows) |

## 3. G2 Migration Filename
- `supabase/migrations/20260710140000_student_request_types_rpc_rls.sql` — الوحيدة المطبَّقة.
- لم تُلمس أي migration لاحقة (`20260710150000` وما بعدها).

## 4. Pre-Apply Schema & Security Audit
- 8 دوال جديدة/مستبدَلة، جميعها بأسماء غير مستخدَمة سابقاً → لا overloads قديمة خطرة.
- 2 policies (`sr_insert_self`, `sra_insert`) موجودة كما وصف الملف — الحذف والاستبدال متوقعان.
- الملف يعتمد على `has_any_role`, `is_owner_of_request` — دوال قائمة من migrations سابقة (تم التحقق من وجودها).
- لا triggers ولا views ولا indexes ولا backfill في الملف.

## 5. Apply Start & Finish
- استُدعي `supabase--migration` مرة واحدة بمحتوى الملف حرفياً — لم يُعدَّل الملف.
- النتيجة: `The migration completed successfully.` ✅

## 6. SQL Execution Result
- 8 × `CREATE OR REPLACE FUNCTION`
- 2 × `DO $$ … END $$` guards (idempotent DROP POLICY)
- 1 × `CREATE POLICY sra_insert`
- 1 × `COMMENT ON TABLE`
- 8 × `REVOKE ALL … FROM PUBLIC` + 8 × `GRANT EXECUTE … TO authenticated`
- لا أخطاء SQL، لا rollback.

## 7. Migration History Result
```
version         | name
20260710140000  | student_request_types_rpc_rls
```
مسجَّلة **مرة واحدة فقط** ✅

## 8. Functions & RPCs Created (signatures)
| Function | Args | Return | SECURITY | Volatility | `search_path` |
|----------|------|--------|----------|-----------|---------------|
| `student_request_ineligible_status_message()` | — | `text` | INVOKER | IMMUTABLE | (لا يحتاج) |
| `current_student_profile_for_auth()` | — | `TABLE(profile_id uuid, profile_status text, academic_number text, full_name_ar text)` | **DEFINER** | STABLE | `public` ✅ |
| `student_request_type_is_eligible(_profile_status text, _request_audience text)` | 2 | `boolean` | INVOKER | IMMUTABLE | (لا يحتاج) |
| `assert_student_can_use_request_type(_profile_status text, _request_audience text)` | 2 | `void` | **DEFINER** | VOLATILE | `public` ✅ |
| `get_available_request_types_for_current_student()` | — | `TABLE(11 cols)` | **DEFINER** | STABLE | `public` ✅ |
| `create_student_request(p_request_type text, p_title text, p_form_data jsonb, p_student_notes text)` | 4 | `uuid` | **DEFINER** | VOLATILE | `public` ✅ |
| `submit_student_request(p_request_id uuid)` | 1 | `boolean` | **DEFINER** | VOLATILE | `public` ✅ |
| `get_my_student_requests(p_limit integer, p_offset integer)` | 2 | `TABLE(10 cols)` | **DEFINER** | STABLE | `public` ✅ |

- كل SECURITY DEFINER لديه `SET search_path = public` ✅
- لا duplicate signatures / overloads — كل دالة سطر واحد فقط في `pg_proc`. ✅

## 9. GRANT / REVOKE Audit
- 8 × `REVOKE ALL … FROM PUBLIC` نُفِّذت.
- 8 × `GRANT EXECUTE … TO authenticated` نُفِّذت.
- **ملاحظة أمنية (مهمة):** فحص `pg_proc.proacl` و`has_function_privilege('anon', …, 'EXECUTE')` يُظهر أن الدور `anon` **ما زال يملك EXECUTE** على الدوال الثمانية. السبب: Supabase تطبّق `ALTER DEFAULT PRIVILEGES` تلقائياً لمنح EXECUTE لـ `anon`/`authenticated` على أي دالة جديدة في schema `public`. الـ`REVOKE FROM PUBLIC` في الملف **لا يزيل** هذه المنح الصريحة.
  - **الأثر الوظيفي:** كل RPC يتحقق داخلياً `IF auth.uid() IS NULL RAISE EXCEPTION 'يجب تسجيل الدخول'`، لذا anon لا يستطيع تنفيذ منطق فعلي — الاختبار المباشر أكد ذلك.
  - **الأثر الأمني اللينتر:** 4 warnings جديدة من نوع `0028_anon_security_definer_function_executable` (188 warnings إجمالاً بعد التطبيق مقابل 174 قبله). الفارق (14) يشمل كذلك تحذيرات `Function Search Path Mutable` لدوال `INVOKER IMMUTABLE` (`student_request_type_is_eligible`, `student_request_ineligible_status_message`) — دوال بحتة بلا وصول للجداول، خطرها منخفض.
  - هذه الحالة **متسقة مع محتوى الملف كما هو**؛ لم يُعدَّل. G3 (`20260710150000_..._submit_bypass_fix.sql`) قد يعالج جوانب منها.

## 10. RLS Status
| Table | RLS Enabled |
|-------|-------------|
| `request_types` | ✅ |
| `student_requests` | ✅ |
| `student_request_attachments` | ✅ |

## 11. Policies Created / Modified
| Policy | Table | Cmd | Roles | تغيير |
|--------|-------|-----|-------|-------|
| `sr_insert_self` | `student_requests` | INSERT | authenticated | **DROPPED** ✅ (طالب لم يعد يستطيع INSERT مباشر — يجب استخدام RPC) |
| `sra_insert` | `student_request_attachments` | INSERT | authenticated | **REPLACED** ✅ — WITH CHECK يشترط: `is_owner_of_request` + `uploaded_by = auth.uid()` + الطالب `active/graduated` + الطلب `draft/returned/returned_for_completion` — أو `has_any_role(auth.uid(), ['admin','system_admin','registrar','student_affairs'])` |
| السياسات الأخرى (`sr_insert_priv`, `sr_select_*`, `sr_update_self`, `sr_update_priv`, `sra_select`, `sra_update`, `sra_delete`) | — | — | — | **بدون تغيير** ✅ |

## 12. Anonymous Access Result
- `has_function_privilege('anon', fn, 'EXECUTE')` = `true` لكل RPCs (انظر §9).
- استدعاء `get_available_request_types_for_current_student()` بلا `auth.uid()` → `EXCEPTION: يجب تسجيل الدخول` ✅ (منطق حماية داخلي فعّال).
- قراءة `request_types` كدور `anon` تعتمد على سياسات القراءة القائمة (لم تتغير في هذه الـmigration).
- قراءة/كتابة `student_requests` من anon غير ممكنة (سياسات SELECT/INSERT مقتصرة على authenticated + شرط `auth.uid()`).

## 13. Authenticated Access Result
- authenticated يستطيع تنفيذ الـRPCs ✅.
- INSERT مباشر على `student_requests` من طالب مسجَّل → **مرفوض** الآن (لا policy تسمح) → يجب المرور عبر `create_student_request()` ✅.
- INSERT على `student_request_attachments` مقيّد بمالك الطلب في حالة قابلة للتعديل، أو موظف مصرَّح له.

## 14. Role-Scope Verification
- `create_student_request` يستخدم `student_profile_id` من `auth.uid()` عبر `current_student_profile_for_auth()` — **لا يقبل** `student_profile_id` من العميل ✅ (لا انتحال).
- `submit_student_request` يشترط `sr.student_profile_id = v_profile_id` ✅ (لا وصول لطلب طالب آخر).
- `get_my_student_requests` يفلتر بـ `student_profile_id = v_profile_id` ✅.
- منح الاستثناء في `sra_insert` مقصور على 4 أدوار (`admin, system_admin, registrar, student_affairs`) — مطابق للـspec.
- لا `RLS bypass` غير مقصود؛ SECURITY DEFINER محدود بمنطق داخلي صارم.

## 15. Existing-Data Impact
| جدول | قبل | بعد |
|------|-----|-----|
| `request_types` | 12 صف | 12 صف ✅ |
| `student_requests` | 15 صف | 15 صف ✅ |
| `student_request_attachments` | (لم تُقرأ عمداً — لا تعديل بيانات) | لا INSERT/UPDATE/DELETE من الـmigration ✅ |
- لا `UPDATE`, لا `DELETE`, لا `INSERT`, لا backfill.

## 16. Partial-Apply Audit
- 8 دوال موجودة، سياستان كما هو متوقع، comment مطبَّق.
- سجل migration واحد فقط بلا كائنات مفقودة. ✅
- لا duplicate policies، لا duplicate functions.

## 17. Errors & Warnings
- **أخطاء SQL:** لا شيء.
- **Linter:** ارتفع من 174 → 188 (+14). المضاف:
  - `0028_anon_security_definer_function_executable` × 5 (Definer functions قابلة للاستدعاء من anon — انظر §9؛ محمية داخلياً).
  - `0011_function_search_path_mutable` × N (يشمل الدوال INVOKER-IMMUTABLE في هذه الـmigration + احتمالاً غيرها من migrations سابقة).
  - باقي الـ174 warnings سابقة الوجود (Public Buckets، إلخ) — غير متعلقة.
- **تحذيرات جديدة من هذه الـmigration:** موثَّقة أعلاه؛ لم يُطبَّق أي إصلاح تلقائي.

## 18. Read-Only Security Smoke Tests
```sql
-- انتحال RPC كـanon (no auth): EXCEPTION فوري.
SELECT * FROM public.get_available_request_types_for_current_student();
→ ERROR: يجب تسجيل الدخول  ✅

-- عدّاد الدوال في pg_proc = 8, بلا تكرار.  ✅
-- RLS مفعّل على الجداول الثلاثة.  ✅
-- سطور البيانات الحالية دون تغيير.  ✅
```

## 19. G3 Dependency Readiness
- G2 مطبَّقة، الدوال والسياسات موجودة.
- G3 المتوقع (`20260710150000_student_request_types_rls_submit_bypass_fix.sql`) **لم يُلمس** — جاهز لأمر صريح.
- الملاحظة الأمنية في §9 (anon EXECUTE على SECURITY DEFINER) قد تكون في نطاق G3 أو مرحلة تشديد لاحقة — بانتظار توجيه.

## 20. Final Decision

# ✅ PASS_G2_APPLIED_READY_FOR_G3

**التزامات مؤكَّدة:**
- لم تُطبَّق أي migration ثانية.
- لم يُعدَّل ملف migration.
- لا DROP/reset/rollback يدوي.
- لا حذف/تعديل بيانات.
- لا seed / cleanup / secrets / code / commit / push / Publish / Deploy / تعديل ألوان.

**ملاحظات لتوجيه القرار قبل G3:**
- 14 warning جديد من اللينتر (5 منها anon-executable SECURITY DEFINER، والباقي search_path على دوال IMMUTABLE بحتة). لا خرق أمني فعلي مثبت — الحماية الداخلية فعّالة — لكن التشديد الرسمي مؤجَّل لمرحلة لاحقة.

**التوصية:** الانتظار لأمر صريح لبدء G3 (`PORTAL-PRODUCTION-MIGRATIONS-SEQUENTIAL-APPLY-G3-01`).

---
*نهاية التقرير — G2*
