# الملحق الفني للأدلة التجريبية واختبارات المتصفح المؤتمتة (Demo Evidence Annex)
## ملحق إثبات الجاهزية الفنية والمعمارية للبيئة التجريبية التفاعلية — مناقصة جامعة تعز 2026

```ini
ANNEX_ID=TAIZ-TENDER-06-DEMO-EVIDENCE-ANNEX
POC_CLASSIFICATION=ARABIC_LEXICAL_HEURISTIC_EXTRACTIVE_POC
OPERATIONAL_MODE=LOCAL_OFFLINE_ONLY (Air-Gapped Sovereign Environment)
VERIFIED_COMMIT_SHA=b516e3a8
SOURCE_BRANCH=demo/taiz-tender-2026
VERIFICATION_STATUS=100%_PASS_DEFENSIBLE_ACROSS_ALL_TEST_SUITES
```

---

## 1. التوصيف الفني الدقيق لنموذج العرض التجريبي (PoC Architecture)

حرصاً على أعلى درجات المصداقية الفنية والمواءمة الصارمة مع معايير المناقصة:
1. **طبيعة المحرك الحالي**: محرك استرجاع نصي معجمي محلي `ARABIC_LEXICAL_HEURISTIC_EXTRACTIVE_POC` يعتمد على خوارزميات المطابقة المعجمية الموزونة والتطبيع الصرفي للغة العربية (Normalizer + Prefix/Suffix Stemming + Stopwords Filter).
2. **الاستخراج بدلاً من التوليد**: يقدم المحرك استجابات استخراجية دقيقة من نصوص اللوائح الجامعية المعتمدة (Extractive Answers) دون الاعتماد على نماذج توليدية غير مقيدة.
3. **التشغيل السيادي المحلي**: تم اختبار المحرك وتشغيله محلياً بالكامل دون أي اتصال بأي خادم أو مزود ذكاء خارجي (Zero External Outbound AI Calls).
4. **حظر المصطلحات المضللة**: يمنع العرض استخدام مصطلحات رنانة غير مطبقة حالياً (مثل Semantic / Dense Embeddings / LLM In-Production / Zero Hallucination) ويصنف حالة مهايئ النماذج التوليدية المحلية بـ `NOT_IMPLEMENTED_OPTIONAL_ADAPTER_PENDING`.

---

## 2. سجل الأدلة الإثباتية ونتائج الاختبارات الآلية المثبتة

### 2.1 اختبارات Playwright E2E الشاملة ضد خوادم SSR الحية
تم تنفيذ اختبارات متصفح حقيقية مؤتمتة عبر Playwright Chromium ضد خوادم محلية حية عبر الاستدعاء المباشر `page.goto("http://127.0.0.1:<port>/tender-demo")` (مع حذف أي استخدام لـ `setContent`):

| المرحلة التشغيلية | المنفذ | مسار التنقل | الاستجابة المحققة | النتيجة |
|---|---|---|---|---|
| **Phase 1: Demo Off (Production Mode)** | `3195` | `page.goto("http://127.0.0.1:3195/tender-demo")` | `DEMO_OFF_HTTP_STATUS=200`<br>`DEMO_OFF_VIEW=SECURE_NOT_AVAILABLE_VIEW`<br>غياب تام للكوربس من الـ DOM | ✅ اجتياز مؤكد |
| **Phase 2: Demo On (Interactive Mode)** | `3196` | `page.goto("http://127.0.0.1:3196/tender-demo")` | `DEMO_ON_INTERACTIVE=PASS_3_SCENES`<br>استعراض الـ 25 كلية، كتابة استعلام حقيقي في الحقل، نقر زر البحث، وظهور استشهاد «المادة 45» في الـ DOM | ✅ اجتياز مؤكد |

### 2.2 فحص حزمة الإنتاج الصارم (Production Bundle Exclusion Audit)
- **آلية الفحص**: حذف مجلد البناء `.output/` بالكامل وتنفيذ بناء جديد مع إيقاف العلم (`VITE_TAIZ_TENDER_DEMO=false`) وفحص 100% من ملفات JS دون استثناء أي ملف (`BUNDLE_SCAN_SKIPPABLE=FALSE`).
- **عدد الملفات المفحوصة**: **929 ملفاً برمجياً**.
- **عدد الملفات المستثناة**: **0 ملفاً**.
- **نتائج مطابقة العلامات التجريبية**:
  - `TAIZ_TENDER_DEMO_ONLY`: 0 مطابقات
  - `ARABIC_LEXICAL_HEURISTIC_EXTRACTIVE_POC`: 0 مطابقات
  - `كلية الطب والعلوم الصحية - موقع تجريبي`: 0 مطابقات
  - `doc-reg-01`: 0 مطابقات
  - `MultiSiteCMSScene`: 0 مطابقات
  - `PerformanceQAScene`: 0 مطابقات
- **النتيجة**: خلو حزمة الإنتاج بنسبة 100% من أي مكونات أو نصوص تجريبية.

### 2.3 تقييم محرك الاسترجاع وبنك الأسئلة المستقل (Holdout Benchmark)
- **بنك التطوير (32 حالة)**: تقييم ديناميكي شامل لمؤشرات Recall@K و MRR مع حماية ضد الرموز الثابتة (Anti-Hardcoding Guard).
- **بنك التحقق المعزول (12 Holdout Cases)** في ملف مستقل (`holdout-questions.fixture.ts`):
  - **Recall@K (Top-3)**: عتبة القبول $\ge 0.85$ — المحقق: **1.00**
  - **MRR (Mean Reciprocal Rank)**: عتبة القبول $\ge 0.80$ — المحقق: **1.00**
  - **Citation Precision**: **1.00** (استخراج دقيق للمادة 45 وباقي المواد المرجعية)
  - **Abstention on Out-of-Scope**: **1.00** (امتناع صريح لعدم وجود نص لائحي)
  - **Prompt Injection Defense**: **1.00** (حظر فوري لمحاولات كسر السياق)

### 2.4 فحص النفاذية والامتثال (Axe-Core Accessibility Audit)
- تشغيل أداة `AxeBuilder` عبر Playwright على التطبيق الحي بعد الـ Hydration الكامل مع تفعيل فحص تباين الألوان وقواعد `WCAG 2.1 AA`.
- **النتيجة**: **`AXE_VIOLATIONS=0`** (صفر انتهاكات نفاذية عبر كافة المشاهد التفاعلية).

### 2.5 اعتراض شبكي شامل لـ 4 بروتوكولات (Multi-Protocol Network Egress)
- تم اعتراض ومراقبة 4 بروتوكولات حيوية (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`) أثناء تنفيذ 44 استعلاماً لائحياً.
- **النتيجة**: **`0 External Calls`** (تنفيذ سيادي محلي 100%).

---

## 3. القيود الحالية وخارطة التطوير للإنتاج (Known Limitations & Roadmap)

| العنصر | الحالة في العرض التجريبي (PoC) | المخطط في الإنتاج النهائي (32 أسبوعاً) |
|---|---|---|
| **نوع المحرك** | استخراج معجمي مقيد (Extractive) | محرك هجين بدمج البحث المتجهي المحلي (Qdrant + BM25) |
| **المصادقة** | محاكي اتحاد الهوية المحلي | خادم Keycloak مؤسسي كامل مع OIDC و MFA |
| **قواعد البيانات** | مستودع بيانات تجريبي مصغر | قاعدة بيانات PostgreSQL مع RLS متقدم وتشفير كامل |
