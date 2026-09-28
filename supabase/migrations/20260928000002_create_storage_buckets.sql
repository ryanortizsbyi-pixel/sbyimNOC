-- ============================================================================
-- Migration: 20260928000002_create_storage_buckets.sql
-- Description: Creates Supabase Storage buckets for PDFs, DOCX, and images
-- ============================================================================

-- Insert storage buckets if they do not exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('noc-documents', 'noc-documents', true, 52428800, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
    ('noc-requirements', 'noc-requirements', true, 52428800, ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'image/jpeg', 'image/png']),
    ('sbyi-coc', 'sbyi-coc', true, 52428800, ARRAY['application/pdf']),
    ('ai-documents', 'ai-documents', true, 52428800, ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'])
ON CONFLICT (id) DO UPDATE 
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage RLS Policies
CREATE POLICY "Public Access NOC Documents"
ON storage.objects FOR SELECT
TO public
USING (bucket_id IN ('noc-documents', 'noc-requirements', 'sbyi-coc', 'ai-documents'));

CREATE POLICY "Allow Insert NOC Documents"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id IN ('noc-documents', 'noc-requirements', 'sbyi-coc', 'ai-documents'));

CREATE POLICY "Allow Update NOC Documents"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id IN ('noc-documents', 'noc-requirements', 'sbyi-coc', 'ai-documents'))
WITH CHECK (bucket_id IN ('noc-documents', 'noc-requirements', 'sbyi-coc', 'ai-documents'));

CREATE POLICY "Allow Delete NOC Documents"
ON storage.objects FOR DELETE
TO public
USING (bucket_id IN ('noc-documents', 'noc-requirements', 'sbyi-coc', 'ai-documents'));
