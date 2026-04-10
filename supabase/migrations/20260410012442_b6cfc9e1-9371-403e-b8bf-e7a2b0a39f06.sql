
-- ============================================
-- PARCEROS COMMUNITY ENGINE — PHASE 1 SCHEMA
-- ============================================

-- 1. Community Channels
CREATE TABLE public.community_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  zone TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  icon TEXT DEFAULT '💬',
  pinned_message_ids UUID[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.community_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active channels"
  ON public.community_channels FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage channels"
  ON public.community_channels FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('developer', 'owner', 'admin'))
  );

-- 2. Channel Members
CREATE TABLE public.channel_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.community_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ DEFAULT now(),
  is_muted BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(channel_id, user_id)
);

ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view members of channels they belong to"
  ON public.channel_members FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.channel_members cm WHERE cm.channel_id = channel_members.channel_id AND cm.user_id = auth.uid())
  );

CREATE POLICY "Users can join channels"
  ON public.channel_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own membership"
  ON public.channel_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can leave channels"
  ON public.channel_members FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 3. Channel Messages
CREATE TABLE public.channel_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.community_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  metadata JSONB DEFAULT '{}',
  reactions JSONB DEFAULT '{}',
  reply_to UUID REFERENCES public.channel_messages(id),
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_channel_messages_channel ON public.channel_messages(channel_id, created_at DESC);

ALTER TABLE public.channel_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Channel members can view messages"
  ON public.channel_messages FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND
    EXISTS (SELECT 1 FROM public.channel_members cm WHERE cm.channel_id = channel_messages.channel_id AND cm.user_id = auth.uid())
  );

CREATE POLICY "Channel members can post messages"
  ON public.channel_messages FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.channel_members cm WHERE cm.channel_id = channel_messages.channel_id AND cm.user_id = auth.uid())
  );

CREATE POLICY "Users can update their own messages"
  ON public.channel_messages FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- 4. Flash Jobs
CREATE TABLE public.flash_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  zone TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  job_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  pay_amount NUMERIC(10,2),
  pay_type TEXT NOT NULL DEFAULT 'hourly',
  slots_total INTEGER NOT NULL DEFAULT 1,
  slots_filled INTEGER NOT NULL DEFAULT 0,
  urgency_level TEXT NOT NULL DEFAULT 'normal',
  requirements TEXT[],
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  posted_by UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id),
  channel_id UUID REFERENCES public.community_channels(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_flash_jobs_status ON public.flash_jobs(status, expires_at DESC);
CREATE INDEX idx_flash_jobs_zone ON public.flash_jobs(zone, category);

ALTER TABLE public.flash_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view open flash jobs"
  ON public.flash_jobs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create flash jobs"
  ON public.flash_jobs FOR INSERT TO authenticated
  WITH CHECK (posted_by = auth.uid());

CREATE POLICY "Posters can update their flash jobs"
  ON public.flash_jobs FOR UPDATE TO authenticated
  USING (posted_by = auth.uid());

-- 5. Flash Job Responses
CREATE TABLE public.flash_job_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flash_job_id UUID NOT NULL REFERENCES public.flash_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'interested',
  message TEXT,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  UNIQUE(flash_job_id, user_id)
);

CREATE INDEX idx_flash_job_responses_job ON public.flash_job_responses(flash_job_id, status);

ALTER TABLE public.flash_job_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view responses to jobs they posted"
  ON public.flash_job_responses FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.flash_jobs fj WHERE fj.id = flash_job_responses.flash_job_id AND fj.posted_by = auth.uid())
  );

CREATE POLICY "Users can respond to flash jobs"
  ON public.flash_job_responses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own responses"
  ON public.flash_job_responses FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.flash_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.flash_job_responses;

-- Update trigger for timestamps
CREATE TRIGGER update_community_channels_updated_at
  BEFORE UPDATE ON public.community_channels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_flash_jobs_updated_at
  BEFORE UPDATE ON public.flash_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
