# PORTAL-FINAL-OWNER-GATE-BOARD-01

**لوحة قرارات المالك البنائية والتشغيلية للإطلاق الإنتاجي النهائي — بوابة الكلية**

- **المعرّف**: `PORTAL-FINAL-OWNER-GATE-BOARD-01`
- **الفرع المصشتق**: `docs/portal-final-production-runbook-prep-01`
- **شجرة العمل**: `C:\projects\saba-production-runbook-prep`
- **مرجع RC313**: PR `#313` (`e3db0cc330106518d5ab9ca6874d70d9e98b1411`)
- **مرجع B1**: PR `#310` (`B1_FINAL_SHA=PENDING`)
- **السيادة السياسية**: لا يجوز استبدال التخويل الصريح لأي بوابة بموافقة سابقة أو موافقة شاملة. كل بوابة تتطلب قرار مالك مستقل وموثق.

---

## 1. جدول البوابات الإنتاجية الـ 22 وحالات اتخاذ القرار

---

### 1. بوابات الدمج والمصدر ومرشح الإصدار (Gates 01 - 03)

#### GATE-01: Source Merges Gate (`GATE_OWNER_SOURCE_MERGES`)
- **CURRENT_STATUS**: `OPEN_PREPARED` (المصدر جاهز على PR #313 بدون دمج بـ main)
- **PREREQUISITE**: مرور كافة اختبارات CI على PR #313 (`bun test`, `tsc`, `build`, `diff --check`).
- **ACTION**: مراجعة شجرة المصدر المستقلة وتأكيد خلوها من أي تعارضات دمج مع `main`.
- **VERIFY**: `git merge-base main HEAD` يثبت عدم انحراف السلسلة.
- **STOP_CONDITION**: ظهور أي فشل في CI أو التعارضات المصدرية.
- **OWNER_DECISION_REQUIRED**: قرار مالك الكود المصشتق بالسماح بدمج المصدر (`OWNER_APPROVE_SOURCE_MERGE`).

#### GATE-02: Final RC Acceptance Gate (`GATE_OWNER_FINAL_RC_ACCEPTANCE`)
- **CURRENT_STATUS**: `PENDING_B1_SLOT` (RC313 مثبت كـ non-B1 RC، وفي انتظار تثبيت SHA البناء لـ B1 من PR #310)
- **PREREQUISITE**: إغلاق `LONGRUN-18` وتحديث `B1_FINAL_SHA` إلى قيمة حقيقية معتمدة.
- **ACTION**: توقيع وثيقة مرشح الإصدار النهائي الشامل (Final Integrated Release Candidate SHA).
- **VERIFY**: المطابقة الرقمية بين الـ SHA الموثق في التقرير والـ HEAD لفرع الإطلاق.
- **STOP_CONDITION**: بقاء `B1_FINAL_SHA=PENDING` أو وجود تعديلات غير موثقة على شجرة الإصدار.
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
- **ACTION**: تطبيق migrations الخاصة بمشاريع التخرج واحدة تلو الأخرى (`max_migrations_per_apply_session=1`).
- **VERIFY**: وجود الجداول والسياسات الخاصة بمشاريع التخرج في الكتالوج.
- **STOP_CONDITION**: خطأ تطبيق RLS أو فشل الفحص البعدي.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على تطبيق migrations مشاريع التخرج (`OWNER_APPROVE_GP_MIGRATIONS`).

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
- **ACTION**: تطبيق migration الهيكلية الأساسية لـ GA (`20260711000000` و `20260711020000`).
- **VERIFY**: وجود العمود `university_email` والجداول التأسيسية.
- **STOP_CONDITION**: فشل إضافة العمود أو تعارض المفاتيح.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على تطبيق أساسات شؤون الخريجين (`OWNER_APPROVE_GA_FOUNDATION`).

#### GATE-08: GA Completion Migrations Gate (`GATE_OWNER_GA_COMPLETION`)
- **CURRENT_STATUS**: `HOLD_PENDING_PREVIOUS_GATES`
- **PREREQUISITE**: نجاح GATE-07.
- **ACTION**: تطبيق migration تقييد تفعيل سير العمل للأدمن (`20260713010000`).
- **VERIFY**: مطابقة سياسة RLS على `student_request_workflows`.
- **STOP_CONDITION**: حظر الأدمن أو السماح لغير الأدمن بتفعيل سير العمل.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على اكتمال شؤون الخريجين (`OWNER_APPROVE_GA_COMPLETION`).

#### GATE-09: GA Authorization-04 Gate (`GATE_OWNER_GA_AUTH04`)
- **CURRENT_STATUS**: `HOLD_PENDING_PREVIOUS_GATES`
- **PREREQUISITE**: نجاح GATE-08 واجتياز PR #299 المدمج.
- **ACTION**: تطبيق حارس الصلاحيات والتفويض المباشر عبر RPC لشؤون الخريجين.
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
- **PREREQUISITE**: نجاح GATE-03 وتوفر التخويل لكل خطوة C0, C1, C2, C3, C4, C5, C6, C7, C8, C9 بشكل مفصل ومستقل.
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
- **CURRENT_STATUS**: `HOLD_PENDING_B1_SHA`
- **PREREQUISITE**: ثبوت `B1_FINAL_SHA` وتوفر بيانات الموظفين والموكلين المباشرين.
- **ACTION**: تهيئة وتعيين الأدوار التشغيلية للموظفين والمكلّفين بالمجالات والموعد المعتمد.
- **VERIFY**: مطابقة تعيينات `processing_unit` و `processing_role` دون إنشاء حسابات وهمية.
- **STOP_CONDITION**: غياب موظف مكلّف أو تعدد التعيينات المتضاربة.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على تهيئة المشغلين لـ B1 (`OWNER_APPROVE_B1_OPERATOR_PROVISIONING`).

#### GATE-15: B1 Fresh Production Baseline Gate (`GATE_OWNER_B1_FRESH_BASELINE`)
- **CURRENT_STATUS**: `HOLD_PENDING_B1_SHA`
- **PREREQUISITE**: نجاح GATE-14 وأخذ لقطة خط الأساس لقاعدة البيانات الإنتاجية.
- **ACTION**: تأكيد خط الأساس النظيف وتثبيت الحالات السابقة للطلبات الخمس.
- **VERIFY**: عدم وجود أي طلبات معلقة ببيانات غير صحيحة أو حالات غير معروفة.
- **STOP_CONDITION**: اكتشاف طلبات تاريخية مجهولة الهيكل.
- **OWNER_DECISION_REQUIRED**: اعتماد المالك لخط الأساس لـ B1 (`OWNER_APPROVE_B1_FRESH_BASELINE`).

#### GATE-16: B1 267 Matrix Execution Gate (`GATE_OWNER_B1_267_MATRIX_EXECUTION`)
- **CURRENT_STATUS**: `HOLD_PENDING_B1_SHA`
- **PREREQUISITE**: نجاح GATE-15 وتطبيق التسلسل الكامل لـ B1 manifest (seq 01 إلى seq 19/20).
- **ACTION**: تنفيذ مصفوفة التحقق الشاملة الـ 267 لاختبار شروط RLS و RPC والحدود لكل خدمة.
- **VERIFY**: اجتياز 267 فحص بنجاح 100% ودون أي خرق أمني.
- **STOP_CONDITION**: فشل فحص واحد من أصل 267 فحصاً.
- **OWNER_DECISION_REQUIRED**: اعتماد المالك لتنفيذ مصفوفة الـ 267 (`OWNER_APPROVE_B1_267_MATRIX_EXECUTION`).

#### GATE-17: B1 Cleanup Gate (`GATE_OWNER_B1_CLEANUP`)
- **CURRENT_STATUS**: `HOLD_NOT_RUN`
- **PREREQUISITE**: اجتياز مصفوفة 267 بنجاح.
- **ACTION**: إزالة أي مخلفات سابقة أو بيانات مؤقتة ناتجة عن التحقق بدون مساس بالسجلات التاريخية.
- **VERIFY**: الكتالوج نظيف تماماً وخالي من الجداول المؤقتة.
- **STOP_CONDITION**: حذف أو تعديل أي سجل في السجلات المحمية.
- **OWNER_DECISION_REQUIRED**: موافقة المالك على تنظيف البيئة التشغيلية (`OWNER_APPROVE_B1_CLEANUP`).

#### GATE-18: B1 Visibility Activation Gate (`GATE_OWNER_B1_VISIBILITY_ACTIVATION`)
- **CURRENT_STATUS**: `HOLD_INACTIVE`
- **PREREQUISITE**: نجاح GATE-14 حتى GATE-17.
- **ACTION**: تحويل علم `student_visible=true` للخدمات الخمس واحدة تلو الأخرى بالترتيب المعتمد:
  `enrollment_suspension` → `excused_absence` → `file_withdrawal` → `department_transfer` → `final_chance`.
- **VERIFY**: الخدمة المستهدفة فقط `student_visible=true` والخدمات الأخرى لم تتأثر.
- **STOP_CONDITION**: تفعيل خدمتين دفعة واحدة أو ظهور خدمة دون اكتمال بواباتها.
- **OWNER_DECISION_REQUIRED**: موافقة المالك الفردية على تفعيل رؤية كل خدمة من الخدمات الخمس (`OWNER_APPROVE_B1_SERVICE_VISIBILITY_X`).

---

### 6. بوابات النشر والاختبار النهائي والاعتماد (Gates 19 - 22)

#### GATE-19: Deployment Gate (`GATE_OWNER_DEPLOYMENT`)
- **CURRENT_STATUS**: `HOLD_DEPLOYMENT_NOT_AUTHORIZED`
- **PREREQUISITE**: نجاح بوابات قاعدة البيانات والترميز كاملة وتوقيع مرشح الإصدار النهائي.
- **ACTION**: تنفيذ عملية نشر بناء الإصدار (Build Bundle Deployment) على خوادم الإنتاج.
- **VERIFY**: اكتمال بناء الخادم واستجابة الأداة بـ HTTP 200 OK.
- **STOP_CONDITION**: أي خطأ في بناء البرمجيات أو فشل التشغيل.
- **OWNER_DECISION_REQUIRED**: قرار موافقة المالك الصريح على إجراء النشر (`OWNER_APPROVE_DEPLOYMENT`).

#### GATE-20: Publish Gate (`GATE_OWNER_PUBLISH`)
- **CURRENT_STATUS**: `HOLD_PUBLISH_NOT_AUTHORIZED`
- **PREREQUISITE**: نجاح GATE-19 وقراءة الـ `DEPLOYED_SHA` من البيئة الحية.
- **ACTION**: الإعلان الرسمي ونشر الأداة للمستخدمين على النطاق الإنتاجي.
- **VERIFY**: تطابق `DEPLOYED_SHA` المكتشف عبر القراءة الحية مع `RC313_SHA` (و SHA البناء النهائي الشامل).
- **STOP_CONDITION**: عدم تطابق الـ SHA المنشور مع الـ SHA المعتمد.
- **OWNER_DECISION_REQUIRED**: قرار موافقة المالك الصريح على النشر النهائي للمستخدمين (`OWNER_APPROVE_PUBLISH`).

#### GATE-21: Operational E2E Gate (`GATE_OWNER_OPERATIONAL_E2E`)
- **CURRENT_STATUS**: `HOLD_NOT_EXECUTED`
- **PREREQUISITE**: نجاح GATE-20 واكتمال النشر الحقيقي.
- **ACTION**: تشغيل حزمة الاختبارات الدخانية والتأكيدية طرف-لطرف (Student + Faculty + Admin Smoke) على البيئة الحية باستخام حسابات اختبارية مخصصة.
- **VERIFY**: اجتياز كافة المسارات وتأكيد عدم وجود خطأ 500 أو انحراف في الواجهة.
- **STOP_CONDITION**: فشل أي اختبار دخاني حقيقي.
- **OWNER_DECISION_REQUIRED**: موافقة المالك التشغيلي على نتائج اختبارات E2E الحية (`OWNER_APPROVE_OPERATIONAL_E2E`).

#### GATE-22: Final Acceptance & Handover Gate (`GATE_OWNER_FINAL_ACCEPTANCE`)
- **CURRENT_STATUS**: `HOLD_FINAL_ACCEPTANCE_PENDING`
- **PREREQUISITE**: نجاح GATE-01 إلى GATE-21 كاملة بدون استثناء وتواجد حزمة الأدلة الشاملة.
- **ACTION**: توقيع وثيقة التسليم التشغيلي والاعتماد النهائي للكلية وتداول النظام بصفة رسمية.
- **VERIFY**: كافة البوابات الـ 21 بحالة `PASS` متبوعة بالأدلة المرفقة.
- **STOP_CONDITION**: بقاء أي بوابة بحالة `HOLD` أو غياب وثيقة دليل واحدة.
- **OWNER_DECISION_REQUIRED**: القرار الختامي للمالك باكتفاء واعتماد الإطلاق الإنتاجي كاملاً (`OWNER_APPROVE_FINAL_ACCEPTANCE`).

---
