-- Research papers table
CREATE TABLE public.research_papers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title_ar TEXT NOT NULL,
  title_en TEXT,
  abstract_ar TEXT,
  abstract_en TEXT,
  authors TEXT NOT NULL,
  faculty_id UUID REFERENCES public.faculty(id) ON DELETE SET NULL,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  journal_name TEXT,
  publication_year INTEGER NOT NULL,
  publication_date DATE,
  doi TEXT,
  pdf_url TEXT,
  external_url TEXT,
  keywords TEXT,
  citations_count INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.research_papers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_papers TO authenticated;
GRANT ALL ON public.research_papers TO service_role;

ALTER TABLE public.research_papers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view published papers"
ON public.research_papers FOR SELECT
USING (is_published = true);

CREATE TRIGGER update_research_papers_updated_at
BEFORE UPDATE ON public.research_papers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_research_papers_year ON public.research_papers(publication_year DESC);
CREATE INDEX idx_research_papers_faculty ON public.research_papers(faculty_id);

-- Storage bucket for research PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('research-pdfs', 'research-pdfs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can read research pdfs"
ON storage.objects FOR SELECT
USING (bucket_id = 'research-pdfs');

-- Seed sample papers
INSERT INTO public.research_papers (title_ar, authors, journal_name, publication_year, abstract_ar, keywords, citations_count, pdf_url) VALUES
('تطبيقات الذكاء الاصطناعي في تشخيص الأمراض المزمنة', 'د. أحمد الحضرمي، د. سارة المقطري', 'مجلة جامعة إقليم سبأ للعلوم والتكنولوجيا', 2024, 'يتناول هذا البحث تطبيقات تقنيات التعلم العميق في تشخيص الأمراض المزمنة باستخدام بيانات الصور الطبية، مع تحليل دقة النماذج المختلفة على مجموعات بيانات حقيقية.', 'ذكاء اصطناعي، تعلم عميق، تشخيص طبي', 12, null),
('الأمن السيبراني في البنية التحتية لإنترنت الأشياء', 'د. محمد الصبري', 'المجلة العربية لأمن المعلومات', 2024, 'دراسة شاملة لتهديدات الأمن السيبراني في أنظمة إنترنت الأشياء واقتراح إطار عمل متعدد الطبقات لحماية البيانات والأجهزة المتصلة.', 'أمن سيبراني، إنترنت الأشياء، تشفير', 8, null),
('نظام ذكي لإدارة الموارد التعليمية باستخدام Blockchain', 'د. ليلى الحاج، أ. خالد العامري', 'IEEE Access', 2023, 'يقدم البحث نموذجاً مبتكراً لإدارة الشهادات والسجلات الأكاديمية باستخدام تقنية البلوكشين لضمان الشفافية ومنع التزوير.', 'بلوكشين، تعليم، إدارة سجلات', 24, null),
('تحليل أداء خوارزميات التعلم الآلي في تصنيف النصوص العربية', 'د. سارة المقطري', 'مجلة المعالجة الذكية للغة العربية', 2023, 'مقارنة بين خوارزميات SVM وRandom Forest وBERT في تصنيف النصوص العربية على مجموعات بيانات متعددة المجالات.', 'تعلم آلي، معالجة لغات طبيعية، اللغة العربية', 19, null),
('بنية سحابية مرنة للتطبيقات التعليمية في البيئات منخفضة الموارد', 'د. أحمد الحضرمي', 'Journal of Cloud Computing', 2022, 'تصميم بنية سحابية هجينة محسّنة للتطبيقات التعليمية في المناطق ذات الاتصال المحدود بالإنترنت.', 'حوسبة سحابية، تعليم إلكتروني', 31, null),
('تطبيق تقنيات الرؤية الحاسوبية في الزراعة الذكية', 'د. ليلى الحاج', 'Computers and Electronics in Agriculture', 2022, 'استخدام نماذج CNN للكشف المبكر عن أمراض المحاصيل من خلال تحليل صور الأقمار الصناعية والطائرات بدون طيار.', 'رؤية حاسوبية، زراعة ذكية، CNN', 42, null);
