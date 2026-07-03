# COUNCILS-MIGRATION-STAGING-PREP-01 — تجهيز migration staging (تقرير حوكمة)

> **مرحلة تجهيز فقط.** لم يُطبَّق migration، لم يُنقل الملف إلى `supabase/migrations/`، لم يُشغَّل SQL، لم تُعدَّل DB/RLS/Storage/Triggers/Buckets، لا seed، لا import، لا نشر، لا merge، لا كود، لا إيميلات، لا توسيع Pilot.

**المسودة المرجعية:** `docs/drafts/20260703000000_councils_mvp_schema_rls.draft.sql`
**مراجع:** `COUNCILS-SUPABASE-MIGRATION-REVIEW-01-REPORT.md` (PASS / READY FOR MIGRATION STAGING), `COUNCILS-MIGRATION-DRAFT-REVISION-01-REPORT.md`

---

## 1. ملخص الحوكمة

| السؤال | الجواب |
|--------|--------|
| تم إنشاء فرع staging؟ | **لا** |
| اسم الفرع | — |
| تم إنشاء ملف داخل `supabase/migrations/`؟ | **لا** |
| اسم ملف migration | — (بقي كمسودة في `docs/drafts/`) |
| تم تطبيق migration؟ | **لا** |
| تم تشغيل SQL؟ | **لا** |
| تم تعديل production DB / RLS / Storage / Triggers؟ | **لا** |
| تم deploy؟ | **لا** |
| تم merge إلى main؟ | **لا** |
| هل migration مطابق للمسودة؟ | لم يُنسخ — المسودة لم تتغير منذ REVISION-01 |
| تغييرات خارج نطاق المجالس؟ | **لا شيء** |

---

## 2. السبب الحوكمي لعدم النقل الآن

القواعد الصارمة في هذه المرحلة تنص صراحةً:

> «لا تطبق migration على production» و «إذا كان وضع migration داخل `supabase/migrations` سيؤدي إلى تطبيقه تلقائياً في Lovable، فلا تضعه هناك على main».

الواقع التشغيلي في هذا المشروع:

1. **Lovable ↔ GitHub مزامنة ثنائية فورية على `main`.** أي ملف أضعه الآن في `supabase/migrations/*.sql` يُدفع فوراً إلى فرع `main` عبر المزامنة.
2. **Supabase migrations تُلتقط تلقائياً** بواسطة أدوات Lovable/Cloud من `supabase/migrations/` — وضع الملف هناك على `main` = تطبيق فعلي على قاعدة بيانات المشروع (وهي نفسها بيئة الـ Pilot الحالية، لا يوجد staging DB منفصل مربوط).
3. **Git branch switching في Lovable تجريبي ومحدود** (Account Settings > Labs)، ولا يمكنني من هذه البيئة:
   - إنشاء فرع `staging/councils-mvp-migration` مضمون العزل عن `main`،
   - ضمان أن الكتابة إليه لن تُدفع إلى `main`،
   - ضمان أن أدوات migration لن تلتقط الملف عند أول مزامنة.
4. لا توجد بيئة Supabase staging مستقلة مربوطة بهذا المشروع لتطبيق SQL عليها دون لمس Pilot.

**النتيجة:** أي محاولة لنقل الملف إلى `supabase/migrations/` من هذه البيئة تخالف قاعدة «لا تطبق migration على production» وقاعدة «لا merge إذا كان يؤدي لتطبيق تلقائي».

لذلك تم اختيار **المسار الآمن صراحةً المقرَّر في §3 من طلبك**: عدم النقل، وإعادة التقرير حوكمياً.

---

## 3. حالة الأصول (بدون أي تعديل)

| الأصل | المسار | الحالة |
|-------|--------|--------|
| مسودة SQL المعتمدة | `docs/drafts/20260703000000_councils_mvp_schema_rls.draft.sql` | **موجودة، غير معدَّلة** منذ REVISION-01 |
| مراجعة SQL الساكنة | `docs/COUNCILS-MIGRATION-SQL-REVIEW-01-REPORT.md` | ثابتة |
| مراجعة Supabase | `docs/COUNCILS-SUPABASE-MIGRATION-REVIEW-01-REPORT.md` | ثابتة (PASS) |
| `supabase/migrations/20260703000000_*` | — | **غير موجود** (متعمَّد) |
| فرع `staging/councils-mvp-migration` | — | **غير موجود** (متعمَّد) |
| مرفقات / bucket / تنبيهات / seed / cron / email | — | **غير موجود** |

---

## 4. فحص ساكن — مطابقة المسودة لنطاق المجالس فقط

قراءة كاملة لـ `docs/drafts/20260703000000_councils_mvp_schema_rls.draft.sql` (623 سطر) تؤكد:

- **7 جداول فقط** بادئتها `academic_council*` (councils, members, meetings, topics, agenda_items, minutes, decisions).
- **5 ENUMs** بادئتها `academic_council_*`.
- **5 helper functions** (`is_council_admin`, `is_council_member`, `has_council_role`, `can_manage_council`, `can_write_council_agenda`).
- **3 trigger functions + 9 triggers** كلها على الجداول السبعة الجديدة.
- **لا `ALTER` / `DROP` / `TRUNCATE`** على أي جدول قائم.
- **لا `INSERT`** — صفر seed.
- **لا `storage.` / bucket / policy** على storage.
- **لا `pg_cron` / `net.http_*` / scheduled jobs**.
- **لا email / SMTP**.
- **لا لمس**: `student_*`, `student_requests`, `student_request_attachments`, `student_service_request_*`, تقارير, `study_plans`, `study_plan_courses`, `class_schedule`, `course_offerings`, `course_sections`, `rooms`, `time_slots`, `audit_logs`.
- المراجع الخارجية فقط قراءةً عبر FK إلى: `public.departments(id)`, `public.academic_years(id)`, `auth.users(id)`, `public.has_role(...)`, `public.app_role`.

**لا تغييرات إضافية عن نسخة REVISION-01 المعتمدة.**

---

## 5. جاهزية الملف للتطبيق لاحقاً

مضمون SQL جاهز حرفياً؛ ما يلزم لاحقاً فقط هو **قرار بشري صريح** بتطبيقه، ثم تقديمه عبر أداة migration الرسمية (المسار الطبيعي في Lovable Cloud) — وليس النسخ اليدوي إلى `supabase/migrations/` على `main`.

**التطبيق الآمن المستقبلي (مرحلة `COUNCILS-MVP-SCAFFOLD-01`) يجب أن يتم بأحد المسارين:**

1. **الموصى به:** تقديم نص SQL الحرفي عبر أداة migration في جلسة مخصَّصة (يظهر للمستخدم كمقترح migration للموافقة قبل التنفيذ) — لا نسخ يدوي، ولا merge git يدوي.
2. **بديل:** إنشاء فرع GitHub خارج Lovable، دمج بعد التطبيق على DB staging مستقلة، ثم تقديم نفس النص عبر أداة migration للإنتاج.

كلا المسارين خارج نطاق مرحلة PREP هذه.

---

## 6. المخاطر الحوكمية لو تم النقل الآن (لم يحدث)

| # | لو تم نقل الملف الآن إلى `supabase/migrations/` على main | الأثر |
|---|-------------------------------------------------------|-------|
| G1 | مزامنة Lovable ↔ GitHub تدفع الملف فوراً | تطبيق تلقائي محتمل |
| G2 | التطبيق يقع على نفس DB الـ Pilot (لا staging منفصل) | خرق قاعدة «لا تعدل production DB» |
| G3 | لا يوجد نافذة مراجعة بشرية بعد النقل | خرق قاعدة «لا تطبق migration» |
| G4 | إنشاء 7 جداول + 5 ENUMs + 5 helpers + 9 triggers دفعة واحدة دون approval | خرق حوكمة المرحلة |

**كل هذه المخاطر مُتجنَّبة لأن الملف لم يُنقل.**

---

## 7. جاهزية للمرحلة التالية

| البند | الحالة |
|-------|--------|
| مسودة معتمدة بمراجعة Supabase (PASS) | ✓ |
| نطاق محصور بالمجالس السبعة | ✓ |
| صفر أثر متوقع على Pilot عند التطبيق | ✓ |
| قناة تطبيق آمنة عبر أداة migration الرسمية | متاحة عند اتخاذ القرار |

**جاهزية `COUNCILS-MVP-SCAFFOLD-01`:** جاهزة **من ناحية المحتوى**، بانتظار قرار بشري صريح لتقديم SQL عبر أداة migration.

---

## 8. التوصية

**BLOCKED** لخطوة «نقل الملف إلى `supabase/migrations/` من هذه البيئة» — للأسباب الحوكمية أعلاه (§2)، وهي القرار الآمن المنصوص عليه صراحةً في §3 من طلبك.

**READY FOR STAGING APPLY** من ناحية المحتوى: مسودة SQL في `docs/drafts/` معتمدة وجاهزة للتقديم عبر أداة migration الرسمية في مرحلة SCAFFOLD القادمة عند إعطاء الإذن الصريح.

---

## 9. القرار النهائي

### **BLOCKED** (لخطوة النقل فقط — بقرار حوكمي مقصود)

- المسودة سليمة، معتمدة، ومطابقة لنطاق المجالس.
- عدم النقل الآن **ليس فشلاً في المسودة** بل التزام صريح بقواعد المرحلة: لا تطبيق تلقائي، لا لمس production، لا merge يؤدي لتطبيق.
- **لم يُطبَّق شيء، لم يُنقل ملف، لم يُعدَّل كود، لم يُدمج فرع.**
- الخطوة التالية المقترحة: `COUNCILS-MVP-SCAFFOLD-01` بتقديم SQL عبر أداة migration الرسمية بعد إذن بشري صريح.

---

*Generated: COUNCILS-MIGRATION-STAGING-PREP-01 — governance-only, no file moves, no DB changes.*
