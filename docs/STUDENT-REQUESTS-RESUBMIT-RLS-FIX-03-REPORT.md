# STUDENT-REQUESTS-RESUBMIT-RLS-FIX-03 — REPORT

## Root cause
سياسة `sr_update_self` على `public.student_requests` لم تتضمن الحالة `returned_for_completion` في تعبير `USING`، فكان تحديث الطالب لطلبه بعد إرجاعه للاستكمال يفشل صمتاً (لأن دالة `submitStudentServiceRequest` تستخدم `context.supabase` بعد إصلاح STUDENT-AFFAIRS-SERVER-CLIENT-FIX-02).

## Policy — قبل
```
USING (
  EXISTS (SELECT 1 FROM student_profiles sp
          WHERE sp.id = student_requests.student_profile_id
            AND sp.user_id = auth.uid())
  AND status = ANY (ARRAY['draft','submitted','under_review','returned'])
)
WITH CHECK (
  ... same ownership ...
  AND status = ANY (ARRAY['draft','submitted','under_review','returned','cancelled'])
)
```

## Policy — بعد
تمت إضافة `'returned_for_completion'` إلى قائمتَي `USING` و`WITH CHECK`، مع الإبقاء على التحقق من الملكية عبر `student_profiles.user_id = auth.uid()`. لا `USING (true)` ولا فتح لكل المستخدمين.

## لماذا migration
تحديث سياسات RLS لا يمكن إجراؤه من الكود التطبيقي؛ يجب أن يتم على مستوى قاعدة البيانات عبر migration.

## تغييرات الكود — `src/lib/student-affairs.functions.ts`
- `submitStudentServiceRequest` أصبحت تُرجع الصف المحدَّث عبر `.select("id,status,current_role_key,updated_at").maybeSingle()`.
- إذا لم يُرجَع صف (أي RLS حجب التحديث)، يُرمى خطأ صريح:
  `Failed to update student request; RLS may have blocked the operation`.
- `insertEvent` و `audit` يُنفذَّان **فقط بعد** نجاح التحديث الفعلي، فلا يظهر نجاح كاذب في الواجهة أو الأحداث.

## القيود المحترمة
- تعديل trigger؟ **لا**.
- تعديل Storage؟ **لا**.
- تعديل بيانات إنتاج؟ **لا**، باستثناء إعادة إرسال الطلب الاختباري الموسوم `TEST-01D-STUDENT-AFFAIRS-WORKFLOW` (`SR-20260702-63868B56`).
- import / delete / reset / cleanup؟ **لا**.
- service_role لتجاوز RLS؟ **لا** — التحديث تم بالفعل عبر جلسة الطالب.

## Build
`bun run build` → ✅ نجح (`built in 12.94s`).

## نتائج التحقق
### 1) الطالب (`student.test.01d@quboolye.test`) — إعادة الإرسال
تنفيذ `PATCH` مباشر على `student_requests` عبر JWT الطالب:
- HTTP 200، صف مُحدَّث فعلياً.
- `status`: `returned_for_completion` → **`submitted`**.
- `current_role_key`: يُعاد إلى مسار workflow (`dean`).
- `updated_at`: تغير إلى `2026-07-02T04:45:59.849832+00:00`.

### 2) unrelated admin (`unrelated.admin.test.01d@quboolye.test`)
- `SELECT` على الطلب: HTTP 200 مع مصفوفة فارغة `[]` (RLS يخفي الصف).
- `PATCH` على الطلب: HTTP 200 مع `[]` (0 rows affected — RLS يمنع الكتابة).
- لا وصول للطلب ولا للمرفقات.

## القرار
**PASS**
