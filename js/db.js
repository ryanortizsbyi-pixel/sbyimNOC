/**
 * NOC Portal - Unified Supabase / PostgreSQL Database Storage Engine
 * Handles PostgreSQL queries via Supabase JS SDK with resilient local offline fallback.
 */

const LOCAL_DB_NAME = 'NOC_Portal_DB';
const LOCAL_DB_VERSION = 3;
const LOCAL_STORE_NAME = 'noc_records';
const LOCAL_DOCS_STORE_NAME = 'noc_documents';
const LOCAL_COC_STORE_NAME = 'sbyi_coc_docs';
const LOCAL_REQ_STORE_NAME = 'noc_requirements_docs';
const LOCAL_AI_STORE_NAME = 'ai_documents';

class NOCDatabase {
  constructor() {
    this.localDb = null;
    this._localDbPromise = null;
    this._docMemoryCache = new Map();
    this._realtimeListeners = new Set();
    this._realtimeUnsubscribe = null;
    this._realtimeSubscribed = false;

    // Purge any legacy localStorage main database items (Supabase is single source of truth)
    try {
      localStorage.removeItem('noc_records_v1');
      localStorage.removeItem('noc_records');
    } catch (e) {}

    // Listen to Supabase config/connection changes to re-establish realtime channel if active
    if (typeof window !== 'undefined') {
      window.addEventListener('noc:supabase-config-change', (e) => {
        if (e.detail && e.detail.isConnected) {
          if (this._realtimeListeners.size > 0 && !this._realtimeSubscribed) {
            this._initRealtimeSubscription();
          }
        } else if (e.detail && !e.detail.isConnected) {
          this._realtimeSubscribed = false;
        }
      });
    }

    this.initPromise = this.init();
  }

  /**
   * Initialize local IndexedDB engine for offline / fallback storage
   */
  async initLocalDB() {
    if (this.localDb) return this.localDb;
    if (this._localDbPromise) return this._localDbPromise;

    this._localDbPromise = new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB not supported by browser.');
        resolve(null);
        return;
      }

      const idb = window.indexedDB;
      const request = idb.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(LOCAL_STORE_NAME)) {
          const store = db.createObjectStore(LOCAL_STORE_NAME, { keyPath: 'id' });
          store.createIndex('nocNumber', 'nocNumber', { unique: false });
          store.createIndex('nocType', 'nocType', { unique: false });
          store.createIndex('client', 'client', { unique: false });
          store.createIndex('issuedTo', 'issuedTo', { unique: false });
          store.createIndex('dateOfExpiration', 'dateOfExpiration', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(LOCAL_DOCS_STORE_NAME)) {
          const docStore = db.createObjectStore(LOCAL_DOCS_STORE_NAME, { keyPath: 'id' });
          docStore.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains(LOCAL_COC_STORE_NAME)) {
          const cocStore = db.createObjectStore(LOCAL_COC_STORE_NAME, { keyPath: 'id' });
          cocStore.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains(LOCAL_REQ_STORE_NAME)) {
          const reqStore = db.createObjectStore(LOCAL_REQ_STORE_NAME, { keyPath: 'id' });
          reqStore.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains(LOCAL_AI_STORE_NAME)) {
          const aiStore = db.createObjectStore(LOCAL_AI_STORE_NAME, { keyPath: 'id' });
          aiStore.createIndex('name', 'name', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.localDb = event.target.result;
        resolve(this.localDb);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        resolve(null);
      };
    });

    return this._localDbPromise;
  }

  /**
   * Main database initialization
   */
  async init() {
    await this.initLocalDB();
    await this.purgeLegacyDemoData();

    // Check if Supabase client is configured and test connection
    if (window.supabaseManager && window.supabaseManager.isConfigured()) {
      try {
        const status = await window.supabaseManager.testConnection();
        if (status.success) {
          console.log('⚡ NOCDatabase: Connected to Supabase PostgreSQL database.');
          if (this._realtimeListeners.size > 0 && !this._realtimeSubscribed) {
            this._initRealtimeSubscription();
          }
        } else {
          console.warn('NOCDatabase: Supabase connection note:', status.message);
        }
      } catch (e) {
        console.warn('NOCDatabase: Supabase test connection error:', e);
      }
    } else {
      console.log('NOCDatabase: Supabase not configured. Operating in Local Persistent mode.');
    }
  }

  /**
   * Permanently purge legacy demo/sample NOC records from IndexedDB and localStorage
   */
  async purgeLegacyDemoData() {
    const PURGE_KEY = 'noc_records_purged_clear_all_v5';
    const isPurged = localStorage.getItem(PURGE_KEY);
    if (!isPurged) {
      await this.clearAll().catch((e) => console.warn('Purge clearAll error:', e));
      localStorage.setItem(PURGE_KEY, 'true');
    }

    const demoIds = ['noc_seed_001', 'noc_seed_002', 'noc_seed_003', 'noc_seed_004', 'noc_seed_005'];
    const demoNocNumbers = ['NOC-2026-0042', 'NOC-2026-0118', 'NOC-2025-0891', 'NOC-2026-0205', 'NOC-2026-0310'];

    // 1. Delete legacy demo IDs from IndexedDB
    for (const id of demoIds) {
      await this._localDelete(id).catch(() => {});
    }

    // 2. Permanently purge legacy NOC records from localStorage (Supabase is single source of truth)
    try {
      localStorage.removeItem('noc_records_v1');
      localStorage.removeItem('noc_records');
    } catch (e) {}

    // 3. Delete from Supabase if connected (only once per client session to prevent startup egress)
    const CLOUD_PURGE_KEY = 'noc_records_purged_cloud_v7';
    if (this.isSupabaseActive() && !localStorage.getItem(CLOUD_PURGE_KEY)) {
      try {
        console.log('[Supabase] Running one-time legacy demo data purge');
        const client = this.getSupabaseClient();
        await client.from('noc_records').delete().in('id', demoIds);
        await client.from('noc_records').delete().in('noc_number', demoNocNumbers);
        localStorage.setItem(CLOUD_PURGE_KEY, 'true');
      } catch (e) {
        console.warn('Supabase demo data purge note:', e);
      }
    }

    // 4. Purge legacy demo NOC requirement documents from localStorage, IndexedDB and Supabase
    const demoReqIds = ['req_doc_01', 'req_doc_02', 'req_doc_03', 'req_doc_04', 'req_doc_05'];
    const demoReqNames = [
      'NOC_Application_Checklist_2026.pdf',
      'Site_Safety_Clearance_Protocol.pdf',
      'Engineering_Drawings_Compliance_Standards.pdf',
      'Environmental_Impact_Assessment_Template.pdf',
      'NOC_Regulations_Master_Manual_v3.pdf'
    ];

    try {
      const rawReqs = localStorage.getItem('noc_requirements_documents_v2');
      if (rawReqs) {
        let reqs = JSON.parse(rawReqs);
        if (Array.isArray(reqs)) {
          const filtered = reqs.filter(d => !demoReqIds.includes(d.id) && !demoReqNames.includes(d.name));
          localStorage.setItem('noc_requirements_documents_v2', JSON.stringify(filtered));
        }
      }
    } catch (e) {}

    for (const dId of demoReqIds) {
      await this._localDeleteStoreItem(LOCAL_REQ_STORE_NAME, dId).catch(() => {});
      await this._localDeleteStoreItem(LOCAL_DOCS_STORE_NAME, dId).catch(() => {});
    }

    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        await client.from('noc_requirements_docs').delete().in('id', demoReqIds);
        await client.from('noc_requirements_docs').delete().in('name', demoReqNames);
      } catch (e) {
        console.warn('Supabase req docs demo data purge note:', e);
      }
    }

    // 5. Purge legacy demo SBYI COC documents from localStorage, IndexedDB and Supabase
    const demoCocIds = [
      'coc_doc_01', 'coc_doc_02', 'coc_doc_03', 'coc_doc_04',
      'coc_doc_05', 'coc_doc_06', 'coc_doc_07', 'coc_doc_08'
    ];
    const demoCocNames = [
      'SBYI_Master_Code_of_Conduct_2026.pdf',
      'Contractor_Site_Safety_Rules.pdf',
      'Marine_and_Wildlife_Protection_Policy.pdf',
      'Island_Traffic_and_Logistics_Regulations.pdf',
      'Waste_Management_and_Disposal_Compliance.pdf',
      'Emergency_Response_and_Incident_Reporting.pdf',
      'Worker_Welfare_and_Accommodation_Standards.pdf',
      'Security_Access_and_ID_Badge_Regulations.pdf'
    ];

    try {
      const rawCocs = localStorage.getItem('sbyi_coc_documents_v1');
      if (rawCocs) {
        let cocs = JSON.parse(rawCocs);
        if (Array.isArray(cocs)) {
          const filtered = cocs.filter(d => !demoCocIds.includes(d.id) && !demoCocNames.includes(d.name));
          localStorage.setItem('sbyi_coc_documents_v1', JSON.stringify(filtered));
        }
      }
    } catch (e) {}

    for (const cId of demoCocIds) {
      await this._localDeleteStoreItem(LOCAL_COC_STORE_NAME, cId).catch(() => {});
      await this._localDeleteStoreItem(LOCAL_DOCS_STORE_NAME, cId).catch(() => {});
    }

    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        await client.from('sbyi_coc_docs').delete().in('id', demoCocIds);
        await client.from('sbyi_coc_docs').delete().in('name', demoCocNames);
      } catch (e) {
        console.warn('Supabase coc docs demo data purge note:', e);
      }
    }
  }

  /**
   * Check if active mode is Supabase PostgreSQL
   */
  isSupabaseActive() {
    return Boolean(
      window.supabaseManager && 
      window.supabaseManager.isConfigured() && 
      window.supabaseManager.getClient()
    );
  }

  /**
   * Get active Supabase client instance
   */
  getSupabaseClient() {
    return window.supabaseManager ? window.supabaseManager.getClient() : null;
  }

  // ==========================================================================
  // SCHEMA DATA MAPPERS (PostgreSQL snake_case <-> JavaScript UI camelCase)
  // ==========================================================================

  /**
   * Converts frontend NOC record to PostgreSQL database row
   */
  mapRecordToDb(rec) {
    if (!rec) return null;
    const docs = Array.isArray(rec.documents) ? rec.documents.map(d => ({
      id: d.id || 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: d.name || 'document.pdf',
      type: d.type || 'application/pdf',
      size: Number(d.size || 0),
      dataUrl: d.dataUrl || d.data_url || d.url || '',
      uploadedAt: d.uploadedAt || d.uploaded_at || new Date().toISOString()
    })) : [];

    return {
      id: rec.id || 'noc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      noc_number: (rec.nocNumber || '').trim(),
      noc_type: rec.nocType || 'Activity',
      client: (rec.client || '').trim(),
      issued_to: (rec.issuedTo || '').trim().toUpperCase(),
      company_code: (rec.companyCode || '').trim(),
      date_of_issuance: rec.dateOfIssuance,
      date_of_expiration: rec.dateOfExpiration,
      description: rec.description || '',
      documents: docs,
      created_at: rec.createdAt || new Date().toISOString(),
      updated_at: rec.updatedAt || new Date().toISOString()
    };
  }

  /**
   * Converts PostgreSQL database row to frontend NOC record
   */
  mapDbToRecord(row) {
    if (!row) return null;
    let rawDocs = [];
    if (Array.isArray(row.documents)) {
      rawDocs = row.documents;
    } else if (typeof row.documents === 'string') {
      try {
        rawDocs = JSON.parse(row.documents || '[]');
      } catch (e) {
        rawDocs = [];
      }
    }

    const docs = rawDocs.map(d => ({
      id: d.id || 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: d.name || 'document.pdf',
      type: d.type || 'application/pdf',
      size: Number(d.size || 0),
      dataUrl: d.dataUrl || d.data_url || d.url || d.fileUrl || '',
      uploadedAt: d.uploadedAt || d.uploaded_at || new Date().toISOString()
    }));

    return {
      id: String(row.id),
      nocNumber: row.noc_number || row.nocNumber,
      nocType: row.noc_type || row.nocType || 'Activity',
      client: row.client || '',
      issuedTo: (row.issued_to || row.issuedTo || '').trim().toUpperCase(),
      companyCode: row.company_code || row.companyCode || '',
      dateOfIssuance: row.date_of_issuance || row.dateOfIssuance,
      dateOfExpiration: row.date_of_expiration || row.dateOfExpiration,
      description: row.description || '',
      documents: docs,
      createdAt: row.created_at || row.createdAt,
      updatedAt: row.updated_at || row.updatedAt
    };
  }

  /**
   * Maps Requirements Doc frontend model to PostgreSQL row
   */
  mapReqDocToDb(doc) {
    return {
      id: doc.id || 'req_doc_' + Date.now(),
      name: doc.name || 'Untitled Document',
      type: doc.type || 'application/pdf',
      size: Number(doc.size || 0),
      data_url: doc.dataUrl || doc.data_url || '',
      uploaded_at: doc.uploadedAt || doc.uploaded_at || new Date().toISOString(),
      uploaded_by: doc.uploadedBy || doc.uploaded_by || 'System Administrator'
    };
  }

  /**
   * Maps PostgreSQL row to frontend Requirements Doc model
   */
  mapDbToReqDoc(row) {
    return {
      id: String(row.id),
      name: row.name,
      type: row.type,
      size: Number(row.size || 0),
      dataUrl: row.data_url || row.dataUrl,
      uploadedAt: row.uploaded_at || row.uploadedAt,
      uploadedBy: row.uploaded_by || row.uploadedBy || 'System Administrator'
    };
  }

  /**
   * Maps SBYI COC Doc frontend model to PostgreSQL row
   */
  mapCocDocToDb(doc) {
    return {
      id: doc.id || 'coc_doc_' + Date.now(),
      name: doc.name || 'Untitled Document.pdf',
      type: 'application/pdf',
      size: Number(doc.size || 0),
      data_url: doc.dataUrl || doc.data_url || '',
      uploaded_at: doc.uploadedAt || doc.uploaded_at || new Date().toISOString(),
      uploaded_by: doc.uploadedBy || doc.uploaded_by || 'SBYI Management'
    };
  }

  /**
   * Maps PostgreSQL row to frontend SBYI COC Doc model
   */
  mapDbToCocDoc(row) {
    return {
      id: String(row.id),
      name: row.name,
      type: 'application/pdf',
      size: Number(row.size || 0),
      dataUrl: row.data_url || row.dataUrl,
      uploadedAt: row.uploaded_at || row.uploadedAt,
      uploadedBy: row.uploaded_by || row.uploadedBy || 'SBYI Management'
    };
  }

  /**
   * Maps AI Document frontend model to PostgreSQL row
   */
  mapAiDocToDb(doc) {
    return {
      id: doc.id || 'ai_doc_' + Date.now(),
      name: doc.name || 'Untitled Document',
      type: doc.type || 'application/pdf',
      size: Number(doc.size || 0),
      data_url: doc.dataUrl || doc.data_url || '',
      uploaded_at: doc.uploadedAt || doc.uploaded_at || new Date().toISOString(),
      uploaded_by: doc.uploadedBy || doc.uploaded_by || 'System Administrator'
    };
  }

  /**
   * Maps PostgreSQL row to frontend AI Document model
   */
  mapDbToAiDoc(row) {
    return {
      id: String(row.id),
      name: row.name,
      type: row.type || 'application/pdf',
      size: Number(row.size || 0),
      dataUrl: row.data_url || row.dataUrl,
      uploadedAt: row.uploaded_at || row.uploadedAt,
      uploadedBy: row.uploaded_by || row.uploadedBy || 'System Administrator'
    };
  }

  /**
   * Maps User frontend model to PostgreSQL row
   */
  mapUserToDb(user) {
    return {
      username: user.username,
      password: user.password,
      role: user.role || 'guest',
      display_name: user.displayName || user.display_name || user.username,
      email: user.email || ''
    };
  }

  /**
   * Maps PostgreSQL row to frontend User model
   */
  mapDbToUser(row) {
    return {
      username: row.username,
      password: row.password,
      role: row.role || 'guest',
      displayName: row.display_name || row.displayName || row.username,
      email: row.email || ''
    };
  }

  // ==========================================================================
  // CORE NOC RECORD OPERATIONS
  // ==========================================================================

  /**
   * Retrieve all NOC records.
   * Supabase PostgreSQL serves as the SINGLE SOURCE OF TRUTH.
   * When Supabase is connected, records are queried directly from Supabase.
   */
  async getAll() {
    if (this.isSupabaseActive()) {
      try {
        console.log('[Supabase] Fetching NOC records (lightweight metadata)');
        const { data, error } = await client
          .from('noc_records')
          .select('id, noc_number, noc_type, client, issued_to, company_code, date_of_issuance, date_of_expiration, description, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(5000);

        if (error) throw error;

        // When Supabase query succeeds, Supabase data IS the single source of truth
        if (data && Array.isArray(data)) {
          const cloudRecords = data.map(row => this.mapDbToRecord(row));

          // Resolve attached document dataUrls from memory cache or document store
          for (const r of cloudRecords) {
            if (r && Array.isArray(r.documents)) {
              for (const d of r.documents) {
                if (!d.dataUrl) {
                  const dData = this._docMemoryCache.get(String(d.id)) || this._docMemoryCache.get(String(d.name));
                  if (dData) d.dataUrl = dData;
                } else {
                  if (d.id) this._docMemoryCache.set(String(d.id), d.dataUrl);
                  if (d.name) this._docMemoryCache.set(String(d.name), d.dataUrl);
                }
              }
            }
          }

          // Sync local IndexedDB cache store so offline fallback accurately mirrors Supabase (removing deleted records)
          this._localSetStoreItems(LOCAL_STORE_NAME, cloudRecords).catch(() => {});

          return cloudRecords;
        }

        return [];
      } catch (err) {
        console.warn('Supabase getAll failed, falling back to local DB cache:', err.message);
      }
    }

    // Local IndexedDB Fallback (only when offline or Supabase not configured)
    let localRecords = [];
    try {
      localRecords = await this._localGetAll();
    } catch (e) {
      console.warn('Error fetching local records in getAll:', e);
    }
    return localRecords || [];
  }

  /**
   * Subscribe to Supabase Realtime changes on the NOC records table.
   *
   * Realtime Event Lifecycle:
   * - Listens for INSERT, UPDATE, and DELETE events from Supabase Realtime broadcast.
   * - After every realtime event, automatically fetches the latest NOC records from Supabase (single source of truth).
   * - Automatically recalculates Total NOC Records, Active Permits, Expiring Soon, and Expired Permits.
   * - Updates all registered subscriber callbacks without requiring a page refresh.
   * - Returns a clean unsubscribe function to call when the component unmounts.
   *
   * @param {Function} [callback] Optional listener ({ records, stats, payload }) => void
   * @returns {Function} Unsubscribe cleanup function to call on unmount
   */
  subscribeToRealtimeRecords(callback = null) {
    if (typeof callback === 'function') {
      this._realtimeListeners.add(callback);
    }

    if (!this._realtimeSubscribed && this.isSupabaseActive()) {
      this._initRealtimeSubscription();
    }

    // Return cleanup function (can be directly returned in React useEffect or called on unmount)
    return () => {
      if (typeof callback === 'function') {
        this._realtimeListeners.delete(callback);
      }
      if (this._realtimeListeners.size === 0) {
        this.unsubscribeRealtime();
      }
    };
  }

  /**
   * Initialize Supabase Realtime channel subscription on noc_records table
   */
  _initRealtimeSubscription() {
    if (!window.supabaseManager || !this.isSupabaseActive()) return;

    this._realtimeSubscribed = true;
    console.log('⚡ Initializing Supabase Realtime channel subscription on noc_records table...');

    const unsubscribe = window.supabaseManager.subscribeToTable(
      'noc_records_realtime_channel',
      'noc_records',
      async (payload) => {
        console.log(`⚡ [Realtime Event: noc_records] Action: ${payload.eventType}`, payload);

        try {
          const eventType = payload.eventType;
          let newRecord = null;
          let oldRecord = payload.old || null;
          let deletedId = null;

          if (eventType === 'INSERT' && payload.new) {
            newRecord = this.mapDbToRecord(payload.new);
            await this._localPut(newRecord).catch(() => {});
          } else if (eventType === 'UPDATE' && payload.new) {
            newRecord = this.mapDbToRecord(payload.new);
            await this._localPut(newRecord).catch(() => {});
          } else if (eventType === 'DELETE' && payload.old) {
            deletedId = payload.old.id || payload.old.noc_number;
            if (deletedId) {
              await this._localDelete(deletedId).catch(() => {});
            }
          }

          // Invoke all registered callbacks with targeted event payload (ZERO full-table refetch needed)
          for (const listener of this._realtimeListeners) {
            try {
              listener({ eventType, newRecord, oldRecord, deletedId, payload });
            } catch (err) {
              console.error('Error in realtime listener callback:', err);
            }
          }

          // Broadcast window event
          window.dispatchEvent(new CustomEvent('noc:realtime-records-change', {
            detail: { eventType, newRecord, oldRecord, deletedId, payload }
          }));
        } catch (eventErr) {
          console.error('Failed to process realtime event:', eventErr);
        }
      },
      (status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('⚡ Supabase Realtime channel subscribed successfully for table noc_records.');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`Supabase Realtime channel warning (${status}):`, err);
        }
      }
    );

    this._realtimeUnsubscribe = unsubscribe;
  }

  /**
   * Unsubscribe and clean up Supabase Realtime subscription on noc_records
   */
  unsubscribeRealtime() {
    this._realtimeSubscribed = false;
    if (typeof this._realtimeUnsubscribe === 'function') {
      try {
        this._realtimeUnsubscribe();
      } catch (e) {}
      this._realtimeUnsubscribe = null;
    }
    if (window.supabaseManager) {
      window.supabaseManager.unsubscribeChannel('noc_records_realtime_channel');
    }
  }

  /**
   * Retrieve a single NOC record by ID.
   */
  async getById(id) {
    if (this.isSupabaseActive()) {
      try {
        console.log(`[Supabase] Fetching single NOC record with full documents (id: ${id})`);
        const client = this.getSupabaseClient();
        const { data, error } = await client
          .from('noc_records')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          const cloudRec = this.mapDbToRecord(data);
          const localRec = await this._localGetById(id).catch(() => null);
          if (localRec && Array.isArray(localRec.documents)) {
            cloudRec.documents = (cloudRec.documents || []).map(cd => {
              if (!cd.dataUrl) {
                const ld = localRec.documents.find(d => d.id === cd.id || d.name === cd.name);
                if (ld && ld.dataUrl) return { ...cd, dataUrl: ld.dataUrl };
              }
              return cd;
            });
            if (cloudRec.documents.length === 0 && localRec.documents.length > 0) {
              cloudRec.documents = localRec.documents;
            }
          }
          return cloudRec;
        }
      } catch (err) {
        console.warn('Supabase getById failed, falling back to local DB:', err.message);
      }
    }

    return this._localGetById(id);
  }

  /**
   * Find an NOC record by its NOC Number.
   */
  async getByNocNumber(nocNumber) {
    if (!nocNumber) return null;
    const cleanNum = nocNumber.trim();

    if (this.isSupabaseActive()) {
      try {
        console.log(`[Supabase] Checking single NOC record by number (nocNumber: ${cleanNum})`);
        const client = this.getSupabaseClient();
        const { data, error } = await client
          .from('noc_records')
          .select('*')
          .ilike('noc_number', cleanNum)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          const cloudRec = this.mapDbToRecord(data);
          const localRec = await this._localGetByNocNumber(cleanNum).catch(() => null);
          if (localRec && Array.isArray(localRec.documents)) {
            cloudRec.documents = (cloudRec.documents || []).map(cd => {
              if (!cd.dataUrl) {
                const ld = localRec.documents.find(d => d.id === cd.id || d.name === cd.name);
                if (ld && ld.dataUrl) return { ...cd, dataUrl: ld.dataUrl };
              }
              return cd;
            });
            if (cloudRec.documents.length === 0 && localRec.documents.length > 0) {
              cloudRec.documents = localRec.documents;
            }
          }
          return cloudRec;
        }
      } catch (err) {
        console.warn('Supabase getByNocNumber failed, checking local DB:', err.message);
      }
    }

    return this._localGetByNocNumber(cleanNum);
  }

  /**
   * Add a new NOC record into the database.
   */
  async add(record) {
    // Check for duplicate NOC Number
    const existing = await this.getByNocNumber(record.nocNumber);
    if (existing) {
      throw new Error(`An NOC with Number "${record.nocNumber}" already exists.`);
    }

    const newRecord = {
      ...record,
      id: record.id || 'noc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      createdAt: record.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      documents: record.documents || []
    };

    if (this.isSupabaseActive()) {
      try {
        console.log(`[Supabase] Inserting new NOC record (nocNumber: ${newRecord.nocNumber})`);
        const client = this.getSupabaseClient();
        const dbPayload = this.mapRecordToDb(newRecord);
        const { data, error } = await client
          .from('noc_records')
          .insert(dbPayload)
          .select()
          .single();

        if (error) {
          console.warn('Supabase add error:', error.message);
        } else if (data) {
          const mapped = this.mapDbToRecord(data);
          if (newRecord.documents && Array.isArray(newRecord.documents) && newRecord.documents.length > 0) {
            mapped.documents = newRecord.documents;
          }
          await this._localPut(mapped).catch(() => {});
          return mapped;
        }
      } catch (err) {
        console.warn('Supabase add failed, storing in local DB:', err.message);
      }
    }

    // Always save into local IndexedDB
    await this._localPut(newRecord);
    return newRecord;
  }

  /**
   * Update an existing NOC record.
   */
  async update(id, updatedFields) {
    let existing = await this.getById(id);
    if (!existing && window.nocApp && Array.isArray(window.nocApp.allRecords)) {
      existing = window.nocApp.allRecords.find(r => String(r.id) === String(id) || (r.nocNumber && String(r.nocNumber).trim().toLowerCase() === String(id).trim().toLowerCase()));
    }
    if (!existing && updatedFields && updatedFields.nocNumber) {
      existing = await this.getByNocNumber(updatedFields.nocNumber);
    }
    if (!existing) {
      // If still not found by ID or NOC Number, check local IndexedDB directly
      existing = await this._localGetById(id);
    }
    if (!existing) {
      // Create fallback baseline record if missing in DB so user data is never lost
      existing = {
        id: id || 'noc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        nocNumber: updatedFields.nocNumber || 'NOC-RECORD',
        createdAt: new Date().toISOString(),
        documents: []
      };
    }

    // Check if new NOC Number conflicts with another record
    if (updatedFields.nocNumber && existing.nocNumber && updatedFields.nocNumber.trim().toLowerCase() !== existing.nocNumber.trim().toLowerCase()) {
      const duplicate = await this.getByNocNumber(updatedFields.nocNumber);
      if (duplicate && String(duplicate.id) !== String(existing.id) && String(duplicate.id) !== String(id)) {
        throw new Error(`NOC Number "${updatedFields.nocNumber}" is already in use by another record.`);
      }
    }

    const mergedRecord = {
      ...existing,
      ...updatedFields,
      id: existing.id || id,
      updatedAt: new Date().toISOString()
    };

    if (this.isSupabaseActive()) {
      try {
        console.log(`[Supabase] Updating NOC record (id: ${id})`);
        const client = this.getSupabaseClient();
        const dbPayload = this.mapRecordToDb(mergedRecord);
        const { data, error } = await client
          .from('noc_records')
          .upsert(dbPayload, { onConflict: 'id' })
          .select()
          .single();

        if (error) {
          console.warn('Supabase update upsert note:', error.message);
        } else if (data) {
          const mapped = this.mapDbToRecord(data);
          if (mergedRecord.documents && Array.isArray(mergedRecord.documents) && mergedRecord.documents.length > 0) {
            mapped.documents = mergedRecord.documents;
          }
          await this._localPut(mapped).catch(() => {});
          return mapped;
        }
      } catch (err) {
        console.warn('Supabase update failed, storing in local DB:', err.message);
      }
    }

    // Always update in local IndexedDB
    await this._localPut(mergedRecord);
    return mergedRecord;
  }

  /**
   * Delete an NOC record permanently from both Supabase PostgreSQL and Local Database.
   */
  async delete(id) {
    if (!id && id !== 0) return false;

    // 1. Identify all record identifiers (id, nocNumber, attached docIds, storagePaths)
    let targetNocNumber = null;
    let recordToDelete = null;
    const docIds = [];
    const docStoragePaths = [];

    if (window.nocApp && Array.isArray(window.nocApp.allRecords)) {
      recordToDelete = window.nocApp.allRecords.find(r => 
        String(r.id) === String(id) || 
        String(r.nocNumber) === String(id) ||
        (r.noc_number && String(r.noc_number) === String(id))
      ) || null;
    }

    if (!recordToDelete) {
      try {
        recordToDelete = await this.getById(id);
      } catch (e) {}
    }

    if (recordToDelete) {
      targetNocNumber = recordToDelete.nocNumber || recordToDelete.noc_number || null;
      if (Array.isArray(recordToDelete.documents)) {
        recordToDelete.documents.forEach(d => {
          if (d && d.id) docIds.push(String(d.id));
          if (d && d.name) docIds.push(String(d.name));
          const urlStr = d.dataUrl || d.data_url || d.url || '';
          if (urlStr && urlStr.includes('supabase.co/storage')) {
            const parts = urlStr.split('/noc-documents/');
            if (parts[1]) docStoragePaths.push(parts[1].split('?')[0]);
          }
        });
      }
    }

    // 2. Permanently delete from Supabase PostgreSQL cloud database if active
    if (this.isSupabaseActive()) {
      try {
        console.log(`[Supabase] Deleting NOC record (id: ${id})`);
        const client = this.getSupabaseClient();
        if (client) {
          // A. Delete by exact ID (string)
          const { error: errId } = await client
            .from('noc_records')
            .delete()
            .eq('id', String(id));
          if (errId) {
            console.warn('Supabase delete by ID note:', errId.message);
          }

          // B. If ID is numeric, also attempt delete by number
          if (typeof id === 'number' || (!isNaN(Number(id)) && Number(id) > 0)) {
            await client
              .from('noc_records')
              .delete()
              .eq('id', Number(id))
              .catch(() => {});
          }

          // C. Delete by noc_number to ensure complete cleanup in PostgreSQL table
          if (targetNocNumber) {
            const cleanNoc = String(targetNocNumber).trim();
            const { error: errNoc } = await client
              .from('noc_records')
              .delete()
              .eq('noc_number', cleanNoc);
            if (errNoc) {
              console.warn('Supabase delete by noc_number note:', errNoc.message);
            }
          }

          // D. Delete attached documents from Supabase storage bucket if any
          if (docStoragePaths.length > 0) {
            try {
              await client.storage.from('noc-documents').remove(docStoragePaths);
            } catch (storErr) {
              console.warn('Supabase storage doc cleanup note:', storErr.message);
            }
          }
        }
      } catch (err) {
        console.warn('Supabase delete operation note:', err.message);
      }
    }

    // 3. Permanently delete from Local IndexedDB, localStorage backup, and in-memory caches
    return this._localDelete(id, targetNocNumber, docIds);
  }

  /**
   * Bulk delete multiple NOC records by IDs permanently from both Supabase PostgreSQL and Local Database.
   */
  async bulkDelete(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;

    const strIds = ids.map(i => String(i));
    const targetNocNumbers = [];
    const docIds = [];
    const docStoragePaths = [];

    if (window.nocApp && Array.isArray(window.nocApp.allRecords)) {
      window.nocApp.allRecords.forEach(r => {
        if (strIds.includes(String(r.id)) || (r.nocNumber && strIds.includes(String(r.nocNumber)))) {
          if (r.nocNumber) targetNocNumbers.push(r.nocNumber);
          if (r.noc_number) targetNocNumbers.push(r.noc_number);
          if (Array.isArray(r.documents)) {
            r.documents.forEach(d => {
              if (d && d.id) docIds.push(String(d.id));
              if (d && d.name) docIds.push(String(d.name));
              const urlStr = d.dataUrl || d.data_url || d.url || '';
              if (urlStr && urlStr.includes('supabase.co/storage')) {
                const parts = urlStr.split('/noc-documents/');
                if (parts[1]) docStoragePaths.push(parts[1].split('?')[0]);
              }
            });
          }
        }
      });
    }

    if (this.isSupabaseActive()) {
      try {
        console.log(`[Supabase] Bulk deleting NOC records (count: ${ids.length})`);
        const client = this.getSupabaseClient();
        if (client) {
          // Delete by IDs
          const { error: err1 } = await client
            .from('noc_records')
            .delete()
            .in('id', strIds);
          if (err1) {
            console.warn('Supabase bulkDelete by id note:', err1.message);
          }

          // Delete by noc_numbers
          if (targetNocNumbers.length > 0) {
            const { error: err2 } = await client
              .from('noc_records')
              .delete()
              .in('noc_number', targetNocNumbers);
            if (err2) {
              console.warn('Supabase bulkDelete by noc_number note:', err2.message);
            }
          }

          // Clean Supabase storage objects if any
          if (docStoragePaths.length > 0) {
            try {
              await client.storage.from('noc-documents').remove(docStoragePaths);
            } catch (storErr) {
              console.warn('Supabase storage bulk doc cleanup note:', storErr.message);
            }
          }
        }
      } catch (err) {
        console.warn('Supabase bulkDelete note:', err.message);
      }
    }

    return this._localBulkDelete(ids, targetNocNumbers, docIds);
  }

  /**
   * Bulk insert/upsert records.
   */
  async bulkInsert(records) {
    if (!records || records.length === 0) return true;

    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        const dbRows = records.map(r => this.mapRecordToDb(r));
        const BATCH_SIZE = 5;
        for (let i = 0; i < dbRows.length; i += BATCH_SIZE) {
          const batch = dbRows.slice(i, i + BATCH_SIZE);
          try {
            const { error } = await client
              .from('noc_records')
              .upsert(batch, { onConflict: 'id' });
            if (error) throw error;
          } catch (batchErr) {
            console.warn(`Supabase bulkInsert batch error (${i}-${i + batch.length}), retrying row-by-row:`, batchErr.message);
            for (const singleRow of batch) {
              await client.from('noc_records').upsert(singleRow, { onConflict: 'id' }).catch(e => console.warn('Single row insert note:', e.message));
            }
          }
        }
      } catch (err) {
        console.warn('Supabase bulkInsert failed, writing locally:', err.message);
      }
    }

    // Save locally
    return this._localBulkInsert(records);
  }

  /**
   * Clear all records in the database.
   */
  async clearAll() {
    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        const { error } = await client
          .from('noc_records')
          .delete()
          .neq('id', '___none___');

        if (error) {
          console.warn('Supabase clearAll neq note, trying gte:', error.message);
          await client.from('noc_records').delete().gte('created_at', '1970-01-01');
        }
      } catch (err) {
        console.warn('Supabase clearAll failed:', err.message);
      }
    }

    return this._localClearAll();
  }

  // ==========================================================================
  // NOC REQUIREMENTS DOCUMENTS (Max 5 Documents)
  // ==========================================================================

  /**
   * Get all stored NOC Requirements Documents (PDF, Word, Images, max 5)
   */
  async getRequirementsDocs() {
    if (Array.isArray(this._cachedRequirementsDocs) && this._cachedRequirementsDocs.length > 0) {
      return this._cachedRequirementsDocs;
    }

    if (this.isSupabaseActive()) {
      try {
        console.log('[Supabase] Fetching requirements documents metadata');
        const client = this.getSupabaseClient();
        const { data, error } = await client
          .from('noc_requirements_docs')
          .select('*')
          .order('uploaded_at', { ascending: false })
          .limit(5);

        if (error) throw error;
        if (data && data.length > 0) {
          const list = data.map(row => this.mapDbToReqDoc(row));
          for (const doc of list) {
            if (doc.dataUrl) {
              await this.saveDocumentData(doc.id, doc.dataUrl, doc);
              await this.saveDocumentData(doc.name, doc.dataUrl, doc);
            } else {
              const dData = await this.getDocumentData(doc.id) || await this.getDocumentData(doc.name);
              if (dData) doc.dataUrl = dData;
            }
          }
          this._cachedRequirementsDocs = list;
          await this._localSetStoreItems(LOCAL_REQ_STORE_NAME, list);
          return list;
        }
      } catch (err) {
        console.warn('Supabase getRequirementsDocs failed, reading local:', err.message);
      }
    }

    // Read from IndexedDB dedicated store
    try {
      const localDocs = await this._localGetStoreItems(LOCAL_REQ_STORE_NAME);
      if (Array.isArray(localDocs) && localDocs.length > 0) {
        for (const doc of localDocs) {
          if (!doc.dataUrl) {
            const dData = await this.getDocumentData(doc.id) || await this.getDocumentData(doc.name);
            if (dData) doc.dataUrl = dData;
          } else {
            this._docMemoryCache.set(String(doc.id), doc.dataUrl);
            if (doc.name) this._docMemoryCache.set(String(doc.name), doc.dataUrl);
          }
        }
        this._cachedRequirementsDocs = localDocs;
        return localDocs;
      }
    } catch (e) {
      console.warn('Could not read Requirements docs from IndexedDB:', e);
    }

    // Fallback to localStorage
    try {
      const stored = localStorage.getItem('noc_requirements_documents_v2');
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const doc of parsed) {
            if (!doc.dataUrl) {
              const dData = await this.getDocumentData(doc.id) || await this.getDocumentData(doc.name);
              if (dData) doc.dataUrl = dData;
            }
          }
          this._cachedRequirementsDocs = parsed;
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read requirements from localStorage', e);
    }
    
    const initialSeed = window.DEFAULT_NOC_REQUIREMENTS_DOCS || [];
    this._cachedRequirementsDocs = initialSeed;
    return initialSeed;
  }

  /**
   * Save NOC Requirements Documents list (Enforcing 5 maximum)
   */
  async saveRequirementsDocs(docs) {
    const clamped = (docs || []).slice(0, 5);
    this._cachedRequirementsDocs = clamped;

    // 1. Immediately persist binaries and metadata into IndexedDB
    for (const d of clamped) {
      const dData = d.dataUrl || d.data_url || d.url;
      if (dData) {
        if (d.id) await this.saveDocumentData(d.id, dData, d);
        if (d.name) await this.saveDocumentData(d.name, dData, d);
      }
    }
    await this._localSetStoreItems(LOCAL_REQ_STORE_NAME, clamped);

    // 2. Persist to Supabase if active (using robust row-by-row upserts and removing deleted items)
    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        const dbRows = clamped.map(d => this.mapReqDocToDb(d));
        const currentIds = clamped.map(d => String(d.id));

        // Get existing rows in database to cleanly delete removed ones
        const { data: existingRows } = await client.from('noc_requirements_docs').select('id');
        if (existingRows && existingRows.length > 0) {
          const toDelete = existingRows.filter(r => !currentIds.includes(String(r.id))).map(r => r.id);
          if (toDelete.length > 0) {
            await client.from('noc_requirements_docs').delete().in('id', toDelete);
          }
        }

        // Upsert each document row individually to avoid payload timeout or body limit failures
        for (const row of dbRows) {
          try {
            const { error: upsertErr } = await client
              .from('noc_requirements_docs')
              .upsert(row, { onConflict: 'id' });
            if (upsertErr) {
              console.warn(`Supabase upsert note for requirement doc ${row.name}:`, upsertErr.message);
            }
          } catch (rowErr) {
            console.warn('Supabase requirement doc row upsert error:', rowErr);
          }
        }
      } catch (err) {
        console.warn('Supabase saveRequirementsDocs failed, saved locally in IndexedDB:', err.message);
      }
    }

    // 3. Save safe copy to localStorage (with quota safety)
    try {
      localStorage.setItem('noc_requirements_documents_v2', JSON.stringify(clamped));
    } catch (e) {
      try {
        const safeMetadataList = clamped.map(d => ({
          id: d.id,
          name: d.name,
          type: d.type || 'application/pdf',
          size: d.size,
          uploadedAt: d.uploadedAt,
          uploadedBy: d.uploadedBy,
          dataUrl: '' // dataUrl is safely stored in IndexedDB
        }));
        localStorage.setItem('noc_requirements_documents_v2', JSON.stringify(safeMetadataList));
      } catch (e2) {
        console.warn('Could not write requirements metadata to localStorage:', e2);
      }
    }

    // Auto-sync AI Knowledge Base
    if (window.sbyimKnowledgeBase) {
      window.sbyimKnowledgeBase.syncKnowledgeBase().then(() => {
        if (window.sbyimAIUI) window.sbyimAIUI.updateKnowledgeStatusBadge();
      }).catch(() => {});
    }

    return clamped;
  }

  /**
   * Delete a single requirements document by ID
   */
  async deleteRequirementsDoc(id) {
    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        await client.from('noc_requirements_docs').delete().eq('id', id);
      } catch (err) {
        console.warn('Supabase deleteRequirementsDoc failed:', err.message);
      }
    }

    await this._localDeleteStoreItem(LOCAL_REQ_STORE_NAME, id);
    const docs = await this.getRequirementsDocs();
    const filtered = docs.filter(d => String(d.id) !== String(id));
    this._cachedRequirementsDocs = filtered;
    return await this.saveRequirementsDocs(filtered);
  }

  /**
   * Delete all requirements documents
   */
  async deleteAllRequirementsDocs() {
    this._cachedRequirementsDocs = [];
    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        await client.from('noc_requirements_docs').delete().neq('id', '___none___');
      } catch (err) {
        console.warn('Supabase deleteAllRequirementsDocs failed:', err.message);
      }
    }

    await this._localClearStore(LOCAL_REQ_STORE_NAME);

    try {
      localStorage.setItem('noc_requirements_documents_v2', '[]');
    } catch (e) {}

    // Auto-sync AI Knowledge Base
    if (window.sbyimKnowledgeBase) {
      window.sbyimKnowledgeBase.syncKnowledgeBase().then(() => {
        if (window.sbyimAIUI) window.sbyimAIUI.updateKnowledgeStatusBadge();
      }).catch(() => {});
    }

    return [];
  }

  // ==========================================================================
  // SBYI COC (CODE OF CONDUCT) DOCUMENTS (Max 8 PDF Documents)
  // ==========================================================================

  /**
   * Get all stored SBYI COC Documents (PDF only, max 8)
   */
  async getCocDocs() {
    if (Array.isArray(this._cachedCocDocs) && this._cachedCocDocs.length > 0) {
      return this._cachedCocDocs;
    }

    if (this.isSupabaseActive()) {
      try {
        console.log('[Supabase] Fetching SBYI COC documents metadata');
        const client = this.getSupabaseClient();
        const { data, error } = await client
          .from('sbyi_coc_docs')
          .select('*')
          .order('uploaded_at', { ascending: false })
          .limit(8);

        if (error) throw error;
        if (data && data.length > 0) {
          const list = data.map(row => this.mapDbToCocDoc(row));
          for (const doc of list) {
            if (doc.dataUrl) {
              await this.saveDocumentData(doc.id, doc.dataUrl, doc);
              await this.saveDocumentData(doc.name, doc.dataUrl, doc);
            } else {
              const dData = await this.getDocumentData(doc.id) || await this.getDocumentData(doc.name);
              if (dData) doc.dataUrl = dData;
            }
          }
          this._cachedCocDocs = list;
          await this._localSetStoreItems(LOCAL_COC_STORE_NAME, list);
          return list;
        }
      } catch (err) {
        console.warn('Supabase getCocDocs failed, reading local:', err.message);
      }
    }

    // Read from IndexedDB dedicated store
    try {
      const localDocs = await this._localGetStoreItems(LOCAL_COC_STORE_NAME);
      if (Array.isArray(localDocs) && localDocs.length > 0) {
        for (const doc of localDocs) {
          if (!doc.dataUrl) {
            const dData = await this.getDocumentData(doc.id) || await this.getDocumentData(doc.name);
            if (dData) doc.dataUrl = dData;
          } else {
            this._docMemoryCache.set(String(doc.id), doc.dataUrl);
            if (doc.name) this._docMemoryCache.set(String(doc.name), doc.dataUrl);
          }
        }
        this._cachedCocDocs = localDocs;
        return localDocs;
      }
    } catch (e) {
      console.warn('Could not read COC docs from IndexedDB:', e);
    }

    // Fallback to localStorage
    try {
      const stored = localStorage.getItem('sbyi_coc_documents_v1');
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const doc of parsed) {
            if (!doc.dataUrl) {
              const dData = await this.getDocumentData(doc.id) || await this.getDocumentData(doc.name);
              if (dData) doc.dataUrl = dData;
            }
          }
          this._cachedCocDocs = parsed;
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read COC docs from localStorage', e);
    }

    const initialSeed = window.DEFAULT_SBYI_COC_DOCS || [];
    this._cachedCocDocs = initialSeed;
    return initialSeed;
  }

  /**
   * Save SBYI COC Documents list (Enforcing 8 maximum PDF files)
   */
  async saveCocDocs(docs) {
    const clamped = (docs || [])
      .filter(d => d.type === 'application/pdf' || (d.name && d.name.toLowerCase().endsWith('.pdf')))
      .slice(0, 8);
    this._cachedCocDocs = clamped;

    // 1. Immediately persist binaries and metadata into IndexedDB
    for (const d of clamped) {
      const dData = d.dataUrl || d.data_url || d.url;
      if (dData) {
        if (d.id) await this.saveDocumentData(d.id, dData, d);
        if (d.name) await this.saveDocumentData(d.name, dData, d);
      }
    }
    await this._localSetStoreItems(LOCAL_COC_STORE_NAME, clamped);

    // 2. Persist to Supabase if active (using robust row-by-row upserts and removing deleted items)
    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        const dbRows = clamped.map(d => this.mapCocDocToDb(d));
        const currentIds = clamped.map(d => String(d.id));

        // Get existing rows in database to cleanly delete removed ones
        const { data: existingRows } = await client.from('sbyi_coc_docs').select('id');
        if (existingRows && existingRows.length > 0) {
          const toDelete = existingRows.filter(r => !currentIds.includes(String(r.id))).map(r => r.id);
          if (toDelete.length > 0) {
            await client.from('sbyi_coc_docs').delete().in('id', toDelete);
          }
        }

        // Upsert each document row individually to avoid payload timeout or body limit failures
        for (const row of dbRows) {
          try {
            const { error: upsertErr } = await client
              .from('sbyi_coc_docs')
              .upsert(row, { onConflict: 'id' });
            if (upsertErr) {
              console.warn(`Supabase upsert note for COC doc ${row.name}:`, upsertErr.message);
            }
          } catch (rowErr) {
            console.warn('Supabase COC row upsert error:', rowErr);
          }
        }
      } catch (err) {
        console.warn('Supabase saveCocDocs failed, saved locally in IndexedDB:', err.message);
      }
    }

    // 3. Save safe copy to localStorage (with quota safety)
    try {
      localStorage.setItem('sbyi_coc_documents_v1', JSON.stringify(clamped));
    } catch (e) {
      try {
        const safeMetadataList = clamped.map(d => ({
          id: d.id,
          name: d.name,
          type: d.type || 'application/pdf',
          size: d.size,
          uploadedAt: d.uploadedAt,
          uploadedBy: d.uploadedBy,
          dataUrl: '' // dataUrl is safely stored in IndexedDB
        }));
        localStorage.setItem('sbyi_coc_documents_v1', JSON.stringify(safeMetadataList));
      } catch (e2) {
        console.warn('Could not write COC docs metadata to localStorage:', e2);
      }
    }

    // Auto-sync AI Knowledge Base
    if (window.sbyimKnowledgeBase) {
      window.sbyimKnowledgeBase.syncKnowledgeBase().then(() => {
        if (window.sbyimAIUI) window.sbyimAIUI.updateKnowledgeStatusBadge();
      }).catch(() => {});
    }

    return clamped;
  }

  /**
   * Delete a single SBYI COC document by ID
   */
  async deleteCocDoc(id) {
    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        await client.from('sbyi_coc_docs').delete().eq('id', id);
      } catch (err) {
        console.warn('Supabase deleteCocDoc failed:', err.message);
      }
    }

    await this._localDeleteStoreItem(LOCAL_COC_STORE_NAME, id);
    const docs = await this.getCocDocs();
    const filtered = docs.filter(d => String(d.id) !== String(id));
    this._cachedCocDocs = filtered;
    return await this.saveCocDocs(filtered);
  }

  /**
   * Delete all SBYI COC documents
   */
  async deleteAllCocDocs() {
    this._cachedCocDocs = [];
    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        await client.from('sbyi_coc_docs').delete().neq('id', '___none___');
      } catch (err) {
        console.warn('Supabase deleteAllCocDocs failed:', err.message);
      }
    }

    await this._localClearStore(LOCAL_COC_STORE_NAME);

    try {
      localStorage.setItem('sbyi_coc_documents_v1', '[]');
    } catch (e) {}

    // Auto-sync AI Knowledge Base
    if (window.sbyimKnowledgeBase) {
      window.sbyimKnowledgeBase.syncKnowledgeBase().then(() => {
        if (window.sbyimAIUI) window.sbyimAIUI.updateKnowledgeStatusBadge();
      }).catch(() => {});
    }

    return [];
  }

  // ==========================================================================
  // AI DOCUMENTS REPOSITORY (DOC, DOCX, or PDF Files Only)
  // ==========================================================================

  /**
   * Get all stored AI Knowledge Base Documents (DOC, DOCX, or PDF)
   */
  async getAiDocs() {
    if (Array.isArray(this._cachedAiDocs) && this._cachedAiDocs.length > 0) {
      return this._cachedAiDocs;
    }

    if (this.isSupabaseActive()) {
      try {
        console.log('[Supabase] Fetching AI knowledge base documents metadata');
        const client = this.getSupabaseClient();
        const { data, error } = await client
          .from('ai_documents')
          .select('*')
          .order('uploaded_at', { ascending: false });

        if (error) throw error;
        if (data && data.length > 0) {
          const list = data.map(row => this.mapDbToAiDoc(row));
          for (const doc of list) {
            if (doc.dataUrl) {
              await this.saveDocumentData(doc.id, doc.dataUrl, doc);
              await this.saveDocumentData(doc.name, doc.dataUrl, doc);
            } else {
              const dData = await this.getDocumentData(doc.id) || await this.getDocumentData(doc.name);
              if (dData) doc.dataUrl = dData;
            }
          }
          this._cachedAiDocs = list;
          await this._localSetStoreItems(LOCAL_AI_STORE_NAME, list);
          return list;
        }
      } catch (err) {
        console.warn('Supabase getAiDocs failed, reading local:', err.message);
      }
    }

    // Read from IndexedDB dedicated store
    try {
      const localDocs = await this._localGetStoreItems(LOCAL_AI_STORE_NAME);
      if (Array.isArray(localDocs) && localDocs.length > 0) {
        for (const doc of localDocs) {
          if (!doc.dataUrl) {
            const dData = await this.getDocumentData(doc.id) || await this.getDocumentData(doc.name);
            if (dData) doc.dataUrl = dData;
          } else {
            this._docMemoryCache.set(String(doc.id), doc.dataUrl);
            if (doc.name) this._docMemoryCache.set(String(doc.name), doc.dataUrl);
          }
        }
        this._cachedAiDocs = localDocs;
        return localDocs;
      }
    } catch (e) {
      console.warn('Could not read AI docs from IndexedDB:', e);
    }

    // Fallback to localStorage
    try {
      const stored = localStorage.getItem('ai_documents_v1');
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const doc of parsed) {
            if (!doc.dataUrl) {
              const dData = await this.getDocumentData(doc.id) || await this.getDocumentData(doc.name);
              if (dData) doc.dataUrl = dData;
            }
          }
          this._cachedAiDocs = parsed;
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read AI docs from localStorage', e);
    }
    this._cachedAiDocs = [];
    return [];
  }

  /**
   * Save AI Documents list (Enforcing DOC, DOCX, or PDF files)
   */
  async saveAiDocs(docs) {
    const validDocs = (docs || []).filter(d => {
      const name = (d.name || '').toLowerCase();
      const type = (d.type || '').toLowerCase();
      return name.endsWith('.pdf') || name.endsWith('.docx') || name.endsWith('.doc') ||
             type.includes('pdf') || type.includes('wordprocessingml') || type.includes('msword');
    });
    this._cachedAiDocs = validDocs;

    // 1. Immediately persist binaries and metadata into IndexedDB
    for (const d of validDocs) {
      const dData = d.dataUrl || d.data_url || d.url;
      if (dData) {
        if (d.id) await this.saveDocumentData(d.id, dData, d);
        if (d.name) await this.saveDocumentData(d.name, dData, d);
      }
    }
    await this._localSetStoreItems(LOCAL_AI_STORE_NAME, validDocs);

    // 2. Persist to Supabase if active (using robust row-by-row upserts and removing deleted items)
    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        const dbRows = validDocs.map(d => this.mapAiDocToDb(d));
        const currentIds = validDocs.map(d => String(d.id));

        // Get existing rows in database to cleanly delete removed ones
        const { data: existingRows } = await client.from('ai_documents').select('id');
        if (existingRows && existingRows.length > 0) {
          const toDelete = existingRows.filter(r => !currentIds.includes(String(r.id))).map(r => r.id);
          if (toDelete.length > 0) {
            await client.from('ai_documents').delete().in('id', toDelete);
          }
        }

        // Upsert each document row individually to avoid payload timeout or body limit failures
        for (const row of dbRows) {
          try {
            const { error: upsertErr } = await client
              .from('ai_documents')
              .upsert(row, { onConflict: 'id' });
            if (upsertErr) {
              console.warn(`Supabase upsert note for AI doc ${row.name}:`, upsertErr.message);
            }
          } catch (rowErr) {
            console.warn('Supabase AI doc row upsert error:', rowErr);
          }
        }
      } catch (err) {
        console.warn('Supabase saveAiDocs failed, saved locally in IndexedDB:', err.message);
      }
    }

    // 3. Save safe copy to localStorage (with quota safety)
    try {
      localStorage.setItem('ai_documents_v1', JSON.stringify(validDocs));
    } catch (e) {
      try {
        const safeMetadataList = validDocs.map(d => ({
          id: d.id,
          name: d.name,
          type: d.type || 'application/pdf',
          size: d.size,
          uploadedAt: d.uploadedAt,
          uploadedBy: d.uploadedBy,
          dataUrl: '' // dataUrl is safely stored in IndexedDB
        }));
        localStorage.setItem('ai_documents_v1', JSON.stringify(safeMetadataList));
      } catch (e2) {
        console.warn('Could not write AI docs metadata to localStorage:', e2);
      }
    }

    // Auto-sync AI Knowledge Base
    if (window.sbyimKnowledgeBase) {
      window.sbyimKnowledgeBase.syncKnowledgeBase().then(() => {
        if (window.sbyimAIUI) window.sbyimAIUI.updateKnowledgeStatusBadge();
      }).catch(() => {});
    }

    return validDocs;
  }

  /**
   * Delete a single AI document by ID
   */
  async deleteAiDoc(id) {
    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        await client.from('ai_documents').delete().eq('id', id);
      } catch (err) {
        console.warn('Supabase deleteAiDoc failed:', err.message);
      }
    }

    await this._localDeleteStoreItem(LOCAL_AI_STORE_NAME, id);
    const docs = await this.getAiDocs();
    const filtered = docs.filter(d => String(d.id) !== String(id));
    this._cachedAiDocs = filtered;
    return await this.saveAiDocs(filtered);
  }

  /**
   * Delete all AI documents
   */
  async deleteAllAiDocs() {
    this._cachedAiDocs = [];
    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        await client.from('ai_documents').delete().neq('id', '___none___');
      } catch (err) {
        console.warn('Supabase deleteAllAiDocs failed:', err.message);
      }
    }

    await this._localClearStore(LOCAL_AI_STORE_NAME);

    try {
      localStorage.setItem('ai_documents_v1', '[]');
    } catch (e) {}

    // Auto-sync AI Knowledge Base
    if (window.sbyimKnowledgeBase) {
      window.sbyimKnowledgeBase.syncKnowledgeBase().then(() => {
        if (window.sbyimAIUI) window.sbyimAIUI.updateKnowledgeStatusBadge();
      }).catch(() => {});
    }

    return [];
  }

  // ==========================================================================
  // CUSTOM NOC TYPES (Supabase & Local)
  // ==========================================================================

  /**
   * Get all custom NOC types
   */
  async getCustomTypes() {
    if (this.isSupabaseActive()) {
      try {
        console.log('[Supabase] Fetching custom NOC types');
        const client = this.getSupabaseClient();
        const { data, error } = await client
          .from('noc_custom_types')
          .select('name')
          .order('name', { ascending: true });

        if (error) throw error;
        if (data && data.length > 0) {
          return data.map(r => r.name);
        }
      } catch (err) {
        console.warn('Supabase getCustomTypes failed, reading local:', err.message);
      }
    }

    try {
      const stored = localStorage.getItem('noc_custom_types');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Could not read custom types from localStorage', e);
    }
    return [];
  }

  /**
   * Save a new custom NOC type
   */
  async saveCustomType(typeName) {
    if (!typeName) return;
    const trimmed = String(typeName).trim();
    if (!trimmed) return;

    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        await client
          .from('noc_custom_types')
          .insert({ name: trimmed })
          .select();
      } catch (err) {
        // Ignore duplicate error in Supabase
        console.log('Supabase custom type insert note:', err.message);
      }
    }

    // Save in local storage
    try {
      let customTypes = await this.getCustomTypes();
      if (!customTypes.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
        customTypes.push(trimmed);
        localStorage.setItem('noc_custom_types', JSON.stringify(customTypes));
      }
    } catch (e) {
      console.warn('Could not save custom type to localStorage', e);
    }
  }

  /**
   * Get all custom Contractors / Companies
   */
  async getCustomContractors() {
    if (this.isSupabaseActive()) {
      try {
        console.log('[Supabase] Fetching custom contractors list');
        const client = this.getSupabaseClient();
        const { data, error } = await client
          .from('noc_custom_contractors')
          .select('name')
          .order('name', { ascending: true });

        if (error) throw error;
        if (data && data.length > 0) {
          return data.map(r => (r.name || '').trim().toUpperCase()).filter(Boolean);
        }
      } catch (err) {
        console.warn('Supabase getCustomContractors failed, reading local:', err.message);
      }
    }

    try {
      const stored = localStorage.getItem('noc_custom_contractors');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed.map(c => String(c).trim().toUpperCase()).filter(Boolean);
      }
    } catch (e) {
      console.warn('Could not read custom contractors from localStorage', e);
    }
    return [];
  }

  /**
   * Save a new custom Contractor / Company
   */
  async saveCustomContractor(contractorName) {
    if (!contractorName) return;
    const trimmed = String(contractorName).trim().toUpperCase();
    if (!trimmed) return;

    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        await client
          .from('noc_custom_contractors')
          .insert({ name: trimmed })
          .select();
      } catch (err) {
        // Ignore duplicate error in Supabase
        console.log('Supabase custom contractor insert note:', err.message);
      }
    }

    // Save in local storage
    try {
      let customContractors = await this.getCustomContractors();
      if (!customContractors.some(t => t.toUpperCase() === trimmed.toUpperCase())) {
        customContractors.push(trimmed);
        localStorage.setItem('noc_custom_contractors', JSON.stringify(customContractors));
      }
    } catch (e) {
      console.warn('Could not save custom contractor to localStorage', e);
    }
  }

  /**
   * Update / Rename an existing Contractor / Company
   */
  async updateCustomContractor(oldName, newName) {
    if (!oldName || !newName) return;
    const oldTrimmed = String(oldName).trim().toUpperCase();
    const newTrimmed = String(newName).trim().toUpperCase();
    if (!oldTrimmed || !newTrimmed || oldTrimmed === newTrimmed) return;

    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        // Update in custom contractors table if exists
        await client
          .from('noc_custom_contractors')
          .update({ name: newTrimmed })
          .eq('name', oldTrimmed);

        // Also update any noc_records that reference the old contractor
        await client
          .from('noc_records')
          .update({ issued_to: newTrimmed })
          .eq('issued_to', oldTrimmed);
      } catch (err) {
        console.warn('Supabase contractor update note:', err.message);
      }
    }

    // Save rename map in localStorage so renames persist across reloads
    try {
      const storedRenames = localStorage.getItem('noc_contractor_renames');
      let renames = storedRenames ? JSON.parse(storedRenames) : {};
      renames[oldTrimmed] = newTrimmed;
      localStorage.setItem('noc_contractor_renames', JSON.stringify(renames));

      // Update custom contractors array
      let customContractors = await this.getCustomContractors();
      const idx = customContractors.findIndex(c => c.toUpperCase() === oldTrimmed);
      if (idx !== -1) {
        customContractors[idx] = newTrimmed;
      } else if (!customContractors.some(c => c.toUpperCase() === newTrimmed)) {
        customContractors.push(newTrimmed);
      }
      localStorage.setItem('noc_custom_contractors', JSON.stringify(customContractors));

      // Also update local IndexedDB records cache
      try {
        const localRecs = await this._localGetAll();
        if (Array.isArray(localRecs)) {
          let modified = false;
          localRecs.forEach(r => {
            if (r.issuedTo && r.issuedTo.trim().toUpperCase() === oldTrimmed) {
              r.issuedTo = newTrimmed;
              modified = true;
            }
          });
          if (modified) {
            await this._localSetStoreItems(LOCAL_STORE_NAME, localRecs);
          }
        }
      } catch (e) {}

      // Also sync renames to Supabase noc_settings table
      if (this.isSupabaseActive()) {
        try {
          const client = this.getSupabaseClient();
          await client.from('noc_settings').upsert({
            key: 'noc_contractor_renames',
            value: renames,
            updated_at: new Date().toISOString()
          }, { onConflict: 'key' });
        } catch (e) {
          console.warn('Supabase contractor renames sync note:', e);
        }
      }
    } catch (e) {
      console.warn('Could not update contractor in localStorage', e);
    }
  }

  /**
   * Retrieve all saved contractor rename mappings (from Supabase or localStorage)
   */
  async getContractorRenames() {
    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        const { data, error } = await client
          .from('noc_settings')
          .select('value')
          .eq('key', 'noc_contractor_renames')
          .maybeSingle();

        if (!error && data && data.value) {
          try {
            localStorage.setItem('noc_contractor_renames', JSON.stringify(data.value));
          } catch (e) {}
          return data.value;
        }
      } catch (e) {
        console.warn('Supabase getContractorRenames failed, reading local:', e.message);
      }
    }

    try {
      const stored = localStorage.getItem('noc_contractor_renames');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {}
    return {};
  }

  /**
   * Generic setting getter (Supabase + localStorage fallback)
   */
  async getSetting(key, defaultValue = null) {
    if (!key) return defaultValue;

    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        const { data, error } = await client
          .from('noc_settings')
          .select('value')
          .eq('key', key)
          .maybeSingle();

        if (!error && data && data.value !== undefined) {
          return data.value;
        }
      } catch (e) {
        console.warn(`Supabase getSetting(${key}) failed:`, e.message);
      }
    }

    try {
      const stored = localStorage.getItem(`noc_setting_${key}`);
      if (stored !== null) {
        return JSON.parse(stored);
      }
    } catch (e) {}
    return defaultValue;
  }

  /**
   * Generic setting setter (Supabase + localStorage)
   */
  async saveSetting(key, value) {
    if (!key) return;

    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        await client.from('noc_settings').upsert({
          key: key,
          value: value,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
      } catch (e) {
        console.warn(`Supabase saveSetting(${key}) failed:`, e.message);
      }
    }

    try {
      localStorage.setItem(`noc_setting_${key}`, JSON.stringify(value));
    } catch (e) {}
  }

  // ==========================================================================
  // USER DATABASE MANAGEMENT (Supabase & Local)
  // ==========================================================================

  /**
   * Default fallback system accounts
   */
  getDefaultUsers() {
    return [
      {
        username: 'ryan',
        password: 'spider06',
        role: 'developer',
        displayName: 'Ryan Ortiz (Developer)',
        email: ''
      },
      {
        username: 'SBYIM',
        password: 'NOC#2022#',
        role: 'admin',
        displayName: 'SBYI Management',
        email: ''
      },
      {
        username: 'security',
        password: 'sec@2024',
        role: 'security',
        displayName: 'SBYIM Security Officer',
        email: ''
      },
      {
        username: 'Employee01',
        password: '666666@',
        role: 'employee',
        displayName: 'Island Security',
        email: ''
      },
      {
        username: 'Employee02',
        password: '777777#',
        role: 'employee',
        displayName: 'Inspire Integrated',
        email: ''
      },
      {
        username: '1GDL',
        password: '55555',
        role: 'guest',
        displayName: 'Gulf Dunes Landscapping',
        email: ''
      }
    ];
  }

  /**
   * Get all user records from Supabase / localStorage
   */
  async getUsers() {
    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        const fetchPromise = client
          .from('noc_users')
          .select('*')
          .order('username', { ascending: true });
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Supabase getUsers query timeout')), 2500)
        );

        const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

        if (error) throw error;
        if (data && data.length > 0) {
          const users = data.map(r => this.mapDbToUser(r));
          try {
            localStorage.setItem('noc_users_v2', JSON.stringify(users));
          } catch (e) {}
          return users;
        }
      } catch (err) {
        console.warn('Supabase getUsers note (using local cache):', err.message);
      }
    }

    try {
      const stored = localStorage.getItem('noc_users_v2') || localStorage.getItem('noc_users_v1');
      if (stored) {
        let parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // If storage contains old deprecated default accounts, migrate to new defaults
          const hasOldDefaults = parsed.some(u => ['admin', 'developer', 'main', 'guest'].includes(u.username.toLowerCase()));
          if (hasOldDefaults || !localStorage.getItem('noc_users_v2')) {
            const defaults = this.getDefaultUsers();
            try {
              localStorage.setItem('noc_users_v2', JSON.stringify(defaults));
              localStorage.removeItem('noc_users_v1');
            } catch (e) {}
            return defaults;
          }

          // Ensure primary developer ryan exists with correct role
          const ryanExists = parsed.some(u => u.username.toLowerCase() === 'ryan');
          if (!ryanExists) {
            parsed.unshift({
              username: 'ryan',
              password: 'spider06',
              role: 'developer',
              displayName: 'Ryan Ortiz (Developer)',
              email: ''
            });
          }
          const ryanIdx = parsed.findIndex(u => u.username.toLowerCase() === 'ryan');
          if (ryanIdx >= 0) {
            parsed[ryanIdx].role = 'developer';
            if (parsed[ryanIdx].displayName === 'Ryan (System Administrator)' || parsed[ryanIdx].displayName === 'System Administrator' || parsed[ryanIdx].displayName === 'Ryan (Developer)' || !parsed[ryanIdx].displayName) {
              parsed[ryanIdx].displayName = 'Ryan Ortiz (Developer)';
            }
          }
          try {
            localStorage.setItem('noc_users_v2', JSON.stringify(parsed));
          } catch (e) {}
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read users from localStorage', e);
    }

    const defaults = this.getDefaultUsers();
    try {
      localStorage.setItem('noc_users_v2', JSON.stringify(defaults));
    } catch (e) {}
    return defaults;
  }

  /**
   * Save (create or update) a user record in Supabase & localStorage
   */
  async saveUser(userData, origUsername = null) {
    if (!userData || !userData.username || !userData.password) {
      throw new Error('Username and Password are required.');
    }

    const userObj = {
      username: String(userData.username).trim(),
      password: String(userData.password).trim(),
      role: ['admin', 'developer', 'security', 'employee', 'main', 'guest'].includes(userData.role) ? userData.role : 'guest',
      displayName: (userData.displayName || userData.username).trim(),
      email: (userData.email || '').trim()
    };

    const isRenaming = origUsername && String(origUsername).trim().toLowerCase() !== userObj.username.toLowerCase();

    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        if (isRenaming) {
          await client
            .from('noc_users')
            .delete()
            .ilike('username', String(origUsername).trim());
        }
        const dbRow = this.mapUserToDb(userObj);
        const { error } = await client
          .from('noc_users')
          .upsert(dbRow, { onConflict: 'username' });
        if (error) throw error;
      } catch (err) {
        console.warn('Supabase saveUser failed, saving locally:', err.message);
      }
    }

    const users = await this.getUsers();
    let targetIdx = -1;
    if (isRenaming) {
      targetIdx = users.findIndex(u => u.username.toLowerCase() === String(origUsername).trim().toLowerCase());
    } else {
      targetIdx = users.findIndex(u => u.username.toLowerCase() === userObj.username.toLowerCase());
    }

    if (targetIdx >= 0) {
      users[targetIdx] = userObj;
    } else {
      users.push(userObj);
    }

    try {
      localStorage.setItem('noc_users_v2', JSON.stringify(users));
    } catch (e) {}

    // Refresh auth user cache
    if (window.nocAuth && window.nocAuth.refreshUsers) {
      await window.nocAuth.refreshUsers();
    }

    return userObj;
  }

  /**
   * Delete a user by username
   */
  async deleteUser(username) {
    if (!username) return false;
    const cleanUsername = String(username).trim();

    if (cleanUsername.toLowerCase() === 'ryan') {
      throw new Error('Cannot delete the primary Developer account.');
    }

    if (this.isSupabaseActive()) {
      try {
        const client = this.getSupabaseClient();
        const { error } = await client
          .from('noc_users')
          .delete()
          .ilike('username', cleanUsername);
        if (error) throw error;
      } catch (err) {
        console.warn('Supabase deleteUser failed:', err.message);
      }
    }

    const users = await this.getUsers();
    const filtered = users.filter(u => u.username.toLowerCase() !== cleanUsername.toLowerCase());

    try {
      localStorage.setItem('noc_users_v2', JSON.stringify(filtered));
    } catch (e) {}

    if (window.nocAuth && window.nocAuth.refreshUsers) {
      await window.nocAuth.refreshUsers();
    }

    return true;
  }

  // ==========================================================================
  // 1-CLICK LOCAL TO SUPABASE SYNCHRONIZATION
  // ==========================================================================

  /**
   * Push all current local data directly to Supabase
   */
  async syncLocalToSupabase(onProgress = null) {
    if (!this.isSupabaseActive()) {
      throw new Error('Supabase client is not connected. Please configure your Project URL & Anon Key first.');
    }

    const client = this.getSupabaseClient();
    const localRecords = await this._localGetAll();
    const localReqDocs = await this.getRequirementsDocs();
    const localCocDocs = await this.getCocDocs();
    const localAiDocs = await this.getAiDocs();
    const localTypes = await this.getCustomTypes();
    const localContractors = await this.getCustomContractors();
    const localUsers = await this.getUsers();
    const localRenames = await this.getContractorRenames();

    const stats = {
      recordsSynced: 0,
      reqDocsSynced: 0,
      cocDocsSynced: 0,
      aiDocsSynced: 0,
      typesSynced: 0,
      contractorsSynced: 0,
      usersSynced: 0,
      settingsSynced: 0
    };

    // 1. Sync NOC Records in micro-batches of 5 with automatic single-row fallback
    if (localRecords && localRecords.length > 0) {
      const dbRows = localRecords.map(r => this.mapRecordToDb(r));
      const BATCH_SIZE = 5;
      for (let i = 0; i < dbRows.length; i += BATCH_SIZE) {
        const batch = dbRows.slice(i, i + BATCH_SIZE);
        try {
          const { error: recError } = await client
            .from('noc_records')
            .upsert(batch, { onConflict: 'id' });

          if (recError) throw recError;
          stats.recordsSynced += batch.length;
        } catch (batchErr) {
          console.warn(`Batch (${i + 1}-${i + batch.length}) timeout/error, syncing row-by-row...`, batchErr.message);
          for (let j = 0; j < batch.length; j++) {
            const singleRow = batch[j];
            try {
              const { error: singleError } = await client
                .from('noc_records')
                .upsert(singleRow, { onConflict: 'id' });
              if (singleError) throw singleError;
              stats.recordsSynced++;
            } catch (rowErr) {
              console.warn(`Row ${singleRow.noc_number || (i + j + 1)} insert note:`, rowErr.message);
              // Retry once
              try {
                await client.from('noc_records').upsert(singleRow, { onConflict: 'id' });
                stats.recordsSynced++;
              } catch (retryErr) {
                console.error(`Final failed row ${singleRow.noc_number}:`, retryErr.message);
              }
            }
          }
        }

        if (typeof onProgress === 'function') {
          onProgress({ stage: 'records', current: stats.recordsSynced, total: dbRows.length });
        }
      }
    }

    // 2. Sync Requirement Documents (Item-by-item to prevent statement timeout on large data URLs)
    if (localReqDocs && localReqDocs.length > 0) {
      const reqRows = localReqDocs.map(d => this.mapReqDocToDb(d));
      for (const row of reqRows) {
        try {
          const { error: docError } = await client
            .from('noc_requirements_docs')
            .upsert(row, { onConflict: 'id' });
          if (!docError) stats.reqDocsSynced++;
        } catch (e) {
          console.warn('Sync req doc note:', e);
        }
      }
    }

    // 3. Sync SBYI COC Documents (Item-by-item)
    if (localCocDocs && localCocDocs.length > 0) {
      const cocRows = localCocDocs.map(d => this.mapCocDocToDb(d));
      for (const row of cocRows) {
        try {
          const { error: cocError } = await client
            .from('sbyi_coc_docs')
            .upsert(row, { onConflict: 'id' });
          if (!cocError) stats.cocDocsSynced++;
        } catch (e) {
          console.warn('Sync coc doc note:', e);
        }
      }
    }

    // 4. Sync AI Documents (Item-by-item)
    if (localAiDocs && localAiDocs.length > 0) {
      const aiRows = localAiDocs.map(d => this.mapAiDocToDb(d));
      for (const row of aiRows) {
        try {
          const { error: aiError } = await client
            .from('ai_documents')
            .upsert(row, { onConflict: 'id' });
          if (!aiError) stats.aiDocsSynced++;
        } catch (e) {
          console.warn('Sync ai doc note:', e);
        }
      }
    }

    // 5. Sync Custom Types
    if (localTypes && localTypes.length > 0) {
      const typeRows = localTypes.map(t => ({ name: t }));
      const { error: typeError } = await client
        .from('noc_custom_types')
        .upsert(typeRows, { onConflict: 'name' });

      if (!typeError) {
        stats.typesSynced = typeRows.length;
      }
    }

    // 6. Sync Custom Contractors
    if (localContractors && localContractors.length > 0) {
      const contractorRows = localContractors.map(c => ({ name: c }));
      const { error: contractorError } = await client
        .from('noc_custom_contractors')
        .upsert(contractorRows, { onConflict: 'name' });

      if (!contractorError) {
        stats.contractorsSynced = contractorRows.length;
      }
    }

    // 7. Sync Users
    if (localUsers && localUsers.length > 0) {
      const userRows = localUsers.map(u => this.mapUserToDb(u));
      const { error: userError } = await client
        .from('noc_users')
        .upsert(userRows, { onConflict: 'username' });

      if (!userError) {
        stats.usersSynced = userRows.length;
      }
    }

    // 8. Sync General Settings & Contractor Renames
    try {
      const settingsPayload = [
        { key: 'noc_contractor_renames', value: localRenames },
        { key: 'noc_custom_types', value: localTypes },
        { key: 'noc_custom_contractors', value: localContractors }
      ];
      const { error: settingsError } = await client
        .from('noc_settings')
        .upsert(settingsPayload, { onConflict: 'key' });

      if (!settingsError) {
        stats.settingsSynced = settingsPayload.length;
      }
    } catch (e) {
      console.warn('Sync settings note:', e);
    }

    return stats;
  }

  // ==========================================================================
  // SUPABASE STORAGE & BINARY DOCUMENT HANDLERS
  // ==========================================================================

  /**
   * Convert Data URL to Blob for Supabase Storage uploads
   */
  dataUrlToBlob(dataUrl) {
    if (!dataUrl) return null;
    if (dataUrl.startsWith('data:')) {
      const parts = dataUrl.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], { type: mimeType });
    }
    return null;
  }

  /**
   * Upload a document to Supabase Storage bucket
   */
  async uploadToStorage(bucketName, filePath, dataUrl, mimeType = 'application/pdf') {
    if (!this.isSupabaseActive()) return null;
    const client = this.getSupabaseClient();
    if (!client || !client.storage) return null;

    try {
      const blob = this.dataUrlToBlob(dataUrl) || new Blob([dataUrl], { type: mimeType });
      const { data, error } = await client.storage
        .from(bucketName)
        .upload(filePath, blob, {
          cacheControl: '3600',
          upsert: true,
          contentType: mimeType
        });

      if (error) {
        console.warn(`Supabase Storage upload note (${bucketName}/${filePath}):`, error.message);
        return null;
      }

      // Get public URL
      const { data: urlData } = client.storage.from(bucketName).getPublicUrl(filePath);
      return urlData ? urlData.publicUrl : null;
    } catch (err) {
      console.warn('Storage upload error:', err.message);
      return null;
    }
  }

  // ==========================================================================
  // TASK 9: NON-DESTRUCTIVE SUPABASE CRUD CONNECTION TEST
  // ==========================================================================

  /**
   * Comprehensive non-destructive CRUD test for Supabase connection
   */
  async testSupabaseCRUD() {
    if (!this.isSupabaseActive()) {
      return {
        success: false,
        error: 'Supabase client is not connected. Configure URL and Anon Key first.'
      };
    }

    const client = this.getSupabaseClient();
    const testId = 'test_conn_check_' + Date.now();
    const testNocNum = 'NOC-TEST-' + Math.floor(1000 + Math.random() * 9000);
    const steps = [];

    try {
      // Step 1: Read Test
      const { data: readData, error: readError } = await client
        .from('noc_records')
        .select('id, noc_number')
        .limit(1);

      if (readError) throw new Error(`Read step failed: ${readError.message}`);
      steps.push({ step: 'READ', status: 'PASS', message: `Read successful (${readData.length} records inspected)` });

      // Step 2: Non-Destructive Insert Test
      const testRecord = {
        id: testId,
        noc_number: testNocNum,
        noc_type: 'Activity',
        client: 'Automated Test Client',
        issued_to: 'TEST CONTRACTOR LLC',
        company_code: 'TEST-001',
        date_of_issuance: new Date().toISOString().split('T')[0],
        date_of_expiration: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        description: 'Automated connection verification test record (Temporary)',
        documents: [
          {
            id: 'doc_test_' + Date.now(),
            name: 'test_attachment.pdf',
            type: 'application/pdf',
            size: 1024,
            dataUrl: '',
            uploadedAt: new Date().toISOString()
          }
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: insertData, error: insertError } = await client
        .from('noc_records')
        .insert(testRecord)
        .select()
        .single();

      if (insertError) throw new Error(`Insert step failed: ${insertError.message}`);
      steps.push({ step: 'INSERT', status: 'PASS', message: `Inserted test record ID: ${testId}` });

      // Step 3: Update Test
      const { data: updateData, error: updateError } = await client
        .from('noc_records')
        .update({ description: 'Automated test updated successfully' })
        .eq('id', testId)
        .select()
        .single();

      if (updateError) throw new Error(`Update step failed: ${updateError.message}`);
      steps.push({ step: 'UPDATE', status: 'PASS', message: `Updated test record ID: ${testId}` });

      // Step 4: Retrieve Document Reference Test
      if (updateData && Array.isArray(updateData.documents) && updateData.documents.length > 0) {
        steps.push({ step: 'DOCUMENT_REFERENCE', status: 'PASS', message: `Retrieved embedded document: ${updateData.documents[0].name}` });
      } else {
        steps.push({ step: 'DOCUMENT_REFERENCE', status: 'WARN', message: 'Documents array was empty' });
      }

      // Step 5: Delete ONLY the Test Record
      const { error: deleteError } = await client
        .from('noc_records')
        .delete()
        .eq('id', testId);

      if (deleteError) throw new Error(`Delete cleanup failed: ${deleteError.message}`);
      steps.push({ step: 'DELETE_CLEANUP', status: 'PASS', message: `Cleaned up test record ID: ${testId}` });

      return {
        success: true,
        summary: 'All Supabase PostgreSQL CRUD operations passed successfully with zero residue.',
        steps
      };
    } catch (err) {
      // Emergency cleanup attempt if test record was created
      try {
        await client.from('noc_records').delete().eq('id', testId);
      } catch (e) {}

      return {
        success: false,
        error: err.message,
        steps
      };
    }
  }

  // ==========================================================================
  // TASK 10: COMPREHENSIVE DATA VALIDATION REPORT
  // ==========================================================================

  /**
   * Compare local database with Supabase PostgreSQL and generate validation report
   */
  async validateDataWithSupabase() {
    if (!this.isSupabaseActive()) {
      return {
        status: 'OFFLINE',
        message: 'Supabase is not active. Connect to Supabase to run validation.'
      };
    }

    const client = this.getSupabaseClient();
    const report = {
      timestamp: new Date().toISOString(),
      overallStatus: 'PASS',
      tables: []
    };

    // 1. Validate noc_records
    try {
      const localRecords = await this._localGetAll();
      const { data: cloudRecords, error: recError } = await client.from('noc_records').select('id, noc_number, date_of_expiration, client, issued_to, documents');
      
      if (recError) throw recError;

      const localCount = localRecords ? localRecords.length : 0;
      const cloudCount = cloudRecords ? cloudRecords.length : 0;
      const missingInCloud = (localRecords || []).filter(lr => !cloudRecords.some(cr => String(cr.id) === String(lr.id) || (cr.noc_number && cr.noc_number.toLowerCase() === (lr.nocNumber || '').toLowerCase())));

      const status = (missingInCloud.length === 0 && localCount === cloudCount) ? 'PASS' : (missingInCloud.length === 0 ? 'PASS (Cloud has extra records)' : 'WARN');
      if (missingInCloud.length > 0) report.overallStatus = 'WARN';

      report.tables.push({
        table: 'noc_records',
        localCount,
        supabaseCount: cloudCount,
        missing: missingInCloud.length,
        status
      });
    } catch (e) {
      report.tables.push({ table: 'noc_records', error: e.message, status: 'FAIL' });
      report.overallStatus = 'FAIL';
    }

    // 2. Validate noc_requirements_docs
    try {
      const localReq = await this.getRequirementsDocs();
      const { data: cloudReq, error: reqErr } = await client.from('noc_requirements_docs').select('id, name');
      if (reqErr) throw reqErr;

      const localCount = localReq ? localReq.length : 0;
      const cloudCount = cloudReq ? cloudReq.length : 0;
      report.tables.push({
        table: 'noc_requirements_docs',
        localCount,
        supabaseCount: cloudCount,
        missing: Math.max(0, localCount - cloudCount),
        status: localCount <= cloudCount ? 'PASS' : 'WARN'
      });
    } catch (e) {
      report.tables.push({ table: 'noc_requirements_docs', error: e.message, status: 'FAIL' });
    }

    // 3. Validate sbyi_coc_docs
    try {
      const localCoc = await this.getCocDocs();
      const { data: cloudCoc, error: cocErr } = await client.from('sbyi_coc_docs').select('id, name');
      if (cocErr) throw cocErr;

      const localCount = localCoc ? localCoc.length : 0;
      const cloudCount = cloudCoc ? cloudCoc.length : 0;
      report.tables.push({
        table: 'sbyi_coc_docs',
        localCount,
        supabaseCount: cloudCount,
        missing: Math.max(0, localCount - cloudCount),
        status: localCount <= cloudCount ? 'PASS' : 'WARN'
      });
    } catch (e) {
      report.tables.push({ table: 'sbyi_coc_docs', error: e.message, status: 'FAIL' });
    }

    // 4. Validate ai_documents
    try {
      const localAi = await this.getAiDocs();
      const { data: cloudAi, error: aiErr } = await client.from('ai_documents').select('id, name');
      if (aiErr) throw aiErr;

      const localCount = localAi ? localAi.length : 0;
      const cloudCount = cloudAi ? cloudAi.length : 0;
      report.tables.push({
        table: 'ai_documents',
        localCount,
        supabaseCount: cloudCount,
        missing: Math.max(0, localCount - cloudCount),
        status: localCount <= cloudCount ? 'PASS' : 'WARN'
      });
    } catch (e) {
      report.tables.push({ table: 'ai_documents', error: e.message, status: 'FAIL' });
    }

    // 5. Validate noc_custom_types
    try {
      const localTypes = await this.getCustomTypes();
      const { data: cloudTypes, error: typeErr } = await client.from('noc_custom_types').select('name');
      if (typeErr) throw typeErr;

      const localCount = localTypes ? localTypes.length : 0;
      const cloudCount = cloudTypes ? cloudTypes.length : 0;
      report.tables.push({
        table: 'noc_custom_types',
        localCount,
        supabaseCount: cloudCount,
        missing: Math.max(0, localCount - cloudCount),
        status: cloudCount >= localCount ? 'PASS' : 'WARN'
      });
    } catch (e) {
      report.tables.push({ table: 'noc_custom_types', error: e.message, status: 'FAIL' });
    }

    // 6. Validate noc_custom_contractors
    try {
      const localContractors = await this.getCustomContractors();
      const { data: cloudContractors, error: conErr } = await client.from('noc_custom_contractors').select('name');
      if (conErr) throw conErr;

      const localCount = localContractors ? localContractors.length : 0;
      const cloudCount = cloudContractors ? cloudContractors.length : 0;
      report.tables.push({
        table: 'noc_custom_contractors',
        localCount,
        supabaseCount: cloudCount,
        missing: Math.max(0, localCount - cloudCount),
        status: cloudCount >= localCount ? 'PASS' : 'WARN'
      });
    } catch (e) {
      report.tables.push({ table: 'noc_custom_contractors', error: e.message, status: 'FAIL' });
    }

    // 7. Validate noc_users
    try {
      const localUsers = await this.getUsers();
      const { data: cloudUsers, error: userErr } = await client.from('noc_users').select('username');
      if (userErr) throw userErr;

      const localCount = localUsers ? localUsers.length : 0;
      const cloudCount = cloudUsers ? cloudUsers.length : 0;
      report.tables.push({
        table: 'noc_users',
        localCount,
        supabaseCount: cloudCount,
        missing: Math.max(0, localCount - cloudCount),
        status: cloudCount >= localCount ? 'PASS' : 'WARN'
      });
    } catch (e) {
      report.tables.push({ table: 'noc_users', error: e.message, status: 'FAIL' });
    }

    return report;
  }

  // ==========================================================================
  // UTILITIES & SUMMARY STATS
  // ==========================================================================

  /**
   * Compute NOC status based on expiration date.
   */
  getStatus(dateOfExpiration) {
    if (!dateOfExpiration) return 'active';
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const expDate = new Date(dateOfExpiration);
    expDate.setHours(0, 0, 0, 0);

    const diffTime = expDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return 'expired';
    } else if (diffDays <= 30) {
      return 'expiring';
    } else {
      return 'active';
    }
  }

  /**
   * Get summary statistics for dashboard counters.
   * Automatically recalculates Total NOC Records, Active Permits, Expiring Soon, and Expired Permits.
   *
   * @param {Array} [providedRecords] Optional array of records to compute stats from directly
   */
  async getStatistics(providedRecords = null) {
    const records = (providedRecords && Array.isArray(providedRecords))
      ? providedRecords
      : await this.getAll();

    let active = 0;
    let expiring = 0;
    let expired = 0;
    let totalDocs = 0;

    records.forEach((rec) => {
      const status = this.getStatus(rec.dateOfExpiration);
      if (status === 'active') active++;
      else if (status === 'expiring') expiring++;
      else if (status === 'expired') expired++;

      if (rec.documents && Array.isArray(rec.documents)) {
        totalDocs += rec.documents.length;
      }
    });

    return {
      total: records.length,
      active,
      expiring,
      expired,
      totalDocs
    };
  }

  /**
   * Export all database data to a JSON string.
   */
  async exportJSON() {
    const records = await this.getAll();
    return JSON.stringify(records, null, 2);
  }

  /**
   * Import data from JSON string.
   */
  async importJSON(jsonStr) {
    try {
      const records = JSON.parse(jsonStr);
      if (!Array.isArray(records)) {
        throw new Error('Invalid JSON format. Expected an array of NOC records.');
      }
      await this.bulkInsert(records);
    } catch (err) {
      throw new Error('Import failed: ' + err.message);
    }
  }

  // ==========================================================================
  // INTERNAL LOCAL INDEXEDDB DRIVER IMPLEMENTATION
  // ==========================================================================

  async _getLocalDB() {
    if (!this.localDb) {
      await this.initLocalDB();
    }
    return this.localDb;
  }

  async _localGetStoreItems(storeName) {
    const db = await this._getLocalDB();
    if (!db || !db.objectStoreNames.contains(storeName)) return [];
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (e) {
        resolve([]);
      }
    });
  }

  async _localSetStoreItems(storeName, items = []) {
    const db = await this._getLocalDB();
    if (!db || !db.objectStoreNames.contains(storeName)) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        store.clear();
        for (const item of items) {
          if (item) store.put(item);
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  async _localDeleteStoreItem(storeName, id) {
    if (!id) return false;
    const db = await this._getLocalDB();
    if (!db || !db.objectStoreNames.contains(storeName)) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        store.delete(String(id));
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  async _localClearStore(storeName) {
    const db = await this._getLocalDB();
    if (!db || !db.objectStoreNames.contains(storeName)) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        store.clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  _getFromLocalStorageBackup() {
    // Supabase is single source of truth; main NOC database is never retrieved from localStorage
    return null;
  }

  _saveToLocalStorageBackup(records) {
    // Supabase is single source of truth; main NOC database is never stored in localStorage
    return;
  }

  async _localGetAll() {
    let records = [];
    const db = await this._getLocalDB();
    if (db) {
      records = await new Promise((resolve) => {
        try {
          const transaction = db.transaction([LOCAL_STORE_NAME], 'readonly');
          const store = transaction.objectStore(LOCAL_STORE_NAME);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result || []);
          request.onerror = () => resolve([]);
        } catch (e) {
          resolve([]);
        }
      });
    }

    // Fallback to initial seed dataset if still empty
    if (!records || records.length === 0) {
      if (window.INITIAL_NOC_SEED_DATA && Array.isArray(window.INITIAL_NOC_SEED_DATA) && window.INITIAL_NOC_SEED_DATA.length > 0) {
        records = [...window.INITIAL_NOC_SEED_DATA];
      }
    }

    const demoIds = ['noc_seed_001', 'noc_seed_002', 'noc_seed_003', 'noc_seed_004', 'noc_seed_005'];
    const demoNocNumbers = ['NOC-2026-0042', 'NOC-2026-0118', 'NOC-2025-0891', 'NOC-2026-0205', 'NOC-2026-0310'];
    records = (records || []).filter(r => r && !demoIds.includes(r.id) && !demoNocNumbers.includes(r.nocNumber));

    records = records.map(r => {
      if (r && r.issuedTo) {
        r.issuedTo = String(r.issuedTo).trim().toUpperCase();
      }
      return r;
    });

    // Resolve any missing document dataUrls from document store or memory cache
    for (const rec of records) {
      if (rec && Array.isArray(rec.documents)) {
        for (const d of rec.documents) {
          if (!d.dataUrl) {
            const dData = await this.getDocumentData(d.id) || await this.getDocumentData(d.name);
            if (dData) d.dataUrl = dData;
          } else {
            if (d.id) this._docMemoryCache.set(String(d.id), d.dataUrl);
            if (d.name) this._docMemoryCache.set(String(d.name), d.dataUrl);
          }
        }
      }
    }

    records.sort((a, b) => new Date(b.createdAt || b.dateOfIssuance || 0) - new Date(a.createdAt || a.dateOfIssuance || 0));
    return records;
  }

  async _localGetById(id) {
    if (!id && id !== 0) return null;
    const strId = String(id);
    const db = await this._getLocalDB();
    let r = null;
    if (db) {
      r = await new Promise((resolve) => {
        try {
          const transaction = db.transaction([LOCAL_STORE_NAME], 'readonly');
          const store = transaction.objectStore(LOCAL_STORE_NAME);
          const request = store.get(id);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });

      if (!r && typeof id === 'string' && !isNaN(Number(id))) {
        r = await new Promise((resolve) => {
          try {
            const transaction = db.transaction([LOCAL_STORE_NAME], 'readonly');
            const store = transaction.objectStore(LOCAL_STORE_NAME);
            const request = store.get(Number(id));
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => resolve(null);
          } catch (e) {
            resolve(null);
          }
        });
      } else if (!r && typeof id === 'number') {
        r = await new Promise((resolve) => {
          try {
            const transaction = db.transaction([LOCAL_STORE_NAME], 'readonly');
            const store = transaction.objectStore(LOCAL_STORE_NAME);
            const request = store.get(String(id));
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => resolve(null);
          } catch (e) {
            resolve(null);
          }
        });
      }

      // If still not found, scan cursor in IndexedDB (checking id and nocNumber)
      if (!r) {
        r = await new Promise((resolve) => {
          try {
            const transaction = db.transaction([LOCAL_STORE_NAME], 'readonly');
            const store = transaction.objectStore(LOCAL_STORE_NAME);
            const req = store.openCursor();
            req.onsuccess = (e) => {
              const cursor = e.target.result;
              if (cursor) {
                const val = cursor.value;
                if (val && (String(val.id) === strId || (val.nocNumber && String(val.nocNumber).trim().toLowerCase() === strId.toLowerCase()))) {
                  resolve(val);
                  return;
                }
                cursor.continue();
              } else {
                resolve(null);
              }
            };
            req.onerror = () => resolve(null);
          } catch (e) {
            resolve(null);
          }
        });
      }
    }

    if (!r && window.nocApp && Array.isArray(window.nocApp.allRecords)) {
      r = window.nocApp.allRecords.find(x => String(x.id) === strId || (x.nocNumber && String(x.nocNumber).trim().toLowerCase() === strId.toLowerCase())) || null;
    }

    if (r) {
      if (r.issuedTo) r.issuedTo = String(r.issuedTo).trim().toUpperCase();
      if (Array.isArray(r.documents)) {
        for (const d of r.documents) {
          if (!d.dataUrl) {
            const dData = await this.getDocumentData(d.id) || await this.getDocumentData(d.name);
            if (dData) d.dataUrl = dData;
          } else {
            if (d.id) this._docMemoryCache.set(String(d.id), d.dataUrl);
            if (d.name) this._docMemoryCache.set(String(d.name), d.dataUrl);
          }
        }
      }
    }
    return r;
  }

  async _localGetByNocNumber(nocNumber) {
    if (!nocNumber) return null;
    const cleanNum = String(nocNumber).trim().toLowerCase();
    const db = await this._getLocalDB();
    let r = null;
    if (db) {
      r = await new Promise((resolve) => {
        try {
          const transaction = db.transaction([LOCAL_STORE_NAME], 'readonly');
          const store = transaction.objectStore(LOCAL_STORE_NAME);
          const index = store.index('nocNumber');
          const request = index.get(nocNumber);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    }

    if (r && r.issuedTo) r.issuedTo = String(r.issuedTo).trim().toUpperCase();
    return r;
  }

  async _localAdd(record) {
    return this._localPut(record);
  }

  /**
   * Save document binary / dataUrl directly to dedicated IndexedDB document store & memory cache
   */
  async saveDocumentData(idOrName, dataUrl, meta = {}) {
    if (!idOrName || !dataUrl) return false;
    const strId = String(idOrName);
    this._docMemoryCache.set(strId, dataUrl);
    if (meta.name && meta.name !== strId) {
      this._docMemoryCache.set(String(meta.name), dataUrl);
    }
    const db = await this._getLocalDB();
    if (db && db.objectStoreNames.contains(LOCAL_DOCS_STORE_NAME)) {
      return new Promise((resolve) => {
        try {
          const tx = db.transaction([LOCAL_DOCS_STORE_NAME], 'readwrite');
          const store = tx.objectStore(LOCAL_DOCS_STORE_NAME);
          store.put({
            id: strId,
            name: meta.name || strId,
            dataUrl: dataUrl,
            size: meta.size || dataUrl.length,
            type: meta.type || 'application/pdf',
            updatedAt: new Date().toISOString()
          });
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    }
    return true;
  }

  /**
   * Get document binary / dataUrl directly from memory cache or dedicated IndexedDB document store
   */
  async getDocumentData(idOrName) {
    if (!idOrName) return null;
    const strKey = String(idOrName);
    if (this._docMemoryCache.has(strKey)) {
      return this._docMemoryCache.get(strKey);
    }
    const db = await this._getLocalDB();
    if (!db) return null;

    // Check stores in order: noc_documents, sbyi_coc_docs, noc_requirements_docs, ai_documents
    const storesToCheck = [LOCAL_DOCS_STORE_NAME, LOCAL_COC_STORE_NAME, LOCAL_REQ_STORE_NAME, LOCAL_AI_STORE_NAME];

    for (const storeName of storesToCheck) {
      if (!db.objectStoreNames.contains(storeName)) continue;

      // 1. By Key (id)
      const byKey = await new Promise((resolve) => {
        try {
          const tx = db.transaction([storeName], 'readonly');
          const store = tx.objectStore(storeName);
          const req = store.get(strKey);
          req.onsuccess = () => resolve(req.result ? (req.result.dataUrl || req.result.data_url || req.result.url) : null);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
      if (byKey) {
        this._docMemoryCache.set(strKey, byKey);
        return byKey;
      }

      // 2. By Name index
      const byName = await new Promise((resolve) => {
        try {
          const tx = db.transaction([storeName], 'readonly');
          const store = tx.objectStore(storeName);
          if (store.indexNames.contains('name')) {
            const index = store.index('name');
            const req = index.get(strKey);
            req.onsuccess = () => resolve(req.result ? (req.result.dataUrl || req.result.data_url || req.result.url) : null);
            req.onerror = () => resolve(null);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
      if (byName) {
        this._docMemoryCache.set(strKey, byName);
        return byName;
      }
    }

    return null;
  }

  async _localPut(record) {
    if (record && record.issuedTo) {
      record.issuedTo = String(record.issuedTo).trim().toUpperCase();
    }
    const db = await this._getLocalDB();
    if (db) {
      await new Promise((resolve) => {
        try {
          const transaction = db.transaction([LOCAL_STORE_NAME], 'readwrite');
          const store = transaction.objectStore(LOCAL_STORE_NAME);
          store.put(record);
          transaction.oncomplete = () => resolve(record);
          transaction.onerror = (e) => {
            console.warn('IndexedDB put note:', e);
            resolve(record);
          };
        } catch (e) {
          resolve(record);
        }
      });

      // Persist document payloads to dedicated document store & cache
      if (record && Array.isArray(record.documents)) {
        for (const d of record.documents) {
          const dData = d.dataUrl || d.data_url || d.url;
          if (dData) {
            if (d.id) this.saveDocumentData(d.id, dData, d).catch(() => {});
            if (d.name) this.saveDocumentData(d.name, dData, d).catch(() => {});
          }
        }
      }
    }

    return record;
  }

  async _localDelete(id, targetNocNumber = null, docIds = []) {
    if (!id && id !== 0) return true;
    const strId = String(id);
    const cleanNoc = targetNocNumber ? String(targetNocNumber).trim().toLowerCase() : null;

    const db = await this._getLocalDB();
    if (db) {
      await new Promise((resolve) => {
        try {
          const stores = [LOCAL_STORE_NAME];
          if (db.objectStoreNames.contains(LOCAL_DOCS_STORE_NAME)) {
            stores.push(LOCAL_DOCS_STORE_NAME);
          }
          const transaction = db.transaction(stores, 'readwrite');
          const store = transaction.objectStore(LOCAL_STORE_NAME);
          store.delete(id);
          if (typeof id === 'string' && !isNaN(Number(id))) {
            store.delete(Number(id));
          } else if (typeof id === 'number') {
            store.delete(String(id));
          }

          // Also scan cursor to ensure deletion by string ID or nocNumber
          const req = store.openCursor();
          req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              const val = cursor.value;
              if (
                String(val.id) === strId ||
                (cleanNoc && val.nocNumber && String(val.nocNumber).trim().toLowerCase() === cleanNoc) ||
                (cleanNoc && val.noc_number && String(val.noc_number).trim().toLowerCase() === cleanNoc)
              ) {
                cursor.delete();
              }
              cursor.continue();
            }
          };

          // Also delete associated documents from LOCAL_DOCS_STORE_NAME
          if (db.objectStoreNames.contains(LOCAL_DOCS_STORE_NAME) && Array.isArray(docIds)) {
            const docStore = transaction.objectStore(LOCAL_DOCS_STORE_NAME);
            docIds.forEach(dId => {
              try {
                if (dId) docStore.delete(String(dId));
              } catch (e) {}
            });
          }

          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => resolve(true);
        } catch (e) {
          try {
            const tx = db.transaction([LOCAL_STORE_NAME], 'readwrite');
            tx.objectStore(LOCAL_STORE_NAME).delete(id);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(true);
          } catch (e2) {
            resolve(true);
          }
        }
      });
    }

    // Clean memory doc cache
    if (Array.isArray(docIds)) {
      docIds.forEach(dId => {
        if (dId) {
          this._docMemoryCache.delete(String(dId));
        }
      });
    }

    // In-memory seed data removal so it doesn't resurrect if IndexedDB falls back
    try {
      if (window.INITIAL_NOC_SEED_DATA && Array.isArray(window.INITIAL_NOC_SEED_DATA)) {
        window.INITIAL_NOC_SEED_DATA = window.INITIAL_NOC_SEED_DATA.filter(r => {
          if (String(r.id) === strId || r.id === Number(id)) return false;
          if (cleanNoc && r.nocNumber && String(r.nocNumber).trim().toLowerCase() === cleanNoc) return false;
          if (cleanNoc && r.noc_number && String(r.noc_number).trim().toLowerCase() === cleanNoc) return false;
          return true;
        });
      }
    } catch (e) {}

    return true;
  }

  async _localBulkDelete(ids = [], targetNocNumbers = [], docIds = []) {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const strIds = new Set(ids.map(i => String(i)));
    const cleanNocs = new Set((targetNocNumbers || []).map(n => String(n).trim().toLowerCase()));

    const db = await this._getLocalDB();
    if (db) {
      await new Promise((resolve) => {
        try {
          const stores = [LOCAL_STORE_NAME];
          if (db.objectStoreNames.contains(LOCAL_DOCS_STORE_NAME)) {
            stores.push(LOCAL_DOCS_STORE_NAME);
          }
          const transaction = db.transaction(stores, 'readwrite');
          const store = transaction.objectStore(LOCAL_STORE_NAME);
          ids.forEach(id => {
            if (!id && id !== 0) return;
            store.delete(id);
            if (typeof id === 'string' && !isNaN(Number(id))) {
              store.delete(Number(id));
            } else if (typeof id === 'number') {
              store.delete(String(id));
            }
          });

          // Also scan cursor to catch any string/number/nocNumber mismatches
          const req = store.openCursor();
          req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              const val = cursor.value;
              const valNoc = val.nocNumber ? String(val.nocNumber).trim().toLowerCase() : (val.noc_number ? String(val.noc_number).trim().toLowerCase() : '');
              if (strIds.has(String(val.id)) || (valNoc && cleanNocs.has(valNoc))) {
                cursor.delete();
              }
              cursor.continue();
            }
          };

          // Also remove associated documents
          if (db.objectStoreNames.contains(LOCAL_DOCS_STORE_NAME) && Array.isArray(docIds)) {
            const docStore = transaction.objectStore(LOCAL_DOCS_STORE_NAME);
            docIds.forEach(dId => {
              try {
                if (dId) docStore.delete(String(dId));
              } catch (e) {}
            });
          }

          transaction.oncomplete = () => resolve(ids.length);
          transaction.onerror = () => resolve(ids.length);
        } catch (e) {
          try {
            const tx = db.transaction([LOCAL_STORE_NAME], 'readwrite');
            ids.forEach(id => tx.objectStore(LOCAL_STORE_NAME).delete(id));
            tx.oncomplete = () => resolve(ids.length);
            tx.onerror = () => resolve(ids.length);
          } catch (e2) {
            resolve(ids.length);
          }
        }
      });
    }

    // Clean memory doc cache
    if (Array.isArray(docIds)) {
      docIds.forEach(dId => {
        if (dId) {
          this._docMemoryCache.delete(String(dId));
        }
      });
    }

    // In-memory seed data
    try {
      if (window.INITIAL_NOC_SEED_DATA && Array.isArray(window.INITIAL_NOC_SEED_DATA)) {
        window.INITIAL_NOC_SEED_DATA = window.INITIAL_NOC_SEED_DATA.filter(r => {
          const valNoc = r.nocNumber ? String(r.nocNumber).trim().toLowerCase() : (r.noc_number ? String(r.noc_number).trim().toLowerCase() : '');
          return !strIds.has(String(r.id)) && (!valNoc || !cleanNocs.has(valNoc));
        });
      }
    } catch (e) {}

    return ids.length;
  }

  async _localBulkInsert(records) {
    if (!Array.isArray(records) || records.length === 0) return true;
    const db = await this._getLocalDB();
    if (db) {
      await new Promise((resolve) => {
        try {
          const transaction = db.transaction([LOCAL_STORE_NAME], 'readwrite');
          const store = transaction.objectStore(LOCAL_STORE_NAME);

          records.forEach((record) => {
            if (record && record.issuedTo) {
              record.issuedTo = String(record.issuedTo).trim().toUpperCase();
            }
            store.put(record);
          });

          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => resolve(true);
        } catch (e) {
          resolve(true);
        }
      });

      // Persist document payloads to dedicated document store & cache
      for (const record of records) {
        if (record && Array.isArray(record.documents)) {
          for (const d of record.documents) {
            const dData = d.dataUrl || d.data_url || d.url;
            if (dData) {
              if (d.id) this.saveDocumentData(d.id, dData, d).catch(() => {});
              if (d.name) this.saveDocumentData(d.name, dData, d).catch(() => {});
            }
          }
        }
      }
    }

    return true;
  }

  async _localClearAll() {
    const db = await this._getLocalDB();
    if (db) {
      await new Promise((resolve) => {
        try {
          const stores = [];
          if (db.objectStoreNames.contains(LOCAL_STORE_NAME)) stores.push(LOCAL_STORE_NAME);
          if (db.objectStoreNames.contains(LOCAL_DOCS_STORE_NAME)) stores.push(LOCAL_DOCS_STORE_NAME);
          if (stores.length > 0) {
            const transaction = db.transaction(stores, 'readwrite');
            stores.forEach(s => transaction.objectStore(s).clear());
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => resolve(true);
          } else {
            resolve(true);
          }
        } catch (e) {
          try {
            const tx2 = db.transaction([LOCAL_STORE_NAME], 'readwrite');
            tx2.objectStore(LOCAL_STORE_NAME).clear();
            tx2.oncomplete = () => resolve(true);
            tx2.onerror = () => resolve(true);
          } catch (e2) {
            resolve(true);
          }
        }
      });
    }
    this._docMemoryCache.clear();
    localStorage.removeItem('noc_records_v1');
    localStorage.removeItem('noc_records');
    localStorage.removeItem('noc_records_purged_clear_all_v1');
    localStorage.removeItem('noc_records_purged_clear_all_v2');
    localStorage.removeItem('noc_records_purged_clear_all_v3');
    if (window.INITIAL_NOC_SEED_DATA) {
      window.INITIAL_NOC_SEED_DATA = [];
    }
    if (window.nocApp) {
      window.nocApp.allRecords = [];
      window.nocApp.filteredRecords = [];
    }
    return true;
  }
}

// Global DB instance
window.nocDB = new NOCDatabase();
