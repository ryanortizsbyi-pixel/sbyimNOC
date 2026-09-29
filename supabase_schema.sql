-- ============================================================================
-- SBYIM NOC PORTAL - SUPABASE / POSTGRESQL DATABASE SCHEMA
-- ============================================================================
-- Instructions:
-- 1. Open your Supabase Project Dashboard (https://supabase.com/dashboard)
-- 2. Go to the SQL Editor (left sidebar > SQL Editor)
-- 3. Paste this entire script and click "Run" (or press Ctrl+Enter / Cmd+Enter)
-- 4. Your project URL & Anon Key are pre-configured in the NOC Portal Web App!
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. TABLE: noc_records (Main NOC Certificate & Permit Registry)
-- ============================================================================
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
COMMENT ON COLUMN public.noc_records.documents IS 'Array of JSON objects containing document metadata and DataURL/Storage paths';

CREATE INDEX IF NOT EXISTS idx_noc_records_noc_number ON public.noc_records (noc_number);
CREATE INDEX IF NOT EXISTS idx_noc_records_noc_type ON public.noc_records (noc_type);
CREATE INDEX IF NOT EXISTS idx_noc_records_client ON public.noc_records (client);
CREATE INDEX IF NOT EXISTS idx_noc_records_issued_to ON public.noc_records (issued_to);
CREATE INDEX IF NOT EXISTS idx_noc_records_date_issuance ON public.noc_records (date_of_issuance DESC);
CREATE INDEX IF NOT EXISTS idx_noc_records_date_expiration ON public.noc_records (date_of_expiration ASC);
CREATE INDEX IF NOT EXISTS idx_noc_records_created_at ON public.noc_records (created_at DESC);

-- ============================================================================
-- 2. TABLE: noc_requirements_docs (Official Guidelines & Compliance Files)
-- ============================================================================
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

-- ============================================================================
-- 3. TABLE: sbyi_coc_docs (SBYI Code of Conduct (COC) PDF Documents)
-- ============================================================================
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

-- ============================================================================
-- 4. TABLE: ai_documents (Dedicated AI Knowledge Base Documents: DOC, DOCX, PDF)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ai_documents (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL DEFAULT 0,
    data_url TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    uploaded_by VARCHAR(255) NOT NULL DEFAULT 'System Administrator'
);

COMMENT ON TABLE public.ai_documents IS 'AI Assistant Knowledge Base Documents (DOC, DOCX, or PDF files only)';
CREATE INDEX IF NOT EXISTS idx_ai_docs_uploaded_at ON public.ai_documents (uploaded_at DESC);

-- ============================================================================
-- 5. TABLE: noc_custom_types (Dynamic NOC Categories)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.noc_custom_types (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.noc_custom_types IS 'Custom NOC classification types added by administrators';
CREATE INDEX IF NOT EXISTS idx_noc_custom_types_name ON public.noc_custom_types (name);

-- ============================================================================
-- 6. TABLE: noc_custom_contractors (Dynamic Contractors & Companies)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.noc_custom_contractors (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.noc_custom_contractors IS 'Custom contractors and registered companies added by administrators';
CREATE INDEX IF NOT EXISTS idx_noc_custom_contractors_name ON public.noc_custom_contractors (name);

-- ============================================================================
-- 7. TABLE: noc_settings (System Preferences, Custom Maps & Dynamic Configs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.noc_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.noc_settings IS 'Global system settings, contractor renames, and application state configurations';

-- ============================================================================
-- 8. TABLE: noc_users (User Database & Role Accounts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.noc_users (
    username VARCHAR(100) PRIMARY KEY,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'guest',
    display_name VARCHAR(255),
    email VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.noc_users IS 'Portal user credentials, access levels, and role permissions';
CREATE INDEX IF NOT EXISTS idx_noc_users_role ON public.noc_users (role);

-- ============================================================================
-- 9. AUTOMATIC TIMESTAMP TRIGGER (Updates updated_at on row modification)
-- ============================================================================
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

-- ============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.noc_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.noc_requirements_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sbyi_coc_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.noc_custom_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.noc_custom_contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.noc_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.noc_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on noc_records" ON public.noc_records;
DROP POLICY IF EXISTS "Allow all operations on noc_requirements_docs" ON public.noc_requirements_docs;
DROP POLICY IF EXISTS "Allow all operations on sbyi_coc_docs" ON public.sbyi_coc_docs;
DROP POLICY IF EXISTS "Allow all operations on ai_documents" ON public.ai_documents;
DROP POLICY IF EXISTS "Allow all operations on noc_custom_types" ON public.noc_custom_types;
DROP POLICY IF EXISTS "Allow all operations on noc_custom_contractors" ON public.noc_custom_contractors;
DROP POLICY IF EXISTS "Allow all operations on noc_settings" ON public.noc_settings;
DROP POLICY IF EXISTS "Allow all operations on noc_users" ON public.noc_users;

CREATE POLICY "Allow all operations on noc_records"
    ON public.noc_records FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on noc_requirements_docs"
    ON public.noc_requirements_docs FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on sbyi_coc_docs"
    ON public.sbyi_coc_docs FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on ai_documents"
    ON public.ai_documents FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on noc_custom_types"
    ON public.noc_custom_types FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on noc_custom_contractors"
    ON public.noc_custom_contractors FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on noc_settings"
    ON public.noc_settings FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on noc_users"
    ON public.noc_users FOR ALL TO public USING (true) WITH CHECK (true);

-- ============================================================================
-- 10.1 SUPABASE REALTIME MULTI-BROWSER REPLICATION & PUBLICATION
-- ============================================================================
-- Set full replica identity for comprehensive realtime payloads
ALTER TABLE public.noc_records REPLICA IDENTITY FULL;

-- Add noc_records to supabase_realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'noc_records'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.noc_records;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Fallback for environments where publication exists
        NULL;
END $$;

-- ============================================================================
-- 11. SEED DATA (Default Types, Contractors, Records, Settings & System Accounts)
-- ============================================================================
-- 11.1 Default Categories
INSERT INTO public.noc_custom_types (name)
VALUES 
    ('Activity'),
    ('Activity NOC'),
    ('Berthing NOC'),
    ('Construction Camp Site Approval'),
    ('Construction Camp Size & Location Approval'),
    ('Construction NOC'),
    ('Design and Build NOC'),
    ('Maintenance Activity'),
    ('Maintenance NOC'),
    ('Marine Survey NOC'),
    ('O&M NOC'),
    ('Operation & Maintenance NOC'),
    ('Site Visit & Meeting'),
    ('Temporary Occupancy Certificate')
ON CONFLICT (name) DO NOTHING;

-- 11.2 Default Registered Contractors
INSERT INTO public.noc_custom_contractors (name)
VALUES
    ('APEX ENGINEERING & INFRASTRUCTURE LTD.'),
    ('TRANS-GULF CONTRACTING CO.'),
    ('PIONEER DEMOLITION SPECIALISTS LLC'),
    ('SKYLINE ELECTROMECHANICAL SERVICES'),
    ('METROPOLITAN BUILDERS CORP.'),
    ('AL JABER BUILDING LLC'),
    ('ARABTEC CONSTRUCTION'),
    ('SIX CONSTRUCT')
ON CONFLICT (name) DO NOTHING;

-- 11.3 Initial Settings
INSERT INTO public.noc_settings (key, value)
VALUES
    ('noc_contractor_renames', '{}'::jsonb),
    ('portal_config', '{"autoSync": true, "theme": "light"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 11.5 Initial User Accounts
INSERT INTO public.noc_users (username, password, role, display_name, email)
VALUES
    ('ryan', 'spider06', 'developer', 'Ryan Ortiz (Developer)', ''),
    ('SBYIM', 'NOC#2022#', 'admin', 'SBYI Management', ''),
    ('security', 'sec@2024', 'security', 'SBYIM Security Officer', ''),
    ('Employee01', '666666@', 'employee', 'Island Security', ''),
    ('Employee02', '777777#', 'employee', 'Inspire Integrated', ''),
    ('1GDL', '55555', 'guest', 'Gulf Dunes Landscapping', '')
ON CONFLICT (username) DO UPDATE
SET password = EXCLUDED.password,
    role = EXCLUDED.role,
    display_name = EXCLUDED.display_name,
    email = EXCLUDED.email;

-- ============================================================================
-- END OF SCHEMA SCRIPT
-- ============================================================================
