const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const { DB_PATH, CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_HIERARCHY, CATEGORY_TO_PARENT } = require('../config/constants');

// Path to learned categories
const LEARNED_CATEGORIES_PATH = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'productivity-tracker',
  'learned-categories.json'
);

/**
 * Load learned categories and merge with static hierarchy
 */
function getEffectiveHierarchy() {
  // Start with static hierarchy
  const hierarchy = JSON.parse(JSON.stringify(CATEGORY_HIERARCHY));
  const categoryToParent = { ...CATEGORY_TO_PARENT };

  // Load learned patterns
  if (fs.existsSync(LEARNED_CATEGORIES_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(LEARNED_CATEGORIES_PATH, 'utf8'));
      const patterns = data.patterns || [];

      for (const pattern of patterns) {
        const categoryName = pattern.suggestedName || pattern.patternKey;
        const parentName = pattern.suggestedParent || pattern.parentCategory || 'Browsing';

        // Add to parent category's children
        if (hierarchy[parentName]) {
          if (!hierarchy[parentName].children.includes(categoryName)) {
            hierarchy[parentName].children.push(categoryName);
          }
        }

        // Add to reverse lookup
        categoryToParent[categoryName] = parentName;
      }
    } catch (e) {
      // Ignore errors, use static hierarchy
    }
  }

  return { hierarchy, categoryToParent };
}

/**
 * Aggregate category breakdown by parent category
 */
function aggregateByParentCategory(categoryBreakdown, categoryDetails) {
  const { hierarchy, categoryToParent } = getEffectiveHierarchy();
  const parentAggregates = {};

  for (const cat of categoryBreakdown) {
    const parentName = categoryToParent[cat.category] || 'Other';
    const parentConfig = hierarchy[parentName] || hierarchy['Other'];

    if (!parentAggregates[parentName]) {
      parentAggregates[parentName] = {
        category: parentName,
        label: parentName,
        color: parentConfig.color,
        minutes: 0,
        record_count: 0,
        subcategories: []
      };
    }

    parentAggregates[parentName].minutes += cat.minutes;
    parentAggregates[parentName].record_count += cat.record_count;

    // Get label - check learned patterns for custom labels
    let label = CATEGORY_LABELS[cat.category];
    let color = CATEGORY_COLORS[cat.category];

    if (!label) {
      // Check if it's a learned pattern
      if (fs.existsSync(LEARNED_CATEGORIES_PATH)) {
        try {
          const data = JSON.parse(fs.readFileSync(LEARNED_CATEGORIES_PATH, 'utf8'));
          const learnedPattern = (data.patterns || []).find(
            p => (p.suggestedName || p.patternKey) === cat.category
          );
          if (learnedPattern) {
            label = learnedPattern.suggestedLabel || learnedPattern.patternKey;
            // Use parent's color for learned categories
            color = parentConfig.color;
          }
        } catch (e) {
          // Use defaults
        }
      }
      if (!label) {
        // Fallback: capitalize the category name
        label = cat.category.charAt(0).toUpperCase() + cat.category.slice(1).replace(/_/g, ' ');
      }
    }

    parentAggregates[parentName].subcategories.push({
      category: cat.category,
      label: label,
      color: color || CATEGORY_COLORS.other,
      minutes: cat.minutes,
      record_count: cat.record_count,
      details: categoryDetails[cat.category] || []
    });
  }

  // Sort subcategories by minutes descending
  for (const parent of Object.values(parentAggregates)) {
    parent.subcategories.sort((a, b) => b.minutes - a.minutes);
  }

  // Convert to array and sort by minutes descending
  return Object.values(parentAggregates).sort((a, b) => b.minutes - a.minutes);
}

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

    // Build flat category breakdown with colors/labels
    const flatCategoryBreakdown = categoryBreakdown.map(c => ({
      ...c,
      color: CATEGORY_COLORS[c.category] || CATEGORY_COLORS.other,
      label: CATEGORY_LABELS[c.category] || 'Other'
    }));

    // Build hierarchical category breakdown
    const hierarchicalBreakdown = aggregateByParentCategory(categoryBreakdown, categoryDetails);

    return {
      date,
      summary: {
        total_active_minutes: Math.round((totals?.active_records || 0) * 5 / 60),
        total_idle_minutes: Math.round((totals?.idle_records || 0) * 5 / 60),
        context_switches: switches
      },
      category_breakdown: flatCategoryBreakdown,
      category_hierarchy: hierarchicalBreakdown,
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
