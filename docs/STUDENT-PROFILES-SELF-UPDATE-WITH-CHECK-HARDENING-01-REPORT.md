# STUDENT_PROFILES_SELF_UPDATE_WITH_CHECK_HARDENING_01 — REPORT

## 1. القرار النهائي
**PASS_STUDENT_PROFILES_SELF_UPDATE_WITH_CHECK_HARDENING_APPLIED_SECURITY_SCAN_CLEAR_NO_DEPLOY**

## 2. اعتماد المالك
معتمد صراحةً في هذه المرحلة: Migration واحدة فقط، بلا Publish/Deploy، بلا استيراد، بلا E2E/Saga، بلا لمس الطلب المحظور.

## 3. main HEAD
Expected: `5d19f0fa0f0267ed9369f5a2315dcb1827151d3e` (البيئة الإنتاجية Supabase `wpmicqriltrowwonknox`).

## 4. سبب نتيجة الفحص الأمني السابقة
`supabase_lov / student_profiles_self_update_no_check` (id: `PRIVILEGE_ESCALATION_VIA_MISSING_WITH_CHECK`, level: **error**):
سياسة `Students can update own profile` كانت تحوي `USING (auth.uid() = user_id)` فقط دون `WITH CHECK`، ومع منح `UPDATE` العام على الجدول لدور `authenticated`، كان الطالب نظرياً قادراً على تعديل حقول أكاديمية/إدارية على صفه (status, academic_number, department_id, program_id, study_system, student_study_status, transferred_current_year, suspension counters, user_id).

## 5. مخطط `public.student_profiles` (19 عموداً)
| Column | Type | Nullable | Class |
|---|---|---|---|
| id | uuid | NO | PK — protected |
| user_id | uuid | YES | identity — protected |
| academic_number | text | NO | academic — protected |
| full_name_ar | text | NO | identity — protected |
| full_name_en | text | YES | identity — protected |
| national_id | text | YES | identity — protected |
| phone | text | YES | personal (no client edit path today) |
| email | text | YES | identity — protected |
| department_id | uuid | YES | academic — protected |
| program_id | uuid | YES | academic — protected |
| status | text | NO | academic/admin — protected |
| must_change_password | boolean | NO | auth — protected |
| created_at | timestamptz | NO | audit — protected |
| updated_at | timestamptz | NO | audit — protected |
| study_system | text | YES | academic — protected |
| student_study_status | text | YES | academic — protected |
| transferred_current_year | boolean | NO | academic — protected |
| previous_suspension_semesters_count | integer | NO | academic — protected |
| consecutive_suspension_years_count | integer | NO | academic — protected |

## 6. Policies قبل وبعد
### قبل
| policy | cmd | roles | USING | WITH CHECK |
|---|---|---|---|---|
| Students can view own profile | SELECT | authenticated | `auth.uid()=user_id` | — |
| Students can update own profile | UPDATE | authenticated | `auth.uid()=user_id` | **∅ (سبب النتيجة)** |
| Admins can view all student profiles | SELECT | authenticated | `has_any_role(...)` | — |
| Admins can insert student profiles | INSERT | authenticated | — | `has_any_role(...)` |
| Admins can update student profiles | UPDATE | authenticated | `has_any_role(...)` | — |
| Admins can delete student profiles | DELETE | authenticated | `has_any_role(...)` | — |

### بعد
| policy | cmd | roles | USING | WITH CHECK |
|---|---|---|---|---|
| Students can view own profile | SELECT | authenticated | `auth.uid()=user_id` | — |
| **Students can update own profile (locked)** | **UPDATE** | **authenticated** | `(SELECT auth.uid())=user_id` | **`(SELECT auth.uid())=user_id`** |
| Admins can view all student profiles | SELECT | authenticated | `has_any_role(...)` | — |
| Admins can insert student profiles | INSERT | authenticated | — | `has_any_role(...)` |
| Admins can update student profiles | UPDATE | authenticated | `has_any_role(...)` | — |
| Admins can delete student profiles | DELETE | authenticated | `has_any_role(...)` | — |

## 7. مسارات تحديث `student_profiles` (تدقيق كامل)
جميع مسارات الكتابة تمر عبر `supabaseAdmin` (service_role) أو محرك الاستيراد الموثوق (service client):
- `src/lib/admin-students.functions.ts` — insert / delete / update (service_role) — إدارة/تسجيل.
- `src/lib/imports/engine.server.ts` — insert / update (service client) — استيراد رسمي.

**لا يوجد أي مسار Client يستدعي `.update()` / `.upsert()` / `.insert()` على `student_profiles` بدور `authenticated`.** جميع الاستدعاءات من `src/routes/**` و`src/components/**` هي `.select()` فقط.

## 8. قائمة الحقول الشخصية الآمنة
**فارغة.** لا يوجد مسار UI فعلي يعدّل الطالب فيه حقلاً شخصياً مباشرة من عميل authenticated (الهاتف/البريد يُحدَّثان اليوم عبر مسارات إدارية فقط). القرار المتوافق مع البروتوكول: عدم منح `UPDATE` على أي عمود.

## 9. سبب اعتماد كل حقل آمن
لا ينطبق — القائمة فارغة.

## 10. قائمة الحقول المحمية
كل الأعمدة الـ19 محمية من التعديل المباشر بدور `authenticated` (لا Grant، ومنع بـWITH CHECK حتى لو مُنح لاحقاً).

## 11. نتيجة تدقيق العمليات الإدارية
سحب `UPDATE` من anon/authenticated **لا يكسر** أي مسار إداري: كل الأدوار الإدارية (admin/registrar/student_affairs/دوال SECURITY DEFINER/الاستيراد) تعمل عبر `service_role` وتتخطى الـRLS والـGrants.

## 12. اسم Migration
`supabase/migrations/20260715120000_student_profiles_self_update_with_check_hardening_01.sql` (توقيت النشر التلقائي من أداة Migration).

## 13. محتوى Migration المرجعي
```sql
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can update own profile" ON public.student_profiles;

CREATE POLICY "Students can update own profile (locked)"
  ON public.student_profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE UPDATE ON TABLE public.student_profiles FROM PUBLIC;
REVOKE UPDATE ON TABLE public.student_profiles FROM anon;
REVOKE UPDATE ON TABLE public.student_profiles FROM authenticated;

DO $$ DECLARE col text; BEGIN
  FOR col IN SELECT attname FROM pg_attribute
             WHERE attrelid='public.student_profiles'::regclass
               AND attnum>0 AND NOT attisdropped
  LOOP
    EXECUTE format(
      'REVOKE UPDATE (%I) ON public.student_profiles FROM anon, authenticated, PUBLIC', col
    );
  END LOOP;
END $$;
```

## 14. نتيجة تطبيق Migration
Applied atomically, no partial apply, no retry.

## 15. Table grants قبل وبعد
| role | قبل (privs) | بعد (privs) |
|---|---|---|
| postgres | `arwdDxtm` | `arwdDxtm` |
| anon | `arwdDxtm` | `ardDxtm` (**w سُحبت**) |
| authenticated | `arwdDxtm` | `ardDxtm` (**w سُحبت**) |
| service_role | `arwdDxtm` | `arwdDxtm` |

مأخوذ من `pg_class.relacl` قبل/بعد. `w`=UPDATE.

## 16. Column grants قبل وبعد
- قبل: لا Column ACL خاصة (كل الأعمدة كانت مُشمولة بمنحة الجدول).
- بعد: لا Column ACL جديدة لـauthenticated/anon على `UPDATE`، وحلقة الـDO REVOKE عالجت الحالات القديمة إن وُجدت.

## 17. USING و WITH CHECK النهائيان
`USING ((SELECT auth.uid()) = user_id)` و `WITH CHECK ((SELECT auth.uid()) = user_id)` — يمنعان انتقال الصف إلى `user_id` مختلف حتى لو أُعيد منح UPDATE لاحقاً.

## 18. نتائج اختبارات الطالب
اختبار Catalog: `has_table_privilege('authenticated','public.student_profiles','UPDATE')=false` (يُستنتج من غياب `w` في ACL). أي محاولة UPDATE من عميل authenticated ستفشل بخطأ صلاحية قبل أن تصل إلى RLS. لم يُنفَّذ أي UPDATE على بيانات إنتاجية.

## 19. نتائج اختبارات الإدارة
مسارات `admin-students.functions.ts` و`imports/engine.server.ts` تعتمد على `supabaseAdmin` — غير متأثرة بسحب Grants.

## 20. Typecheck
`bunx tsgo --noEmit` → **0 أخطاء** ✅

## 21. الاختبارات
لا تعديلات كود تطبيقية؛ لم تُضف اختبارات جديدة. الاختبارات الحالية لم تُلمس.

## 22. Build
لم يُطلب Publish/Deploy — Build تحقق ضمني عبر Typecheck.

## 23. Security Scan قبل وبعد
- **قبل:** Critical=0, Error=1 (`student_profiles_self_update_no_check`).
- **بعد:** فحص جديد أُجري بعد Migration — 237 مجموع، جميع مستوياتها `warn`/`info`. **Critical=0, Error=0**. النتيجة `student_profiles_self_update_no_check` لم تعد ظاهرة، وتم تحديد الحالة كـfixed عبر manage_security_finding.

## 24. إثبات اختفاء Error
لم يظهر أي بند بمستوى `error` أو `critical` في الفحص الجديد؛ لم يُضَف أي bypass أو Ignore.

## 25. إثبات عدم تعديل بيانات الطلاب
- عدد الصفوف قبل وبعد: **627 = 627** ✅
- لا `UPDATE`/`INSERT`/`DELETE` ضمن Migration على بيانات صفوف.

## 26. الطلب المحظور — قبل وبعد
| الحقل | القيمة |
|---|---|
| id | `93807768-a281-42de-bfb4-0c0c03786b20` |
| status | `in_review` (بلا تغيير) |
| updated_at | `2026-07-13 17:59:19.782271+00` (بلا تغيير) |

## 27. عدم Import
لم يُرفع ملف، لم يُشغَّل Dry Run، لم يُنفَّذ استيراد.

## 28. عدم Publish/Deploy
لم تُستدعَ أدوات النشر. تفويض Publish السابق لم يُستهلك.

## 29. عدم E2E/Saga
لم تُشغَّل شهادة القيد، لا PDF، لا Storage saga.

## 30. الموانع المتبقية
- لا تزال هناك نتيجتان (`warn`) مماثلتان: `faculty_profiles_self_update_no_check` و `staff_profiles_self_update_no_check` — خارج نطاق هذه المرحلة (لم تكن Error).

## 31. المرحلة التالية
**FACULTY_ACCOUNTS_EMAIL_UPDATE_CONTROLLED_DEPLOYMENT_01_RETRY_AFTER_STUDENT_PROFILE_HARDENING** — لا تبدأ تلقائياً.

## 32. المراحل المتبقية حتى اكتمال تطبيق بوابة الكلية بالكامل
| الحالة | المرحلة |
|---|---|
| COMPLETED | STUDENT_PROFILES_SELF_UPDATE_WITH_CHECK_HARDENING_01 |
| COMPLETED | FACULTY_ACCOUNTS_EXISTING_EMAIL_UPDATE_IMPORTER_REMEDIATION_01 |
| READY | FACULTY_ACCOUNTS_EMAIL_UPDATE_CONTROLLED_DEPLOYMENT_01 (Retry) |
| READY | FACULTY_ACCOUNTS_EMAIL_UPDATE_EXECUTION_01 (تحديث فعلي للإيميلات بعد النشر) |
| BLOCKED | ENROLLMENT_CERTIFICATE_DEAN_LOGIN_IDENTITY_RESOLUTION_02 (يعتمد على تحديث بريد العميد) |
| BLOCKED | ENROLLMENT_CERTIFICATE_CONTROLLED_E2E_HUMAN_GUIDED_EXECUTION_01_RESUME |
| NOT_STARTED | إنشاء طالب اختبار مختلف عن صاحب الطلب المحظور |
| NOT_STARTED | تشغيل Workflow السبع خطوات + Saga (مرة واحدة) |
| NOT_STARTED | تقرير إصدار شهادة القيد النهائي |
| IN_PROGRESS | جاهزية الخدمات الطلابية (طلبات/رسوم/وثائق) |
| IN_PROGRESS | جاهزية البيانات والإسناد (Faculty/Staff/Roles) |
| READY | استيراد الجداول الجاهزة (Excel-only، بلا حل تعارضات) |
| DEFERRED | تقارير الشؤون الأكاديمية |
| DEFERRED | المجالس الأكاديمية |
| DEFERRED | متابعة التدريس |
| DEFERRED | المواد التعليمية |
| **OUT_OF_SCOPE** | إنشاء/تعديل/حل تعارض الجداول الدراسية داخل البوابة |

### قرار تنظيمي ثابت
بوابة الكلية **لا تنشئ ولا تعدّل الجداول الدراسية ولا تحل تعارضاتها**. نطاق الجداول داخل البوابة يقتصر على استيراد Excel جاهز → التحقق من القالب → الفلترة (قسم/برنامج/مستوى/نظام/فصل) → الربط بالمقررات والمحاضرين والشعب → العرض → التحديث عبر إعادة الاستيراد.

---

## الملخص التنفيذي
- **ما اكتمل:** تقوية سياسة تحديث ملف الطالب — Error الوحيد أُزيل.
- **ما تبقى:** نشر واجهة تحديث بريد الأكاديميين → تحديث بريد العميد → استئناف E2E شهادة القيد.
- **أهم ثلاثة موانع:** (1) بريد العميد غير محدث في `faculty.email`، (2) تفويض Publish لم يُستهلك ولا يُستخدم داخل هذه المرحلة، (3) الطلب `93807768…` محظور ولا يُلمس.
- **المرحلة التالية المباشرة:** FACULTY_ACCOUNTS_EMAIL_UPDATE_CONTROLLED_DEPLOYMENT_01_RETRY.
- **عدد المراحل المتبقية:** ~9 حتى إصدار شهادة القيد الفعلية.
- **جاهزية شهادة القيد:** BLOCKED (تعتمد على بريد العميد).
- **جاهزية الخدمات الطلابية:** IN_PROGRESS.
- **جاهزية البيانات والإسناد:** IN_PROGRESS.
- **جاهزية استيراد الجداول الجاهزة:** READY.
- **جاهزية تقارير الشؤون الأكاديمية:** DEFERRED.
- **جاهزية المجالس الأكاديمية:** DEFERRED.
- **جاهزية متابعة التدريس:** DEFERRED.
- **جاهزية المواد التعليمية:** DEFERRED.
- **جاهزية البوابة كاملة:** IN_PROGRESS.
- **حالة Publish/Deploy:** لم يُنفَّذ. لا تفويض في هذه المرحلة.
