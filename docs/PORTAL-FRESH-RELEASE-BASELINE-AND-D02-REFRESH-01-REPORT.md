# PORTAL-FRESH-RELEASE-BASELINE-AND-D02-REFRESH-01

| الحقل | القيمة |
|---|---|
| البرنامج | `PORTAL-FRESH-RELEASE-BASELINE-AND-D02-REFRESH-01` |
| المستودع | `msorori-mh/saba-uni-portal` |
| المسار | `C:\projects\saba-uni-portal` |
| التاريخ | 2026-07-21 |
| الفرع | `docs/fresh-release-baseline-d02-refresh-01` |
| `SOURCE_SHA` / `expected_release_sha` | `0e2d25c9a2d7923ce74cfae079b99691d61eb1b6` |
| القرار | `PASS_FRESH_RELEASE_BASELINE_AND_D02_PACKAGE_READY` |

## أبعاد الحالة (ملزمة)

| البعد | القيمة في هذا البرنامج |
|---|---|
| `SOURCE_SHA` | `0e2d25c9a2d7923ce74cfae079b99691d61eb1b6` |
| `DEPLOYED_SHA` | `UNKNOWN` — لا ادّعاء نشر إنتاجي |
| `PRODUCTION_DB_STATE` | غير مُعاد قراءته — D-02 **لم يُنفَّذ** على الإنتاج |
| `MIGRATION_READINESS` | حزمة D-02 محدّثة جاهزة للتنفيذ المفوّض؛ apply يحتاج موافقة منفصلة |
| `USER_APPROVAL_REQUIRED` | Deploy/Publish، تنفيذ D-02 على الإنتاج، D-01، Migration apply، تفعيل/`student_visible`، استيراد حسابات حي |

## G0 — التحقق من الخط الأساس

| الفحص | النتيجة |
|---|---|
| `origin/main` | `0e2d25c9a2d7923ce74cfae079b99691d61eb1b6` ✅ |
| PR #191 / #194 / #195 | مكتملة على سلسلة main |
| Web CI على آخر runtime merges | `e3dbd93` (#194) و `edb2674` (#195) = **success** (quality + bun-tests + PG 8/8) |
| CI على tip docs `0e2d25c` | لا تشغيل (path filter للـdocs) — مقبول |
| `427b7eb4` كخط أساس جديد | **غير صالح** — أُلغي |
| تنفيذ D-01 / D-02 إنتاج | لم يحدث |

## ما أُنشئ / حُدّث

| الملف | الدور |
|---|---|
| `docs/PORTAL-FRESH-RELEASE-CANDIDATE-01.md` | Fresh RC مصدري على `0e2d25c9…`؛ `DEPLOYED_SHA=UNKNOWN`؛ proof=`NOT_RUN` |
| `docs/B1-D02-READONLY-PRODUCTION-PREFLIGHT-PACKAGE-01.md` | تحديث كامل: مرشحات حالية، رؤساء CS/IT/IS، services/workflows/`student_visible`، Storage، سجلات محمية، كائنات المقاصة/المشاريع/المحاضرات/المواد، `student_accounts` مصدر فقط |
| `docs/B1-PREFLIGHT-FRESH-BASELINE-01.md` | B1 preflight جديد؛ يلغي اعتماد `427b7eb4`؛ `expected_release_sha=0e2d25c9…`؛ proof=`NOT_RUN` |
| لافتات SUPERSEDED على تقارير/RC تاريخية | preflight-02، command-cycle، RC manifest-01، parallel-activation |
| `tests/docs/portal-fresh-release-baseline-d02-refresh-01.test.ts` | عقد الوثائق |

## محتوى D-02 المحدّث (ملخص)

- Q1: `supabase_migrations.schema_migrations` كامل
- Q2: ILIKE لجميع المرشحات الحالية (B1-18 + drafts التوسع)
- مصفوفات applied/not_applied/ambiguous/partial
- Q3a `log_audit` overloads
- Q3d رؤساء الأقسام CS/IT/IS
- Q3e services/workflows/`student_visible` (قراءة فقط)
- Q3f Storage + سياسات
- Q3g سجلات محمية `USR-2026-000001/2`
- Q3h كائنات clearance / graduation_projects / lecture_execution / materials (+ كشف graduates)
- Q3i `student_accounts` source presence فقط — **بدون إنشاء حسابات**
- Q4 provenance نشر؛ لا قبول `427b7eb4` كإثبات للخط الحالي

## إجراءات ممنوعة — لم تُنفَّذ

| الإجراء | الحالة |
|---|---|
| D-02 على الإنتاج | لم يُنفَّذ |
| D-01 | لم يُنفَّذ |
| Deploy / Publish | لم يُنفَّذ |
| Migration apply / Production SQL write | لم يُنفَّذ |
| تعديل `student_visible` | لم يحدث |
| إنشاء حسابات الطلاب الـ566 | لم يحدث |
| لمس كتالوج تقارير Kimi الخاص | لم يحدث |

## القرار

**`PASS_FRESH_RELEASE_BASELINE_AND_D02_PACKAGE_READY`**

الحزمة المصدرية جاهزة. الخطوة التالية المسموحة فقط بعد موافقات منفصلة: Deploy/Publish لإثبات `DEPLOYED_SHA`، ثم تنفيذ D-02 المفوض.
