# ORG-STRUCTURE-INTEGRATION-01 — تقرير التنفيذ

## الجداول المنشأة
- `public.organizational_positions` — المناصب التنظيمية الرسمية (code, name_ar, name_en, parent_code, unit_type, is_active, sort_order, notes).
- `public.position_assignments` — تعيين المستخدمين للمناصب مع فترة (assigned_from / assigned_to) وقيد فريد جزئي يمنع شاغلين نشطين لنفس المنصب.
- `public.position_role_mapping` — ربط المناصب بالأدوار في `roles_catalog` (UNIQUE position_id+role_code).

## سياسات RLS
- **القراءة**: `system_admin`, `admin`, `dean` فقط.
- **الإنشاء / التعديل / الحذف**: `system_admin`, `admin` فقط.
- لا توجد سياسات `anon` أو `public`.
- جميع الـ GRANTs محصورة بـ `authenticated` و `service_role`.

## التدقيق (Audit)
أُضيفت ثلاث Triggers تكتب في `audit_logs` عند:
- إنشاء/تعديل/حذف منصب → `org_position_created/updated/deleted`.
- تعيين/تحديث/إنهاء شاغل → `position_assigned / position_assignment_updated / position_assignment_ended`.
- إضافة/تفعيل/تعطيل/حذف ربط دور → `position_role_mapping_added / enabled / disabled / removed`.

## المناصب التي تم Seed لها (19)
| كود | الاسم |
|---|---|
| college_council | مجلس الكلية |
| dean | عميد الكلية |
| vice_dean_academic | نائب العميد للشؤون الأكاديمية والدراسات العليا |
| vice_dean_students | نائب العميد لشؤون الطلاب |
| college_secretary | أمين الكلية |
| dean_office_manager | إدارة مكتب العميد |
| curriculum_unit | وحدة الخطط والمناهج |
| quality_unit | وحدة الجودة |
| academic_departments | الأقسام العلمية |
| registrar_department | إدارة القبول والتسجيل |
| exams_department | إدارة الاختبارات |
| student_activities_department | إدارة الأنشطة ورعاية الشباب |
| services_maintenance_department | إدارة الخدمات والصيانة |
| administrative_affairs_department | إدارة الشؤون الإدارية |
| financial_affairs_equipment_department | إدارة الشؤون المالية والتجهيزات |
| college_administration_department | إدارة الكلية |
| scientific_research_department | إدارة البحث العلمي |
| faculty_affairs_graduate_studies_department | إدارة الشؤون الأكاديمية وشؤون أعضاء هيئة التدريس |
| graduate_studies_department | إدارة الدراسات العليا |

## المناصب المرتبطة بأدوار تشغيلية (Mapping)
| المنصب | الدور في roles_catalog |
|---|---|
| dean | dean |
| vice_dean_academic | vice_dean |
| vice_dean_students | vice_dean + student_affairs_director |
| registrar_department | registrar_director |
| exams_department | registrar_officer |
| financial_affairs_equipment_department | finance_officer |
| faculty_affairs_graduate_studies_department | academic_affairs_director |
| graduate_studies_department | registrar_director |
| quality_unit | quality_officer |

> ملاحظة الاستبدالات: لم يكن هناك كود `student_affairs` / `registrar` / `viewer` في `roles_catalog`، فاستُخدم أقرب كود مكافئ موجود (مثل `student_affairs_director`, `registrar_director/officer`, `quality_officer`).

## مناصب تنظيمية فقط — بدون صلاحيات
- college_council
- college_secretary
- dean_office_manager
- curriculum_unit
- academic_departments
- student_activities_department
- services_maintenance_department
- administrative_affairs_department
- college_administration_department
- scientific_research_department

## الملفات المعدّلة / المنشأة
- `supabase/migrations/*_org_structure.sql` (Migration جديد)
- `src/lib/org-structure.functions.ts` (Server Functions: قراءة الهيكل، تعيين، إنهاء)
- `src/routes/admin/organizational-structure.tsx` (الصفحة الإدارية)
- `src/components/admin/AdminShell.tsx` (إضافة رابط القائمة تحت "النظام والرقابة")

## قيود وملاحظات
- المنصب لا يمنح صلاحية بشكل مباشر؛ المسار الرسمي:
  **Position → position_role_mapping → roles_catalog → user_roles (Permission)**.
- لم يُعدَّل `roles_catalog` ولم يُعدَّل `user_role_assignments`.
- الصفحة الإدارية لا تظهر إلا داخل قسم الإدارة (`/admin`) المحمي بـ `beforeLoad` يستلزم دور `admin` أو `system_admin`.
- المزامنة التلقائية بين شاغل المنصب وإسناد الدور التشغيلي **غير مفعّلة في هذه المرحلة** (للحفاظ على القاعدة: لا منح صلاحية تلقائية من المنصب). يبقى الإسناد التشغيلي يدوياً عبر `/admin/user-roles`.
- في حال احتيج لاحقاً لمزامنة آلية، يمكن إضافتها كـ Server Function منفصل ضمن مرحلة لاحقة.
