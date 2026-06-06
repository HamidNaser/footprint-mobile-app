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
