-- ============================================================
-- Utility: updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================
-- 1. programs
-- ============================================================
CREATE TABLE public.programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  description_ar TEXT,
  description_en TEXT,
  icon TEXT,
  study_plan JSONB,
  admission_requirements TEXT,
  career_opportunities TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.programs TO anon, authenticated;
GRANT ALL ON public.programs TO service_role;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view active programs" ON public.programs
  FOR SELECT USING (is_active = TRUE);
CREATE TRIGGER trg_programs_updated_at BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. faculty
-- ============================================================
CREATE TABLE public.faculty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT UNIQUE NOT NULL,
  full_name_ar TEXT NOT NULL,
  full_name_en TEXT,
  email TEXT,
  phone TEXT,
  degree TEXT,
  specialization TEXT,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  rank TEXT,
  photo TEXT,
  bio_ar TEXT,
  bio_en TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.faculty TO anon, authenticated;
GRANT ALL ON public.faculty TO service_role;
ALTER TABLE public.faculty ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view active faculty" ON public.faculty
  FOR SELECT USING (is_active = TRUE);
CREATE TRIGGER trg_faculty_updated_at BEFORE UPDATE ON public.faculty
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3. news
-- ============================================================
CREATE TABLE public.news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title_ar TEXT NOT NULL,
  title_en TEXT,
  content_ar TEXT,
  content_en TEXT,
  excerpt_ar TEXT,
  excerpt_en TEXT,
  featured_image TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.news TO anon, authenticated;
GRANT ALL ON public.news TO service_role;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view published news" ON public.news
  FOR SELECT USING (is_published = TRUE);
CREATE INDEX idx_news_published ON public.news (published_at DESC) WHERE is_published = TRUE;
CREATE TRIGGER trg_news_updated_at BEFORE UPDATE ON public.news
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 4. events
-- ============================================================
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title_ar TEXT NOT NULL,
  title_en TEXT,
  description_ar TEXT,
  description_en TEXT,
  location TEXT,
  event_date DATE NOT NULL,
  event_time TIME,
  image TEXT,
  registration_url TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.events TO anon, authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view published events" ON public.events
  FOR SELECT USING (is_published = TRUE);
CREATE INDEX idx_events_date ON public.events (event_date DESC);
CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5. site_pages
-- ============================================================
CREATE TABLE public.site_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title_ar TEXT NOT NULL,
  title_en TEXT,
  content_ar TEXT,
  content_en TEXT,
  meta_description TEXT,
  template TEXT NOT NULL DEFAULT 'default',
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_pages TO anon, authenticated;
GRANT ALL ON public.site_pages TO service_role;
ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view published pages" ON public.site_pages
  FOR SELECT USING (is_published = TRUE);
CREATE TRIGGER trg_site_pages_updated_at BEFORE UPDATE ON public.site_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 6. site_settings
-- ============================================================
CREATE TABLE public.site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  setting_group TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT ALL ON public.site_settings TO service_role;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view settings" ON public.site_settings
  FOR SELECT USING (TRUE);
CREATE TRIGGER trg_site_settings_updated_at BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 7. media_library
-- ============================================================
CREATE TABLE public.media_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image','pdf','video','document')),
  file_size INTEGER,
  mime_type TEXT,
  thumbnail_path TEXT,
  alt_text TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.media_library TO anon, authenticated;
GRANT ALL ON public.media_library TO service_role;
ALTER TABLE public.media_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view media" ON public.media_library
  FOR SELECT USING (TRUE);

-- ============================================================
-- 8. contact_messages (public can INSERT only)
-- ============================================================
CREATE TABLE public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT ALL ON public.contact_messages TO service_role;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit a contact message" ON public.contact_messages
  FOR INSERT WITH CHECK (
    length(full_name) BETWEEN 2 AND 120
    AND length(email) BETWEEN 5 AND 160
    AND length(subject) BETWEEN 2 AND 200
    AND length(message) BETWEEN 5 AND 5000
  );

-- ============================================================
-- 9. dashboard_stats (homepage counters)
-- ============================================================
CREATE TABLE public.dashboard_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_key TEXT UNIQUE NOT NULL,
  label_ar TEXT NOT NULL,
  label_en TEXT,
  value INTEGER NOT NULL DEFAULT 0,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dashboard_stats TO anon, authenticated;
GRANT ALL ON public.dashboard_stats TO service_role;
ALTER TABLE public.dashboard_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view stats" ON public.dashboard_stats
  FOR SELECT USING (TRUE);
CREATE TRIGGER trg_dashboard_stats_updated_at BEFORE UPDATE ON public.dashboard_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- SEED DATA
-- ============================================================

-- Programs (real data)
INSERT INTO public.programs (code, name_ar, name_en, description_ar, description_en, icon, sort_order) VALUES
('CS',  'برنامج علوم الحاسوب',         'Computer Science Program',              'دراسة علمية للحوسبة والخوارزميات وهياكل البيانات وهندسة البرمجيات.', 'Scientific study of computing, algorithms, data structures and software engineering.', 'cpu',      1),
('CIS', 'برنامج نظم المعلومات الحاسوبية','Computer Information Systems Program',  'ربط التقنية بحلول الأعمال وتحليل النظم وإدارة قواعد البيانات.',    'Bridging technology with business solutions, systems analysis and database management.', 'database', 2),
('CYB', 'برنامج الأمن السيبراني',       'Cybersecurity Program',                 'حماية الأنظمة والشبكات من التهديدات الرقمية وإدارة المخاطر الأمنية.', 'Protecting systems and networks from digital threats and managing security risks.', 'shield',   3),
('AI',  'برنامج الذكاء الاصطناعي',      'Artificial Intelligence Program',       'تعلم الآلة والتعلم العميق ومعالجة اللغات الطبيعية والرؤية الحاسوبية.', 'Machine learning, deep learning, NLP and computer vision.', 'brain',    4);

-- Site settings
INSERT INTO public.site_settings (setting_key, setting_value, setting_group) VALUES
('site_name_ar',     'كلية تكنولوجيا المعلومات وعلوم الحاسوب',           'general'),
('site_name_en',     'College of Information Technology and Computer Science', 'general'),
('university_name_ar','جامعة إقليم سبأ',                                  'general'),
('university_name_en','Saba Region University',                            'general'),
('contact_email',    'info@it.saba.edu.ye',                                'contact'),
('contact_phone',    '+967-xxx-xxx-xxx',                                   'contact'),
('contact_address',  'الجمهورية اليمنية - محافظة مأرب - جامعة إقليم سبأ', 'contact'),
('facebook_url',     'https://facebook.com/it.saba',                       'social'),
('twitter_url',      'https://twitter.com/it.saba',                        'social'),
('youtube_url',      'https://youtube.com/it.saba',                        'social'),
('linkedin_url',     'https://linkedin.com/school/it-saba',                'social'),
('portal_link',      'https://portal.it.saba.edu.ye',                      'general'),
('map_embed_url',    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d233358.65!2d45.30!3d15.46!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sMa%27rib!5e0!3m2!1sen!2s!4v1700000000000', 'contact');

-- Dashboard stats
INSERT INTO public.dashboard_stats (stat_key, label_ar, label_en, value, icon, sort_order) VALUES
('students',  'طالب وطالبة',         'Students',        850, 'users',       1),
('faculty',   'عضو هيئة تدريس',      'Faculty Members',  42, 'graduation-cap', 2),
('graduates', 'خريج',                'Graduates',       320, 'award',       3),
('labs',      'مختبر متخصص',         'Specialized Labs', 12, 'flask-conical', 4);

-- Sample news (so the homepage and news page have content)
INSERT INTO public.news (slug, title_ar, excerpt_ar, content_ar, category, is_published, published_at, featured_image) VALUES
('admissions-2026-2027', 'فتح باب التقديم للفصل الدراسي الأول 2026/2027',
 'تعلن عمادة الكلية عن فتح باب التسجيل للطلاب الجدد في جميع الأقسام حتى نهاية يوليو.',
 'تعلن عمادة كلية تكنولوجيا المعلومات وعلوم الحاسوب عن فتح باب التقديم والقبول للطلاب الجدد للفصل الدراسي الأول من العام الأكاديمي 2026/2027 في جميع البرامج الأكاديمية الأربعة.',
 'announcement', TRUE, now() - interval '2 days',
 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1200&q=80'),
('ai-symposium-2026', 'ندوة حول مستقبل الذكاء الاصطناعي وتطبيقاته',
 'نظّم قسم الذكاء الاصطناعي ندوة علمية بحضور نخبة من الأساتذة لمناقشة آفاق التطور.',
 'نظّم قسم الذكاء الاصطناعي ندوة علمية موسعة ناقشت أحدث المستجدات في مجال التعلم العميق ومعالجة اللغات الطبيعية وتطبيقاتها في القطاعات الحكومية والصحية.',
 'event', TRUE, now() - interval '12 days',
 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&q=80'),
('top-students-2025', 'الكلية تكرم الطلاب المتفوقين للعام الأكاديمي 2025',
 'احتفلت الكلية بتكريم الطلاب المتفوقين في مختلف الأقسام تقديرًا لجهودهم.',
 'في احتفال بهيج، كرّمت عمادة الكلية الطلاب الأوائل على دفعاتهم في البرامج الأربعة، وأهدت لهم شهادات تقدير ودروعًا تذكارية.',
 'news', TRUE, now() - interval '25 days',
 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&q=80'),
('partnership-tech-company', 'توقيع اتفاقية تعاون مع شركة تقنية رائدة',
 'وقّعت الكلية مذكرة تفاهم مع شركة تقنية لتدريب الطلاب وتأهيلهم لسوق العمل.',
 'في إطار سعي الكلية لتعزيز الشراكات الصناعية، تم توقيع مذكرة تفاهم لتدريب طلاب السنوات النهائية وتقديم منح تدريبية.',
 'news', TRUE, now() - interval '40 days',
 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1200&q=80'),
('cybersecurity-workshop', 'ورشة تدريبية في الأمن السيبراني واختبار الاختراق',
 'أقام قسم الأمن السيبراني ورشة تدريبية للطلاب حول أحدث تقنيات اختبار الاختراق.',
 'استمرت الورشة لثلاثة أيام وغطّت أساسيات اختبار الاختراق والتحليل الجنائي الرقمي.',
 'event', TRUE, now() - interval '55 days',
 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&q=80'),
('coding-contest-5', 'انطلاق مسابقة البرمجة السنوية الخامسة',
 'أُطلقت النسخة الخامسة من مسابقة البرمجة السنوية بمشاركة طلاب من جميع الأقسام.',
 'تضمّنت المسابقة تحديات خوارزمية ومسابقات تطوير ويب وتطبيقات موبايل، وتأهّل الفائزون للتصفيات الإقليمية.',
 'event', TRUE, now() - interval '70 days',
 'https://images.unsplash.com/photo-1517077304055-6e89abbf09b0?w=1200&q=80');

-- Sample events
INSERT INTO public.events (title_ar, description_ar, location, event_date, event_time, image, is_featured) VALUES
('يوم التوظيف السنوي 2026', 'فرصة للطلاب والخريجين للتواصل مع الشركات التقنية الرائدة في اليمن والمنطقة.',
 'قاعة الاحتفالات الكبرى - مبنى الكلية', current_date + 14, '09:00',
 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&q=80', TRUE),
('ورشة عمل: مقدمة في الحوسبة السحابية', 'ورشة عملية لمدة يومين تغطي مفاهيم AWS و Azure الأساسية.',
 'مختبر الشبكات - الدور الثاني', current_date + 21, '14:00',
 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80', FALSE),
('ملتقى البحث العلمي للطلاب', 'يعرض الطلاب مشاريع تخرجهم وأبحاثهم العلمية أمام لجنة من الأساتذة.',
 'القاعة المركزية', current_date + 35, '10:00',
 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1200&q=80', TRUE);

-- About page
INSERT INTO public.site_pages (slug, title_ar, content_ar, meta_description, is_published, sort_order) VALUES
('about', 'عن الكلية',
 'تأسست كلية تكنولوجيا المعلومات وعلوم الحاسوب لتكون منارة علمية في مجال الحوسبة بمحافظة مأرب، وهي إحدى كليات جامعة إقليم سبأ. تسعى الكلية إلى إعداد جيل من المتخصصين في علوم الحاسوب وتقنية المعلومات قادرين على المساهمة في بناء مجتمع المعرفة وخدمة الوطن.

**الرؤية:** أن تكون الكلية مرجعًا أكاديميًا وبحثيًا متميزًا في مجالات تكنولوجيا المعلومات وعلوم الحاسوب على المستويين المحلي والإقليمي.

**الرسالة:** إعداد كوادر متخصصة مؤهلة علميًا ومهنيًا في مجالات الحوسبة، وإجراء الأبحاث التطبيقية، وتقديم الاستشارات التقنية لخدمة المجتمع.

**الأهداف:**
- توفير برامج أكاديمية حديثة تواكب التطورات التقنية.
- تنمية مهارات البحث العلمي لدى الطلاب والباحثين.
- بناء شراكات فاعلة مع القطاعين العام والخاص.
- المساهمة في التحول الرقمي للمؤسسات اليمنية.',
 'كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ. رؤيتنا ورسالتنا وأهدافنا.',
 TRUE, 1);