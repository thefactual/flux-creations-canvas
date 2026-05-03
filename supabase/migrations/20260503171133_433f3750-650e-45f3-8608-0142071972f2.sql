ALTER TABLE public.create_projects ADD COLUMN IF NOT EXISTS sort_order double precision;
UPDATE public.create_projects SET sort_order = EXTRACT(EPOCH FROM updated_at) WHERE sort_order IS NULL;
CREATE INDEX IF NOT EXISTS idx_create_projects_sort_order ON public.create_projects(sort_order);