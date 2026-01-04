#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');

// Add categorize module for colors
const { getCategoryLabel, getCategoryColor } = require('../src/categorize');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let date = new Date().toISOString().split('T')[0]; // Default: today

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' && args[i + 1]) {
      date = args[i + 1];
      i++;
    }
  }

  return { date };
}

/**
 * Load analysis data for a date
 */
function loadAnalysis(date) {
  const analysisPath = path.join(REPORTS_DIR, `${date}-analysis.json`);

  if (!fs.existsSync(analysisPath)) {
    throw new Error(`No analysis found for ${date}. Run 'npm run analyze -- --date ${date}' first.`);
  }

  return JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
}

/**
 * Format minutes to human readable time
 */
function formatTime(minutes) {
  if (minutes < 1) return '< 1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Generate SVG pie chart
 */
function generatePieChart(categoryBreakdown) {
  const total = categoryBreakdown.reduce((sum, c) => sum + c.minutes, 0);
  if (total === 0) return '<p>No data to display</p>';

  const size = 200;
  const center = size / 2;
  const radius = 80;

  let currentAngle = -90; // Start from top
  const paths = [];
  const legend = [];

  categoryBreakdown.forEach((cat, index) => {
    if (cat.minutes === 0) return;

    const percentage = (cat.minutes / total) * 100;
    const angle = (cat.minutes / total) * 360;
    const color = getCategoryColor(cat.category);

    // Calculate path
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
      paths.push(`
        <path d="M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z"
              fill="${color}" stroke="white" stroke-width="2">
          <title>${getCategoryLabel(cat.category)}: ${formatTime(cat.minutes)} (${percentage.toFixed(1)}%)</title>
        </path>
      `);
    } else {
      // Full circle
      paths.push(`<circle cx="${center}" cy="${center}" r="${radius}" fill="${color}" />`);
    }

    legend.push(`
      <div class="legend-item">
        <span class="legend-color" style="background: ${color}"></span>
        <span class="legend-label">${getCategoryLabel(cat.category)}</span>
        <span class="legend-value">${formatTime(cat.minutes)} (${percentage.toFixed(1)}%)</span>
      </div>
    `);

    currentAngle = endAngle;
  });

  return `
    <div class="chart-container">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        ${paths.join('')}
      </svg>
      <div class="legend">
        ${legend.join('')}
      </div>
    </div>
  `;
}

/**
 * Generate hourly activity heatmap
 */
function generateHourlyHeatmap(hourlyPattern) {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const hourData = {};
  hourlyPattern.forEach(h => {
    hourData[h.hour] = h;
  });

  const cells = hours.map(hour => {
    const data = hourData[hour] || {};
    const totalMinutes = Object.entries(data)
      .filter(([key]) => key !== 'hour')
      .reduce((sum, [, val]) => sum + val, 0);

    // Calculate intensity (0-1)
    const maxMinutes = 60; // Max possible minutes per hour
    const intensity = Math.min(totalMinutes / maxMinutes, 1);

    // Get dominant category
    let dominantCat = 'idle';
    let maxCatMinutes = 0;
    Object.entries(data).forEach(([cat, mins]) => {
      if (cat !== 'hour' && mins > maxCatMinutes) {
        maxCatMinutes = mins;
        dominantCat = cat;
      }
    });

    const color = getCategoryColor(dominantCat);
    const opacity = intensity * 0.8 + 0.2; // Min 0.2 opacity

    return `
      <div class="hour-cell" style="background: ${totalMinutes > 0 ? color : '#f3f4f6'}; opacity: ${totalMinutes > 0 ? opacity : 1}">
        <span class="hour-label">${hour}</span>
        ${totalMinutes > 0 ? `<span class="hour-value">${Math.round(totalMinutes)}m</span>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="hourly-heatmap">
      <div class="heatmap-grid">
        ${cells}
      </div>
      <div class="heatmap-labels">
        <span>12am</span>
        <span>6am</span>
        <span>12pm</span>
        <span>6pm</span>
        <span>12am</span>
      </div>
    </div>
  `;
}

/**
 * Generate top apps table
 */
function generateTopAppsTable(topApps) {
  if (!topApps || topApps.length === 0) {
    return '<p>No app data available</p>';
  }

  const rows = topApps.map((app, index) => `
    <tr>
      <td class="rank">${index + 1}</td>
      <td class="app-name">${app.app_name || 'Unknown'}</td>
      <td class="app-time">${formatTime(app.minutes)}</td>
      <td>
        <span class="category-badge" style="background: ${getCategoryColor(app.category)}">
          ${getCategoryLabel(app.category)}
        </span>
      </td>
    </tr>
  `).join('');

  return `
    <table class="top-apps-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Application</th>
          <th>Time</th>
          <th>Category</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/**
 * Generate recommendations HTML
 */
function generateRecommendations(recommendations) {
  if (!recommendations || recommendations.length === 0) {
    return '<p>No recommendations available</p>';
  }

  return recommendations.map((rec, index) => `
    <div class="recommendation">
      <div class="rec-number">${index + 1}</div>
      <div class="rec-content">
        <h4>${rec.title}</h4>
        <p>${rec.description}</p>
      </div>
    </div>
  `).join('');
}

/**
 * Generate the full HTML report
 */
function generateHTML(data) {
  const { date, raw_data, analysis } = data;

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Productivity Report - ${date}</title>
  <style>
    :root {
      --primary: #3B82F6;
      --success: #10B981;
      --warning: #F59E0B;
      --danger: #EF4444;
      --gray-50: #F9FAFB;
      --gray-100: #F3F4F6;
      --gray-200: #E5E7EB;
      --gray-300: #D1D5DB;
      --gray-500: #6B7280;
      --gray-700: #374151;
      --gray-900: #111827;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: var(--gray-900);
      background: var(--gray-50);
      padding: 2rem;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    header {
      text-align: center;
      margin-bottom: 2rem;
    }

    h1 {
      font-size: 2rem;
      font-weight: 700;
      color: var(--gray-900);
    }

    .date {
      color: var(--gray-500);
      font-size: 1.1rem;
      margin-top: 0.5rem;
    }

    .summary-card {
      background: white;
      border-radius: 1rem;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .score-circle {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      flex-shrink: 0;
    }

    .score-value {
      font-size: 2.5rem;
      line-height: 1;
    }

    .score-label {
      font-size: 0.875rem;
      opacity: 0.8;
    }

    .score-high { background: linear-gradient(135deg, #10B981, #34D399); color: white; }
    .score-medium { background: linear-gradient(135deg, #F59E0B, #FBBF24); color: white; }
    .score-low { background: linear-gradient(135deg, #EF4444, #F87171); color: white; }

    .summary-text {
      flex: 1;
    }

    .summary-text p {
      font-size: 1.1rem;
      color: var(--gray-700);
      margin-bottom: 1rem;
    }

    .summary-stats {
      display: flex;
      gap: 2rem;
      margin-top: 1rem;
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--gray-900);
    }

    .stat-label {
      font-size: 0.875rem;
      color: var(--gray-500);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .card {
      background: white;
      border-radius: 1rem;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .card h2 {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 1rem;
      color: var(--gray-900);
    }

    .chart-container {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .legend {
      flex: 1;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      font-size: 0.875rem;
    }

    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      flex-shrink: 0;
    }

    .legend-label {
      flex: 1;
      color: var(--gray-700);
    }

    .legend-value {
      color: var(--gray-500);
      font-variant-numeric: tabular-nums;
    }

    .hourly-heatmap {
      margin-top: 1rem;
    }

    .heatmap-grid {
      display: grid;
      grid-template-columns: repeat(24, 1fr);
      gap: 2px;
    }

    .hour-cell {
      aspect-ratio: 1;
      border-radius: 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 0.625rem;
      color: white;
      min-height: 40px;
    }

    .hour-label {
      font-weight: 600;
    }

    .hour-value {
      font-size: 0.5rem;
      opacity: 0.9;
    }

    .heatmap-labels {
      display: flex;
      justify-content: space-between;
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: var(--gray-500);
    }

    .top-apps-table {
      width: 100%;
      border-collapse: collapse;
    }

    .top-apps-table th,
    .top-apps-table td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--gray-200);
    }

    .top-apps-table th {
      font-weight: 600;
      color: var(--gray-500);
      font-size: 0.875rem;
    }

    .rank {
      width: 40px;
      color: var(--gray-500);
    }

    .app-name {
      font-weight: 500;
    }

    .app-time {
      font-variant-numeric: tabular-nums;
      color: var(--gray-700);
    }

    .category-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
      color: white;
    }

    .recommendations {
      margin-top: 1rem;
    }

    .recommendation {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      background: var(--gray-50);
      border-radius: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .rec-number {
      width: 28px;
      height: 28px;
      background: var(--primary);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.875rem;
      flex-shrink: 0;
    }

    .rec-content h4 {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .rec-content p {
      color: var(--gray-600);
      font-size: 0.875rem;
    }

    .insights-section {
      margin-top: 2rem;
    }

    .insight-card {
      background: white;
      border-radius: 1rem;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 1rem;
    }

    .insight-card h3 {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .insight-card p {
      color: var(--gray-700);
      font-size: 0.9375rem;
    }

    .insight-list {
      list-style: none;
      margin-top: 0.5rem;
    }

    .insight-list li {
      padding: 0.5rem 0;
      padding-left: 1.5rem;
      position: relative;
      color: var(--gray-700);
    }

    .insight-list li::before {
      content: "•";
      position: absolute;
      left: 0;
      color: var(--primary);
      font-weight: bold;
    }

    .highlights {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .highlight-positive {
      border-left: 4px solid var(--success);
      padding-left: 1rem;
    }

    .highlight-improve {
      border-left: 4px solid var(--warning);
      padding-left: 1rem;
    }

    footer {
      text-align: center;
      margin-top: 3rem;
      padding-top: 2rem;
      border-top: 1px solid var(--gray-200);
      color: var(--gray-500);
      font-size: 0.875rem;
    }

    @media (max-width: 768px) {
      .grid {
        grid-template-columns: 1fr;
      }

      .summary-card {
        flex-direction: column;
        text-align: center;
      }

      .summary-stats {
        justify-content: center;
      }

      .chart-container {
        flex-direction: column;
      }

      .highlights {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Productivity Report</h1>
      <p class="date">${formattedDate}</p>
    </header>

    <section class="summary-card">
      <div class="score-circle ${analysis.productivity_score.score >= 7 ? 'score-high' : analysis.productivity_score.score >= 4 ? 'score-medium' : 'score-low'}">
        <span class="score-value">${analysis.productivity_score.score}</span>
        <span class="score-label">/ 10</span>
      </div>
      <div class="summary-text">
        <p>${analysis.summary}</p>
        <p><em>${analysis.productivity_score.justification}</em></p>
        <div class="summary-stats">
          <div class="stat">
            <div class="stat-value">${formatTime(raw_data.summary.total_active_minutes)}</div>
            <div class="stat-label">Active Time</div>
          </div>
          <div class="stat">
            <div class="stat-value">${formatTime(raw_data.summary.total_idle_minutes)}</div>
            <div class="stat-label">Idle Time</div>
          </div>
          <div class="stat">
            <div class="stat-value">${raw_data.summary.context_switches}</div>
            <div class="stat-label">Context Switches</div>
          </div>
        </div>
      </div>
    </section>

    <div class="grid">
      <div class="card">
        <h2>Time by Category</h2>
        ${generatePieChart(raw_data.category_breakdown)}
      </div>

      <div class="card">
        <h2>Top Applications</h2>
        ${generateTopAppsTable(raw_data.top_apps)}
      </div>
    </div>

    <div class="card" style="margin-bottom: 2rem;">
      <h2>Activity Throughout the Day</h2>
      ${generateHourlyHeatmap(raw_data.hourly_pattern)}
    </div>

    <div class="card">
      <h2>Recommendations</h2>
      <div class="recommendations">
        ${generateRecommendations(analysis.recommendations)}
      </div>
    </div>

    <section class="insights-section">
      <div class="grid">
        <div class="insight-card">
          <h3>🎯 Deep Work Analysis</h3>
          <p><strong>Estimated deep work:</strong> ${formatTime(analysis.deep_work_analysis?.estimated_deep_work_minutes || 0)}</p>
          <p>${analysis.deep_work_analysis?.longest_focus_stretch || 'No data available'}</p>
          <p><em>${analysis.deep_work_analysis?.quality_assessment || ''}</em></p>
        </div>

        <div class="insight-card">
          <h3>⚡ Interruption Patterns</h3>
          <p>${analysis.interruption_patterns?.context_switch_assessment || 'No data available'}</p>
          ${analysis.interruption_patterns?.likely_causes?.length > 0 ? `
          <ul class="insight-list">
            ${analysis.interruption_patterns.likely_causes.map(cause => `<li>${cause}</li>`).join('')}
          </ul>
          ` : ''}
        </div>
      </div>

      ${analysis.highlights ? `
      <div class="insight-card">
        <h3>📊 Day Highlights</h3>
        <div class="highlights">
          <div class="highlight-positive">
            <h4>Positives</h4>
            <ul class="insight-list">
              ${(analysis.highlights.positive || []).map(h => `<li>${h}</li>`).join('')}
            </ul>
          </div>
          <div class="highlight-improve">
            <h4>Areas for Improvement</h4>
            <ul class="insight-list">
              ${(analysis.highlights.areas_for_improvement || []).map(h => `<li>${h}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
      ` : ''}

      ${analysis.patterns?.length > 0 ? `
      <div class="insight-card">
        <h3>🔍 Notable Patterns</h3>
        <ul class="insight-list">
          ${analysis.patterns.map(p => `<li>${p}</li>`).join('')}
        </ul>
      </div>
      ` : ''}
    </section>

    <footer>
      <p>Generated by Productivity Tracker on ${new Date().toLocaleString()}</p>
      <p>Powered by Claude AI</p>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Main function
 */
function main() {
  const { date } = parseArgs();

  console.log(`\nGenerating HTML Report for ${date}`);
  console.log('='.repeat(40));

  try {
    // Load analysis data
    const data = loadAnalysis(date);
    console.log('Loaded analysis data...');

    // Generate HTML
    const html = generateHTML(data);

    // Save report
    const outputPath = path.join(REPORTS_DIR, `${date}-report.html`);
    fs.writeFileSync(outputPath, html);

    console.log(`\nReport generated: ${outputPath}`);
    console.log('\nOpen the report in your browser to view it.');

  } catch (error) {
    console.error('\nError generating report:', error.message);
    process.exit(1);
  }
}

main();
