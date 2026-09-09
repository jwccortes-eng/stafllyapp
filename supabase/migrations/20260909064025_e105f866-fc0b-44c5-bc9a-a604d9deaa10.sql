ALTER TABLE public.announcement_recipients REPLICA IDENTITY FULL;
ALTER TABLE public.announcement_versions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcement_recipients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcement_versions;