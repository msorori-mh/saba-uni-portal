# FACULTY_ACCOUNTS_EMAIL_IMPORT_POST_VERIFICATION_01 — REPORT

**التاريخ:** 2026-07-15  
**المستودع:** msorori-mh/saba-uni-portal  
**Expected main HEAD:** 097bc43abf9a8661cecc501dc9198031d6f9f422  
**Lovable Production:** 4b291119-790f-4484-9285-c2b774e1ba6f  
**Supabase Production:** wpmicqriltrowwonknox  
**الوضع:** Read-only — لا Migration، لا Publish/Deploy، لا كتابة.

---

## 1. القرار النهائي

**HOLD_FACULTY_ACCOUNTS_EMAIL_IMPORT_HAS_ERRORS**

السبب الجوهري: **لا يوجد أي سجل استيراد يوافق ملف `faculty_accounts_email_update_ready.xlsx`.** آخر سجل استيراد من نوع `faculty` هو ملف قديم من 2026-06-04، ولم يُنفَّذ استيراد لتحديث البريد على الإطلاق. نتيجة لذلك، حقل `faculty.email` فارغ لكافة أعضاء هيئة التدريس المذكورين في الملف باستثناء صف قديم واحد فقط.

بالتبعية:

- **HOLD_FACULTY_ACCOUNTS_EMAIL_IMPORT_DEAN_LINK_MISMATCH** — بريد العميد `maqbol3@usr.edu.ye` غير مسجَّل في قاعدة البيانات (faculty.email فارغ للسجل F2025001).
- **HOLD_FACULTY_ACCOUNTS_EMAIL_IMPORT_E2E_ACTOR_STILL_NOT_READY** — لا يمكن تسجيل دخول العميد عبر بريد لم يُحفظ.

---

## 2. نتائج سجل الاستيراد (G0)

استعلام `import_logs` (فلترة `import_type ILIKE '%faculty%' OR file_name ILIKE '%email%'`):

| id | import_type | file_name | rows_total | rows_success | rows_failed | status | created_at |
|----|-------------|-----------|-----------:|-------------:|------------:|--------|------------|
| 3b9d8742-fa50-4976-b8cf-1bd207318f9f | faculty | faculty_import_final_validated_departments.xlsx | 31 | 31 | 0 | completed | 2026-06-04 20:53:36+00 |

**لا يوجد أي سجل باسم `faculty_accounts_email_update_ready.xlsx` أو أي سجل استيراد بعد 2026-06-04 يخص faculty.** الاستيراد لم يُنفَّذ.

---

## 3. أعداد الحسابات

- الحسابات المستهدفة في الملف: 25
- الموجودة فعلياً في `faculty` (بـ employee_id): **24**
- المفقودة كلياً: **1** — `F2025032` (أ. نورا عزمي … كذا) — لا سجل في `faculty`.
- الحسابات التي تحمل بريداً في `faculty.email` بعد "الاستيراد": **1** فقط (`F2025002 → msorori@usr.edu.ye`) — قيمة قديمة سابقة للاستيراد.
- الحسابات المحدَّثة بواسطة عملية الاستيراد المذكورة: **0**.
- الحسابات المنشأة بواسطة عملية الاستيراد المذكورة: **0**.
- الحسابات الفاشلة: غير قابل للقياس (لا سجل استيراد).

---

## 4. الحسابات التي فشلت

لا يوجد سجل فشل، لأن العملية لم تُنفَّذ أصلاً.

---

## 5. جدول الحسابات الخمسة والعشرين (G1)

المصادر: `faculty` + `faculty_profiles`. تعذر الوصول إلى `auth.users` من psql (schema auth ممنوع القراءة على الاتصال الحالي)، لذا لم يُتحقق من البريد داخل Auth مباشرةً — ولكن كون `faculty.email` فارغاً لكل الصفوف أدناه (باستثناء F2025002) يكفي لإثبات فشل الاستيراد بغضّ النظر عن Auth.

| employee_id | full_name_ar | البريد المتوقع | faculty.email | user_id (profile) | must_change_password | ملاحظة |
|---|---|---|---|---|---|---|
| F2025001 | أ.م.د. مقبول قايد عبده الكامل | maqbol3@usr.edu.ye | *(فارغ)* | b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0 | f | **العميد — بريد غير مربوط** |
| F2025002 | أ.م.د. مختار حسين السروري | msorori@usr.edu.ye | msorori@usr.edu.ye | 103c8988-… | f | مطابق (قيمة قديمة) |
| F2025003 | د. عبدالعزيز أحمد ثوابه | azizth@usr.edu.ye | *(فارغ)* | 0023ca37-… | t | لم يُحدَّث |
| F2025004 | د. رمزي حميد الجابري | ramzi@usr.edu.ye | *(فارغ)* | f602b62c-… | t | لم يُحدَّث |
| F2025005 | د. خالد قاسم البراحي | kh.alborahy@usr.edu.ye | *(فارغ)* | d4aaa5c9-… | f | لم يُحدَّث |
| F2025006 | د. أسامة عبدالجليل سيف | osamah.saif@usr.edu.ye | *(فارغ)* | 97acbe02-… | t | لم يُحدَّث |
| F2025007 | د. فارس علي الهدشاء | alhadsha.f@usr.edu.ye | *(فارغ)* | fb83fbba-… | t | لم يُحدَّث |
| F2025011 | د. غسان المعمري | ghassan.almaamari@usr.edu.ye | *(فارغ)* | 3f478ec3-… | t | لم يُحدَّث |
| F2025013 | د. معاذ الصبري | muaadhabdo@usr.edu.ye | *(فارغ)* | 71a0206b-… | t | لم يُحدَّث |
| F2025014 | د. أكرم الحمادي | a.alhammadi@usr.edu.ye | *(فارغ)* | d41a1de5-… | t | لم يُحدَّث |
| F2025015 | د. عيسى محمد | issamohammed.cs@usr.edu.ye | *(فارغ)* | 9263754c-… | t | لم يُحدَّث |
| F2025016 | د. يحيى محمد | yahya.mohammed@usr.edu.ye | *(فارغ)* | 6e46bad6-… | t | لم يُحدَّث |
| F2025017 | د. حمود هزاع | hmoud.shalabi@usr.edu.ye | *(فارغ)* | 593d4b69-… | t | لم يُحدَّث |
| F2025018 | أ. ياسر عبدالله | yasserali@usr.edu.ye | *(فارغ)* | d1086c22-… | t | لم يُحدَّث |
| F2025019 | أ. عبدالرزاق صالح | eng.kalilah@usr.edu.ye | *(فارغ)* | f82e4ee9-… | t | لم يُحدَّث |
| F2025020 | أ. فتح الجرادي | fathahmed@usr.edu.ye | *(فارغ)* | 0462feda-… | t | لم يُحدَّث |
| F2025021 | أ. بسمة العاقل | bsmaali@usr.edu.ye | *(فارغ)* | 99993cdf-… | t | لم يُحدَّث |
| F2025023 | أ. عائشة مرشد | aisha@usr.edu.ye | *(فارغ)* | 18243859-… | t | لم يُحدَّث |
| F2025025 | أ. بشير حيدر | basheer@usr.edu.ye | *(فارغ)* | 699a65b8-… | t | لم يُحدَّث |
| F2025026 | أ. غالب عبار | ghaleb@usr.edu.ye | *(فارغ)* | e597e29b-… | t | لم يُحدَّث |
| F2025028 | أ. يوسف الهجري | dhyfullah@usr.edu.ye | *(فارغ)* | 6874310f-… | f | لم يُحدَّث |
| F2025029 | أ. عصماء القرشي | ywsfalhwlndy@usr.edu.ye | *(فارغ)* | 1604b3f3-… | t | لم يُحدَّث |
| F2025030 | أ. عقيل البحري | asmaaalkershi@usr.edu.ye | *(فارغ)* | 5cd8e2c8-… | t | لم يُحدَّث |
| F2025031 | أ. نورا العبسي | albahriaqeel@usr.edu.ye | *(فارغ)* | 1f4c3dd0-… | t | لم يُحدَّث |
| **F2025032** | *(غير موجود)* | eng.nouraazmi@usr.edu.ye | — | — | — | **مفقود من faculty** |

عدد المطابقات الناجحة بين faculty.email والبريد المتوقع في الملف: **0 من 25** (الصف الوحيد الموجود F2025002 يختلف اسمه المتوقع في الملف — راجع الملاحظة أدناه: القيمة القديمة `msorori@usr.edu.ye` تتطابق صدفةً مع البريد المتوقع لنفس الرقم).

> ملاحظات دلالية: الأسماء أعلاه أُخذت من `faculty.full_name_ar`. بعض الأسماء في نص الطلب لا تطابق ما هو محفوظ (مثال: F2025029 اسمه في القاعدة "عصماء القرشي" لا "يوسف الهولندي")، وهذا يكشف أن تعيين employee_number ↔ email في الملف قد يحتاج مراجعة دلالية مستقلة قبل إعادة الاستيراد.

---

## 6–12. حالة العميد (G2)

| الحقل | القيمة |
|-------|--------|
| اسم العميد | أ.م.د. مقبول قايد عبده الكامل |
| employee_id | F2025001 |
| البريد المتوقع | maqbol3@usr.edu.ye |
| البريد الفعلي في `faculty.email` | *(فارغ)* |
| faculty_profile.user_id | b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0 |
| must_change_password | false |
| dean_signature assignment | *(تعذّر التأكيد — عمود `processing_role` غير موجود على `request_processing_assignments` بهذا الاسم؛ يتطلب إعادة استعلام بالتخطيط الفعلي في مرحلة لاحقة)* |
| role=dean | مؤكد من مراحل سابقة، لم يُلمس |
| مسار الدخول | `/faculty-portal` |
| DEAN_LOGIN_EMAIL | **غير محلول** — لا يمكن الإعلان عنه لأن البريد غير مخزَّن |

**قرار العميد:** `HOLD_FACULTY_ACCOUNTS_EMAIL_IMPORT_DEAN_LINK_MISMATCH`.

> تنبيه: user_id للعميد في `faculty_profiles` هو `b3dd71e6-…`، بينما تقرير سابق (DEAN-LOGIN-IDENTITY-RESOLUTION-01) ذكر `ce2f9190-…`. هذا التباين يستوجب توضيحاً في مرحلة تسوية الهوية لاحقاً — قد يشير إلى وجود سجل Auth ثانٍ مرتبط تاريخياً بنفس الملف الأكاديمي أو أن التقرير السابق كان يشير إلى user_id قبل تحديث.

---

## 13. التكرارات (G4)

- تعذّر فحص Auth المباشر (auth schema ممنوع القراءة).
- على مستوى `faculty`: `employee_id` فريد (unique constraint) — لا تكرار.
- على مستوى `faculty_profiles`: `employee_number`, `faculty_id`, `user_id` كلها UNIQUE — لا تكرار.
- لم تُنشأ أي حسابات جديدة (لعدم تنفيذ الاستيراد)، لذا لا وجود لحسابات `faris.alyosfi@usr.edu.ye` أو `mohammedshamsan@usr.edu.ye` مضافة إلى `faculty` عن طريق هذا الملف.

---

## 14. أعضاء هيئة التدريس ببريد ناقص (G5)

جميع الـ24 عضواً الموجودين في القائمة (باستثناء F2025002) لا يزال `faculty.email` فارغاً. عدد الصفوف الكلي في `faculty` التي تحمل بريداً غير فارغ: **1** فقط.

السبب في كل الحالات: **الاستيراد لم يُنفَّذ.**

---

## 15. إثبات عدم تغير الأدوار والتكليفات (G3)

لم يُنفَّذ استيراد، فبالتالي:

- لم تُعدَّل `user_roles`.
- لم تُعدَّل `request_processing_assignments`.
- لم تُعدَّل `faculty_profiles.status`.
- لم تُعدَّل عضويات المجالس / أدوار الأقسام.

النتيجة: **لا Drift** — بالسلب لا بالفعل.

---

## 16. القائمة النهائية لمنفذي E2E (G6)

| الدور | الاسم | البريد المتوقع | حالة البريد | جاهزية الدخول |
|-------|------|----------------|-------------|----------------|
| الطالب | أحمد محمد علي محمد (S2025001) | — | مؤكد سابقاً | ✅ |
| مختص شؤون الطلاب | هيثم الشبلي | hitham@usr.edu.ye | مؤكد | ✅ |
| مدير شؤون الطلاب | ياسمين الولص | yasmin@usr.edu.ye | مؤكد | ✅ |
| الإيرادات | فارس اليوسفي | fares@usr.edu.ye | مؤكد | ✅ |
| المسجل العام | عبدالله طعيمان | toaiman@usr.edu.ye | مؤكد | ✅ |
| **العميد** | أ.م.د. مقبول قايد | maqbol3@usr.edu.ye | **غير مخزَّن في faculty.email** | ❌ |
| مختص شؤون الطلاب (إصدار) | هيثم الشبلي | hitham@usr.edu.ye | مؤكد | ✅ |
| الأرشيف | محمد أمين | mameen@usr.edu.ye | يتطلب التأكيد المستقل | ⚠️ |
| الطالب (تنزيل) | S2025001 | — | ✅ | ✅ |

**الحالة الإجمالية:** غير جاهز — العميد يمنع E2E.

---

## 17. لقطة الطلب المحظور (G7)

```
request_id : 93807768-a281-42de-bfb4-0c0c03786b20
status     : in_review
updated_at : 2026-07-13 17:59:19.782271+00
```

مطابق تماماً للقيم المرجعية. **لا تغيير**.

- documents/details/attempts: لم يُستعلَم عنها في هذه الجولة (نُفَّذت في التقارير السابقة، ولم تُلمس أي كتابة منذ ذلك الحين).

---

## 18. إثبات عدم Migration/Publish/Deploy

- لم يُنشأ أي ملف تحت `supabase/migrations/` في هذه الجلسة.
- لا استدعاءات `supabase--migration`.
- لا `preview_ui--publish`.
- التنفيذ اقتصر على استعلامات `psql` قراءة فقط + إنشاء هذا التقرير.

---

## 19. المرحلة التالية المقترحة

**FACULTY_ACCOUNTS_EMAIL_IMPORT_EXECUTION_01** — إعادة تنفيذ الاستيراد نفسه لملف `faculty_accounts_email_update_ready.xlsx` عبر الأداة الرسمية `/admin/faculty-accounts` (أو مسار الاستيراد المعتمد)، مع:

1. التحقق من وجود صف لـ `F2025032` في الملف/القاعدة قبل الاستيراد.
2. مراجعة تعيين employee_number ↔ email للحقول التي لا يبدو أن أسماءها تتطابق (F2025019, F2025029, F2025030, F2025031).
3. توليد سجل `import_logs` جديد.
4. إعادة تشغيل هذه المرحلة (POST_VERIFICATION_01) للتأكيد.
5. عندها فقط: `DEAN_LOGIN_IDENTITY_RESOLUTION_02` ثم استئناف E2E.

---

## 20. المراحل المتبقية للبوابة (لقطة موجزة)

| المسار | الحالة |
|--------|--------|
| شهادة القيد — E2E بشري | **BLOCKED** (بريد العميد) |
| شهادة القيد — Saga/Storage | جاهز تقنياً |
| بقية الخدمات الطلابية (نقل، إعادة قيد، …) | NOT_STARTED |
| استيراد جداول جاهزة (ScheduleImportPanel) | READY كواجهة، لم يُختبر تشغيلياً |
| تقارير الشؤون الأكاديمية | NOT_STARTED |
| المجالس الأكاديمية | جداول موجودة، بلا واجهة تشغيل |
| متابعة التدريس | جزئي |
| المواد التعليمية | جزئي |
| البوابة كاملة (Publish) | FORBIDDEN حالياً |

---

## القيود الملتزمة

READ_ONLY_ONLY · NO_E2E · NO_SAGA · NO_MIGRATION · NO_PUBLISH_DEPLOY · NO_USER_UPDATE · NO_PASSWORD_RESET · NO_ASSIGNMENT_CHANGE · NO_CLEANUP · NO_DELETE

*نهاية التقرير — FACULTY_ACCOUNTS_EMAIL_IMPORT_POST_VERIFICATION_01*
