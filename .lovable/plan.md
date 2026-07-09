# PORTAL-USR-FORMAL-BRAND-ADOPT-01 — استكمال + استثناء الهيرو

## الوضع
كل التبديلات في الملفات تمّت (styles.css, __root.tsx, capacitor, manifest, email-templates, offline.html, print CSS، ملفات mobile). المتبقي: إنشاء التقرير + **استثناء الهيرو** ليحتفظ باللون السابق.

## التعديل الجديد المطلوب
الاحتفاظ بلون الهيرو السابق (Teal العميق `#08384E`/`#0B4864`/`#105B7D`) بدل الأزرق المؤسسي الجديد على أقسام الهيرو فقط.

### الأقسام المستهدفة (تستخدم `bg-hero-gradient`)
- `src/routes/index.tsx` — Hero section (سطر 133) + بطاقات مصغرة (سطر 280) + قسم CTA (سطر 333، `bg-primary-deep`)
- `src/components/site/PageHeader.tsx` — رأس الصفحات الفرعية

### التقنية
إنشاء توكن مستقل للهيرو لا يتأثر بتحديث `--primary-*`:

في `src/styles.css` `:root`:
```css
/* Legacy hero teal — retained per user request */
--hero-deep: #08384E;
--hero-mid:  #0B4864;
--hero-primary: #105B7D;
--hero-foreground: #FFFFFF;
--gradient-hero: linear-gradient(135deg, var(--hero-deep) 0%, var(--hero-mid) 50%, var(--hero-primary) 100%);
--gradient-overlay: linear-gradient(180deg, rgba(8,56,78,0.55) 0%, rgba(11,72,100,0.92) 100%);
```

- `bg-hero-gradient` utility موجود مسبقاً ويقرأ `--gradient-hero` → سيعود للتيل تلقائياً بدون تعديل JSX.
- قسم CTA (`bg-primary-deep`) في `index.tsx` سطر 333: استبداله بـ `bg-hero-gradient` ليبقى بنفس اللون الأصلي.
- الهيدر (`Header.tsx` سطر 52 — الشريط العلوي)، السايدبار، الفوتر، وشل البوابات (`PortalShell`) يبقون على الأزرق الجديد `--primary-deep = #061F33` (طابع رسمي كما طُلب).

### نطاق الاستثناء
- ✅ الهيرو في `/` والأقسام الفرعية (PageHeader)
- ✅ بطاقة الأخبار المصغّرة داخل الصفحة الرئيسية (نفس الـ gradient)
- ✅ قسم CTA السفلي في الصفحة الرئيسية
- ❌ الهيدر العام والفوتر والسايدبار وشل البوابات → أزرق مؤسسي جديد

## الملفات المعدَّلة الآن
1. `src/styles.css` — إضافة توكنز `--hero-*` + إعادة تعريف `--gradient-hero` و`--gradient-overlay` بها
2. `src/routes/index.tsx` — سطر 333: `bg-primary-deep` → `bg-hero-gradient`
3. إنشاء `docs/PORTAL-USR-FORMAL-BRAND-ADOPT-01-REPORT.md` بجميع التغييرات + استثناء الهيرو

## ما لن يُلمس
مكوّنات UI، routes، auth، DB/RLS/RPC، Supabase، migrations، logic. لا Publish/Deploy.

## القرار المتوقع
`PASS` مع ملاحظة: الهيرو محتفظ باللون التركوازي القديم بناءً على طلب المستخدم.
