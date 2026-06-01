const fs = require('fs');
const path = require('path');
const os = require('os');

const DB_PATH = path.join(os.homedir(), '.coderev', 'history.json');

/**
 * Record a review result to history.
 * @param {object} result - The review result object
 * @param {string} [diffId] - Optional diff hash
 */
function recordReview(result, diffId) {
  try {
    const db = loadDB();
    db.reviews.push({
      timestamp: Date.now(),
      diffId: diffId || '',
      score: result.score || 0,
      summary: result.summary || '',
      issueCount: (result.issues || []).length,
      suggestionCount: (result.suggestions || []).length,
      praiseCount: (result.praise || []).length,
      topIssues: (result.issues || []).slice(0, 5).map(i => ({
        type: i.type,
        severity: i.severity,
        message: i.message,
      })),
    });

    // Keep only last 1000 reviews
    if (db.reviews.length > 1000) {
      db.reviews = db.reviews.slice(-1000);
    }

    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch {
    // Non-fatal
  }
}

/**
 * Load review statistics.
 * @param {object} options
 * @param {string} [options.period] - 'day' | 'week' | 'month' | 'all'
 * @returns {object} Stats object
 */
function getStats(options = {}) {
  const db = loadDB();
  const reviews = db.reviews;

  if (reviews.length === 0) {
    return { total: 0, averageScore: 0, issueTypes: {}, severityBreakdown: {}, trend: [] };
  }

  // Filter by period
  const now = Date.now();
  const periodMs = {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    all: Infinity,
  }[options.period || 'all'] || Infinity;

  const filtered = reviews.filter(r => (now - r.timestamp) <= periodMs);

  if (filtered.length === 0) {
    return { total: 0, averageScore: 0, issueTypes: {}, severityBreakdown: {}, trend: [] };
  }

  // Calculate stats
  const scores = filtered.map(r => r.score);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const totalIssues = filtered.reduce((sum, r) => sum + r.issueCount, 0);

  // Issue type breakdown
  const issueTypes = {};
  const severityBreakdown = {};
  for (const r of filtered) {
    for (const issue of r.topIssues || []) {
      issueTypes[issue.type] = (issueTypes[issue.type] || 0) + 1;
      severityBreakdown[issue.severity] = (severityBreakdown[issue.severity] || 0) + 1;
    }
  }

  // Trend: last 10 reviews in order
  const trend = filtered.slice(-20).map(r => ({
    date: new Date(r.timestamp).toISOString().slice(0, 10),
    score: r.score,
    issues: r.issueCount,
  }));

  return {
    total: filtered.length,
    totalAllTime: reviews.length,
    averageScore: Math.round(avgScore * 10) / 10,
    highestScore: Math.max(...scores),
    lowestScore: Math.min(...scores),
    totalIssues,
    issueTypes,
    severityBreakdown,
    trend,
  };
}

/**
 * Clear review history.
 */
function clearHistory() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify({ reviews: [] }, null, 2));
    return true;
  } catch {
    return false;
  }
}

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    }
  } catch {}
  return { reviews: [] };
}

module.exports = { recordReview, getStats, clearHistory };
