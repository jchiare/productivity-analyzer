# Productivity Tracker for macOS

A menu bar app that tracks your active window information every 5 seconds, stores it in SQLite, and generates AI-powered productivity insights using Claude.

## Features

- **Automatic Activity Tracking**: Captures active window information every 5 seconds
- **Idle Detection**: Automatically detects when you're away from your computer
- **Smart Categorization**: Categorizes your activities (coding, communication, browsing, etc.)
- **AI-Powered Analysis**: Uses Claude to analyze your productivity patterns
- **Beautiful Reports**: Generates HTML reports with charts and actionable insights
- **Menu Bar Integration**: Runs quietly in your menu bar with real-time stats

## Requirements

- macOS (requires Screen Recording permission for window titles)
- Node.js 18+
- Anthropic API key (for AI analysis)

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd productivity-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your Anthropic API key:
   ```bash
   cp .env.example .env
   # Edit .env and add your API key
   ```

4. Start the app:
   ```bash
   npm start
   ```

5. Grant Screen Recording permission when prompted (System Preferences → Privacy & Security → Screen Recording)

## Usage

### Menu Bar App

Once started, the app runs in your menu bar with a clock icon. The menu shows:

- Today's active and idle time
- Time spent in each category
- Start/Pause tracking toggle
- Run Analysis button
- Open Reports folder

### Running Analysis

Generate an AI-powered analysis of your day:

```bash
# Analyze today
npm run analyze

# Analyze a specific date
npm run analyze -- --date 2024-01-15
```

### Generating Reports

Create an HTML report with visualizations:

```bash
# Generate report for today
npm run report

# Generate report for a specific date
npm run report -- --date 2024-01-15
```

Reports are saved to the `reports/` directory.

## Project Structure

```
productivity-tracker/
├── package.json
├── README.md
├── .env.example              # Template for API key
├── src/
│   ├── main.js               # Electron main process (menu bar app)
│   ├── database.js           # SQLite initialization and queries
│   ├── capture.js            # Active window capture logic
│   └── categorize.js         # Local app categorization rules
├── scripts/
│   ├── analyze.js            # Claude API analysis script
│   └── generate-report.js    # HTML report generator
└── reports/                  # Generated reports
```

## Categories

Activities are automatically categorized into:

- **Coding**: VS Code, Terminal, Xcode, JetBrains IDEs, etc.
- **Communication**: Slack, Discord, Teams, Zoom, Mail, etc.
- **Work Browsing**: GitHub, Jira, Notion, Google Docs, etc.
- **Social Media**: Twitter/X, Reddit, YouTube, LinkedIn, etc.
- **Browsing**: Other browser activity
- **Writing**: Word, Pages, Obsidian, Notes, etc.
- **Design**: Figma, Sketch, Photoshop, etc.
- **Entertainment**: Spotify, Netflix, Music, etc.
- **Productivity**: Calendar, Reminders, Todoist, etc.
- **Finance**: Excel, Numbers, banking sites, etc.
- **Idle**: System was idle (no activity for 2+ minutes)
- **Other**: Uncategorized

## Data Storage

Activity data is stored in SQLite at:
```
~/Library/Application Support/productivity-tracker/productivity.db
```

Data is automatically cleaned up after 30 days.

## Privacy

- All data is stored locally on your machine
- Window titles and app names are never sent anywhere except during analysis
- Analysis only sends aggregated statistics and sample window titles to Claude
- No personal data is shared with third parties

## macOS Permissions

The app requires **Screen Recording** permission to access window titles. Without this permission, only app names will be captured (no window titles or URLs).

To grant permission:
1. Open System Preferences → Privacy & Security → Screen Recording
2. Enable the Productivity Tracker app

## Troubleshooting

### "No activity data found"
- Make sure the tracker was running on the date you're trying to analyze
- Check that Screen Recording permission is granted

### Analysis fails with API error
- Verify your `ANTHROPIC_API_KEY` is correct in the `.env` file
- Check your API quota and billing status

### App doesn't appear in menu bar
- Check Activity Monitor for the Electron process
- Try quitting and restarting the app

## License

MIT
