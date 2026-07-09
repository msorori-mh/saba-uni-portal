
## الهدف
مطابقة واجهة هذا التطبيق مع تطبيق «USR — إدارة الجداول» بصرياً عبر استبدال لوحة الألوان والخطوط فقط، دون أي تغيير في المنطق أو المكونات.

## نطاق التغيير
تعديل ملفين فقط:

### 1) `src/styles.css`
- استبدال كل قيم `:root` (Brand + Neutrals + Semantic + Sidebar) بقيم HEX الجديدة لـ USR:
  - Primary `#105B7D`, Dark `#0B4964`, Deeper `#08384E`, Soft `#E8F2F5`, Glow `#1A7AA3`
  - Gold `#D99A17`, Dark `#B87900`, Soft `#FFF4DA`
  - Background `#F7F8FA`, Card `#FFFFFF`, Border/Input `#DDE6EA`, Muted `#EEF1F4`
  - Foreground `#102333`, Muted-foreground `#667985`
  - Destructive `#C53030`, Success `#2F855A`, Warning `#D99A17`, Ring `#105B7D`
  - Sidebar bg `#08384E`, text `#F7FAFC`, active `#105B7D`, border `#0B4964`
- تحديث التدرجات والظلال:
  - `--gradient-hero`: `linear-gradient(135deg,#08384E 0%,#0B4964 40%,#105B7D 100%)`
  - `--gradient-gold`: `linear-gradient(90deg,#B87900 0%,#D99A17 50%,#B87900 100%)`
  - `--shadow-card` و `--shadow-elevated` بالقيم الجديدة
- ربط `--primary-dark`, `--primary-deep`, `--primary-soft`, `--gold-dark`, `--gold-soft` بالقيم الجديدة للحفاظ على توافق الـ tokens الحالية المستخدمة في المكونات.
- تحديث `--font-sans` إلى `"Cairo","Tajawal",system-ui,sans-serif` و `--font-display` إلى `"Tajawal","Cairo",serif`.
- إبقاء `.dark` معرَّفاً (inert) دون تفعيل.
- إبقاء utilities الحالية (`bg-hero-gradient`, `bg-gold-gradient`, `shadow-elegant`, `divider-gold`, ...) كما هي مع القيم الجديدة.

### 2) `src/routes/__root.tsx`
- استبدال رابط Google Fonts:
  - من: `Amiri + Cairo`
  - إلى: `Cairo:wght@400;500;600;700&family=Tajawal:wght@500;700;800`
- لا تغيير في أي منطق أو ميتاداتا أخرى.

## ما لن يتغيّر
- لا تعديل على أي مكوّن (Header/Footer/AdminShell/PageHeader/...) — كلها تستخدم semantic tokens وستستقبل الألوان الجديدة تلقائياً.
- لا تعديل على قاعدة البيانات أو migrations أو منطق التطبيق.
- لا publish/deploy.

## التحقق بعد التنفيذ
- فحص build.
- زيارة `/` و `/admin` والتأكد بصرياً من مطابقة الدرجات (تركوازي + ذهبي + سايدبار داكن) للصورة المرفقة.
