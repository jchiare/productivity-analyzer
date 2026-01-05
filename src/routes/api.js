const express = require('express');
const { getTodayDate, getDataForDate } = require('../services/database');
const { loadExistingAnalysis, runAnalysis } = require('../services/analysis');
const {
  getCategorySuggestions,
  getLearnedPatterns,
  applyLearnedPattern,
  removeLearnedPattern
} = require('../services/category-learning');

const router = express.Router();

/**
 * GET /api/data
 * Get dashboard data for today (or specified date)
 */
router.get('/data', (req, res) => {
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

/**
 * POST /api/analyze
 * Run AI analysis for a date
 */
router.post('/analyze', async (req, res) => {
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

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /api/category-suggestions
 * Get AI-powered category suggestions based on usage patterns
 */
router.get('/category-suggestions', async (req, res) => {
  try {
    const daysBack = parseInt(req.query.days) || 7;
    const suggestions = await getCategorySuggestions(daysBack);
    res.json(suggestions);
  } catch (err) {
    console.error('Error getting category suggestions:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/learned-categories
 * Get all learned category patterns
 */
router.get('/learned-categories', (req, res) => {
  try {
    const learned = getLearnedPatterns();
    res.json(learned);
  } catch (err) {
    console.error('Error getting learned categories:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/learned-categories
 * Apply a learned pattern
 */
router.post('/learned-categories', (req, res) => {
  try {
    const pattern = req.body;
    if (!pattern || !pattern.patternKey) {
      return res.status(400).json({ error: 'Pattern with patternKey required' });
    }
    const result = applyLearnedPattern(pattern);
    res.json({ success: true, learned: result });
  } catch (err) {
    console.error('Error applying learned pattern:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/learned-categories/:patternKey
 * Remove a learned pattern
 */
router.delete('/learned-categories/:patternKey', (req, res) => {
  try {
    const patternKey = decodeURIComponent(req.params.patternKey);
    const result = removeLearnedPattern(patternKey);
    res.json({ success: true, learned: result });
  } catch (err) {
    console.error('Error removing learned pattern:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
