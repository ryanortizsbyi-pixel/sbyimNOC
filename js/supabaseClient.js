/**
 * NOC Portal - Supabase Client & Configuration Manager
 * Initializes the Supabase JS Client with automatic connection, live status checking, and auto-reconnect.
 */

class SupabaseConfigManager {
  constructor() {
    this.STORAGE_KEY_URL = 'noc_supabase_url';
    this.STORAGE_KEY_KEY = 'noc_supabase_anon_key';
    
    // Default Supabase connection credentials (Production Project)
    this.defaultUrl = 'https://skidfzyisurdkzsmcpwe.supabase.co';
    this.defaultAnonKey = 'sb_publishable_IKBla9qx0bETi1Fs4GJG5g_8fikmi3q';
    
    this.client = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.lastChecked = null;
    this._connectionPromise = null;
    this._retryTimer = null;
    this._heartbeatTimer = null;
    this._realtimeChannels = new Map();

    // Initialize client instance immediately
    this.initClient();

    // Auto-connect immediately in background
    this.autoConnect();

    // Setup network and lifecycle event listeners for automatic reconnection and unmount cleanup
    this.setupAutoReconnect();
  }

  /**
   * Get configured Supabase URL (defaults to production project URL)
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
    return this.defaultUrl;
  }

  /**
   * Get configured Supabase Anon Key (defaults to production anon key)
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
    return this.defaultAnonKey;
  }

  /**
   * Save new Supabase credentials, re-initialize client, and auto-connect
   */
  saveCredentials(url, anonKey) {
    const trimmedUrl = (url || '').trim();
    const trimmedKey = (anonKey || '').trim();

    try {
      if (trimmedUrl) {
        localStorage.setItem(this.STORAGE_KEY_URL, trimmedUrl);
      } else {
        localStorage.removeItem(this.STORAGE_KEY_URL);
      }

      if (trimmedKey) {
        localStorage.setItem(this.STORAGE_KEY_KEY, trimmedKey);
      } else {
        localStorage.removeItem(this.STORAGE_KEY_KEY);
      }
    } catch (e) {
      console.error('Error saving Supabase credentials:', e);
    }

    this.initClient();
    this.triggerConfigChange();
    return this.testConnection();
  }

  /**
   * Reset / revert Supabase credentials to default production settings
   */
  clearCredentials() {
    try {
      localStorage.removeItem(this.STORAGE_KEY_URL);
      localStorage.removeItem(this.STORAGE_KEY_KEY);
    } catch (e) {
      console.error('Error resetting Supabase credentials:', e);
    }
    this.initClient();
    this.triggerConfigChange();
    return this.testConnection();
  }

  /**
   * Initialize Supabase Client if credentials and SDK are available
   */
  initClient() {
    const url = this.getUrl();
    const key = this.getAnonKey();

    if (url && key && window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        this.client = window.supabase.createClient(url, key, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false
          }
        });
        window.supabaseClient = this.client;
        console.log('⚡ Supabase client initialized with URL:', url);
        return this.client;
      } catch (err) {
        console.error('Failed to initialize Supabase client:', err);
        this.client = null;
      }
    } else {
      this.client = null;
    }
    return this.client;
  }

  /**
   * Check if Supabase client credentials are configured
   */
  isConfigured() {
    const url = this.getUrl();
    const key = this.getAnonKey();
    return Boolean(url && key);
  }

  /**
   * Get current Supabase client instance (auto-initializes if not ready)
   */
  getClient() {
    if (!this.client && this.isConfigured()) {
      this.initClient();
    }
    return this.client;
  }

  /**
   * Automatic background connection handler with self-healing retry
   */
  autoConnect() {
    if (this._connectionPromise && this.isConnecting) {
      return this._connectionPromise;
    }

    this._connectionPromise = (async () => {
      this.isConnecting = true;
      try {
        // If window.supabase SDK is not ready yet, wait briefly
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
          await new Promise(resolve => setTimeout(resolve, 150));
        }

        const result = await this.testConnection();
        if (result.success) {
          if (this._retryTimer) {
            clearTimeout(this._retryTimer);
            this._retryTimer = null;
          }
        } else {
          // Schedule background retry after 3 seconds if initial load / network issue
          if (!this._retryTimer) {
            this._retryTimer = setTimeout(() => {
              this._retryTimer = null;
              this.autoConnect();
            }, 3000);
          }
        }
        return result;
      } catch (err) {
        console.warn('Auto-connect attempt note:', err);
        return { success: false, error: err.message };
      } finally {
        this.isConnecting = false;
      }
    })();

    return this._connectionPromise;
  }

  /**
   * Setup auto-reconnect event listeners
   */
  /**
   * Setup auto-reconnect event listeners and unmount cleanup
   */
  setupAutoReconnect() {
    // Re-verify when device comes online
    window.addEventListener('online', () => {
      console.log('🌐 Network online detected: Reconnecting to Supabase...');
      this.autoConnect();
    });

    // Re-verify when user returns to tab
    window.addEventListener('focus', () => {
      if (!this.isConnected) {
        this.autoConnect();
      }
    });

    // Cleanup all active channels when browser window/tab is closed or unloaded
    window.addEventListener('beforeunload', () => {
      this.unsubscribeAllChannels();
    });
    window.addEventListener('pagehide', () => {
      this.unsubscribeAllChannels();
    });

    // Note: Periodic interval polling removed to prevent continuous PostgREST egress.
    // Reconnection is automatically handled event-driven by 'online' and 'focus' event listeners above.
  }

  /**
   * Subscribe to Supabase Realtime changes on a specific PostgreSQL table.
   * Listens for all database operations (INSERT, UPDATE, DELETE).
   *
   * @param {string} channelKey Unique identifier for the subscription channel
   * @param {string} table Database table name (e.g. 'noc_records')
   * @param {Function} onEvent Callback invoked when an INSERT, UPDATE, or DELETE happens
   * @param {Function} [onStatusChange] Optional callback invoked when channel subscription status changes
   * @returns {Function} Unsubscribe cleanup function to call on unmount
   */
  subscribeToTable(channelKey, table, onEvent, onStatusChange = null) {
    const client = this.getClient();
    if (!client) {
      console.warn(`Supabase client not available to subscribe to ${table}`);
      return () => {};
    }

    // Clean up existing channel with same key if present
    this.unsubscribeChannel(channelKey);

    try {
      const channel = client
        .channel(channelKey)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: table
          },
          (payload) => {
            console.log('[Realtime NOC event]', payload);
            console.log(`⚡ [Realtime:${table}] Received event (${payload.eventType}):`, payload);
            if (typeof onEvent === 'function') {
              try {
                onEvent(payload);
              } catch (err) {
                console.error(`Error in realtime handler for ${table}:`, err);
              }
            }
          }
        )
        .subscribe((status, err) => {
          console.log('[Realtime subscription status]', status);
          console.log(`⚡ [Realtime:${table}] Channel status: ${status}`, err ? `(Note: ${err.message})` : '');
          if (typeof onStatusChange === 'function') {
            try {
              onStatusChange(status, err);
            } catch (statusErr) {
              console.warn('Error in realtime status handler:', statusErr);
            }
          }
        });

      this._realtimeChannels.set(channelKey, channel);

      // Return cleanup function (can be directly returned in React useEffect or called on unmount)
      return () => {
        this.unsubscribeChannel(channelKey);
      };
    } catch (e) {
      console.error(`Failed to create realtime channel for ${table}:`, e);
      return () => {};
    }
  }

  /**
   * Unsubscribe and remove a specific realtime channel
   * @param {string} channelKey
   */
  unsubscribeChannel(channelKey) {
    if (this._realtimeChannels && this._realtimeChannels.has(channelKey)) {
      const channel = this._realtimeChannels.get(channelKey);
      this._realtimeChannels.delete(channelKey);
      if (channel && this.client) {
        try {
          this.client.removeChannel(channel);
          console.log(`⚡ [Realtime] Cleaned up & unsubscribed channel: ${channelKey}`);
        } catch (e) {
          console.warn(`Error removing channel ${channelKey}:`, e);
        }
      }
    }
  }

  /**
   * Unsubscribe and clean up all active realtime channels (used on unmount/reconnect)
   */
  unsubscribeAllChannels() {
    if (this._realtimeChannels && this._realtimeChannels.size > 0) {
      for (const [key, channel] of this._realtimeChannels.entries()) {
        if (channel && this.client) {
          try {
            this.client.removeChannel(channel);
          } catch (e) {}
        }
      }
      this._realtimeChannels.clear();
      console.log('⚡ [Realtime] All realtime channels cleaned up.');
    }
  }

  /**
   * Test connection to Supabase database (health check) with timeout protection
   */
  async testConnection() {
    const url = this.getUrl();
    const key = this.getAnonKey();

    if (!url || !key) {
      this.isConnected = false;
      this.triggerConfigChange();
      return {
        success: false,
        message: 'Supabase URL or Anon Key is missing. Running in Local Storage mode.'
      };
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      this.isConnected = false;
      this.triggerConfigChange();
      return {
        success: false,
        message: 'Supabase JS SDK is not loaded. Please check your internet connection.'
      };
    }

    try {
      const activeClient = this.getClient() || window.supabase.createClient(url, key);
      this.client = activeClient;

      // Query noc_records table (limit 1) to test table access and RLS with 4-second timeout
      console.log('[Supabase] Testing PostgreSQL connection status');
      const queryPromise = activeClient
        .from('noc_records')
        .select('id')
        .limit(1);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection check timed out after 4 seconds')), 4000)
      );

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

      if (error) {
        this.isConnected = false;
        console.warn('Supabase connection test note:', error);
        this.triggerConfigChange();
        return {
          success: false,
          error: error.message || 'Database query error',
          message: `Connection test note: ${error.message}. Ensure schema is applied in Supabase.`
        };
      }

      this.isConnected = true;
      this.lastChecked = new Date();
      this.triggerConfigChange();

      return {
        success: true,
        message: 'Successfully connected to Supabase PostgreSQL database!'
      };
    } catch (err) {
      this.isConnected = false;
      this.triggerConfigChange();
      return {
        success: false,
        error: err.message,
        message: `Connection error: ${err.message}`
      };
    }
  }

  /**
   * Dispatch custom event when configuration or connection state changes
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
