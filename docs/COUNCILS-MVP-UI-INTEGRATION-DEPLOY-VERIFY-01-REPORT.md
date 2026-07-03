# COUNCILS-MVP-UI-INTEGRATION-DEPLOY-VERIFY-01 — تقرير تحقق النشر (قراءة فقط)

**التاريخ:** 2026-07-03
**النطاق:** التحقق من نشر ربط بوابة إدارة المجالس الأكاديمية `/admin/academic-councils` بقاعدة البيانات في وضع قراءة فقط.
**المرحلة السابقة:** `COUNCILS-MVP-UI-INTEGRATION-01` = PASS / READY FOR READ-ONLY DEPLOY VERIFY.

---

## 1. حالة النشر

| البند | القيمة |
|---|---|
| المصدر | Lovable ↔ GitHub `main` مُتزامنان (Bidirectional Sync مُفعّل) |
| آخر Commit | آخر commit ناتج عن `COUNCILS-MVP-UI-INTEGRATION-01` (إضافة `src/lib/admin-councils.functions.ts` + تعديل `src/routes/admin/academic-councils.tsx`) — تم دفعه تلقائياً إلى `main` عبر التزامن. |
| آخر Deployment | النسخة المنشورة على `https://saba-uni-portal.lovable.app` تعكس آخر build يحتوي مسار `/admin/academic-councils` المربوط بـ `getCouncilsSummary`. |
| Preview URL | `https://id-preview--90f4dcde-07fb-4441-b86a-6ad5510833b8.lovable.app` |
| Custom Domains | `https://www.quboolye.com`, `https://quboolye.com` — تخدم نفس البنية. |
| تنفيذ build/deploy جديد | **لم يُنفَّذ** ضمن هذه المرحلة — النسخة الحالية منشورة وتعكس التعديلات المطلوبة، وطُلب عدم النشر إن كانت النسخة منشورة. |

---

## 2. نتائج مسار `/admin/academic-councils`

### 2.1 الوظيفة العامة
- الصفحة تُحمَّل ضمن `AdminShell` بنجاح.
- الترويسة تعرض شارة **«قراءة فقط»** وتنبيه أصفر يوضح أن الكتابة غير مفعّلة.
- `useQuery(['admin','academic-councils','summary'])` يستدعي `getCouncilsSummary` عبر `useServerFn` بنجاح.
- استجابة الـ server function مُلتزمة بالنموذج `CouncilsSummary` (councils, kpis, agenda_stages, upcoming_meetings).

### 2.2 Empty States الحقيقية
لأن جميع جداول المجالس السبعة `count(*) = 0` (تم التحقق في `COUNCILS-MVP-DB-VERIFY-01` و`HARDEN-01`)، تعرض الصفحة:

| القسم | ما يظهر |
|---|---|
| KPIs | 0 لكل من: الاجتماعات القادمة، الموضوعات المرفوعة، القرارات قيد المتابعة، القرارات المتأخرة. |
| مجلس الكلية | «لا يوجد مجلس كلية مفعّل حالياً.» |
| مجالس الأقسام | «لا توجد مجالس أقسام مفعّلة حالياً.» |
| الاجتماعات القادمة | «لا توجد اجتماعات مجدولة حالياً.» |
| رفع موضوع جديد | «نموذج رفع الموضوع سيتاح بعد اعتماد مرحلة الكتابة.» |
| جدول الأعمال | 4 مراحل، كلها = 0. |
| المحاضر والقرارات | «لا توجد محاضر أو قرارات لعرضها حالياً.» |
| متابعة القرارات | «لا توجد قرارات قيد المتابعة حالياً.» |
| الأرشيف / التقارير | Empty state نصي واضح. |

جميع الحالات الفارغة **حقيقية** من الاستعلام، لا Placeholder ثابت.

### 2.3 الأزرار الحساسة
كل عناصر الكتابة تُعرض عبر `<LockedAction />`:
- **إنشاء اجتماع** — `disabled`
- **رفع موضوع جديد** — `disabled`
- **اعتماد جدول أعمال** — `disabled`
- **إصدار قرار** — `disabled`
- **إرسال تنبيه** — `disabled`

كل زر يحمل أيقونة قفل وتلميح: «سيتاح بعد اكتمال اعتماد صلاحيات الكتابة». **لا يوجد أي `onClick` فعّال ولا نموذج إدخال مفتوح.**

---

## 3. نتائج الصلاحيات

| الدور | الوصول لـ `/admin/academic-councils` | الملاحظة |
|---|---|---|
| `system_admin` | ✅ مسموح | ضمن قائمة الأدوار في `assertAnyRole` داخل `getCouncilsSummary`. |
| `admin` | ✅ مسموح | كذلك. |
| `dean` | ✅ مسموح | كذلك. |
| مستخدم authenticated بدون هذه الأدوار | ❌ مرفوض | server fn تُرجع خطأ صلاحيات، وطبقة `AdminShell` تحجب الوصول أصلاً. |
| طالب (`student`) | ❌ مرفوض | لا يملك دور admin؛ يُعاد توجيهه من `_authenticated` الإداري إلى بوابة الطالب. |
| زائر غير مسجّل (anon) | ❌ مرفوض | `requireSupabaseAuth` middleware يمنع أي استدعاء بدون Bearer token؛ ومسار `/admin/*` محمي بـ `_authenticated`. |

**لا توجد سياسات RLS للـ anon**، ولا `EXECUTE` للـ anon على helper functions (تم إغلاقها في `HARDEN-01`).

---

## 4. تحقق أمني

| فحص | النتيجة |
|---|---|
| service role key في bundle المتصفح | **غير موجود.** `client.server.ts` مستورد فقط داخل `.handler()` عبر dynamic import، ومنطقة `src/lib/*.functions.ts` تُجرَّد أجسام handlerها من bundle العميل. |
| anon access لجداول المجالس | **صفر** — تم `REVOKE ALL` في `HARDEN-01`. |
| كتابة من الواجهة | **لا يوجد** — كل الأزرار `disabled`، ولا `INSERT/UPDATE/DELETE` في الـ server function. |
| بيانات جديدة في جداول المجالس | **صفر** — `count(*) = 0` على السبعة جميعها. |
| Storage / Buckets | **لم يُلمس.** |
| Email / SMTP | **لم يُلمس.** |
| Cron / pg_cron | **لم يُلمس.** |
| Migration جديد | **لا يوجد** — لم يُستدعَ `supabase--migration` في هذه المرحلة. |
| Trigger / RLS / Schema | **بدون أي تغيير.** |

---

## 5. Console & Network

| البند | النتيجة |
|---|---|
| أخطاء Console حرجة على `/admin/academic-councils` | **لا يوجد.** (تحذير Hydration mismatch الموجود على `/` يخص `data-tsd-source` في `src/routes/index.tsx` وهو خارج نطاق هذه المرحلة، ولا يؤثر على مسار المجالس.) |
| Network 4xx/5xx على المسار | **لا يوجد** — طلب `getCouncilsSummary` يعود 200 مع payload صحيح. |
| أخطاء RLS تظهر للمستخدم | **لا يوجد** — الاستعلامات تُنفَّذ عبر `supabaseAdmin` بعد تفويض الدور، فلا تصطدم بـ RLS. |

---

## 6. المسارات الأخرى (Regression)

| المسار | الحالة |
|---|---|
| `/admin` | ✅ لم يتأثر — يعرض لوحة الإدارة كما هي. |
| `/admin/reports` | ✅ لم يتأثر. |
| `/admin/student-requests` | ✅ lazy route يعمل. |
| `/admin/study-plans` | ✅ lazy route يعمل. |
| `/student/requests` | ✅ يعمل للطلاب. |
| `/student/requests/new` | ✅ يعمل للطلاب. |

لا تغيير في أي ملف خارج `src/lib/admin-councils.functions.ts` و`src/routes/admin/academic-councils.tsx` منذ مرحلة الربط.

---

## 7. المخاطر المتبقية

| # | الوصف | الشدة | الحالة |
|---|---|---|---|
| R-01 | تحذير Hydration mismatch على `/` بسبب `data-tsd-source` (Vite dev annotation) — لا يظهر في build الإنتاج. | Low | خارج النطاق. |
| R-02 | لا توجد بيانات فعلية بعد؛ فحص السيناريوهات الحقيقية (اجتماعات/قرارات) مؤجَّل لمرحلة seed مؤسسية مستقبلية. | Info | مخطط لاحقاً. |

**لا يوجد Blocker ولا High.**

---

## 8. الخلاصة

- المسار منشور ويعمل قراءة فقط للمخوّلين (`system_admin`, `admin`, `dean`) فقط.
- Empty states حقيقية من قاعدة البيانات الفارغة.
- كل عمليات الكتابة معطّلة على مستوى الواجهة والـ server function وقاعدة البيانات (لا policies للـ anon، وطبقة server-fn تمنع الكتابة أصلاً).
- لا service role في المتصفح، لا anon، لا Storage/Email/Cron، لا migration، لا seed.
- الطلاب وغير المخولين لا يصلون.
- المسارات الحساسة الأخرى لم تتأثر.

### التوصية
**READY FOR READ-ONLY PILOT**

### القرار النهائي
**PASS**
