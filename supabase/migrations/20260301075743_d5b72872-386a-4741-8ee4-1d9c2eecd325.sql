
-- Shift group chat messages
CREATE TABLE public.shift_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id UUID NOT NULL REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  sender_type TEXT NOT NULL DEFAULT 'employee' CHECK (sender_type IN ('employee', 'admin')),
  sender_employee_id UUID REFERENCES public.employees(id),
  sender_user_id UUID,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Chat open/close state per shift
CREATE TABLE public.shift_chat_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id UUID NOT NULL REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE UNIQUE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  is_open BOOLEAN NOT NULL DEFAULT true,
  auto_open_at TIMESTAMPTZ,
  auto_close_at TIMESTAMPTZ,
  reopened_by UUID,
  reopened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_shift_chat_messages_shift_id ON public.shift_chat_messages(shift_id);
CREATE INDEX idx_shift_chat_messages_created_at ON public.shift_chat_messages(shift_id, created_at);
CREATE INDEX idx_shift_chat_config_shift_id ON public.shift_chat_config(shift_id);

-- Enable RLS
ALTER TABLE public.shift_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_chat_config ENABLE ROW LEVEL SECURITY;

-- RLS: shift_chat_messages - employees can read messages for shifts they're assigned to
CREATE POLICY "Users can read shift chat messages for their company"
ON public.shift_chat_messages FOR SELECT
USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Admins/managers can insert messages
CREATE POLICY "Admins can send shift chat messages"
ON public.shift_chat_messages FOR INSERT
WITH CHECK (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Employees can send messages if assigned to the shift
CREATE POLICY "Employees can send shift chat messages if assigned"
ON public.shift_chat_messages FOR INSERT
WITH CHECK (
  sender_type = 'employee' AND sender_employee_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM shift_assignments sa
    WHERE sa.shift_id = shift_chat_messages.shift_id
    AND sa.employee_id = shift_chat_messages.sender_employee_id
    AND sa.status NOT IN ('rejected', 'removed')
  )
);

-- RLS: shift_chat_config
CREATE POLICY "Users can read shift chat config for their company"
ON public.shift_chat_config FOR SELECT
USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

CREATE POLICY "Admins can manage shift chat config"
ON public.shift_chat_config FOR ALL
USING (company_id IN (SELECT public.user_company_ids(auth.uid())));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_chat_messages;

-- Auto-update trigger for shift_chat_config
CREATE TRIGGER update_shift_chat_config_updated_at
BEFORE UPDATE ON public.shift_chat_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
