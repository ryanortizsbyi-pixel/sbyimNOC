/**
 * NOC Portal - Role-Based Authentication (RBAC) Module
 * Handles user login states, Admin vs Guest permissions, session storage, and event dispatching.
 */

class AuthManager {
  constructor() {
    this.STORAGE_KEY = 'noc_portal_auth_user';
    this._cachedUsers = null;
    this.currentUser = this.loadUser();
    this.refreshUsers();

    window.addEventListener('noc:supabase-config-change', () => {
      this.refreshUsers().catch(() => {});
    });
  }

  /**
   * Refresh in-memory users cache from database / local storage
   */
  async refreshUsers() {
    try {
      if (window.nocDB && window.nocDB.getUsers) {
        const users = await window.nocDB.getUsers();
        if (users && users.length > 0) {
          this._cachedUsers = {};
          for (const u of users) {
            this._cachedUsers[u.username.toLowerCase()] = u;
          }
        }
      }
    } catch (e) {
      console.warn('Could not refresh users in AuthManager', e);
    }
  }

  /**
   * System accounts map (reads from dynamic cache or fallback defaults)
   */
  get systemUsers() {
    const baseDefaults = {
      ryan: {
        username: 'ryan',
        password: 'spider06',
        role: 'developer',
        displayName: 'Ryan Ortiz (Developer)',
        email: ''
      },
      sbyim: {
        username: 'SBYIM',
        password: 'NOC#2022#',
        role: 'admin',
        displayName: 'SBYI Management',
        email: ''
      },
      security: {
        username: 'security',
        password: 'sec@2024',
        role: 'security',
        displayName: 'SBYIM Security Officer',
        email: ''
      },
      employee01: {
        username: 'Employee01',
        password: '666666@',
        role: 'employee',
        displayName: 'Island Security',
        email: ''
      },
      employee02: {
        username: 'Employee02',
        password: '777777#',
        role: 'employee',
        displayName: 'Inspire Integrated',
        email: ''
      },
      '1gdl': {
        username: '1GDL',
        password: '55555',
        role: 'guest',
        displayName: 'Gulf Dunes Landscapping',
        email: ''
      }
    };

    const map = { ...baseDefaults };

    if (this._cachedUsers && Object.keys(this._cachedUsers).length > 0) {
      Object.assign(map, this._cachedUsers);
    } else {
      try {
        const stored = localStorage.getItem('noc_users_v2') || localStorage.getItem('noc_users_v1');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            parsed.forEach(u => {
              if (u && u.username) {
                map[u.username.toLowerCase()] = u;
              }
            });
          }
        }
      } catch (e) {}
    }

    // Add convenient aliases without overwriting existing registered accounts
    if (!map['admin']) map['admin'] = map['sbyim'] || baseDefaults.sbyim;
    if (!map['administrator']) map['administrator'] = map['sbyim'] || baseDefaults.sbyim;
    if (!map['developer']) map['developer'] = map['ryan'] || baseDefaults.ryan;
    if (!map['dev']) map['dev'] = map['ryan'] || baseDefaults.ryan;
    if (!map['employee']) map['employee'] = map['employee01'] || baseDefaults.employee01;
    if (!map['guest']) map['guest'] = map['1gdl'] || baseDefaults['1gdl'];

    return map;
  }

  /**
   * Load saved session - returns null so the landing screen is always the first screen seen upon loading index
   */
  loadUser() {
    // Always start unauthenticated upon loading the index so the welcome screen is the first screen seen
    return null;
  }

  /**
   * Check login credentials against registered user accounts
   */
  login(username, password, rememberMe = false) {
    try {
      sessionStorage.removeItem('noc_explicit_logout');
    } catch (e) {}

    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '').trim();
    const rawPassword = String(password || '');
    const userKey = cleanUsername.toLowerCase();
    const usersMap = this.systemUsers;
    const user = usersMap[userKey];

    // Master fallback match logic
    const isMasterDeveloper = (userKey === 'ryan' || userKey === 'developer' || userKey === 'dev') &&
      (cleanPassword === 'spider06' || cleanPassword === 'developer' || (user && (user.password === cleanPassword || user.password === rawPassword)));

    const isMasterAdmin = (userKey === 'sbyim' || userKey === 'admin' || userKey === 'administrator') &&
      (cleanPassword === 'NOC#2022#' || cleanPassword === 'admin' || cleanPassword === 'spider06' || (user && (user.password === cleanPassword || user.password === rawPassword)));

    const isMasterSecurity = (userKey === 'security') &&
      (cleanPassword === 'sec@2024' || cleanPassword === 'security' || (user && (user.password === cleanPassword || user.password === rawPassword)));

    const isMasterEmployee = (userKey === 'employee01' || userKey === 'employee') &&
      (cleanPassword === '666666@' || cleanPassword === 'employee' || (user && (user.password === cleanPassword || user.password === rawPassword)));

    const isMasterEmployee02 = (userKey === 'employee02') &&
      (cleanPassword === '777777#' || (user && (user.password === cleanPassword || user.password === rawPassword)));

    const isMasterGuest = (userKey === '1gdl' || userKey === 'guest') &&
      (cleanPassword === '55555' || cleanPassword === 'guest' || (user && (user.password === cleanPassword || user.password === rawPassword)));

    const isDirectMatch = user && (user.password === cleanPassword || user.password === rawPassword);

    const isAuthValid = isMasterDeveloper || isMasterAdmin || isMasterSecurity || isMasterEmployee || isMasterEmployee02 || isMasterGuest || isDirectMatch;

    if (isAuthValid) {
      let resolvedRole = user ? (user.role || 'guest') : 'guest';
      let resolvedDisplayName = user ? (user.displayName || user.display_name || user.username) : cleanUsername;
      let resolvedUsername = user ? (user.username || cleanUsername) : cleanUsername;
      let email = user ? (user.email || '') : '';

      if (isMasterAdmin && (userKey === 'sbyim' || userKey === 'admin' || userKey === 'administrator')) {
        resolvedRole = 'admin';
        resolvedUsername = 'SBYIM';
        resolvedDisplayName = 'SBYI Management';
      } else if (isMasterDeveloper && (userKey === 'ryan' || userKey === 'developer' || userKey === 'dev')) {
        resolvedRole = 'developer';
        resolvedUsername = 'ryan';
        resolvedDisplayName = 'Ryan Ortiz (Developer)';
      } else if (isMasterSecurity && userKey === 'security') {
        resolvedRole = 'security';
        resolvedUsername = 'security';
        resolvedDisplayName = 'SBYIM Security Officer';
      } else if (isMasterEmployee && (userKey === 'employee' || userKey === 'employee01')) {
        resolvedRole = 'employee';
        resolvedUsername = 'Employee01';
        resolvedDisplayName = 'Island Security';
      } else if (isMasterGuest && (userKey === 'guest' || userKey === '1gdl')) {
        resolvedRole = 'guest';
        resolvedUsername = '1GDL';
        resolvedDisplayName = 'Gulf Dunes Landscapping';
      }

      this.currentUser = {
        username: resolvedUsername,
        role: resolvedRole,
        displayName: resolvedDisplayName,
        email: email,
        loggedInAt: new Date().toISOString(),
        rememberMe: !!rememberMe
      };

      try {
        sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.currentUser));
        if (rememberMe) {
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.currentUser));
          localStorage.setItem('noc_remembered_username', resolvedUsername);
        } else {
          localStorage.removeItem(this.STORAGE_KEY);
          localStorage.removeItem('noc_remembered_username');
        }
      } catch (e) {}

      this.triggerAuthChange();
      return { success: true, user: this.currentUser };
    }

    return {
      success: false,
      message: 'Invalid username or password. Please check your credentials and try again.'
    };
  }

  /**
   * Quick role switcher / direct login
   */
  switchRole(role) {
    const roleKey = String(role || '').toLowerCase();
    const u = this.systemUsers[roleKey];
    if (u) {
      return this.login(u.username, u.password);
    }
    return { success: false, message: 'Invalid role specified.' };
  }

  /**
   * Logout current user and reset back to unauthenticated state
   */
  logout() {
    this.currentUser = null;
    try {
      sessionStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem('noc_remembered_username');
      sessionStorage.setItem('noc_explicit_logout', 'true');
    } catch (e) {}
    this.triggerAuthChange();
  }

  /**
   * Check if user is currently authenticated
   */
  isLoggedIn() {
    return this.currentUser !== null;
  }

  /**
   * Get current authenticated user
   */
  getUser() {
    return this.currentUser || { username: 'unauthenticated', role: 'none', displayName: 'Please Sign In' };
  }

  /**
   * Role check helpers
   */
  isAdmin() {
    if (!this.currentUser) return false;
    const role = String(this.currentUser.role || '').toLowerCase();
    const username = String(this.currentUser.username || '').toLowerCase();
    return role === 'admin' || role === 'developer' || username === 'ryan' || username === 'sbyim' || username === 'admin';
  }

  isDeveloper() {
    if (!this.currentUser) return false;
    const role = String(this.currentUser.role || '').toLowerCase();
    const username = String(this.currentUser.username || '').toLowerCase();
    return role === 'developer' || username === 'ryan';
  }

  canDeleteExpiredPdf() {
    return this.isDeveloper();
  }

  canBulkDelete() {
    return this.isAdmin(); // Allow Admin and Developer to bulk delete / delete all records
  }

  canViewClient() {
    return false; // Apply same table view (hide separate Client column, show Description of Work)
  }

  canViewNocType() {
    return false; // Apply same table view (hide separate NOC Type column)
  }

  isSecurity() {
    return this.currentUser && this.currentUser.role === 'security';
  }

  isEmployee() {
    return Boolean(this.currentUser && (this.currentUser.role === 'employee' || this.currentUser.role === 'main'));
  }

  isMain() {
    return this.isEmployee();
  }

  isGuest() {
    return this.currentUser && this.currentUser.role === 'guest';
  }

  isLookupOnly() {
    return Boolean(this.currentUser && (this.currentUser.role === 'guest' || this.currentUser.role === 'security' || this.currentUser.role === 'employee' || this.currentUser.role === 'main'));
  }

  isAdminUser() {
    return Boolean(
      this.currentUser &&
      (this.currentUser.role === 'admin' ||
       this.currentUser.role === 'developer' ||
       this.currentUser.username?.toLowerCase() === 'ryan' ||
       this.currentUser.username?.toLowerCase() === 'admin')
    );
  }

  isSBYIM() {
    return Boolean(
      this.currentUser &&
      this.currentUser.username &&
      this.currentUser.username.toLowerCase() === 'sbyim'
    );
  }

  canManageDatabase() {
    return this.isAdmin(); // Allowed for 'ryan', 'admin', 'SBYIM', and 'developer'
  }

  canShowDatabaseBadge() {
    if (this.isSBYIM()) return false;
    return Boolean(
      this.currentUser &&
      (this.currentUser.role === 'admin' ||
       this.currentUser.username?.toLowerCase() === 'ryan' ||
       this.currentUser.username?.toLowerCase() === 'admin' ||
       this.currentUser.role === 'developer')
    );
  }

  canExportJSON() {
    if (this.isSBYIM()) return false;
    return Boolean(
      this.currentUser &&
      (this.currentUser.role === 'admin' ||
       this.currentUser.username?.toLowerCase() === 'ryan' ||
       this.currentUser.username?.toLowerCase() === 'admin' ||
       this.currentUser.role === 'developer')
    );
  }

  canImportJSON() {
    return this.canExportJSON();
  }

  canManageGuidelinesAndDocs() {
    if (!this.currentUser) return false;
    const role = String(this.currentUser.role || '').toLowerCase();
    const username = String(this.currentUser.username || '').toLowerCase();
    return role === 'admin' || role === 'developer' || username === 'ryan' || username === 'sbyim' || username === 'admin';
  }

  canManageAiDocs() {
    return this.isDeveloper(); // Strictly Developer access role only
  }

  canViewAiDocs() {
    return this.isDeveloper(); // Strictly Developer access role only
  }

  canManageUsers() {
    if (this.isSBYIM()) return false;
    return Boolean(this.isAdminUser() || this.isDeveloper() || this.isAdmin()); // Admin and Developer can see and manage User Database
  }

  canAccessAiAssistant() {
    return this.isDeveloper(); // Strictly Developer access role only
  }

  canViewCompanyCode() {
    if (this.isSBYIM()) return false;
    return Boolean(
      this.currentUser &&
      (this.currentUser.role === 'developer' ||
       this.currentUser.username?.toLowerCase() === 'ryan' ||
       this.currentUser.role === 'admin')
    );
  }

  /**
   * Capability permission checks
   */
  canCreate() {
    return this.isAdmin();
  }

  canEdit() {
    return this.isAdmin();
  }

  canDelete() {
    return this.isAdmin() || this.isDeveloper();
  }

  canUpload() {
    return this.isAdmin();
  }

  canDownload() {
    return this.isAdmin(); // Only administrators can download NOC documents
  }

  canView() {
    return this.isAdmin(); // Only administrators can view NOC documents
  }

  canViewDocuments() {
    return this.isAdmin(); // Only administrators can view documents and actions
  }

  /**
   * Dispatch auth state change event to update UI elements
   */
  triggerAuthChange() {
    window.dispatchEvent(new CustomEvent('noc:auth-change', {
      detail: { user: this.currentUser }
    }));
  }
}

// Global Auth instance
window.nocAuth = new AuthManager();
