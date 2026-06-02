# Phase 11C — People Management System

Build three operational admin pages (students, faculty management, staff management) that wrap existing tables and server functions, plus dashboard/readiness/audit integration. No schema changes, no changes to auth, portals, academics, finance, requests, or imports.

## Scope summary

Three new admin routes:
- `/admin/students`
- `/admin/faculty-management`
- `/admin/staff-management`

Each page: list + search + filters + table + row actions (view, edit, create account, reset password, activate/deactivate, print credentials) + "إضافة" dialog + link to bulk import.

Existing `/admin/users` and `/admin/faculty` (public site faculty content) stay untouched. Sidebar labels updated to disambiguate.

## Discovery first (read-only)

Before writing code I will read:
- `src/routes/admin/*` tree to understand existing layout, sidebar, and `/admin/users`, `/admin/faculty` shapes
- `src/lib/admin-users.functions.ts` (and similar) for `createAccount`, `resetPassword`, `setActive`, `addRole`, `removeRole` signatures
- `src/integrations/supabase/types.ts` for exact columns of `student_profiles`, `student_academic_status`, `faculty_profiles`, `staff_profiles`
- Existing audit_logs usage pattern
- Dashboard + readiness modules to know where to inject

If a needed server fn (e.g. list students with filters) doesn't exist, I'll add it in a `*.functions.ts` file beside existing ones — reusing `requireSupabaseAuth` and `has_any_role` patterns. No DB migration unless a required column is genuinely missing.

## Implementation plan

### 1. Server functions (new file `src/lib/people-management.functions.ts`)
Authenticated, role-gated via `has_any_role`:
- `listStudents({ search, department_id, program_id, level_id, status, has_account })`
- `getStudent(id)`
- `createStudent(payload)` → inserts `student_profiles` + `student_academic_status` + optional account creation (delegates to existing `createAccount`)
- `updateStudent(id, patch)`
- `listFacultyProfiles(filters)` / `createFacultyProfile` / `updateFacultyProfile`
- `listStaffProfiles(filters)` / `createStaffProfile` / `updateStaffProfile`
- All mutations write to `audit_logs` with the action names in PART 12

Reuse existing `createAccount`, `resetPassword`, `setActive`, `addRole`, `removeRole` from `admin-users.functions.ts` — do not duplicate.

### 2. Shared UI components (`src/components/admin/people/`)
- `PeopleTable.tsx` — generic table with sort, status badge, account badge, action menu
- `PeopleFilters.tsx` — search + select filters
- `CredentialPrintDialog.tsx` — print-friendly card (name, identifier, username, temp password, portal URL, change-password notice). Uses `window.print()` with a print-only stylesheet block.
- `AccountActionsMenu.tsx` — dropdown wiring createAccount/resetPassword/setActive

### 3. Pages
- `src/routes/admin/students.tsx` — list + filters + "إضافة طالب" dialog + edit dialog + link to `/admin/imports?tab=students`
- `src/routes/admin/faculty-management.tsx` — same shape for faculty
- `src/routes/admin/staff-management.tsx` — same shape for staff (role_type select limited to registrar/student_affairs/finance_officer/hr_officer)

All routes under `_authenticated` layout. Each route's loader checks role via existing pattern and redirects unauthorized users.

### 4. Add-person dialogs
Use `react-hook-form` + `zod` (matching existing forms). On submit:
1. Insert profile rows
2. If "إنشاء حساب دخول" checked → call `createAccount` with computed email (`{number}@students.usr.edu.ye` / `@faculty.usr.edu.ye` / `@staff.usr.edu.ye`) and temp password = number, role assigned, `must_change_password = true`
3. Show success dialog with credentials + "طباعة"

### 5. Sidebar
Update `src/components/admin/AdminSidebar.tsx` (or equivalent):
- Rename existing "إدارة أعضاء هيئة التدريس" (the `/admin/faculty` public content page) label → "صفحة أعضاء هيئة التدريس بالموقع"
- Add new group "إدارة الأفراد" with: إدارة الطلاب, إدارة أعضاء هيئة التدريس, إدارة الموظفين

### 6. Dashboard integration
Add "إدارة الأفراد" card group to admin dashboard with counts (students, faculty, staff, inactive accounts, profiles without accounts). Each card → links to the respective management page. New server fn `getPeopleStats()`.

### 7. Readiness integration
Add "إدارة الأفراد" category to existing system readiness module with the seven checks listed in PART 15.

### 8. Audit logging
Every create/update/account/reset/activate/deactivate writes one row to `audit_logs` with `entity_type`, `action_type`, `actor_id` (auth.uid), `target_id`, identifier in metadata, and a `changes` JSON diff.

### 9. Permissions
Server-side gate every fn with `has_any_role(auth.uid(), ARRAY[...])` matching PART 13. Client-side: hide nav items the user can't access using existing role hook.

## Out of scope (explicit)
- No DB migrations (assuming `must_change_password`, `is_active`, audit_logs schema already support this — verified in discovery first; if a column genuinely missing I'll stop and ask)
- No changes to imports engine, just deep-link to `/admin/imports`
- Department-head read-only scope is "if easy to support" — I'll include it only if the existing role system already exposes a department_head→department mapping; otherwise note as known limitation
- No `gender` field on students (skipped previously and not in this spec)

## Delivery
Single batch with all files. Final message will include the PART 17 report (pages, flows, integrations, build status, known limitations).
