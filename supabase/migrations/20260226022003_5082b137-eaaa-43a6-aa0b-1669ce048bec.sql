
-- ============================================================
-- 1. CLIENTS
-- ============================================================
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  status text NOT NULL DEFAULT 'active',
  notes text,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can manage all clients" ON public.clients FOR ALL USING (is_global_owner(auth.uid()));
CREATE POLICY "Company admins can manage clients" ON public.clients FOR ALL USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can view clients" ON public.clients FOR SELECT USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'clients', 'view'));
CREATE POLICY "Managers can edit clients" ON public.clients FOR UPDATE USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'clients', 'edit'));
CREATE POLICY "Managers can insert clients" ON public.clients FOR INSERT WITH CHECK (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'clients', 'edit'));
CREATE POLICY "Managers can delete clients" ON public.clients FOR DELETE USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'clients', 'delete'));
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. LOCATIONS
-- ============================================================
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  city text,
  state text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  geofence_lat numeric,
  geofence_lng numeric,
  geofence_radius integer DEFAULT 200,
  status text NOT NULL DEFAULT 'active',
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can manage all locations" ON public.locations FOR ALL USING (is_global_owner(auth.uid()));
CREATE POLICY "Company admins can manage locations" ON public.locations FOR ALL USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can view locations" ON public.locations FOR SELECT USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'locations', 'view'));
CREATE POLICY "Managers can edit locations" ON public.locations FOR UPDATE USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'locations', 'edit'));
CREATE POLICY "Managers can insert locations" ON public.locations FOR INSERT WITH CHECK (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'locations', 'edit'));
CREATE POLICY "Managers can delete locations" ON public.locations FOR DELETE USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'locations', 'delete'));
CREATE POLICY "Employees can view active locations" ON public.locations FOR SELECT USING (status = 'active' AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid() AND company_id = locations.company_id));
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3. SCHEDULED SHIFTS (without cross-table policy)
-- ============================================================
CREATE TABLE public.scheduled_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  slots integer DEFAULT 1,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  notes text,
  shift_code text,
  status text NOT NULL DEFAULT 'open',
  claimable boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scheduled_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can manage all scheduled_shifts" ON public.scheduled_shifts FOR ALL USING (is_global_owner(auth.uid()));
CREATE POLICY "Company admins can manage scheduled_shifts" ON public.scheduled_shifts FOR ALL USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can view scheduled_shifts" ON public.scheduled_shifts FOR SELECT USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'shifts', 'view'));
CREATE POLICY "Managers can edit scheduled_shifts" ON public.scheduled_shifts FOR UPDATE USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'shifts', 'edit'));
CREATE POLICY "Managers can insert scheduled_shifts" ON public.scheduled_shifts FOR INSERT WITH CHECK (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'shifts', 'edit'));
CREATE POLICY "Managers can delete scheduled_shifts" ON public.scheduled_shifts FOR DELETE USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'shifts', 'delete'));
CREATE TRIGGER update_scheduled_shifts_updated_at BEFORE UPDATE ON public.scheduled_shifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_scheduled_shifts_date ON public.scheduled_shifts(date);
CREATE INDEX idx_scheduled_shifts_company ON public.scheduled_shifts(company_id);

-- ============================================================
-- 4. SHIFT ASSIGNMENTS
-- ============================================================
CREATE TABLE public.shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.scheduled_shifts(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  responded_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can manage all shift_assignments" ON public.shift_assignments FOR ALL USING (is_global_owner(auth.uid()));
CREATE POLICY "Company admins can manage shift_assignments" ON public.shift_assignments FOR ALL USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can view shift_assignments" ON public.shift_assignments FOR SELECT USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'shifts', 'view'));
CREATE POLICY "Managers can edit shift_assignments" ON public.shift_assignments FOR UPDATE USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'shifts', 'edit'));
CREATE POLICY "Managers can insert shift_assignments" ON public.shift_assignments FOR INSERT WITH CHECK (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'shifts', 'edit'));
CREATE POLICY "Managers can delete shift_assignments" ON public.shift_assignments FOR DELETE USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'shifts', 'delete'));
CREATE POLICY "Employees can view own assignments" ON public.shift_assignments FOR SELECT USING (EXISTS (SELECT 1 FROM employees WHERE id = shift_assignments.employee_id AND user_id = auth.uid()));
CREATE POLICY "Employees can update own assignments" ON public.shift_assignments FOR UPDATE USING (EXISTS (SELECT 1 FROM employees WHERE id = shift_assignments.employee_id AND user_id = auth.uid()));
CREATE INDEX idx_shift_assignments_shift ON public.shift_assignments(shift_id);
CREATE INDEX idx_shift_assignments_employee ON public.shift_assignments(employee_id);

-- Now add the cross-table policy for employees viewing shifts
CREATE POLICY "Employees can view assigned shifts" ON public.scheduled_shifts FOR SELECT USING (
  EXISTS (SELECT 1 FROM shift_assignments sa JOIN employees e ON e.id = sa.employee_id WHERE sa.shift_id = scheduled_shifts.id AND e.user_id = auth.uid())
  OR (claimable AND status = 'open' AND EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid() AND company_id = scheduled_shifts.company_id))
);

-- ============================================================
-- 5. TIME ENTRIES
-- ============================================================
CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.scheduled_shifts(id) ON DELETE SET NULL,
  clock_in timestamptz NOT NULL,
  clock_out timestamptz,
  clock_in_lat numeric,
  clock_in_lng numeric,
  clock_out_lat numeric,
  clock_out_lng numeric,
  clock_in_within_geofence boolean DEFAULT false,
  clock_out_within_geofence boolean DEFAULT false,
  break_minutes integer DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'active',
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can manage all time_entries" ON public.time_entries FOR ALL USING (is_global_owner(auth.uid()));
CREATE POLICY "Company admins can manage time_entries" ON public.time_entries FOR ALL USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can view time_entries" ON public.time_entries FOR SELECT USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'shifts', 'view'));
CREATE POLICY "Managers can edit time_entries" ON public.time_entries FOR UPDATE USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'shifts', 'edit'));
CREATE POLICY "Managers can insert time_entries" ON public.time_entries FOR INSERT WITH CHECK (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'shifts', 'edit'));
CREATE POLICY "Employees can view own time_entries" ON public.time_entries FOR SELECT USING (EXISTS (SELECT 1 FROM employees WHERE id = time_entries.employee_id AND user_id = auth.uid()));
CREATE POLICY "Employees can insert own time_entries" ON public.time_entries FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM employees WHERE id = time_entries.employee_id AND user_id = auth.uid()));
CREATE POLICY "Employees can update own time_entries" ON public.time_entries FOR UPDATE USING (EXISTS (SELECT 1 FROM employees WHERE id = time_entries.employee_id AND user_id = auth.uid()) AND clock_out IS NULL);
CREATE INDEX idx_time_entries_employee ON public.time_entries(employee_id);
CREATE INDEX idx_time_entries_clock_in ON public.time_entries(clock_in);

-- ============================================================
-- 6. ANNOUNCEMENTS
-- ============================================================
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'normal',
  pinned boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid NOT NULL,
  media_urls jsonb DEFAULT '[]'::jsonb,
  link_url text,
  link_label text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can manage all announcements" ON public.announcements FOR ALL USING (is_global_owner(auth.uid()));
CREATE POLICY "Company admins can manage announcements" ON public.announcements FOR ALL USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can view announcements" ON public.announcements FOR SELECT USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'announcements', 'view'));
CREATE POLICY "Managers can edit announcements" ON public.announcements FOR UPDATE USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'announcements', 'edit'));
CREATE POLICY "Managers can insert announcements" ON public.announcements FOR INSERT WITH CHECK (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'announcements', 'edit'));
CREATE POLICY "Managers can delete announcements" ON public.announcements FOR DELETE USING (company_id IN (SELECT user_company_ids(auth.uid())) AND has_module_permission(auth.uid(), 'announcements', 'delete'));
CREATE POLICY "Employees can view published announcements" ON public.announcements FOR SELECT USING (published_at IS NOT NULL AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM employees WHERE user_id = auth.uid() AND company_id = announcements.company_id));
CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 7. CONVERSATIONS
-- ============================================================
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'direct',
  name text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 8. CONVERSATION MEMBERS
-- ============================================================
CREATE TABLE public.conversation_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

-- Now add conversation policies (after conversation_members exists)
CREATE POLICY "Owners can manage all conversations" ON public.conversations FOR ALL USING (is_global_owner(auth.uid()));
CREATE POLICY "Members can view their conversations" ON public.conversations FOR SELECT USING (EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = conversations.id AND user_id = auth.uid()));
CREATE POLICY "Authenticated users can create conversations" ON public.conversations FOR INSERT WITH CHECK (company_id IN (SELECT user_company_ids(auth.uid())) AND created_by = auth.uid());
CREATE POLICY "Members can update conversations" ON public.conversations FOR UPDATE USING (EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = conversations.id AND user_id = auth.uid()));

CREATE POLICY "Owners can manage all conversation_members" ON public.conversation_members FOR ALL USING (is_global_owner(auth.uid()));
CREATE POLICY "Members can view co-members" ON public.conversation_members FOR SELECT USING (EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = conversation_members.conversation_id AND cm.user_id = auth.uid()));
CREATE POLICY "Users can insert members to own conversations" ON public.conversation_members FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_members.conversation_id AND c.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = conversation_members.conversation_id AND cm.user_id = auth.uid() AND cm.role = 'admin')
);

-- ============================================================
-- 9. INTERNAL MESSAGES
-- ============================================================
CREATE TABLE public.internal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can manage all internal_messages" ON public.internal_messages FOR ALL USING (is_global_owner(auth.uid()));
CREATE POLICY "Members can view messages" ON public.internal_messages FOR SELECT USING (EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = internal_messages.conversation_id AND user_id = auth.uid()));
CREATE POLICY "Members can send messages" ON public.internal_messages FOR INSERT WITH CHECK (sender_id = auth.uid() AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = internal_messages.conversation_id AND user_id = auth.uid()));
CREATE POLICY "Senders can soft-delete own messages" ON public.internal_messages FOR UPDATE USING (sender_id = auth.uid());
CREATE INDEX idx_internal_messages_convo ON public.internal_messages(conversation_id, created_at);

-- ============================================================
-- 10. MESSAGE REACTIONS
-- ============================================================
CREATE TABLE public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.internal_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view reactions" ON public.message_reactions FOR SELECT USING (EXISTS (SELECT 1 FROM internal_messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id WHERE m.id = message_reactions.message_id AND cm.user_id = auth.uid()));
CREATE POLICY "Users can add reactions" ON public.message_reactions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can remove own reactions" ON public.message_reactions FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- 11. READ RECEIPTS
-- ============================================================
CREATE TABLE public.read_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);
ALTER TABLE public.read_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view read receipts" ON public.read_receipts FOR SELECT USING (EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id = read_receipts.conversation_id AND user_id = auth.uid()));
CREATE POLICY "Users can upsert own read receipts" ON public.read_receipts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own read receipts" ON public.read_receipts FOR UPDATE USING (user_id = auth.uid());

-- ============================================================
-- 12. REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;

-- ============================================================
-- 13. STORAGE
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('announcement-media', 'announcement-media', true);
CREATE POLICY "Authenticated users can upload announcement media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'announcement-media' AND auth.uid() IS NOT NULL);
CREATE POLICY "Anyone can view announcement media" ON storage.objects FOR SELECT USING (bucket_id = 'announcement-media');
CREATE POLICY "Admins can delete announcement media" ON storage.objects FOR DELETE USING (bucket_id = 'announcement-media' AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));
