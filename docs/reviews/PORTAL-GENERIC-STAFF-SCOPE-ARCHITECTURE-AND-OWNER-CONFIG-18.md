# PORTAL — Generic Staff Scope Architecture (Go-Live 18)

## Verdict

`GA_SCOPE_ARCHITECTURE=GENERIC_MANY_TO_MANY`  
`EMPLOYEE_HARDCODING=0` (production application / auth / UI logic)

Graduate Affairs specialist authorization remains **AUTH-04**:

authorized staff profile  
→ `request_processing_assignments` (unit=`graduate_affairs`, role=`graduate_affairs_specialist`, active)  
→ `staff_profile_departments`  
→ `graduate_records.department_id`

Manager (`graduate_affairs_manager`) = college operational scope.  
Specialist = **explicit** department rows only. Empty SPD = **DENY** (fail-closed).

`staff_profiles.department_scope='all'` is **never** interpreted as GA specialist authorization.

## Capability binding model

| Table | Role |
|---|---|
| `request_processing_units` | includes `graduate_affairs` |
| `request_processing_roles` | `graduate_affairs_manager` (managerial), `graduate_affairs_specialist` |
| `request_processing_assignments` | binds capability to staff/user |
| `staff_profiles` | stable employee identity |
| `staff_profile_departments` | many-to-many organizational scope (PK `(staff_profile_id, department_id)`) |

## Admin surfaces (reuse, no duplicate feature)

1. **`/admin/processing-assignments`** — assign/remove processing capability.  
   - Managerial roles: singleton active assignee.  
   - Non-managerial (specialist) roles: **multiple concurrent assignees allowed**.  
   - UI columns: الموظف / الدور التشغيلي / الوحدة التشغيلية / الأقسام المخولة.

2. **`/admin/staff-management`** — edit staff department scope (existing `StaffDepartmentScopeFields`).  
   - Warns that «كل أقسام الكلية» clears SPD and does **not** grant GA specialist ops.

3. **Server write contract** — `setStaffDepartmentScope({ staffProfileId, departmentIds[] })`  
   - Staffing/admin authority only (`admin` / `system_admin` / `dean` / `hr_officer`).  
   - Active staff profile required.  
   - Department IDs must exist and be active.  
   - Dedupes input; synchronizes exact selected set as `department_scope='specific'`.  
   - Audits old → new scope.  
   - Blocks self-edit of own staff profile scope.  
   - Does **not** grant GA operational capability by itself.  
   - `CONFIGURATION AUTHORITY != OPERATIONAL GA AUTHORITY`.

## Program inheritance (department boundary)

GA authorization boundary remains **DEPARTMENT**, not employee and not program.

A specialist scoped to a department handles graduate records of **every program** belonging to that department.

Owner-confirmed structure (names only; IDs resolved at runtime from catalog):

- قسم علوم الحاسوب → بكالوريوس علوم الحاسوب, بكالوريوس الذكاء الاصطناعي  
- قسم تكنولوجيا المعلومات → بكالوريوس تكنولوجيا المعلومات, بكالوريوس الأمن السيبراني  
- قسم نظم المعلومات الحاسوبية → بكالوريوس نظم المعلومات الحاسوبية  

**Source catalog note:** program code `AI` exists in seed; confirm `programs.department_id` linkage in the live catalog before production configuration. Do **not** invent program IDs. No program-level specialist authorization is introduced now; future extension point = optional program-scope table analogous to SPD.

## Owner current configuration policy (DATA ONLY — no production write here)

Current owner decision: the active Graduate Affairs specialist shall be assigned to **all three currently active college departments**.

This is **configuration data**, not application logic.

- Do **not** hardcode any employee name / email / user_id / staff_profile_id / assignment_id in reusable source.  
- The production writer must resolve and verify the intended active specialist at runtime before configuring scope.  
- Tomorrow another specialist must work with the exact same components.

## Future change (no silent grant)

Initial specialist scope A+B. Department D created tomorrow → specialist remains A+B only.  
Admin explicitly sets A+B+D via `setStaffDepartmentScope` / staff-management UI → D becomes authorized.  
No migration / source modification required.

## Tests

- `tests/graduates-affairs/ga-generic-staff-scope-many-to-many-18.test.ts`  
- `tests/admin/generic-staff-scope-admin-contract-18.test.ts`  
- Existing AUTH-04 TS + PG verifiers
