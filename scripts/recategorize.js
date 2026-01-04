#!/usr/bin/env node

/**
 * Recategorize existing activity logs based on current categorization rules
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');
const { categorize } = require('../src/categorize');

const APP_SUPPORT_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'productivity-tracker');
const DB_PATH = path.join(APP_SUPPORT_DIR, 'productivity.db');

function recategorize() {
  if (!fs.existsSync(DB_PATH)) {
    console.log('Database not found');
    return;
  }

  const db = new Database(DB_PATH);

  // Get all records
  const records = db.prepare('SELECT id, app_name, window_title, bundle_id, category FROM activity_log').all();
  console.log(`Found ${records.length} records to recategorize`);

  const updateStmt = db.prepare('UPDATE activity_log SET category = ? WHERE id = ?');

  let updated = 0;
  const changes = {};

  const updateMany = db.transaction((records) => {
    for (const record of records) {
      const newCategory = categorize({
        appName: record.app_name,
        windowTitle: record.window_title,
        bundleId: record.bundle_id
      });

      if (newCategory !== record.category) {
        updateStmt.run(newCategory, record.id);
        updated++;

        const key = `${record.category} -> ${newCategory}`;
        changes[key] = (changes[key] || 0) + 1;
      }
    }
  });

  updateMany(records);

  console.log(`\nUpdated ${updated} records`);
  console.log('\nChanges:');
  for (const [change, count] of Object.entries(changes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${change}: ${count}`);
  }

  db.close();
}

recategorize();
