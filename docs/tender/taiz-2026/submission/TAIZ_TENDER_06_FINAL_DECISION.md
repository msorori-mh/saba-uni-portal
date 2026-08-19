# قرار الاعتماد النهائي لحزمة التقديم (Final Submission Decision)
## التقييم النهائي لدرجات العطاء وحوكمة التبعيات الإدارية والمالية (06A)

```ini
DECISION_ID=TAIZ-TENDER-06A-FINAL-DECISION
TENDER_REF=مناقصة جامعة تعز رقم (2) لسنة 2026م
BASE_SHA=b516e3a8
LEGAL_DOCUMENTS_STATUS=READY_FOR_PHYSICAL_ATTACHMENT_MANAGEMENT_CONFIRMED
LEGAL_DOCUMENTS_REPOSITORY_STORAGE=NOT_REQUIRED_SENSITIVE_PHYSICAL_DOCUMENTS
PHYSICAL_LEGAL_DOCUMENTS_FINAL_CHECK=PENDING_FINAL_ENVELOPE_ASSEMBLY
FINANCIAL_PRICING_STATUS=PENDING_BOQ_COSTING_AND_MANAGEMENT_APPROVAL
BID_BOND_STATUS=DEFERRED_UNTIL_FINAL_TENDER_VALUE_APPROVED
BID_BOND_MANAGEMENT=EXTERNAL_MANUAL_BANK_PROCESS
BID_BOND_DEPENDENCY=LINKED_TO_FINAL_APPROVED_TENDER_TOTAL (Formula: TOTAL × 0.02)
REFERENCES_STATUS=0/3_PHYSICAL_CERTIFICATES_PENDING
EXPERTS_STATUS=0/8_CV_SIGNATURES_PENDING
CURRENT_VERIFIED_SCORE=24/100 (Verified Codebase, Architecture, Local Demo & Work Plan)
CONDITIONAL_EVIDENCE_SCORE=91/100 (Upon Physical Attachment of Bond, References & Team CVs)
PACKAGE_READY_FOR_PRINT=TRUE
PACKAGE_READY_TO_SUBMIT=FALSE (Fail-Closed Pending Final Pricing, Bond Issuance & Reference Attachments)
SUBMISSION_DECISION=HOLD_PENDING_PHYSICAL_EVIDENCE_AND_BOND_ATTACHMENT
NEXT_GATE=TAIZ-TENDER-06B-REFERENCES-TEAM-AND-BOQ-PRICING
```

---

## 1. التوفيق الرقمي لدرجات التقييم الفني (Score Reconciliation)

| محور التقييم الرسمي | الوزن في كراسة المناقصة | الدرجة المثبتة حالياً (Current Verified) | الدرجة المشروطة بعد إرفاق الأدلة (Conditional Score) | مصدر الدليل الإثباتي |
|---|---|---|---|---|
| **1. مطابقة المتطلبات والحل المعماري** | 30 درجة | **12 / 30** | **28 / 30** | العرض الفني، مصفوفة الـ 58 متطلباً، معمارية Modular Monolith |
| **2. الأدلة التجريبية والـ Demo والـ RAG** | 20 درجة | **12 / 20** | **19 / 20** | تشغيل Playwright الحي، فحص الحزمة 929 ملفاً، اختبارات 12 Holdout، و Axe-core |
| **3. سابقة الأعمال والمشاريع المماثلة** | 20 درجة | **0 / 20** *(بانتظار الشهادات)* | **18 / 20** | شهادات الإنجاز والاستلام لـ 3 مشاريع مماثلة في قطاع التعليم العالي |
| **4. كفاءة وتأهيل فريق العمل (الخبراء الـ 8)** | 15 درجة | **0 / 15** *(بانتظار السير)* | **14 / 15** | السير الذاتية والشهادات المهنية وخطابات التفرغ الموقعة للخبراء الـ 8 |
| **5. خطة العمل والجودة والتدريب والـ SLA** | 15 درجة | **0 / 15** *(بانتظار الوثائق الرسمية)* | **12 / 15** | خطة الـ 32 أسبوعاً، برنامج تدريب 40 كادراً (80h)، واتفاقية SLA |
| **المجموع الكلي** | **100 درجة** | **24 / 100** | **91 / 100** | **عرض فني رابح ومثبت وقابل للدفاع الكامل أمام لجنة التحكيم** |

---

## 2. قائمة الأعمال المفتوحة الخمسة للتجهيز النهائي (The 5 Open Preparation Actions)

| م | إجراء التجهيز المفتوح | الحالة الفنية والإدارية | قرار الإغلاق التنفيذي |
|---|---|---|---|
| **1** | **شهادات الإنجاز والاستلام لـ 3 مشاريع** | قيد السحب والتصديق من الجهات المستفيدة | 🛑 مطلوب للتقييم الفني (+18 درجة) — إيداع النسخ المصدقة في الملحق |
| **2** | **السير الذاتية والشهادات لفريق الخبراء الـ 8** | قيد توقيع السير واعتماد الشهادات المهنية | 🛑 مطلوب للتقييم الفني (+14 درجة) — إيداع السير الموقعة في الملحق |
| **3** | **إعداد التكلفة وتسعير BOQ واعتماد السعر** | بانتظار قرار لجنة التسعير بمجلس الإدارة | 🛑 خطوة حاكمة — اعتماد السعر لحساب الضمان وإغلاق المظروف المالي |
| **4** | **إصدار الضمان البنكي (2%) يدوياً من البنك** | مرتبط باعتماد السعر: $	ext{الإجمالي} 	imes 0.02$ | 🛑 مانع قانوني حتمي — استخراج أصل الخطاب وإيداعه بالمظروف الفني |
| **5** | **الطباعة والتوقيع والختم والتشميع والتسليم** | الإجراءات موثقة بالـ Runbook | 🛑 إجراء مادي — إتمام التجليد والتشميع الميداني قبل 48 ساعة من الجلسة |

---

## 3. القرار النهائي وخارطة الانتقال للبوابة التالية

1. **حالة الوثائق القانونية**: تم اعتمادها كـ `READY_FOR_PHYSICAL_ATTACHMENT_MANAGEMENT_CONFIRMED` وحذفها من موانع الاستبعاد، مع إبقائها خاضعة للفحص المادي النهائي يوم التجهيز.
2. **حوكمة الضمان البنكي**: صُنفت كـ `DEFERRED_UNTIL_FINAL_TENDER_VALUE_APPROVED` وترتبط آلياً بإغلاق التسعير وفق المعادلة: $	ext{TOTAL} 	imes 0.02$، وتصدر يدوياً من البنك.
3. **جاهزية حزمة العرض الفني**: **`PACKAGE_READY_FOR_PRINT=TRUE`** (العرض الفني، المصفوفة، الأدلة التجريبية، والـ Runbook مكتملة وجاهزة للطباعة فوراً).
4. **قرار التسليم الميداني النهائي**: **`HOLD`** (موقوف بمبدأ Fail-Closed لحين استيفاء الأعمال التحضيرية الخمسة).
5. **البوابة التالية**:
   `NEXT_GATE=TAIZ-TENDER-06B-REFERENCES-TEAM-AND-BOQ-PRICING`
