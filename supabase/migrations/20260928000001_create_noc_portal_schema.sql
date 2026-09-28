-- ============================================================================
-- Migration: 20260928000001_create_noc_portal_schema.sql
-- Description: Creates core relational tables, indexes, and triggers for NOC Portal
-- ============================================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Table: noc_records (Official NOC Permits & Verification Registry)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.noc_records (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    noc_number VARCHAR(100) UNIQUE NOT NULL,
    noc_type VARCHAR(100) NOT NULL DEFAULT 'Activity',
    client VARCHAR(255) NOT NULL,
    issued_to VARCHAR(255) NOT NULL,
    company_code VARCHAR(100),
    date_of_issuance DATE NOT NULL,
    date_of_expiration DATE NOT NULL,
    description TEXT,
    documents JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.noc_records IS 'Official No Objection Certificate (NOC) registry storing permit details and attachments';
COMMENT ON COLUMN public.noc_records.documents IS 'Array of JSON objects containing document metadata, storage paths, and URLs';

CREATE INDEX IF NOT EXISTS idx_noc_records_noc_number ON public.noc_records (noc_number);
CREATE INDEX IF NOT EXISTS idx_noc_records_noc_type ON public.noc_records (noc_type);
CREATE INDEX IF NOT EXISTS idx_noc_records_client ON public.noc_records (client);
CREATE INDEX IF NOT EXISTS idx_noc_records_issued_to ON public.noc_records (issued_to);
CREATE INDEX IF NOT EXISTS idx_noc_records_date_issuance ON public.noc_records (date_of_issuance DESC);
CREATE INDEX IF NOT EXISTS idx_noc_records_date_expiration ON public.noc_records (date_of_expiration ASC);
CREATE INDEX IF NOT EXISTS idx_noc_records_created_at ON public.noc_records (created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. Table: noc_requirements_docs (Official NOC Guidelines & Checklists)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.noc_requirements_docs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    data_url TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    uploaded_by VARCHAR(255) NOT NULL DEFAULT 'System Administrator'
);

COMMENT ON TABLE public.noc_requirements_docs IS 'Official NOC guideline and standard compliance documents (Max 5 documents enforced)';
CREATE INDEX IF NOT EXISTS idx_noc_req_docs_uploaded_at ON public.noc_requirements_docs (uploaded_at DESC);

-- ----------------------------------------------------------------------------
-- 3. Table: sbyi_coc_docs (SBYI Code of Conduct (COC) PDFs)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sbyi_coc_docs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    size BIGINT NOT NULL DEFAULT 0,
    data_url TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    uploaded_by VARCHAR(255) NOT NULL DEFAULT 'SBYI Management'
);

COMMENT ON TABLE public.sbyi_coc_docs IS 'Official SBYI Code of Conduct (COC) PDF Documents (Max 8 PDF files enforced)';
CREATE INDEX IF NOT EXISTS idx_sbyi_coc_docs_uploaded_at ON public.sbyi_coc_docs (uploaded_at DESC);

-- ----------------------------------------------------------------------------
-- 4. Table: ai_documents (Dedicated AI Knowledge Base Documents)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_documents (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    data_url TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    uploaded_by VARCHAR(255) NOT NULL DEFAULT 'System Administrator'
);

COMMENT ON TABLE public.ai_documents IS 'AI Assistant Knowledge Base Documents (DOC, DOCX, or PDF files)';
CREATE INDEX IF NOT EXISTS idx_ai_docs_uploaded_at ON public.ai_documents (uploaded_at DESC);

-- ----------------------------------------------------------------------------
-- 5. Table: noc_custom_types (Dynamic NOC Categories)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.noc_custom_types (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.noc_custom_types IS 'Custom NOC classification categories';
CREATE INDEX IF NOT EXISTS idx_noc_custom_types_name ON public.noc_custom_types (name);

-- ----------------------------------------------------------------------------
-- 6. Table: noc_custom_contractors (Dynamic Contractors & Companies)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.noc_custom_contractors (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.noc_custom_contractors IS 'Custom contractors and registered companies';
CREATE INDEX IF NOT EXISTS idx_noc_custom_contractors_name ON public.noc_custom_contractors (name);

-- ----------------------------------------------------------------------------
-- 7. Table: noc_settings (System Preferences & Configuration)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.noc_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.noc_settings IS 'Global system preferences, dynamic configs, and contractor renames';

-- ----------------------------------------------------------------------------
-- 8. Table: noc_users (User Accounts & Role Credentials)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.noc_users (
    username VARCHAR(100) PRIMARY KEY,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'guest',
    display_name VARCHAR(255),
    email VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.noc_users IS 'Portal user credentials and role access levels';
CREATE INDEX IF NOT EXISTS idx_noc_users_role ON public.noc_users (role);

-- ----------------------------------------------------------------------------
-- 9. Automatic updated_at Trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_noc_records_updated_at ON public.noc_records;
CREATE TRIGGER trg_noc_records_updated_at
    BEFORE UPDATE ON public.noc_records
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_noc_users_updated_at ON public.noc_users;
CREATE TRIGGER trg_noc_users_updated_at
    BEFORE UPDATE ON public.noc_users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_noc_settings_updated_at ON public.noc_settings;
CREATE TRIGGER trg_noc_settings_updated_at
    BEFORE UPDATE ON public.noc_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
