const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Database path in Application Support directory
const APP_SUPPORT_DIR = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'productivity-tracker'
);
const DB_PATH = path.join(APP_SUPPORT_DIR, 'productivity.db');

let db = null;

/**
 * Initialize the database and create tables if they don't exist
 */
function initDatabase() {
  // Ensure the directory exists
  if (!fs.existsSync(APP_SUPPORT_DIR)) {
    fs.mkdirSync(APP_SUPPORT_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // Create the activity_log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      date TEXT NOT NULL,
      hour INTEGER NOT NULL,
      app_name TEXT,
      window_title TEXT,
      url TEXT,
      bundle_id TEXT,
      is_idle INTEGER DEFAULT 0,
      category TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_date ON activity_log(date);
    CREATE INDEX IF NOT EXISTS idx_timestamp ON activity_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_app_name ON activity_log(app_name);
  `);

  return db;
}

/**
 * Get the database instance (initializes if needed)
 */
function getDatabase() {
  if (!db) {
    initDatabase();
  }
  return db;
}

/**
 * Log an activity record
 * @param {Object} data - Activity data
 */
function logActivity(data) {
  const db = getDatabase();
  const now = new Date();

  const stmt = db.prepare(`
    INSERT INTO activity_log (timestamp, date, hour, app_name, window_title, url, bundle_id, is_idle, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    data.timestamp || now.toISOString(),
    data.date || now.toISOString().split('T')[0],
    data.hour !== undefined ? data.hour : now.getHours(),
    data.app_name || null,
    data.window_title || null,
    data.url || null,
    data.bundle_id || null,
    data.is_idle ? 1 : 0,
    data.category || 'other'
  );
}

/**
 * Get all activity records for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 */
function getActivityByDate(date) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM activity_log
    WHERE date = ?
    ORDER BY timestamp ASC
  `);
  return stmt.all(date);
}

/**
 * Get aggregated time per category for a specific date
 * Each record represents 5 seconds of activity
 * @param {string} date - Date in YYYY-MM-DD format
 */
function getCategoryStats(date) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      category,
      COUNT(*) as record_count,
      ROUND(COUNT(*) * 5.0 / 60, 2) as minutes
    FROM activity_log
    WHERE date = ?
    GROUP BY category
    ORDER BY record_count DESC
  `);
  return stmt.all(date);
}

/**
 * Get hourly breakdown of activity for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 */
function getHourlyBreakdown(date) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      hour,
      category,
      COUNT(*) as record_count,
      ROUND(COUNT(*) * 5.0 / 60, 2) as minutes
    FROM activity_log
    WHERE date = ?
    GROUP BY hour, category
    ORDER BY hour ASC, record_count DESC
  `);

  const rawData = stmt.all(date);

  // Transform into hourly objects with category breakdowns
  const hourlyMap = {};
  for (const row of rawData) {
    if (!hourlyMap[row.hour]) {
      hourlyMap[row.hour] = { hour: row.hour };
    }
    hourlyMap[row.hour][row.category] = row.minutes;
  }

  return Object.values(hourlyMap).sort((a, b) => a.hour - b.hour);
}

/**
 * Get the number of context switches (app changes) for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 */
function getContextSwitchCount(date) {
  const db = getDatabase();

  // Get all records ordered by timestamp
  const stmt = db.prepare(`
    SELECT app_name FROM activity_log
    WHERE date = ? AND is_idle = 0
    ORDER BY timestamp ASC
  `);
  const records = stmt.all(date);

  // Count switches
  let switches = 0;
  let lastApp = null;

  for (const record of records) {
    if (lastApp !== null && record.app_name !== lastApp) {
      switches++;
    }
    lastApp = record.app_name;
  }

  return switches;
}

/**
 * Get top apps by usage time for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {number} limit - Maximum number of apps to return
 */
function getTopApps(date, limit = 10) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      app_name,
      category,
      COUNT(*) as record_count,
      ROUND(COUNT(*) * 5.0 / 60, 2) as minutes
    FROM activity_log
    WHERE date = ? AND is_idle = 0 AND app_name IS NOT NULL
    GROUP BY app_name
    ORDER BY record_count DESC
    LIMIT ?
  `);
  return stmt.all(date, limit);
}

/**
 * Get sample window titles for context
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {number} limit - Maximum number of titles to return
 */
function getSampleWindowTitles(date, limit = 50) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT DISTINCT window_title
    FROM activity_log
    WHERE date = ? AND window_title IS NOT NULL AND is_idle = 0
    ORDER BY RANDOM()
    LIMIT ?
  `);
  return stmt.all(date, limit).map(row => row.window_title);
}

/**
 * Get summary statistics for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 */
function getDaySummary(date) {
  const db = getDatabase();

  const totalStmt = db.prepare(`
    SELECT
      COUNT(*) as total_records,
      SUM(CASE WHEN is_idle = 0 THEN 1 ELSE 0 END) as active_records,
      SUM(CASE WHEN is_idle = 1 THEN 1 ELSE 0 END) as idle_records
    FROM activity_log
    WHERE date = ?
  `);
  const totals = totalStmt.get(date);

  return {
    total_active_minutes: Math.round((totals?.active_records || 0) * 5 / 60),
    total_idle_minutes: Math.round((totals?.idle_records || 0) * 5 / 60),
    context_switches: getContextSwitchCount(date)
  };
}

/**
 * Delete old records (data retention cleanup)
 * @param {number} daysToKeep - Number of days of data to keep
 */
function cleanupOldData(daysToKeep = 30) {
  const db = getDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  const stmt = db.prepare(`DELETE FROM activity_log WHERE date < ?`);
  const result = stmt.run(cutoffDateStr);
  return result.changes;
}

/**
 * Close the database connection
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Get available dates with activity data
 */
function getAvailableDates() {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT DISTINCT date
    FROM activity_log
    ORDER BY date DESC
  `);
  return stmt.all().map(row => row.date);
}

module.exports = {
  initDatabase,
  getDatabase,
  logActivity,
  getActivityByDate,
  getCategoryStats,
  getHourlyBreakdown,
  getContextSwitchCount,
  getTopApps,
  getSampleWindowTitles,
  getDaySummary,
  cleanupOldData,
  closeDatabase,
  getAvailableDates,
  DB_PATH,
  APP_SUPPORT_DIR
};
