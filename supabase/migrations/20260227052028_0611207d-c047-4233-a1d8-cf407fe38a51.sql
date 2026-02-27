-- Add avatar_url to employees table
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS avatar_url text;

-- Create storage bucket for employee avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-avatars', 'employee-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for employee-avatars bucket
CREATE POLICY "Anyone can view employee avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'employee-avatars');

CREATE POLICY "Authenticated users can upload employee avatars"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'employee-avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update employee avatars"
ON storage.objects FOR UPDATE
USING (bucket_id = 'employee-avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete employee avatars"
ON storage.objects FOR DELETE
USING (bucket_id = 'employee-avatars' AND auth.role() = 'authenticated');
