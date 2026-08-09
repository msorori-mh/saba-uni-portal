# PORTAL-REPORTS-BENEFICIARY-AUTHZ-SCOPE-HARDENING-03 — تقرير الإغلاق

| الحقل | القيمة |
|---|---|
| **المهمة** | `PORTAL-REPORTS-BENEFICIARY-AUTHZ-SCOPE-HARDENING-03` |
| **الفرع** | `feat/reports-beneficiary-authz-scope-hardening-02` |
| **PR** | [#319](https://github.com/msorori-mh/saba-uni-portal/pull/319) |
| **starting SHA** | `9408a8d92b645f491c178d5b3c37744d5ea65e8f` |
| **القرار** | `PASS_PORTAL_REPORTS_BENEFICIARY_AUTHZ_SCOPE_HARDENING_03` |

## الملخص

أُغلقت فجوات G1–G5: كتالوج مربوط بـ ActorScope (هوية + bindings)، منع توسيع مواد القسم بلا فلتر، كتالوج فارغ للتقارير المعتمدة على نطاق مرفوض، خدمات اختبارية سلوكية بدل إثبات المصدر فقط، ومسارات ReportsCenter تمرّر `viewerScope`.

## عقود

### ReportsCenter binding
- `viewerScope` (مفضّل) أو `viewerBindings` أو `prefiltered` من الخادم.
- `endUserCatalogEntries` / `canSeeReportForViewer` يطبّقان بوّابات data_scope الكاملة (self / assigned / department / college / operational_unit / VP / presidency).

### Materials department
- `resolveMaterialsDepartmentId`: admin بلا `department_id` ⇒ DENY؛ عميد بلا college ⇒ DENY؛ رئيس قسم أجنبي ⇒ DENY؛ قسم مجهول ⇒ DENY.

### Denied-scope catalog
- `projectVisibleCatalogForScope` لا يعلن تقارير تتطلب الربط المفقود.

## أعداد الكتالوج (بدون تغيير حالة)

| الحالة | العدد |
|---|---|
| LIVE | 15 |
| BLOCKED | 17 |
| المجموع | 63 |

BLOCKED المتعمّد محفوظ: VP / رئاسة / dean college / official_documents.

## السلامة

ZERO_PRODUCTION_WRITE · ZERO_MIGRATION_APPLY · NO_DEPLOY · NO_PUBLISH · NO_MERGE
