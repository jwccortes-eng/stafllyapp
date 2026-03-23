
-- Create storage bucket for payroll truth files
INSERT INTO storage.buckets (id, name, public)
VALUES ('payroll-truth-files', 'payroll-truth-files', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload/read/delete their company's truth files
CREATE POLICY "Authenticated users can upload truth files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'payroll-truth-files');

CREATE POLICY "Authenticated users can read truth files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payroll-truth-files');

CREATE POLICY "Authenticated users can delete truth files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'payroll-truth-files');
