const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const Anthropic = require('@anthropic-ai/sdk');
const { DB_PATH, APP_SUPPORT_DIR, CATEGORY_HIERARCHY, CATEGORY_TO_PARENT } = require('../config/constants');

// Path to store learned categories
const LEARNED_CATEGORIES_PATH = path.join(APP_SUPPORT_DIR, 'learned-categories.json');

// Threshold for suggesting a new category (percentage of parent category time)
const SUGGESTION_THRESHOLD = 0.15; // 15%

// Minimum minutes to consider for a suggestion
const MIN_MINUTES_FOR_SUGGESTION = 10;

/**
 * Load learned categories from disk
 */
function loadLearnedCategories() {
  if (fs.existsSync(LEARNED_CATEGORIES_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(LEARNED_CATEGORIES_PATH, 'utf8'));
    } catch (e) {
      return { patterns: [], lastAnalyzed: null };
    }
  }
  return { patterns: [], lastAnalyzed: null };
}

/**
 * Save learned categories to disk
 */
function saveLearnedCategories(data) {
  fs.writeFileSync(LEARNED_CATEGORIES_PATH, JSON.stringify(data, null, 2));
}

/**
 * Extract domain from window title (for browsers)
 */
function extractDomain(windowTitle) {
  if (!windowTitle) return null;

  // Common browser title patterns: "Page Title - Site Name - Browser"
  // or "Page Title | Site Name"
  const patterns = [
    /[-–—]\s*([a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z]{2,})+)\s*[-–—]/i,
    /[-–—]\s*([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,})\s*$/i,
    /\|\s*([a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,})/i,
  ];

  for (const pattern of patterns) {
    const match = windowTitle.match(pattern);
    if (match) return match[1].toLowerCase();
  }

  // Try to find common site names
  const sitePatterns = [
    { pattern: /youtube/i, domain: 'youtube.com' },
    { pattern: /twitter|𝕏/i, domain: 'twitter.com' },
    { pattern: /reddit/i, domain: 'reddit.com' },
    { pattern: /github/i, domain: 'github.com' },
    { pattern: /linkedin/i, domain: 'linkedin.com' },
    { pattern: /facebook/i, domain: 'facebook.com' },
    { pattern: /netflix/i, domain: 'netflix.com' },
    { pattern: /spotify/i, domain: 'spotify.com' },
    { pattern: /slack/i, domain: 'slack.com' },
    { pattern: /notion/i, domain: 'notion.so' },
    { pattern: /figma/i, domain: 'figma.com' },
  ];

  for (const { pattern, domain } of sitePatterns) {
    if (pattern.test(windowTitle)) return domain;
  }

  return null;
}

/**
 * Analyze recent activity to find patterns that could become new categories
 */
function analyzePatterns(daysBack = 7) {
  if (!fs.existsSync(DB_PATH)) {
    return { patterns: [], totalMinutes: 0 };
  }

  const db = new Database(DB_PATH, { readonly: true });

  try {
    // Get cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    // Query activity grouped by category, app, and window title
    const stmt = db.prepare(`
      SELECT
        category,
        app_name,
        window_title,
        COUNT(*) as record_count,
        ROUND(COUNT(*) * 5.0 / 60, 2) as minutes
      FROM activity_log
      WHERE date >= ? AND is_idle = 0 AND app_name IS NOT NULL
      GROUP BY category, app_name, window_title
      ORDER BY record_count DESC
    `);

    const rows = stmt.all(cutoffStr);
    db.close();

    // Group by parent category and find patterns
    const parentPatterns = {};

    for (const row of rows) {
      const parentCategory = CATEGORY_TO_PARENT[row.category] || 'Other';

      if (!parentPatterns[parentCategory]) {
        parentPatterns[parentCategory] = {
          totalMinutes: 0,
          items: []
        };
      }

      parentPatterns[parentCategory].totalMinutes += row.minutes;

      // Extract identifiable pattern (domain for browsers, app name otherwise)
      const domain = extractDomain(row.window_title);
      const patternKey = domain || row.app_name?.toLowerCase() || 'unknown';

      parentPatterns[parentCategory].items.push({
        category: row.category,
        app_name: row.app_name,
        window_title: row.window_title,
        patternKey,
        minutes: row.minutes
      });
    }

    // Aggregate by pattern key within each parent
    const suggestions = [];

    for (const [parentCategory, data] of Object.entries(parentPatterns)) {
      const patternAggregates = {};

      for (const item of data.items) {
        if (!patternAggregates[item.patternKey]) {
          patternAggregates[item.patternKey] = {
            patternKey: item.patternKey,
            parentCategory,
            childCategory: item.category,
            minutes: 0,
            sampleTitles: [],
            apps: new Set()
          };
        }

        patternAggregates[item.patternKey].minutes += item.minutes;
        patternAggregates[item.patternKey].apps.add(item.app_name);

        if (patternAggregates[item.patternKey].sampleTitles.length < 5 && item.window_title) {
          patternAggregates[item.patternKey].sampleTitles.push(item.window_title);
        }
      }

      // Find patterns that exceed threshold
      for (const pattern of Object.values(patternAggregates)) {
        const percentage = data.totalMinutes > 0 ? pattern.minutes / data.totalMinutes : 0;

        if (percentage >= SUGGESTION_THRESHOLD && pattern.minutes >= MIN_MINUTES_FOR_SUGGESTION) {
          suggestions.push({
            patternKey: pattern.patternKey,
            parentCategory: pattern.parentCategory,
            currentCategory: pattern.childCategory,
            minutes: Math.round(pattern.minutes),
            percentage: Math.round(percentage * 100),
            apps: Array.from(pattern.apps),
            sampleTitles: pattern.sampleTitles
          });
        }
      }
    }

    // Sort by minutes descending
    suggestions.sort((a, b) => b.minutes - a.minutes);

    return {
      patterns: suggestions,
      analyzedDays: daysBack
    };

  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Use AI to suggest category names for patterns
 */
async function suggestCategoryNames(patterns) {
  if (!patterns || patterns.length === 0) {
    return [];
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Return patterns without AI suggestions
    return patterns.map(p => ({
      ...p,
      suggestedName: p.patternKey.replace(/\.(com|org|net|io)$/i, '').replace(/[-_]/g, ' '),
      suggestedLabel: p.patternKey.split('.')[0],
      aiGenerated: false
    }));
  }

  const client = new Anthropic();

  const prompt = `You are helping categorize computer usage patterns for a productivity tracker.

Given these usage patterns, suggest appropriate category names for each. The categories should be concise, descriptive, and fit within a productivity tracking context.

Patterns to categorize:
${JSON.stringify(patterns.map(p => ({
  pattern: p.patternKey,
  currentParent: p.parentCategory,
  currentChild: p.currentCategory,
  sampleTitles: p.sampleTitles.slice(0, 3),
  minutesSpent: p.minutes
})), null, 2)}

Respond with a JSON array where each item has:
- "patternKey": the original pattern key
- "suggestedName": a short internal category name (lowercase, underscores, like "youtube_videos" or "news_reading")
- "suggestedLabel": a human-readable label (like "YouTube" or "News")
- "suggestedParent": which parent category this should belong to (Development, Work, Communication, Browsing, or Other)
- "reasoning": brief explanation

Respond ONLY with the JSON array.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
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

    const aiSuggestions = JSON.parse(jsonStr);

    // Merge AI suggestions with pattern data
    return patterns.map(pattern => {
      const aiSuggestion = aiSuggestions.find(s => s.patternKey === pattern.patternKey);
      return {
        ...pattern,
        suggestedName: aiSuggestion?.suggestedName || pattern.patternKey,
        suggestedLabel: aiSuggestion?.suggestedLabel || pattern.patternKey,
        suggestedParent: aiSuggestion?.suggestedParent || pattern.parentCategory,
        reasoning: aiSuggestion?.reasoning || null,
        aiGenerated: true
      };
    });

  } catch (err) {
    console.error('AI suggestion failed:', err.message);
    // Fallback to simple suggestions
    return patterns.map(p => ({
      ...p,
      suggestedName: p.patternKey.replace(/\.(com|org|net|io)$/i, '').replace(/[-_.]/g, '_'),
      suggestedLabel: p.patternKey.split('.')[0].charAt(0).toUpperCase() + p.patternKey.split('.')[0].slice(1),
      aiGenerated: false
    }));
  }
}

/**
 * Apply a learned pattern (add to categorize.js patterns)
 */
function applyLearnedPattern(pattern) {
  const learned = loadLearnedCategories();

  // Check if pattern already exists
  const exists = learned.patterns.find(p => p.patternKey === pattern.patternKey);
  if (exists) {
    // Update existing
    Object.assign(exists, pattern, { appliedAt: new Date().toISOString() });
  } else {
    // Add new
    learned.patterns.push({
      ...pattern,
      appliedAt: new Date().toISOString()
    });
  }

  saveLearnedCategories(learned);
  return learned;
}

/**
 * Get all learned patterns
 */
function getLearnedPatterns() {
  return loadLearnedCategories();
}

/**
 * Remove a learned pattern
 */
function removeLearnedPattern(patternKey) {
  const learned = loadLearnedCategories();
  learned.patterns = learned.patterns.filter(p => p.patternKey !== patternKey);
  saveLearnedCategories(learned);
  return learned;
}

/**
 * Get category suggestions (analyze + AI naming)
 */
async function getCategorySuggestions(daysBack = 7) {
  const { patterns, analyzedDays } = analyzePatterns(daysBack);

  // Filter out patterns that are already learned
  const learned = loadLearnedCategories();
  const learnedKeys = new Set(learned.patterns.map(p => p.patternKey));
  const newPatterns = patterns.filter(p => !learnedKeys.has(p.patternKey));

  if (newPatterns.length === 0) {
    return {
      suggestions: [],
      analyzedDays,
      message: 'No new patterns found that exceed the threshold'
    };
  }

  // Get AI suggestions for new patterns
  const suggestions = await suggestCategoryNames(newPatterns);

  return {
    suggestions,
    analyzedDays,
    threshold: `${Math.round(SUGGESTION_THRESHOLD * 100)}%`,
    minMinutes: MIN_MINUTES_FOR_SUGGESTION
  };
}

module.exports = {
  loadLearnedCategories,
  saveLearnedCategories,
  analyzePatterns,
  suggestCategoryNames,
  applyLearnedPattern,
  getLearnedPatterns,
  removeLearnedPattern,
  getCategorySuggestions,
  SUGGESTION_THRESHOLD,
  MIN_MINUTES_FOR_SUGGESTION
};
