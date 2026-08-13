# APPROVED — SOURCE-ONLY DECISION PACKAGE

Proceed with documentation/data-preparation only.

1. Update:

docs/reviews/COURSE-SECTION-STUDY-SYSTEM-RECONCILIATION-01-IMPORT.csv

Set study_system = عام for exactly these 7 DEMO rows:

- DEMO-FITCS01

- DEMO-FITCS02

- DEMO-FITCS03

- DEMO-FITCS05

- DEMO-IT343

- DEMO-IT425

- DEMO-AI414

Keep:

A / USR02

study_system = BLANK

Do not infer or guess its value.

2. Update:

docs/reviews/[COURSE-SECTION-STUDY-SYSTEM-RECONCILIATION-01.md](http://COURSE-SECTION-STUDY-SYSTEM-RECONCILIATION-01.md)

Add:

- APPROVED VALUES: seven DEMO sections = عام

- PENDING OFFICIAL SOURCE: A / USR02

- reason: no authoritative academic source currently available

- no derivation from students, fees, or enrollment patterns

3. Mark the CSV clearly:

DECISION INPUT — NOT YET AUTHORIZED FOR PRODUCTION IMPORT

4. Do NOT:

- import the 7 rows to Production

- update course_sections directly

- apply Migration A

- apply Migration B

- deploy/publish

- modify application code

- add new tests

5. Note for the future production gate:

Migration A remains blocked until:

ACTIVE_SECTIONS_WITH_NULL_STUDY_SYSTEM = 0

Migration B is technically independent security hardening and may be

authorized separately by the owner; do not couple its safety to USR02.

Return:

- ENDING_HEAD

- exact changed files

- final 8-row CSV contents

- updated reconciliation decision

- confirmation:

  PRODUCTION_WRITES=0

  MIGRATIONS_APPLIED=0

  DEPLOY_PUBLISH=0

Then STOP.تعبئة نظام الدراسة للمجموعات الثماني — قرار المصدر فقط

## القرار المعتمد الآن

- مجموعات DEMO السبع = **عام**:
DEMO-FITCS01، DEMO-FITCS02، DEMO-FITCS03، DEMO-FITCS05، DEMO-IT343، DEMO-IT425، DEMO-AI414.
- المجموعة **A — USR02** (مهارات اللغة العربية 2، 2025-2026 / second، المدرّس F2025028): **معلّقة**.
لا يوجد لديّ مصدر رسمي يثبت نظام دراستها، وهي مجموعة إنتاجية حقيقية لا DEMO،
والاشتقاق من بيانات الطلاب أو الرسوم ممنوع بموجب قواعد المهمة. لذلك لن أعتمد لها أي قيمة.

## الأثر المباشر على البوابة الإنتاجية

طالما بقيت `A — USR02` بلا قيمة، فإن:

```text
ACTIVE_SECTIONS_WITH_NULL_STUDY_SYSTEM = 1  (≠ 0)
```

وبالتالي **لا يجوز** تطبيق Migration A (Canonicalization) ولا Migration B (تأمين cdp_instantiate)
قبل حسم قيمة هذه المجموعة من المصدر الرسمي.

## ما سيُنفَّذ عند إعطاء أمر التنفيذ (مصدر فقط، بلا كتابة إنتاجية)

1. تعبئة `docs/reviews/COURSE-SECTION-STUDY-SYSTEM-RECONCILIATION-01-IMPORT.csv`:
  - سبعة صفوف DEMO بقيمة `عام` في عمود `study_system`.
  - صف `A / USR02` يبقى **فارغًا** ومعلَّمًا كمعلّق في التقرير.
2. تحديث `docs/reviews/COURSE-SECTION-STUDY-SYSTEM-RECONCILIATION-01.md`:
  - قسم «القيم المعتمدة» للسبع.
  - قسم «معلّق بانتظار المصدر الرسمي» لصف USR02 مع سبب التعليق.
3. لا تعديل كود، لا اختبارات جديدة، لا Migration، لا استيراد إنتاجي في هذه المرحلة.

## خياران لحسم USR02

- **(أ) اعتماد قيمة صريحة منك** («عام» أو «نفقة خاصة» أو «كلا النظامين») — عندها أُكمل الصف الثامن
ويصبح الملف جاهزًا كاملًا لتشغيل الاستيراد بخيار «تحديث القائم» ثم Verify = 0.
- **(ب) تشغيل الاستيراد على السبع أولًا** — يهبط العدّاد من 8 إلى 1، وتبقى USR02 مسجَّلة كاستثناء
موثَّق حتى يصل السجل الأكاديمي الرسمي؛ لا يُفتح بعدها باب Migration A/B إلا بعد بلوغ الصفر.

## البوابة

لن أنفّذ أي استيراد إنتاجي أو Migration في هذه الخطة. الخطوة التالية بعد اعتمادها هي تعبئة
ملف القرار فقط، ثم التوقف بانتظار أمرك المحكوم بالكتابة الإنتاجية.