const { powerMonitor } = require('electron');
const { logActivity } = require('./database');
const { categorize, extractUrlFromTitle, isBrowser } = require('./categorize');

// Configuration
const CONFIG = {
  captureIntervalMs: 5000,       // 5 seconds
  idleThresholdSeconds: 120,     // 2 minutes = idle
};

let captureInterval = null;
let isCapturing = false;
let activeWin = null;

/**
 * Dynamically import active-win (ESM module)
 */
async function getActiveWin() {
  if (!activeWin) {
    // active-win is an ESM module, need to use dynamic import
    activeWin = (await import('active-win')).default;
  }
  return activeWin;
}

/**
 * Capture the current active window and log it
 */
async function captureActivity() {
  try {
    const getActiveWindow = await getActiveWin();
    const now = new Date();

    // Check if system is idle
    const idleTime = powerMonitor.getSystemIdleTime();

    if (idleTime >= CONFIG.idleThresholdSeconds) {
      // Log idle activity
      logActivity({
        timestamp: now.toISOString(),
        date: now.toISOString().split('T')[0],
        hour: now.getHours(),
        app_name: null,
        window_title: null,
        url: null,
        bundle_id: null,
        is_idle: true,
        category: 'idle'
      });
      return { isIdle: true, idleTime };
    }

    // Get active window info
    const windowInfo = await getActiveWindow();

    if (!windowInfo) {
      // No active window (screen locked, etc.)
      logActivity({
        timestamp: now.toISOString(),
        date: now.toISOString().split('T')[0],
        hour: now.getHours(),
        app_name: null,
        window_title: null,
        url: null,
        bundle_id: null,
        is_idle: true,
        category: 'idle'
      });
      return { isIdle: true, noWindow: true };
    }

    const appName = windowInfo.owner?.name || null;
    const windowTitle = windowInfo.title || null;
    const bundleId = windowInfo.owner?.bundleId || null;

    // Extract URL if it's a browser
    let url = null;
    if (isBrowser(appName, bundleId)) {
      url = extractUrlFromTitle(windowTitle);
    }

    // Categorize the activity
    const category = categorize({
      appName,
      windowTitle,
      bundleId
    });

    // Log the activity
    logActivity({
      timestamp: now.toISOString(),
      date: now.toISOString().split('T')[0],
      hour: now.getHours(),
      app_name: appName,
      window_title: windowTitle,
      url: url,
      bundle_id: bundleId,
      is_idle: false,
      category: category
    });

    return {
      isIdle: false,
      appName,
      windowTitle,
      category
    };
  } catch (error) {
    console.error('Error capturing activity:', error);
    return { error: error.message };
  }
}

/**
 * Start the capture loop
 */
function startCapture() {
  if (isCapturing) {
    return false;
  }

  isCapturing = true;

  // Capture immediately
  captureActivity();

  // Then capture every interval
  captureInterval = setInterval(captureActivity, CONFIG.captureIntervalMs);

  console.log('Activity capture started');
  return true;
}

/**
 * Stop the capture loop
 */
function stopCapture() {
  if (!isCapturing) {
    return false;
  }

  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }

  isCapturing = false;
  console.log('Activity capture stopped');
  return true;
}

/**
 * Check if capture is running
 */
function isCaptureRunning() {
  return isCapturing;
}

/**
 * Get the capture configuration
 */
function getConfig() {
  return { ...CONFIG };
}

/**
 * Manually trigger a single capture (for testing)
 */
async function captureOnce() {
  return await captureActivity();
}

module.exports = {
  startCapture,
  stopCapture,
  isCaptureRunning,
  captureOnce,
  getConfig,
  CONFIG
};
