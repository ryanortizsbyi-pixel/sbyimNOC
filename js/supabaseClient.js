/**
 * NOC Portal - Supabase Client & Configuration Manager
 * Initializes the Supabase JS Client with localStorage persistence and live status checking.
 */

class SupabaseConfigManager {
  constructor() {
    this.STORAGE_KEY_URL = 'noc_supabase_url';
    this.STORAGE_KEY_KEY = 'noc_supabase_anon_key';
    
    // Default Supabase connection disconnected (Running in Local Mode)
    this.defaultUrl = '';
    this.defaultAnonKey = '';
    
    this.client = null;
    this.isConnected = false;
    this.lastChecked = null;

    this.initClient();
  }

  /**
   * Get configured Supabase URL
   */
  getUrl() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_URL);
      if (stored !== null && stored.trim() !== '') {
        return stored.trim();
      }
    } catch (e) {
      console.warn('Could not read Supabase URL from localStorage', e);
    }
    return '';
  }

  /**
   * Get configured Supabase Anon Key
   */
  getAnonKey() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY_KEY);
      if (stored !== null && stored.trim() !== '') {
        return stored.trim();
      }
    } catch (e) {
      console.warn('Could not read Supabase Anon Key from localStorage', e);
    }
    return '';
  }

  /**
   * Save new Supabase credentials and re-initialize client
   */
  saveCredentials(url, anonKey) {
    const trimmedUrl = (url || '').trim();
    const trimmedKey = (anonKey || '').trim();

    try {
      if (trimmedUrl) {
        localStorage.setItem(this.STORAGE_KEY_URL, trimmedUrl);
      } else {
        localStorage.setItem(this.STORAGE_KEY_URL, '');
      }

      if (trimmedKey) {
        localStorage.setItem(this.STORAGE_KEY_KEY, trimmedKey);
      } else {
        localStorage.setItem(this.STORAGE_KEY_KEY, '');
      }
    } catch (e) {
      console.error('Error saving Supabase credentials:', e);
    }

    this.initClient();
    this.triggerConfigChange();
  }

  /**
   * Clear Supabase credentials (revert to local mode)
   */
  clearCredentials() {
    try {
      localStorage.removeItem(this.STORAGE_KEY_URL);
      localStorage.removeItem(this.STORAGE_KEY_KEY);
    } catch (e) {
      console.error('Error clearing Supabase credentials:', e);
    }
    this.client = null;
    this.isConnected = false;
    this.triggerConfigChange();
  }

  /**
   * Initialize Supabase Client if credentials are valid and Supabase JS SDK is loaded
   */
  initClient() {
    const url = this.getUrl();
    const key = this.getAnonKey();

    if (url && key && window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        this.client = window.supabase.createClient(url, key, {
          auth: {
            persistSession: true,
            autoRefreshToken: true
          }
        });
        console.log('Supabase client initialized with URL:', url);
      } catch (err) {
        console.error('Failed to initialize Supabase client:', err);
        this.client = null;
      }
    } else {
      this.client = null;
    }
  }

  /**
   * Check if Supabase client is configured
   */
  isConfigured() {
    const url = this.getUrl();
    const key = this.getAnonKey();
    return Boolean(url && key && this.client);
  }

  /**
   * Get current Supabase client instance
   */
  getClient() {
    if (!this.client && this.isConfigured()) {
      this.initClient();
    }
    return this.client;
  }

  /**
   * Test connection to Supabase database (health check)
   */
  async testConnection() {
    const url = this.getUrl();
    const key = this.getAnonKey();

    if (!url || !key) {
      this.isConnected = false;
      return {
        success: false,
        message: 'Supabase URL or Anon Key is missing. Running in Local Storage mode.'
      };
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      this.isConnected = false;
      return {
        success: false,
        message: 'Supabase JS SDK is not loaded. Please check your internet connection.'
      };
    }

    try {
      const testClient = window.supabase.createClient(url, key);
      // Query noc_records table (limit 1) to test table access and RLS
      const { data, error } = await testClient
        .from('noc_records')
        .select('id')
        .limit(1);

      if (error) {
        this.isConnected = false;
        console.warn('Supabase connection test failed:', error);
        return {
          success: false,
          error: error.message || 'Database query error',
          message: `Connection failed: ${error.message}. Make sure you executed the SQL Schema in Supabase SQL Editor.`
        };
      }

      this.isConnected = true;
      this.client = testClient;
      this.lastChecked = new Date();
      this.triggerConfigChange();

      return {
        success: true,
        message: 'Successfully connected to Supabase PostgreSQL database!'
      };
    } catch (err) {
      this.isConnected = false;
      return {
        success: false,
        error: err.message,
        message: `Connection error: ${err.message}`
      };
    }
  }

  /**
   * Dispatch custom event when configuration changes
   */
  triggerConfigChange() {
    window.dispatchEvent(new CustomEvent('noc:supabase-config-change', {
      detail: {
        isConfigured: this.isConfigured(),
        isConnected: this.isConnected,
        url: this.getUrl()
      }
    }));
  }
}

// Global Supabase Manager instance
window.supabaseManager = new SupabaseConfigManager();
