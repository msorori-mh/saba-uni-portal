# REPORTS-AND-DASHBOARDS-COMPLETION-01 — تقرير الإنجاز

- **المستودع:** msorori-mh/saba-uni-portal
- **الفرع:** `feat/reports-dashboards-completion-01` (من `main` الحالي عند إنشاء الفرع)
- **النطاق الحصري:** `src/lib/reports/*` (جديد)، `src/components/reports/*` (جديد)، `src/components/dashboards/*` (جديد)، `tests/reports/*` (جديد)، `docs/REPORTS-AND-DASHBOARDS-*`
- **لم يُمس:** `routeTree.gen.ts`، `src/routes/**` (بما فيها `/admin/reports.tsx`)، `supabase/migrations/**`، ملفات الأنظمة الأخرى قيد العمل (قراءة فقط)، ولا أي SQL أو network.

## 1. جرد الفجوات بحسب المستفيد (المطلب 1)

المصدر: `docs/PORTAL-REPORTING-COVERAGE-AUDIT-01-REPORT.md` + فحص `/admin/reports.tsx` (ملف أحادي ~112KB يضم الأقسام النشطة: طلاب/استيراد/حسابات/أكاديمي/جداول، وأقسام «قريباً»: أعضاء هيئة التدريس/الوثائق/التدقيق) + دوال قديمة غير موصولة (`getReportsRequests`, `getReportsFinancial`, …).

| المستفيد | الموجود | الناقص (فجوة) | الأولوية | الحالة في هذه الشريحة |
|---|---|---|---|---|
| طالب | عروض ذاتية عبر بوابة الطالب (طلباتي/درجاتي/ماليتي/جدولي) | لا فجوة مجمعة — بياناته شخصية self-service | — | موثق (existing) |
| عضو هيئة تدريس | بوابة عضو هيئة التدريس (جدولي/موادي) | عرض العبء التدريسي المجمع | متوسطة | فجوة موثقة (follow-up) |
| رئيس قسم | لا شيء بصلاحيته — البيانات حبيسة صلاحية الإدارة | لوحة العبء الأكاديمي والجداول على مستوى القسم | عالية | فجوة موثقة (follow-up) |
| عميد | أقسام /admin/reports النشطة | **قسم تقارير الطلبات (الدالة موجودة بلا واجهة)** + قسم أعضاء هيئة التدريس | **حرجة** | **مُنفذ: `student_requests_overview`** |
| شؤون طلاب | ضمن صلاحيات الإدارة العامة | تفصيل الطلبات حسب البرنامج/المستوى/العمر + قسم الوثائق | **حرجة** | **مُنفذ: `student_requests_overview` (جداول by_program/by_level/pending_age)** |
| مالية | دوال `getReportsFinancial` قديمة غير موصولة | ملخص مالي بعقد مجمع آمن | عالية | **مُنفذ: `finance_summary`** |
| قيادة جامعة | — | مؤشرات تنفيذية + أداء المعالجة + تقرير التدقيق والأمان + تغييرات الأدوار | عالية | **مُنفذ: `staff_activity_by_role` + مؤشرات الطلبات/المالية**؛ التدقيق/الأدوار = فجوة موثقة |

الجدول الكامل الآلي في `src/lib/reports/report-catalog.ts` (17 مدخلاً: 7 delivered / 3 existing / 7 gap) مع اختبارات تضمن سلامته.

## 2. الشريحة المُنفذة (المطلب 2)

### 2.1 مكتبة التجميع المشتركة — `src/lib/reports/aggregate.ts`
- **aggregate-only:** بنية `AggregateReport` مغلقة (reportId/title/beneficiary/minimumCellSize/kpis/tables) + `assertAggregateReportSafe` يمشي على البنية ويرفض أي مفتاح خارج القائمة البيضاء — دفاع بالعمق ضد إعادة إدخال حقول مُعرّفة للأشخاص (نفس عقد graduates-affairs المدموج).
- **حجب الخلايا بنمط `GREATEST(COALESCE(min,5),3)`:** `resolveMinimumCellSize` (افتراضي 5، أرضية مطلقة 3) + `privacySafeCount/Sum/Average/Ratio` — كل مقياس دون العتبة يُرجع `{total:null, suppressed:true}`.
- **fail-closed:** مدخلات غير صالحة (سالب/NaN/∞/فوج صغير) ⇒ حجب.
- **بلا تسريب عبر الترتيب:** `countByGroup` يرتب بالمفتاح أبجدياً فقط — لا بعدّ الخلايا — حتى لا يكشف الترتيب أحجام الخلايا المحجوبة.

### 2.2 البناة الثلاثة (صفوف مجهولة الهوية ⇒ تقارير مجمعة)
| الباني | التقرير | يسد فجوة | ملاحظات العقد |
|---|---|---|---|
| `buildRequestsAggregateReport` | `student_requests_overview` | حرجة (عميد/شؤون طلاب/قيادة) | KPIs (إجمالي/معتمد/مرفوض/قيد المعالجة/معاد/نسبة اعتماد %/متوسط أيام) + جداول بالنوع/الحالة/البرنامج/المستوى/أعمار الطلبات قيد المعالجة. حالات خام غير معروفة ⇒ دلو «أخرى» مرئي (لا يُسقَط أي صف). خريطة الحالات `REQUEST_STATUS_GROUP_MAP` قابلة للتوسيع عند التبني. |
| `buildStaffActivityReport` | `staff_activity_by_role` | عالية (قيادة/عميد) | تجميع على مستوى **الدور الوظيفي لا الفرد** — قرار حوكمة fail-closed؛ الأداء الفردي مُستبعد تصميمياً (فجوة موثقة تحتاج قرار حوكمة). مصفوفة دور×نوع إجراء بحجب مستقل لكل خلية. |
| `buildFinanceSummaryReport` | `finance_summary` | عالية (مالية/قيادة) | مجاميع لكل فوج مع حجب الفوج الصغير (مجموع فوج صغير يسرب مبلغ فرد). «المتبقي المستحق» لا يظهر إلا إذا استوفت **كل** الأفواج المساهمة العتبة (الطرح من مجموع ظاهر كان سيسرب المحجوب). العملة تُوحَّد من المُستدعي (موثق). |

### 2.3 اللوحات العرضية (بلا شبكة)
- `src/components/reports/AggregateReportView.tsx` — عارض عام: بطاقات KPI + جداول؛ الخلية المحجوبة تُعرض «محجوب» (بصرية + aria-label)، ولا تُعرض قيمة محجوبة إطلاقاً.
- `src/components/dashboards/RequestsAggregateDashboard.tsx` — عميد/شؤون طلاب/قيادة.
- `src/components/dashboards/FinanceAggregateDashboard.tsx` — مالية/قيادة.
- `src/components/dashboards/StaffActivityDashboard.tsx` — قيادة/عميد.
- كل لوحة **fail-closed**: تُعيد `null` إن أُعطيت نوع تقرير غير نوعها (`reportId !== …`). RTL عربي + Tailwind بأنماط المشروع. **لا routes أُضيفت** — التوصيل في `/admin/reports` متابعة لاحقة (يتطلب server functions وتجديد routeTree — خارج «بلا شبكة» وخارج النطاق).

## 3. التحقق المحلي (المطلب 3)

| الفحص | الأداة | النتيجة |
|---|---|---|
| Unit + عقود | bun test `tests/reports/` (3 ملفات) | **50/50 ناجح، 206 expect()** |
| TypeScript صارم | tsc 7.0.2 (sandbox ES2023، paths `@/*`) على 12 ملفاً | **0 أخطاء** |
| بلا شبكة | عقد ساكن: لا `fetch(`/axios/`@supabase`/`createServerFn`/`XMLHttpRequest` في المكونات الأربعة | ناجح |
| حجب خلية فرعية داخل تقرير غير محجوب | حالات إثبات في `report-builders.test.ts` (نوع طلب صغير داخل by_type؛ خلية دفعة صغيرة داخل period_amounts؛ خلية دور صغيرة داخل المصفوفة) | ناجح |
| fail-closed على فروق المجاميع | «المتبقي المستحق» محجوب عند حجب أي فوج مساهم، ويظهر (1125) عند استيفاء الكل | ناجح |
| الترتيب لا يسرب أحجاماً | `countByGroup` يرتب أبجدياً («ب» بعدد 1 تسبق «ت» بعدد 2) | ناجح |

ملاحظة: ترتيب الأحرف العربية في الاختبارات تحقق منه فعلياً عبر `localeCompare(..., "ar")` (أ، ب، ت).

## 4. الملفات (13)

```
src/lib/reports/aggregate.ts                      — البنى المشتركة + الحجب + فاحص الأمان
src/lib/reports/request-reports.ts                — باني طلبات الطلاب
src/lib/reports/staff-activity-reports.ts         — باني نشاط الموظفين (حسب الدور)
src/lib/reports/finance-reports.ts                — باني الملخص المالي
src/lib/reports/report-catalog.ts                 — كتالوج المستفيدين/الفجوات (17 مدخلاً)
src/components/reports/AggregateReportView.tsx    — العارض العام
src/components/dashboards/RequestsAggregateDashboard.tsx
src/components/dashboards/FinanceAggregateDashboard.tsx
src/components/dashboards/StaffActivityDashboard.tsx
tests/reports/aggregate.test.ts                   — 17 اختباراً
tests/reports/report-builders.test.ts             — 22 اختباراً
tests/reports/report-catalog-and-contracts.test.ts — 11 اختباراً
docs/REPORTS-AND-DASHBOARDS-COMPLETION-01-REPORT.md — هذا التقرير
```

## 5. الفجوات المتبقية (follow-ups موثقة في الكتالوج)

1. `audit_security_report` (قيادة، عالية) — قسم التدقيق والأمان.
2. `department_academic_load` (رئيس قسم، عالية) — لوحة العبء بصلاحية رئيس قسم.
3. `faculty_teaching_load` (عميد، متوسطة) — قسم أعضاء هيئة التدريس.
4. `role_changes_report` (قيادة، متوسطة).
5. `documents_services_report` (شؤون طلاب، منخفضة).
6. `per_person_staff_performance` (قيادة، عالية) — **مُستبعد تصميمياً**؛ يحتاج قرار حوكمة صريحاً.
7. `reports_pagination` (عميد، منخفضة).
8. توصيل اللوحات في `/admin/reports` عبر server functions + تجديد routeTree — مهمة لاحقة خارج نطاق «بلا شبكة».

## 6. الالتزامات

- لم تُنشأ/تُعدَّل migrations، ولا SQL مطبق، ولا routes، ولا دمج. فرع واحد + PR واحد.
- خرائط التطبيع (حالات الطلبات/أنواع إجراءات الموظفين/أنواع القيود) قابلة للتوسيع عند التبني؛ غير المعروف يُحسب في دلو مرئي ولا يُسقَط.
