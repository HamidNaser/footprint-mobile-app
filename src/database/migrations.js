/**
 * Database Migrations
 * 
 * This file contains migration scripts to upgrade the database schema
 * between versions. Each migration is idempotent and can be safely
 * run multiple times.
 */

/**
 * Migration definitions
 * Each migration has:
 * - version: The schema version this migration upgrades to
 * - description: What this migration does
 * - up: SQL statements to apply the migration
 * - down: SQL statements to rollback (optional, for development)
 */
export const migrations = [
  {
    version: 1,
    description: 'Initial schema - journal entries, media queue, sync metadata',
    up: [
      // This is handled by CREATE_TABLES in schema.js
      // No additional migration needed for v1
    ],
    down: [
      'DROP TABLE IF EXISTS sync_queue;',
      'DROP TABLE IF EXISTS cached_comments;',
      'DROP TABLE IF EXISTS cached_users;',
      'DROP TABLE IF EXISTS sync_metadata;',
      'DROP TABLE IF EXISTS media_queue;',
      'DROP TABLE IF EXISTS journal_entries;',
      'DROP TABLE IF EXISTS schema_version;',
    ],
  },
  {
    version: 2,
    description: 'Rebuild sync_queue to match SyncQueue.js, which never matched it',
    up: [
      // The table and its only live consumer have disagreed since the sync engine landed.
      // schema.js created entity_type/entity_local_id/last_attempt_at; SyncQueue.js — used
      // by SyncEngine and JournalRepository — writes entity_id/server_id/priority/
      // updated_at/completed_at. Every enqueue therefore failed with "no such column", and
      // the failure was swallowed: entries saved locally, reported success, and silently
      // never synced. It only became visible when a logout reset the database and
      // recreated the table from schema.js rather than leaving an older one in place.
      //
      // Dropped rather than migrated column by column. Nothing was ever successfully
      // written here — the inserts are exactly what was failing — so there is no pending
      // work to preserve, and SQLite cannot add NOT NULL columns to an existing table
      // without a rebuild anyway.
      //
      // The losing shape still has a reader: DatabaseService.js:481-543. Nothing calls it
      // (no reference to getSyncQueue/addToSyncQueue exists anywhere in src/), so it is
      // dead code left in place rather than deleted as part of a bug fix.
      'DROP TABLE IF EXISTS sync_queue;',
      `CREATE TABLE sync_queue (
        id TEXT PRIMARY KEY,
        operation_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        server_id TEXT,
        payload TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        priority INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        completed_at TEXT
      );`,
      'CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);',
      'CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_id);',
    ],
    down: [
      'DROP TABLE IF EXISTS sync_queue;',
    ],
  },
  {
    version: 3,
    description: 'Add the sync_queue columns v2 missed: result and conflict_data',
    up: [
      // v2 rebuilt this table from SyncQueue.js's INSERT statements and stopped there. The
      // UPDATEs use two more columns that no insert mentions: `result`, written when an
      // operation succeeds, and `conflict_data`, written when one conflicts. So enqueueing
      // worked and completing did not -- an operation would push, succeed, and then fail to
      // record that it had, leaving it to be retried forever.
      //
      // Added rather than rebuilt: unlike v2 there are now real rows here, and they are
      // pending sync operations. Dropping the table would discard work the user has done
      // and believes is saved. ALTER TABLE ADD COLUMN is safe for nullable columns.
      'ALTER TABLE sync_queue ADD COLUMN result TEXT;',
      'ALTER TABLE sync_queue ADD COLUMN conflict_data TEXT;',
    ],
    down: [
      // SQLite cannot drop columns without a table rebuild; leaving them is harmless.
    ],
  },
  // Future migrations will be added here
  // {
  //   version: 2,
  //   description: 'Add new column for feature X',
  //   up: [
  //     'ALTER TABLE journal_entries ADD COLUMN new_field TEXT;',
  //   ],
  //   down: [
  //     // SQLite doesn't support DROP COLUMN easily
  //   ],
  // },
];

/**
 * Get the latest schema version
 */
export const getLatestVersion = () => {
  if (migrations.length === 0) return 1;
  return Math.max(...migrations.map(m => m.version));
};

/**
 * Get migrations that need to be applied
 * @param {number} currentVersion - Current database schema version
 * @returns {Array} Migrations to apply
 */
export const getPendingMigrations = (currentVersion) => {
  return migrations
    .filter(m => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);
};

/**
 * Apply a single migration
 * @param {SQLiteDatabase} db - Database instance
 * @param {object} migration - Migration to apply
 */
export const applyMigration = async (db, migration) => {
  console.log(`[Migration] Applying v${migration.version}: ${migration.description}`);
  
  try {
    // Run all up statements
    for (const statement of migration.up) {
      if (statement && statement.trim()) {
        await db.runAsync(statement);
      }
    }
    
    // Record the migration
    await db.runAsync(
      'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)',
      [migration.version, Date.now()]
    );
    
    console.log(`[Migration] Successfully applied v${migration.version}`);
    return true;
  } catch (error) {
    console.error(`[Migration] Failed to apply v${migration.version}:`, error);
    throw error;
  }
};

/**
 * Run all pending migrations
 * @param {SQLiteDatabase} db - Database instance
 * @param {number} currentVersion - Current database schema version
 */
export const runMigrations = async (db, currentVersion) => {
  const pending = getPendingMigrations(currentVersion);
  
  if (pending.length === 0) {
    console.log('[Migration] Database is up to date');
    return currentVersion;
  }
  
  console.log(`[Migration] Found ${pending.length} pending migration(s)`);
  
  let newVersion = currentVersion;
  
  for (const migration of pending) {
    await applyMigration(db, migration);
    newVersion = migration.version;
  }
  
  return newVersion;
};
