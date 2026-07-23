# تقرير Track G — ADMIN-REPORTS-TEST-HARDENING-AND-CATALOG-RECONCILIATION-01

**المستودع:** msorori-mh/saba-uni-portal (private)
**الفرع:** `test/admin-reports-hardening-catalog-reconciliation-01` (من main `debf9d041f7c05794f6df33877f1dff91253625e`)
**النطاق:** تقوية اختبارات الأقسام الستة الموصولة في `/admin/reports` + مطابقة الكتالوج المرجعي مع واقع الكود.

## 1. الغرض

مواصفة Track G تطلّبت أمرين متكاملين:

1. **Test hardening**: تغطية السلوكيات الـ16 للأقسام الستة الموصولة في صفحة التقارير الإدارية (`/admin/reports`) باختبارات مؤتمتة حقيقية، وفق أعراف المستودع (bun test، بلا DB mocking، بلا React rendering — نمط source-contract + اختبارات سلوك الكتالوج النقي).
2. **Catalog reconciliation**: جعل الكتالوج المرجعي (`src/lib/reports/catalog/entries.ts`) مطابقًا للكود (code is truth): تصحيح قائمتي أدوار خاطئتين، ثم ترقية الأقسام الستة من `DATA_DEPENDENT` إلى `LIVE` بعد اكتمال ركيزة الاختبارات، وتحديث اختبار الكتالوج ومصفوفة التتبع في نفس التغيير.

## 2. جرد الأقسام الستة

البنية المشتركة: route وحيد `src/routes/admin/reports.tsx` (`createFileRoute("/admin/reports")`) بتسع بطاقات tabs — ست نشطة وثلاث `ComingSoonCard` (faculty/documents/audit). البوابة الحاسمة server-side: كل دالة تقرير في `src/lib/admin-reports.functions.ts` هي `createServerFn(POST)` + `requireSupabaseAuth` + zod `inputValidator` + تأكيد أدوار عبر `src/lib/authz.server.ts`، وكل الاستعلامات عبر `supabaseAdmin`. نمط fail-closed بالفلاتر: بلا فلتر → حمولة فارغة موجهة (`rows:[], total:0, message:"اختر فلترًا واحدًا على الأقل لعرض التقرير."`) على الخادم والعميل معًا. التصدير عميل-فقط (`downloadCsv` من صفوف الشاشة نفسها + `window.print()`).

| القسم | report_code | المكوّن | مصدر البيانات | الصلاحية (server guard) | أبرز الفلاتر | التصدير | الحالات |
|---|---|---|---|---|---|---|---|
| students | ADM-STUDENTS-DIRECTORY | `StudentsReport` | `getStudentsReportForAdmin` — table: student_profiles (عبر supabaseAdmin) | `assertStudentRead` / STUDENT_READ_ROLES (admin, system_admin, dean, registrar, student_affairs) | study_system, department_id, program_id, level_id, academic_year_id, semester_id, status, account_status, page | `students_report.csv` + print — بلا audit | pre-filter/loading(ErrorBox)/empty/pagination |
| imports | ADM-IMPORT-JOBS | `ImportJobsReport` + `ImportDetailsDialog` | `getImportJobsReportForAdmin` + `getImportJobErrorsForAdmin` — import_logs (أخطاء مُحللة من notes عبر `parseImportNotes`) | `assertAnyRole(IMPORT_REPORT_ROLES)` (admin, system_admin, registrar, student_affairs, finance_officer) | import_type, status, from_date, to_date, created_by, file_name, page | `import_jobs_report.csv` + print — بلا audit | نفس النمط + dialog تحميل/فارغ خاص |
| accounts | ADM-STUDENT-ACCOUNTS | `StudentAccountsReport` | `getStudentAccountsReportForAdmin` — student_profiles | `assertStudentRead` / STUDENT_READ_ROLES (بلا finance_officer) | dept/program/level/year/semester + study_system, account_status, status, academic_number, student_name | `student_accounts_report.csv` + print — بلا audit | نفس النمط |
| academic | ADM-ACADEMIC-STRUCTURE | `AcademicReports` (4 sub-tabs) | 4 دوال `get*ReportForAdmin` — programs/study_plans/study_plan_courses/courses | `assertReportsAccess` / REPORTS_ROLES (6 أدوار) | department_id, program_id, status, search (+ level_id/semester_code حسب التقرير) | `{reportId}_academic_report.csv` + print — بلا audit | نفس النمط + reset عند تبديل التبويب |
| schedules | ADM-SCHEDULE-SUITE | `ScheduleReports` (7 sub-tabs) | 7 دوال `get*ReportForAdmin` — course_sections/class_schedule/rooms (+12 جدولًا عبر `loadScheduleBase`) | `assertScheduleReportsAccess` / SCHEDULE_REPORT_ROLES (system_admin, admin, dean, registrar, department_head) | dept/program/level/year/semester/faculty/room/section/day/type/status/search | `{reportId}_schedule_report.csv` من `scheduleColumns` + print — بلا audit | نفس النمط + لافتة message اختيارية |
| requests | ADM-STUDENT-REQUESTS | `RequestsReport` (+`BreakdownCard`) | `getReportsRequests` — table: student_requests + student_profiles | `assertReportsAccess` / REPORTS_ROLES (6 أدوار) | from_date, to_date, department_id, program_id, status, request_type | `student_requests_report.csv` + print — **مدقّق** (report_viewed/report_exported مع rowCount عبر `logReportEvent` → `rpc:log_audit`) | loading/ErrorBox/EmptyTableRow (يجلب عند الفتح بلا بوابة enabled — موثق) |

لا RPC مخصص للتقارير الستة؛ الـ RPC الوحيد في المسار هو `log_audit` للتدقيق (قسم requests).

## 3. خريطة السلوكيات الـ16 → الاختبارات

أربعة ملفات جديدة تحت `tests/admin-reports/` (أسماء الاختبارات حرفية من الملفات):

| # | السلوك | الاختبار(ات) |
|---|---|---|
| 1 | authorized visibility | guards-and-visibility: "each section is visible to every role its server guard admits" |
| 2 | unauthorized denied | guards-and-visibility: "non-administrative roles see no admin report section" (student/faculty_member/hr_officer/graduate) |
| 3 | unknown-role fail-closed | guards-and-visibility: "unknown roles are denied for every section (fail-closed)" (بما فيها `null` و`[]` و`visibleReports`) |
| 4 | wrong-unit isolation | guards-and-visibility: "department_head sees only the schedule suite among the six sections" + "finance_officer cannot read student directory or student accounts sections" |
| 5 | empty state | ui-states-and-filters: "sections render explicit no-data empty states" + "filter-required sections return a guided empty payload without querying" |
| 6 | loading state | ui-states-and-filters: "every section header reflects the fetching state" + "a spinner is rendered while loading" |
| 7 | error state | ui-states-and-filters: "query errors render the shared ErrorBox with the error message" + "server query errors propagate as thrown Errors in the data path" |
| 8 | filter behavior | ui-states-and-filters: "filters apply only after the apply action (appliedFilters pattern)" + "each filter-required section gates its query on a has*Filter helper" |
| 9 | date range | ui-states-and-filters: "the requests report applies an inclusive created_at range" (يثبت `gte("created_at", from_date)` و`lte("created_at", to_date + T23:59:59.999Z)`) + "the requests UI exposes from/to date inputs" |
| 10 | program scope | ui-states-and-filters: "program filter is applied server-side when supplied" + "program options cascade from the selected department in the UI" |
| 11 | department scope | ui-states-and-filters: "department filter is applied server-side when supplied" |
| 12 | export permission | guards-and-visibility: "report audit logging is guarded by REPORTS_ROLES and uses the log_audit RPC" + "export rows come from the same guarded server query (no separate export path)" |
| 13 | export scope | privacy-and-export-scope: "CSV export serializes the rows of the already-guarded screen query" + "the requests section audits every export with the row count" + "the shared export utility audits exports best-effort via the guarded logReportEvent" + "export adds no extra fields" |
| 14 | no cross-unit leakage | guards-and-visibility: "server applies department filters only from the client payload, never actor-derived" (لا نطاق خفي مشتق من الفاعل) |
| 15 | no PII overexposure | privacy-and-export-scope: "person-level report selects exist" + "person-level selects carry only minimal identification and no contact/identity PII" (email/phone/national_id/address/birth_date/gender ممنوعة في projections) + "the reports route source contains no PII field tokens at all" |
| 16 | general dashboard test | guards-and-visibility: "the reports center nav item targets /admin/reports with REPORTS_ROLES parity" (مطابقة NAV_ITEM_ROLES مع REPORTS_ROLES) + "all six wired section components are rendered by the route" |

**قفل المطابقة (catalog↔server parity lock):** guards-and-visibility: "catalog required_role matches the server guard role set exactly" يقرأ ثوابت الأدوار من الكود نفسه (authz.server.ts وadmin-reports.functions.ts) ويقارنها بـ required_role لكل قسم من الأقسام الستة — أي انحراف مستقبلي بين الكتالوج والحراس يكسر الاختبار. و"server guards are the documented role sets" يثبت قيم الثوابت الأربع حرفيًا.

## 4. تصحيحا الكتالوج (code is truth)

1. **ADM-IMPORT-JOBS — الكتالوج كان يقلّل الوصول.** القديم: `required_role: ["admin","system_admin","registrar"]`. الدليل من الكود: `IMPORT_REPORT_ROLES` في `src/lib/admin-reports.functions.ts` = `["admin","system_admin","registrar","student_affairs","finance_officer"]` والدالتان (`getImportJobsReportForAdmin`/`getImportJobErrorsForAdmin`) تستدعيان `assertAnyRole(userId, IMPORT_REPORT_ROLES)`. التصحيح: required_role → الخمسة الفعلية.
2. **ADM-STUDENT-ACCOUNTS — الكتالوج كان يبالغ في الوصول.** القديم: 6 أدوار تشمل `finance_officer` مع ادعاء "(REPORTS_ROLES)". الدليل من الكود: `getStudentAccountsReportForAdmin` محروس بـ `assertStudentRead` (STUDENT_READ_ROLES — بلا finance_officer؛ fail-closed فعليًا). التصحيح: إزالة finance_officer، وتصحيح حقل source ليذكر `(assertStudentRead / STUDENT_READ_ROLES)` وحقل dependencies إلى `src/lib/authz.server.ts:assertStudentRead`.

كلا التصحيحين مقفل باختبار "catalog required_role matches the server guard role set exactly" (§3).

## 5. الترقيات DATA_DEPENDENT → LIVE (الأقسام الستة)

قاعدة `invariants.ts`: LIVE تتطلب خمس ركائز مثبتة بمسارات — route + permission + source + tests + evidence. الركائز الأربع الأولى كانت موجودة أصلًا؛ هذه الشريحة أضافت ركيزة الاختبارات. لكل قسم:

| report_code | route | guard (permission) | source (جداول حقيقية) | tests[] | wiring |
|---|---|---|---|---|---|
| ADM-STUDENTS-DIRECTORY | /admin/reports | assertStudentRead | student_profiles | ui-states-and-filters + privacy-and-export-scope + catalog-compat | `<StudentsReport />` في reports.tsx |
| ADM-IMPORT-JOBS | /admin/reports | IMPORT_REPORT_ROLES | import_logs | guards-and-visibility + catalog-compat | `<ImportJobsReport />` |
| ADM-STUDENT-ACCOUNTS | /admin/reports | assertStudentRead | student_profiles | guards-and-visibility + catalog-compat | `<StudentAccountsReport />` |
| ADM-ACADEMIC-STRUCTURE | /admin/reports | assertReportsAccess | programs/study_plans/courses | ui-states-and-filters + privacy-and-export-scope + catalog-compat | `<AcademicReports />` |
| ADM-SCHEDULE-SUITE | /admin/reports | assertScheduleReportsAccess | course_sections/class_schedule/rooms | guards-and-visibility + catalog-compat | `<ScheduleReports />` |
| ADM-STUDENT-REQUESTS | /admin/reports | assertReportsAccess | student_requests | ui-states-and-filters + privacy-and-export-scope + catalog-compat | `<RequestsReport />` |

لكل مدخل: `status: "LIVE"`, `blocker: null`, تحديث `tests[]` و`evidence[]`. الاختبار catalog-compat "each promoted section proves route + permission + source + tests + wiring" يعيد فرض الركائز الخمس آليًا، و`validateCatalog(REPORT_CATALOG_ENTRIES)` يبقى `[]`.

## 6. EXEC-CORE-KPIS (متابعة خارج النطاق)

`EXEC-CORE-KPIS` (route `/admin/executive-dashboard`, دوال في `src/lib/executive-dashboard.functions.ts`, EXEC_ROLES) يبقى `DATA_DEPENDENT`: موصول ومحرّس لكن `tests: []`، وهو خارج نطاق الأقسام الستة لصفحة `/admin/reports` في مواصفة Track G — متابعة لاحقة موثقة، ومثبت باختبار catalog-compat "EXEC-CORE-KPIS stays DATA_DEPENDENT (out of scope; documented follow-up)". ملاحظة موثقة أيضًا: `department_head` له وصول server-side إلى جناح الجداول لكن `NAV_ITEM_ROLES["/admin/reports"]` لا تشمله (الدالة fail-closed من جهة الخادم؛ إضافته لبوابة التنقل قرار UI خارج النطاق).

## 7. نتائج الاختبارات المحلية

- بيئة: bun 1.3.14.
- الأمر: `bun test tests/reports tests/admin-reports` من جذر المستودع.
- نتيجة المرمز: 136 pass / 0 fail / 1131 expect() calls عبر 8 ملفات.
- إعادة التشغيل المستقلة (finisher، نفس الأمر): **136 pass / 0 fail / 1131 expect() calls** — مطابقة.
- تحقق إضافي: النسخة المطبّعة من ui-states-and-filters (انظر §9) أُعيد تشغيلها منفردة: 14 pass / 0 fail / 30 expect() calls.

## 8. حدود العمل (blast radius)

- تعديل كود: لا شيء خارج **وحدة الكتالوج** (`src/lib/reports/catalog/entries.ts` — حقول status/required_role/tests/evidence/blocker/source/dependencies للمدخلات الستة فقط). لا تغيير في أي server function أو route أو component.
- اختبارات: 4 ملفات جديدة `tests/admin-reports/` + تعديل `tests/reports/catalog.test.ts` (تأكيدة LIVE-set فقط: من «مدخل LIVE واحد» إلى «مجموعة LIVE السباعية»).
- توثيق: `docs/PORTAL-REPORTS-TRACEABILITY-MATRIX-01.md` (6 صفوف مفعّل + عمودا صلاحية مصححان + الأعداد 7/1؛ لا تزال 56 صفًا) + هذا التقرير.
- لم يُدفَع أي ملف آخر من مساحة العمل؛ `src/lib/reports/aggregate.ts` (انحراف تعليق عربي 5 بايت معروف) **لم** يُلمَس ولم يُدفَع.

## 9. الملفات والـ blob SHAs بعد الدفع

كل ملف دُفع عبر GitHub API ثم تحقق بمطابقة `git hash-object` المحلي مع الـ blob SHA البعيد:

| الملف | blob SHA (بعيد) | التحقق |
|---|---|---|
| tests/admin-reports/guards-and-visibility.test.ts | `bedf6999444516a4befda2cafef47eb36fce8dd8` | مطابق للمحلي ✓ |
| tests/admin-reports/ui-states-and-filters.test.ts | `b1439c8698c19f151d9c14543f36872cdc7597a7` | انحراف موثق — انظر أدناه |
| tests/admin-reports/privacy-and-export-scope.test.ts | `b35ab36b54098b9561e97824b32a15ca3faad177` | مطابق للمحلي ✓ |
| tests/admin-reports/catalog-compat.test.ts | `92efc09d9e29b4bd3233797152595fa3b977c847` | مطابق للمحلي ✓ |
| src/lib/reports/catalog/entries.ts | `d96fbd87ddf0145dba178a46c6d57c8b68d9a4c3` | مطابق للمحلي ✓ |
| tests/reports/catalog.test.ts | `8dcf0f932fcfdd9fafa31b2c4a4854c9ca38a65e` | مطابق للمحلي ✓ |
| docs/PORTAL-REPORTS-TRACEABILITY-MATRIX-01.md | `0eff7afd72e11cb8181f86233248b69dcb9692a8` | مطابق للمحلي ✓ |
| docs/ADMIN-REPORTS-TEST-HARDENING-AND-CATALOG-RECONCILIATION-01-REPORT.md | (يُسجَّل في متن الـPR بعد الدفع) | — |

**انحراف موثق (ui-states-and-filters.test.ts):** النسخة المحلية المُعدّة blob `9c596a9410ca22f08c29cdb48232b80535dd4ab4` (5411 بايت، pure-ASCII مع 42 تسلسل ترميز unicode — أي backslash-u متبوعًا بأربعة خانات hex — لنصين عربيين وتعليقيهما)؛ قناة النقل لا تستطيع حمل هذه التسلسلات حرفيًا (تُفَكّ عند الإرسال)، فاستقر البعيد على `b1439c8698c19f151d9c14543f36872cdc7597a7` (5243 بايت) = الملف نفسه مع فكّ الترميزات الـ42 إلى عربي خام — فرق 168 بايتًا بالضبط (42×4)، ومثبت بالبايت أن لا فرق آخر (إعادة ترميز محلية أنتجت نفس الـSHA). السلسلتان النصيتان متطابقتان في زمن التشغيل (التسلسل المرمّز والحرف العربي الخام نفس القيمة في JavaScript)، والاختبارات الـ14 في الملف خضراء على النسختين (أُعيد تشغيل النسخة البعيدة: 14/14 pass / 30 expects). أُقرّ الانحراف من القيادة قبل المتابعة.

## 10. ملاحظات ختامية

- لا أسرار ولا PII في هذا التقرير.
- التدقيق (audit) يغطي قسم requests فقط (view/export)؛ الأقسام الخمسة الأخرى بلا audit للعرض/التصدير — حالة موثقة، وليست انحدارًا من هذه الشريحة.
- لا إخفاء حقول حسب الدور في أي قسم (نفس الصفوف لكل دور مقبول)؛ التقييد عبر البوابة فقط — موثق كوضع حالي.
