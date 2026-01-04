#!/usr/bin/env node

/**
 * Simple CLI to view productivity database contents
 * Uses macOS built-in sqlite3 command to avoid native module issues
 *
 * Usage: node scripts/view-db.js [command]
 *
 * Commands:
 *   today     - Show today's summary
 *   recent    - Show last 20 activity records
 *   apps      - Show top apps today
 *   stats     - Show category breakdown
 *   dates     - Show all dates with data
 */

const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const DB_PATH = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'productivity-tracker',
  'productivity.db'
);

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

function runQuery(sql) {
  try {
    const result = execSync(`sqlite3 -header -column "${DB_PATH}" "${sql}"`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    return result.trim();
  } catch (error) {
    if (error.status === 1 && !error.stdout) {
      return ''; // Empty result
    }
    throw error;
  }
}

function main() {
  console.log('Database:', DB_PATH);
  console.log('');

  if (!fs.existsSync(DB_PATH)) {
    console.log('Database not found!');
    console.log('Run the Electron app first to create the database.');
    process.exit(1);
  }

  const command = process.argv[2] || 'today';
  const today = getTodayDate();

  switch (command) {
    case 'today': {
      console.log(`=== Today's Summary (${today}) ===\n`);

      const result = runQuery(`
        SELECT
          COUNT(*) as total_records,
          SUM(CASE WHEN is_idle = 0 THEN 1 ELSE 0 END) as active_records,
          SUM(CASE WHEN is_idle = 1 THEN 1 ELSE 0 END) as idle_records,
          ROUND(SUM(CASE WHEN is_idle = 0 THEN 1 ELSE 0 END) * 5.0 / 60, 1) as active_minutes,
          ROUND(SUM(CASE WHEN is_idle = 1 THEN 1 ELSE 0 END) * 5.0 / 60, 1) as idle_minutes
        FROM activity_log
        WHERE date = '${today}'
      `);

      if (result) {
        console.log(result);
      } else {
        console.log('No data recorded today yet.');
      }
      break;
    }

    case 'recent': {
      console.log('=== Last 20 Activity Records ===\n');

      const result = runQuery(`
        SELECT
          substr(timestamp, 12, 8) as time,
          COALESCE(app_name, '(idle)') as app,
          category,
          substr(COALESCE(window_title, ''), 1, 40) as title
        FROM activity_log
        ORDER BY timestamp DESC
        LIMIT 20
      `);

      if (result) {
        console.log(result);
      } else {
        console.log('No records found.');
      }
      break;
    }

    case 'apps': {
      console.log(`=== Top Apps Today (${today}) ===\n`);

      const result = runQuery(`
        SELECT
          app_name,
          category,
          COUNT(*) as records,
          ROUND(COUNT(*) * 5.0 / 60, 1) as minutes
        FROM activity_log
        WHERE date = '${today}' AND is_idle = 0 AND app_name IS NOT NULL
        GROUP BY app_name
        ORDER BY records DESC
        LIMIT 15
      `);

      if (result) {
        console.log(result);
      } else {
        console.log('No app data today.');
      }
      break;
    }

    case 'stats': {
      console.log(`=== Category Breakdown Today (${today}) ===\n`);

      const result = runQuery(`
        SELECT
          category,
          COUNT(*) as records,
          ROUND(COUNT(*) * 5.0 / 60, 1) as minutes
        FROM activity_log
        WHERE date = '${today}'
        GROUP BY category
        ORDER BY records DESC
      `);

      if (result) {
        console.log(result);
      } else {
        console.log('No data today.');
      }
      break;
    }

    case 'dates': {
      console.log('=== Dates with Activity Data ===\n');

      const result = runQuery(`
        SELECT date, COUNT(*) as records
        FROM activity_log
        GROUP BY date
        ORDER BY date DESC
      `);

      if (result) {
        console.log(result);
      } else {
        console.log('No data recorded yet.');
      }
      break;
    }

    default:
      console.log('Unknown command:', command);
      console.log('\nAvailable commands: today, recent, apps, stats, dates');
  }
}

main();
