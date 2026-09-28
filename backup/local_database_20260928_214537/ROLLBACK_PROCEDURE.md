# NOC Portal - Database Rollback & Restoration Procedure

**Backup Directory:** `backup/local_database_20260928_214537/`  
**Timestamp:** `2026-09-28 21:45:37 UTC+04:00`  

---

## 1. Overview
This procedure allows an administrator or developer to immediately revert the NOC Portal from Supabase PostgreSQL back to the local database without data loss.

---

## 2. Instant Client-Side Rollback (Revert to Local Mode)

If at any point you want the web app to disconnect from Supabase and use local browser storage:

### Method A: Via Portal User Interface
1. In the top navigation bar, click the **Database Status Badge** (`Database: Supabase / Local`).
2. Click **"Disconnect / Revert to Local Mode"**.
3. Confirm the action. The application will instantly switch to local storage.

### Method B: Via Developer Console
Open DevTools Console (`F12`) and run:
```javascript
window.supabaseManager.clearCredentials();
location.reload();
```

---

## 3. Restoring Local Data from Backup JSON

To restore all data structures from this backup:

1. Open DevTools Console (`F12`) on the application page.
2. Load the backup dataset from [`seed_data_backup.json`](file:///d:/System%20Program/NOC%20Web_Supabase/backup/local_database_20260928_214537/seed_data_backup.json).
3. Execute the restoration helper:
```javascript
fetch('backup/local_database_20260928_214537/seed_data_backup.json')
  .then(res => res.json())
  .then(async (backup) => {
    localStorage.setItem('noc_custom_types', JSON.stringify(backup.customTypes));
    localStorage.setItem('noc_custom_contractors', JSON.stringify(backup.customContractors));
    localStorage.setItem('noc_users_v2', JSON.stringify(backup.users));
    localStorage.setItem('noc_contractor_renames', JSON.stringify(backup.settings.noc_contractor_renames));
    if (backup.nocRecords && backup.nocRecords.length > 0) {
      await window.nocDB.bulkInsert(backup.nocRecords);
    }
    console.log('✅ Local database successfully restored from backup!');
    location.reload();
  });
```

---

## 4. Restoring PostgreSQL Schema & Records (if needed)

If you need to reconstruct the PostgreSQL database structure:
1. Open Supabase Dashboard > SQL Editor.
2. Run [`schema_backup.sql`](file:///d:/System%20Program/NOC%20Web_Supabase/backup/local_database_20260928_214537/schema_backup.sql).
3. Run [`seed_data_backup.sql`](file:///d:/System%20Program/NOC%20Web_Supabase/backup/local_database_20260928_214537/seed_data_backup.sql).
