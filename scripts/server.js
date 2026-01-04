#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Anthropic = require('@anthropic-ai/sdk');
const Database = require('better-sqlite3');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3456;

// Paths
const APP_SUPPORT_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'productivity-tracker');
const DB_PATH = path.join(APP_SUPPORT_DIR, 'productivity.db');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

// Category colors
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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Helper functions
function getTodayDate() {
  return new Date().toISOString().split('T')[0];
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

function loadExistingAnalysis(date) {
  const analysisPath = path.join(REPORTS_DIR, `${date}-analysis.json`);
  if (fs.existsSync(analysisPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
      return {
        analysis: data.analysis,
        generated_at: data.generated_at
      };
    } catch (e) {
      return null;
    }
  }
  return null;
}

function buildPrompt(data) {
  return `You are a productivity coach analyzing a software engineer's workday.

Here is their activity data for ${data.date}:

${JSON.stringify(data, null, 2)}

Please provide a thorough analysis in the following JSON format:

{
  "summary": "A 2-3 sentence overview of how the day was spent",
  "productivity_score": {
    "score": <1-10>,
    "justification": "Brief explanation of the score"
  },
  "deep_work_analysis": {
    "estimated_deep_work_minutes": <number>,
    "longest_focus_stretch": "Description of the longest uninterrupted focus period",
    "quality_assessment": "Assessment of focus work quality"
  },
  "interruption_patterns": {
    "context_switch_assessment": "Analysis of context switching frequency",
    "peak_interruption_times": ["List of hours when interruptions peaked"],
    "likely_causes": ["Potential causes of interruptions"]
  },
  "time_sinks": [
    {
      "category": "Category name",
      "concern": "Why this might be a time sink",
      "minutes_spent": <number>
    }
  ],
  "recommendations": [
    {
      "title": "Short title",
      "description": "Specific, actionable suggestion"
    }
  ],
  "patterns": [
    "Notable pattern observations compared to typical developer workdays"
  ],
  "highlights": {
    "positive": ["Good things about the day"],
    "areas_for_improvement": ["Areas that could be improved"]
  }
}

Be direct and specific. Reference actual apps, times, and data from the input.
Respond ONLY with the JSON object, no additional text.`;
}

async function runAnalysis(data, date) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set in .env file');
  }

  const client = new Anthropic();
  const prompt = buildPrompt({ ...data, date });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }]
  });

  const textContent = response.content.find(block => block.type === 'text');
  if (!textContent) {
    throw new Error('No response from Claude');
  }

  let jsonStr = textContent.text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  const analysis = JSON.parse(jsonStr);

  // Save the analysis
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const outputPath = path.join(REPORTS_DIR, `${date}-analysis.json`);
  const fullReport = {
    generated_at: new Date().toISOString(),
    date,
    raw_data: data,
    analysis
  };
  fs.writeFileSync(outputPath, JSON.stringify(fullReport, null, 2));

  return {
    analysis,
    generated_at: fullReport.generated_at
  };
}

// API Routes

// GET /api/data - Get dashboard data for today (or specified date)
app.get('/api/data', (req, res) => {
  try {
    const date = req.query.date || getTodayDate();
    const data = getDataForDate(date);

    if (!data) {
      return res.status(404).json({ error: 'No data found', date });
    }

    // Include existing analysis if available
    const existingAnalysis = loadExistingAnalysis(date);

    res.json({
      ...data,
      analysis: existingAnalysis?.analysis || null,
      analysis_generated_at: existingAnalysis?.generated_at || null
    });
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analyze - Run AI analysis
app.post('/api/analyze', async (req, res) => {
  try {
    const date = req.body.date || getTodayDate();
    const forceRefresh = req.body.force || false;

    // Check for existing analysis unless force refresh
    if (!forceRefresh) {
      const existing = loadExistingAnalysis(date);
      if (existing) {
        return res.json({
          ...existing,
          cached: true
        });
      }
    }

    // Get data for analysis
    const data = getDataForDate(date);
    if (!data || data.summary.total_active_minutes === 0) {
      return res.status(400).json({ error: 'No activity data available for analysis' });
    }

    // Run analysis
    const result = await runAnalysis(data, date);

    res.json({
      ...result,
      cached: false
    });
  } catch (err) {
    console.error('Error running analysis:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health - Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Productivity Dashboard API running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
