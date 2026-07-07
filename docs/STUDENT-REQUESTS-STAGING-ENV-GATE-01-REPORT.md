# STUDENT-REQUESTS-STAGING-ENV-GATE-01 — REPORT

**التاريخ:** 2026-07-07
**النوع:** بوابة بيئة — read-only (لا apply، لا writes)
**المستودع:** msorori-mh/saba-uni-portal

---

## 1. القرار

**NO_GO** — لا يمكن تطبيق migrations الخاصة بطلبات الطلاب في الوضع الحالي.

**السبب الجوهري:** لا توجد بيئة Staging DB منفصلة عن Production. المشروع مربوط بقاعدة بيانات Lovable Cloud وحيدة (`wpmicqriltrowwonknox`) تُستخدم كـ backend لكل من preview و published، وأي migration يُطبَّق عليها يمس البيانات الحية مباشرة.

---

## 2. Environment inventory

| البند | القيمة |
|-------|--------|
| Supabase project ref (المشروع الوحيد المربوط) | `wpmicqriltrowwonknox` |
| Staging project ref | ❌ **غير موجود** |
| Production project ref | `wpmicqriltrowwonknox` (نفس المشروع — لا فصل بين البيئات) |
| نوع الربط | Lovable Cloud (Supabase-managed) — instance واحد فقط لكل مشروع Lovable |
| Preview URL | `https://id-preview--90f4dcde-...lovable.app` — يقرأ/يكتب على نفس الـ backend |
| Published URL | `https://saba-uni-portal.lovable.app` + custom domains — نفس الـ backend |

**النتيجة:** المشروع الحالي `wpmicqriltrowwonknox` ليس Staging وليس Production منفصلاً — هو **قاعدة مشتركة** يستخدمها الـ preview والنشر معاً. لا يمكن الجزم أنه ليس Production؛ عملياً يخدم production traffic عبر الدومين المخصص.

---

## 3. Backup / snapshot

- Lovable Cloud يوفر backups تلقائية على مستوى Supabase (PITR / daily snapshots حسب خطة الـ instance).
- لا يوجد UI ضمن Lovable لأخذ snapshot يدوي مؤكد قبل apply، ولا وصول إلى Supabase dashboard لتأكيد retention window أو تشغيل restore.
- التصدير المتاح للمستخدم: Cloud → Advanced settings → Export data (CSV per table) — ليس بديلاً عن snapshot قابل للاستعادة الذرية.

**الحالة:** غير مؤكد ككفاية backup point-in-time قابل للاستعادة قبل apply مباشرة. لأغراض هذه البوابة → يعامَل كـ **غير كافٍ**.

---

## 4. Migration history readability

✅ يمكن قراءة `supabase_migrations.schema_migrations` عبر `supabase--read_query`.

آخر migrations مطبقة (July 2026):

```
20260705232121
20260705023314
20260705012438
20260704200328
20260703194036
20260703192342
20260702044231
20260701001519
```

**ملاحظة حرجة:** لا شيء من سلسلة طلبات الطلاب (`20260710130000` → `20260711020000`) مطبَّق. وأول apply لأي منها سيقع على القاعدة المشتركة الحالية مباشرة.

---

## 5. Safe apply capability

| السؤال | الجواب |
|--------|--------|
| هل يمكن تطبيق migrations على Staging فقط دون لمس Production؟ | ❌ — لا يوجد Staging منفصل |
| هل يمكن تنفيذ smoke verification بعد التطبيق دون التأثير على مستخدمين حقيقيين؟ | ❌ — أي apply يقع على البيئة التي يخدم منها الدومين |
| هل يمكن rollback ذري موثّق؟ | ❌ — لا snapshot يدوي مؤكد قبل apply |

---

## 6. Gate criteria vs reality

| Criterion | Status |
|-----------|--------|
| توجد Staging منفصلة مؤكدة | ❌ |
| يوجد backup قابل للاستعادة | ⚠️ غير مؤكد |
| يمكن قراءة migration history | ✅ |
| يمكن تطبيق migrations على Staging فقط | ❌ |

النتيجة: **NO_GO** (يكفي فشل أول شرط).

---

## 7. التوصيات (بدون تنفيذ)

للانتقال إلى `READY_FOR_STAGING_APPLY`:

1. **إنشاء مشروع Lovable Cloud منفصل** يستخدم كـ Staging (fork / project ثانٍ)، أو
2. الاعتراف الصريح بأن `wpmicqriltrowwonknox` هو Production وأن تطبيق سلسلة طلبات الطلاب سيكون **Production apply مباشر** — عندها ينتقل القرار إلى بوابة أخرى (Production gate) تتطلب:
   - snapshot/PITR مؤكد قبل apply،
   - نافذة صيانة معلنة،
   - موافقة صريحة من مالك المشروع،
   - خطة rollback (forward-fix migration جاهز).
3. تأكيد retention لـ Supabase automated backups على المشروع الحالي وتوثيق آخر snapshot متاح قبل أي apply مستقبلي.

---

## 8. تأكيد النطاق

خلال هذه المرحلة **لم يُنفَّذ** أي مما يلي:

- ❌ لا migrations طُبِّقت
- ❌ لا DB writes (INSERT/UPDATE/DELETE)
- ❌ لا seed / cleanup / reset
- ❌ لا publish
- ❌ لا تغيير إعدادات Auth
- ❌ لا إنشاء حسابات أو بيانات اختبارية
- ❌ لا تعديل RLS/Storage

الكتابة الوحيدة في هذه المرحلة: هذا التقرير فقط.

---

## 9. القرار النهائي

**NO_GO — STUDENT-REQUESTS-STAGING-ENV-GATE-01**

لا يجوز الانتقال إلى `STUDENT-REQUESTS-STAGING-APPLY-01` قبل حسم بند البيئة (بوابة §7).
