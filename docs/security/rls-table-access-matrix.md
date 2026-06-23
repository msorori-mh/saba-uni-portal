# RLS & Sensitive Table Access Matrix

**مصدر RLS:** `supabase/migrations` (~126 ملف، 400+ CREATE POLICY)  
**Bypass path:** `supabaseAdmin` (service role) في server functions — **لا يخضع لـ RLS**

---

## 1. ملخص RLS

| البند | الحالة |
|-------|--------|
| ENABLE ROW LEVEL SECURITY | ✅ عشرات الجداول (migrations متعددة) |
| Helper `has_role` / `has_any_role` | ✅ SECURITY DEFINER في migrations |
| Scoped audit_logs (RBAC-06) | ✅ `20260703120000_security_rbac_audit_logs_scope.sql` |
| HR people scope (RBAC-05) | ✅ `20260701120000`, `20260702120000` |
| Anon policies | ⚠️ موجودة على CMS + schedules + verify |

---

## 2. سياسات anon — تحتاج مراجعة

| الجدول/الدالة | Migration | الملاحظة |
|---------------|-----------|----------|
| `programs`, `faculty`, `news`, `events`, … | `20260531202904` | CMS عام — مقصود |
| `courses`, `study_plans`, `study_plan_courses` | `20260531231424` | active فقط |
| `course_offerings`, `course_sections` | `20260531232114` | status = active |
| **`class_schedule`** | `20260531232114` | **`USING (true)` — واسعة** |
| `buildings`, `rooms`, `time_slots` | `20260602165703` | anon SELECT |
| `verify_document(text)` | `20260601034915` | RPC عام — مقصود للتحقق |
| `check_and_record_rate_limit` | `20260611214335` | anon EXECUTE — الآن عبر server fn |
| `contact_messages` INSERT | `20260531202904` | نموذج اتصل بنا |

---

## 3. جداول حساسة — مصفوفة

| الجدول | نوع البيانات | الحساسية | قراءة متوقعة | كتابة متوقعة | RLS في migrations | supabaseAdmin bypass | مخاطر | اختبار لاحق |
|--------|--------------|----------|--------------|--------------|-------------------|---------------------|-------|-------------|
| `student_profiles` | PII طلاب | **حرجة** | student (own), admin roles, faculty scoped | registrar, student_affairs, admin | ✅ متعددة | ✅ server functions | IDOR by UUID | T-STU-01 |
| `student_grades` | درجات | **حرجة** | student own, faculty section, admin | faculty, registrar | ✅ | ✅ | grade tampering | T-GRD-01 |
| `student_enrollments` | تسجيل | **حرجة** | student, admin, faculty | registrar | ✅ | ✅ | cross-student | T-ENR-01 |
| `student_fees` | مالية | **حرجة** | student own, finance, admin | finance, admin | ✅ | ✅ | fee manipulation | T-FIN-01 |
| `student_requests` | طلبات + مرفقات | **حرجة** | student own, staff roles | student insert, staff workflow | ✅ | ✅ | attachment IDOR | T-REQ-01 |
| `official_documents` | وثائق رسمية | **حرجة** | admin, student own, verify RPC | registrar/admin issue | ✅ | ✅ | doc id tampering | T-DOC-01 |
| `faculty_profiles` | PII faculty | **عالية** | hr, admin, dean scoped | hr, admin | ✅ RBAC-05 | ✅ | HR scope bypass | T-HR-01 |
| `staff_profiles` | PII staff | **عالية** | hr scoped | hr, admin | ✅ dept scope | ✅ | dept scope | T-HR-02 |
| `audit_logs` | سجل تدقيق | **عالية** | admin full; dean/registrar/hr scoped | INSERT via RPC only | ✅ RBAC-06 | ✅ listAuditLogs | log injection | T-AUD-01 |
| `import_logs` | سجل استيراد | **عالية** | import panel roles | server insert | ✅ | ✅ | — | T-IMP-01 |
| `user_roles` | أدوار legacy | **حرجة** | admin; own read limited | admin RPC | ✅ system_admin RLS | ✅ | privilege escalation | T-ROLE-01 |
| `user_role_assignments` | أدوار catalog | **حرجة** | admin | admin | ✅ | ✅ | — | T-ROLE-02 |
| `class_schedule` | جداول | **عالية** | authenticated + **anon** | registrar/admin | ✅ + anon wide | ✅ RPC replace | info disclosure | T-SCH-01 |
| `course_offerings` | إسناد | **عالية** | admin, anon active | registrar | ✅ | ✅ | — | T-CO-01 |
| `course_sections` | مجموعات | **عالية** | admin, anon active | registrar | ✅ | ✅ | — | T-CS-01 |
| `payment_receipts` | إيصالات | **حرجة** | student own, finance | student upload | ✅ storage + table | ✅ signed URL | storage IDOR | T-RCPT-01 |
| `rate_limit_attempts` | أمن | **عالية** | none client | RPC only | ✅ locked client writes | ✅ | — | T-RL-01 |

---

## 4. RPCs SECURITY DEFINER (مراجعة static)

| RPC | الغرض | Grant anon? | ملاحظة |
|-----|-------|-------------|--------|
| `has_role` / `has_any_role` | RLS helper | ❌ | core |
| `log_audit` | audit insert | authenticated | لا client forge إذا RLS صحيح |
| `verify_document` | تحقق عام | ✅ | يجب ألا يُرجع PII |
| `replace_class_schedule_for_context` | schedule import | ❌ | service role / authenticated |
| `check_and_record_rate_limit` | rate limit | ✅ (legacy) | prefer server fn |
| `get_admin_progress_kpis` | KPI read | authenticated | read-only |
| student login provision RPCs | accounts | authenticated admin | high sensitivity |

---

## 5. Storage buckets (من الكود)

| Bucket | استخدام | الوصول | ملاحظة |
|--------|---------|--------|--------|
| `student-request-attachments` | مرفقات طلبات | signed URL server fn | ⚠️ student portal client signedUrl |
| `payment-receipts` | إيصالات | signed URL | student upload client |
| `official-documents` | وثائق | server/admin | hardening report 09 |
| `faculty-images`, `news-images`, … | CMS | public/admin upload | admin-storage.functions |
| `research-pdfs` | أبحاث | public read | |

---

## 6. جداols حساسة — RLS غير واضح في grep سريع

> **ملاحظة:** معظم جداols `public` لها RLS من migrations مبكرة. أي جدول جديد بدون migration review = خطر.

| الجدول | الحالة |
|--------|--------|
| `pilot_*` | RLS في migrations pilot — admin/server |
| `automation_settings` | admin/registrar read |
| `notifications` | user-scoped |

---

## 7. توصيات RLS (لا تنفيذ في هذه المرحلة)

1. **تضييق `sch_select_anon`** على `class_schedule` — إزالة anon أو تقييد بـ public view.
2. مراجعة **GRANT SELECT TO anon** على `course_sections` / `course_offerings` — هل مطلوب للموقع العام؟
3. Automated test: authenticated user بدون role → SELECT على كل جدول حساس → expect 0 rows.
4. Diff test: server fn result vs JWT client result for same user (detect RLS drift).
