# تقرير دقة وأداء محرك الاسترجاع اللائحي المقيد (RAG Accuracy & Benchmark Report)
## Defensible Accuracy Metrics & Benchmark Suite (05F)

| المعرّف الفني | `TAIZ-TENDER-DEMO-06-RAG-ACCURACY` |
|---|---|
| **نوع المحرك** | `ARABIC_LEXICAL_HEURISTIC_EXTRACTIVE_POC` |
| **حجم الكوربس اللائحي** | 5 وثائق لائحية معتمدة (100% نصوص ولوائح أصلية) |
| **بنك أسئلة التطوير** | 32 حالة اختبار مصنفة وموزعة على 4 سيناريوهات |
| **بنك أسئلة التحقق المستقل (Holdout)** | 12 حالة اختبار معزولة بملف مستقل (`holdout-questions.fixture.ts`) |

---

## 1. نتائج بنك التحقق المستقل المعزول (12 Holdout Cases)

| المؤشر القياسي | عتبة القبول التعاقدية | النتيجة المحققة فعلياً | طريقة الحساب | الحالة |
|---|---|---|---|---|
| **Recall@K (Top-3)** | $\ge 0.85$ | **1.00** | $rac{	ext{Hits in Top 3}}{	ext{Total Ground Truth Cases}}$ | ✅ اجتياز مثبت |
| **Mean Reciprocal Rank (MRR)** | $\ge 0.80$ | **1.00** | $rac{1}{N}\sum rac{1}{	ext{rank}_i}$ | ✅ اجتياز مثبت |
| **Citation Precision** | $\ge 0.90$ | **1.00** | مطابقة المادة اللائحية المرجعية | ✅ اجتياز مثبت |
| **Abstention on Out-of-Scope** | $\ge 0.90$ | **1.00** | امتناع صريح لعدم وجود نص لائحي | ✅ اجتياز مثبت |
| **Prompt Injection Defense** | $1.00$ | **1.00** | حظر فوري لمحاولات كسر السياق | ✅ اجتياز مثبت |
