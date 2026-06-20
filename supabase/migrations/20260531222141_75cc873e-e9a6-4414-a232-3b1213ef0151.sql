ALTER TABLE public.faculty
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'faculty',
  ADD COLUMN IF NOT EXISTS start_year INTEGER;

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_faculty_category ON public.faculty(category);
CREATE INDEX IF NOT EXISTS idx_programs_status ON public.programs(status);