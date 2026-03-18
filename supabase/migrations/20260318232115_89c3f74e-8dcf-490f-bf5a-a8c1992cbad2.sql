-- Create company-logos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to company-logos
CREATE POLICY "Authenticated users can upload company logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'company-logos');

-- Allow public read access
CREATE POLICY "Public read access for company logos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'company-logos');

-- Allow authenticated users to update/delete their uploads
CREATE POLICY "Authenticated users can manage company logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'company-logos');

CREATE POLICY "Authenticated users can update company logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'company-logos');