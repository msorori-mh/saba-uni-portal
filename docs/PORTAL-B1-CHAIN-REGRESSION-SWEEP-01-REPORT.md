# PORTAL-B1-CHAIN-REGRESSION-SWEEP-01 — REPORT

**التاريخ:** 2026-07-23 · **النطاق:** مسح وقائي read-only لكل مسودات `docs/migration-drafts/` المرتبطة بسلسلة B1 ضد مخاطر انحدار `enrollment_certificate` (الخدمة الحية الوحيدة) والسجلات المحمية. لا SQL إنتاجي، لا تعديل ملفات.
**خط الأساس:** `origin/main = e32dbb4` — M1 (`20260723061809`) وM2 (`20260723070041` + `20260723070217`) مطبقتان ومطابقتان لمسودتي الترتيب 1 و2 من runbook-07.

## 1. النتيجة التنفيذية

| التصنيف | المسودات |
|---|---|
| ✅ آمنة على enrollment_certificate | runbook الترتيب 1 (مطبقة)، 2 (مطبقة)، 3، 4، 5، 8، 9، 10، 11، 12، 13، 14، 15، 16، 17، 18 + `B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02` |
| ⛔ RISK — تكسر الخدمة الحية | `B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01` (X1)، `B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01` (X3)، `STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01` (الترتيب 7)، `EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01` (الترتيب 6) |
| 🚫 مستبعدة أصلاً | `ENROLLMENT-CERTIFICATE-COMPLETION-NOTIFICATION-CORRECTION` (never-apply بقرار runbook-07:17-18 — تبقى مستبعدة) |

لا توجد أي مسودة تمس السجلات المحمية أو الطلبات القديمة: صفر DML على صفوف `student_requests`/خطواتها، ولا إشارة لأي من `SR-20260713-2DE64041` / `SR-20260715-FEDCB3E1` / `SR-20260716-26BAD4C8` / `USR-2026-000001` / `USR-2026-000002`، ولا تغيير `student_visible` في أي مسودة.

## 2. المخاطر مرتبة بالخطورة

### R-1 (CRITICAL) — `B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01.sql:29-84`
تعيد استبدال `can_current_user_act_on_step` بتعريف صارم موحد لكل الأنواع: تشترط `status='active'` (تقتل pending وتعليق-على-مكتمل)، وتطبق `workflow_runtime_predecessors_satisfied` على EC (مفرداته `payment_required`/`fee_not_required`/`assess_fee` غير معروفة للحارس)، وتشترط `p_action = action_type` (الواجهة ترسل `approve` لخطوة `review` ← رفض فوري)، وتلغي مساري `reject`/`return`/`comment` الحاليين. التعليق في `:54-58` يدّعي الحفاظ على غير-B1 لكن لا شيء في الكود يقيّد سوى فحص الربط (`:59-62`). **تكسر `act_on_student_request_step` و`issue_enrollment_certificate_from_workflow_step` (`20260714234724:292`) و`archive_…` (`:402`).** المعالجة: تحتاج نفس تقييد فرع B1 المطبق في مسودة -02 قبل دورها في السلسلة.

### R-2 (CRITICAL) — `STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql:209`
`REVOKE ALL ON FUNCTION public.submit_student_request(uuid) FROM PUBLIC,anon,authenticated`. مسار تقديم EC الحي الوحيد يستدعي هذا الـRPC بدور `authenticated` (`src/lib/student-request-rpc.ts:140` عبر `student-affairs.functions.ts:374,555`)؛ وخطأ 42501 الناتج لا يُصنف «خدمة قيد التحديث» (`isStudentRequestCoreRpcUnavailable` يلتقط 42883 فقط) فلا يعمل أي fallback، والغلاف البديل `submit_student_request_with_secure_attachments` غير مشار إليه في `src/` إطلاقاً. **تقديم طلبات إثبات القيد يتوقف لحظة التطبيق.** المعالجة: إما تأجيل الـREVOKE حتى ربط الواجهة بالغلاف الجديد، أو استثناء `authenticated` من السحب، أو تعديل الغلاف ليصبح المسار المستخدم فعلاً — قرار مالك.

### R-3 (HIGH) — `EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01.sql:7-15`
القيد البديل `request_type_workflow_steps_action_type_chk` **يُسقط `'assess_fee'`** الموجود في القيد الحالي (`20260711195110:8-13`) والذي تتطلبه ماكينة رسوم EC (`20260711195110:454`, `20260711040000:863`) ويحمله إعداد workflow v2 الإنتاجي. `ADD CONSTRAINT ... VALIDATE` سيفشل عند التطبيق إن وُجد صف `assess_fee`، وبكل الأحوال يحذف مفردة تعتمدها EC. القيود الثلاثة الأخرى في الملف supersets آمنة. المعالجة: إضافة `'assess_fee'` للقيد البديل (يغيّر SHA — إعادة تثبيت).

### R-4 (معلوماتية — محسومة) — `B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01.sql:125-165`
نفس صنف الانحدار (صارم موحد)؛ متجاوَزة بـ -02. **يجب ضمان عدم ترقيتها أبداً في خانة M3.**

### R-5 (تخطيطي) — فجوة ترتيب السلسلة
`B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01.sql:12-13` يشترط مسبقاً وجود `workflow_runtime_predecessors_satisfied(uuid)` (لا تُنشئها إلا -01/-02) و`is_b1_stored_request_type(text)` (تُنشئها مسودة الترتيب 4)، وrunbook-07 **لا يتضمن صفاً** لـ -01/-02 — أي أن مسودة التقوية تفشل preflight وفق الـrunbook وحده، وإذا أُدرجت -02 قبلها دون تعديلها أعادت الانحدار الذي حلّته -02. السلسلة المحدثة (20 migration) يجب أن تُدوَّن صراحة: …M3=-02 → الترتيب 3 → 4 → 5 → 6*(بعد إصلاح R-3) → 7*(بعد إصلاح R-2) → … → مسودة التقوية*(بعد إصلاح R-1).

## 3. ملاحظات ثانوية

- الترتيب 4 (`REQUEST-B1-ATOMIC-SUBMIT-ACTION-04`): محفزاته تطلق أيضاً على الأسماء القديمة (`absence_excuse`/`transfer`/`extra_chance`) — تغيير سلوك للأسماء القديمة لكنها غير حية؛ مقبول وموثق.
- M2 (`20260723070041`) يحوي تعليقاً شارداً («I cannot include the full 574-line file inline» + `SELECT 1`) — غير ضار (idempotent) لكنه يستحق سطراً في سجل التسليم.
- `DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02` (خارج runbook-07): فيها DML على `request_processing_assignments` و`faculty_profiles` — إن سُحبت للسلسلة تحتاج مراجعة أثر EC مستقلة.

## 4. القرار

**HOLD_CHAIN_THREE_UNRESOLVED_REGRESSION_RISKS** — R-1/R-2/R-3 تحتاج قرارات مالك (تعديل مسودات مع إعادة تثبيت SHA، أو إعادة ترتيب موثق). الترتيب 3 و4 و5 جاهزة من حيث أثر EC وتنتظر فقط فك حجب خانة M3 (بانتظار اعتماد -02 في `docs/PORTAL-B1-THIRD-MIGRATION-BLOCKER-ONLY-PREFLIGHT-01-REPORT.md` §8).

## 5. قرار المالك (2026-07-23)

- **M3 = -02:** اعتمد المالك `B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02` بديلاً دائماً عن `-01` في خانة M3 (إدراج بعد الترتيب 2، بلا إعادة ترتيب)، وحُظرت `-01` من الإنتاج نهائياً (NEVER-PROMOTE — انحدار enrollment_certificate).
- **R-1/R-2/R-3 مغلقة في PR مصدري واحد** بتعديل المسودات في مكانها مع إعادة تثبيت SHA-256/git-blob:
  - **R-1:** أُعيدت بنية `can_current_user_act_on_step` في `B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01` لتقييد الفحوص الصارمة بفرع B1 فقط على نهج -02، مع الحفاظ على مسار غير-B1 المطبق.
  - **R-2:** أُزيل REVOKE دور `authenticated` عن `submit_student_request(uuid)` من مسودة المرفقات؛ **تأجل السحب إلى مرحلة cutover منفصلة** بعد ترحيل كل المنادين وإثباته باختبارات تفويض.
  - **R-3:** أُعيدت `'assess_fee'` إلى القيد البديل في `EXTERNAL-UNIVERSITY-PAYMENT-CONFIRMATION-01` (superset للقيد المطبق).
- التثبيتات الجديدة مدوَّنة في runbook-07 (صف M3 + الترتيبين 6/7) و`docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json` (المدخل 3 = -02، `-01` في قائمة never_apply، متابعة السحب المؤجل في follow_ups).
