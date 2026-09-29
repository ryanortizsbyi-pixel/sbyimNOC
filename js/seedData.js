/**
 * NOC Portal - Initial Realistic Seed Data
 * Generates realistic NOC records with embedded sample PDF and image documents for testing.
 */

// Helper to create a clean SVG Data URL simulating an architectural plan or inspection image
function createSampleSVGImage(title, subtitle, color = '#1E40AF') {
  const svgString = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#E2E8F0"/>
    </linearGradient>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color}"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#CBD5E1" stroke-width="0.8"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>
  <rect x="40" y="40" width="720" height="520" rx="12" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2"/>
  <rect x="40" y="40" width="720" height="90" rx="12" fill="url(#headerGrad)"/>
  <text x="70" y="85" fill="#FFFFFF" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="24" font-weight="bold">OFFICIAL NOC VERIFICATION ATTACHMENT</text>
  <text x="70" y="112" fill="rgba(255,255,255,0.85)" font-family="Arial, sans-serif" font-size="14">DOCUMENT IDENTIFIER: ${subtitle}</text>
  
  <rect x="70" y="160" width="660" height="260" rx="8" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
  <circle cx="140" cy="230" r="45" fill="${color}" opacity="0.15"/>
  <path d="M125 230 L135 240 L155 220" stroke="${color}" stroke-width="5" fill="none" stroke-linecap="round"/>
  
  <text x="210" y="215" fill="#0F172A" font-family="Arial, sans-serif" font-size="20" font-weight="bold">${title}</text>
  <text x="210" y="245" fill="#64748B" font-family="Arial, sans-serif" font-size="14">Certified Engineering &amp; Site Clearance Inspection Drawing</text>
  <text x="210" y="275" fill="#059669" font-family="Arial, sans-serif" font-size="13" font-weight="bold">STATUS: OFFICIAL CLEARANCE GRANTED</text>

  <!-- Technical drawing details -->
  <line x1="100" y1="340" x2="700" y2="340" stroke="#94A3B8" stroke-dasharray="4" stroke-width="1.5"/>
  <rect x="100" y="360" width="180" height="40" fill="#EFF6FF" stroke="#3B82F6" rx="4"/>
  <text x="120" y="385" fill="#1E40AF" font-family="monospace" font-size="12">COORD: 25.2048° N, 55.2708° E</text>
  
  <rect x="300" y="360" width="180" height="40" fill="#ECFDF5" stroke="#10B981" rx="4"/>
  <text x="325" y="385" fill="#065F46" font-family="monospace" font-size="12">SAFETY PROTOCOL: ISO-45001</text>

  <rect x="500" y="360" width="200" height="40" fill="#F1F5F9" stroke="#64748B" rx="4"/>
  <text x="525" y="385" fill="#334155" font-family="monospace" font-size="12">STAMP: AUDITED &amp; APPROVED</text>

  <rect x="70" y="445" width="660" height="85" rx="8" fill="#F1F5F9"/>
  <text x="90" y="475" fill="#334155" font-family="Arial, sans-serif" font-size="12" font-weight="bold">COMPLIANCE NOTICE:</text>
  <text x="90" y="495" fill="#64748B" font-family="Arial, sans-serif" font-size="11">This official document constitutes valid proof of compliance and authorization under the designated Municipal Regulatory Authority.</text>
  <text x="90" y="515" fill="#64748B" font-family="Arial, sans-serif" font-size="11">Authorized personnel may verify this record using the system NOC unique identification key.</text>
</svg>
`.trim();

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svgString);
}

// Minimal valid PDF Data URL for testing
function createSamplePDFDataURL(nocNumber, title) {
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Title (${nocNumber} - ${title})
   /Creator (NOC Portal Official System) >>
endobj
2 0 obj
<< /Type /Catalog
   /Pages 3 0 R >>
endobj
3 0 obj
<< /Type /Pages
   /Kids [4 0 R]
   /Count 1 >>
endobj
4 0 obj
<< /Type /Page
   /Parent 3 0 R
   /Resources << /Font << /F1 5 0 R >> >>
   /MediaBox [0 0 612 792]
   /Contents 6 0 R >>
endobj
5 0 obj
<< /Type /Font
   /Subtype /Type1
   /BaseFont /Helvetica >>
endobj
6 0 obj
<< /Length 260 >>
stream
BT
/F1 20 Tf
50 720 Td
(NO OBJECTION CERTIFICATE - OFFICIAL RECORD) Tj
0 -30 Td
/F1 14 Tf
(NOC Number: ${nocNumber}) Tj
0 -25 Td
(Subject: ${title}) Tj
0 -25 Td
(Status: Verified and Issued under Regulatory Guidelines) Tj
0 -40 Td
/F1 11 Tf
(This PDF certificate serves as official authorization for the designated scope of work.) Tj
0 -20 Td
(Valid for the designated contractor and specified period of validity.) Tj
ET
endstream
endobj
xref
0 7
0000000000 65535 f 
0000000009 00000 n 
0000000090 00000 n 
0000000143 00000 n 
0000000206 00000 n 
0000000318 00000 n 
0000000392 00000 n 
trailer
<< /Size 7
   /Root 2 0 R
   /Info 1 0 R >>
startxref
704
%%EOF`;

  return 'data:application/pdf;base64,' + btoa(pdfContent);
}

/**
 * Empty Initial Seed Dataset (All NOC Records permanently cleared)
 */
const INITIAL_NOC_SEED_DATA = [];

/**
 * Creates a sample Word (.docx) file encoded as Data URL
 */
function createSampleWordDocDataURL(title, refNo) {
  const rtfContent = `{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033{\\fonttbl{\\f0\\fnil\\fcharset0 Plus Jakarta Sans;}{\\f1\\fnil\\fcharset0 Arial;}}
{\\colortbl ;\\red30\\green64\\blue175;\\red5\\green150\\blue105;\\red15\\green23\\blue42;\\red100\\green116\\blue139;}
\\viewkind4\\uc1 
\\pard\\qc\\cf1\\b\\fs36 ${title.toUpperCase()}\\par
\\pard\\qc\\cf4\\fs20 Document Reference: ${refNo} | Regulatory Compliance Bureau\\par
\\par
\\pard\\cf3\\fs24\\b 1. MANDATORY SUBMISSION STANDARDS:\\b0\\fs22\\par
All contractors, developers, and project owners applying for a No Objection Certificate (NOC) must ensure full adherence to the following standards:\\par
\\par
\\cf2\\b A. Required Documentation Checklist:\\b0\\cf3\\par
  1. Completed and signed Official Application Form with authorized company stamp.\\par
  2. Valid Commercial License / Trade Registration Certificate copy.\\par
  3. Certified Engineering & Structural Design Drawings (PDF format).\\par
  4. Environmental & Occupational Safety Impact Clearance (ISO-45001 / ISO-14001).\\par
  5. Utility Grid (Water, Power, Drainage, Telecom) Integration Approvals.\\par
  6. Road Cutting / Excavation Traffic Detour Management Plan.\\par
\\par
\\cf1\\b B. Submission & Quality Standards:\\b0\\cf3\\par
  - Attachments must be high-resolution, clear, and legible in certified PDF or CAD format.\\par
  - All drawings and engineering plans must bear official consultant engineering seals.\\par
\\par
\\pard\\qc\\cf4\\fs18 *** OFFICIAL REGULATORY COMPLIANCE DOCUMENT ***\\par
}`;

  return 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + btoa(unescape(encodeURIComponent(rtfContent)));
}

/**
 * Default Official NOC Requirements Documents (Empty by default)
 */
const DEFAULT_NOC_REQUIREMENTS_DOCS = [];

/**
 * Default Official SBYI Code of Conduct (COC) Documents (Empty by default)
 */
const DEFAULT_SBYI_COC_DOCS = [];

// Default Custom Contractors list
const DEFAULT_CUSTOM_CONTRACTORS = [
  'ABU DHABI DISTRIBUTION COMPANY (ADDC)',
  'ADVANCED TECHNICAL SERVICES (ATS)',
  'AJB CONTRACTING LLC',
  'AL JABER BUILDING LLC',
  'AL JABER TRANSPORT & GENERAL CONTRACTING (AJB)',
  'APEX ENERGY SERVICES LLC',
  'ARABIAN TECHNICAL CONSTRUCTION LLC (ATC)',
  'DMTL CONTRACTING LLC',
  'EMIRATES TECHNICAL SERVICES LLC (ETS)',
  'EUROPEAN UTILITIES & DRAINAGE (EUD)',
  'GULF DUNES LANDSCAPING (GDL)',
  'IMPRESSIVE INTEGRATED MANAGEMENT (IIM)',
  'ISLAND SECURITY SERVICES (ISS)',
  'MASDAR SPECIALIZED TECHNICAL SERVICES O&M LLC (MSTS)',
  'METROPOLITAN BUILDERS CORP. (MBC)',
  'NATIONAL MARINE DREDGING COMPANY (NMDC)',
  'NETKOM COMMUNICATIONS TECHNOLOGY LLC (NCT)',
  'PIONEER DEMOLITION SPECIALISTS LLC (PDS)',
  'PREMIER DEVELOPMENT SERVICES (PDS)',
  'ROYAL GARDENS & LANDSCAPING LLC',
  'SAFE EARTH SANITATION (SES)',
  'SIX CONSTRUCT LTD (SIX)',
  'TAQA INFRASTRUCTURE SERVICES',
  'TRANS GULF CONTRACTING (TGC)'
];

// Default Custom NOC Types
const DEFAULT_CUSTOM_TYPES = [
  'Activity',
  'Activity NOC',
  'Berthing NOC',
  'Construction Camp Site Approval',
  'Construction Camp Size & Location Approval',
  'Construction NOC',
  'Design and Build NOC',
  'Maintenance Activity',
  'Maintenance NOC',
  'Marine Survey NOC',
  'O&M NOC',
  'Operation & Maintenance NOC',
  'Site Visit & Meeting',
  'Temporary Occupancy Certificate'
];

/**
 * Restores all system dataset stores (NOC Records, Requirements Docs, COC Docs, Custom Types, Contractors, Users)
 * and synchronizes them directly with Supabase if active.
 */
async function restoreAllData(forceRestore = false) {
  console.log('Restoring all system datasets...');
  const stats = {
    records: 0,
    reqDocs: 0,
    cocDocs: 0,
    types: 0,
    contractors: 0,
    users: 0,
    supabaseSynced: false
  };

  try {
    // 1. Purge legacy demo records and purge initial dataset if requested
    if (window.nocDB && window.nocDB.purgeLegacyDemoData) {
      await window.nocDB.purgeLegacyDemoData();
    }

    // 2. Restore NOC Records if forceRestore is true and INITIAL_NOC_SEED_DATA is populated
    let localRecords = await window.nocDB._localGetAll();
    if (forceRestore && INITIAL_NOC_SEED_DATA && INITIAL_NOC_SEED_DATA.length > 0) {
      await window.nocDB.bulkInsert(INITIAL_NOC_SEED_DATA);
      localRecords = await window.nocDB._localGetAll();
    }
    stats.records = localRecords ? localRecords.length : 0;

    // 3. Restore Requirements Documents
    const reqDocs = await window.nocDB.getRequirementsDocs();
    if (forceRestore && DEFAULT_NOC_REQUIREMENTS_DOCS.length > 0) {
      await window.nocDB.saveRequirementsDocs(DEFAULT_NOC_REQUIREMENTS_DOCS);
      stats.reqDocs = DEFAULT_NOC_REQUIREMENTS_DOCS.length;
    } else {
      stats.reqDocs = reqDocs ? reqDocs.length : 0;
    }

    // 4. Restore SBYI COC Documents
    const cocDocs = await window.nocDB.getCocDocs();
    if (forceRestore && DEFAULT_SBYI_COC_DOCS.length > 0) {
      await window.nocDB.saveCocDocs(DEFAULT_SBYI_COC_DOCS);
      stats.cocDocs = DEFAULT_SBYI_COC_DOCS.length;
    } else {
      stats.cocDocs = cocDocs ? cocDocs.length : 0;
    }

    // 5. Restore Custom Types
    const customTypes = await window.nocDB.getCustomTypes();
    if (forceRestore || !customTypes || customTypes.length === 0) {
      for (const t of DEFAULT_CUSTOM_TYPES) {
        await window.nocDB.saveCustomType(t);
      }
      stats.types = DEFAULT_CUSTOM_TYPES.length;
    } else {
      stats.types = customTypes.length;
    }

    // 6. Restore Custom Contractors
    const customContractors = await window.nocDB.getCustomContractors();
    if (forceRestore || !customContractors || customContractors.length === 0) {
      for (const c of DEFAULT_CUSTOM_CONTRACTORS) {
        await window.nocDB.saveCustomContractor(c);
      }
      stats.contractors = DEFAULT_CUSTOM_CONTRACTORS.length;
    } else {
      stats.contractors = customContractors.length;
    }

    // 7. Restore Users
    const users = await window.nocDB.getUsers();
    if (forceRestore || !users || users.length === 0) {
      const defaultUsers = window.nocDB.getDefaultUsers();
      for (const u of defaultUsers) {
        await window.nocDB.saveUser(u);
      }
      stats.users = defaultUsers.length;
    } else {
      stats.users = users.length;
    }

    // 8. If force restore and Supabase is active, push and synchronize all collections immediately
    if (forceRestore && window.nocDB && window.nocDB.isSupabaseActive()) {
      try {
        const syncStats = await window.nocDB.syncLocalToSupabase();
        stats.supabaseSynced = true;
        stats.syncStats = syncStats;
        console.log('Restoration pushed directly to Supabase cloud PostgreSQL:', syncStats);
      } catch (err) {
        console.warn('Supabase cloud push during restore note:', err.message);
      }
    }

    // 9. Re-sync AI knowledge base
    if (window.sbyimKnowledgeBase) {
      window.sbyimKnowledgeBase.syncKnowledgeBase().then(() => {
        if (window.sbyimAIUI) window.sbyimAIUI.updateKnowledgeStatusBadge();
      }).catch(() => {});
    }

    return stats;
  } catch (err) {
    console.error('Error during full data restoration:', err);
    throw err;
  }
}

/**
 * Seeds the database if empty on startup and connects/syncs with Supabase.
 */
async function seedInitialDatabaseIfEmpty() {
  try {
    // Purge legacy demo records and initial dataset purge
    if (window.nocDB && window.nocDB.purgeLegacyDemoData) {
      await window.nocDB.purgeLegacyDemoData();
    }
    
    // Ensure all core collections (requirements, COC docs, contractors, types, users) are populated locally
    await restoreAllData(false);
  } catch (err) {
    console.error('Seed data initialization error:', err);
  }
  return false;
}

window.DEFAULT_NOC_REQUIREMENTS_DOCS = DEFAULT_NOC_REQUIREMENTS_DOCS;
window.DEFAULT_SBYI_COC_DOCS = DEFAULT_SBYI_COC_DOCS;
window.DEFAULT_CUSTOM_CONTRACTORS = DEFAULT_CUSTOM_CONTRACTORS;
window.DEFAULT_CUSTOM_TYPES = DEFAULT_CUSTOM_TYPES;
window.restoreAllData = restoreAllData;
window.seedInitialDatabaseIfEmpty = seedInitialDatabaseIfEmpty;
window.INITIAL_NOC_SEED_DATA = INITIAL_NOC_SEED_DATA;
