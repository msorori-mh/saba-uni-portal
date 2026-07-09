# PORTAL-USR-FORMAL-BRAND-ADOPT-01

## الهدف
استبدال لوحة الألوان الحالية (Teal + Gold) بلوحة **زرقاء مؤسسية وقورة**، واستبدال خط العناوين Tajawal بخط **Amiri** الكلاسيكي الرسمي، مع إبقاء **Cairo** لنصوص المتن. التعديل يتم عبر التوكنز الدلالية في `src/styles.css` فقط، فينعكس تلقائياً على كامل الموقع العام والبوابات دون تعديل أي مكوّن أو تخطيط أو منطق.

## النطاق
- الصفحة الرئيسية `/` + كامل الموقع العام (Header/Footer/News/Events/…)  
- البوابات (Student/Faculty/Staff/Admin) ترث نفس التوكنز تلقائياً — لا تعديل مكوّنات

## لوحة الألوان الرسمية الجديدة

| التوكن | القيمة الجديدة | الاستخدام |
|---|---|---|
| `--background` | `#F8FAFC` | خلفية عامة رمادي فاتح جداً |
| `--foreground` | `#111827` | نص أساسي فحمي |
| `--primary` | `#0B3D62` | أزرق مؤسسي داكن |
| `--primary-dark` | `#082D48` | تحويم/أعمق |
| `--primary-deep` | `#061F33` | الهيدر والسايدبار |
| `--primary-soft` | `#E8EEF4` | خلفيات مساعدة |
| `--deep` | `#061F33` | — |
| `--gold` | `#8A6A2B` | لكنة نحاسية رصينة (بدل الذهبي البراق) |
| `--gold-dark` | `#5F4A1E` | — |
| `--gold-soft` | `#F1EADB` | — |
| `--accent` | `#1E4E78` | أزرق متوسط للتأكيدات |
| `--secondary` | `#E5E7EB` | رمادي محايد |
| `--border` / `--input` | `#D1D5DB` | حدود رمادية باردة |
| `--ring` | `#1E4E78` | حلقة تركيز زرقاء |
| `--muted` | `#F1F3F5` / fg `#4B5563` | — |
| Sidebar | `#061F33` / accent `#0B3D62` | — |
| `--destructive` | يبقى كما هو (وظيفي) | — |

**Gradients/Shadows** يُعاد ضبطها لتستخدم الأزرق الجديد (بدل التركوازي)، بنفس الأشكال والمسافات — لا تغيير هيكلي.

## الخطوط

| التوكن | قبل | بعد |
|---|---|---|
| `<link>` في `__root.tsx` | Cairo + Tajawal | **Amiri (400,700) + Cairo (400,500,600,700)** |
| `--font-sans` | Cairo | **Cairo** (بدون تغيير) |
| `--font-display` | Tajawal, Cairo | **Amiri, "Times New Roman", serif** |
| h1–h6 | Tajawal | **Amiri** (طابع رسمي كلاسيكي) |
| body | Cairo | **Cairo** (بدون تغيير) |

## الملفات المعدَّلة (قيم فقط — لا هيكل)

1. `src/styles.css` — تحديث `:root` بالتوكنز الجديدة + gradients/shadows بالأزرق  
2. `src/routes/__root.tsx` — استبدال رابط Google Fonts (Cairo + Amiri)  
3. `public/manifest.webmanifest` — `theme_color: #061F33`, `background_color: #F8FAFC`  
4. `capacitor.config.ts` — `backgroundColor` × 3 → `#061F33`  
5. `src/routes/mobile.student.tsx` — `<meta theme-color>` → `#061F33`  
6. `src/lib/email-templates.ts` — ثوابت `BRAND` بالقيم الجديدة  
7. `src/components/admin/people/shared.tsx` + `src/routes/admin/students.lazy.tsx` — قيم Print CSS الجديدة  
8. `public/offline.html` — ألوان الخلفية/العناوين الجديدة

## ما لن يُلمس
- أي مكوّن UI (لا props، لا JSX هيكلي)
- أي route/auth/RLS/RPC/migration/Supabase file
- منطق العمل، API calls، layout، spacing، radius، animations
- ملفات auto-gen (`client.ts`, `types.ts`, `routeTree.gen.ts`, `.env`)
- الوضع الداكن يبقى معرَّفاً كحالة خاملة، محدَّث ليتوافق مع اللوحة الجديدة

## التقنيات
- Tailwind v4 CSS-first: كل الألوان عبر `@theme inline` → `var(--…)` الموجود سلفاً
- الخطوط تُحمَّل عبر `<link>` في root head (لا `@import` URL)

## التحقق
- تشغيل بصري على `/`, `/about`, `/news`, `/portal-login`, `/student`, `/admin/login`
- `rg` للتأكد من إزالة أي بقايا للقيم القديمة (`#105B7D`, `#D99A17`, `Tajawal` كعنوان)
- لا Publish/Deploy

## القرار المتوقع
`PASS` — إنشاء تقرير `docs/PORTAL-USR-FORMAL-BRAND-ADOPT-01-REPORT.md` بعد التنفيذ.
