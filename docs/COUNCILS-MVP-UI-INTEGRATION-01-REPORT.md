# COUNCILS-MVP-UI-INTEGRATION-01 — تقرير تنفيذ

## القرار النهائي
**PASS** — READY FOR READ-ONLY DEPLOY VERIFY

---

## 1) الملفات المُعدَّلة / المُنشأة
- ✳️ جديد: `src/lib/admin-councils.functions.ts`
  - `getCouncilsSummary` (SELECT فقط) عبر `createServerFn` + `.middleware([requireSupabaseAuth])` + `assertAnyRole(["system_admin","admin","dean"])`.
  - يُعيد: قائمة المجالس، KPIs، توزيع مراحل جدول الأعمال، أقرب 5 اجتماعات قادمة.
- 🔁 مُعدَّل: `src/routes/admin/academic-councils.tsx`
  - إزالة البيانات الثابتة التوضيحية (KPIS/COUNCIL_OVERVIEW/UPCOMING_MEETINGS_PLACEHOLDER/AGENDA_STAGES).
  - استبدال البادج «قيد التأسيس» بـ «قراءة فقط» + إشعار وضوح.
  - ربط الأقسام بـ `useQuery` + `useServerFn(getCouncilsSummary)` مع empty states و loaders.
  - الإبقاء على كل `LockedAction` (إنشاء اجتماع، رفع موضوع، اعتماد جدول أعمال، إصدار قرار، إرسال تنبيه) **معطّلاً**.

لم يُلمس أي ملف آخر خارج نطاق المجالس.

## 2) نوع الربط
- قراءة فقط (SELECT + COUNT). لا `INSERT/UPDATE/DELETE` من الواجهة أو الخادم.
- كل الأزرار الحساسة `disabled` عبر `<LockedAction>`.
- لا مرفقات، لا إيميلات، لا جدولة، لا تنبيهات.

## 3) إجابات الأسئلة الإلزامية
| البند | الجواب |
|---|---|
| قراءة فقط؟ | نعم |
| تفعيل أي كتابة؟ | لا |
| إدخال بيانات؟ | لا |
| تعديل DB / RLS / Storage / Trigger؟ | لا |
| migration جديد؟ | لا |
| استخدام service role في المتصفح؟ | لا — `supabaseAdmin` يُستخدم داخل `.handler()` فقط بعد `assertAnyRole`، ولا يُصدَّر لأي وحدة مستوردة من العميل. |
| seed data؟ | لا |
| إيميلات / Cron / Bucket؟ | لا |
| تعديل جداول خارج المجالس؟ | لا |
| فتح الصفحة لأدوار جديدة؟ | لا — الأدوار المسموحة بقيت `system_admin`, `admin`, `dean` (متطابقة مع `admin-nav.ts:85`). |

## 4) نموذج الأمان
- الطبقة 1 — Route guard: `/admin` layout يعيد التوجيه لغير المصادَق (verified: HTTP 302 على `/admin/academic-councils`).
- الطبقة 2 — Server fn middleware: `requireSupabaseAuth` يرفض الطلبات بلا bearer.
- الطبقة 3 — Authz: `assertAnyRole(["system_admin","admin","dean"])` يُطلق خطأ برسالة عربية.
- الطبقة 4 — DB: RLS مفعّل على السبعة جداول، وanon مُقصى (COUNCILS-MVP-DB-HARDEN-01).
- الطبقة 5 — العميل لا يستورد `client.server` (import محصور داخل `.functions.ts` على الخادم).

## 5) نتائج التحقق
- **typecheck**: `bunx tsgo --noEmit` → PASS (0 مخرجات، exit 0).
- **مسار الصفحة**: `/admin/academic-councils` → 302 لغير المصادَق ← سلوك متوقّع.
- **empty states حقيقية**: `getCouncilsSummary` يستعلم مباشرةً؛ الجداول فارغة (`count=0`) لذا الواجهة تعرض:
  - «لا يوجد مجلس كلية مفعّل حالياً.»
  - «لا توجد مجالس أقسام مفعّلة حالياً.»
  - «لا توجد اجتماعات مجدولة حالياً.»
  - «لا توجد قرارات قيد المتابعة حالياً.»
  - KPIs = 0.
- **RLS**: `academic_council*` جميعها `relrowsecurity=t`، لم يُلمس.
- **anon**: لا صلاحيات (تم في مرحلة HARDEN).
- **service role في المتصفح**: لا (grep على `src/routes` و`src/components` لا يُظهر استيراد `client.server`).
- **build**: يُدار تلقائياً بواسطة النظام؛ لا تحذيرات جديدة من التعديل (typecheck نظيف والاستيرادات كلها قائمة).

## 6) المسارات الأخرى — عدم التأثير
تعديلات هذه المرحلة محصورة في:
- ملف جديد واحد تحت `src/lib/`.
- ملف واحد تحت `src/routes/admin/academic-councils.tsx`.

لا يوجد استيراد لأيٍّ منهما من:
`/admin`, `/admin/reports`, `/admin/student-requests`, `/admin/study-plans`, `/student/requests`, `/student/requests/new` — سليمة.

## 7) المخاطر المتبقية
- **Low**: لا cache invalidation عند وصول بيانات مستقبلاً (`staleTime: 30s`) — مقبول لواجهة قراءة.
- **Low**: عرض «الأعضاء» يعتمد على `active_to IS NULL` وليس على `is_active` — متوافق مع سياسة الترشيح.
- **Info**: تحذيرات linter العامة (Public Buckets / SECURITY DEFINER) من مراحل سابقة لا تخص هذه المرحلة.
- **Blockers**: لا.

## 8) التوصية
**READY FOR READ-ONLY DEPLOY VERIFY** — يمكن الانتقال إلى مرحلة تحقّق النشر (COUNCILS-MVP-UI-INTEGRATION-DEPLOY-VERIFY-01) قبل أي مرحلة كتابة.
