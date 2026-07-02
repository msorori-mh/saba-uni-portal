# TARGETED-RLS-STORAGE-VERIFICATION-01-REPORT

**النطاق:** جداول ومسارات حساسة (fees, payments, official_documents, notifications, requests, attachments, receipts + Storage).
**النوع:** تحقق قراءة فقط. لا تعديل DB / لا migration / لا deploy.
**التاريخ:** 2026-07-02

---

## 1. حالة RLS على الجداول

| الجدول | RLS enabled |
|---|---|
| student_fees | ✅ نعم |
| student_payments | ✅ نعم |
| official_documents | ✅ نعم |
| notifications | ✅ نعم |
| student_requests | ✅ نعم |
| student_request_attachments | ✅ نعم |
| payment_receipts | ✅ نعم |

لا يوجد أي جدول بدون RLS. لا توجد أي policy تحتوي `USING (true)` على أي من الجداول المذكورة.

---

## 2. student_fees

- **Policies:** `sf_select`, `sf_insert`, `sf_update`, `sf_delete` — كلها على دور `authenticated`.
- **Ownership (SELECT):** `EXISTS (student_profiles sp WHERE sp.id = student_fees.student_profile_id AND sp.user_id = auth.uid())` — ✅ مقيّد بالمالك.
- **Admin roles:** `has_any_role(admin, system_admin, registrar, student_affairs, dean)` للقراءة؛ الكتابة/الحذف مقيّدة أضيق (`admin, system_admin` للحذف).
- **Cross-student risk:** لا — الطالب لا يرى إلا رسومه.
- **الحكم:** **PASS**.

## 3. student_payments

- **Policies:** `sp_select`, `sp_insert`, `sp_update`, `sp_delete`.
- **Ownership (SELECT):** JOIN عبر `student_fees` → `student_profiles.user_id = auth.uid()` — ✅ صحيح.
- **Admin roles:** كتابة/تحديث مقيدة بـ (admin, system_admin, registrar, student_affairs). الحذف: admin/system_admin فقط.
- **Cross-student risk:** لا.
- **الحكم:** **PASS**.

## 4. official_documents

- **Policies:** `Students view own documents` (SELECT), `Staff issue documents` (INSERT), `Staff update documents` (UPDATE). لا يوجد policy DELETE — أي حذف مباشر من العميل مرفوض.
- **Ownership (SELECT):** عبر `student_profiles.user_id = auth.uid()`.
- **Admin roles:** admin/system_admin/registrar/student_affairs/dean.
- **Cross-student risk:** لا.
- **ملاحظة:** لا يوجد bucket خاص بالوثائق الرسمية — تُقدَّم عبر مسار `verify-document` وRPC `verify_document` (لا ملفات في storage تحتاج فحص).
- **الحكم:** **PASS**.

## 5. notifications

- **Policies:** `notif_select_own` (SELECT), `notif_update_own_read` (UPDATE).
- **Ownership:** `user_id = auth.uid()` مباشرة + admin/system_admin للقراءة الشاملة.
- **UPDATE:** مقيد بـ `user_id = auth.uid()` مع WITH CHECK مطابق (يمنع الطالب من إعادة إسناد الإشعار لغيره).
- **INSERT/DELETE:** لا policies للعميل → الإدراج يتم عبر server functions/service role فقط. ✅
- **Cross-student risk:** لا.
- **الحكم:** **PASS**.

## 6. student_requests

- **Policies (7):** `sr_select_self`, `sr_select_priv`, `sr_select_faculty`, `sr_select_dept_head`, `sr_insert_self`, `sr_insert_priv`, `sr_delete_self`, `sr_delete_admin` (+ UPDATE policies).
- **Ownership (SELECT):** الطالب يرى طلباته فقط عبر `student_profiles.user_id = auth.uid()`. الأدوار الأكاديمية (dept_head/faculty) عبر دوال `SECURITY DEFINER` مركّبة على السياق.
- **INSERT self:** الحالة محصورة في `draft`/`submitted` فقط — يمنع الطالب من إنشاء طلب بحالة "معتمد" مسبقاً.
- **DELETE self:** فقط عندما `status = 'draft'`. الحذف الإداري: admin/system_admin.
- **Cross-student risk:** لا — تغيير `id` في الطلب لن يمر لأن الشرط يتحقق من ملكية `student_profile_id`.
- **الحكم:** **PASS**.

## 7. student_request_attachments

- **Policies:** `sra_select`, `sra_insert`, `sra_delete`.
- **Ownership:** عبر `is_owner_of_request(auth.uid(), request_id)` (SECURITY DEFINER).
- **INSERT:** يشترط الملكية + `uploaded_by = auth.uid()`.
- **DELETE:** فقط عندما `student_requests.status = 'draft'` (أو admin).
- **Cross-student risk:** لا — الاستعلام عن `request_id` تابع لطالب آخر يُرفض.
- **الحكم:** **PASS**.

## 8. payment_receipts

- **Policies:** `pr_select`, `pr_insert_student`, `pr_update_admin`, `pr_delete_admin`.
- **Ownership (SELECT/INSERT):** `student_profiles.user_id = auth.uid()`.
- **UPDATE/DELETE:** admin/system_admin (+ registrar/student_affairs للتحديث).
- **Cross-student risk:** لا.
- **الحكم:** **PASS**.

---

## 9. Storage Buckets

| Bucket | public | الحكم |
|---|---|---|
| `payment-receipts` | ❌ private | **PASS** |
| `student-request-attachments` | ❌ private | **PASS** |
| `research-pdfs` | ✅ public | مقصود (نشر أبحاث) |
| `faculty-images`, `news-images`, `events-images`, `department-images` | ✅ public | مقصود (CMS عام) |
| official documents | لا bucket — تُقدَّم عبر RPC `verify_document` | **PASS** |

### Storage policies (الحساسة)

- **`payment-receipts`:**
  - `payment_receipts_insert_own`: `auth.uid()::text = storage.foldername(name)[1]` — الطالب يرفع في مجلد باسم uid فقط.
  - `payment_receipts_select_own`: نفس القيد + admin/registrar/student_affairs/dean.
  - `payment_receipts_update_own` / `payment_receipts_delete_admin`: مقيدة بالمالك أو admin.
- **`student-request-attachments`:**
  - `sra_storage_delete_self`: `auth.uid()::text = storage.foldername(name)[1]`.
  - `sra_storage_delete_admin`: admin/system_admin.
  - (INSERT/SELECT عبر server function باستخدام `supabaseAdmin` مع فحص ملكية داخل الدالة).

### Signed URLs

| مسار الاستخدام | TTL | مصدر التوقيع |
|---|---|---|
| `student-affairs.functions.ts` (server) | **300s** | `supabaseAdmin` + فحص ownership |
| `StudentRequestsSection.tsx` (client) | **300s** | supabase client (يخضع لـ RLS storage.objects) |
| `StudentFinanceSection.tsx` (client) | **300s** (5×60) | supabase client (يخضع لـ RLS) |

كل الوصول للمرفقات والإيصالات يمر بروابط موقعة قصيرة الأمد (≤5 دقائق). لا روابط عامة دائمة على الـ buckets الخاصة.

---

## 10. إجابات مباشرة على الأسئلة

1. **RLS مفعّل على كل جدول حساس؟** ✅ نعم على جميع الـ 7 جداول.
2. **policy فيها `USING (true)` أو `auth.role() = 'authenticated'` واسعة؟** ❌ لا — لا شيء من هذا على الجداول الحساسة. (ملاحظة سابقة: `class_schedule` تحتوي anon SELECT مقصود للعرض العام — خارج نطاق هذا التقرير).
3. **SELECT للطالب مقيد بالملكية؟** ✅ نعم عبر `student_profiles.user_id = auth.uid()` أو دوال SECURITY DEFINER لملكية الطلب.
4. **UPDATE/DELETE مقيد بالمالك أو الدور الإداري؟** ✅ نعم — لا يوجد UPDATE/DELETE عام للـ authenticated بدون فحص دور أو ملكية.
5. **الإدارة تصل عبر أدوار محددة فقط؟** ✅ نعم عبر `has_any_role(...)` بدون `USING (true)`.
6. **مرفقات الطلاب والوثائق في bucket خاص public=false؟** ✅ نعم — `payment-receipts` و `student-request-attachments` كلاهما `public=false`.
7. **الوصول عبر signed URLs قصيرة؟** ✅ نعم — 60–300 ثانية.
8. **هل يستطيع طالب قراءة/تعديل طلب طالب آخر بتغيير id؟** ❌ لا — كل السياسات تفرض ملكية عبر `student_profile_id`/`is_owner_of_request` قبل أي عملية.

---

## القرار النهائي

**PASS**

جميع الجداول والـ buckets الحساسة في النطاق تمر بمصفوفة الحماية بنجاح: RLS مفعّل، الملكية مفروضة عبر `auth.uid()`، الأدوار الإدارية مقيّدة بـ `has_any_role`، الـ buckets الحساسة خاصة، والوصول للملفات عبر signed URLs قصيرة الأمد.

لا توجد إصلاحات مطلوبة قبل التشغيل التجريبي.
