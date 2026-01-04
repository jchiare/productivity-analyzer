const express = require('express');
const { getTodayDate, getDataForDate } = require('../services/database');
const { loadExistingAnalysis, runAnalysis } = require('../services/analysis');

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

module.exports = router;
