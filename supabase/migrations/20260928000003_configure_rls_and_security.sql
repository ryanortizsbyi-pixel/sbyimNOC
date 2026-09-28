-- ============================================================================
-- Migration: 20260928000003_configure_rls_and_security.sql
-- Description: Enables Row Level Security (RLS) and sets access policies
-- ============================================================================

-- Enable Row Level Security on all tables
ALTER TABLE public.noc_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.noc_requirements_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sbyi_coc_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.noc_custom_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.noc_custom_contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.noc_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.noc_users ENABLE ROW LEVEL SECURITY;

-- 1. noc_records Policies
DROP POLICY IF EXISTS "Allow all operations on noc_records" ON public.noc_records;
CREATE POLICY "Allow all operations on noc_records"
    ON public.noc_records FOR ALL TO public USING (true) WITH CHECK (true);

-- 2. noc_requirements_docs Policies
DROP POLICY IF EXISTS "Allow all operations on noc_requirements_docs" ON public.noc_requirements_docs;
CREATE POLICY "Allow all operations on noc_requirements_docs"
    ON public.noc_requirements_docs FOR ALL TO public USING (true) WITH CHECK (true);

-- 3. sbyi_coc_docs Policies
DROP POLICY IF EXISTS "Allow all operations on sbyi_coc_docs" ON public.sbyi_coc_docs;
CREATE POLICY "Allow all operations on sbyi_coc_docs"
    ON public.sbyi_coc_docs FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. ai_documents Policies
DROP POLICY IF EXISTS "Allow all operations on ai_documents" ON public.ai_documents;
CREATE POLICY "Allow all operations on ai_documents"
    ON public.ai_documents FOR ALL TO public USING (true) WITH CHECK (true);

-- 5. noc_custom_types Policies
DROP POLICY IF EXISTS "Allow all operations on noc_custom_types" ON public.noc_custom_types;
CREATE POLICY "Allow all operations on noc_custom_types"
    ON public.noc_custom_types FOR ALL TO public USING (true) WITH CHECK (true);

-- 6. noc_custom_contractors Policies
DROP POLICY IF EXISTS "Allow all operations on noc_custom_contractors" ON public.noc_custom_contractors;
CREATE POLICY "Allow all operations on noc_custom_contractors"
    ON public.noc_custom_contractors FOR ALL TO public USING (true) WITH CHECK (true);

-- 7. noc_settings Policies
DROP POLICY IF EXISTS "Allow all operations on noc_settings" ON public.noc_settings;
CREATE POLICY "Allow all operations on noc_settings"
    ON public.noc_settings FOR ALL TO public USING (true) WITH CHECK (true);

-- 8. noc_users Policies
DROP POLICY IF EXISTS "Allow all operations on noc_users" ON public.noc_users;
CREATE POLICY "Allow all operations on noc_users"
    ON public.noc_users FOR ALL TO public USING (true) WITH CHECK (true);
