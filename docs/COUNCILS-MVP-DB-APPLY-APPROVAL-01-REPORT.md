# COUNCILS-MVP-DB-APPLY-APPROVAL-01 — Report

**التاريخ:** 2026-07-03
**النطاق:** اعتماد وتحقق نهائي قبل تطبيق قاعدة بيانات MVP الخاصة ببوابة إدارة المجالس الأكاديمية.
**الحالة:** مرحلة موافقة فقط — **لم يُطبَّق أي migration، ولم يُلمس أي DB/RLS/Storage/Trigger/Code.**

---

## 1. المسودة المرجعية

- المسار: `docs/drafts/20260703000000_councils_mvp_schema_rls.draft.sql`
- عدد الأسطر: 623
- الحالة الحوكمية السابقة: `COUNCILS-SUPABASE-MIGRATION-REVIEW-01 = PASS / READY FOR MIGRATION STAGING`
- سبب البقاء في `docs/drafts/` وعدم النقل إلى `supabase/migrations/`: لا توجد staging DB منفصلة، وأي ملف داخل `supabase/migrations` على `main` قد يُلتقط تلقائياً (حوكمة `COUNCILS-MIGRATION-STAGING-PREP-01`).

---

## 2. ملخص ما سيتم تطبيقه (Scope: In)

نطاق المسودة مقتصر حصراً على مجال «المجالس الأكاديمية»:

**ENUMs (5):**
- `academic_council_type`
- `academic_council_member_role`
- `academic_council_meeting_status`
- `academic_council_topic_status`
- `academic_council_decision_status`

**الجداول (7):**
1. `public.academic_councils`
2. `public.academic_council_members`
3. `public.academic_council_meetings`
4. `public.academic_council_topics`
5. `public.academic_council_agenda_items`
6. `public.academic_council_minutes`
7. `public.academic_council_decisions`

**Helper functions (5) — كلها `SECURITY DEFINER` بمساحة أسماء المجالس:**
- `is_council_admin(uuid)`
- `is_council_member(uuid, uuid)`
- `has_council_role(uuid, uuid, academic_council_member_role)`
- `can_manage_council(uuid, uuid)`
- `can_write_council_agenda(uuid, uuid)`

**RLS Policies:** 21 policy مقصورة على الجداول السبعة أعلاه.

**Triggers:** 9 triggers مقصورة على جداول المجالس:
- 7 triggers لتحديث `updated_at`
- `trg_acmin_lock_guard` لمنع تعديل المحاضر بعد القفل
- `trg_ac_validate_dept` للتحقق من ربط مجلس القسم بقسم صالح

**GRANT/REVOKE:** مقصورة على جداول المجالس ودوالها فقط:
- `GRANT SELECT, INSERT, UPDATE` لـ `authenticated`
- `REVOKE DELETE` من `authenticated` (الحذف عبر service_role فقط — سياسة عدم الفقد)
- `GRANT ALL` لـ `service_role`
- `REVOKE ALL … FROM PUBLIC` ثم `GRANT EXECUTE` مضبوط للدوال

---

## 3. ما لن يتم تطبيقه (Scope: Out) — تأكيدات صريحة

| المجال | يُلمس؟ |
|---|---|
| جداول الطلاب (`student_*`) | ❌ لا |
| طلبات شؤون الطلاب (`student_requests`, `student_request_*`) | ❌ لا |
| التقارير / الخطط الدراسية (`study_plans`, `study_plan_courses`) | ❌ لا |
| الجداول والإسناد (`class_schedule`, `course_offerings`, `course_sections`) | ❌ لا |
| المستخدمون والأدوار الأساسية (`user_roles`, `user_role_assignments`, `staff_profiles`, `faculty_profiles`) | ❌ لا (قراءة مرجعية فقط عبر FK/functions، بدون ALTER) |
| Storage buckets / objects | ❌ لا |
| بيانات الإنتاج الحالية | ❌ لا (schema-only، لا `INSERT`) |
| Auth schema / triggers | ❌ لا |
| Cron / scheduled jobs | ❌ لا |
| Email templates / providers | ❌ لا |

تحقق برمجي: `grep` على المسودة لا يُظهر أي `ALTER TABLE`/`DROP`/`INSERT`/`UPDATE`/`DELETE` على جداول خارج نطاق `academic_council*`.

---

## 4. تقييم الأثر

| السؤال | الإجابة |
|---|---|
| هل التنفيذ آمن؟ | ✅ نعم — schema-only، additive بالكامل، لا يعدل كائنات قائمة. |
| هل يؤثر على Pilot الحالي؟ | ❌ لا — الجداول جديدة، والواجهة (`/admin/academic-councils`) UI-only ومعزولة. |
| هل يلمس بيانات الإنتاج الحالية؟ | ❌ لا. |
| هل توجد seed data؟ | ❌ لا. |
| هل توجد Storage/Email/Scheduled jobs؟ | ❌ لا. |
| هل يلمس `auth`/`storage`/`realtime`/`vault`؟ | ❌ لا. |

**المخاطر المتبقية:**
- **R1 — التقاط تلقائي عند النقل:** إذا نُقل الملف إلى `supabase/migrations/` على `main`، قد تلتقطه أدوات النشر تلقائياً. **المخفف:** يجب الإبقاء عليه في `docs/drafts/` حتى لحظة التطبيق الرسمي، والتطبيق عبر قناة يدوية معتمدة (بند 5).
- **R2 — واجهة UI موجودة بلا DB خلفها:** حالياً غير خطر (كل الأزرار disabled)، لكن يجب عدم تفعيل أي زر عملياتي قبل `COUNCILS-MVP-DB-VERIFY-01`.
- **R3 — لا يوجد rollback تلقائي:** MVP بلا `DROP` مقابل؛ خطة التراجع أدناه يدوية.

---

## 5. طريقة التنفيذ المقترحة للمرحلة التالية (COUNCILS-MVP-DB-APPLY-01)

**القناة الرسمية المعتمدة:** أداة Lovable `supabase--migration` — تعرض SQL على المستخدم للموافقة الصريحة قبل التنفيذ، وتنفّذها كـ transaction واحدة، وتعيد توليد `types.ts` تلقائياً بعد النجاح.

**لماذا ليس القنوات الأخرى:**
- **Supabase SQL Editor يدوياً:** غير متاح للمستخدم على Lovable Cloud (لا وصول للـ dashboard).
- **نقل الملف إلى `supabase/migrations/` ثم push:** مرفوض — يلتقطه النشر تلقائياً دون نقطة موافقة بشرية، ويخالف قرار `COUNCILS-MIGRATION-STAGING-PREP-01 = BLOCKED`.

**احتمال التطبيق التلقائي إذا وُضع في `supabase/migrations/`:** نعم — لذلك يبقى في `docs/drafts/` حتى لحظة التطبيق، ويُمرَّر محتواه إلى `supabase--migration` مباشرة دون إنشاء ملف في `supabase/migrations/` بشكل يدوي.

**Backup/Snapshot:** Lovable Cloud يحتفظ بـ PITR على مستوى المشروع. المهمة additive-only، لكن قبل الضغط على «موافقة» في نافذة `supabase--migration` يجب التحقق من وجود آخر نقطة استرداد حديثة.

---

## 6. Checklist قبل التنفيذ (Pre-Apply)

- [ ] موافقة صريحة من الجهة الإدارية على مرحلة `COUNCILS-MVP-DB-APPLY-01`.
- [ ] تأكيد أن المسودة في `docs/drafts/` **لم تُعدَّل** منذ `COUNCILS-SUPABASE-MIGRATION-REVIEW-01` (hash/diff).
- [ ] تأكيد عدم وجود ملف بنفس الطابع الزمني (`20260703000000`) داخل `supabase/migrations/`.
- [ ] Pilot متوقف على قراءة/كتابة عادية فقط — لا عمليات import/cleanup جارية.
- [ ] تأكيد قراءة نص SQL بالكامل في نافذة الموافقة قبل الضغط على Approve.
- [ ] لا `INSERT` واحد في نص المسودة (تحقق بصري + grep).

## 7. Checklist بعد التنفيذ (Post-Apply — يُنفَّذ في `COUNCILS-MVP-DB-VERIFY-01`)

- [ ] `supabase--linter` بدون findings حرجة جديدة.
- [ ] `supabase--read_query`: التحقق من وجود الجداول السبعة والـ 5 ENUMs.
- [ ] التحقق من `rowsecurity = true` لكل جدول من السبعة.
- [ ] عدّ policies = 21، triggers = 9، functions = 5.
- [ ] `types.ts` أُعيد توليده ويحتوي على الأنواع الجديدة.
- [ ] `/admin/academic-councils` لا يزال يعمل UI-only (لا كسر بصري).
- [ ] مسارات Pilot الحرجة (`/admin`, `/admin/reports`, `/admin/student-requests`, `/admin/study-plans`, `/student/requests`, `/student/requests/new`) تعمل 200.
- [ ] لا أخطاء runtime جديدة في console/network.

## 8. خطة التراجع (Rollback)

MVP additive-only بلا اعتماديات معكوسة، لذا التراجع = drop مضبوط بالترتيب العكسي:

```sql
-- rollback (يُنفَّذ عبر supabase--migration فقط عند الحاجة)
DROP TRIGGER IF EXISTS trg_ac_validate_dept ON public.academic_councils;
DROP TRIGGER IF EXISTS trg_acmin_lock_guard ON public.academic_council_minutes;
-- ... (drop 7 touch triggers)
DROP TABLE IF EXISTS public.academic_council_decisions CASCADE;
DROP TABLE IF EXISTS public.academic_council_minutes CASCADE;
DROP TABLE IF EXISTS public.academic_council_agenda_items CASCADE;
DROP TABLE IF EXISTS public.academic_council_topics CASCADE;
DROP TABLE IF EXISTS public.academic_council_meetings CASCADE;
DROP TABLE IF EXISTS public.academic_council_members CASCADE;
DROP TABLE IF EXISTS public.academic_councils CASCADE;
DROP FUNCTION IF EXISTS public.can_write_council_agenda(uuid, uuid);
DROP FUNCTION IF EXISTS public.can_manage_council(uuid, uuid);
DROP FUNCTION IF EXISTS public.has_council_role(uuid, uuid, public.academic_council_member_role);
DROP FUNCTION IF EXISTS public.is_council_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_council_admin(uuid);
DROP TYPE IF EXISTS public.academic_council_decision_status;
DROP TYPE IF EXISTS public.academic_council_topic_status;
DROP TYPE IF EXISTS public.academic_council_meeting_status;
DROP TYPE IF EXISTS public.academic_council_member_role;
DROP TYPE IF EXISTS public.academic_council_type;
```

بما أن الجداول جديدة ولن تحتوي بيانات إنتاجية (schema-only apply)، `DROP … CASCADE` آمن قبل ربط أي واجهة كتابة.

## 9. تأكيدات هذه المرحلة

| البند | الحالة |
|---|---|
| هل طُبِّق migration؟ | ❌ لا |
| هل نُقل ملف إلى `supabase/migrations/`؟ | ❌ لا |
| هل شُغِّل SQL؟ | ❌ لا |
| هل عُدِّل DB/RLS/Storage/Trigger؟ | ❌ لا |
| هل عُدِّل كود؟ | ❌ لا |
| هل أُنشئت بيانات حقيقية / seed؟ | ❌ لا |
| هل أُرسلت إيميلات؟ | ❌ لا |
| هل أُنشئت scheduled jobs؟ | ❌ لا |
| هل تأثر Pilot الحالي؟ | ❌ لا |

## 10. التوصية

**READY FOR DB APPLY** — المسودة نظيفة، النطاق مغلق ومحدود بجداول المجالس السبعة، لا أثر على الإنتاج أو Pilot، وخطة التنفيذ والتحقق والتراجع جاهزة.

## القرار

**PASS**

المرحلة التالية المقترحة: `COUNCILS-MVP-DB-APPLY-01` — عبر أداة `supabase--migration` مع موافقة صريحة على SQL كاملاً في نافذة الاستعراض.
