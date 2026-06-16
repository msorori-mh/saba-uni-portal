# تمييز بطاقات قيادة الكلية بتدرج بصري

## المشكلة الحالية
في صفحة `/faculty` ضمن قسم "قيادة الكلية"، تُعرض بطاقات العميد والنواب ورؤساء الأقسام بنفس الشكل تماماً (نفس الحجم، الحدود، الشارة الذهبية). لا يوجد تمييز هرمي بصري بين المستويات الثلاثة رغم اختلاف المنصب.

## النطاق
- **ملف واحد فقط**: `src/routes/faculty.tsx`
- **تغييرات تقديمية فقط**: لا تعديل على قاعدة البيانات أو الاستعلامات أو الصلاحيات أو ترتيب البيانات (يبقى `admin_position_order` هو المرجع).

## المنطق
استنتاج المستوى من حقل `admin_position` الموجود (موجود فعلاً في DB):
- **Tier 1 — العميد**: `admin_position` يبدأ بـ "عميد"
- **Tier 2 — نواب العميد**: يبدأ بـ "نائب" أو "وكيل"
- **Tier 3 — رؤساء الأقسام**: يبدأ بـ "رئيس قسم"
- **Fallback**: أي منصب آخر يُعامل كـ Tier 3

دالة مساعدة `getLeaderTier(adminPosition)` ترجع `1 | 2 | 3`.

## التصميم البصري المعتمد (Academic Leadership Hierarchy)

داخل قسم "قيادة الكلية" يُستبدل الـ grid الموحد الحالي بثلاث مجموعات متتابعة:

### Tier 1 — العميد (بطاقة واحدة بارزة)
- صف مستقل، البطاقة متمركزة (`flex justify-center`) بعرض أكبر (`max-w-md`).
- إطار ذهبي سميك `border-2 border-gold`، ظل `shadow-elegant`، padding أوسع.
- شارة علوية بارزة فوق البطاقة: خلفية `bg-gold` + نص أبيض + أيقونة Crown ("عميد الكلية").
- صورة دائرية أكبر (`h-24 w-24`) بحلقة ذهبية.
- اسم بحجم `text-xl`، مع تفاصيل أكاديمية تحته.

### Tier 2 — النواب (شبكة من عمودين)
- `grid sm:grid-cols-2 gap-6`.
- بطاقات بحدّ علوي ذهبي `border-t-4 border-gold/60`.
- شارة المنصب فوق البطاقة بخلفية `bg-gold/15` ونص ذهبي داكن.
- صورة دائرية متوسطة (`h-20 w-20`).
- ظل `shadow-card` معتدل.

### Tier 3 — رؤساء الأقسام (شبكة من 3-4 أعمدة)
- `grid sm:grid-cols-2 lg:grid-cols-3 gap-4`.
- بطاقات بالحجم الحالي تقريباً، حدّ خفيف `border-border`.
- بدلاً من شارة Crown الذهبية البارزة الحالية، نستخدم وسماً علوياً صغيراً: `رئيس قسم` بنص `text-muted-foreground uppercase tracking-widest`، واسم القسم بلون `text-gold` تحت الاسم.

### الأقسام التالية (المشاركون، المساعدون، المدرّسون، محاضرة مساعد، المعيدون)
بدون أي تغيير — تظل بنفس البطاقة الحالية `FacultyCard` وبنفس الشبكة.

## التنفيذ التقني

1. إضافة دالة `getLeaderTier(adminPosition: string | null): 1 | 2 | 3` في أعلى الملف.
2. إنشاء ثلاثة مكونات بطاقات داخل نفس الملف:
   - `DeanCard` (Tier 1)
   - `ViceDeanCard` (Tier 2)
   - `DepartmentHeadCard` (Tier 3)
   كلها تستقبل نفس `props` الحالية (`f`, `onSelect`) وتفتح نفس Dialog الموجود.
3. في قسم `__leadership` فقط، استبدال الـ grid الموحد بثلاثة blocks متتابعة:
   ```tsx
   const tier1 = leaders.filter(l => getLeaderTier(l.admin_position) === 1);
   const tier2 = leaders.filter(l => getLeaderTier(l.admin_position) === 2);
   const tier3 = leaders.filter(l => getLeaderTier(l.admin_position) === 3);
   ```
   ثم render كل tier بشبكته الخاصة (مع تخطي أي tier فارغ).
4. الفرز داخل كل tier يبقى حسب `admin_position_order` (موروث من الفرز السابق للقائمة `leaders`).
5. باقي الأقسام (`RANK_SECTIONS` و `OTHERS_SECTION`) تعمل كما هي بدون تعديل.

## ضمانات
- لا تغيير في `faculty` table أو الاستعلامات أو RLS.
- لا تغيير في ترتيب أو أسماء أقسام الرتب الأخرى.
- نفس Dialog التفاصيل الحالي للجميع.
- التوكنز المستخدمة (`gold`, `primary`, `border`, `card`, `shadow-elegant`, `shadow-card`, `divider-gold`) كلها معرّفة مسبقاً في `src/styles.css` — لا توكنز جديدة.
