#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const os = require('os');

// Handle running via Electron CLI
let app = null;
try {
  app = require('electron').app;
} catch (e) {
  // Running via regular node - that's fine if better-sqlite3 works
}

const Database = require('better-sqlite3');

// Database path
const APP_SUPPORT_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'productivity-tracker');
const DB_PATH = path.join(APP_SUPPORT_DIR, 'productivity.db');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

// Category colors and labels
const CATEGORY_COLORS = {
  coding: '#10B981',
  communication: '#3B82F6',
  work_browsing: '#8B5CF6',
  social_media: '#EC4899',
  browsing: '#F59E0B',
  writing: '#06B6D4',
  design: '#F97316',
  entertainment: '#EF4444',
  productivity: '#14B8A6',
  finance: '#6366F1',
  idle: '#9CA3AF',
  other: '#6B7280'
};

const CATEGORY_LABELS = {
  coding: 'Coding',
  communication: 'Communication',
  work_browsing: 'Work Browsing',
  social_media: 'Social Media',
  browsing: 'Browsing',
  writing: 'Writing',
  design: 'Design',
  entertainment: 'Entertainment',
  productivity: 'Productivity',
  finance: 'Finance',
  idle: 'Idle',
  other: 'Other'
};

function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
}

function getCategoryLabel(category) {
  return CATEGORY_LABELS[category] || 'Other';
}

function formatTime(minutes) {
  if (minutes < 1) return '< 1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

    // Get detailed breakdown per category (apps and window titles)
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

    // Organize details by category
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

    db.close();

    return {
      summary: {
        total_active_minutes: Math.round((totals?.active_records || 0) * 5 / 60),
        total_idle_minutes: Math.round((totals?.idle_records || 0) * 5 / 60),
        context_switches: switches
      },
      category_breakdown: categoryBreakdown,
      category_details: categoryDetails,
      hourly_pattern: hourlyPattern,
      top_apps: topApps
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

function generatePieChart(categoryBreakdown, categoryDetails) {
  const total = categoryBreakdown.reduce((sum, c) => sum + c.minutes, 0);
  if (total === 0) return '<p class="no-data">No data yet</p>';

  const size = 200;
  const center = size / 2;
  const radius = 80;
  let currentAngle = -90;
  const paths = [];
  const legend = [];

  categoryBreakdown.forEach((cat) => {
    if (cat.minutes === 0) return;
    const percentage = (cat.minutes / total) * 100;
    const angle = (cat.minutes / total) * 360;
    const color = getCategoryColor(cat.category);
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;

    if (angle < 360) {
      paths.push(`<path d="M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z"
        fill="${color}" stroke="white" stroke-width="2" class="pie-slice" data-category="${cat.category}">
        <title>${getCategoryLabel(cat.category)}: ${formatTime(cat.minutes)} (${percentage.toFixed(1)}%)</title>
      </path>`);
    } else {
      paths.push(`<circle cx="${center}" cy="${center}" r="${radius}" fill="${color}" class="pie-slice" data-category="${cat.category}" />`);
    }

    // Generate detail items for this category
    const details = categoryDetails[cat.category] || [];
    // Group by app first, then show top window titles
    const appGroups = {};
    for (const d of details) {
      const app = d.app_name || 'Unknown';
      if (!appGroups[app]) appGroups[app] = { minutes: 0, titles: [] };
      appGroups[app].minutes += d.minutes;
      if (d.window_title && appGroups[app].titles.length < 3) {
        appGroups[app].titles.push({ title: d.window_title, minutes: d.minutes });
      }
    }

    const sortedApps = Object.entries(appGroups)
      .sort((a, b) => b[1].minutes - a[1].minutes)
      .slice(0, 8);

    const detailHtml = sortedApps.map(([appName, data]) => {
      const titlesHtml = data.titles
        .slice(0, 2)
        .map(t => `<div class="detail-title">${escapeHtml(t.title.substring(0, 60))}${t.title.length > 60 ? '...' : ''}</div>`)
        .join('');
      return `<div class="detail-app">
        <div class="detail-app-header">
          <span class="detail-app-name">${escapeHtml(appName)}</span>
          <span class="detail-app-time">${formatTime(data.minutes)}</span>
        </div>
        ${titlesHtml}
      </div>`;
    }).join('');

    legend.push(`<div class="legend-item" data-category="${cat.category}">
      <span class="legend-color" style="background: ${color}"></span>
      <span class="legend-label">${getCategoryLabel(cat.category)}</span>
      <span class="legend-value">${formatTime(cat.minutes)} (${percentage.toFixed(1)}%)</span>
      <span class="legend-arrow">▶</span>
    </div>
    <div class="category-details" id="details-${cat.category}">
      ${detailHtml || '<div class="no-details">No detailed data</div>'}
    </div>`);
    currentAngle = endAngle;
  });

  return `<div class="chart-container">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths.join('')}</svg>
    <div class="legend">${legend.join('')}</div>
  </div>`;
}

function generateHourlyHeatmap(hourlyPattern) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const hourData = {};
  hourlyPattern.forEach(h => { hourData[h.hour] = h; });

  const cells = hours.map(hour => {
    const data = hourData[hour] || {};
    const totalMinutes = Object.entries(data)
      .filter(([key]) => key !== 'hour')
      .reduce((sum, [, val]) => sum + val, 0);
    const intensity = Math.min(totalMinutes / 60, 1);

    let dominantCat = 'idle';
    let maxCatMinutes = 0;
    Object.entries(data).forEach(([cat, mins]) => {
      if (cat !== 'hour' && mins > maxCatMinutes) {
        maxCatMinutes = mins;
        dominantCat = cat;
      }
    });

    const color = getCategoryColor(dominantCat);
    const opacity = intensity * 0.8 + 0.2;
    const currentHour = new Date().getHours();
    const isCurrentHour = hour === currentHour;

    return `<div class="hour-cell ${isCurrentHour ? 'current-hour' : ''}"
      style="background: ${totalMinutes > 0 ? color : '#f3f4f6'}; opacity: ${totalMinutes > 0 ? opacity : 1}">
      <span class="hour-label">${hour}</span>
      ${totalMinutes > 0 ? `<span class="hour-value">${Math.round(totalMinutes)}m</span>` : ''}
    </div>`;
  }).join('');

  return `<div class="hourly-heatmap">
    <div class="heatmap-grid">${cells}</div>
    <div class="heatmap-labels"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>12am</span></div>
  </div>`;
}

function generateTopAppsTable(topApps) {
  if (!topApps || topApps.length === 0) return '<p class="no-data">No app data yet</p>';

  const rows = topApps.slice(0, 10).map((app, index) => `<tr>
    <td class="rank">${index + 1}</td>
    <td class="app-name">${escapeHtml(app.app_name) || 'Unknown'}</td>
    <td class="app-time">${formatTime(app.minutes)}</td>
    <td><span class="category-badge" style="background: ${getCategoryColor(app.category)}">${getCategoryLabel(app.category)}</span></td>
  </tr>`).join('');

  return `<table class="top-apps-table">
    <thead><tr><th>#</th><th>Application</th><th>Time</th><th>Category</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function generateHTML(data, date) {
  const now = new Date();
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const hasData = data && data.summary.total_active_minutes > 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Today's Dashboard</title>
  <style>
    :root {
      --primary: #3B82F6;
      --success: #10B981;
      --warning: #F59E0B;
      --gray-50: #F9FAFB;
      --gray-100: #F3F4F6;
      --gray-200: #E5E7EB;
      --gray-500: #6B7280;
      --gray-700: #374151;
      --gray-900: #111827;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6; color: var(--gray-900); background: var(--gray-50); padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header { text-align: center; margin-bottom: 2rem; }
    h1 { font-size: 1.75rem; font-weight: 700; }
    .date { color: var(--gray-500); font-size: 1rem; margin-top: 0.25rem; }
    .live-badge {
      display: inline-block; background: var(--success); color: white;
      padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem;
      font-weight: 600; margin-left: 0.5rem; animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }

    .action-bar {
      display: flex; justify-content: center; gap: 1rem; margin-bottom: 1.5rem;
    }
    .action-btn {
      display: inline-flex; align-items: center; gap: 0.5rem;
      padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600;
      font-size: 0.875rem; cursor: pointer; border: none; transition: all 0.2s;
    }
    .action-btn-primary {
      background: linear-gradient(135deg, #8B5CF6, #6366F1); color: white;
    }
    .action-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4); }
    .action-btn-secondary {
      background: white; color: var(--gray-700); border: 1px solid var(--gray-200);
    }
    .action-btn-secondary:hover { background: var(--gray-50); }

    .summary-bar {
      background: white; border-radius: 1rem; padding: 1.5rem;
      margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      display: flex; justify-content: space-around; flex-wrap: wrap; gap: 1rem;
    }
    .stat { text-align: center; }
    .stat-value { font-size: 2rem; font-weight: 700; color: var(--gray-900); }
    .stat-label { font-size: 0.875rem; color: var(--gray-500); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 1.5rem; margin-bottom: 1.5rem; }
    .card { background: white; border-radius: 1rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card h2 { font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem; color: var(--gray-900); }
    .chart-container { display: flex; align-items: flex-start; gap: 1.5rem; flex-wrap: wrap; }
    .legend { flex: 1; min-width: 200px; }
    .legend-item {
      display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;
      font-size: 0.8rem; padding: 0.4rem 0.5rem; border-radius: 0.375rem;
      cursor: pointer; transition: background 0.2s;
    }
    .legend-item:hover { background: var(--gray-100); }
    .legend-item.expanded { background: var(--gray-100); }
    .legend-item.expanded .legend-arrow { transform: rotate(90deg); }
    .legend-color { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
    .legend-label { flex: 1; color: var(--gray-700); }
    .legend-value { color: var(--gray-500); font-variant-numeric: tabular-nums; }
    .legend-arrow {
      font-size: 0.6rem; color: var(--gray-400); transition: transform 0.2s;
      margin-left: 0.25rem;
    }

    .category-details {
      display: none; padding: 0.5rem 0 0.5rem 1.5rem; margin-bottom: 0.5rem;
      border-left: 2px solid var(--gray-200); margin-left: 0.75rem;
    }
    .category-details.visible { display: block; }
    .detail-app { margin-bottom: 0.5rem; }
    .detail-app-header { display: flex; justify-content: space-between; font-size: 0.75rem; }
    .detail-app-name { font-weight: 500; color: var(--gray-700); }
    .detail-app-time { color: var(--gray-500); font-variant-numeric: tabular-nums; }
    .detail-title {
      font-size: 0.7rem; color: var(--gray-500); padding-left: 0.5rem;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;
    }
    .no-details { font-size: 0.75rem; color: var(--gray-400); font-style: italic; }

    .pie-slice { cursor: pointer; transition: opacity 0.2s; }
    .pie-slice:hover { opacity: 0.8; }

    .hourly-heatmap { margin-top: 0.5rem; }
    .heatmap-grid { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; }
    .hour-cell {
      aspect-ratio: 1; border-radius: 4px; display: flex; flex-direction: column;
      align-items: center; justify-content: center; font-size: 0.6rem; color: white; min-height: 36px;
    }
    .hour-cell.current-hour { box-shadow: 0 0 0 2px var(--primary); }
    .hour-label { font-weight: 600; }
    .hour-value { font-size: 0.5rem; opacity: 0.9; }
    .heatmap-labels { display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.7rem; color: var(--gray-500); }
    .top-apps-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .top-apps-table th, .top-apps-table td { padding: 0.6rem; text-align: left; border-bottom: 1px solid var(--gray-200); }
    .top-apps-table th { font-weight: 600; color: var(--gray-500); font-size: 0.75rem; }
    .rank { width: 30px; color: var(--gray-500); }
    .app-name { font-weight: 500; }
    .app-time { font-variant-numeric: tabular-nums; color: var(--gray-700); }
    .category-badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 9999px; font-size: 0.65rem; font-weight: 500; color: white; }
    .no-data { color: var(--gray-500); font-style: italic; text-align: center; padding: 2rem; }
    footer { text-align: center; margin-top: 2rem; color: var(--gray-500); font-size: 0.8rem; }

    /* Modal */
    .modal-overlay {
      display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;
    }
    .modal-overlay.visible { display: flex; }
    .modal {
      background: white; border-radius: 1rem; padding: 2rem; max-width: 500px; width: 90%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.2);
    }
    .modal h3 { font-size: 1.25rem; margin-bottom: 1rem; }
    .modal p { color: var(--gray-700); margin-bottom: 1rem; }
    .modal code {
      display: block; background: var(--gray-900); color: #10B981; padding: 1rem;
      border-radius: 0.5rem; font-size: 0.875rem; margin: 1rem 0; overflow-x: auto;
    }
    .modal-actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
    .modal-btn {
      flex: 1; padding: 0.75rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer;
      border: none; font-size: 0.875rem;
    }
    .modal-btn-copy { background: var(--primary); color: white; }
    .modal-btn-copy:hover { background: #2563EB; }
    .modal-btn-close { background: var(--gray-100); color: var(--gray-700); }
    .modal-btn-close:hover { background: var(--gray-200); }
    .copy-success { color: var(--success); font-size: 0.875rem; text-align: center; margin-top: 0.5rem; display: none; }

    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; }
      .chart-container { flex-direction: column; }
      .action-bar { flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Today's Dashboard <span class="live-badge">LIVE</span></h1>
      <p class="date">${formattedDate} &bull; Last updated: ${timeStr}</p>
    </header>

    ${hasData ? `
    <div class="action-bar">
      <button class="action-btn action-btn-primary" onclick="showAnalysisModal()">
        <span>✨</span> Run AI Analysis
      </button>
      <button class="action-btn action-btn-secondary" onclick="location.reload()">
        <span>↻</span> Refresh
      </button>
    </div>

    <div class="summary-bar">
      <div class="stat">
        <div class="stat-value">${formatTime(data.summary.total_active_minutes)}</div>
        <div class="stat-label">Active Time</div>
      </div>
      <div class="stat">
        <div class="stat-value">${formatTime(data.summary.total_idle_minutes)}</div>
        <div class="stat-label">Idle Time</div>
      </div>
      <div class="stat">
        <div class="stat-value">${data.summary.context_switches}</div>
        <div class="stat-label">Context Switches</div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>Time by Category <span style="font-size: 0.75rem; color: var(--gray-500); font-weight: normal;">(click to expand)</span></h2>
        ${generatePieChart(data.category_breakdown, data.category_details)}
      </div>
      <div class="card">
        <h2>Top Applications</h2>
        ${generateTopAppsTable(data.top_apps)}
      </div>
    </div>

    <div class="card">
      <h2>Activity by Hour</h2>
      ${generateHourlyHeatmap(data.hourly_pattern)}
    </div>
    ` : `
    <div class="card">
      <p class="no-data">No activity data recorded yet today. Start tracking to see your dashboard!</p>
    </div>
    `}

    <footer>
      <p>Quick Dashboard &bull; Click categories to see details &bull; Refresh page to update</p>
    </footer>
  </div>

  <!-- AI Analysis Modal -->
  <div class="modal-overlay" id="analysisModal">
    <div class="modal">
      <h3>✨ Run AI Analysis</h3>
      <p>Get personalized productivity insights powered by Claude AI. Run this command in your terminal:</p>
      <code>cd ~/Code/productivity-analyzer && npm run analyze && npm run report</code>
      <p style="font-size: 0.875rem;">This will analyze your day and generate a detailed report with recommendations.</p>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-copy" onclick="copyCommand()">Copy Command</button>
        <button class="modal-btn modal-btn-close" onclick="hideAnalysisModal()">Close</button>
      </div>
      <div class="copy-success" id="copySuccess">✓ Copied to clipboard!</div>
    </div>
  </div>

  <script>
    // Category drill-down
    document.querySelectorAll('.legend-item').forEach(item => {
      item.addEventListener('click', () => {
        const category = item.dataset.category;
        const details = document.getElementById('details-' + category);
        const isExpanded = item.classList.contains('expanded');

        // Close all others
        document.querySelectorAll('.legend-item').forEach(i => i.classList.remove('expanded'));
        document.querySelectorAll('.category-details').forEach(d => d.classList.remove('visible'));

        // Toggle current
        if (!isExpanded && details) {
          item.classList.add('expanded');
          details.classList.add('visible');
        }
      });
    });

    // Pie chart click
    document.querySelectorAll('.pie-slice').forEach(slice => {
      slice.addEventListener('click', () => {
        const category = slice.dataset.category;
        const legendItem = document.querySelector('.legend-item[data-category="' + category + '"]');
        if (legendItem) legendItem.click();
      });
    });

    // Modal functions
    function showAnalysisModal() {
      document.getElementById('analysisModal').classList.add('visible');
    }

    function hideAnalysisModal() {
      document.getElementById('analysisModal').classList.remove('visible');
      document.getElementById('copySuccess').style.display = 'none';
    }

    function copyCommand() {
      const cmd = 'cd ~/Code/productivity-analyzer && npm run analyze && npm run report';
      navigator.clipboard.writeText(cmd).then(() => {
        document.getElementById('copySuccess').style.display = 'block';
        setTimeout(() => {
          document.getElementById('copySuccess').style.display = 'none';
        }, 2000);
      });
    }

    // Close modal on overlay click
    document.getElementById('analysisModal').addEventListener('click', (e) => {
      if (e.target.id === 'analysisModal') hideAnalysisModal();
    });

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideAnalysisModal();
    });
  </script>
</body>
</html>`;
}

function generateDashboard() {
  const date = getTodayDate();

  // Ensure reports directory exists
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const data = getDataForDate(date);
  const html = generateHTML(data, date);
  const outputPath = path.join(REPORTS_DIR, 'dashboard.html');
  fs.writeFileSync(outputPath, html);
  console.log(outputPath);
  return outputPath;
}

// If running via Electron, wait for app ready then quit
if (app) {
  app.whenReady().then(() => {
    try {
      generateDashboard();
    } catch (err) {
      console.error('Error generating dashboard:', err.message);
      process.exitCode = 1;
    }
    app.quit();
  });
} else {
  // Running via regular node
  try {
    generateDashboard();
  } catch (err) {
    console.error('Error generating dashboard:', err.message);
    process.exit(1);
  }
}
