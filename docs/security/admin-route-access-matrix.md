# Admin Route Access Matrix

**مرجع:** `src/lib/admin-nav.ts` → `NAV_ITEM_ROLES`  
**Layout guard:** `src/routes/admin.tsx` → `getAdminSession()` + `canAccessAdminPanel` + `canAccessAdminRoute`  
**Login exception:** `/admin/login` — عام (auth client فقط)

**Legend**

- **Layout:** ✅ = `admin.tsx` beforeLoad  
- **Server fn:** ✅ = الصفحة تستخدم `useServerFn` / server functions للبيانات  
- **Client SB:** client Supabase مباشر في route/component  
- **Sensitivity:** عالية / متوسطة / منخفضة  

| المسار | الملف | Layout | الأدوار المسموحة (NAV) | Server fn | Client SB | الحساسية | ملاحظات |
|--------|-------|--------|------------------------|-----------|-----------|----------|---------|
| `/admin/login` | `login.tsx` | ❌ | عام | ❌ | ✅ auth | متوسطة | مقصود — لا يُنقل |
| `/admin` | `index.lazy.tsx` | ✅ | ALL_STAFF | ✅ dashboard | ❌ | متوسطة | KPIs عبر server |
| `/admin/executive-dashboard` | `executive-dashboard.lazy.tsx` | ✅ | admin, system_admin, dean, registrar | ✅ | ❌ | عالية | analytics |
| `/admin/academic-operations` | `academic-operations.tsx` | ✅ | + department_head | ✅ | ❌ | عالية | |
| `/admin/academic-core` | `academic-core.tsx` | ✅ | admin, dean, registrar | ✅ | ❌ | عالية | سنوات/فصول |
| `/admin/study-plans` | `study-plans.lazy.tsx` | ✅ | admin, dean, registrar | ✅ | ❌ | عالية | |
| `/admin/course-offerings` | `course-offerings.tsx` | ✅ | + department_head | ✅ | ❌ | عالية | + ScheduleImportPanel |
| `/admin/enrollments` | `enrollments.tsx` | ✅ | + student_affairs, dept_head | ✅ | ❌ | عالية | |
| `/admin/grades` | `grades.lazy.tsx` | ✅ | + department_head | ✅ | ❌ | عالية | |
| `/admin/transcripts` | `transcripts.lazy.tsx` | ✅ | admin, dean, registrar | ✅ | ❌ | عالية | ownership checks |
| `/admin/imports` | `imports.tsx` | ✅ | + student_affairs, finance | ✅ | ❌ | **عالية** | bulk + schedule tabs |
| `/admin/student-progress` | `student-progress.tsx` | ✅ | admin, dean, registrar | ✅ | ❌ | عالية | |
| `/admin/at-risk-students` | `at-risk-students.tsx` | ✅ | + student_affairs | ✅ | ❌ | عالية | |
| `/admin/graduation-candidates` | `graduation-candidates.tsx` | ✅ | admin, dean, registrar | ✅ | ❌ | عالية | |
| `/admin/students` | `students.lazy.tsx` | ✅ | + student_affairs | ✅ | ❌ | **عالية** | roles من route context |
| `/admin/student-requests` | `student-requests.lazy.tsx` | ✅ | + student_affairs | ✅ | ❌ | **عالية** | attachments signed URL |
| `/admin/request-types` | `request-types.tsx` | ✅ | admin, registrar, student_affairs | ✅ | ❌ | عالية | |
| `/admin/faculty-management` | `faculty-management.tsx` | ✅ | admin, dean, hr_officer | ✅ | ❌ | عالية | |
| `/admin/staff-management` | `staff-management.tsx` | ✅ | admin, dean, hr_officer | ✅ | ❌ | عالية | dept scope |
| `/admin/faculty` | `faculty.tsx` | ✅ | admin, dean, hr_officer | ✅ | ❌ | متوسطة | CMS عام |
| `/admin/finance` | `finance.lazy.tsx` | ✅ | admin, dean, finance_officer | ✅ | ❌ | **عالية** | receipts |
| `/admin/documents` | `documents.lazy.tsx` | ✅ | + student_affairs | ✅ | ❌ | **عالية** | official docs |
| `/admin/communications` | `communications.tsx` | ✅ | admin, dean, registrar, student_affairs | ✅ | ❌ | عالية | |
| `/messages` | `messages.tsx` (root) | ✅* | same as communications | ✅ | ❌ | عالية | *admin nav link |
| `/admin/automation` | `automation.tsx` | ✅ | admin, dean, registrar | ✅ | ❌ | عالية | settings write admin only |
| `/admin/reports` | `reports.tsx` | ✅ | + finance, student_affairs | ✅ | ❌ | عالية | admin reads all tables |
| `/admin/news` | `news.tsx` | ✅ | admin, system_admin | ✅ | ❌ | منخفضة | CMS |
| `/admin/events` | `events.tsx` | ✅ | admin, system_admin | ✅ | ❌ | منخفضة | |
| `/admin/research` | `research.tsx` | ✅ | admin, system_admin | ✅ | ❌ | منخفضة | |
| `/admin/departments` | `departments.tsx` | ✅ | admin, system_admin | ✅ | ❌ | متوسطة | |
| `/admin/programs` | `programs.tsx` | ✅ | admin, system_admin | ✅ | ❌ | متوسطة | redirect wrapper |
| `/admin/contacts` | `contacts.tsx` | ✅ | admin, system_admin | ✅ | ❌ | متوسطة | |
| `/admin/settings` | `settings.tsx` | ✅ | admin, system_admin | ✅ | ❌ | عالية | site_settings |
| `/admin/audit-log` | `audit-log.tsx` | ✅ | admin, system_admin | ✅ | ❌ | **عالية** | full read only |
| `/admin/users` | `users.tsx` | ✅ | admin, system_admin | ✅ | ❌ | **عالية** | auth admin |
| `/admin/roles` | `roles.tsx` | ✅ | admin, system_admin | ✅ | ❌ | **عالية** | |
| `/admin/user-roles` | `user-roles.tsx` | ✅ | admin, system_admin | ✅ | ❌ | **عالية** | |
| `/admin/organizational-structure` | `organizational-structure.tsx` | ✅ | admin, dean | ✅ | ❌ | عالية | write admin only |
| `/admin/security-status` | `security-status.tsx` | ✅ | admin, system_admin | ✅ | ❌ | عالية | read-only status |
| `/admin/operations` | `operations.tsx` | ✅ | admin, system_admin | ✅ | ❌ | **عالية** | + DataCleanupPanel |
| `/admin/pilot-center` | `pilot-center.tsx` | ✅ | admin, system_admin | ✅ | ❌ | عالية | pilot config |
| `/admin/backup-status` | `backup-status.tsx` | ✅ | admin, system_admin | ✅ | ❌ | عالية | |
| `/admin/system-readiness` | `system-readiness.tsx` | ✅ | admin, system_admin | ✅ | ❌ | متوسطة | |
| `/admin/faculty-accounts` | `faculty-accounts.tsx` | ✅ | admin, dean, hr_officer | ✅ | ❌ | **عالية** | provision |
| `/admin/schedules` | `schedules.tsx` | ✅ | + department_head | ✅ | ❌ | عالية | |
| `/admin/messages` | `messages.tsx` | ✅ | admin, system_admin | redirect | ❌ | — | redirect only |

---

## Client Supabase في shell (يؤثر على كل admin routes)

| المكون | الاستخدام | المخاطرة |
|--------|-----------|----------|
| `AdminShell.tsx` | `contact_messages` count (new badge) | 🟡 RLS-dependent |
| `AdminShell.tsx` | `signOut()` | ✅ مقصود |
| `ScheduleImportPanel.tsx` | schedule validation preview (client) | 🟠 ADM-002 batch-5 pending |

---

## Fallback route policy

مسارات `/admin/*` غير المعرّفة في `NAV_ITEM_ROLES` → fallback `["system_admin","admin"]` فقط (`resolveAdminRouteRoles`).

---

## اختبارات مطلوبة لاحقاً (per route)

1. كل role في `ADMIN_PANEL_ROLES` — الوصول المسموح vs الممنوع (redirect + accessDenied banner).
2. `faculty_member` / `student` / anonymous — `/admin/*` → login redirect.
3. `department_head` — grades/enrollments فقط، لا `/admin/users`.
4. `finance_officer` — `/admin/finance` + imports fees، لا HR.
5. `hr_officer` — faculty/staff، لا student grades write.
