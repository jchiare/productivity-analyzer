const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { REPORTS_DIR } = require('../config/constants');

/**
 * Build the prompt for Claude AI analysis
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
 * Load existing analysis from disk
 */
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

/**
 * Save analysis to disk
 */
function saveAnalysis(date, data, analysis) {
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

  return fullReport.generated_at;
}

/**
 * Run AI analysis using Claude
 */
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
  const generated_at = saveAnalysis(date, data, analysis);

  return {
    analysis,
    generated_at
  };
}

module.exports = {
  buildPrompt,
  loadExistingAnalysis,
  saveAnalysis,
  runAnalysis
};
