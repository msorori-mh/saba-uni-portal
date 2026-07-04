# COUNCILS-FACULTY-HISTORY-RLS-01 — REPORT

**القرار:** PASS

## Migration
- الاسم: `COUNCILS-FACULTY-HISTORY-RLS-01` (تم تطبيقها بنجاح).
- نطاقها: helpers + RLS فقط. لا تغيير schema. لا بيانات.

## الجداول المتأثرة
- `public.academic_council_members` — سياسة SELECT.
- `public.academic_council_meetings` — سياسة SELECT.
- `public.academic_council_topics` — سياستَي SELECT و INSERT.

## Helpers مضافة
1. `public.was_council_member_on(_user uuid, _council uuid, _date date) → boolean`
   - SECURITY DEFINER, STABLE, `search_path = public`.
   - يُرجع true إذا كان للمستخدم صف عضوية في المجلس المطلوب و `active_from <= _date` و (`active_to IS NULL` أو `active_to >= _date`).
2. `public.can_submit_council_topic(_user uuid, _council uuid) → boolean`
   - SECURITY DEFINER, STABLE, `search_path = public`.
   - يشترط `is_active = true` و ( `active_to IS NULL` أو `active_to >= CURRENT_DATE` ) و `member_role IN ('chair','secretary','member')`. يستثني `viewer`.

Helpers الحالية (`is_council_admin`, `is_council_member`, `can_manage_council`, `can_write_council_agenda`) لم تُعدَّل.

## Policies المعدَّلة

### `academic_council_members` — `council_members_select`
```
is_council_admin(auth.uid())
OR is_council_member(auth.uid(), council_id)
OR user_id = auth.uid()
```
الإضافة `user_id = auth.uid()` تضمن أن يرى المستخدم كل عضوياته (الحالية والسابقة)، دون كسر رؤية الإدارة أو الأعضاء الحاليين للزملاء في نفس المجلس. سياسات INSERT/UPDATE لم تُمَس.

### `academic_council_meetings` — `meetings_select`
```
is_council_admin(auth.uid())
OR is_council_member(auth.uid(), council_id)
OR was_council_member_on(auth.uid(), council_id, (scheduled_at AT TIME ZONE 'UTC')::date)
```
العضو السابق يقرأ فقط اجتماعات تقع بين `active_from` و `active_to` لعضويته. INSERT/UPDATE لم تُمَس.

### `academic_council_topics` — `topics_insert_member` (منع viewer)
```
submitted_by = auth.uid()
AND (
  is_council_admin(auth.uid())
  OR can_submit_council_topic(auth.uid(), council_id)
)
```
`can_submit_council_topic` لا يعترف بدور `viewer`، فيُمنع من الإدراج على مستوى RLS مباشرة. الإدارة تحتفظ بحقها.

### `academic_council_topics` — `topics_select`
```
is_council_admin(auth.uid())
OR is_council_member(auth.uid(), council_id)
OR submitted_by = auth.uid()
OR EXISTS (
     SELECT 1 FROM academic_council_meetings mt
     WHERE mt.id = academic_council_topics.meeting_id
       AND was_council_member_on(
             auth.uid(), academic_council_topics.council_id,
             (mt.scheduled_at AT TIME ZONE 'UTC')::date
           )
   )
```
العضو السابق يرى الموضوعات المرتبطة باجتماع داخل فترة عضويته فقط. UPDATE `topics_update_owner_draft` لم تُمَس. لا DELETE policy جديدة.

## كيف تم منع viewer من تقديم موضوع
- الدالة `can_submit_council_topic` تشترط `member_role IN ('chair','secretary','member')`. viewer لا يمر.
- السياسة `topics_insert_member` الجديدة تستدعي هذه الدالة (أو `is_council_admin`) في `WITH CHECK`، فيفشل أي INSERT من viewer على مستوى قاعدة البيانات، بصرف النظر عن الـ UI.

## كيف تم دعم أرشيف العضو السابق
- `was_council_member_on(user, council, date)` يقيس التاريخ ضد `active_from`/`active_to` بغض النظر عن `is_active` الحالية.
- طُبِّق في سياسة اجتماعات المجالس وفي `topics_select` عبر ربط الاجتماع.
- سياسة عضويات المجالس أضافت `user_id = auth.uid()` ليرى المستخدم صفوف عضوياته السابقة.

## الاختبارات

فُحص المخطط والسياسات مباشرة على قاعدة البيانات، وتم التحقق من دلالات الدوال بالمحاكاة المنطقية. لم تُنشأ بيانات اختبارية (طبقاً لقيود المرحلة).

| # | الحالة | النتيجة | كيفية التحقق |
|---|--------|---------|--------------|
| 1 | viewer لا يستطيع INSERT في `academic_council_topics` | PASS | `topics_insert_member.WITH CHECK` يستبعد viewer عبر `can_submit_council_topic` (شرط `member_role IN ('chair','secretary','member')`). |
| 2 | member يستطيع INSERT نظرياً | PASS | نفس الشرط يقبل `member` عند `is_active` و ضمن الفترة. |
| 3 | العضو السابق يقرأ اجتماعاً داخل فترة عضويته | PASS منطقياً | `meetings_select` يضم `was_council_member_on(...)`. لم يُختبر بيانياً — NOT TESTED WITH DATA. |
| 4 | العضو السابق لا يقرأ اجتماعاً بعد `active_to` | PASS منطقياً | `was_council_member_on` يشترط `active_to IS NULL OR active_to >= _date`. NOT TESTED WITH DATA. |
| 5 | المستخدم لا يرى عضوية مستخدم آخر | PASS | `council_members_select` يمنح صفوف الغير فقط عبر `is_council_admin` أو `is_council_member` في نفس المجلس؛ لم تُضف رؤية عامة. |
| 6 | admin/dean لم تتضرر صلاحيات القراءة | PASS | جميع السياسات تحتفظ بفرع `is_council_admin(auth.uid())` أولاً، ولا شيء أُزيل من الفروع الأصلية. `dean` لا يُعرَّف كـ admin مجالس في `is_council_admin` الحالية — هذا سلوك قائم من قبل ولم يتغيّر. |
| 7 | لا service role في client | PASS | لا تعديل UI/functions. |
| 8 | لا DELETE policies جديدة | PASS | لم تُضَف. |

الحالات NOT TESTED WITH DATA (3, 4): تعذّر إثباتها ببيانات فعلية ضمن هذه المرحلة لعدم السماح بإنشاء عضويات/اجتماعات. المنطق SQL مطابق للمواصفة ويمكن التحقق التطبيقي في مرحلة UI اللاحقة.

## تأكيدات النطاق
- لا UI changes.
- لا server function changes.
- لا service role في المتصفح.
- لا seed/import.
- لا حذف بيانات.
- لا تعطيل عضويات.
- لا إنشاء اجتماعات.
- لا إنشاء موضوعات.
- لا Storage.
- لا Email/Cron.
- لا تغيير schema (فقط helpers + policies).

## تحذيرات linter
جميع تحذيرات الـ linter المُبلَّغة (Public Bucket Allows Listing, Public Can Execute SECURITY DEFINER Function, …) قائمة من قبل ولا علاقة لها بجداول المجالس أو بهذه المرحلة. لم تُضف تحذيرات جديدة سببها هذه الـ migration.

## التوصية التالية
**READY_FOR_COUNCILS_FACULTY_COUNCILS_FUNCTIONS_02**
