-- ============================================================================
-- SBYIM NOC PORTAL - SAMPLE SEED DATA
-- ============================================================================

-- 1. Default Custom Types
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

-- 2. Default Custom Contractors
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

-- 3. Initial User Accounts
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
