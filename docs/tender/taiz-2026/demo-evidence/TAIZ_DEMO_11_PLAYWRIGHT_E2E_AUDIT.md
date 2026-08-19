# تقرير اختبارات Playwright E2E الحقيقية والتفاعل الحي عبر الخوادم المحلية
## Real Playwright E2E & Live Server Browser Execution Audit (05F)

| المعرّف الفني | `TAIZ-TENDER-DEMO-11-PLAYWRIGHT-E2E` |
|---|---|
| **المتصفح** | Playwright Chromium Headless |
| **طريقة الاستدعاء** | `page.goto("http://127.0.0.1:<port>/tender-demo")` (Zero `page.setContent()`) |
| **الخوادم الحية** | Real Local SSR Servers on Ports 3195 & 3196 |
| **نتيجة الاختبار** | **100% PASS across Both Operational Phases** |

---

## 1. تفاصيل المرحلتين التشغيليتين (Phase 1 & Phase 2)

### المرحلة الأولى: تدقيق الإنتاج / Demo-Off (Port 3195)
1. تنفيذ بناء نظيف مع تعطيل العرض التجريبي (`VITE_TAIZ_TENDER_DEMO=false`).
2. تشغيل خادم SSR حقيقي على المنفذ `3195`.
3. فتح المسار عبر المتصفح: `page.goto("http://127.0.0.1:3195/tender-demo")`.
4. التحقق من الاستجابة:
   - `DEMO_OFF_HTTP_STATUS=200`
   - `DEMO_OFF_VIEW=SECURE_NOT_AVAILABLE_VIEW` (عرض صفحة 404 الأمنية «الصفحة غير متوفرة»)
   - `DEMO_OFF_CORPUS_EXPOSURE=NONE` (غياب تام لنصوص اللوائح والبيانات التجريبية من الـ DOM)
   - `DEMO_OFF_EXTERNAL_REQUESTS=0` (عدم وجود أي تسريب شبكي خارجي)
5. إيقاف الخادم وتنظيف العمليات.

### المرحلة الثانية: تدقيق العرض التفاعلي / Demo-On (Port 3196)
1. تنفيذ بناء تفاعلي مع تفعيل العرض التجريبي (`VITE_TAIZ_TENDER_DEMO=true`).
2. تشغيل خادم SSR حقيقي على المنفذ `3196`.
3. فتح المسار عبر المتصفح: `page.goto("http://127.0.0.1:3196/tender-demo")`.
4. التفاعل المباشر مع المشاهد الثلاثة:
   - **المشهد 1 (MultiSite CMS)**: استعراض بيانات الكليات والتحقق من النطاق `med.taiz.edu.ye`.
   - **المشهد 2 (Local Lexical RAG)**: النقر على التبويب، كتابة سؤال حقيقي في حقل الإدخال، النقر على زر «بحث واسترجاع نصي»، والتحقق من الاستجابة الحية واستخراج استشهاد «المادة 45».
   - **المشهد 3 (Performance & QA)**: النقر على التبويب، التحقق من ظهور مؤشرات الدقة ومعدلات الأداء.
5. تشغيل `AxeBuilder` على التطبيق الحي: `0 violations`.
6. إيقاف الخادم وتأكيد الاجتياز النهائي:
   - `PLAYWRIGHT_NAVIGATION_METHOD=PAGE_GOTO_REAL_SERVER`
   - `REAL_SERVER_STARTED=TRUE`
   - `DEMO_ON_INTERACTIVE=PASS_3_SCENES_INTERACTIVE`
   - `RAG_UI_QUERY_EXECUTED=PASS_CITATION_VERIFIED`
   - `AXE_RUN_AGAINST_REAL_APP=TRUE`
   - `AXE_VIOLATIONS=0`
   - `EXTERNAL_REQUESTS_OBSERVED=0`
