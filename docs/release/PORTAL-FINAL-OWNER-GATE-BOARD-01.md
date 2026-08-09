# PORTAL-FINAL-OWNER-GATE-BOARD-01

**لوحة قرارات المالك البنائية والتشغيلية للإطلاق الإنتاجي النهائي — بوابة الكلية**

- **المعرّف**: `PORTAL-FINAL-OWNER-GATE-BOARD-01`
- **الفرع المصشتق**: `docs/portal-final-production-runbook-prep-01`
- **شجرة العمل**: `C:\projects\saba-final-runbook-316-repin`
- **تركيبة الإصدار المستهدفة**: `#293` + `#291` + `#299` + `#311` + `#312` + `#314` + `#315` + `#317` + `#310`
- **مرجع RC313 / FINAL SOURCE RC**: PR `#313` — `FINAL_RC_HEAD_SHA=2a283003957b4ea490959a10594a7eaf6a3e115d` (`RC313_SHA=2a283003957b4ea490959a10594a7eaf6a3e115d`)
- **مرجع PR314**: PR `#314` — `PR314_SHA=faaf96533a6a4b54aed3d453309cfb5779c79e6f` (`PR314_IN_RC=YES`)
- **مرجع PR315**: PR `#315` — `PR315_SHA=42a9586fe7b20ca883c2f45a6f683a1e2f2e909c` (`PR315_IN_RC=YES`, `PR315_MIGRATIONS=0`)
- **مرجع PR317**: PR `#317` — `PR317_SHA=636e26f1d221f784d18bae00c9a4e7254e1be819` (`PR317_IN_RC=YES`, `PR317_MIGRATIONS=0`)
- **مرجع B1**: PR `#310` (`B1_FINAL_HEAD_SHA=1bdd2fafd37515e18031ef79b4f62233ecb12e12`, `B1_INSERTION_MIGRATIONS=0`)
- **السيادة السياسية**: لا يجوز استبدال التخويل الصريح لأي بوابة بموافقة سابقة أو موافقة شاملة. كل بوابة تتطلب قرار مالك مستقل وموثق.

---

## 1. جدول البوابات الإنتاجية الـ 22 وحالات اتخاذ القرار

---

### 1. بوابات الدمج والمصدر ومرشح الإصدار (Gates 01 - 03)

#### GATE-01: Source Merges Gate (`GATE_OWNER_SOURCE_MERGES`)
- **CURRENT_STATUS**: `SOURCE_RC_PINNED` (FINAL SOURCE RC `#313` مثبت؛ التركيبة `#293/#291/#299/#311/#312/#314/#315/#317/#310` داخل `FINAL_RC_HEAD_SHA`)
- **PREREQUISITE**: مرور كافة اختبارات CI على PR `#313` وPR `#316` (`bun test`, `tsc`, `build`, `diff --check`).
- **ACTION**: مراجعة شجرة المصدر المستقلة وتأكيد خلوها من أي تعارضات دمج مع `main`.
- **VERIFY**: `FINAL_RC_HEAD_SHA=2a283003957b4ea490959a10594a7eaf6a3e115d` و `B1_FINAL_HEAD_SHA=1bdd2fafd37515e18031ef79b4f62233ecb12e12`.
- **STOP_CONDITION**: ظهور أي فشل في CI أو التعارضات المصدرية.
- **OWNER_DECISION_REQUIRED**: قرار مالك الكود المصشتق بالسماح بدمج المصدر (`OWNER_APPROVE_SOURCE_MERGE`).

#### GATE-02: Final RC Acceptance Gate (`GATE_OWNER_FINAL_RC_ACCEPTANCE`)
- **CURRENT_STATUS**: `PINNED_AWAITING_OWNER_ACCEPTANCE` (`FINAL_RC_HEAD_SHA` و `B1_FINAL_HEAD_SHA` مثبتان؛ لا يوجد `PENDING` pin)
- **PREREQUISITE**: اكتمال إدراج `#314/#315/#317/#310` داخل FINAL SOURCE RC وثبوت التكافؤ المصدري للـ migrations الـ 15.
- **ACTION**: توقيع وثيقة مرشح الإصدار النهائي الشامل (Final Integrated Release Candidate SHA).
- **VERIFY**: المطابقة الرقمية بين `FINAL_RC_HEAD_SHA=2a283003957b4ea490959a10594a7eaf6a3e115d` وHEAD فرع `#313`.
- **STOP_CONDITION**: انحراف SHA عن القيم المثبتة أو وجود تعديلات غير موثقة على شجرة الإصدار.
- **OWNER_DECISION_REQUIRED**: اعتماد المالك التجاري والفني لمرشح الإصدار النهائي (`OWNER_APPROVE_FINAL_RC`).

#### GATE-03: Final Read-Only Production Preflight Gate (`GATE_OWNER_READONLY_PREFLIGHT`)
- **CURRENT_STATUS**: `READY_FOR_EXECUTION` (حزمة الفحص المسبق لقراءة فقط مكتملة ومعدة)
- **PREREQUISITE**: فتح قناة اتصال قراءة فقط (READ-ONLY) مع قاعدة بيانات الإنتاج.
- **ACTION**: تشغيل استعلامات `PORTAL-FINAL-READONLY-PREFLIGHT-PACKAGE-01.sql`.
- **VERIFY**: تطابق النتيجة مع `D02_COMPLETE_CLEAN` وعدم وجود أي `PARTIAL` أو `AMBIGUOUS`.
- **STOP_CONDITION**: فشل أي فحص قراءة مسبق أو تعذر الاتصال أو اكتشاف انحراف في المخطط.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على نتائج الفحص لقراءة فقط قبل الانتقال للتطبيقات الكتابية (`OWNER_APPROVE_READONLY_PREFLIGHT`).

---

### 2. بوابات مشاريع التخرج (Gates 04 - 06)

#### GATE-04: GP Migrations Apply Gate (`GATE_OWNER_GP_MIGRATIONS`)
- **CURRENT_STATUS**: `HOLD_PENDING_PREVIOUS_GATES`
- **PREREQUISITE**: نجاح GATE-01 إلى GATE-03 وتأكيد مطابقة كتالوج قاعدة البيانات.
- **ACTION**: تطبيق migration حارس مشاريع التخرج (`20260808010000_gp_student_level4_only_eligibility_guard_01.sql`).
- **VERIFY**: وجود دالة `check_gp_student_level4_eligibility` في الكتالوج.
- **STOP_CONDITION**: خطأ تطبيق RLS أو فشل الفحص البعدي.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على تطبيق migration مشاريع التخرج (`OWNER_APPROVE_GP_MIGRATIONS`).

#### GATE-05: GP TEST_ONLY Package Approval Gate (`GATE_OWNER_GP_TEST_ONLY_PKG`)
- **CURRENT_STATUS**: `HOLD_NOT_EXECUTED`
- **PREREQUISITE**: نجاح GATE-04 وإثبات كائنات مشاريع التخرج.
- **ACTION**: تطبيق حزمة البيانات الاختبارية المعزولة `TEST_ONLY` لاختبار مسارات مشاريع التخرج دون مساس بالبيانات الإنتاجية.
- **VERIFY**: عزلة بيانات الاختبار وعدم تسرب أي معرفات غير اصطناعية.
- **STOP_CONDITION**: اكتشاف أي مساس بالبيانات الحقيقية أو خطأ في التهيئة.
- **OWNER_DECISION_REQUIRED**: اعتماد المالك لحزمة البيانات الاختبارية (`OWNER_APPROVE_GP_TEST_ONLY_PKG`).

#### GATE-06: GP Level-4 Eligibility Activation Gate (`GATE_OWNER_GP_LEVEL4_ACTIVATION`)
- **CURRENT_STATUS**: `HOLD_NOT_ACTIVATED`
- **PREREQUISITE**: تطبيق `20260808010000_gp_student_level4_only_eligibility_guard_01.sql`.
- **ACTION**: تفعيل دالة وحارس الأهلية المحصورة بالمستوى الرابع لمشاريع التخرج.
- **VERIFY**: نجاح استعلام التحقق البعدي وحظر الطلاب دون المستوى الرابع في الاختبارات السلبية.
- **STOP_CONDITION**: السماح لطلاب المستويات 1-3 بالتقديم أو حظر طلاب المستوى 4.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على تفعيل حارس المستوى الرابع (`OWNER_APPROVE_GP_LEVEL4_ACTIVATION`).

---

### 3. بوابات شؤون الخريجين (Gates 07 - 11)

#### GATE-07: GA Foundation Migrations Gate (`GATE_OWNER_GA_FOUNDATION`)
- **CURRENT_STATUS**: `HOLD_PENDING_PREVIOUS_GATES`
- **PREREQUISITE**: نجاح GATE-03 وتأكيد سلامة جدول `staff_profiles` و `student_requests`.
- **ACTION**: تطبيق migration الهيكلية الأساسية لـ GA (`20260808210000_ga_mvp_foundation_01.sql`).
- **VERIFY**: وجود جدول `graduate_profiles` والجداول التأسيسية.
- **STOP_CONDITION**: فشل إنشاء الجداول أو تعارض المفاتيح.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على تطبيق أساسات شؤون الخريجين (`OWNER_APPROVE_GA_FOUNDATION`).

#### GATE-08: GA Completion Migrations Gate (`GATE_OWNER_GA_COMPLETION`)
- **CURRENT_STATUS**: `HOLD_PENDING_PREVIOUS_GATES`
- **PREREQUISITE**: نجاح GATE-07.
- **ACTION**: تطبيق migration كمال مسارات وتصاريح شؤون الخريجين (`20260808210100_ga_mvp_completion_01.sql`).
- **VERIFY**: مطابقة جدول `graduate_clearance_requests`.
- **STOP_CONDITION**: فشل إنشاء سير العمل أو حظر الأدمن.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على اكتمال شؤون الخريجين (`OWNER_APPROVE_GA_COMPLETION`).

#### GATE-09: GA Authorization-04 Gate (`GATE_OWNER_GA_AUTH04`)
- **CURRENT_STATUS**: `HOLD_PENDING_PREVIOUS_GATES`
- **PREREQUISITE**: نجاح GATE-08 واجتياز PR #299 المدمج.
- **ACTION**: تطبيق حارس الصلاحيات والتفويض المباشر عبر RPC لشؤون الخريجين (`20260808210200_ga_authorization_04.sql`).
- **VERIFY**: نجاح مصفوفة ALLOW للمكلّف و DENY لكافة الأدوار الأخرى.
- **STOP_CONDITION**: فشل اختبار DENY أو السماح بتجاوز الصلاحيات.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على تفويض Auth-04 لشؤون الخريجين (`OWNER_APPROVE_GA_AUTH04`).

#### GATE-10: GA Account-Continuity Configuration Gate (`GATE_OWNER_GA_ACCOUNT_CONTINUITY`)
- **CURRENT_STATUS**: `HOLD_NOT_CONFIGURED`
- **PREREQUISITE**: نجاح GATE-09.
- **ACTION**: ضبط إعدادات استمرارية حسابات الخريجين وتحويل وسوم المجموعات.
- **VERIFY**: التأكد من قيود الربط وعدم تكرار البريد أو المعرفات.
- **STOP_CONDITION**: تعارض في ربط البريد أو فقدان بيانات الاستمرارية.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على تهيئة استمرارية الحسابات (`OWNER_APPROVE_GA_ACCOUNT_CONTINUITY`).

#### GATE-11: GA Official Graduate Intake Gate (`GATE_OWNER_GA_GRADUATE_INTAKE`)
- **CURRENT_STATUS**: `HOLD_NOT_STARTED`
- **PREREQUISITE**: نجاح GATE-10 واجتياز فحص ما قبل استيراد الخريجين الرسميين.
- **ACTION**: فتح مسار استقبال واستيراد الخريجين المعتمدين رسمياً.
- **VERIFY**: مطابقة أعداد الخريجين المستوردين مع السجلات الرسمية بدقة 100%.
- **STOP_CONDITION**: أي اختلاف عددي أو فشل في مطابقة البيانات.
- **OWNER_DECISION_REQUIRED**: اعتماد المالك النهائي لدخول دفعة الخريجين الرسمية (`OWNER_APPROVE_GA_GRADUATE_INTAKE`).

---

### 4. بوابات المجالس الأكاديمية (Gates 12 - 13)

#### GATE-12: Councils C0-C9 Migrations Gate (C0 through C9 Individually) (`GATE_OWNER_COUNCILS_C0_C9_INDIVIDUAL`)
- **CURRENT_STATUS**: `HOLD_PENDING_PREVIOUS_GATES`
- **PREREQUISITE**: نجاح GATE-03 وتوفر التخويل لكل خطوة C0 (`20260808120000`), C1 (`20260808121000`), C2 (`20260808122000`), C3 (`20260808130000`), C4 (`20260808140000`), C5 (`20260808150000`), C6 (`20260808160000`), C7 (`20260808170000`), C8 (`20260808171000`), C9 (`20260808180000`) بشكل مفصل ومستقل.
- **ACTION**: تطبيق ملفات SQL للمجالس العشرة واحداً تلو الآخر بالترتيب المعتمد.
- **VERIFY**: إجراء استعلام catalog مخصص بعد كل migration يُثبت الكائن المنشأ قبل فتح الخطوة التالية.
- **STOP_CONDITION**: أي فشل في أي من الخطوات C0-C9 يوقف تسلسل المجالس فوراً.
- **OWNER_DECISION_REQUIRED**: 10 قرارات موافقة فردية من المالك (قرار لكل خطوة من C0 إلى C9) (`OWNER_APPROVE_COUNCILS_CX`).

#### GATE-13: Councils Feature/Test Activation Gate (`GATE_OWNER_COUNCILS_ACTIVATION`)
- **CURRENT_STATUS**: `HOLD_NOT_ACTIVATED`
- **PREREQUISITE**: اكتمال كافة خطوات C0-C9 بنجاح.
- **ACTION**: تفعيل خصائص المجالس واختبار سير العمل التفاعلي للجلسات والمحاضر.
- **VERIFY**: نجاح اختبار طرف-لطرف للمجالس وسلسلة التوقيع والقرارات.
- **STOP_CONDITION**: فشل أي خطوة في أتمتة المجالس أو أخطاء التوقيع.
- **OWNER_DECISION_REQUIRED**: اعتماد المالك لتفعيل خدمات المجالس الأكاديمية (`OWNER_APPROVE_COUNCILS_ACTIVATION`).

---

### 5. بوابات الخدمات الخمس B1 (Gates 14 - 18)

#### GATE-14: B1 Operator Provisioning Gate (`GATE_OWNER_B1_OPERATOR_PROVISIONING`)
- **CURRENT_STATUS**: `READY_SHA_PINNED_HOLD_OWNER_GO`
- **PREREQUISITE**: ثبوت `B1_FINAL_HEAD_SHA=1bdd2fafd37515e18031ef79b4f62233ecb12e12` وتوفر بيانات الموظفين والموكلين المباشرين.
- **ACTION**: تهيئة وتعيين الأدوار التشغيلية للموظفين والمكلّفين بالمجالات والموعد المعتمد.
- **VERIFY**: مطابقة تعيينات `processing_unit` و `processing_role` دون إنشاء حسابات وهمية.
- **STOP_CONDITION**: غياب موظف مكلّف أو تعدد التعيينات المتضاربة.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على تهيئة المشغلين لـ B1 (`OWNER_APPROVE_B1_OPERATOR_PROVISIONING`).

#### GATE-15: B1 Fresh Production Baseline Gate (`GATE_OWNER_B1_FRESH_BASELINE`)
- **CURRENT_STATUS**: `READY_SHA_PINNED_HOLD_OWNER_GO`
- **PREREQUISITE**: نجاح GATE-14 واجتياز الفحص المسبق الأساسي لـ B1.
- **ACTION**: تثبيت قاعدة خط الأساس النظيفة للخدمات الخمس على الإنتاج.
- **VERIFY**: خلو جدول `student_requests` من أي طلبات تجريبية غير رسمية.
- **STOP_CONDITION**: اكتشاف طلبات غير رسمية أو خلل في الجداول.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على تثبيت خط الأساس النظيف لـ B1 (`OWNER_APPROVE_B1_FRESH_BASELINE`).

#### GATE-16: B1 Sequential Migrations Apply Gate (`GATE_OWNER_B1_SEQUENTIAL_APPLY`)
- **CURRENT_STATUS**: `READY_SHA_PINNED_NO_NEW_INSERTION_SQL`
- **PREREQUISITE**: نجاح GATE-15 وثبوت `B1_INSERTION_MIGRATIONS=0` في كتالوج الإطلاق الـ 15.
- **ACTION**: لا تُخترع migrations جديدة. أي خطوة تشغيلية تاريخية لاحقة تُنفَّذ Apply-One فقط بعد موافقة مالك مستقلة: ONE → verify → next، وSTOP عند أي فشل/تطبيق جزئي.
- **VERIFY**: مطابقة الكائنات المتوقعة بعد كل تطبيق مفرد مصرّح به.
- **STOP_CONDITION**: أي خطأ في التطبيق الفردي يوقف التسلسل.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على تنفيذ التسلسل الفردي لـ B1 (`OWNER_APPROVE_B1_SEQUENTIAL_APPLY`).

#### GATE-17: B1 Visibility False Strict Baseline Gate (`GATE_OWNER_B1_VISIBILITY_FALSE`)
- **CURRENT_STATUS**: `HOLD_NOT_VERIFIED`
- **PREREQUISITE**: نجاح GATE-16 وتطبيق `20260802070000_b1_34_five_services_terminal_visibility_false.sql`.
- **ACTION**: تأكيد الحظر الصارم للرؤية (`student_visible=false`) للخدمات الخمس قبل قرار الإطلاق.
- **VERIFY**: `SELECT count(*) FROM student_request_types WHERE code IN (...) AND student_visible = false;` يعيد `5`.
- **STOP_CONDITION**: خرق شرط `student_visible=false` قبل الموافقة الصريحة.
- **OWNER_DECISION_REQUIRED**: اعتماد المالك للحظر الصارم للرؤية قبل التفعيل (`OWNER_APPROVE_B1_VISIBILITY_FALSE`).

#### GATE-18: B1 Positive Fixtures Execution Gate (`GATE_OWNER_B1_POSITIVE_FIXTURES`)
- **CURRENT_STATUS**: `HOLD_NOT_EXECUTED`
- **PREREQUISITE**: نجاح GATE-17.
- **ACTION**: تنفيذ مصفوفة الاختبارات الإيجابية الـ 19/36 المعتمدة للخدمات الخمس.
- **VERIFY**: نجاح كافة المعاملات واجتياز اختبارات Bun التعاقدية.
- **STOP_CONDITION**: أي فشل في مصفوفة الاختبارات الإيجابية.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على نتائج المصفوفة الإيجابية لـ B1 (`OWNER_APPROVE_B1_POSITIVE_FIXTURES`).

---

### 6. بوابات الإطلاق والنشر والتحقق النهائي (Gates 19 - 22)

#### GATE-19: Production Build & Deployment Gate (`GATE_OWNER_DEPLOYMENT`)
- **CURRENT_STATUS**: `HOLD_NOT_AUTHORIZED`
- **PREREQUISITE**: نجاح GATE-01 إلى GATE-18 بالكامل وتوقيع مرشح الإصدار النهائي.
- **ACTION**: النشر الفعلي للأداة على بيئة الإنتاج المباشرة (`PRODUCTION_EXECUTION=AUTHORIZED`).
- **VERIFY**: المطابقة التامة بين الـ Build SHA والـ Commit SHA المنشور.
- **STOP_CONDITION**: أي انحراف في بصمة الكود المنشور أو فشل النشر.
- **OWNER_DECISION_REQUIRED**: التخويل النهائي والصريح بالنشر الإنتاجي (`OWNER_APPROVE_DEPLOYMENT`).

#### GATE-20: Feature Visibility Activation Gate (`GATE_OWNER_VISIBILITY_ACTIVATION`)
- **CURRENT_STATUS**: `HOLD_NOT_ACTIVATED`
- **PREREQUISITE**: نجاح GATE-19 واكتشاف النظام المنشور بنجاح.
- **ACTION**: تعديل وسوم `student_visible=true` للخدمات الخمس والمجالس وشؤون الخريجين بقرارات مالك مفردة لكل خدمة.
- **VERIFY**: ظهور الخدمات في واجهة الطالب والمسؤول بشكل تفاعلي.
- **STOP_CONDITION**: ظهور خطأ في واجهة المستخدم أو انحراف في تفعيل الخدمة.
- **OWNER_DECISION_REQUIRED**: قرارات موافقة فردية لتفعيل رؤية كل خدمة للطلاب (`OWNER_APPROVE_VISIBILITY_SERVICE_X`).

#### GATE-21: End-to-End Post-Deploy Verification Gate (`GATE_OWNER_POST_DEPLOY_E2E`)
- **CURRENT_STATUS**: `HOLD_NOT_EXECUTED`
- **PREREQUISITE**: نجاح GATE-20 وتفعيل رؤية الخدمات.
- **ACTION**: تشغيل حزم الاختبارات الدخانية (Smoke Tests) واختبارات E2E التفاعلية على البيئة المباشرة.
- **VERIFY**: اجتياز 100% من الاختبارات دون أي خطأ في السجلات.
- **STOP_CONDITION**: أي فشل في اختبارات E2E المباشرة.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على اعتماد النتائج التشغيلية الشاملة (`OWNER_APPROVE_POST_DEPLOY_E2E`).

#### GATE-22: Enrollment Certificate Regression Protection Gate (`GATE_OWNER_ENROLLMENT_CERT_PROTECTION`)
- **CURRENT_STATUS**: `HOLD_VERIFICATION_REQUIRED`
- **PREREQUISITE**: نجاح GATE-21.
- **ACTION**: الفحص الحاسم لوثيقة شهادة القيد (`enrollment_certificate`) وتأكيد عدم مساسها أو انحرافها.
- **VERIFY**: المطابقة الرقمية لمخرجات شهادة القيد وسجلات التوقيع مع الـ Immutable Baseline.
- **STOP_CONDITION**: أي تغيير في سلوك أو بيانات أو صيغة شهادة القيد.
- **OWNER_DECISION_REQUIRED**: الاعتماد الصارم النهائي لحماية شهادة القيد وإغلاق ملف الإطلاق (`OWNER_APPROVE_ENROLLMENT_CERT_PROTECTION`).

---
