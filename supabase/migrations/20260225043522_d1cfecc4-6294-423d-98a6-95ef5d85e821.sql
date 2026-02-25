-- Table to store per-user sidebar link notes and custom order
CREATE TABLE public.sidebar_customizations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  link_key text NOT NULL,
  note text DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, link_key)
);

-- Enable RLS
ALTER TABLE public.sidebar_customizations ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own customizations
CREATE POLICY "Users can view own sidebar customizations"
  ON public.sidebar_customizations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sidebar customizations"
  ON public.sidebar_customizations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sidebar customizations"
  ON public.sidebar_customizations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sidebar customizations"
  ON public.sidebar_customizations FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_sidebar_customizations_updated_at
  BEFORE UPDATE ON public.sidebar_customizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();