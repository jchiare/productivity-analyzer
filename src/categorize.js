/**
 * Local categorization rules for applications and window titles
 */

// App name to category mapping (case-insensitive)
const APP_CATEGORIES = {
  // Coding
  'code': 'coding',
  'visual studio code': 'coding',
  'cursor': 'coding',
  'xcode': 'coding',
  'terminal': 'coding',
  'iterm': 'coding',
  'iterm2': 'coding',
  'webstorm': 'coding',
  'intellij idea': 'coding',
  'intellij': 'coding',
  'pycharm': 'coding',
  'android studio': 'coding',
  'sublime text': 'coding',
  'atom': 'coding',
  'vim': 'coding',
  'neovim': 'coding',
  'emacs': 'coding',
  'tower': 'coding',
  'sourcetree': 'coding',
  'github desktop': 'coding',
  'postman': 'coding',
  'insomnia': 'coding',
  'tableplus': 'coding',
  'sequel pro': 'coding',
  'datagrip': 'coding',
  'docker': 'coding',
  'docker desktop': 'coding',
  'warp': 'coding',
  'hyper': 'coding',
  'kitty': 'coding',
  'alacritty': 'coding',

  // Communication
  'slack': 'communication',
  'discord': 'communication',
  'microsoft teams': 'communication',
  'teams': 'communication',
  'zoom': 'communication',
  'zoom.us': 'communication',
  'mail': 'communication',
  'outlook': 'communication',
  'microsoft outlook': 'communication',
  'messages': 'communication',
  'imessage': 'communication',
  'telegram': 'communication',
  'whatsapp': 'communication',
  'signal': 'communication',
  'facetime': 'communication',
  'webex': 'communication',
  'cisco webex': 'communication',
  'google meet': 'communication',
  'skype': 'communication',
  'loom': 'communication',

  // Writing
  'microsoft word': 'writing',
  'word': 'writing',
  'pages': 'writing',
  'notion': 'writing',
  'obsidian': 'writing',
  'notes': 'writing',
  'bear': 'writing',
  'ulysses': 'writing',
  'ia writer': 'writing',
  'drafts': 'writing',
  'typora': 'writing',
  'scrivener': 'writing',
  'google docs': 'writing',

  // Design
  'figma': 'design',
  'sketch': 'design',
  'photoshop': 'design',
  'adobe photoshop': 'design',
  'illustrator': 'design',
  'adobe illustrator': 'design',
  'adobe xd': 'design',
  'xd': 'design',
  'invision': 'design',
  'framer': 'design',
  'canva': 'design',
  'affinity designer': 'design',
  'affinity photo': 'design',
  'procreate': 'design',
  'preview': 'design',

  // Entertainment
  'spotify': 'entertainment',
  'music': 'entertainment',
  'apple music': 'entertainment',
  'netflix': 'entertainment',
  'vlc': 'entertainment',
  'iina': 'entertainment',
  'quicktime player': 'entertainment',
  'quicktime': 'entertainment',
  'podcasts': 'entertainment',
  'apple podcasts': 'entertainment',
  'tv': 'entertainment',
  'apple tv': 'entertainment',
  'plex': 'entertainment',

  // Productivity
  'calendar': 'productivity',
  'fantastical': 'productivity',
  'reminders': 'productivity',
  'todoist': 'productivity',
  'things': 'productivity',
  'things 3': 'productivity',
  'omnifocus': 'productivity',
  'asana': 'productivity',
  '1password': 'productivity',
  'bitwarden': 'productivity',
  'alfred': 'productivity',
  'raycast': 'productivity',
  'keyboard maestro': 'productivity',
  'hazel': 'productivity',

  // Finance
  'microsoft excel': 'finance',
  'excel': 'finance',
  'numbers': 'finance',
  'google sheets': 'finance',

  // Browsers (will be further categorized by URL/title)
  'safari': 'browsing',
  'google chrome': 'browsing',
  'chrome': 'browsing',
  'firefox': 'browsing',
  'brave browser': 'browsing',
  'brave': 'browsing',
  'microsoft edge': 'browsing',
  'edge': 'browsing',
  'arc': 'browsing',
  'opera': 'browsing',
  'vivaldi': 'browsing',

  // System
  'finder': 'other',
  'system preferences': 'other',
  'system settings': 'other',
  'activity monitor': 'other',
  'app store': 'other',
};

// Browser-related patterns for categorizing browsing activity
const BROWSER_PATTERNS = {
  work_browsing: [
    /github\.com/i,
    /gitlab\.com/i,
    /bitbucket\.org/i,
    /jira/i,
    /atlassian/i,
    /notion\.so/i,
    /linear\.app/i,
    /asana\.com/i,
    /trello\.com/i,
    /monday\.com/i,
    /clickup\.com/i,
    /confluence/i,
    /slack\.com/i,
    /figma\.com/i,
    /miro\.com/i,
    /docs\.google\.com/i,
    /drive\.google\.com/i,
    /sheets\.google\.com/i,
    /slides\.google\.com/i,
    /calendar\.google\.com/i,
    /meet\.google\.com/i,
    /stripe\.com/i,
    /aws\.amazon\.com/i,
    /console\.cloud\.google\.com/i,
    /portal\.azure\.com/i,
    /vercel\.com/i,
    /netlify\.com/i,
    /heroku\.com/i,
    /digitalocean\.com/i,
    /cloudflare\.com/i,
    /sentry\.io/i,
    /datadog/i,
    /pagerduty/i,
    /stackoverflow\.com/i,
    /developer\./i,
    /docs\./i,
    /documentation/i,
    /api\./i,
    /console\./i,
    /dashboard/i,
    /admin/i,
    /openai\.com/i,
  ],
  social_media: [
    /twitter\.com/i,
    /x\.com/i,
    /facebook\.com/i,
    /instagram\.com/i,
    /linkedin\.com/i,
    /reddit\.com/i,
    /youtube\.com/i,
    /tiktok\.com/i,
    /pinterest\.com/i,
    /tumblr\.com/i,
    /threads\.net/i,
    /mastodon/i,
    /bluesky/i,
    /bsky\.app/i,
    /hacker ?news/i,
    /news\.ycombinator\.com/i,
  ],
  entertainment: [
    /netflix\.com/i,
    /hulu\.com/i,
    /disneyplus\.com/i,
    /disney\+/i,
    /primevideo/i,
    /amazon.*video/i,
    /hbomax\.com/i,
    /max\.com/i,
    /twitch\.tv/i,
    /spotify\.com/i,
    /soundcloud\.com/i,
    /apple.*music/i,
  ],
  finance: [
    /bank/i,
    /chase\.com/i,
    /wellsfargo\.com/i,
    /bankofamerica\.com/i,
    /capitalone\.com/i,
    /citi\.com/i,
    /paypal\.com/i,
    /venmo\.com/i,
    /mint\.com/i,
    /ynab\.com/i,
    /robinhood\.com/i,
    /fidelity\.com/i,
    /schwab\.com/i,
    /vanguard\.com/i,
    /coinbase\.com/i,
    /binance\.com/i,
  ],
  coding: [
    /localhost/i,
    /127\.0\.0\.1/i,
    /0\.0\.0\.0/i,
    /codepen\.io/i,
    /codesandbox\.io/i,
    /repl\.it/i,
    /replit\.com/i,
    /jsfiddle\.net/i,
    /glitch\.com/i,
    /npmjs\.com/i,
    /pypi\.org/i,
    /crates\.io/i,
    /pkg\.go\.dev/i,
    /rubygems\.org/i,
    /claude\.ai/i,
    /claude code/i,
    /anthropic.*claude/i,
  ],
};

// Bundle ID prefixes for faster lookup
const BUNDLE_CATEGORIES = {
  'com.microsoft.VSCode': 'coding',
  'com.apple.Terminal': 'coding',
  'com.googlecode.iterm2': 'coding',
  'com.tinyspeck.slackmacgap': 'communication',
  'com.apple.mail': 'communication',
  'com.apple.MobileSMS': 'communication',
  'us.zoom.xos': 'communication',
  'com.spotify.client': 'entertainment',
  'com.apple.Music': 'entertainment',
  'com.apple.Safari': 'browsing',
  'com.google.Chrome': 'browsing',
  'org.mozilla.firefox': 'browsing',
  'com.apple.finder': 'other',
};

/**
 * Check if an app is a browser
 * @param {string} appName - Application name
 * @param {string} bundleId - Bundle ID
 */
function isBrowser(appName, bundleId) {
  const browserApps = ['safari', 'chrome', 'google chrome', 'firefox', 'brave', 'brave browser', 'edge', 'microsoft edge', 'arc', 'opera', 'vivaldi'];
  const browserBundles = ['com.apple.Safari', 'com.google.Chrome', 'org.mozilla.firefox', 'com.brave.Browser', 'com.microsoft.edgemac', 'company.thebrowser.Browser'];

  if (appName && browserApps.includes(appName.toLowerCase())) {
    return true;
  }
  if (bundleId && browserBundles.some(b => bundleId.startsWith(b))) {
    return true;
  }
  return false;
}

/**
 * Categorize browser activity based on window title
 * @param {string} windowTitle - Window title
 */
function categorizeBrowserActivity(windowTitle) {
  if (!windowTitle) {
    return 'browsing';
  }

  // Check patterns in order of priority
  for (const [category, patterns] of Object.entries(BROWSER_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(windowTitle)) {
        return category;
      }
    }
  }

  return 'browsing';
}

/**
 * Try to extract URL from browser window title
 * @param {string} windowTitle - Window title
 */
function extractUrlFromTitle(windowTitle) {
  if (!windowTitle) {
    return null;
  }

  // Common browser title patterns:
  // "Page Title - Site Name" or "Page Title — Site Name"
  // Some browsers include the URL or domain

  // Try to find a URL pattern
  const urlMatch = windowTitle.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    return urlMatch[0];
  }

  // Try to find a domain pattern
  const domainMatch = windowTitle.match(/([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/);
  if (domainMatch) {
    return domainMatch[0];
  }

  return null;
}

/**
 * Categorize an activity based on app name, window title, and bundle ID
 * @param {Object} activity - Activity object
 * @param {string} activity.appName - Application name
 * @param {string} activity.windowTitle - Window title
 * @param {string} activity.bundleId - Bundle ID
 */
function categorize(activity) {
  const { appName, windowTitle, bundleId } = activity;

  // Check bundle ID first (most reliable)
  if (bundleId && BUNDLE_CATEGORIES[bundleId]) {
    const category = BUNDLE_CATEGORIES[bundleId];
    // If it's a browser, further categorize by content
    if (category === 'browsing' || isBrowser(appName, bundleId)) {
      return categorizeBrowserActivity(windowTitle);
    }
    return category;
  }

  // Check app name
  if (appName) {
    const normalizedAppName = appName.toLowerCase().trim();
    if (APP_CATEGORIES[normalizedAppName]) {
      const category = APP_CATEGORIES[normalizedAppName];
      // If it's a browser, further categorize by content
      if (category === 'browsing' || isBrowser(appName, bundleId)) {
        return categorizeBrowserActivity(windowTitle);
      }
      return category;
    }
  }

  // If it's a browser, categorize by window title
  if (isBrowser(appName, bundleId)) {
    return categorizeBrowserActivity(windowTitle);
  }

  // Default to 'other'
  return 'other';
}

/**
 * Get all available categories
 */
function getCategories() {
  return [
    'coding',
    'communication',
    'work_browsing',
    'social_media',
    'browsing',
    'writing',
    'design',
    'entertainment',
    'productivity',
    'finance',
    'idle',
    'other'
  ];
}

/**
 * Get a human-readable label for a category
 */
function getCategoryLabel(category) {
  const labels = {
    coding: 'Coding',
    communication: 'Communication',
    work_browsing: 'Work Browsing',
    social_media: 'Social Media',
    browsing: 'Browsing',
    writing: 'Writing',
    design: 'Design',
    entertainment: 'Entertainment',
    productivity: 'Productivity',
    finance: 'Finance',
    idle: 'Idle',
    other: 'Other'
  };
  return labels[category] || category;
}

/**
 * Get a color for a category (for visualizations)
 */
function getCategoryColor(category) {
  const colors = {
    coding: '#10B981',      // Green
    communication: '#3B82F6', // Blue
    work_browsing: '#6366F1', // Indigo
    social_media: '#F59E0B',  // Amber
    browsing: '#8B5CF6',      // Purple
    writing: '#EC4899',       // Pink
    design: '#14B8A6',        // Teal
    entertainment: '#EF4444', // Red
    productivity: '#22C55E',  // Light green
    finance: '#84CC16',       // Lime
    idle: '#9CA3AF',          // Gray
    other: '#6B7280'          // Dark gray
  };
  return colors[category] || '#6B7280';
}

module.exports = {
  categorize,
  categorizeBrowserActivity,
  extractUrlFromTitle,
  isBrowser,
  getCategories,
  getCategoryLabel,
  getCategoryColor,
  APP_CATEGORIES,
  BROWSER_PATTERNS
};
