#!/usr/bin/env node

/**
 * Simple CLI to view productivity database contents
 * Usage: node scripts/view-db.js [command] [options]
 *
 * Commands:
 *   today     - Show today's summary
 *   recent    - Show last 20 activity records
 *   apps      - Show top apps today
 *   stats     - Show category breakdown
 *   dates     - Show all dates with data
 */

const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

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

function formatMinutes(mins) {
  if (mins < 1) return '< 1m';
  if (mins < 60) return `${Math.round(mins)}m`;
  const hours = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m === 0 ? `${hours}h` : `${hours}h ${m}m`;
}

function main() {
  const fs = require('fs');

  if (!fs.existsSync(DB_PATH)) {
    console.log('Database not found at:', DB_PATH);
    console.log('Run the app first to create the database.');
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });
  const command = process.argv[2] || 'today';
  const today = getTodayDate();

  console.log('Database:', DB_PATH);
  console.log('');

  switch (command) {
    case 'today': {
      console.log(`=== Today's Summary (${today}) ===\n`);

      const totals = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN is_idle = 0 THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN is_idle = 1 THEN 1 ELSE 0 END) as idle
        FROM activity_log WHERE date = ?
      `).get(today);

      if (!totals || totals.total === 0) {
        console.log('No data recorded today yet.');
        break;
      }

      console.log(`Active time: ${formatMinutes((totals.active || 0) * 5 / 60)}`);
      console.log(`Idle time:   ${formatMinutes((totals.idle || 0) * 5 / 60)}`);
      console.log(`Total records: ${totals.total}`);
      break;
    }

    case 'recent': {
      console.log('=== Last 20 Activity Records ===\n');

      const records = db.prepare(`
        SELECT timestamp, app_name, window_title, category, is_idle
        FROM activity_log
        ORDER BY timestamp DESC
        LIMIT 20
      `).all();

      if (records.length === 0) {
        console.log('No records found.');
        break;
      }

      for (const r of records) {
        const time = r.timestamp.split('T')[1].split('.')[0];
        const app = r.app_name || '(idle)';
        const title = r.window_title ? r.window_title.substring(0, 40) : '';
        console.log(`${time} | ${app.padEnd(20)} | ${r.category.padEnd(12)} | ${title}`);
      }
      break;
    }

    case 'apps': {
      console.log(`=== Top Apps Today (${today}) ===\n`);

      const apps = db.prepare(`
        SELECT app_name, category, COUNT(*) as count,
               ROUND(COUNT(*) * 5.0 / 60, 1) as minutes
        FROM activity_log
        WHERE date = ? AND is_idle = 0 AND app_name IS NOT NULL
        GROUP BY app_name
        ORDER BY count DESC
        LIMIT 15
      `).all(today);

      if (apps.length === 0) {
        console.log('No app data today.');
        break;
      }

      for (const app of apps) {
        console.log(`${formatMinutes(app.minutes).padStart(8)} | ${app.app_name.padEnd(25)} | ${app.category}`);
      }
      break;
    }

    case 'stats': {
      console.log(`=== Category Breakdown Today (${today}) ===\n`);

      const stats = db.prepare(`
        SELECT category, COUNT(*) as count,
               ROUND(COUNT(*) * 5.0 / 60, 1) as minutes
        FROM activity_log
        WHERE date = ?
        GROUP BY category
        ORDER BY count DESC
      `).all(today);

      if (stats.length === 0) {
        console.log('No data today.');
        break;
      }

      for (const s of stats) {
        const bar = '█'.repeat(Math.min(30, Math.round(s.minutes)));
        console.log(`${s.category.padEnd(15)} ${formatMinutes(s.minutes).padStart(8)} ${bar}`);
      }
      break;
    }

    case 'dates': {
      console.log('=== Dates with Activity Data ===\n');

      const dates = db.prepare(`
        SELECT date, COUNT(*) as records
        FROM activity_log
        GROUP BY date
        ORDER BY date DESC
      `).all();

      if (dates.length === 0) {
        console.log('No data recorded yet.');
        break;
      }

      for (const d of dates) {
        console.log(`${d.date}: ${d.records} records`);
      }
      break;
    }

    default:
      console.log('Unknown command:', command);
      console.log('\nAvailable commands: today, recent, apps, stats, dates');
  }

  db.close();
}

main();
