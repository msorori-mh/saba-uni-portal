
ALTER TABLE public.faculty
  ADD COLUMN IF NOT EXISTS admin_position text,
  ADD COLUMN IF NOT EXISTS admin_position_order int;

COMMENT ON COLUMN public.faculty.admin_position IS 'المنصب الإداري (عميد/نائب عميد/رئيس قسم...) — يعرض بشكل بارز ويستخدم للترتيب';
COMMENT ON COLUMN public.faculty.admin_position_order IS 'ترتيب العرض داخل المناصب الإدارية (1=عميد، 2..=نواب، 10..=رؤساء أقسام)';

UPDATE public.faculty
SET admin_position = 'عميد الكلية', admin_position_order = 1
WHERE id = 'cd0d4e92-f5b1-41d5-aada-801d1db12e13';
