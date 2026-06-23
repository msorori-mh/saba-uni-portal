# SECURITY-FULL-ASSURANCE-03 — Prepare Staging Test Environment

**Branch:** `security/full-assurance-03-staging-setup`  
**Predecessor:** [SECURITY-FULL-ASSURANCE-02](./SECURITY-FULL-ASSURANCE-02.md)  
**Scripts:** `tests/security/setup-staging-test-accounts.ts`, `tests/security/security-test-runner.ts`

---

## 1. الهدف

تجهيز **بيئة staging** فقط لتشغيل حزمة الاختبارات الأمنية (T1–T5):

- حسابات اختبار موسومة `SECURITY_TEST_ONLY`
- بيانات اختبار محدودة (طالبان، وثيقتان)
- ملف `tests/security/.env.local` محلي **غير مرفوع**
- تقرير PASS/FAIL/SKIP/MANUAL من `bun run security:test`

---

## 2. تحذير production

**ممنوع** استخدام:

- `quboolye.com`
- Supabase production
- بيانات حقيقية أو طلب ندى

السكربتات ترفض `quboolye.com` في أي URL.  
الإعداد يتطلب **`SEC_SETUP_ALLOW_STAGING_WRITE=true`** صراحةً.

---

## 3. طريقة إعداد staging

### 3.1 نسخ ملف الإعداد

```bash
cp tests/security/staging-setup.example.env tests/security/.env.setup.local
```

املأ **محلياً فقط**:

| المتغير | الوصف |
|---------|--------|
| `SEC_SETUP_ALLOW_STAGING_WRITE` | `true` لتفعيل الكتابة |
| `SEC_SETUP_SUPABASE_URL` | URL مشروع staging |
| `SEC_SETUP_SUPABASE_SERVICE_ROLE_KEY` | service role (محلي فقط) |
| `SEC_SETUP_SUPABASE_ANON_KEY` | anon key |
| `SEC_SETUP_TARGET_URL` | عنوان تطبيق staging |
| `SEC_TEST_PASSWORD` | كلمة مرور مشتركة للحسابات (≥12 حرف) |

### 3.2 تشغيل setup

```bash
export SEC_SETUP_ENV_FILE=tests/security/.env.setup.local
bun run security:setup-staging
```

**بدون `SEC_SETUP_ALLOW_STAGING_WRITE=true`:** يفشل فوراً ولا يكتب.

**عند النجاح:** يُنشئ `tests/security/.env.local` (gitignored) لاستخدامه مع `security:test`.

---

## 4. الحسابات التي يجهّزها السكربت تلقائياً

| الحساب | البريد الافتراضي | آلية |
|--------|------------------|------|
| admin | `sec-admin@test.local` | auth + `user_roles.admin` |
| system_admin | `sec-system-admin@test.local` | auth + `user_roles.system_admin` |
| registrar | `sec-registrar@test.local` | staff profile + `registrar` |
| student_affairs | `sec-student-affairs@test.local` | staff profile + `student_affairs` |
| dean | `sec-dean@test.local` | staff profile + `dean` |
| vice_dean | `sec-vice-dean@test.local` | `user_role_assignments.vice_dean` |
| department_head | `sec-department-head@test.local` | faculty profile + `department_head` |
| hr_officer | `sec-hr@test.local` | staff profile + `hr_officer` |
| finance_officer | `sec-finance@test.local` | staff profile + `finance_officer` |
| faculty | `sec-faculty@test.local` | faculty profile + `faculty_member` |
| staff (generic) | `sec-staff@test.local` | staff profile **بدون** أدوار admin |
| student A | `sec-student-a@test.local` | profile `SEC-TEST-A` |
| student B | `sec-student-b@test.local` | profile `SEC-TEST-B` |

كل الحسابات idempotent: إن وُجدت تُحدَّث كلمة المرور ولا تُكرَّر.

---

## 5. البيانات الاختبارية

| البيان | المعرف / الوصف |
|--------|----------------|
| طالب A | `academic_number=SEC-TEST-A` |
| طالب B | `academic_number=SEC-TEST-B` |
| وثيقة A | `SEC-DOC-A-001`, verify `SECVERA0001` |
| وثيقة B | `SEC-DOC-B-001`, verify `SECVERB0001` |
| metadata | `{ security_test_only: true, marker: SECURITY_TEST_ONLY }` |

---

## 6. ما بقي MANUAL

| البند | السبب |
|-------|--------|
| `SEC_TEST_FN_*` | معرفات TanStack تتغير per build — انسخ من DevTools |
| `SEC_TEST_ATTACHMENT_PATH_B` | يتطلب رفع مرفق اختبار في storage |
| vice_dean staff profile | دور catalog فقط؛ البوابة الإدارية تعمل عبر assignments |
| مراجعة `class_schedule` anon | T4 = MANUAL عند وجود بيانات |
| audit entity probes | T5 = MANUAL إذا لا صفوف audit من الأنواع المحظورة |

---

## 7. تشغيل الاختبارات

```bash
export SEC_TEST_ENV_FILE=tests/security/.env.local
bun run security:test
```

**Exit codes:** `0` = لا FAIL؛ `1` = env ناقص؛ `2` = FAIL واحد على الأقل.

---

## 8. نتائج آخر تشغيل

| التشغيل | البيئة | النتيجة |
|---------|--------|---------|
| `bun run security:test` (بدون env) | محلي | **آمن** — `SEC_TEST_TARGET_URL is required` |
| `bun run security:setup-staging` (بدون env file) | محلي | **آمن** — رسالة ملف الإعداد مفقود |
| staging كامل | يتطلب `.env.setup.local` على جهاز المشغّل | **لم يُنفَّذ في CI** — نفّذ محلياً بعد تعبئة staging |

> بعد إعداد staging محلياً، سجّل PASS/FAIL/SKIP/MANUAL من مخرجات `security:test` في PR أو تذكرة التشغيل.

---

## 9. ملفات Git الآمنة

| ملف | في Git |
|-----|--------|
| `setup-staging-test-accounts.ts` | ✅ |
| `staging-setup.example.env` | ✅ |
| `.env.setup.local` | ❌ |
| `.env.local` | ❌ |

---

## 10. مراجع

- [tests/security/README.md](../../tests/security/README.md)
- [SECURITY-FULL-ASSURANCE-02.md](./SECURITY-FULL-ASSURANCE-02.md)
