# SECURITY-FULL-ASSURANCE-02 — Staging Security Test Harness

**Branch target:** `security/full-assurance-02-staging-tests`  
**Predecessor:** [SECURITY-FULL-ASSURANCE-01](./SECURITY-FULL-ASSURANCE-01.md)  
**Implementation:** `tests/security/`

---

## 1. الهدف

توفير حزمة اختبارات أمنية **آلية / شبه آلية** تعمل على **staging** أو حسابات اختبار، وتغطي النتائج العملية من ASSURANCE-01 (T1–T5) دون:

- تعديل production
- migrations أو كتابة على قاعدة البيانات (المرحلة الحالية **read-only**)
- brute force أو fuzzing أو مسح عنيف
- تخزين secrets في المستودع

---

## 2. طريقة التشغيل على staging

```bash
# من جذر المشروع
cp tests/security/security-test.config.example.env tests/security/.env.local
# املأ القيم محلياً — لا ترفع الملف

export SEC_TEST_ENV_FILE=tests/security/.env.local
bun run security:test
```

**بدون env:** يفشل فوراً برسالة `SEC_TEST_TARGET_URL is required` ولا يتصل بأي بيئة.

**حماية production:** إذا احتوى `SEC_TEST_TARGET_URL` أو `SEC_TEST_SUPABASE_URL` على `quboolye.com`، يتوقف التشغيل ما لم يُضبط `SEC_TEST_ALLOW_PRODUCTION_READONLY=1` (غير موصى به).

---

## 3. المتغيرات المطلوبة

### إلزامية

| المتغير | الوصف |
|---------|--------|
| `SEC_TEST_TARGET_URL` | عنوان تطبيق staging |
| `SEC_TEST_SUPABASE_URL` | URL مشروع Supabase (staging) |
| `SEC_TEST_SUPABASE_ANON_KEY` | مفتاح anon فقط — **ليس** service_role |

### حسابات الاختبار (حسب Suite)

| المتغير | Suite |
|---------|-------|
| `SEC_TEST_STUDENT_A_*`, `SEC_TEST_STUDENT_B_ID` | T1 |
| `SEC_TEST_DOCUMENT_B_ID` | T1 (وثائق) |
| `SEC_TEST_ADMIN_*`, `SEC_TEST_REGISTRAR_*`, … | T2, T3, T5 |
| `SEC_TEST_FINANCE_*` | T3 |
| `SEC_TEST_VALID_VERIFY_CODE`, `SEC_TEST_FAKE_VERIFY_CODE` | T4 |

### اختيارية — Server Function IDs

معرفات TanStack Start تتغير **per build**. انسخها من DevTools (`POST /_serverFn/<hash>`) على **نفس commit/build** في staging:

- `SEC_TEST_FN_LIST_AUDIT_LOGS`
- `SEC_TEST_FN_VALIDATE_BULK_IMPORT_PREVIEW`
- `SEC_TEST_FN_GET_STUDENT_PROGRESS`
- … (انظر `security-test.config.example.env`)

بدونها: اختبارات الـ server fn تُسجَّل **SKIP**؛ تبقى probes عبر Supabase RLS/RPC.

---

## 4. الاختبارات T1–T5

### T1 — Student IDOR

- طالب A لا يقرأ transcript / profile / official_document لطالب B (RLS)
- UUID swap على `getStudentProgress` لا يمنح وصولاً (إن وُجد fn id)
- مرفقات الطلبات: طالب لا يحصل على signed URL

### T2 — Server Functions (Wrong Role / No Token)

- بدون Bearer → رفض (401/403 أو رسالة Unauthorized)
- student / faculty / staff / dean / registrar على endpoints حساسة → رفض
- admin: `getAdminSession` read-only probe

### T3 — Registrar vs Finance Separation

- registrar: `validateBulkImportPreview` لـ `student_fees` → مرفوض
- registrar: preview `students` → مسموح (validation فقط)
- finance_officer: preview `student_fees` → مسموح (validation)
- `runBulkImport` + `dryRun: true` لـ registrar + fees → مرفوض (لا import فعلي)

### T4 — Anonymous Surface

- `verify_document` + fake code → لا PII
- code اختباري صالح (إن وُجد) → حقول minimal فقط
- `class_schedule` anon → **MANUAL** لمراجعة سياسة الخصوصية

### T5 — Audit Log Scope (RBAC-06)

- RLS: student/staff/faculty → لا صفوف audit محظورة
- hr / dean / registrar → لا entity types خارج النطاق (إن وُجدت بيانات)
- admin → SELECT مسموح
- `listAuditLogs` server fn → admin فقط

---

## 5. ما لا تغطيه هذه المرحلة

- UI Playwright / مسارات `/admin/*` بالكامل
- Schedule import preview (ADM-002 batch-5)
- Storage signed URL expiry، XSS في imports
- اختبار load / rate-limit abuse
- تنفيذ import أو cleanup أو أي كتابة DB
- اختبار على `quboolye.com` افتراضياً

---

## 6. تفسير النتائج

| الحالة | المعنى |
|--------|--------|
| **PASS** | السلوك المتوقع |
| **FAIL** | ثغرة محتملة — يتطلب متابعة |
| **SKIP** | نقص إعداد (حساب، fn id، بيانات staging) |
| **MANUAL** | يحتاج مراجعة بشرية أو بيانات staging غير كافية |

**Exit codes:** `0` = لا FAIL؛ `1` = خطأ إعداد؛ `2` = وجود FAIL واحد على الأقل.

---

## 7. تحذير production

**لا تشغّل** الحزمة على `quboolye.com` أو production Supabase في التطوير الاعتيادي.  
الحارس مدمج في `tests/security/config.ts`.

---

## 8. مراجع

- [security-test-plan.md](./security-test-plan.md)
- [server-functions-authz-audit.md](./server-functions-authz-audit.md)
- [rls-table-access-matrix.md](./rls-table-access-matrix.md)
- `tests/security/README.md`
