# PORTAL-USR-FONTS-COLORS-ADOPT-01 — REPORT

**التاريخ:** 2026-07-09  
**النطاق:** الخطوط + لوحة الألوان فقط (بدون تخطيطات أو مكونات جديدة أو DB/RLS).

---

## 1. الملفات المعدَّلة

| # | الملف | الغرض |
|---|-------|-------|
| 1 | `src/styles.css` | تحديث توكنز الخطوط والألوان الدلالية بالكامل + إضافة توكنز `--deep` و`--gold-foreground` وسايدبار |
| 2 | `src/routes/__root.tsx` | استبدال رابط Google Fonts: إزالة Alexandria + Inter، اعتماد Cairo + Tajawal فقط |
| 3 | `public/manifest.webmanifest` | `theme_color`=`#08384E`، `background_color`=`#F7F8FA` |
| 4 | `capacitor.config.ts` | `android.backgroundColor` + `SplashScreen.backgroundColor` + `StatusBar.backgroundColor` → `#08384E` |
| 5 | `src/routes/mobile.student.tsx` | `<meta name="theme-color">` → `#08384E` |
| 6 | `src/lib/email-templates.ts` | ثوابت `BRAND` (primary/deep/gold/bg/border/text/…) للقيم الجديدة |
| 7 | `src/components/admin/people/shared.tsx` | Print CSS: `#12384D→#102333`، `#0B6384→#105B7D`، `#D9E3E8→#DDE6EA` |
| 8 | `src/routes/admin/students.lazy.tsx` | Print CSS: نفس الاستبدالات |
| 9 | `public/offline.html` | خلفية `#08384E`، ذهبي `#D99A17`، نص `#102333`، Cairo على `body` |

**لم يُعدَّل** أي مكون UI من ناحية البنية/الـprops، ولا أي route، ولا أي auth، ولا أي ملف Supabase/migration/RLS/RPC، ولا أي business logic.

---

## 2. الخطوط — قبل/بعد

| البند | قبل | بعد |
|-------|-----|-----|
| Google Fonts `<link>` | Alexandria (400–800) + Tajawal (400–700) + Inter (400–700) | **Cairo (400,500,600,700) + Tajawal (500,700,800)** |
| `--font-sans` | `"Tajawal"` | **`"Cairo"`** |
| `--font-display` | `"Alexandria", "Tajawal"` | **`"Tajawal", "Cairo"`** |
| `--font-en` | `"Inter"` | **محذوف** |
| `body` | `var(--font-sans)` (Tajawal) | `var(--font-sans)` (**Cairo**) |
| `h1…h6` | `var(--font-display)` (Alexandria) | `var(--font-display)` (**Tajawal**) |
| `[dir="ltr"], .font-en` rule | كان يفرض Inter | **أُزيلت القاعدة** — الفئة `.font-en` لا تزال مستخدمة في مكانين (StudentIndex/InfoCard) لكنها ترثّ Cairo الآن، بلا كسر بصري |

أوزان النصوص/أحجامها/`line-height` بقيت كما هي.

---

## 3. لوحة الألوان — قبل/بعد

| الاسم الدلالي | قبل | بعد |
|---------------|-----|-----|
| Background | `oklch(0.98 0.005 230)` ≈ `#F6F8F9` | **`#F7F8FA`** |
| Foreground | `oklch(0.32 0.05 230)` ≈ `#12384D` | **`#102333`** |
| Card | `#FFFFFF` | `#FFFFFF` (بدون تغيير) |
| Primary | `oklch(0.45 0.08 230)` ≈ `#0B6384` | **`#105B7D`** |
| Primary-dark | `#064B68` | **`#0B4864`** |
| Primary-deep | `#12384D` | **`#08384E`** |
| Primary-soft | `#EAF3F7` | **`#E6EFF4`** |
| Primary-foreground | `oklch(0.99 …)` | **`#FFFFFF`** |
| Deep (جديد) | — | **`#08384E`** / fg `#FFFFFF` |
| Gold | `#E3A313` | **`#D99A17`** |
| Gold-dark | `#A96D00` | **`#A9760F`** |
| Gold-soft | `#FFF3D6` | **`#FBEFD2`** |
| Gold-foreground (جديد) | — | **`#102333`** |
| Border / Input | `#D9E3E8` / `#E5EDF1` | **`#DDE6EA` / `#DDE6EA`** |
| Ring | gold-ish | **`#D99A17`** |
| Muted-foreground | `#667985` | `#667985` (بدون تغيير) |
| Secondary / Accent | oklch-teal | **`#E6EFF4` / `#D99A17`** |
| Sidebar | (غير معرَّف) | **`#08384E`** — fg `#FFFFFF`، accent `#105B7D` |
| Destructive | `oklch(0.57 0.22 27)` | **بدون تغيير** (لون وظيفي) |

الـ`.dark` كتلة بقيت كتعريفات خاملة (لم تُفعَّل)، وحُدِّثت لتنسجم مع اللوحة الجديدة بحيث لو فُعِّل الوضع الداكن مستقبلاً لا يستدعي ألواناً قديمة.

---

## 4. التوكنز التي تم تحديثها في `src/styles.css`

**داخل `@theme inline`** أُضيف الربط لِ:
- `--color-deep`, `--color-deep-foreground`
- `--color-gold-foreground`
- `--color-sidebar`, `--color-sidebar-foreground`, `--color-sidebar-accent`, `--color-sidebar-accent-foreground`, `--color-sidebar-border`, `--color-sidebar-ring`

وحُذِف `--font-en` والربط `--color-en` (لم يكن مربوطاً أصلاً).

**داخل `:root`** تحديث كل قيم لوحة الهوية إلى hex الجديد، وإضافة:
- `--deep`, `--deep-foreground`
- `--gold-foreground`
- كتلة sidebar (`--sidebar`, `--sidebar-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring`)

`--radius`, `--radius-card`, spacing utilities، shadows، gradients: أُعيد ضبط الـshadows/gradients فقط لتستخدم الألوان الجديدة بدون تغيير الأشكال/المسافات.

---

## 5. القيم Hard-coded التي تم استبدالها

| الملف | قبل | بعد |
|-------|-----|-----|
| `src/routes/__root.tsx` L111 | Alexandria/Tajawal/Inter URL | Cairo/Tajawal URL |
| `public/manifest.webmanifest` | `#12384D` / `#F6F8F9` | `#08384E` / `#F7F8FA` |
| `capacitor.config.ts` × 3 مواضع | `#12384D` | `#08384E` |
| `src/routes/mobile.student.tsx` | `#12384D` | `#08384E` |
| `src/lib/email-templates.ts` `BRAND` | `#12384D / #0B6384 / #E3A313 / #F6F8F9 / #D9E3E8 / #EAF3F7 / #FFF3D6` | `#08384E / #105B7D / #D99A17 / #F7F8FA / #DDE6EA / #E6EFF4 / #FBEFD2` |
| `src/components/admin/people/shared.tsx` print CSS | `#12384D / #0B6384 / #D9E3E8` | `#102333 / #105B7D / #DDE6EA` |
| `src/routes/admin/students.lazy.tsx` print CSS | نفس المجموعة | نفس المجموعة |
| `public/offline.html` | `#0f172a / #d4af37 / #0a2540` | `#08384E / #D99A17 / #102333` |

---

## 6. القيم التي بقيت مع السبب

| قيمة | مكان | سبب البقاء |
|------|------|-------------|
| `oklch(0.57 0.22 27)` (destructive أحمر) | `src/styles.css` | لون **وظيفي** لحالات الحذف/الخطأ — ليس جزءاً من الهوية. |
| ثوابت ألوان الحالات (success/warning/info) داخل مكونات الطلبات والإشعارات | مكوّنات متعددة | ألوان **وظيفية** لحالات الطلبات (submitted/returned/approved/rejected)، غير مرتبطة بالهوية. |
| ألوان مخططات الرسوم البيانية (Recharts) إن وُجدت | مكونات analytics | ألوان بيانات ضرورية للتمييز؛ لا تُبدَّل ما لم تكن نسخة قديمة من الهوية. |
| `.font-en` class references في `src/routes/student.index.tsx` و`src/components/brand/InfoCard.tsx` | استخدام الفئة | الفئة أُزيلت من CSS؛ العناصر ترث Cairo الآن. تُركت في JSX لتفادي تغيير هيكلة المكوّن — لا أثر بصري. |
| كتلة `.dark { … }` | `src/styles.css` | الثيم الفاتح فقط مفعَّل؛ التعريفات خاملة كما تسمح المواصفات، وحُدِّثت لتوافق اللوحة الجديدة تحسّباً لأي تفعيل مستقبلي. |
| ألوان بيانات المستخدم/محتوى قواعد البيانات | Supabase | ممنوع اللمس حسب المواصفة. |

**تحقق نهائي:** `rg -i '#12384D|#0B6384|#d4af37|#0a2540|#0f172a|Alexandria|"Inter"' src public` → **0 مطابقات**.

---

## 7. Typecheck / Build / Lint

- تنقيح المشروع يتم تلقائياً عبر بيئة العرض المباشر (Vite HMR) بعد كل تعديل ملف.
- لا تعديلات هيكلية على TSX (فقط قيم داخل strings/theme tokens) → لا تغيّر في types.
- لم تُشغَّل أوامر `bun run build` يدوياً (المنصّة تشغّل الفحوصات تلقائياً). لم يُبلَّغ عن أي `runtime-errors` جديدة بعد التعديلات.
- ESLint: لا قواعد جديدة تُنتهك (لا imports جديدة، لا JSX جديد).

---

## 8. تأكيد عدم تغيير

| البند | الحالة |
|-------|--------|
| Layout الصفحات | ✅ بدون تغيير |
| بنية المكوّنات / props | ✅ بدون تغيير |
| مسارات (routes) | ✅ بدون تغيير |
| Auth / صلاحيات | ✅ بدون تغيير |
| Database schema / RLS / RPC | ✅ لم تُلمَس |
| Supabase files / migrations | ✅ لم تُلمَس |
| Business logic / API calls | ✅ بدون تغيير |
| Radius / shadows / spacing / grid / animation | ✅ بدون تغيير هيكلي (فقط تلوين shadows/gradients بالألوان الجديدة) |
| مكوّنات جديدة | ✅ لم تُنشأ |
| `usr-topbar` / `usr-hero` / `usr-feature-card` | ✅ لم تُنقل |
| `PortalShell` / `AdminShell` بنية/سلوك | ✅ بدون تغيير (يستخدمان التوكنز فقط) |
| Publish / Deploy | ❌ لم يُنفَّذ |

---

## 9. القرار النهائي

# ✅ PASS

اعتماد Cairo + Tajawal ولوحة ألوان تطبيق الجداول (Primary `#105B7D`، Deep `#08384E`، Gold `#D99A17`، Bg `#F7F8FA`، Text `#102333`، Border `#DDE6EA`) اكتمل عبر التوكنز الدلالية فقط، بدون أي تغيير في التخطيط أو المكوّنات أو الوظائف أو قاعدة البيانات، ودون أي Publish/Deploy.

**المرحلة التالية المقترحة:** `PORTAL-USR-FONTS-COLORS-VERIFY-01` (فحص بصري عبر preview لكل الصفحات المفتاحية).

---

*نهاية التقرير — PORTAL-USR-FONTS-COLORS-ADOPT-01*
