const path = require('path');
const os = require('os');

// Paths
const APP_SUPPORT_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'productivity-tracker');
const DB_PATH = path.join(APP_SUPPORT_DIR, 'productivity.db');
const REPORTS_DIR = path.join(__dirname, '..', '..', 'reports');

// Category colors
const CATEGORY_COLORS = {
  coding: '#10B981',
  communication: '#3B82F6',
  work_browsing: '#8B5CF6',
  social_media: '#EC4899',
  browsing: '#F59E0B',
  writing: '#06B6D4',
  design: '#F97316',
  entertainment: '#EF4444',
  productivity: '#14B8A6',
  finance: '#6366F1',
  idle: '#9CA3AF',
  other: '#6B7280'
};

// Category labels
const CATEGORY_LABELS = {
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

// Category hierarchy - maps parent categories to their children
const CATEGORY_HIERARCHY = {
  'Development': {
    color: '#10B981',
    children: ['coding']
  },
  'Work': {
    color: '#8B5CF6',
    children: ['work_browsing', 'writing', 'design', 'productivity', 'finance']
  },
  'Communication': {
    color: '#3B82F6',
    children: ['communication']
  },
  'Browsing': {
    color: '#F59E0B',
    children: ['browsing', 'social_media', 'entertainment']
  },
  'Other': {
    color: '#6B7280',
    children: ['other', 'idle']
  }
};

// Reverse lookup: child category -> parent category
const CATEGORY_TO_PARENT = {};
for (const [parent, config] of Object.entries(CATEGORY_HIERARCHY)) {
  for (const child of config.children) {
    CATEGORY_TO_PARENT[child] = parent;
  }
}

// Server config
const PORT = process.env.PORT || 3456;

// Learned categories path
const LEARNED_CATEGORIES_PATH = path.join(APP_SUPPORT_DIR, 'learned-categories.json');

module.exports = {
  APP_SUPPORT_DIR,
  DB_PATH,
  REPORTS_DIR,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORY_HIERARCHY,
  CATEGORY_TO_PARENT,
  LEARNED_CATEGORIES_PATH,
  PORT
};
