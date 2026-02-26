
-- Reactions on announcements (like a social network)
CREATE TABLE public.announcement_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL DEFAULT '👍',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(announcement_id, employee_id, emoji)
);

ALTER TABLE public.announcement_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can insert own reactions"
ON public.announcement_reactions FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM employees WHERE id = announcement_reactions.employee_id AND user_id = auth.uid())
);

CREATE POLICY "Employees can delete own reactions"
ON public.announcement_reactions FOR DELETE
USING (
  EXISTS (SELECT 1 FROM employees WHERE id = announcement_reactions.employee_id AND user_id = auth.uid())
);

CREATE POLICY "Authenticated can view reactions"
ON public.announcement_reactions FOR SELECT
USING (
  EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Owners can manage all reactions"
ON public.announcement_reactions FOR ALL
USING (is_global_owner(auth.uid()));

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcement_reactions;
