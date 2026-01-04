#!/usr/bin/env node

const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');

// Handle running via Electron CLI for native module compatibility
let app = null;
try {
  app = require('electron').app;
} catch (e) {
  // Running via regular node
}

// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Add the src directory to the module path
const {
  initDatabase,
  getDaySummary,
  getCategoryStats,
  getHourlyBreakdown,
  getTopApps,
  getSampleWindowTitles,
  closeDatabase
} = require('../src/database');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');

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
 * Gather all data for analysis
 */
function gatherAnalysisData(date) {
  const summary = getDaySummary(date);
  const categoryBreakdown = getCategoryStats(date);
  const hourlyPattern = getHourlyBreakdown(date);
  const topApps = getTopApps(date, 15);
  const sampleTitles = getSampleWindowTitles(date, 50);

  return {
    date,
    summary,
    category_breakdown: categoryBreakdown,
    hourly_pattern: hourlyPattern,
    top_apps: topApps,
    sample_window_titles: sampleTitles
  };
}

/**
 * Build the prompt for Claude
 */
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

/**
 * Analyze the data using Claude API
 */
async function analyzeWithClaude(data) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set. Please add it to your .env file.');
  }

  const client = new Anthropic();
  const prompt = buildPrompt(data);

  console.log('Sending data to Claude for analysis...');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  // Extract the text content from the response
  const textContent = response.content.find(block => block.type === 'text');
  if (!textContent) {
    throw new Error('No text content in Claude response');
  }

  // Parse the JSON response
  const analysisText = textContent.text.trim();

  // Try to extract JSON from the response (handle potential markdown code blocks)
  let jsonStr = analysisText;
  const jsonMatch = analysisText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    return JSON.parse(jsonStr);
  } catch (parseError) {
    console.error('Failed to parse Claude response as JSON:', parseError);
    console.error('Raw response:', analysisText);
    throw new Error('Failed to parse Claude response as JSON');
  }
}

/**
 * Save the analysis results
 */
function saveAnalysis(date, rawData, analysis) {
  // Ensure reports directory exists
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const outputPath = path.join(REPORTS_DIR, `${date}-analysis.json`);

  const fullReport = {
    generated_at: new Date().toISOString(),
    date,
    raw_data: rawData,
    analysis
  };

  fs.writeFileSync(outputPath, JSON.stringify(fullReport, null, 2));

  return outputPath;
}

/**
 * Main function
 */
async function main() {
  const { date } = parseArgs();

  console.log(`\nProductivity Analysis for ${date}`);
  console.log('='.repeat(40));

  // Initialize database
  initDatabase();

  try {
    // Gather data
    console.log('\nGathering activity data...');
    const data = gatherAnalysisData(date);

    // Check if there's any data
    if (data.summary.total_active_minutes === 0 && data.summary.total_idle_minutes === 0) {
      console.log(`\nNo activity data found for ${date}`);
      console.log('Make sure the productivity tracker was running on this date.');
      if (app) app.quit();
      process.exit(1);
    }

    console.log(`Found ${data.summary.total_active_minutes} active minutes and ${data.summary.total_idle_minutes} idle minutes`);
    console.log(`Top apps: ${data.top_apps.slice(0, 3).map(a => a.app_name).join(', ')}`);

    // Analyze with Claude
    const analysis = await analyzeWithClaude(data);

    // Save results
    const outputPath = saveAnalysis(date, data, analysis);
    console.log(`\nAnalysis saved to: ${outputPath}`);

    // Print summary to console
    console.log('\n' + '='.repeat(40));
    console.log('ANALYSIS SUMMARY');
    console.log('='.repeat(40));
    console.log(`\nProductivity Score: ${analysis.productivity_score.score}/10`);
    console.log(`Justification: ${analysis.productivity_score.justification}`);
    console.log(`\nSummary: ${analysis.summary}`);

    if (analysis.recommendations && analysis.recommendations.length > 0) {
      console.log('\nRecommendations:');
      analysis.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec.title}: ${rec.description}`);
      });
    }

    console.log('\nRun `npm run report` to generate an HTML report.');

  } catch (error) {
    console.error('\nError during analysis:', error.message);
    if (app) app.quit();
    process.exit(1);
  } finally {
    closeDatabase();
  }

  // Exit cleanly when running via Electron
  if (app) app.quit();
}

main();
