# الدليل التشغيلي لتشغيل العرض التوضيحي محلياً
## TAIZ-DEMO-01 — LOCAL DEMO OPERATOR RUNBOOK

> **الهدف:** توفير خطوات تشغيل مؤتمتة وموثقة لتشغيل بيئة العرض التفاعلي المعزول (*Isolated Demo Shell*) محلياً بدون إنترنت وتقديمها للجنة التحكيم الفنية.

---

## 1. المتطلبات والبيئة التشغيلية (Pre-requisites)

- **بيئة التشغيل:** حزمة `bun` (إصدار 1.3.14 أو أحدث) أو `Node.js v24+`.
- **الفرع المعزول:** `demo/taiz-tender-2026` في مسار العمل المعزول `C:\projects\saba-uni-portal-taiz-demo`.
- **متغير البيئة:** `VITE_TAIZ_TENDER_DEMO=true` (لتفعيل واجهة العرض التوضيحي).

---

## 2. خطوات التشغيل والإطلاق السريع (Quick Launch Steps)

```bash
# 1. الانتقال إلى مسار العمل المعزول
cd C:\projects\saba-uni-portal-taiz-demo

# 2. تشغيل الاختبارات الآلية للتحقق من جاهزية المحرك
bun test tests/tender-demo

# 3. تشغيل خادم التطوير المحلي مع تفعيل متغير الـ Demo
VITE_TAIZ_TENDER_DEMO=true bun run dev
```

- **الرابط المباشر للعرض:** افتح المتصفح على: `http://localhost:3000/tender-demo`
