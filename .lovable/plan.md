# FACULTY-DATA-CLEANUP-01 — خطة التنفيذ

## نتائج الفحص قبل التنفيذ

عند فحص السجلات القديمة وجدنا 34 سجل (وليس بالضرورة `LEC001-016` كما ذُكر — الأرقام الفعلية في القاعدة):

| المجموعة | الأرقام الموجودة | العدد |
|---|---|---|
| Demo/Test | `DEMO-FAC`, `FAC7A99` | 2 |
| Seed Lecturers | `LD001` → `LD003` | 3 |
| Seed Faculty | `FA001` → `FA014` | 14 |
| Seed Assistants | `AS001` → `AS015` | 15 |
| **الإجمالي القديم** | | **34** |

> ⚠️ لا توجد سجلات بأرقام `LEC001-LEC016` — الموجود فعلياً هو `FA001-FA014` و`LD001-LD003`. الخطة تتعامل مع ما هو موجود فعلاً.

## التبعيات المكتشفة (مهم جداً)

| السجل | لديه profile؟ | profile مرتبط بـ auth.user؟ | course_sections | class_schedule |
|---|---|---|---|---|
| `FAC7A99` | نعم (`EMP7A99`) | لا | 0 | 0 |
| `DEMO-FAC` | نعم | نعم (`a8289b31...`) | 0 | 0 |
| **`FA001`** (د. رمزي حميد الجابري) | نعم (`F0001`) | **نعم (`aa8fa197...`)** | **1** | **1** |
| باقي السجلات (33) | لا | — | 0 | 0 |

**النقطة الحرجة:** السجل `FA001` هو نفس الشخص الموجود في الاستيراد الجديد كـ `F2025004`. لكن profile الخاص بـ `FA001` (employee_number=`F0001`, user_id=`aa8fa197...`) **مرتبط فعلياً بشعبة وجدول دراسي**. حذفه سيكسر العلاقات؛ كما أن كلا السجلين يمثلان نفس الشخص.

## خطة التنفيذ (Migration واحد)

### الخطوة 1 — تعطيل `FA001` بدلاً من حذفه (لوجود علاقات)
```sql
UPDATE public.faculty
   SET is_active = false, updated_at = now()
 WHERE employee_id = 'FA001';
```
يُترك profile `F0001` كما هو لأنه مرتبط بشعبة/جدول؛ سيتم لاحقاً (في مرحلة REPAIR) دمج بياناته مع `F2025004` يدوياً أو إعادة ربط الشعبة.

### الخطوة 2 — حذف faculty_profiles التجريبية فقط
```sql
DELETE FROM public.faculty_profiles
 WHERE faculty_id IN (
   SELECT id FROM public.faculty WHERE employee_id IN ('DEMO-FAC','FAC7A99')
 );
```
> `user_id` للحساب التجريبي `DEMO-FAC` (`a8289b31...`) سيُفصل تلقائياً (لن يُحذف من `auth.users` حسب التعليمات).

### الخطوة 3 — حذف السجلات القديمة غير المرتبطة من `faculty`
```sql
DELETE FROM public.faculty
 WHERE employee_id IN ('DEMO-FAC','FAC7A99','LD001','LD002','LD003',
                       'FA002','FA003','FA004','FA005','FA006','FA007',
                       'FA008','FA009','FA010','FA011','FA012','FA013','FA014',
                       'AS001','AS002','AS003','AS004','AS005','AS006','AS007','AS008',
                       'AS009','AS010','AS011','AS012','AS013','AS014','AS015');
```
(33 سجل — `FA001` مستثنى لأنه عُطّل في الخطوة 1)

### الخطوة 4 — تقرير التحقق بعد التنظيف
```sql
SELECT
  (SELECT COUNT(*) FROM faculty) AS total_faculty,
  (SELECT COUNT(*) FROM faculty WHERE is_active = true) AS active_faculty,
  (SELECT COUNT(*) FROM faculty WHERE is_active = false) AS inactive_faculty,
  (SELECT COUNT(*) FROM faculty_profiles) AS total_profiles,
  (SELECT COUNT(*) FROM faculty_profiles WHERE user_id IS NOT NULL) AS linked_profiles,
  (SELECT COUNT(*) FROM faculty_profiles WHERE user_id IS NULL) AS unlinked_profiles,
  (SELECT COUNT(*) FROM faculty WHERE employee_id ILIKE '%DEMO%' OR employee_id ILIKE '%TEST%') AS demo_remaining;
```

## النتيجة المتوقعة بعد التنظيف

| البند | المتوقع |
|---|---|
| `faculty` الإجمالي | 32 (31 نشط F2025xxx + 1 معطّل FA001) |
| `faculty` النشطين | **31** ✅ |
| `faculty_profiles` الإجمالي | 32 (31 جديد + F0001 للقديم FA001) |
| `faculty_profiles` المربوطة | 32 (كلها مرتبطة) |
| سجلات Demo/Test | **0** ✅ |

## تنبيهات قبل التنفيذ — قرار مطلوب منك

1. ✅ **خطر دمج البيانات:** `FA001` و`F2025004` هما **نفس الشخص (د. رمزي حميد الجابري)**. الخطة الحالية تُعطّل `FA001` فقط (لا تحذفه) لأنه مرتبط بشعبة. بعد التنفيذ ستحتاج مرحلة REPAIR لاحقاً لـ:
   - إما إعادة ربط الشعبة/الجدول من profile `F0001` إلى profile `F2025004`
   - أو الإبقاء على الوضع الحالي مؤقتاً
2. ⚠️ **حساب Auth التجريبي** الخاص بـ `DEMO-FAC` (`a8289b31...`) يبقى في `auth.users` بدون profile — حسب القيود لا نحذف Auth في هذه المرحلة.
3. ❓ **سؤال:** هل توافق على تعطيل `FA001` (وعدم حذفه) للحفاظ على الشعبة/الجدول المرتبطين، على أن نعالج الدمج لاحقاً في REPAIR؟ أم تفضل خياراً آخر (مثل: نقل الشعبة الآن إلى `F2025004` ثم حذف `FA001`)؟
