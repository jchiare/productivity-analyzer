const fs = require('fs');
const Database = require('better-sqlite3');
const { DB_PATH, CATEGORY_COLORS, CATEGORY_LABELS } = require('../config/constants');

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get activity data for a specific date
 */
function getDataForDate(date) {
  if (!fs.existsSync(DB_PATH)) {
    return null;
  }

  const db = new Database(DB_PATH, { readonly: true });

  try {
    // Get summary
    const summaryStmt = db.prepare(`
      SELECT
        COUNT(*) as total_records,
        SUM(CASE WHEN is_idle = 0 THEN 1 ELSE 0 END) as active_records,
        SUM(CASE WHEN is_idle = 1 THEN 1 ELSE 0 END) as idle_records
      FROM activity_log
      WHERE date = ?
    `);
    const totals = summaryStmt.get(date);

    // Get context switches
    const switchStmt = db.prepare(`
      SELECT app_name FROM activity_log
      WHERE date = ? AND is_idle = 0
      ORDER BY timestamp ASC
    `);
    const records = switchStmt.all(date);
    let switches = 0;
    let lastApp = null;
    for (const record of records) {
      if (lastApp !== null && record.app_name !== lastApp) switches++;
      lastApp = record.app_name;
    }

    // Get category breakdown
    const categoryStmt = db.prepare(`
      SELECT category, COUNT(*) as record_count, ROUND(COUNT(*) * 5.0 / 60, 2) as minutes
      FROM activity_log WHERE date = ?
      GROUP BY category ORDER BY record_count DESC
    `);
    const categoryBreakdown = categoryStmt.all(date);

    // Get detailed breakdown per category
    const detailStmt = db.prepare(`
      SELECT
        category,
        app_name,
        window_title,
        COUNT(*) as record_count,
        ROUND(COUNT(*) * 5.0 / 60, 2) as minutes
      FROM activity_log
      WHERE date = ? AND is_idle = 0
      GROUP BY category, app_name, window_title
      ORDER BY category, record_count DESC
    `);
    const detailRows = detailStmt.all(date);

    const categoryDetails = {};
    for (const row of detailRows) {
      if (!categoryDetails[row.category]) {
        categoryDetails[row.category] = [];
      }
      categoryDetails[row.category].push({
        app_name: row.app_name,
        window_title: row.window_title,
        minutes: row.minutes
      });
    }

    // Get hourly breakdown
    const hourlyStmt = db.prepare(`
      SELECT hour, category, COUNT(*) as record_count, ROUND(COUNT(*) * 5.0 / 60, 2) as minutes
      FROM activity_log WHERE date = ?
      GROUP BY hour, category ORDER BY hour ASC, record_count DESC
    `);
    const hourlyRaw = hourlyStmt.all(date);
    const hourlyMap = {};
    for (const row of hourlyRaw) {
      if (!hourlyMap[row.hour]) hourlyMap[row.hour] = { hour: row.hour };
      hourlyMap[row.hour][row.category] = row.minutes;
    }
    const hourlyPattern = Object.values(hourlyMap).sort((a, b) => a.hour - b.hour);

    // Get top apps
    const appsStmt = db.prepare(`
      SELECT app_name, category, COUNT(*) as record_count, ROUND(COUNT(*) * 5.0 / 60, 2) as minutes
      FROM activity_log WHERE date = ? AND is_idle = 0 AND app_name IS NOT NULL
      GROUP BY app_name ORDER BY record_count DESC LIMIT 15
    `);
    const topApps = appsStmt.all(date);

    // Get sample window titles for analysis
    const titlesStmt = db.prepare(`
      SELECT DISTINCT window_title FROM activity_log
      WHERE date = ? AND window_title IS NOT NULL
      ORDER BY RANDOM() LIMIT 50
    `);
    const sampleTitles = titlesStmt.all(date).map(r => r.window_title);

    db.close();

    return {
      date,
      summary: {
        total_active_minutes: Math.round((totals?.active_records || 0) * 5 / 60),
        total_idle_minutes: Math.round((totals?.idle_records || 0) * 5 / 60),
        context_switches: switches
      },
      category_breakdown: categoryBreakdown.map(c => ({
        ...c,
        color: CATEGORY_COLORS[c.category] || CATEGORY_COLORS.other,
        label: CATEGORY_LABELS[c.category] || 'Other'
      })),
      category_details: categoryDetails,
      hourly_pattern: hourlyPattern,
      top_apps: topApps.map(a => ({
        ...a,
        color: CATEGORY_COLORS[a.category] || CATEGORY_COLORS.other,
        label: CATEGORY_LABELS[a.category] || 'Other'
      })),
      sample_window_titles: sampleTitles,
      category_colors: CATEGORY_COLORS,
      category_labels: CATEGORY_LABELS
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

module.exports = {
  getTodayDate,
  getDataForDate
};
