-- Disposable PG17 harness schema for B1-34 terminal visibility fix.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description_ar text,
  is_active boolean NOT NULL DEFAULT true,
  student_visible boolean NOT NULL DEFAULT false,
  requires_attachment boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  marker text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
