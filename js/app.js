/**
 * NOC Portal - Main Application Orchestrator
 * Connects database, authentication, document handling, search/filter algorithms, and export utilities.
 */

class NOCApp {
  constructor() {
    this.allRecords = [];
    this.filteredRecords = [];
    this.searchQuery = '';
    this.selectedStatus = 'all';
    this.selectedType = 'all';
    this.sortBy = 'newest';
    this.currentPage = 1;
    this.pageSize = 10;
  }

  /**
   * Main bootstrap method
   */
  async init() {
    console.log('Initializing NOC Portal Application...');

    // 1. Immediately initialize UI in the unauthenticated landing state
    window.nocUI.init();

    // 2. Immediately bind all DOM events and modal handlers so the UI is 100% responsive right away
    this.bindEvents();
    this.populateTypeFilterOptions();
    this.populateFormTypeOptions('');
    this.populateFormContractorOptions('');

    // 3. Await database initialization (non-blocking for UI interactions)
    if (window.nocDB && window.nocDB.initPromise) {
      try {
        await window.nocDB.initPromise;
      } catch (err) {
        console.warn('Database init note:', err);
      }
    }

    // 4. Set default sort and initial search query for active user
    const isSBYIM = window.nocAuth && window.nocAuth.isSBYIM();
    const isSecurity = window.nocAuth && window.nocAuth.isSecurity();
    const isEmployee = window.nocAuth && (window.nocAuth.isEmployee ? window.nocAuth.isEmployee() : window.nocAuth.isMain());
    const isAdminUser = window.nocAuth && window.nocAuth.isAdminUser();
    const currentUser = window.nocAuth && window.nocAuth.getUser();

    const isGuest = window.nocAuth && window.nocAuth.isGuest();

    if (isSBYIM || isSecurity || isEmployee || isGuest) {
      this.sortBy = 'issuance';
      const filterSort = document.getElementById('filterSort');
      if (filterSort) filterSort.value = 'issuance';
    } else if (isAdminUser) {
      this.sortBy = 'newest';
      const filterSort = document.getElementById('filterSort');
      if (filterSort) filterSort.value = 'newest';
    }

    if (isGuest && currentUser && currentUser.username) {
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = currentUser.username;
      this.searchQuery = currentUser.username;
    } else {
      this.searchQuery = '';
    }

    // 5. Seed initial realistic database if empty (run asynchronously without blocking)
    try {
      await window.seedInitialDatabaseIfEmpty();
    } catch (err) {
      console.warn('Seed database note:', err);
    }

    // 6. Load all records from active database (Supabase Cloud or Local fallback)
    try {
      await this.refreshData();
    } catch (err) {
      console.warn('Initial data refresh note:', err);
    }

    // 7. Re-populate type filters and contractor dropdowns after data loaded
    this.populateTypeFilterOptions();

    // 8. Initialize SBYIM AI Assistant UI and sync Approved Documents Knowledge Base
    if (window.sbyimAIUI) {
      window.sbyimAIUI.init();
    }
    if (window.sbyimKnowledgeBase) {
      window.sbyimKnowledgeBase.syncKnowledgeBase().then(() => {
        if (window.sbyimAIUI) window.sbyimAIUI.updateKnowledgeStatusBadge();
      }).catch(err => console.warn('AI Knowledge Base initial sync warning:', err));
    }
  }

  /**
   * Fetch latest data from IndexedDB and re-render
   */
  async refreshData() {
    try {
      this.allRecords = await window.nocDB.getAll();
      if (Array.isArray(this.allRecords)) {
        this.allRecords.forEach(r => {
          if (r && r.issuedTo) {
            r.issuedTo = String(r.issuedTo).trim().toUpperCase();
          }
        });
      }
      const stats = await window.nocDB.getStatistics();
      window.nocUI.renderStats(stats);
      this.applyFilters();
      this.populateTypeFilterOptions();
    } catch (err) {
      console.error('Error fetching data from database:', err);
      window.showToast('Failed to load records from database.', 'error');
    }
  }

  /**
   * Get all unique NOC types: base types + stored custom types + distinct types from active records
   */
  getAvailableNocTypes() {
    const defaultTypes = [
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
    let customTypes = [];
    try {
      const stored = localStorage.getItem('noc_custom_types');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) customTypes = parsed;
      }
    } catch (e) {
      console.warn('Could not read custom types from localStorage', e);
    }

    const recordTypes = (this.allRecords || []).map(r => r.nocType).filter(Boolean);
    const combined = [...defaultTypes, ...customTypes, ...recordTypes];

    const seen = new Set();
    const unique = [];
    for (const t of combined) {
      const trimmed = String(t).trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        unique.push(trimmed);
      }
    }
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
  }

  /**
   * Persist a new custom NOC type into database / localStorage
   */
  async saveCustomNocType(newType) {
    if (!newType) return;
    const trimmed = String(newType).trim();
    if (!trimmed) return;

    try {
      await window.nocDB.saveCustomType(trimmed);
    } catch (e) {
      console.warn('Could not save custom type:', e);
    }
  }

  /**
   * Populate dashboard NOC Type dropdown filter with all dynamic types
   */
  populateTypeFilterOptions() {
    const typeFilter = document.getElementById('filterNocType');
    if (!typeFilter) return;

    const currentVal = this.selectedType || typeFilter.value || 'all';
    const types = this.getAvailableNocTypes();

    typeFilter.innerHTML = '<option value="all">All NOC Types</option>';
    let hasMatch = false;

    types.forEach(type => {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = type;
      if (currentVal !== 'all' && type.toLowerCase() === currentVal.toLowerCase()) {
        opt.selected = true;
        hasMatch = true;
      }
      typeFilter.appendChild(opt);
    });

    if (currentVal === 'all' || !hasMatch) {
      typeFilter.value = 'all';
      this.selectedType = 'all';
    }
  }

  /**
   * Populate Create/Edit modal form NOC Type dropdown with all dynamic types
   */
  populateFormTypeOptions(selectedType = '') {
    const select = document.getElementById('nocTypeSelect');
    if (!select) return;

    const customContainer = document.getElementById('customTypeContainer');
    const customInput = document.getElementById('nocTypeCustomInput');

    const types = this.getAvailableNocTypes();
    select.innerHTML = '<option value="" disabled selected>-- Select NOC Type --</option>';

    let found = false;
    types.forEach(type => {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = type;
      if (selectedType && type.toLowerCase() === selectedType.toLowerCase()) {
        opt.selected = true;
        found = true;
      }
      select.appendChild(opt);
    });

    // Special option for adding a new type if not in the dropdown
    const addOpt = document.createElement('option');
    addOpt.value = '__custom__';
    addOpt.textContent = '➕ Add New / Custom Type...';
    select.appendChild(addOpt);

    if (selectedType) {
      if (found) {
        if (customContainer) customContainer.style.display = 'none';
        if (customInput) {
          customInput.value = '';
          customInput.required = false;
        }
      } else {
        // Record has a type not currently in the base list: dynamically add option and select it
        const customOpt = document.createElement('option');
        customOpt.value = selectedType;
        customOpt.textContent = selectedType;
        customOpt.selected = true;
        select.insertBefore(customOpt, addOpt);
        if (customContainer) customContainer.style.display = 'none';
        if (customInput) {
          customInput.value = '';
          customInput.required = false;
        }
      }
    } else {
      select.value = '';
      if (customContainer) customContainer.style.display = 'none';
      if (customInput) {
        customInput.value = '';
        customInput.required = false;
      }
    }
  }

  /**
   * Get all unique Contractors / Companies:
   * Base contractor list + stored custom contractors + distinct issuedTo from active records
   */
  getAvailableContractors() {
    const defaultContractors = [
      'ABU DHABI AVIATION',
      'ABU DHABI DISTRIBUTION COMPANY (ADDC)',
      'ABU DHABI MARINE SPORTS CLUB (ADMSC)',
      'ABU DHABI NATIONAL HOTELS (ADNH)',
      'ABU DHABI PORTS (ADP) / APPROVED CONTRACTOR/S AND SUBCONTRACTORS',
      'ABU DHABI PORTS (ADP) / CAPITAL EXPERIENCE (CE)',
      'ABU DHABI TRANSMISSION & DISPATCH COMPANY (TRANSCO)',
      'ACCESS ADVERTISING LLC. S.P.C. (ACCLADS)',
      'ADB SAFEGATE (ADBS)',
      'ADCEB GROUP FACILITIES MANAGEMENT DIVISION (AGFM)',
      'ADIL CO-ORDINATES PRIVATE LIMITED (ADIL)',
      'ADVANCED ELECTRICAL AND COMMUNICATION SYSTEMS CONTRACTING (AECSC)',
      'ADVANCED PIPELINE SERVICES LTD. L.L.C (ADPS)',
      'AG FACILITIES SOLUTIONS (AG)',
      'AL BAWARDI ALAN DICK LLC (ABAD)',
      'AL FALAK ELECTRONIC EQUIPMENT AND SUPPLIES',
      'AL KAENAT INT SCRAP (AIK)',
      'AL KHAYYAT INVESTMENTS (AKI)',
      'AL MAHARA DIVING CENTER (AMDC)',
      'AL MASAOOD LLC (AML)',
      'AL SAMHA BEACH TRANSPORT (AST)',
      'ALBAQALI INTERNATIONAL (ABI)',
      'ALPHAMED SPECIALISED PROJECTS - SOLE PROPRIETORSHIP (ASPSP)',
      'ANANTARA HOTELS, RESORTS & SPAS (AHRS)',
      'ANSON CONSTRUCTION L.L.C (AC)',
      'ARAB CENTER FOR ENGINEERING STUDIES LTD (ACES)',
      'ARABESQUE LABORATORY FOR SOIL TESTING (AL)',
      'ARABIC ENGINEER CONTROL & ELECTRO MECHANICAL SYSTEMS CO. L.L.C. (AECEMS)',
      'ARC ENGINEERING CONSULTANTS (ARC)',
      'ARIAN ADVANCED TECHNICAL GROUP (AATG)',
      'ASK PUMPS TRADING LLC (ASM)',
      'ATGC LLC',
      'B&M INTERNATIONAL ABU DHABI LLC',
      'BAKAH NATURAL RESOURCES (BNR)',
      'BGP INC. CHINA NATIONAL PETROLEUM CORPORATION',
      'BILFINGER TEBODIN MIDDLE EAST LTD. (BTME)',
      'BIN FADAN GENERAL CONT. L.L.C (BFC)',
      'BISSAN PREFAB HOUSE (BPH)',
      'BLACK BIRD MOTION MEDIA (BBMM)',
      'BOECKER PEST CONTROL LLC',
      'BRIGHT DEAL INTERNATIONAL GENERAL CONTRACTING (BDC)',
      'BRYNE GULF OILFIELD',
      'CANAL ENGINEERING SERVICES (CES)',
      'CAPITAL 360 (C360)',
      'CAPITAL EXPERIENCE (CE)',
      'CAPITAL SURVEY (CS)',
      'CH2M HILL INTERNATIONAL B.V. (CH2M)',
      'CHOPPER SHOOT ART PRODUCTION (CSAP)',
      'CITTA GROUP (CITTA)',
      'CITY SURVEYS (CS)',
      'CODA TECHNOLOGY LLC (CODA)',
      'CONTINENTAL GENERAL CONTRACTING (CGC)',
      'DEPARTMENT OF CULTURE AND TOURISM (DCT)',
      'DHAFIR TECHNOLOGIES LLC (DT)',
      'DR. MAHMOUD AL-AL SAYED ENGINEERING CONSULTANCY & DESIGN BUREAU (AES)',
      'E&I ENTERPRISE (E&I)',
      'EFS FACILITIES SERVICES (EFS)',
      'ELADAL ASSET MANAGEMENT GROUP L.L.C.',
      'ELITE AGRICULTURE MANAGEMENT L.L.C.',
      'EMARAT EUROPE GENERAL CONTRACTING LLC',
      'E-MARINE (EMAT)',
      'EMI MDS by C& (EMIMDS)',
      'EMIRATES INTEGRATED TELECOMMUNICATION COMPANY (EITC-DU)',
      'EMIRATES LINK NITCO LLC (ELN)',
      'ENTERPRISE SUSTAINABLE ENERGY (ESE)',
      'ETIMAD STRATEGIC SECURITY SOLUTIONS (ESSS)',
      'ETISALAT AND (E&)',
      'ETISALAT FACILITIES MANAGEMENT (EFM)',
      'ETISALAT SERVICES HOLDING (ESH)',
      'ETISALAT SERVICES HOLDING (TK)',
      'FALCON SURVEY ENGINEERING CONSULTANT',
      'FERROPAN OILFIELD SERVICES & SUPPLIES LLC',
      'FIRST RESPONDED MAINTENANCE AND BUILDING CLEANING (FR)',
      'FIRST SOURCE',
      'FRANCIS TECHNICAL SERVICES',
      'FREIBURG CONTRACTING & GENERAL MAINTENANCE L.L.C (FR)',
      'FUGRO SURVEY MIDDLE EAST (FSME)',
      'G4S SECURE SOLUTIONS L.L.C. (G4S)',
      'GSP POWER EQUIPMENT TRADING LLC (GSP)',
      'GULF DUNES LANDSCAPING & AGRICULTURAL SERVICES',
      'GULF INDUSTRIAL SERVICES COMPANY L.L.C (GISCO)',
      'GULF SURVEY',
      'GULF MULTISPORTS (GMS)',
      'HASSAN SULTAN FOR CONTRACTING & GENERAL MAINTENANCE (HS)',
      'HAYAT COMMUNICATION LLC (HC)',
      'HD GLOBAL PTY LTD (I)',
      'HI" DECORATION L.L.C.',
      'HOLIDAY PANORAMA TOURISM (HPT)',
      'HUMAID AL QUBAISI (HAQ)',
      'HYDROPOWER ENERGY AND GENERAL CONSTRUCTION LLC',
      'HYPSOS MIDDLE EAST',
      'I GULF / GULF FIREWORKS SOLE PROPRIETORSHIP (IGF)',
      'INSPACIAL GENERAL CONTRACTING (IGC)',
      'INTELTEC EMIRATES LLC',
      'ITTIHAD PEST CONTROL EST. (IPCE)',
      'JAN DE NUL DREDGING LTD. (JDN)',
      'JAZAL ENGINEERING & CONTRACTING L.L.C',
      'KDU WORLDWIDE MIDDLE EAST MARINE SERVICES LLC',
      'KEMS',
      'LAST VOYAGE',
      'LOTTE ENGINEERING GENERAL CONTRACTING CO. L.L.C',
      'M1 CONTRACTING S.A.L.R (M1C)',
      'MASDAR SPECIALIZED TECHNICAL SERVICES O&M LLC (MSTS)',
      'MIDDLE EAST SURVEY ENGINEERING',
      'MISSION GLOBAL',
      'MODON',
      'MOUNTAIN QUESTS ENTERTAINMENTS SERVICES LLC / AL MAHARA (MQ)',
      'MUNAWALA GROUND SERVICES',
      'NAFTCO ELECTROMECHANICAL LLC (NAFTCO)',
      'NATIONAL MARINE DREDGING COMPANY (NMDC)',
      'NETCOM COMMUNICATIONS TECHNOLOGY LLC (NCT)',
      'NOFIM GENERAL CONTRACTING (NGC)',
      'OASIS COILS & COATINGS L.L.C. (OCC)',
      'OHM ELECTROMECHANICAL CONTRACTING',
      'POWER CONSTRUCTION CORPORATION OF CHINA LTD (PC)',
      'PURE WATER TECHNOLOGY LLC',
      'RCC EL RACE (RCC)',
      'REALEYEZ MEDIA PRODUCTIONS (REMP)',
      'REDFILO EVENTS EXHIBITION ORGANIZING (RFTECO)',
      'RUSTAM KHAN GENERAL MAINTENANCE COMPANY LLC',
      'SCAN CONSTRUCTION',
      'SHADOW PROFESSIONAL PHOTOGRAPHY',
      'SIEMENS INDUSTRIAL (SI)',
      'SINYAR PROPERTY MANAGEMENT (SPM)',
      'SOURCE',
      'SPACE FILMS L.L.C (SF)',
      'TABREED',
      'TADAMUCT',
      'TAMDEED PROJECTS (TP)',
      'TAQA DISTRIBUTION COMPANY (TAQA)',
      'TAQA TRANSMISSION COMPANY (TTC)',
      'TASNEEM GENERAL CONTRACTING (TGC)',
      'TELETRON AGENCIES & TRADING (TAT)',
      'TICKEY TRADERS',
      'TOP TALENT (TT)',
      'TORNADO ENTERPRISES (TE)',
      'TORNADO TOTAL LANDSCAPE (TTL)',
      'TOURISM 365 (T365)',
      'TRANS DESERT CONT. GEN. MAINT. EST.',
      'TROJAN GENERAL CONTRACTING LLC',
      'VENUS INFRASTRUCTURE CONTRACTING L.L.C (VIC)',
      'WALKTHRU (WTD)',
      'WALTZ SOLUTIONS AND SERVICES LLC (WSS)',
      'WIPE OUT PEST CONTROL EST. (WPC)',
      'WOOD DESIGN AND MANAGEMENT GULF FZ LLC (WDMG)',
      'XAD TECHNOLOGIES LLC',
      'YPPH HOSPITALITY COMPANY LLC (YH) & SHINAR HOSPITALITY (SH) & SISTER COMPANIES'
    ];

    let customContractors = [];
    try {
      const stored = localStorage.getItem('noc_custom_contractors');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) customContractors = parsed.map(c => String(c).trim().toUpperCase()).filter(Boolean);
      }
    } catch (e) {
      console.warn('Could not read custom contractors from localStorage', e);
    }

    let renames = {};
    try {
      const storedRenames = localStorage.getItem('noc_contractor_renames');
      if (storedRenames) renames = JSON.parse(storedRenames);
    } catch (e) {
      console.warn('Could not read contractor renames from localStorage', e);
    }

    const mappedDefaults = defaultContractors.map(c => (renames && renames[c]) ? renames[c] : c);
    const recordContractors = (this.allRecords || []).map(r => r.issuedTo ? String(r.issuedTo).trim().toUpperCase() : '').filter(Boolean);
    const combined = [...mappedDefaults, ...customContractors, ...recordContractors];

    const seen = new Set();
    const unique = [];
    for (const c of combined) {
      const upper = String(c).trim().toUpperCase();
      if (!upper) continue;
      if (!seen.has(upper)) {
        seen.add(upper);
        unique.push(upper);
      }
    }
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
  }

  /**
   * Persist a new custom Contractor into database / localStorage
   */
  async saveCustomContractor(newContractor) {
    if (!newContractor) return;
    const trimmed = String(newContractor).trim().toUpperCase();
    if (!trimmed) return;

    try {
      await window.nocDB.saveCustomContractor(trimmed);
    } catch (e) {
      console.warn('Could not save custom contractor:', e);
    }
  }

  /**
   * Update / Rename Contractor name across DB, records, and dropdown
   */
  async updateContractorName(oldName, newName) {
    if (!oldName || !newName) return;
    const oldUpper = String(oldName).trim().toUpperCase();
    const newUpper = String(newName).trim().toUpperCase();
    if (!oldUpper || !newUpper || oldUpper === newUpper) return;

    // 1. Update in DB / localStorage
    if (window.nocDB && typeof window.nocDB.updateCustomContractor === 'function') {
      await window.nocDB.updateCustomContractor(oldUpper, newUpper);
    }

    // 2. Update records in memory
    if (this.allRecords && this.allRecords.length > 0) {
      this.allRecords.forEach(r => {
        if (r.issuedTo && r.issuedTo.trim().toUpperCase() === oldUpper) {
          r.issuedTo = newUpper;
        }
      });
    }

    // 3. Refresh filtered records table
    this.applyFilters();

    // 4. Repopulate modal dropdown with new company name selected
    this.populateFormContractorOptions(newUpper);
  }

  /**
   * Populate Create/Edit modal form Issued To (Contractor/Company) dropdown
   */
  populateFormContractorOptions(selectedContractor = '') {
    const select = document.getElementById('issuedToSelect');
    if (!select) return;

    const customContainer = document.getElementById('customContractorContainer');
    const customInput = document.getElementById('issuedToCustomInput');

    const contractors = this.getAvailableContractors();
    select.innerHTML = '<option value="" disabled selected>-- Select Contractor / Company --</option>';

    const targetUpper = (selectedContractor || '').trim().toUpperCase();
    let found = false;
    contractors.forEach(contractor => {
      const upper = contractor.toUpperCase();
      const opt = document.createElement('option');
      opt.value = upper;
      opt.textContent = upper;
      if (targetUpper && upper === targetUpper) {
        opt.selected = true;
        found = true;
      }
      select.appendChild(opt);
    });

    // Special option for adding a new contractor if not in the dropdown
    const addOpt = document.createElement('option');
    addOpt.value = '__custom__';
    addOpt.textContent = '➕ Add New / Custom Company...';
    select.appendChild(addOpt);

    if (targetUpper) {
      if (found) {
        if (customContainer) customContainer.style.display = 'none';
        if (customInput) {
          customInput.value = '';
          customInput.required = false;
        }
      } else {
        // Record has a contractor not currently in the base list: dynamically add option and select it
        const customOpt = document.createElement('option');
        customOpt.value = targetUpper;
        customOpt.textContent = targetUpper;
        customOpt.selected = true;
        select.insertBefore(customOpt, addOpt);
        if (customContainer) customContainer.style.display = 'none';
        if (customInput) {
          customInput.value = '';
          customInput.required = false;
        }
      }
    } else {
      select.value = '';
      if (customContainer) customContainer.style.display = 'none';
      if (customInput) {
        customInput.value = '';
        customInput.required = false;
      }
    }
  }

  /**
   * Filter and sort records based on search query and dropdown selections
   */
  applyFilters() {
    const isLoggedIn = window.nocAuth && window.nocAuth.isLoggedIn();
    if (!isLoggedIn) {
      this.filteredRecords = [];
      window.nocUI.renderRecords([]);
      return;
    }

    const q = this.searchQuery.trim().toLowerCase();
    const isGuest = window.nocAuth.isGuest();

    this.filteredRecords = this.allRecords.filter((rec) => {
      // 1. Search filter: Guest can search by NOC Number, Issued To, and Client; Admin can search all fields
      let matchesSearch = true;
      if (q) {
        if (isGuest) {
          matchesSearch = (
            (rec.nocNumber && rec.nocNumber.toLowerCase().includes(q)) ||
            (rec.issuedTo && rec.issuedTo.toLowerCase().includes(q)) ||
            (rec.companyCode && rec.companyCode.toLowerCase().includes(q)) ||
            (rec.nocType && rec.nocType.toLowerCase().includes(q)) ||
            (rec.description && rec.description.toLowerCase().includes(q))
          );
        } else {
          matchesSearch = (
            (rec.nocNumber && rec.nocNumber.toLowerCase().includes(q)) ||
            (rec.nocType && rec.nocType.toLowerCase().includes(q)) ||
            (rec.client && rec.client.toLowerCase().includes(q)) ||
            (rec.issuedTo && rec.issuedTo.toLowerCase().includes(q)) ||
            (rec.companyCode && rec.companyCode.toLowerCase().includes(q)) ||
            (rec.description && rec.description.toLowerCase().includes(q))
          );
        }
      }

      // 2. Status filter (All users)
      let matchesStatus = true;
      if (this.selectedStatus !== 'all') {
        const status = window.nocDB.getStatus(rec.dateOfExpiration);
        matchesStatus = status === this.selectedStatus;
      }

      // 3. Type filter (All users)
      let matchesType = true;
      if (this.selectedType !== 'all') {
        matchesType = rec.nocType === this.selectedType;
      }

      return matchesSearch && matchesStatus && matchesType;
    });

    // Sort records
    if (this.sortBy === 'newest') {
      this.filteredRecords.sort((a, b) => new Date(b.createdAt || b.dateOfIssuance) - new Date(a.createdAt || a.dateOfIssuance));
    } else if (this.sortBy === 'oldest') {
      this.filteredRecords.sort((a, b) => new Date(a.createdAt || a.dateOfIssuance) - new Date(b.createdAt || b.dateOfIssuance));
    } else if (this.sortBy === 'issuance') {
      this.filteredRecords.sort((a, b) => new Date(b.dateOfIssuance || 0) - new Date(a.dateOfIssuance || 0));
    } else if (this.sortBy === 'expiring') {
      this.filteredRecords.sort((a, b) => new Date(a.dateOfExpiration) - new Date(b.dateOfExpiration));
    } else if (this.sortBy === 'nocNumber') {
      this.filteredRecords.sort((a, b) => (a.nocNumber || '').localeCompare(b.nocNumber || ''));
    }

    // 5. Paginate records (10 per page)
    const totalRecords = this.filteredRecords.length;
    const pageSize = this.pageSize || 10;
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    if (this.currentPage > totalPages) this.currentPage = totalPages;
    if (this.currentPage < 1) this.currentPage = 1;

    const startIdx = (this.currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, totalRecords);
    const pageRecords = this.filteredRecords.slice(startIdx, endIdx);

    window.nocUI.renderRecords(pageRecords);
    window.nocUI.renderPagination(this.currentPage, totalPages, totalRecords, startIdx, endIdx);
  }

  /**
   * Bind DOM event listeners for inputs, buttons, and drag-and-drop
   */
  bindEvents() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      let timeout = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          this.currentPage = 1;
          this.searchQuery = e.target.value;
          this.applyFilters();
        }, 200);
      });
    }

    // Status filter
    const statusFilter = document.getElementById('filterStatus');
    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        this.currentPage = 1;
        this.selectedStatus = e.target.value;
        this.applyFilters();
      });
    }

    // NOC Type filter
    const typeFilter = document.getElementById('filterNocType');
    if (typeFilter) {
      typeFilter.addEventListener('change', (e) => {
        this.currentPage = 1;
        this.selectedType = e.target.value;
        this.applyFilters();
      });
    }

    // Sort By filter
    const sortFilter = document.getElementById('filterSort');
    if (sortFilter) {
      sortFilter.addEventListener('change', (e) => {
        this.currentPage = 1;
        this.sortBy = e.target.value;
        this.applyFilters();
      });
    }

    // View toggle buttons (Table vs Grid)
    const btnTableView = document.getElementById('btnViewTable');
    const btnGridView = document.getElementById('btnViewGrid');

    if (btnTableView && btnGridView) {
      btnTableView.addEventListener('click', () => {
        window.nocUI.activeView = 'table';
        btnTableView.classList.add('active');
        btnGridView.classList.remove('active');
        this.applyFilters();
      });

      btnGridView.addEventListener('click', () => {
        window.nocUI.activeView = 'grid';
        btnGridView.classList.add('active');
        btnTableView.classList.remove('active');
        this.applyFilters();
      });
    }

    // Pagination Click Controls
    const paginationControls = document.getElementById('paginationControls');
    if (paginationControls) {
      paginationControls.addEventListener('click', (e) => {
        const btn = e.target.closest('.pagination-btn');
        if (!btn || btn.disabled || btn.classList.contains('active')) return;
        const targetPage = parseInt(btn.dataset.page, 10);
        if (targetPage && !isNaN(targetPage)) {
          this.currentPage = targetPage;
          this.applyFilters();
          const mainStage = document.getElementById('tableViewContainer') || document.querySelector('.main-wrapper');
          if (mainStage) {
            mainStage.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
    }

    // New NOC Button
    const btnNewNoc = document.getElementById('btnNewNoc');
    if (btnNewNoc) {
      btnNewNoc.addEventListener('click', () => {
        window.nocUI.openEntryModal();
      });
    }

    // Modal Close Buttons
    const btnCloseEntryModal = document.getElementById('btnCloseEntryModal');
    const btnCancelEntry = document.getElementById('btnCancelEntry');
    if (btnCloseEntryModal) btnCloseEntryModal.addEventListener('click', () => window.nocUI.closeEntryModal());
    if (btnCancelEntry) btnCancelEntry.addEventListener('click', () => window.nocUI.closeEntryModal());

    const btnCloseDetailsModal = document.getElementById('btnCloseDetailsModal');
    if (btnCloseDetailsModal) btnCloseDetailsModal.addEventListener('click', () => window.nocUI.closeDetailsModal());

    const btnCloseDeleteModal = document.getElementById('btnCloseDeleteModal');
    const btnCancelDelete = document.getElementById('btnCancelDelete');
    if (btnCloseDeleteModal) btnCloseDeleteModal.addEventListener('click', () => window.nocUI.closeDeleteModal());
    if (btnCancelDelete) btnCancelDelete.addEventListener('click', () => window.nocUI.closeDeleteModal());

    const deleteConfirmModal = document.getElementById('deleteConfirmModal');
    if (deleteConfirmModal) {
      deleteConfirmModal.addEventListener('click', (e) => {
        if (e.target === deleteConfirmModal) window.nocUI.closeDeleteModal();
      });
    }

    const bulkDeleteConfirmModal = document.getElementById('bulkDeleteConfirmModal');
    if (bulkDeleteConfirmModal) {
      bulkDeleteConfirmModal.addEventListener('click', (e) => {
        if (e.target === bulkDeleteConfirmModal) window.nocUI.closeBulkDeleteModal();
      });
    }

    // Confirm Single Delete Button
    const btnConfirmDelete = document.getElementById('btnConfirmDelete');
    if (btnConfirmDelete) {
      btnConfirmDelete.addEventListener('click', async () => {
        const idToDelete = window.nocUI.pendingDeleteId;
        if (idToDelete) {
          try {
            btnConfirmDelete.disabled = true;
            btnConfirmDelete.textContent = 'Deleting from databases...';
            
            await window.nocDB.delete(idToDelete);

            // Immediately remove from in-memory arrays for instant responsive UI
            const strId = String(idToDelete);
            this.allRecords = (this.allRecords || []).filter(r => String(r.id) !== strId && r.nocNumber !== strId);
            this.filteredRecords = (this.filteredRecords || []).filter(r => String(r.id) !== strId && r.nocNumber !== strId);

            window.nocUI.closeDeleteModal();
            if (window.nocUI.selectedRecordIds) {
              window.nocUI.selectedRecordIds.delete(idToDelete);
              window.nocUI.selectedRecordIds.delete(String(idToDelete));
              window.nocUI.selectedRecordIds.delete(Number(idToDelete));
              window.nocUI.updateBulkActionsBar();
            }
            await this.refreshData();
            window.showToast('🗑️ NOC Record permanently deleted from Local Database and Supabase PostgreSQL.', 'success');
          } catch (err) {
            console.error('Single delete error:', err);
            window.showToast('Failed to delete record: ' + err.message, 'error');
          } finally {
            btnConfirmDelete.disabled = false;
            btnConfirmDelete.textContent = 'Delete Record';
          }
        }
      });
    }

    // Developer Bulk Delete Event Bindings
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        const checked = e.target.checked;
        const visibleCheckboxes = document.querySelectorAll('.row-bulk-checkbox');
        visibleCheckboxes.forEach((cb) => {
          cb.checked = checked;
          const id = cb.getAttribute('data-id');
          if (id) {
            if (checked) {
              window.nocUI.selectedRecordIds.add(id);
            } else {
              window.nocUI.selectedRecordIds.delete(id);
            }
          }
        });
        window.nocUI.updateBulkActionsBar();
      });
    }

    const btnDeselectAll = document.getElementById('btnDeselectAll');
    if (btnDeselectAll) {
      btnDeselectAll.addEventListener('click', () => {
        window.nocUI.selectedRecordIds.clear();
        document.querySelectorAll('.row-bulk-checkbox').forEach(cb => cb.checked = false);
        const selectAllCb = document.getElementById('selectAllCheckbox');
        if (selectAllCb) {
          selectAllCb.checked = false;
          selectAllCb.indeterminate = false;
        }
        window.nocUI.updateBulkActionsBar();
      });
    }

    const btnSelectAllTotal = document.getElementById('btnSelectAllTotal');
    if (btnSelectAllTotal) {
      btnSelectAllTotal.addEventListener('click', () => {
        const records = this.filteredRecords || this.allRecords || [];
        records.forEach(r => {
          if (r && r.id) window.nocUI.selectedRecordIds.add(String(r.id));
        });
        document.querySelectorAll('.row-bulk-checkbox').forEach(cb => cb.checked = true);
        const selectAllCb = document.getElementById('selectAllCheckbox');
        if (selectAllCb) {
          selectAllCb.checked = true;
          selectAllCb.indeterminate = false;
        }
        window.nocUI.updateBulkActionsBar();
        window.showToast(`Selected all ${records.length} records.`, 'info');
      });
    }

    const btnTriggerDeleteAllDatabase = document.getElementById('btnTriggerDeleteAllDatabase');
    if (btnTriggerDeleteAllDatabase) {
      btnTriggerDeleteAllDatabase.addEventListener('click', async () => {
        if (!window.nocAuth || !window.nocAuth.canBulkDelete()) {
          window.showToast('Administrator / Developer privileges required to delete all records.', 'error');
          return;
        }

        const totalCount = (this.allRecords || []).length;
        const confirmed = confirm(`⚠️ PERMANENT DATABASE WIPE WARNING:\n\nAre you sure you want to PERMANENTLY DELETE ALL ${totalCount} NOC records in both Local Database (IndexedDB) and Supabase Cloud Database?\n\nThis operation cannot be undone.`);
        if (!confirmed) return;

        try {
          btnTriggerDeleteAllDatabase.disabled = true;
          btnTriggerDeleteAllDatabase.textContent = 'Wiping all records...';

          await window.nocDB.clearAll();

          this.allRecords = [];
          this.filteredRecords = [];
          window.nocUI.selectedRecordIds.clear();
          window.nocUI.updateBulkActionsBar();

          await this.refreshData();
          window.showToast('💥 All NOC records have been permanently deleted from Local Storage and Supabase.', 'success', 6000);
        } catch (err) {
          console.error('Delete all database error:', err);
          window.showToast('Error deleting all records: ' + err.message, 'error');
        } finally {
          btnTriggerDeleteAllDatabase.disabled = false;
          btnTriggerDeleteAllDatabase.innerHTML = `<span>💥</span> <span>Delete All Database Records</span>`;
        }
      });
    }

    const btnTriggerBulkDelete = document.getElementById('btnTriggerBulkDelete');
    if (btnTriggerBulkDelete) {
      btnTriggerBulkDelete.addEventListener('click', () => {
        window.nocUI.openBulkDeleteModal();
      });
    }

    const btnCloseBulkDeleteModal = document.getElementById('btnCloseBulkDeleteModal');
    const btnCancelBulkDelete = document.getElementById('btnCancelBulkDelete');
    if (btnCloseBulkDeleteModal) btnCloseBulkDeleteModal.addEventListener('click', () => window.nocUI.closeBulkDeleteModal());
    if (btnCancelBulkDelete) btnCancelBulkDelete.addEventListener('click', () => window.nocUI.closeBulkDeleteModal());

    const btnConfirmBulkDelete = document.getElementById('btnConfirmBulkDelete');
    if (btnConfirmBulkDelete) {
      btnConfirmBulkDelete.addEventListener('click', async () => {
        if (!window.nocAuth || !window.nocAuth.canBulkDelete()) {
          window.showToast('Developer privileges required to perform bulk deletion.', 'error');
          return;
        }

        const idsToDelete = Array.from(window.nocUI.selectedRecordIds || []);
        if (idsToDelete.length === 0) {
          window.showToast('No records selected for bulk deletion.', 'info');
          window.nocUI.closeBulkDeleteModal();
          return;
        }

        try {
          btnConfirmBulkDelete.disabled = true;
          btnConfirmBulkDelete.textContent = 'Deleting records...';
          
          await window.nocDB.bulkDelete(idsToDelete);

          const strIds = new Set(idsToDelete.map(i => String(i)));
          this.allRecords = (this.allRecords || []).filter(r => !strIds.has(String(r.id)) && (!r.nocNumber || !strIds.has(String(r.nocNumber))));
          this.filteredRecords = (this.filteredRecords || []).filter(r => !strIds.has(String(r.id)) && (!r.nocNumber || !strIds.has(String(r.nocNumber))));
          
          window.nocUI.selectedRecordIds.clear();
          window.nocUI.closeBulkDeleteModal();
          window.nocUI.updateBulkActionsBar();
          
          await this.refreshData();
          window.showToast(`🎉 Successfully deleted ${idsToDelete.length} NOC record${idsToDelete.length === 1 ? '' : 's'}.`, 'success', 5000);
        } catch (err) {
          console.error('Bulk deletion error:', err);
          window.showToast('Failed to complete bulk deletion: ' + err.message, 'error');
        } finally {
          btnConfirmBulkDelete.disabled = false;
          btnConfirmBulkDelete.innerHTML = `🗑️ Delete <span id="bulkDeleteBtnCount">0</span> Records`;
        }
      });
    }

    // NOC Entry Form Submit (Add / Edit)
    const nocForm = document.getElementById('nocEntryForm');
    if (nocForm) {
      nocForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleFormSubmit();
      });
    }

    // NOC Type Select & Custom Type Input interactions
    const nocTypeSelect = document.getElementById('nocTypeSelect');
    const customTypeContainer = document.getElementById('customTypeContainer');
    const nocTypeCustomInput = document.getElementById('nocTypeCustomInput');
    const nocTypeHint = document.getElementById('nocTypeHint');
    const btnCancelCustomType = document.getElementById('btnCancelCustomType');

    if (nocTypeSelect) {
      nocTypeSelect.addEventListener('change', (e) => {
        if (e.target.value === '__custom__') {
          if (customTypeContainer) customTypeContainer.style.display = 'block';
          if (nocTypeCustomInput) {
            nocTypeCustomInput.required = true;
            nocTypeCustomInput.focus();
          }
        } else {
          if (customTypeContainer) customTypeContainer.style.display = 'none';
          if (nocTypeCustomInput) {
            nocTypeCustomInput.required = false;
            nocTypeCustomInput.value = '';
          }
        }
      });
    }

    if (nocTypeHint) {
      nocTypeHint.addEventListener('click', () => {
        if (nocTypeSelect) nocTypeSelect.value = '__custom__';
        if (customTypeContainer) customTypeContainer.style.display = 'block';
        if (nocTypeCustomInput) {
          nocTypeCustomInput.required = true;
          nocTypeCustomInput.focus();
        }
      });
    }

    if (btnCancelCustomType) {
      btnCancelCustomType.addEventListener('click', () => {
        if (customTypeContainer) customTypeContainer.style.display = 'none';
        if (nocTypeCustomInput) {
          nocTypeCustomInput.required = false;
          nocTypeCustomInput.value = '';
        }
        if (nocTypeSelect) nocTypeSelect.value = '';
      });
    }

    // Issued To (Contractor / Company) Select & Custom/Edit Contractor Input interactions
    const issuedToSelect = document.getElementById('issuedToSelect');
    const customContractorContainer = document.getElementById('customContractorContainer');
    const issuedToCustomInput = document.getElementById('issuedToCustomInput');
    const issuedToHint = document.getElementById('issuedToHint');
    const btnCancelCustomContractor = document.getElementById('btnCancelCustomContractor');
    const issuedToEditHint = document.getElementById('issuedToEditHint');
    const editContractorContainer = document.getElementById('editContractorContainer');
    const issuedToEditInput = document.getElementById('issuedToEditInput');
    const btnSaveEditContractor = document.getElementById('btnSaveEditContractor');
    const btnCancelEditContractor = document.getElementById('btnCancelEditContractor');

    if (issuedToSelect) {
      issuedToSelect.addEventListener('change', (e) => {
        if (editContractorContainer) editContractorContainer.style.display = 'none';
        if (issuedToEditInput) {
          issuedToEditInput.value = '';
          issuedToEditInput.dataset.originalValue = '';
        }

        if (e.target.value === '__custom__') {
          if (customContractorContainer) customContractorContainer.style.display = 'block';
          if (issuedToCustomInput) {
            issuedToCustomInput.required = true;
            issuedToCustomInput.focus();
          }
        } else {
          if (customContractorContainer) customContractorContainer.style.display = 'none';
          if (issuedToCustomInput) {
            issuedToCustomInput.required = false;
            issuedToCustomInput.value = '';
          }
        }
      });
    }

    if (issuedToHint) {
      issuedToHint.addEventListener('click', () => {
        if (editContractorContainer) editContractorContainer.style.display = 'none';
        if (issuedToEditInput) {
          issuedToEditInput.value = '';
          issuedToEditInput.dataset.originalValue = '';
        }

        if (issuedToSelect) issuedToSelect.value = '__custom__';
        if (customContractorContainer) customContractorContainer.style.display = 'block';
        if (issuedToCustomInput) {
          issuedToCustomInput.required = true;
          issuedToCustomInput.focus();
        }
      });
    }

    if (issuedToCustomInput) {
      issuedToCustomInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
      });
    }

    if (btnCancelCustomContractor) {
      btnCancelCustomContractor.addEventListener('click', () => {
        if (customContractorContainer) customContractorContainer.style.display = 'none';
        if (issuedToCustomInput) {
          issuedToCustomInput.required = false;
          issuedToCustomInput.value = '';
        }
        if (issuedToSelect) issuedToSelect.value = '';
      });
    }

    if (issuedToEditHint) {
      issuedToEditHint.addEventListener('click', () => {
        const currentVal = issuedToSelect ? issuedToSelect.value.trim() : '';
        if (!currentVal || currentVal === '__custom__') {
          if (window.showToast) {
            window.showToast('Please select a Contractor / Company from the dropdown to edit.', 'info');
          }
          return;
        }

        if (customContractorContainer) customContractorContainer.style.display = 'none';
        if (issuedToCustomInput) {
          issuedToCustomInput.required = false;
          issuedToCustomInput.value = '';
        }

        if (editContractorContainer) editContractorContainer.style.display = 'block';
        if (issuedToEditInput) {
          issuedToEditInput.value = currentVal;
          issuedToEditInput.dataset.originalValue = currentVal;
          issuedToEditInput.focus();
          issuedToEditInput.select();
        }
      });
    }

    if (issuedToEditInput) {
      issuedToEditInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
      });
      issuedToEditInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (btnSaveEditContractor) btnSaveEditContractor.click();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if (btnCancelEditContractor) btnCancelEditContractor.click();
        }
      });
    }

    if (btnSaveEditContractor) {
      btnSaveEditContractor.addEventListener('click', async () => {
        const oldName = issuedToEditInput ? (issuedToEditInput.dataset.originalValue || '').trim().toUpperCase() : '';
        const newName = issuedToEditInput ? issuedToEditInput.value.trim().toUpperCase() : '';

        if (!newName) {
          if (window.showToast) window.showToast('Contractor / Company name cannot be empty.', 'error');
          return;
        }

        if (newName === oldName) {
          if (editContractorContainer) editContractorContainer.style.display = 'none';
          if (window.showToast) window.showToast('No changes made to company name.', 'info');
          return;
        }

        btnSaveEditContractor.disabled = true;
        try {
          await window.nocApp.updateContractorName(oldName, newName);
          if (editContractorContainer) editContractorContainer.style.display = 'none';
          if (issuedToEditInput) {
            issuedToEditInput.value = '';
            issuedToEditInput.dataset.originalValue = '';
          }
          if (window.showToast) window.showToast(`Company updated to "${newName}" successfully.`, 'success');
        } catch (err) {
          if (window.showToast) window.showToast('Failed to update company name: ' + err.message, 'error');
        } finally {
          btnSaveEditContractor.disabled = false;
        }
      });
    }

    if (btnCancelEditContractor) {
      btnCancelEditContractor.addEventListener('click', () => {
        if (editContractorContainer) editContractorContainer.style.display = 'none';
        if (issuedToEditInput) {
          issuedToEditInput.value = '';
          issuedToEditInput.dataset.originalValue = '';
        }
      });
    }

    // Document Dropzone File Input
    const dropzone = document.getElementById('docDropzone');
    const fileInput = document.getElementById('docFileInput');

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());

      fileInput.addEventListener('change', (e) => {
        window.nocUI.handleFilesSelected(e.target.files);
        fileInput.value = ''; // reset so same file can be selected again if needed
      });

      // Drag and Drop
      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files) {
          window.nocUI.handleFilesSelected(dt.files);
        }
      });
    }

    // Clear validation error outlines on user input/change
    const entryForm = document.getElementById('nocEntryForm');
    if (entryForm) {
      entryForm.addEventListener('input', (e) => {
        if (e.target && e.target.classList.contains('input-error')) {
          e.target.classList.remove('input-error');
        }
      });
      entryForm.addEventListener('change', (e) => {
        if (e.target && e.target.classList.contains('input-error')) {
          e.target.classList.remove('input-error');
        }
      });
    }

    // Login Form Submission & Modal Controls
    const btnCloseLoginModal = document.getElementById('btnCloseLoginModal');
    if (btnCloseLoginModal) btnCloseLoginModal.addEventListener('click', () => window.nocUI.closeLoginModal());

    // Show/Hide Password Toggle Buttons
    this.setupPasswordToggle('btnToggleLoginPassword', 'loginPassword', 'password');
    this.setupPasswordToggle('btnToggleSupabaseKey', 'inputSupabaseKey', 'API key');

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('btnSubmitLogin');
        const usernameInput = document.getElementById('loginUsername');
        const passwordInput = document.getElementById('loginPassword');
        const u = usernameInput ? usernameInput.value : '';
        const p = passwordInput ? passwordInput.value : '';
        const rememberMe = !!(document.getElementById('loginRememberMe') && document.getElementById('loginRememberMe').checked);

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span>⏳ Signing In...</span>';
        }

        try {
          const res = window.nocAuth.login(u, p, rememberMe);
          if (res.success) {
            window.nocUI.closeLoginModal(true);
            const isGuestUser = res.user.role === 'guest';
            const isMainUser = res.user.role === 'main' || res.user.role === 'employee';
            const isSecurityUser = res.user.role === 'security';
            const isSBYIMUser = res.user.username.toLowerCase() === 'sbyim';

            if (isGuestUser || isSecurityUser || isSBYIMUser || isMainUser) {
              this.sortBy = 'issuance';
              const filterSort = document.getElementById('filterSort');
              if (filterSort) filterSort.value = 'issuance';
            }

            this.currentPage = 1;
            const isAutoSearch = isGuestUser;
            const queryVal = isAutoSearch ? res.user.username : '';
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
              searchInput.value = queryVal;
            }
            this.searchQuery = queryVal;
            this.applyFilters();
            window.showToast(`Logged in successfully as "${res.user.username}" (${res.user.role.toUpperCase()}).` + (isAutoSearch ? ` Searching corresponding data files for "${res.user.username}" (Sorted by Issuance Date)...` : ((isSecurityUser || isMainUser || isSBYIMUser) ? ' Sorted by Issuance Date.' : '')), 'success');
          } else {
            window.showToast(res.message, 'error');
            if (passwordInput) {
              passwordInput.value = '';
              passwordInput.focus();
            }
          }
        } catch (err) {
          console.error('Login submit error:', err);
          window.showToast('Login failed: ' + err.message, 'error');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>🛡️ Sign In</span>';
          }
        }
      });
    }

    // NOC Requirements Modal (Up to 5 Documents)
    const btnNocRequirements = document.getElementById('btnNocRequirements');
    const btnCloseRequirementsModal = document.getElementById('btnCloseRequirementsModal');
    const btnCloseReqModalFooter = document.getElementById('btnCloseReqModalFooter');
    const btnDownloadAllReqDocs = document.getElementById('btnDownloadAllReqDocs');
    const reqDropzone = document.getElementById('reqDropzone');
    const reqFilesInput = document.getElementById('reqFilesInput');

    if (btnNocRequirements) {
      btnNocRequirements.addEventListener('click', () => {
        window.nocUI.openRequirementsModal();
      });
    }

    if (btnCloseRequirementsModal) {
      btnCloseRequirementsModal.addEventListener('click', () => {
        window.nocUI.closeRequirementsModal();
      });
    }

    if (btnCloseReqModalFooter) {
      btnCloseReqModalFooter.addEventListener('click', () => {
        window.nocUI.closeRequirementsModal();
      });
    }

    if (btnDownloadAllReqDocs) {
      btnDownloadAllReqDocs.addEventListener('click', async () => {
        const docs = await window.nocDB.getRequirementsDocs();
        if (!docs || docs.length === 0) {
          window.showToast('No requirement documents available to download.', 'info');
          return;
        }
        const isGuest = window.nocAuth && window.nocAuth.isGuest();
        window.showToast(`Starting download for ${docs.length} requirement file(s)...`, 'info');

        for (let idx = 0; idx < docs.length; idx++) {
          const d = docs[idx];
          const isPdf = (d.type && d.type.includes('pdf')) || (d.name && d.name.toLowerCase().endsWith('.pdf'));

          let downloadData = d.dataUrl;
          let downloadName = `Requirement_${d.name}`;

          if (isGuest && isPdf) {
            const baseName = d.name.replace(/\.pdf$/i, '');
            downloadName = `Requirement_${baseName}_Page_1.pdf`;
            const blob = await window.docViewer.getFirstPagePdfBlob(d.dataUrl);
            if (blob) {
              downloadData = blob;
            }
          }

          setTimeout(() => {
            window.docViewer.triggerFileDownload(downloadData, downloadName);
          }, idx * 400);
        }
      });
    }

    const btnDeleteAllReqDocs = document.getElementById('btnDeleteAllReqDocs');
    if (btnDeleteAllReqDocs) {
      btnDeleteAllReqDocs.addEventListener('click', async () => {
        if (!window.nocAuth || !window.nocAuth.canManageGuidelinesAndDocs()) {
          window.showToast('Access restricted: Only Developer and Administrator roles can delete requirement documents.', 'error');
          return;
        }
        if (confirm('Are you sure you want to permanently delete all uploaded requirement documents?')) {
          await window.nocDB.deleteAllRequirementsDocs();
          window.showToast('All requirement documents have been permanently removed.', 'info');
          await window.nocUI.openRequirementsModal();
        }
      });
    }

    if (reqDropzone && reqFilesInput) {
      reqDropzone.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!window.nocAuth || !window.nocAuth.canManageGuidelinesAndDocs()) {
          window.showToast('Access restricted: Only Developer and Administrator roles can upload requirement documents.', 'error');
          return;
        }
        reqFilesInput.click();
      });

      const handleReqUploads = async (fileList) => {
        if (!window.nocAuth || !window.nocAuth.canManageGuidelinesAndDocs()) {
          window.showToast('Access restricted: Only Developer and Administrator roles can upload requirement documents.', 'error');
          return;
        }

        const files = Array.from(fileList || []);
        if (files.length === 0) return;

        const existingDocs = await window.nocDB.getRequirementsDocs();
        const availableSlots = 5 - existingDocs.length;

        if (availableSlots <= 0) {
          window.showToast('Maximum limit of 5 requirement documents reached. Delete existing documents first.', 'error');
          return;
        }

        const filesToProcess = files.slice(0, availableSlots);
        if (files.length > availableSlots) {
          window.showToast(`Only ${availableSlots} more document(s) could be added (max 5 limit).`, 'info');
        }

        window.showToast(`Uploading ${filesToProcess.length} requirement document(s)...`, 'info');

        const newDocs = [];
        for (const file of filesToProcess) {
          if (file.size > 25 * 1024 * 1024) {
            window.showToast(`"${file.name}" exceeds 25MB limit.`, 'error');
            continue;
          }

          let fileType = file.type;
          const nameLower = file.name.toLowerCase();
          if (!fileType) {
            if (nameLower.endsWith('.pdf')) fileType = 'application/pdf';
            else if (nameLower.endsWith('.docx')) fileType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            else if (nameLower.endsWith('.doc')) fileType = 'application/msword';
            else if (nameLower.match(/\.(png|jpg|jpeg|webp|svg)$/)) fileType = 'image/' + nameLower.split('.').pop();
            else fileType = 'application/octet-stream';
          }

          try {
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target.result);
              reader.onerror = (err) => reject(err);
              reader.readAsDataURL(file);
            });

            newDocs.push({
              id: 'req_doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              name: file.name,
              type: fileType,
              size: file.size,
              dataUrl: dataUrl,
              uploadedAt: new Date().toISOString(),
              uploadedBy: window.nocAuth.currentUser?.displayName || (window.nocAuth.getUser ? window.nocAuth.getUser()?.displayName : null) || 'System Administrator'
            });
          } catch (readErr) {
            console.error('Error reading requirement file:', file.name, readErr);
            window.showToast(`Failed to read "${file.name}".`, 'error');
          }
        }

        if (newDocs.length > 0) {
          const updatedList = [...existingDocs, ...newDocs];
          await window.nocDB.saveRequirementsDocs(updatedList);
          await window.nocUI.openRequirementsModal();
          const isDb = window.nocDB.isSupabaseActive();
          window.showToast(`Successfully uploaded ${newDocs.length} requirement document(s)${isDb ? ' to Supabase database' : ''}!`, 'success');
        }
      };

      reqFilesInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files.length > 0) {
          await handleReqUploads(e.target.files);
          reqFilesInput.value = '';
        }
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        reqDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          reqDropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        reqDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          reqDropzone.classList.remove('dragover');
        });
      });

      reqDropzone.addEventListener('drop', async (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
          await handleReqUploads(dt.files);
        }
      });
    }

    // SBYI COC Modal (Up to 8 PDF Documents)
    const btnSbyiCoc = document.getElementById('btnSbyiCoc');
    const btnCloseCocModal = document.getElementById('btnCloseCocModal');
    const btnCloseCocModalFooter = document.getElementById('btnCloseCocModalFooter');
    const btnDownloadAllCocDocs = document.getElementById('btnDownloadAllCocDocs');
    const cocDropzone = document.getElementById('cocDropzone');
    const cocFilesInput = document.getElementById('cocFilesInput');

    if (btnSbyiCoc) {
      btnSbyiCoc.addEventListener('click', () => {
        window.nocUI.openCocModal();
      });
    }

    if (btnCloseCocModal) {
      btnCloseCocModal.addEventListener('click', () => {
        window.nocUI.closeCocModal();
      });
    }

    if (btnCloseCocModalFooter) {
      btnCloseCocModalFooter.addEventListener('click', () => {
        window.nocUI.closeCocModal();
      });
    }

    if (btnDownloadAllCocDocs) {
      btnDownloadAllCocDocs.addEventListener('click', async () => {
        const docs = await window.nocDB.getCocDocs();
        if (!docs || docs.length === 0) {
          window.showToast('No SBYI COC documents available to download.', 'info');
          return;
        }
        window.showToast(`Starting download for ${docs.length} SBYI COC file(s)...`, 'info');

        for (let idx = 0; idx < docs.length; idx++) {
          const d = docs[idx];
          setTimeout(() => {
            window.docViewer.triggerFileDownload(d.dataUrl, `SBYI_COC_${d.name}`);
          }, idx * 400);
        }
      });
    }

    const btnDeleteAllCocDocs = document.getElementById('btnDeleteAllCocDocs');
    if (btnDeleteAllCocDocs) {
      btnDeleteAllCocDocs.addEventListener('click', async () => {
        if (!window.nocAuth || !window.nocAuth.canManageGuidelinesAndDocs()) {
          window.showToast('Access restricted: Only Developer and Administrator roles can delete documents.', 'error');
          return;
        }
        if (confirm('Are you sure you want to permanently delete all uploaded SBYI Code of Conduct documents?')) {
          await window.nocDB.deleteAllCocDocs();
          window.showToast('All SBYI COC documents have been permanently removed.', 'info');
          await window.nocUI.openCocModal();
        }
      });
    }

    if (cocDropzone && cocFilesInput) {
      cocDropzone.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!window.nocAuth || !window.nocAuth.canManageGuidelinesAndDocs()) {
          window.showToast('Access restricted: Only Developer and Administrator roles can upload SBYI COC documents.', 'error');
          return;
        }
        cocFilesInput.click();
      });

      const handleCocUploads = async (fileList) => {
        if (!window.nocAuth || !window.nocAuth.canManageGuidelinesAndDocs()) {
          window.showToast('Access restricted: Only Developer and Administrator roles can upload SBYI COC documents.', 'error');
          return;
        }

        const files = Array.from(fileList || []);
        if (files.length === 0) return;

        const existingDocs = await window.nocDB.getCocDocs();
        const availableSlots = 8 - existingDocs.length;

        if (availableSlots <= 0) {
          window.showToast('Maximum of 8 SBYI COC PDF documents reached. Please delete an existing document first.', 'error');
          return;
        }

        // Validate strictly PDF files only
        const pdfFiles = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
        const rejectedCount = files.length - pdfFiles.length;

        if (rejectedCount > 0) {
          window.showToast(`${rejectedCount} non-PDF file(s) skipped. SBYI COC accepts PDF files only.`, 'warning');
        }

        if (pdfFiles.length === 0) {
          window.showToast('Only PDF files can be uploaded.', 'error');
          return;
        }

        const toUpload = pdfFiles.slice(0, availableSlots);
        if (pdfFiles.length > availableSlots) {
          window.showToast(`Only ${availableSlots} file(s) can be added (max 8 total).`, 'info');
        }

        window.showToast(`Uploading ${toUpload.length} SBYI COC PDF file(s)...`, 'info');

        const newDocs = [];
        for (const file of toUpload) {
          if (file.size > 25 * 1024 * 1024) {
            window.showToast(`"${file.name}" exceeds 25MB limit.`, 'error');
            continue;
          }

          try {
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target.result);
              reader.onerror = (err) => reject(err);
              reader.readAsDataURL(file);
            });

            newDocs.push({
              id: 'coc_doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              name: file.name,
              type: 'application/pdf',
              size: file.size,
              dataUrl: dataUrl,
              uploadedAt: new Date().toISOString(),
              uploadedBy: window.nocAuth.currentUser?.displayName || 'Admin'
            });
          } catch (readErr) {
            console.error('Error reading COC file:', file.name, readErr);
            window.showToast(`Failed to read "${file.name}".`, 'error');
          }
        }

        if (newDocs.length > 0) {
          const updatedList = [...existingDocs, ...newDocs];
          await window.nocDB.saveCocDocs(updatedList);
          await window.nocUI.openCocModal();
          const isDb = window.nocDB.isSupabaseActive();
          window.showToast(`Successfully uploaded ${newDocs.length} SBYI COC PDF document(s)${isDb ? ' to Supabase database' : ''}!`, 'success');
        }
      };

      cocFilesInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files.length > 0) {
          await handleCocUploads(e.target.files);
          cocFilesInput.value = '';
        }
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        cocDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          cocDropzone.style.borderColor = '#D97706';
          cocDropzone.style.background = '#FEF3C7';
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        cocDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          cocDropzone.style.borderColor = '#F59E0B';
          cocDropzone.style.background = 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)';
        });
      });

      cocDropzone.addEventListener('drop', async (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
          await handleCocUploads(dt.files);
        }
      });
    }

    // ========================================================================
    // AI Documents Modal (DOC, DOCX, or PDF Files Only)
    // ========================================================================
    const btnAiDocuments = document.getElementById('btnAiDocuments');
    const btnCloseAiDocsModal = document.getElementById('btnCloseAiDocsModal');
    const btnCloseAiDocsModalFooter = document.getElementById('btnCloseAiDocsModalFooter');
    const btnDownloadAllAiDocs = document.getElementById('btnDownloadAllAiDocs');
    const btnDeleteAllAiDocs = document.getElementById('btnDeleteAllAiDocs');
    const aiDocDropzone = document.getElementById('aiDocDropzone');
    const aiDocFilesInput = document.getElementById('aiDocFilesInput');

    if (btnAiDocuments) {
      btnAiDocuments.addEventListener('click', () => {
        if (!window.nocAuth || !window.nocAuth.isDeveloper()) {
          window.showToast('Access restricted: Developer access role required for AI Documents.', 'error');
          return;
        }
        window.nocUI.openAiDocumentsModal();
      });
    }

    if (btnCloseAiDocsModal) {
      btnCloseAiDocsModal.addEventListener('click', () => {
        window.nocUI.closeAiDocumentsModal();
      });
    }

    if (btnCloseAiDocsModalFooter) {
      btnCloseAiDocsModalFooter.addEventListener('click', () => {
        window.nocUI.closeAiDocumentsModal();
      });
    }

    if (btnDownloadAllAiDocs) {
      btnDownloadAllAiDocs.addEventListener('click', async () => {
        const docs = await window.nocDB.getAiDocs();
        if (!docs || docs.length === 0) {
          window.showToast('No AI documents available to download.', 'info');
          return;
        }
        window.showToast(`Starting download for ${docs.length} AI document file(s)...`, 'info');

        for (let idx = 0; idx < docs.length; idx++) {
          const d = docs[idx];
          setTimeout(() => {
            window.docViewer.triggerFileDownload(d.dataUrl, `AI_${d.name}`);
          }, idx * 400);
        }
      });
    }

    if (btnDeleteAllAiDocs) {
      btnDeleteAllAiDocs.addEventListener('click', async () => {
        if (!window.nocAuth || !window.nocAuth.isDeveloper()) {
          window.showToast('Access restricted: Only Developer role can delete AI documents.', 'error');
          return;
        }
        if (confirm('Are you sure you want to permanently delete all uploaded AI knowledge base documents?')) {
          await window.nocDB.deleteAllAiDocs();
          window.showToast('All AI documents have been permanently removed.', 'info');
          await window.nocUI.openAiDocumentsModal();
        }
      });
    }

    if (aiDocDropzone && aiDocFilesInput) {
      aiDocDropzone.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!window.nocAuth || !window.nocAuth.isDeveloper()) {
          window.showToast('Access restricted: Only Developer role can upload AI documents.', 'error');
          return;
        }
        aiDocFilesInput.click();
      });

      const isAllowedDocFile = (file) => {
        const name = (file.name || '').toLowerCase();
        const type = (file.type || '').toLowerCase();
        return name.endsWith('.doc') || name.endsWith('.docx') || name.endsWith('.pdf') ||
               type.includes('pdf') || type.includes('wordprocessingml') || type.includes('msword');
      };

      const handleAiDocUploads = async (fileList) => {
        if (!window.nocAuth || !window.nocAuth.isDeveloper()) {
          window.showToast('Access restricted: Only Developer role can upload AI documents.', 'error');
          return;
        }

        const files = Array.from(fileList);
        if (files.length === 0) return;

        // Strictly validate: DOC, DOCX, or PDF only
        const allowedFiles = files.filter(isAllowedDocFile);
        const rejectedCount = files.length - allowedFiles.length;

        if (rejectedCount > 0) {
          window.showToast(`${rejectedCount} unsupported file(s) skipped. AI Documents accepts DOC, DOCX, or PDF files only.`, 'warning');
        }

        if (allowedFiles.length === 0) {
          window.showToast('Only DOC, DOCX, or PDF files can be uploaded.', 'error');
          return;
        }

        window.showToast(`Processing ${allowedFiles.length} AI document(s)...`, 'info');

        const existingDocs = await window.nocDB.getAiDocs();
        const newDocs = [];

        for (const file of allowedFiles) {
          if (file.size > 25 * 1024 * 1024) {
            window.showToast(`"${file.name}" exceeds 25MB limit.`, 'error');
            continue;
          }

          const dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
          });

          const nameLower = file.name.toLowerCase();
          let mimeType = file.type;
          if (!mimeType) {
            if (nameLower.endsWith('.pdf')) mimeType = 'application/pdf';
            else if (nameLower.endsWith('.docx')) mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            else if (nameLower.endsWith('.doc')) mimeType = 'application/msword';
            else mimeType = 'application/octet-stream';
          }

          newDocs.push({
            id: 'ai_doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            name: file.name,
            type: mimeType,
            size: file.size,
            dataUrl: dataUrl,
            uploadedAt: new Date().toISOString(),
            uploadedBy: window.nocAuth.currentUser?.displayName || 'Admin'
          });
        }

        if (newDocs.length === 0) return;

        const updatedList = [...existingDocs, ...newDocs];
        await window.nocDB.saveAiDocs(updatedList);
        await window.nocUI.openAiDocumentsModal();
        const isDb = window.nocDB.isSupabaseActive();
        window.showToast(`Successfully uploaded ${newDocs.length} AI document(s) & indexed in Knowledge Base${isDb ? ' (Synced with Supabase)' : ''}!`, 'success');
        aiDocFilesInput.value = '';
      };

      aiDocFilesInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleAiDocUploads(e.target.files);
        }
      });

      ['dragenter', 'dragover'].forEach(eventName => {
        aiDocDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          aiDocDropzone.style.borderColor = '#6366F1';
          aiDocDropzone.style.background = '#EEF2FF';
        });
      });

      ['dragleave', 'drop'].forEach(eventName => {
        aiDocDropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          aiDocDropzone.style.borderColor = '#818CF8';
          aiDocDropzone.style.background = 'linear-gradient(135deg, #EEF2FF 0%, #FAF5FF 100%)';
        });
      });

      aiDocDropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length > 0) {
          handleAiDocUploads(dt.files);
        }
      });
    }

    // Export & Import Utilities
    const btnExportCSV = document.getElementById('btnExportCSV');
    const btnExportJSON = document.getElementById('btnExportJSON');
    const btnImportJSON = document.getElementById('btnImportJSON');
    const inputImportJSON = document.getElementById('inputImportJSON');
    const btnModalImportJSON = document.getElementById('btnModalImportJSON');
    const btnPrintReport = document.getElementById('btnPrintReport');

    if (btnExportCSV) btnExportCSV.addEventListener('click', () => this.exportCSV());
    if (btnExportJSON) btnExportJSON.addEventListener('click', () => this.exportJSON());
    if (btnImportJSON && inputImportJSON) {
      btnImportJSON.addEventListener('click', () => {
        if (!window.nocAuth || !window.nocAuth.canImportJSON()) {
          window.showToast('Administrator privileges required to import JSON backup.', 'error');
          return;
        }
        inputImportJSON.click();
      });
    }
    if (btnModalImportJSON && inputImportJSON) {
      btnModalImportJSON.addEventListener('click', () => {
        if (!window.nocAuth || !window.nocAuth.canImportJSON()) {
          window.showToast('Administrator privileges required to import JSON backup.', 'error');
          return;
        }
        inputImportJSON.click();
      });
    }
    if (inputImportJSON) {
      inputImportJSON.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          await this.importJSONFile(file);
          inputImportJSON.value = '';
        }
      });
    }
    if (btnPrintReport) {
      btnPrintReport.addEventListener('click', () => {
        if (!window.nocAuth.isAdmin()) {
          window.showToast('Admin access required to print report.', 'error');
          return;
        }
        window.print();
      });
    }

    // ========================================================================
    // Supabase / PostgreSQL Database Modal Events
    // ========================================================================
    const btnDatabaseConfig = document.getElementById('btnDatabaseConfig');
    const btnCloseDatabaseModal = document.getElementById('btnCloseDatabaseModal');
    const btnCloseDatabaseModalFooter = document.getElementById('btnCloseDatabaseModalFooter');
    const btnSaveSupabaseConfig = document.getElementById('btnSaveSupabaseConfig');
    const btnTestSupabaseConnection = document.getElementById('btnTestSupabaseConnection');
    const btnClearSupabaseConfig = document.getElementById('btnClearSupabaseConfig');
    const btnSyncToSupabase = document.getElementById('btnSyncToSupabase');
    const btnRestoreAllData = document.getElementById('btnRestoreAllData');
    const btnCopySqlSchema = document.getElementById('btnCopySqlSchema');

    if (btnDatabaseConfig) {
      btnDatabaseConfig.addEventListener('click', () => {
        if (!window.nocAuth || !window.nocAuth.isAdmin()) {
          window.showToast('Administrator privileges required for Database Settings.', 'error');
          return;
        }
        window.nocUI.openDatabaseModal();
      });
    }

    if (btnCloseDatabaseModal) {
      btnCloseDatabaseModal.addEventListener('click', () => {
        window.nocUI.closeDatabaseModal();
      });
    }

    if (btnCloseDatabaseModalFooter) {
      btnCloseDatabaseModalFooter.addEventListener('click', () => {
        window.nocUI.closeDatabaseModal();
      });
    }

    // Save Supabase Project Credentials & Connect
    if (btnSaveSupabaseConfig) {
      btnSaveSupabaseConfig.addEventListener('click', async () => {
        const url = (document.getElementById('inputSupabaseUrl')?.value || '').trim();
        const key = (document.getElementById('inputSupabaseKey')?.value || '').trim();

        if (!url || !key) {
          window.showToast('Please enter both Supabase URL and Anon Key.', 'error');
          return;
        }

        btnSaveSupabaseConfig.disabled = true;
        btnSaveSupabaseConfig.textContent = 'Connecting...';

        try {
          window.supabaseManager.saveCredentials(url, key);
          const result = await window.supabaseManager.testConnection();

          if (result.success) {
            window.showToast('Connected to Supabase PostgreSQL database!', 'success');
            await this.refreshData();
          } else {
            window.showToast(result.message || 'Connection failed.', 'error');
          }
        } catch (err) {
          window.showToast('Error saving credentials: ' + err.message, 'error');
        } finally {
          btnSaveSupabaseConfig.disabled = false;
          btnSaveSupabaseConfig.textContent = '💾 Save & Connect';
          window.nocUI.renderDatabaseStatus();
        }
      });
    }

    // Test Supabase Connection
    if (btnTestSupabaseConnection) {
      btnTestSupabaseConnection.addEventListener('click', async () => {
        const url = (document.getElementById('inputSupabaseUrl')?.value || '').trim();
        const key = (document.getElementById('inputSupabaseKey')?.value || '').trim();

        if (url && key) {
          window.supabaseManager.saveCredentials(url, key);
        }

        btnTestSupabaseConnection.disabled = true;
        btnTestSupabaseConnection.textContent = 'Testing...';

        try {
          const result = await window.supabaseManager.testConnection();
          if (result.success) {
            // Run comprehensive non-destructive CRUD test
            if (window.nocDB && window.nocDB.testSupabaseCRUD) {
              const crudRes = await window.nocDB.testSupabaseCRUD();
              if (crudRes.success) {
                window.showToast('Supabase PostgreSQL connected! Read, Insert, Update, and Delete tests all PASSED with 0 residue. ⚡', 'success');
              } else {
                window.showToast(`Connected, but CRUD test failed: ${crudRes.error}`, 'warning');
              }
            } else {
              window.showToast('Supabase PostgreSQL connection successful! ⚡', 'success');
            }
          } else {
            window.showToast(result.message || 'Connection test failed.', 'error');
          }
        } catch (err) {
          window.showToast('Connection test error: ' + err.message, 'error');
        } finally {
          btnTestSupabaseConnection.disabled = false;
          btnTestSupabaseConnection.textContent = '🔌 Test Connection';
          window.nocUI.renderDatabaseStatus();
        }
      });
    }

    // Clear Credentials & Disconnect
    if (btnClearSupabaseConfig) {
      btnClearSupabaseConfig.addEventListener('click', async () => {
        if (confirm('Disconnect Supabase and switch back to Local Persistent Storage?')) {
          window.supabaseManager.clearCredentials();
          const urlInput = document.getElementById('inputSupabaseUrl');
          const keyInput = document.getElementById('inputSupabaseKey');
          if (urlInput) urlInput.value = '';
          if (keyInput) keyInput.value = '';
          window.showToast('Reverted to Local Storage mode.', 'info');
          window.nocUI.renderDatabaseStatus();
          await this.refreshData();
        }
      });
    }

    // Restore All Data & Connect to Supabase
    if (btnRestoreAllData) {
      btnRestoreAllData.addEventListener('click', async () => {
        if (!confirm('This will restore all default NOC certificates, requirements guidelines, SBYI COC files, categories, contractors, and users, and synchronize them with Supabase. Proceed?')) {
          return;
        }

        btnRestoreAllData.disabled = true;
        btnRestoreAllData.textContent = 'Restoring...';

        try {
          const stats = await window.restoreAllData(true);
          const isDb = window.nocDB && window.nocDB.isSupabaseActive();
          window.showToast(`All data restored! ${stats.records} NOC records, ${stats.reqDocs} guidelines, ${stats.cocDocs} COC documents, ${stats.types} types, ${stats.contractors} contractors & ${stats.users} user accounts are active${isDb ? ' and synced to Supabase PostgreSQL' : ''}.`, 'success');
          await this.refreshData();
          this.populateTypeFilterOptions();
          this.populateFormTypeOptions('');
          this.populateFormContractorOptions('');
          window.nocUI.renderDatabaseStatus();
        } catch (err) {
          window.showToast('Restoration error: ' + err.message, 'error');
        } finally {
          btnRestoreAllData.disabled = false;
          btnRestoreAllData.textContent = '🔄 Restore All Data';
        }
      });
    }

    // Compare & Validate Local vs Supabase Data
    const btnValidateData = document.getElementById('btnValidateData');
    if (btnValidateData) {
      btnValidateData.addEventListener('click', async () => {
        if (!window.supabaseManager || !window.supabaseManager.isConfigured()) {
          window.showToast('Please connect to Supabase first to run validation.', 'error');
          return;
        }

        btnValidateData.disabled = true;
        btnValidateData.textContent = 'Validating...';

        try {
          const report = await window.nocDB.validateDataWithSupabase();
          if (report.status === 'OFFLINE') {
            window.showToast(report.message, 'error');
          } else {
            console.log('=== SUPABASE MIGRATION DATA VALIDATION REPORT ===', report);
            const summaryLines = (report.tables || []).map(t => `${t.table}: Local=${t.localCount || 0}, Supabase=${t.supabaseCount || 0} [${t.status}]`).join('\n');
            if (report.overallStatus === 'PASS') {
              window.showToast(`Validation Passed! All tables verified with matching record counts.`, 'success');
            } else {
              window.showToast(`Validation Completed (${report.overallStatus}). Check Developer Console for details.`, 'info');
            }
            alert(`=== SUPABASE DATA VALIDATION REPORT ===\nOverall Status: ${report.overallStatus}\n\n${summaryLines}`);
          }
        } catch (err) {
          window.showToast('Validation failed: ' + err.message, 'error');
        } finally {
          btnValidateData.disabled = false;
          btnValidateData.textContent = '📊 Validate Data';
        }
      });
    }

    // 1-Click Sync Local Records to Supabase
    if (btnSyncToSupabase) {
      btnSyncToSupabase.addEventListener('click', async () => {
        if (!window.supabaseManager || !window.supabaseManager.isConfigured()) {
          window.showToast('Please configure and connect your Supabase database first.', 'error');
          return;
        }

        btnSyncToSupabase.disabled = true;
        btnSyncToSupabase.textContent = 'Syncing records...';

        try {
          const stats = await window.nocDB.syncLocalToSupabase((prog) => {
            if (prog && prog.stage === 'records') {
              btnSyncToSupabase.textContent = `Syncing (${prog.current}/${prog.total})...`;
            }
          });
          window.showToast(`Sync successful! ${stats.recordsSynced} records, ${stats.reqDocsSynced} guidelines, ${stats.cocDocsSynced || 0} COC docs, ${stats.aiDocsSynced || 0} AI docs, ${stats.typesSynced || 0} types, ${stats.contractorsSynced || 0} contractors & ${stats.usersSynced || 0} users pushed to Supabase.`, 'success');
          await this.refreshData();
        } catch (err) {
          window.showToast('Sync failed: ' + err.message, 'error');
        } finally {
          btnSyncToSupabase.disabled = false;
          btnSyncToSupabase.textContent = '⬆️ Sync to Supabase';
        }
      });
    }

    // Copy SQL Schema
    if (btnCopySqlSchema) {
      btnCopySqlSchema.addEventListener('click', async () => {
        try {
          const sqlText = window.nocUI.getSqlSchemaText();
          await navigator.clipboard.writeText(sqlText);
          window.showToast('PostgreSQL SQL Schema copied to clipboard!', 'success');
        } catch (err) {
          // Fallback if clipboard API is restricted
          const codeBlock = document.getElementById('sqlSchemaCodeBlock');
          if (codeBlock) {
            const range = document.createRange();
            range.selectNodeContents(codeBlock);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('copy');
            selection.removeAllRanges();
            window.showToast('SQL Schema copied to clipboard!', 'success');
          } else {
            window.showToast('Could not copy automatically. Please select text manually.', 'error');
          }
        }
      });
    }

    // Listen to Supabase connection events for auto-sync and refresh
    window.addEventListener('noc:supabase-config-change', async (e) => {
      if (e.detail && e.detail.isConnected) {
        try {
          await this.refreshData();
          this.populateTypeFilterOptions();
        } catch (err) {
          console.warn('Auto refresh on Supabase connect note:', err);
        }
      }
    });

    // Setup User Database Listeners (Admin Only)
    this.setupUserDatabaseListeners();
  }

  /**
   * Set up User Database event listeners (Admin Only)
   */
  setupUserDatabaseListeners() {
    const btnUserDatabase = document.getElementById('btnUserDatabase');
    const btnCloseUserDbModal = document.getElementById('btnCloseUserDbModal');
    const btnCloseUserDbModalFooter = document.getElementById('btnCloseUserDbModalFooter');
    const userDbSearchInput = document.getElementById('userDbSearchInput');
    const btnAddUserModal = document.getElementById('btnAddUserModal');
    const userDbTableBody = document.getElementById('userDbTableBody');
    const btnCloseUserEditModal = document.getElementById('btnCloseUserEditModal');
    const btnCancelUserForm = document.getElementById('btnCancelUserForm');
    const userEditForm = document.getElementById('userEditForm');
    const btnToggleUserFormPassword = document.getElementById('btnToggleUserFormPassword');

    // 1. Open User Database Modal
    if (btnUserDatabase) {
      btnUserDatabase.addEventListener('click', () => {
        window.nocUI.openUserDatabaseModal();
      });
    }

    // 2. Close Modal
    if (btnCloseUserDbModal) {
      btnCloseUserDbModal.addEventListener('click', () => {
        window.nocUI.closeUserDatabaseModal();
      });
    }
    if (btnCloseUserDbModalFooter) {
      btnCloseUserDbModalFooter.addEventListener('click', () => {
        window.nocUI.closeUserDatabaseModal();
      });
    }

    // 3. Search Filter
    if (userDbSearchInput) {
      let searchTimeout = null;
      userDbSearchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          window.nocUI.refreshUserDatabaseView(e.target.value);
        }, 150);
      });
    }

    // 4. Open Add User Modal
    if (btnAddUserModal) {
      btnAddUserModal.addEventListener('click', () => {
        window.nocUI.openUserEditModal(null);
      });
    }

    // 5. Close Edit Modal
    if (btnCloseUserEditModal) {
      btnCloseUserEditModal.addEventListener('click', () => {
        window.nocUI.closeUserEditModal();
      });
    }
    if (btnCancelUserForm) {
      btnCancelUserForm.addEventListener('click', () => {
        window.nocUI.closeUserEditModal();
      });
    }

    // 6. Toggle Password Mask in Form
    this.setupPasswordToggle('btnToggleUserFormPassword', 'userFormPassword', 'password');

    // 7. Table Action Buttons (Edit, Delete, Copy Password)
    if (userDbTableBody) {
      userDbTableBody.addEventListener('click', async (e) => {
        const target = e.target;

        // Copy Password
        const copyBtn = target.closest('.btn-copy-pwd');
        if (copyBtn) {
          const pwd = copyBtn.getAttribute('data-clipboard');
          if (pwd) {
            try {
              await navigator.clipboard.writeText(pwd);
              window.showToast('Password copied to clipboard!', 'success');
            } catch (err) {
              window.showToast('Password: ' + pwd, 'info');
            }
          }
          return;
        }

        // Edit User
        const editBtn = target.closest('.btn-edit-user');
        if (editBtn) {
          const username = editBtn.getAttribute('data-username');
          const users = await window.nocDB.getUsers();
          const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
          if (user) {
            window.nocUI.openUserEditModal(user);
          }
          return;
        }

        // Delete User
        const deleteBtn = target.closest('.btn-delete-user');
        if (deleteBtn) {
          const username = deleteBtn.getAttribute('data-username');
          if (username) {
            window.nocUI.openUserDeleteModal(username);
          }
          return;
        }
      });
    }

    // 8. Delete User Confirmation Modal Handlers
    const btnCloseUserDeleteModal = document.getElementById('btnCloseUserDeleteModal');
    const btnCancelUserDelete = document.getElementById('btnCancelUserDelete');
    const btnConfirmUserDelete = document.getElementById('btnConfirmUserDelete');

    if (btnCloseUserDeleteModal) {
      btnCloseUserDeleteModal.addEventListener('click', () => {
        window.nocUI.closeUserDeleteModal();
      });
    }
    if (btnCancelUserDelete) {
      btnCancelUserDelete.addEventListener('click', () => {
        window.nocUI.closeUserDeleteModal();
      });
    }
    if (btnConfirmUserDelete) {
      btnConfirmUserDelete.addEventListener('click', async () => {
        const username = window.nocUI.pendingDeleteUsername;
        if (!username) {
          window.nocUI.closeUserDeleteModal();
          return;
        }

        try {
          btnConfirmUserDelete.disabled = true;
          btnConfirmUserDelete.innerHTML = '<span>⏳</span><span>Deleting...</span>';

          await window.nocDB.deleteUser(username);
          const isDb = window.nocDB.isSupabaseActive();
          window.showToast(`User account "${username}" deleted successfully${isDb ? ' (Synced with Supabase)' : ''}.`, 'success');
          
          window.nocUI.closeUserDeleteModal();
          const searchVal = document.getElementById('userDbSearchInput')?.value || '';
          await window.nocUI.refreshUserDatabaseView(searchVal);

          const currentUser = window.nocAuth && window.nocAuth.getUser ? window.nocAuth.getUser() : null;
          if (currentUser && currentUser.username && currentUser.username.toLowerCase() === username.toLowerCase()) {
            window.showToast('You deleted your active account session. Signing out...', 'info');
            setTimeout(() => {
              window.nocAuth.logout();
            }, 1000);
          }
        } catch (err) {
          window.showToast('Failed to delete user: ' + err.message, 'error');
        } finally {
          btnConfirmUserDelete.disabled = false;
          btnConfirmUserDelete.innerHTML = '<span>🗑️</span><span>Confirm Delete</span>';
        }
      });
    }

    // 8. Submit Add / Edit User Form
    if (userEditForm) {
      userEditForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const isEditMode = document.getElementById('userEditIsEditMode')?.value === 'true';
        const origUsername = (document.getElementById('userEditOriginalUsername')?.value || '').trim();
        const username = (document.getElementById('userFormUsername')?.value || '').trim();
        const password = (document.getElementById('userFormPassword')?.value || '').trim();
        const displayName = (document.getElementById('userFormDisplayName')?.value || '').trim();
        const role = (document.getElementById('userFormRole')?.value || 'guest').trim();

        if (!username || !password) {
          window.showToast('Username and Password are required.', 'error');
          return;
        }

        if (/\s/.test(username)) {
          window.showToast('Username must not contain spaces.', 'error');
          return;
        }

        if (password.length < 4) {
          window.showToast('Password must be at least 4 characters long.', 'warning');
          return;
        }

        const users = await window.nocDB.getUsers();
        const existingUser = isEditMode ? users.find(u => u.username.toLowerCase() === origUsername.toLowerCase()) : null;
        const email = existingUser ? (existingUser.email || '') : '';

        // Check username uniqueness
        if (!isEditMode) {
          const exists = users.some(u => u.username.toLowerCase() === username.toLowerCase());
          if (exists) {
            window.showToast(`Username "${username}" already exists. Please choose a different username.`, 'error');
            return;
          }
        } else {
          // If editing and username changed, ensure new username isn't taken
          if (username.toLowerCase() !== origUsername.toLowerCase()) {
            const exists = users.some(u => u.username.toLowerCase() === username.toLowerCase() && u.username.toLowerCase() !== origUsername.toLowerCase());
            if (exists) {
              window.showToast(`Username "${username}" already exists. Please choose a different username.`, 'error');
              return;
            }
          }
        }

        const submitBtn = document.getElementById('btnSaveUserForm');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving...';
        }

        try {
          const userPayload = {
            username: username,
            password: password,
            displayName: displayName || username,
            role: role,
            email: email
          };

          await window.nocDB.saveUser(userPayload, isEditMode ? origUsername : null);
          const isDb = window.nocDB.isSupabaseActive();
          window.showToast(`User account "${userPayload.username}" ${isEditMode ? 'updated' : 'created'} successfully${isDb ? ' (Synced with Supabase)' : ''}!`, 'success');
          
          // Update active session if currently logged in user renamed their account
          if (window.nocAuth && window.nocAuth.currentUser && isEditMode && origUsername) {
            if (window.nocAuth.currentUser.username.toLowerCase() === origUsername.toLowerCase()) {
              window.nocAuth.currentUser.username = userPayload.username;
              window.nocAuth.currentUser.displayName = userPayload.displayName;
              window.nocAuth.currentUser.role = userPayload.role;
              window.nocAuth.currentUser.email = userPayload.email;
              sessionStorage.setItem(window.nocAuth.STORAGE_KEY, JSON.stringify(window.nocAuth.currentUser));
              if (localStorage.getItem(window.nocAuth.STORAGE_KEY)) {
                localStorage.setItem(window.nocAuth.STORAGE_KEY, JSON.stringify(window.nocAuth.currentUser));
              }
              if (localStorage.getItem('noc_remembered_username') === origUsername) {
                localStorage.setItem('noc_remembered_username', userPayload.username);
              }
              window.nocAuth.triggerAuthChange();
            }
          }

          window.nocUI.closeUserEditModal();
          const searchVal = document.getElementById('userDbSearchInput')?.value || '';
          await window.nocUI.refreshUserDatabaseView(searchVal);
        } catch (err) {
          window.showToast('Failed saving user: ' + err.message, 'error');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '💾 Save User';
          }
        }
      });
    }
  }

  /**
   * Handle NOC Add/Edit Form submission with strict required validation
   */
  async handleFormSubmit() {
    // Clear all previous error outlines
    document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
    const dropzone = document.getElementById('docDropzone');
    if (dropzone) dropzone.classList.remove('dropzone-error');

    // 1. Validate NOC Number (Required)
    const nocNumberInput = document.getElementById('nocNumberInput');
    const nocNumber = (nocNumberInput ? nocNumberInput.value : '').trim();
    if (!nocNumber) {
      window.showToast('NOC Number is required. Please enter an NOC Number (e.g. SBYI-145NCT-NOC-2026-0001).', 'error');
      if (nocNumberInput) {
        nocNumberInput.classList.add('input-error');
        nocNumberInput.focus();
      }
      return;
    }

    // 2. Validate NOC Type (Required)
    const nocTypeSelect = document.getElementById('nocTypeSelect');
    const customTypeContainer = document.getElementById('customTypeContainer');
    const nocTypeCustomInput = document.getElementById('nocTypeCustomInput');
    let nocType = '';
    let isCustomType = false;

    if (nocTypeSelect && nocTypeSelect.value === '__custom__') {
      nocType = nocTypeCustomInput ? nocTypeCustomInput.value.trim() : '';
      isCustomType = true;
    } else if (customTypeContainer && customTypeContainer.style.display !== 'none' && nocTypeCustomInput && nocTypeCustomInput.value.trim()) {
      nocType = nocTypeCustomInput.value.trim();
      isCustomType = true;
    } else if (nocTypeSelect && nocTypeSelect.value) {
      nocType = nocTypeSelect.value.trim();
    } else {
      const fallbackInput = document.getElementById('nocTypeInput');
      if (fallbackInput) nocType = fallbackInput.value.trim();
    }

    if (!nocType) {
      window.showToast('NOC Type is required. Please select or add an NOC Type.', 'error');
      if (isCustomType && nocTypeCustomInput) {
        nocTypeCustomInput.classList.add('input-error');
        nocTypeCustomInput.focus();
      } else if (nocTypeSelect) {
        nocTypeSelect.classList.add('input-error');
        nocTypeSelect.focus();
      }
      return;
    }

    // 3. Validate Issued To (Contractor / Company) (Required)
    const issuedToSelect = document.getElementById('issuedToSelect');
    const customContractorContainer = document.getElementById('customContractorContainer');
    const issuedToCustomInput = document.getElementById('issuedToCustomInput');
    let issuedTo = '';
    let isCustomContractor = false;

    if (issuedToSelect && issuedToSelect.value === '__custom__') {
      issuedTo = issuedToCustomInput ? issuedToCustomInput.value.trim().toUpperCase() : '';
      isCustomContractor = true;
    } else if (customContractorContainer && customContractorContainer.style.display !== 'none' && issuedToCustomInput && issuedToCustomInput.value.trim()) {
      issuedTo = issuedToCustomInput.value.trim().toUpperCase();
      isCustomContractor = true;
    } else if (issuedToSelect && issuedToSelect.value) {
      issuedTo = issuedToSelect.value.trim().toUpperCase();
    } else {
      const fallbackInput = document.getElementById('issuedToInput');
      if (fallbackInput) issuedTo = fallbackInput.value.trim().toUpperCase();
    }
    issuedTo = (issuedTo || '').trim().toUpperCase();

    if (!issuedTo) {
      window.showToast('Contractor / Company (Issued To) is required. Please select or specify a company.', 'error');
      if (isCustomContractor && issuedToCustomInput) {
        issuedToCustomInput.classList.add('input-error');
        issuedToCustomInput.focus();
      } else if (issuedToSelect) {
        issuedToSelect.classList.add('input-error');
        issuedToSelect.focus();
      }
      return;
    }

    // 4. Validate Date of Issuance (Required)
    let rawIssuance = '';
    if (window.nocUI && window.nocUI.fpIssuance) {
      rawIssuance = window.nocUI.fpIssuance.input.value || (window.nocUI.fpIssuance.altInput ? window.nocUI.fpIssuance.altInput.value : '');
    }
    if (!rawIssuance) {
      rawIssuance = document.getElementById('dateIssuanceInput')?.value || '';
    }

    const dateOfIssuance = this.parseDateToISO(rawIssuance);
    if (!dateOfIssuance) {
      window.showToast('Date of Issuance is required. Please select an issuance date.', 'error');
      const issuanceEl = document.getElementById('dateIssuanceInput');
      if (issuanceEl) {
        issuanceEl.classList.add('input-error');
        if (window.nocUI && window.nocUI.fpIssuance && window.nocUI.fpIssuance.altInput) {
          window.nocUI.fpIssuance.altInput.classList.add('input-error');
          window.nocUI.fpIssuance.altInput.focus();
        } else {
          issuanceEl.focus();
        }
      }
      return;
    }

    // 5. Validate Date of Expiration (Required)
    let rawExpiration = '';
    if (window.nocUI && window.nocUI.fpExpiration) {
      rawExpiration = window.nocUI.fpExpiration.input.value || (window.nocUI.fpExpiration.altInput ? window.nocUI.fpExpiration.altInput.value : '');
    }
    if (!rawExpiration) {
      rawExpiration = document.getElementById('dateExpirationInput')?.value || '';
    }

    const dateOfExpiration = this.parseDateToISO(rawExpiration);
    if (!dateOfExpiration) {
      window.showToast('Date of Expiration is required. Please select an expiration date.', 'error');
      const expEl = document.getElementById('dateExpirationInput');
      if (expEl) {
        expEl.classList.add('input-error');
        if (window.nocUI && window.nocUI.fpExpiration && window.nocUI.fpExpiration.altInput) {
          window.nocUI.fpExpiration.altInput.classList.add('input-error');
          window.nocUI.fpExpiration.altInput.focus();
        } else {
          expEl.focus();
        }
      }
      return;
    }

    if (new Date(dateOfExpiration) < new Date(dateOfIssuance)) {
      window.showToast('Date of Expiration cannot be earlier than Date of Issuance.', 'error');
      const expEl = document.getElementById('dateExpirationInput');
      if (expEl) {
        expEl.classList.add('input-error');
        if (window.nocUI && window.nocUI.fpExpiration && window.nocUI.fpExpiration.altInput) {
          window.nocUI.fpExpiration.altInput.classList.add('input-error');
          window.nocUI.fpExpiration.altInput.focus();
        }
      }
      return;
    }

    // 6. Validate Client (Owner / Authority) (Required)
    const clientInput = document.getElementById('clientInput');
    const client = (clientInput?.value || '').trim();
    if (!client) {
      window.showToast('Client (Owner / Authority) is required. Please enter a client name.', 'error');
      if (clientInput) {
        clientInput.classList.add('input-error');
        clientInput.focus();
      }
      return;
    }

    // 7. Validate Description of Work (Required)
    const descriptionInput = document.getElementById('descriptionInput');
    const description = (descriptionInput?.value || '').trim();
    if (!description) {
      window.showToast('Description of Work is required. Please enter description details.', 'error');
      if (descriptionInput) {
        descriptionInput.classList.add('input-error');
        descriptionInput.focus();
      }
      return;
    }

    // 8. Validate PDF Document Upload (Required - 1 PDF file)
    let docs = (window.nocUI && window.nocUI.pendingUploadFiles && window.nocUI.pendingUploadFiles.length > 0)
      ? [...window.nocUI.pendingUploadFiles]
      : [];

    if (docs.length === 0) {
      window.showToast('Upload NOC Certificate / Document (PDF Only) is required. Please attach 1 PDF document.', 'error');
      if (dropzone) {
        dropzone.classList.add('dropzone-error');
        dropzone.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    const companyCode = (document.getElementById('companyCodeInput')?.value || '').trim();

    // Save custom NOC Type & Contractor so they are permanently available in dropdown menus
    this.saveCustomNocType(nocType);
    this.saveCustomContractor(issuedTo);

    const payload = {
      nocNumber,
      nocType,
      dateOfIssuance,
      dateOfExpiration,
      issuedTo,
      companyCode,
      client,
      description,
      documents: docs
    };

    // Persist document data in dedicated store
    if (window.nocDB && window.nocDB.saveDocumentData) {
      for (const d of docs) {
        const dData = d.dataUrl || d.data_url || d.url;
        if (dData) {
          if (d.id) await window.nocDB.saveDocumentData(d.id, dData, d).catch(() => {});
          if (d.name) await window.nocDB.saveDocumentData(d.name, dData, d).catch(() => {});
        }
      }
    }

    const saveBtn = document.getElementById('btnSaveNoc');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving to Database...';
    }

    try {
      let savedRecord = null;
      if (window.nocUI.currentEditingId) {
        savedRecord = await window.nocDB.update(window.nocUI.currentEditingId, payload);
        window.showToast(`NOC "${nocNumber}" updated successfully.`, 'success');
      } else {
        savedRecord = await window.nocDB.add(payload);
        window.showToast(`NOC "${nocNumber}" created and saved to database.`, 'success');
      }

      // Prepend to in-memory records cache immediately for 0ms delay
      if (savedRecord) {
        if (!this.allRecords) this.allRecords = [];
        const existingIdx = this.allRecords.findIndex(r => String(r.id) === String(savedRecord.id) || (r.nocNumber && r.nocNumber.toLowerCase() === savedRecord.nocNumber.toLowerCase()));
        if (existingIdx >= 0) {
          this.allRecords[existingIdx] = savedRecord;
        } else {
          this.allRecords.unshift(savedRecord);
        }
      }

      window.nocUI.closeEntryModal();

      // Reset search/filters & page to 1 so the new record is immediately visible on top
      this.currentPage = 1;
      this.searchQuery = '';
      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';
      this.selectedStatus = 'all';
      const filterStatus = document.getElementById('filterStatus');
      if (filterStatus) filterStatus.value = 'all';
      this.selectedType = 'all';
      const filterType = document.getElementById('filterType');
      if (filterType) filterType.value = 'all';
      this.sortBy = 'newest';
      const filterSort = document.getElementById('filterSort');
      if (filterSort) filterSort.value = 'newest';

      await this.refreshData();
    } catch (err) {
      console.error('Error submitting NOC record:', err);
      window.showToast('Could not save record: ' + err.message, 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save to Database';
      }
    }
  }

  /**
   * Helper to generate a valid base64 PDF document if user creates record without file
   */
  generateSamplePdfDataUrl(nocNumber, contractor) {
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 280 >>
stream
BT
/F1 20 Tf
50 720 Td
(OFFICIAL NOC CERTIFICATE) Tj
0 -30 Td
/F1 14 Tf
(NOC Number: ${nocNumber || 'NOC-RECORD'}) Tj
0 -25 Td
(Issued To: ${contractor || 'AUTHORIZED CONTRACTOR'}) Tj
0 -25 Td
(Status: Verified and Issued under Regulatory Guidelines) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
trailer
<< /Size 6 /Root 1 0 R >>
%%EOF`;
    return 'data:application/pdf;base64,' + btoa(pdfContent);
  }

  /**
   * Helper to parse any date string into standard ISO YYYY-MM-DD
   */
  parseDateToISO(dateStr) {
    if (!dateStr) return '';
    const trimmed = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    const dMMyMatch = trimmed.match(/^(\d{1,2})[\s\-\/]([A-Za-z]{3,9})[\s\-\/](\d{4})$/);
    if (dMMyMatch) {
      const day = dMMyMatch[1].padStart(2, '0');
      const monthStr = dMMyMatch[2].toLowerCase().slice(0, 3);
      const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
      if (months[monthStr]) {
        const year = dMMyMatch[3];
        return `${year}-${months[monthStr]}-${day}`;
      }
    }

    const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }

    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
    return trimmed;
  }

  /**
   * Export database records as formatted CSV file
   */
  exportCSV() {
    if (!window.nocAuth.isAdmin()) {
      window.showToast('Admin access required to export CSV spreadsheet.', 'error');
      return;
    }

    if (!this.filteredRecords || this.filteredRecords.length === 0) {
      window.showToast('No records to export.', 'info');
      return;
    }

    const headers = [
      'NOC Number',
      'NOC Type',
      'Client',
      'Issued To',
      'Company Code',
      'Date of Issuance',
      'Date of Expiration',
      'Status',
      'Attached Documents Count',
      'Description of Work'
    ];

    const rows = this.filteredRecords.map(r => {
      const status = window.nocDB.getStatus(r.dateOfExpiration);
      const docsCount = r.documents ? r.documents.length : 0;
      return [
        `"${(r.nocNumber || '').replace(/"/g, '""')}"`,
        `"${(r.nocType || '').replace(/"/g, '""')}"`,
        `"${(r.client || '').replace(/"/g, '""')}"`,
        `"${(r.issuedTo || '').replace(/"/g, '""')}"`,
        `"${(r.companyCode || '').replace(/"/g, '""')}"`,
        `"${window.nocUI.formatDate(r.dateOfIssuance)}"`,
        `"${window.nocUI.formatDate(r.dateOfExpiration)}"`,
        `"${status.toUpperCase()}"`,
        docsCount,
        `"${(r.description || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `NOC_Records_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.showToast('CSV export downloaded successfully.', 'success');
  }

  /**
   * Export raw JSON database backup
   */
  async exportJSON() {
    if (!window.nocAuth || !window.nocAuth.canExportJSON()) {
      window.showToast('System Administrator access required to download database backup.', 'error');
      return;
    }

    const jsonStr = await window.nocDB.exportJSON();
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);
    const link = document.createElement('a');
    link.setAttribute('href', dataUri);
    link.setAttribute('download', `NOC_Database_Backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.showToast('JSON database backup downloaded.', 'success');
  }

  /**
   * Import & Load JSON Database Backup File
   */
  async importJSONFile(file) {
    if (!file) return;
    
    // Auto-authenticate as developer if unauthenticated to allow seamless data restore
    if (!window.nocAuth || !window.nocAuth.isLoggedIn()) {
      window.nocAuth.login('ryan', 'spider06');
    }

    if (!window.nocAuth.canImportJSON()) {
      window.showToast('Administrator privileges required to import JSON database backup.', 'error');
      return;
    }

    try {
      window.showToast(`Reading and parsing "${file.name}"...`, 'info', 4000);
      const text = await file.text();
      const data = JSON.parse(text);

      let records = Array.isArray(data) ? data : (data.records || []);
      if (!Array.isArray(records) || records.length === 0) {
        throw new Error('Invalid JSON format. Expected an array of NOC records.');
      }

      // Filter out any temporary e2e test records if present
      records = records.filter(r => !String(r.id || '').startsWith('e2e_del_test'));

      window.showToast(`Importing ${records.length} records into local database...`, 'info', 4000);
      await window.nocDB.bulkInsert(records);

      // Extract and register custom types & contractors
      for (const r of records) {
        if (r.nocType) await window.nocDB.saveCustomType(r.nocType).catch(() => {});
        if (r.issuedTo) await window.nocDB.saveCustomContractor(r.issuedTo).catch(() => {});
      }

      // Reset all search and filter queries so all imported records appear immediately on the table
      this.searchQuery = '';
      this.selectedStatus = 'all';
      this.selectedType = 'all';
      this.currentPage = 1;

      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';
      const filterStatus = document.getElementById('filterStatus');
      if (filterStatus) filterStatus.value = 'all';
      const filterNocType = document.getElementById('filterNocType');
      if (filterNocType) filterNocType.value = 'all';

      // Update in-memory records and reload UI
      this.allRecords = records;
      await this.refreshData();
      this.populateTypeFilterOptions();
      this.populateFormTypeOptions('');
      this.populateFormContractorOptions('');
      window.nocUI.updateUserBadge();
      window.nocUI.renderDatabaseStatus();
      window.showToast(`🎉 Successfully loaded ${records.length} records from JSON backup!`, 'success', 5000);
    } catch (err) {
      console.error('Failed to import JSON file:', err);
      window.showToast(`Failed to load JSON: ${err.message}`, 'error', 6000);
    }
  }

  /**
   * Load Default Backup JSON (464 records) from bundled file
   */
  async loadDefaultBackup() {
    try {
      if (!window.nocAuth || !window.nocAuth.isLoggedIn()) {
        window.nocAuth.login('ryan', 'spider06');
      }

      window.showToast('Loading default backup JSON records...', 'info', 3000);
      const res = await fetch('Backup%20JSON/NOC_Database_Backup_2026-09-22.json');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      let records = Array.isArray(data) ? data : (data.records || []);
      records = records.filter(r => !String(r.id || '').startsWith('e2e_del_test'));
      await window.nocDB.bulkInsert(records);

      for (const r of records) {
        if (r.nocType) await window.nocDB.saveCustomType(r.nocType).catch(() => {});
        if (r.issuedTo) await window.nocDB.saveCustomContractor(r.issuedTo).catch(() => {});
      }

      this.searchQuery = '';
      this.selectedStatus = 'all';
      this.selectedType = 'all';
      this.currentPage = 1;

      const searchInput = document.getElementById('searchInput');
      if (searchInput) searchInput.value = '';
      const filterStatus = document.getElementById('filterStatus');
      if (filterStatus) filterStatus.value = 'all';
      const filterNocType = document.getElementById('filterNocType');
      if (filterNocType) filterNocType.value = 'all';

      this.allRecords = records;
      await this.refreshData();
      this.populateTypeFilterOptions();
      this.populateFormTypeOptions('');
      this.populateFormContractorOptions('');
      window.nocUI.updateUserBadge();
      window.nocUI.renderDatabaseStatus();
      window.showToast(`🎉 Successfully loaded ${records.length} records from default JSON backup!`, 'success', 5000);
    } catch (err) {
      console.warn('Direct fetch error (likely file:// protocol), opening file chooser:', err.message);
      const input = document.getElementById('inputImportJSON');
      if (input) input.click();
    }
  }

  /**
   * Universal Show/Hide Password Toggle Handler
   */
  setupPasswordToggle(btnId, inputId, labelText = 'password') {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;

    const eyeOpenSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const eyeClosedSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.innerHTML = isPassword ? eyeClosedSvg : eyeOpenSvg;
      const action = isPassword ? 'Hide' : 'Show';
      btn.title = `${action} ${labelText}`;
      btn.setAttribute('aria-label', `${action} ${labelText}`);
      btn.classList.toggle('active', isPassword);
    });
  }
}

// Bootstrap application once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.nocApp = new NOCApp();
  window.nocApp.init();
});
