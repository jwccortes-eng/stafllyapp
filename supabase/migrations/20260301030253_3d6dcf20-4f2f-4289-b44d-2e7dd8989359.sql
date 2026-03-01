
-- Tabla de preferencias de notificación por usuario
CREATE TABLE public.notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  notification_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  channel text NOT NULL DEFAULT 'in_app', -- 'in_app', 'push', 'email'
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, notification_type, channel)
);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can manage their own preferences
CREATE POLICY "Users can view own notification preferences"
ON public.notification_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences"
ON public.notification_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences"
ON public.notification_preferences FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notification preferences"
ON public.notification_preferences FOR DELETE
USING (auth.uid() = user_id);

-- Owners can manage all
CREATE POLICY "Owners can manage all notification preferences"
ON public.notification_preferences FOR ALL
USING (is_global_owner(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_notification_preferences_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
