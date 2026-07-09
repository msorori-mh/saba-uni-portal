# PORTAL-USR-FORMAL-BRAND-ADOPT-01 — REPORT

**التاريخ:** 2026-07-09
**النطاق:** كامل الموقع العام والبوابات — عبر التوكنز الدلالية فقط. لا تعديل مكوّنات/تخطيطات/منطق/DB.

## 1. الملفات المعدَّلة

| # | الملف | التغيير |
|---|-------|---------|
| 1 | `src/styles.css` | لوحة ألوان مؤسسية زرقاء + توكنز خط Amiri + توكنز `--hero-*` مستقلة تحتفظ باللون التركوازي القديم للهيرو |
| 2 | `src/routes/__root.tsx` | رابط Google Fonts: **Amiri (400,700) + Cairo (400–700)** |
| 3 | `public/manifest.webmanifest` | `theme_color=#061F33`, `background_color=#F8FAFC` |
| 4 | `capacitor.config.ts` | Android/Splash/StatusBar `backgroundColor=#061F33` |
| 5 | `src/routes/mobile.student.tsx` | `<meta theme-color>=#061F33` |
| 6 | `src/lib/email-templates.ts` | ثوابت `BRAND` بالقيم الجديدة + `font-family=Cairo` |
| 7 | `src/components/admin/people/shared.tsx` | Print CSS: الألوان الجديدة + `Amiri` للعناوين |
| 8 | `src/routes/admin/students.lazy.tsx` | نفس تعديلات Print CSS |
| 9 | `public/offline.html` | خلفية `#061F33`، لكنة `#8A6A2B`، نص `#111827` |
| 10 | `src/routes/index.tsx` | قسم CTA السفلي: `bg-primary-deep` → `bg-hero-gradient` (يبقى بالتيل القديم) |

## 2. الخطوط — قبل/بعد

| البند | قبل | بعد |
|-------|-----|-----|
| Google Fonts `<link>` | Cairo + Tajawal | **Amiri + Cairo** |
| `--font-sans` | Cairo | **Cairo** (بدون تغيير) |
| `--font-display` | Tajawal, Cairo | **Amiri, "Times New Roman", Cairo, serif** |
| `h1…h6` | Tajawal | **Amiri** — طابع كلاسيكي رسمي |
| `body` | Cairo | **Cairo** (بدون تغيير) |
| Print CSS | Tajawal | **Amiri, "Times New Roman", serif** |
| Email | Tajawal | **Cairo** (Amiri غير موثوق في بعض عملاء البريد) |

## 3. لوحة الألوان — قبل/بعد

| التوكن | قبل | بعد |
|--------|-----|-----|
| `--background` | `#F7F8FA` | **`#F8FAFC`** |
| `--foreground` | `#102333` | **`#111827`** |
| `--primary` | `#105B7D` | **`#0B3D62`** — أزرق مؤسسي |
| `--primary-dark` | `#0B4864` | **`#082D48`** |
| `--primary-deep` | `#08384E` | **`#061F33`** — هيدر/سايدبار/فوتر |
| `--primary-soft` | `#E6EFF4` | **`#E8EEF4`** |
| `--deep` | `#08384E` | **`#061F33`** |
| `--gold` | `#D99A17` | **`#8A6A2B`** — نحاسي رصين (بدل الذهبي البراق) |
| `--gold-dark` | `#A9760F` | **`#5F4A1E`** |
| `--gold-soft` | `#FBEFD2` | **`#F1EADB`** |
| `--accent` | `#D99A17` | **`#1E4E78`** — أزرق متوسط |
| `--accent-foreground` | `#102333` | **`#FFFFFF`** |
| `--secondary` | `#E6EFF4` | **`#E5E7EB`** — رمادي محايد |
| `--muted` / `--muted-foreground` | `#EEF2F5` / `#667985` | **`#F1F3F5` / `#4B5563`** |
| `--border` / `--input` | `#DDE6EA` | **`#D1D5DB`** |
| `--ring` | `#D99A17` | **`#1E4E78`** — حلقة تركيز زرقاء |
| Sidebar | `#08384E` / `#105B7D` | **`#061F33` / `#0B3D62`** |
| `--destructive` | oklch أحمر | بدون تغيير (وظيفي) |

### توكنز الهيرو (جديد — استثناء بناءً على طلب المستخدم)

| التوكن | القيمة | الاستخدام |
|--------|--------|-----------|
| `--hero-deep` | `#08384E` | التيل العميق |
| `--hero-mid` | `#0B4864` | متوسط |
| `--hero-primary` | `#105B7D` | فاتح |
| `--hero-foreground` | `#FFFFFF` | نص فوق الهيرو |
| `--gradient-hero` | `linear-gradient(135deg, var(--hero-deep), var(--hero-mid), var(--hero-primary))` | هيرو الصفحة الرئيسية + PageHeader + بطاقة الأخبار المصغّرة + قسم CTA الأبحاث |
| `--gradient-overlay` | التركوازي القديم | overlay فوق الهيرو |

- utility `bg-hero-gradient` موجود مسبقاً ويقرأ `--gradient-hero` تلقائياً → كل الهيرو يعود للتيل بدون تعديل JSX.
- الاستثناء الوحيد على JSX: `src/routes/index.tsx` L333 — استُبدل `bg-primary-deep` بـ `bg-hero-gradient` ليحتفظ قسم "الأبحاث" باللون القديم.

## 4. نطاق التطبيق

| المنطقة | اللون |
|---------|------|
| **الهيرو** (index + PageHeader + بطاقة أخبار + CTA أبحاث) | 🟦 **تيل قديم** (`#08384E → #105B7D`) |
| الهيدر الرئيسي (Header.tsx bar) | 🟦 أزرق مؤسسي جديد `#061F33` |
| الفوتر | 🟦 أزرق مؤسسي جديد `#061F33` |
| السايدبار | 🟦 أزرق مؤسسي جديد `#061F33` |
| شل البوابات (PortalShell/AdminShell) | 🟦 أزرق مؤسسي جديد `#061F33` |
| الأزرار الأساسية | 🟦 أزرق `#0B3D62` |
| اللكنة (Gold) | 🟫 نحاسي رصين `#8A6A2B` |

## 5. التحقق النهائي

```
$ rg -n 'Tajawal|#08384E|#105B7D|#D99A17' src public
→ clean (لا بقايا خارج توكنز --hero-* المقصودة في styles.css)
```

## 6. تأكيد عدم التغيير

| البند | الحالة |
|-------|--------|
| Layout الصفحات | ✅ بدون تغيير |
| بنية المكوّنات / props | ✅ بدون تغيير |
| Routes | ✅ بدون تغيير |
| Auth / صلاحيات | ✅ بدون تغيير |
| Database / RLS / RPC / Migrations | ✅ لم تُلمس |
| Business logic / API calls | ✅ بدون تغيير |
| Radius / spacing / grid / animations | ✅ بدون تغيير |
| ملفات auto-gen (client.ts, types.ts, .env, routeTree.gen.ts) | ✅ لم تُلمس |
| Publish / Deploy | ❌ لم يُنفَّذ |

## 7. القرار النهائي

# ✅ PASS_WITH_NOTES

- اعتماد لوحة ألوان **أزرقاء مؤسسية وقورة** + خطوط **Amiri (عناوين) + Cairo (نصوص)** لكامل الموقع.
- **ملاحظة استثنائية:** أقسام الهيرو تحتفظ باللون التركوازي السابق بناءً على طلب المستخدم، عبر توكنز `--hero-*` مستقلة.

**المرحلة التالية المقترحة:** `PORTAL-USR-FORMAL-BRAND-VERIFY-01` (فحص بصري عبر preview).

---
*نهاية التقرير — PORTAL-USR-FORMAL-BRAND-ADOPT-01*
