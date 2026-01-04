// Catch any early crashes
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
});

console.log('Loading Electron modules...');
const { app, Tray, Menu, nativeImage, shell, dialog } = require('electron');
const path = require('path');

console.log('Loading app modules...');

let database, capture, categorize;
let loadError = null;

try {
  database = require('./database');
  console.log('✓ Database module loaded');
} catch (err) {
  console.error('✗ Failed to load database module:', err.message);
  loadError = err;
}

try {
  capture = require('./capture');
  console.log('✓ Capture module loaded');
} catch (err) {
  console.error('✗ Failed to load capture module:', err.message);
  loadError = err;
}

try {
  categorize = require('./categorize');
  console.log('✓ Categorize module loaded');
} catch (err) {
  console.error('✗ Failed to load categorize module:', err.message);
  loadError = err;
}

// Destructure after checking
const { initDatabase, getCategoryStats, getDaySummary, cleanupOldData, closeDatabase } = database || {};
const { startCapture, stopCapture, isCaptureRunning } = capture || {};
const { getCategoryLabel, getCategoryColor } = categorize || {};

let tray = null;
let statsUpdateInterval = null;

// Show in dock so user knows app is running
// (remove the app.dock.hide() call)

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
      label: 'Run Analysis',
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
  console.log('========================================');
  console.log('Productivity Tracker - Starting...');
  console.log('========================================');

  // Show error dialog if modules failed to load
  if (loadError) {
    dialog.showErrorBox(
      'Failed to start',
      `A module failed to load: ${loadError.message}\n\nTry running:\nrm -rf node_modules\nnpm install`
    );
    app.quit();
    return;
  }

  // Initialize the database
  const { DB_PATH } = require('./database');
  console.log(`Database path: ${DB_PATH}`);
  initDatabase();
  console.log('✓ Database initialized');

  // Clean up old data (keep last 30 days)
  const deleted = cleanupOldData(30);
  if (deleted > 0) {
    console.log(`✓ Cleaned up ${deleted} old records`);
  }

  // Create the tray icon
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('Productivity Tracker');
  console.log('✓ Menu bar tray icon created');

  // Build initial menu
  await updateTray();

  // Start tracking by default
  startCapture();
  console.log('✓ Activity tracking started (captures every 5 seconds)');

  // Update stats in the menu every 30 seconds
  statsUpdateInterval = setInterval(updateTray, 30000);

  console.log('========================================');
  console.log('Productivity Tracker is now running!');
  console.log('Look for the clock icon in your menu bar.');
  console.log('Database: ' + DB_PATH);
  console.log('========================================');
}

// Handle second instance - must be done early
const gotTheLock = app.requestSingleInstanceLock();
console.log('Single instance lock:', gotTheLock ? 'acquired' : 'FAILED (another instance running?)');

if (!gotTheLock) {
  console.log('Another instance is already running. Exiting.');
  app.quit();
} else {
  // App lifecycle
  console.log('Waiting for app to be ready...');

  app.whenReady().then(() => {
    console.log('App is ready!');
    init();
  }).catch(err => {
    console.error('Error in init:', err);
  });

  app.on('window-all-closed', (e) => {
    // Prevent quitting - we're a tray app with no windows
    e.preventDefault();
  });

  // Keep the app running even with no windows
  app.on('activate', () => {
    console.log('App activated');
  });

  app.on('before-quit', () => {
    console.log('App quitting...');
    // Stop capture and clean up
    if (stopCapture) stopCapture();

    if (statsUpdateInterval) {
      clearInterval(statsUpdateInterval);
    }

    if (closeDatabase) closeDatabase();
  });
}
