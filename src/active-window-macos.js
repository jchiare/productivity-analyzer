const { execSync } = require('child_process');

/**
 * Get active window information on macOS using AppleScript.
 * This avoids native module compatibility issues with Electron.
 */
async function getActiveWindow() {
  try {
    // AppleScript to get frontmost application and window info
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        set bundleId to bundle identifier of frontApp
        try
          set windowTitle to name of front window of frontApp
        on error
          set windowTitle to ""
        end try
        return appName & "|||" & bundleId & "|||" & windowTitle
      end tell
    `;

    const result = execSync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    const [appName, bundleId, windowTitle] = result.split('|||');

    if (!appName) {
      return null;
    }

    return {
      title: windowTitle || '',
      owner: {
        name: appName,
        bundleId: bundleId || null
      }
    };
  } catch (error) {
    // If AppleScript fails (e.g., permission denied, no window), return null
    if (error.message && error.message.includes('execution error')) {
      return null;
    }
    throw error;
  }
}

module.exports = { getActiveWindow };
