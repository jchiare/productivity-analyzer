const { app, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const { initDatabase, getCategoryStats, getDaySummary, cleanupOldData, closeDatabase } = require('./database');
const { startCapture, stopCapture, isCaptureRunning } = require('./capture');
const { getCategoryLabel, getCategoryColor } = require('./categorize');

let tray = null;
let statsUpdateInterval = null;

// Hide dock icon (menu bar app only)
if (app.dock) {
  app.dock.hide();
}

/**
 * Format minutes into a human-readable string
 */
function formatTime(minutes) {
  if (minutes < 1) {
    return '< 1m';
  }
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Build the tray menu with current stats
 */
async function buildMenu() {
  const today = getTodayDate();
  const summary = getDaySummary(today);
  const categoryStats = getCategoryStats(today);

  const isTracking = isCaptureRunning();

  // Build category breakdown items
  const categoryItems = categoryStats
    .filter(stat => stat.category !== 'idle')
    .slice(0, 6) // Top 6 categories
    .map(stat => ({
      label: `  ${getCategoryLabel(stat.category)}: ${formatTime(stat.minutes)}`,
      enabled: false
    }));

  const menuTemplate = [
    {
      label: `Today: ${formatTime(summary.total_active_minutes)} active, ${formatTime(summary.total_idle_minutes)} idle`,
      enabled: false
    },
    { type: 'separator' },
    ...categoryItems,
    { type: 'separator' },
    {
      label: isTracking ? '⏸ Pause Tracking' : '▶️ Start Tracking',
      click: () => {
        if (isTracking) {
          stopCapture();
        } else {
          startCapture();
        }
        updateTray();
      }
    },
    {
      label: "View Today's Dashboard",
      click: async () => {
        try {
          const { execSync } = require('child_process');
          const dashboardScript = path.join(__dirname, '..', 'scripts', 'quick-dashboard.js');
          const outputPath = execSync(`node "${dashboardScript}"`, {
            cwd: path.join(__dirname, '..'),
            encoding: 'utf8'
          }).trim();
          shell.openPath(outputPath);
        } catch (error) {
          console.error('Failed to open dashboard:', error);
        }
      }
    },
    {
      label: 'Run AI Analysis',
      click: async () => {
        try {
          // Run the analyze script
          const { spawn } = require('child_process');
          const analyzeScript = path.join(__dirname, '..', 'scripts', 'analyze.js');
          const child = spawn('node', [analyzeScript], {
            cwd: path.join(__dirname, '..'),
            env: { ...process.env }
          });

          child.on('close', (code) => {
            if (code === 0) {
              console.log('Analysis completed successfully');
            } else {
              console.error('Analysis failed with code:', code);
            }
          });
        } catch (error) {
          console.error('Failed to run analysis:', error);
        }
      }
    },
    {
      label: 'Open Reports Folder',
      click: () => {
        const reportsDir = path.join(__dirname, '..', 'reports');
        shell.openPath(reportsDir);
      }
    },
    { type: 'separator' },
    {
      label: `Context switches today: ${summary.context_switches}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ];

  return Menu.buildFromTemplate(menuTemplate);
}

/**
 * Create a simple tray icon
 */
function createTrayIcon() {
  // Create a simple 16x16 icon (clock symbol)
  // Using a data URL for a simple icon
  const iconSize = 16;
  const icon = nativeImage.createEmpty();

  // Create a simple colored square as a placeholder
  // In production, you'd use a proper icon file
  const canvas = `
    <svg width="${iconSize}" height="${iconSize}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="7" fill="none" stroke="white" stroke-width="1.5"/>
      <line x1="8" y1="8" x2="8" y2="4" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="8" y1="8" x2="11" y2="8" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  `;

  // For now, use a simple template image approach
  // Create icon from base64 encoded PNG (a simple clock icon)
  const iconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADxSURBVDiNpZMxDoJAEEX/LA1ewIJG4xGMLbyJd/AAHsTGxIZS0VNAx2HgAPQGxoKQZVnUiZr4kkkm+W/+zOxsAH+o6nq7ILEGoA8gU9WfBIgIyIKIHAAZAGjBmQrw7jYaF4FoDgAR6QF4BrCNnpcAfmIKRMQe4FeAaLMAUE3NJZs5gAGAfIA0q++AjgvO3FkDGANYAHAl7gZgzZmbHsAcwNB9hIwBDEC8AVi4DzAHsADQ70A88z5BYA5g6D7WwJyzZgyP+SAAFgDqALo+r6+DeeY+AmsASyAAqo8LZg4F8jHyOZsxvGYOATABkLo5+xf9AV5HYB6mRYWuAAAAAElFTkSuQmCC';

  try {
    return nativeImage.createFromDataURL(`data:image/png;base64,${iconBase64}`);
  } catch (e) {
    // Fallback: create a simple icon
    return nativeImage.createFromBuffer(Buffer.alloc(256, 0));
  }
}

/**
 * Update the tray menu
 */
async function updateTray() {
  if (tray) {
    const menu = await buildMenu();
    tray.setContextMenu(menu);
  }
}

/**
 * Initialize the app
 */
async function init() {
  // Initialize the database
  initDatabase();

  // Clean up old data (keep last 30 days)
  const deleted = cleanupOldData(30);
  if (deleted > 0) {
    console.log(`Cleaned up ${deleted} old records`);
  }

  // Create the tray icon
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Productivity Tracker');

  // Build initial menu
  await updateTray();

  // Start tracking by default
  startCapture();

  // Update stats in the menu every 30 seconds
  statsUpdateInterval = setInterval(updateTray, 30000);

  console.log('Productivity Tracker started');
}

// App lifecycle
app.whenReady().then(init);

app.on('window-all-closed', (e) => {
  // Prevent default behavior of quitting
  e.preventDefault();
});

app.on('before-quit', () => {
  // Stop capture and clean up
  stopCapture();

  if (statsUpdateInterval) {
    clearInterval(statsUpdateInterval);
  }

  closeDatabase();
});

// Handle second instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}
