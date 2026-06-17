/**
 * Multi-Agent Coordination Layer
 *
 * 跨 Agent 置信度统一校准 + 冲突检测 + Recall/Precision 双模式
 *
 * 对标 Qodo 2.0 Multi-Agent Fabric (F1=60.1%)
 *
 * 核心机制:
 * 1. Confidence Calibration — 统一重校各 Agent 的置信度，消除"某些 Agent 天生高估"的偏差
 * 2. Conflict Detection — 检测多 Agent 对同代码位置的矛盾判断，标记并降权
 * 3. Recall/Precision Modes — 两种审查模式切换
 *    - recall: 宁可误报也不遗漏（安全审计场景）
 *    - precision: 只报告高置信度真问题（日常 CI 场景）
 * 4. Intersection Boosting — 多 Agent 同时发现的问题提升置信度
 */

/**
 * @typedef {object} AgentIssue
 * @property {string} type - error|warning|info
 * @property {string} severity - high|medium|low
 * @property {number} confidence - 0-100, agent's original confidence
 * @property {string} [file] - File path
 * @property {number} [line] - Line number
 * @property {string} message - Issue description
 * @property {string} [suggestion] - Fix suggestion
 * @property {string} detectedBy - Agent name (security|bugs|quality)
 */

/**
 * @typedef {object} CalibratedIssue
 * @property {AgentIssue} ... - Original issue fields
 * @property {number} calibratedConfidence - 校准后的置信度 0-100
 * @property {number} rawConfidence - 原始置信度（不变）
 * @property {string[]} confirmedBy - 同时发现的 Agent 列表
 * @property {boolean} isConflict - 是否与其他 Agent 冲突
 * @property {string} [conflictDetail] - 冲突详情
 * @property {number} boostReason - 提升原因位掩码
 */

// Boost reason flags
const BOOST_INTERSECTION = 1;   // Multiple agents found same issue
const BOOST_HIGH_SEVERITY = 2;  // High severity type
const BOOST_ACTIONABLE = 4;     // Has file + line + suggestion
const BOOST_ERROR_TYPE = 8;     // Error type (not warning/info)

// Penalty reason flags
const PENALTY_ISOLATED = 1;     // Only one agent found (no confirmation)
const PENALTY_CONFLICT = 2;     // Other agent disagrees
const PENALTY_VAGUE = 4;        // No file or line reference
const PENALTY_LOW_SEVERITY = 8; // Info type with low severity

/**
 * Agent-specific calibration profiles.
 *
 * Each agent has a known tendency:
 * - security: tends to over-report (high recall, lower precision)
 * - bugs: tends to be balanced
 * - quality: tends to report more style/nit issues (lower true severity)
 */
const AGENT_PROFILES = {
  security: {
    biasCorrection: -8,       // Over-reports, dial down baseline by 8
    severityMultiplier: 1.15, // Slightly amplify severity signals
    falsePositive: 0.25,      // Estimated false positive rate
  },
  bugs: {
    biasCorrection: 0,        // Balanced, no correction needed
    severityMultiplier: 1.0,
    falsePositive: 0.15,
  },
  quality: {
    biasCorrection: -5,       // Tends to nitpick, dial down
    severityMultiplier: 0.85, // Quality issues are less severe on average
    falsePositive: 0.30,
  },
};

/**
 * Calibrate confidence scores across all agents.
 *
 * Steps:
 * 1. Apply per-agent bias correction
 * 2. Detect intersections (same issue found by multiple agents) → boost
 * 3. Detect conflicts (contradictory findings on same code) → penalize
 * 4. Normalize to 0-100 range
 *
 * @param {AgentIssue[]} issues - Raw issues from all agents
 * @param {'recall'|'precision'|'balanced'} [mode='balanced'] - Review mode
 * @returns {CalibratedIssue[]} Calibrated and sorted issues
 */
function calibrateConfidence(issues, mode = 'balanced') {
  if (!issues || issues.length === 0) return [];

  // ── Step 1: Per-agent bias correction ──
  const corrected = issues.map(issue => {
    const profile = AGENT_PROFILES[issue.detectedBy] || AGENT_PROFILES.bugs;
    let calibrated = (issue.confidence || 70) + profile.biasCorrection;

    // Apply severity multiplier
    const severityBoost = issue.severity === 'high' ? 10 : issue.severity === 'medium' ? 5 : 0;
    calibrated += severityBoost * profile.severityMultiplier;

    // Clamp
    calibrated = Math.max(10, Math.min(99, calibrated));

    return {
      ...issue,
      rawConfidence: issue.confidence || 70,
      calibratedConfidence: Math.round(calibrated),
      confirmedBy: [issue.detectedBy],
      boostReason: 0,
    };
  });

  // ── Step 2: Intersection detection (same issue found by multiple agents) ──
  for (let i = 0; i < corrected.length; i++) {
    for (let j = i + 1; j < corrected.length; j++) {
      // Skip if these issues are conflicting (opposite signals on same code)
      if (isConflicting(corrected[i], corrected[j])) continue;

      if (isSameIssue(corrected[i], corrected[j])) {
        // Merge: boost confidence and mark as confirmed by multiple agents
        if (!corrected[i].confirmedBy.includes(corrected[j].detectedBy)) {
          corrected[i].confirmedBy.push(corrected[j].detectedBy);
        }
        corrected[i].calibratedConfidence = Math.min(
          99,
          corrected[i].calibratedConfidence + 10
        );
        corrected[i].boostReason |= BOOST_INTERSECTION;

        // Mark duplicate for removal
        corrected[j]._duplicate = true;
      }
    }
  }

  // Remove duplicates (keep the one with highest calibrated confidence)
  const deduped = corrected.filter(i => !i._duplicate);

  // ── Step 3: Conflict detection ──
  for (let i = 0; i < deduped.length; i++) {
    for (let j = i + 1; j < deduped.length; j++) {
      if (isConflicting(deduped[i], deduped[j])) {
        // Both get penalized - they contradict each other
        deduped[i].calibratedConfidence = Math.max(10, deduped[i].calibratedConfidence - 15);
        deduped[i].isConflict = true;
        deduped[i].conflictDetail = `Conflicts with ${deduped[j].detectedBy}: "${deduped[j].message.slice(0, 80)}"`;
        deduped[i].boostReason |= PENALTY_CONFLICT;

        deduped[j].calibratedConfidence = Math.max(10, deduped[j].calibratedConfidence - 15);
        deduped[j].isConflict = true;
        deduped[j].conflictDetail = `Conflicts with ${deduped[i].detectedBy}: "${deduped[i].message.slice(0, 80)}"`;
        deduped[j].boostReason |= PENALTY_CONFLICT;
      }
    }
  }

  // ── Step 4: Mode-specific adjustments ──
  let finalIssues;
  switch (mode) {
    case 'recall':
      // Boost everything, lower threshold — catch more issues
      finalIssues = deduped.map(i => ({
        ...i,
        calibratedConfidence: Math.min(99, Math.round(i.calibratedConfidence * 1.1 + 5)),
      }));
      break;
    case 'precision':
      // Penalize lone issues, raise threshold — reduce noise
      finalIssues = deduped.map(i => {
        let conf = i.calibratedConfidence;
        if (i.confirmedBy.length === 1) {
          conf -= 10; // Penalize single-agent findings
          i.boostReason |= PENALTY_ISOLATED;
        }
        if (i.type === 'info') {
          conf -= 5;  // Penalize info-level issues
          i.boostReason |= PENALTY_LOW_SEVERITY;
        }
        return { ...i, calibratedConfidence: Math.round(conf) };
      });
      break;
    case 'balanced':
    default:
      finalIssues = deduped;
      break;
  }

  // ── Step 5: Sort by calibrated confidence ──
  finalIssues.sort((a, b) => b.calibratedConfidence - a.calibratedConfidence);

  // ── Step 6: Filter by mode-specific threshold ──
  const thresholds = { recall: 40, balanced: 55, precision: 65 };
  const threshold = thresholds[mode] || 55;

  return finalIssues.filter(i => i.calibratedConfidence >= threshold);
}

/**
 * Check if two issues refer to the same underlying problem.
 *
 * Same-issue criteria (any one is sufficient):
 * - Same file + same line (±5 lines)
 * - Same file + same message (Levenshtein similarity > 0.7)
 * - Same file + same type + same severity
 */
function isSameIssue(a, b) {
  // Must be from different agents
  if (a.detectedBy === b.detectedBy) return false;

  // Must reference the same file
  if (a.file && b.file && a.file !== b.file) return false;

  // Check line proximity
  if (a.line && b.line) {
    if (Math.abs(a.line - b.line) <= 5) return true;
  }

  // Check message similarity
  if (a.message && b.message) {
    const similarity = messageSimilarity(a.message, b.message);
    if (similarity > 0.7) return true;
  }

  // Check type + severity match (only when no lines are specified — architectural issues)
  // Do NOT merge just because type+severity+file match; that causes false merges
  if (a.type === b.type && a.severity === b.severity) {
    // Only if neither has a line number (architectural/global issues)
    // AND messages have some similarity
    if (!a.line && !b.line && a.file && b.file && a.file === b.file) {
      const sim = messageSimilarity(a.message || '', b.message || '');
      if (sim > 0.4) return true;
    }
  }

  return false;
}

/**
 * Detect conflicting findings — two agents give opposing signals for the same code.
 *
 * Conflict criteria:
 * - Same file + same line
 * - One agent says "good" (praise/no issue) while other flags an issue
 * - Or: type mismatch (one says "error", other says "info" for same location)
 */
function isConflicting(a, b) {
  if (a.detectedBy === b.detectedBy) return false;

  // Must reference exactly the same code location
  if (!a.file || !b.file || a.file !== b.file) return false;
  if (!a.line || !b.line || Math.abs(a.line - b.line) > 3) return false;

  // Conflicting signal: error vs info on same line
  if (a.type === 'error' && b.type === 'info') return true;
  if (b.type === 'error' && a.type === 'info') return true;

  // High vs low severity on same line
  if (a.severity === 'high' && b.severity === 'low') return true;
  if (b.severity === 'high' && a.severity === 'low') return true;

  return false;
}

/**
 * Simple Jaccard similarity of two messages (word-level).
 * Returns 0-1 where 1 = identical.
 */
function messageSimilarity(a, b) {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;

  return intersection / union;
}

/**
 * Generate coordination statistics for reporting.
 *
 * @param {AgentIssue[]} rawIssues - Before calibration
 * @param {CalibratedIssue[]} calibratedIssues - After calibration
 * @param {string} mode - Review mode
 * @returns {object} Coordination stats
 */
function getCoordinationStats(rawIssues, calibratedIssues, mode) {
  const agentCounts = {};
  for (const issue of rawIssues) {
    agentCounts[issue.detectedBy] = (agentCounts[issue.detectedBy] || 0) + 1;
  }

  const intersectionCount = calibratedIssues.filter(
    i => i.boostReason & BOOST_INTERSECTION
  ).length;

  const conflictCount = calibratedIssues.filter(i => i.isConflict).length;

  const avgCalibrated = calibratedIssues.length > 0
    ? Math.round(calibratedIssues.reduce((s, i) => s + i.calibratedConfidence, 0) / calibratedIssues.length)
    : 0;

  const avgRaw = rawIssues.length > 0
    ? Math.round(rawIssues.reduce((s, i) => s + (i.confidence || 70), 0) / rawIssues.length)
    : 0;

  return {
    mode,
    rawCount: rawIssues.length,
    calibratedCount: calibratedIssues.length,
    filteredCount: rawIssues.length - calibratedIssues.length,
    avgRawConfidence: avgRaw,
    avgCalibratedConfidence: avgCalibrated,
    deltaConfidence: avgCalibrated - avgRaw,
    intersectionCount,
    conflictCount,
    agentCounts,
    threshold: mode === 'recall' ? 40 : mode === 'precision' ? 65 : 55,
  };
}

/**
 * Format coordination stats for terminal output.
 */
function formatCoordinationStats(stats) {
  const modeLabel = {
    recall: '🔍 Recall (catch-all)',
    balanced: '⚖️  Balanced',
    precision: '🎯 Precision (high-signal)',
  }[stats.mode] || stats.mode;

  const delta = stats.deltaConfidence >= 0
    ? `+${stats.deltaConfidence}`
    : `${stats.deltaConfidence}`;

  const lines = [
    `  Coordination: ${modeLabel}`,
    `  Issues: ${stats.rawCount} raw → ${stats.calibratedCount} calibrated (${stats.filteredCount} filtered)`,
    `  Confidence: avg ${stats.avgRawConfidence} → ${stats.avgCalibratedConfidence} (Δ ${delta})`,
    `  Intersections: ${stats.intersectionCount} (multi-agent confirmations)`,
  ];

  if (stats.conflictCount > 0) {
    lines.push(`  ⚠️  Conflicts: ${stats.conflictCount} (contradictory findings between agents)`);
  }

  const agentParts = Object.entries(stats.agentCounts)
    .map(([a, c]) => `${a}: ${c}`);
  lines.push(`  Per-Agent: ${agentParts.join(', ')}`);

  return lines.join('\n');
}

/**
 * Format coordination stats for markdown output.
 */
function formatCoordinationStatsMarkdown(stats) {
  const modeLabel = {
    recall: '🔍 Recall (catch-all)',
    balanced: '⚖️ Balanced',
    precision: '🎯 Precision (high-signal)',
  }[stats.mode] || stats.mode;

  const delta = stats.deltaConfidence >= 0
    ? `+${stats.deltaConfidence}`
    : `${stats.deltaConfidence}`;

  return [
    `| Coordination | ${modeLabel} |`,
    `|---|---|`,
    `| Raw Issues | ${stats.rawCount} |`,
    `| Calibrated Issues | ${stats.calibratedCount} (${stats.filteredCount} filtered) |`,
    `| Avg Confidence | ${stats.avgRawConfidence} → ${stats.avgCalibratedConfidence} (Δ ${delta}) |`,
    `| Intersections | ${stats.intersectionCount} multi-agent confirmations |`,
    stats.conflictCount > 0
      ? `| ⚠️ Conflicts | ${stats.conflictCount} contradictory findings |`
      : `| Conflicts | 0 |`,
  ].join('\n');
}

module.exports = {
  calibrateConfidence,
  getCoordinationStats,
  formatCoordinationStats,
  formatCoordinationStatsMarkdown,
  AGENT_PROFILES,
  BOOST_INTERSECTION,
  BOOST_HIGH_SEVERITY,
  BOOST_ACTIONABLE,
  BOOST_ERROR_TYPE,
  PENALTY_ISOLATED,
  PENALTY_CONFLICT,
  PENALTY_VAGUE,
  PENALTY_LOW_SEVERITY,
  isSameIssue,
  isConflicting,
  messageSimilarity,
};
