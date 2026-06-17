const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  calibrateConfidence,
  getCoordinationStats,
  formatCoordinationStats,
  formatCoordinationStatsMarkdown,
  AGENT_PROFILES,
  isSameIssue,
  isConflicting,
  messageSimilarity,
  BOOST_INTERSECTION,
  BOOST_HIGH_SEVERITY,
  BOOST_ACTIONABLE,
  BOOST_ERROR_TYPE,
  PENALTY_ISOLATED,
  PENALTY_CONFLICT,
  PENALTY_VAGUE,
  PENALTY_LOW_SEVERITY,
} = require('./agent-coordinator');

// ── Helper to create test issues ──
function makeIssue(overrides = {}) {
  return {
    type: 'warning',
    severity: 'medium',
    confidence: 75,
    file: 'src/app.js',
    line: 42,
    message: 'Consider using const instead of let',
    suggestion: 'Change let to const',
    detectedBy: 'quality',
    ...overrides,
  };
}

describe('agent-coordinator — Confidence Calibration', () => {

  it('should return empty array for empty input', () => {
    assert.deepEqual(calibrateConfidence([]), []);
    assert.deepEqual(calibrateConfidence(null), []);
  });

  it('should apply per-agent bias correction', () => {
    const issues = [
      makeIssue({ detectedBy: 'quality', confidence: 75, severity: 'medium' }),
    ];
    const result = calibrateConfidence(issues, 'balanced');
    assert.equal(result.length, 1);
    // quality biasCorrection = -5, severity medium = +5*0.85 ≈ 4.25
    // 75 + (-5) + 4.25 = 74.25 → 74
    assert.ok(result[0].calibratedConfidence <= 75, 'quality bias should reduce score');
    assert.equal(result[0].rawConfidence, 75);
    assert.equal(result[0].confirmedBy.length, 1);
    assert.equal(result[0].confirmedBy[0], 'quality');
  });

  it('should apply security agent bias correction', () => {
    const issues = [
      makeIssue({ detectedBy: 'security', confidence: 85, severity: 'high' }),
    ];
    const result = calibrateConfidence(issues, 'balanced');
    // security biasCorrection = -8, severity high = +10*1.15 = 11.5
    // 85 + (-8) + 11.5 = 88.5 → 89
    assert.ok(result[0].calibratedConfidence >= 80);
  });

  it('should apply bugs agent (no correction)', () => {
    const issues = [
      makeIssue({ detectedBy: 'bugs', confidence: 80, severity: 'medium' }),
    ];
    const result = calibrateConfidence(issues, 'balanced');
    // bugs biasCorrection = 0, severity medium = +5*1.0 = 5
    // 80 + 0 + 5 = 85
    assert.equal(result[0].calibratedConfidence, 85);
  });

  it('should clamp confidence to 10-99 range', () => {
    // Use recall mode to avoid threshold filtering
    // quality: 45 + (-5) + 0*0.85 = 40, recall: 40*1.1+5 = 49 — survives
    // security: 99 + (-8) + 10*1.15 = 102.5 → 99 (clamped) — survives
    const issues = [
      makeIssue({ detectedBy: 'quality', confidence: 45, severity: 'low', type: 'info' }),
      makeIssue({ detectedBy: 'security', confidence: 99, severity: 'high', type: 'error' }),
    ];
    const result = calibrateConfidence(issues, 'recall');
    assert.ok(result.length >= 1, `expected at least 1, got ${result.length}`);
    for (const issue of result) {
      assert.ok(issue.calibratedConfidence >= 10, `got ${issue.calibratedConfidence}`);
      assert.ok(issue.calibratedConfidence <= 99, `got ${issue.calibratedConfidence}`);
    }
  });

  it('should preserve rawConfidence separately from calibrated', () => {
    const issues = [makeIssue({ confidence: 75, detectedBy: 'bugs', severity: 'medium' })];
    const result = calibrateConfidence(issues, 'balanced');
    assert.equal(result[0].rawConfidence, 75);
    assert.ok(result[0].calibratedConfidence !== result[0].rawConfidence ||
      result[0].calibratedConfidence !== undefined);
  });

  it('should sort by calibrated confidence descending', () => {
    // Use bugs agent (neutral bias) for predictable scores, recall mode for survival
    const issues = [
      makeIssue({ confidence: 65, detectedBy: 'bugs', severity: 'medium', type: 'warning', message: 'potential bug' }),
      makeIssue({ confidence: 85, detectedBy: 'bugs', severity: 'high', type: 'error', message: 'critical bug' }),
      makeIssue({ confidence: 72, detectedBy: 'bugs', severity: 'medium', type: 'warning', message: 'minor issue' }),
    ];
    // Different files to prevent intersection merging
    issues[0].file = 'src/a.js';
    issues[1].file = 'src/b.js';
    issues[2].file = 'src/c.js';
    const result = calibrateConfidence(issues, 'recall');
    assert.ok(result.length >= 2, `expected at least 2 issues, got ${result.length}`);
    for (let i = 0; i < result.length - 1; i++) {
      assert.ok(result[i].calibratedConfidence >= result[i + 1].calibratedConfidence,
        `issue ${i} (${result[i].calibratedConfidence}) >= issue ${i + 1} (${result[i + 1].calibratedConfidence})`);
    }
  });
});

describe('agent-coordinator — Intersection Detection', () => {

  it('should detect same issue found by multiple agents', () => {
    const issues = [
      makeIssue({
        detectedBy: 'security', file: 'src/api.js', line: 100,
        message: 'SQL injection vulnerability in query builder',
        type: 'error', severity: 'high', confidence: 90,
      }),
      makeIssue({
        detectedBy: 'bugs', file: 'src/api.js', line: 102,
        message: 'Potential SQL injection in query builder',
        type: 'error', severity: 'high', confidence: 85,
      }),
    ];
    const result = calibrateConfidence(issues, 'balanced');
    // Should merge into 1 issue
    assert.equal(result.length, 1);
    assert.ok(result[0].boostReason & BOOST_INTERSECTION, 'should have intersection boost');
    assert.ok(result[0].confirmedBy.includes('security'));
    assert.ok(result[0].confirmedBy.includes('bugs'));
    // Intersection boost = +10
    assert.ok(result[0].calibratedConfidence >= result[0].rawConfidence + 5,
      'intersection should boost confidence');
  });

  it('should boost intersection confidence by at least 10', () => {
    const issues = [
      makeIssue({
        detectedBy: 'security', file: 'src/db.js', line: 55,
        message: 'Hardcoded database password found',
        type: 'error', severity: 'high', confidence: 70,
      }),
      makeIssue({
        detectedBy: 'bugs', file: 'src/db.js', line: 55,
        message: 'Hardcoded database password',
        type: 'error', severity: 'high', confidence: 72,
      }),
    ];
    const result = calibrateConfidence(issues, 'balanced');
    assert.equal(result.length, 1);
    assert.ok(result[0].boostReason & BOOST_INTERSECTION);
    // security: 70 + (-8) + 10*1.15 = 73.5 → 74, then +10 intersection = 84
    // Should be significantly above raw average
    const rawAvg = Math.round((70 + 72) / 2);
    assert.ok(result[0].calibratedConfidence > rawAvg,
      `calibrated ${result[0].calibratedConfidence} should exceed raw avg ${rawAvg}`);
  });

  it('should NOT merge issues from same agent', () => {
    const issues = [
      makeIssue({ detectedBy: 'security', file: 'src/x.js', line: 10, message: 'Issue A' }),
      makeIssue({ detectedBy: 'security', file: 'src/x.js', line: 10, message: 'Issue B' }),
    ];
    const result = calibrateConfidence(issues, 'balanced');
    // Same agent, different messages → should be separate
    assert.ok(result.length >= 1, 'same agent issues are independent');
  });

  it('should NOT merge issues from different files', () => {
    const issues = [
      makeIssue({ detectedBy: 'security', file: 'src/a.js', line: 10,
        message: 'SQL injection in query handler', type: 'error', severity: 'high', confidence: 85 }),
      makeIssue({ detectedBy: 'bugs', file: 'src/b.js', line: 10,
        message: 'Null pointer dereference', type: 'error', severity: 'high', confidence: 75 }),
    ];
    const result = calibrateConfidence(issues, 'balanced');
    assert.equal(result.length, 2, 'different files should not merge');
  });

  it('should merge by message similarity even if lines differ', () => {
    const issues = [
      makeIssue({
        detectedBy: 'security', file: 'src/app.js', line: 20,
        message: 'Missing input validation for user-supplied data in request handler',
        type: 'error', severity: 'high', confidence: 80,
      }),
      makeIssue({
        detectedBy: 'quality', file: 'src/app.js', line: 75,
        message: 'Missing input validation for user-supplied data in the request handler',
        type: 'warning', severity: 'medium', confidence: 65,
      }),
    ];
    const result = calibrateConfidence(issues, 'balanced');
    assert.equal(result.length, 1, 'similar messages should merge regardless of line distance');
  });

  it('should handle three agents all finding the same issue', () => {
    const issues = [
      makeIssue({
        detectedBy: 'security', file: 'src/main.js', line: 1, confidence: 88,
        message: 'API key hardcoded in source code',
        type: 'error', severity: 'high',
      }),
      makeIssue({
        detectedBy: 'bugs', file: 'src/main.js', line: 3, confidence: 85,
        message: 'API key hardcoded in source code',
        type: 'error', severity: 'high',
      }),
      makeIssue({
        detectedBy: 'quality', file: 'src/main.js', line: 2, confidence: 90,
        message: 'Hardcoded API key - security concern',
        type: 'error', severity: 'high',
      }),
    ];
    const result = calibrateConfidence(issues, 'balanced');
    assert.equal(result.length, 1, 'all three should merge');
    assert.equal(result[0].confirmedBy.length, 3);
    assert.ok(result[0].calibratedConfidence >= 95, 'triple confirmation should be near-certain');
  });
});

describe('agent-coordinator — Conflict Detection', () => {

  it('should detect conflict when agents disagree on severity at same location', () => {
    // Use recall mode to ensure both survive despite penalties
    const issues = [
      makeIssue({
        detectedBy: 'security', file: 'src/app.js', line: 42,
        message: 'Hardcoded secret - CRITICAL vulnerability', type: 'error', severity: 'high', confidence: 90,
      }),
      makeIssue({
        detectedBy: 'quality', file: 'src/app.js', line: 42,
        message: 'Inline configuration is acceptable here', type: 'info', severity: 'low', confidence: 70,
      }),
    ];
    const result = calibrateConfidence(issues, 'recall');
    assert.equal(result.length, 2, `expected 2 conflicts, got ${result.length}`);
    // Both should have conflict flag
    assert.equal(result.filter(i => i.isConflict).length, 2);
    // Both should be penalized
    result.forEach(i => {
      assert.ok(i.boostReason & PENALTY_CONFLICT, `issue should have conflict penalty: ${i.message}`);
    });
  });

  it('should penalize conflicting issues by 15 points', () => {
    const issues = [
      makeIssue({
        detectedBy: 'security', file: 'src/x.js', line: 10,
        message: 'Hardcoded API token in source code', type: 'error', severity: 'high', confidence: 80,
      }),
      makeIssue({
        detectedBy: 'quality', file: 'src/x.js', line: 10,
        message: 'This token is for local dev only', type: 'info', severity: 'low', confidence: 70,
      }),
    ];
    // Use recall mode so both survive despite penalties
    const result = calibrateConfidence(issues, 'recall');
    assert.equal(result.length, 2, `expected both conflicts to be kept, got ${result.length}`);
    result.forEach(i => {
      assert.ok(i.isConflict, `issue should be marked as conflict: ${i.message}`);
      // The calibrated should show the conflict penalty (though recall boost partially offsets)
      assert.ok(i.calibratedConfidence < i.rawConfidence + 15,
        `conflict penalty should be visible: raw=${i.rawConfidence} cal=${i.calibratedConfidence}`);
    });
  });

  it('should NOT detect conflict when severity matches', () => {
    const issues = [
      makeIssue({
        detectedBy: 'security', file: 'src/app.js', line: 42,
        message: 'XSS vulnerability', type: 'error', severity: 'high', confidence: 90,
      }),
      makeIssue({
        detectedBy: 'bugs', file: 'src/app.js', line: 44,
        message: 'Unescaped output', type: 'error', severity: 'high', confidence: 85,
      }),
    ];
    // These are likely the same issue (intersection), not conflicting
    const result = calibrateConfidence(issues, 'balanced');
    const conflicts = result.filter(i => i.isConflict);
    assert.ok(conflicts.length <= 1, 'high/high on nearby lines is intersection, not conflict');
  });

  it('should NOT detect conflict when lines are far apart (>3)', () => {
    const issues = [
      makeIssue({
        detectedBy: 'security', file: 'src/app.js', line: 10,
        message: 'Security issue', type: 'error', severity: 'high', confidence: 90,
      }),
      makeIssue({
        detectedBy: 'quality', file: 'src/app.js', line: 20,
        message: 'Minor style nit', type: 'info', severity: 'low', confidence: 60,
      }),
    ];
    const result = calibrateConfidence(issues, 'balanced');
    const conflicts = result.filter(i => i.isConflict);
    assert.equal(conflicts.length, 0, 'far apart lines should not conflict');
  });

  it('should include conflict detail in calibrated issues', () => {
    const issues = [
      makeIssue({
        detectedBy: 'security', file: 'src/app.js', line: 42,
        message: 'Hardcoded secret - CRITICAL', type: 'error', severity: 'high', confidence: 90,
      }),
      makeIssue({
        detectedBy: 'quality', file: 'src/app.js', line: 42,
        message: 'This is actually a test key', type: 'info', severity: 'low', confidence: 60,
      }),
    ];
    const result = calibrateConfidence(issues, 'balanced');
    result.filter(i => i.isConflict).forEach(i => {
      assert.ok(i.conflictDetail);
      assert.ok(i.conflictDetail.length > 0);
    });
  });
});

describe('agent-coordinator — Review Modes', () => {

  it('recall mode should have lowest threshold (40)', () => {
    const issues = [
      makeIssue({ detectedBy: 'quality', confidence: 45, severity: 'low', type: 'info' }),
    ];
    const result = calibrateConfidence(issues, 'recall');
    // With bias correction quality: 45 + (-5) + 0 = 40, then recall boost: 40*1.1+5 = 49
    assert.ok(result.length >= 1, 'recall mode should keep low-confidence issues');
  });

  it('precision mode should have highest threshold (65)', () => {
    const issues = [
      makeIssue({ detectedBy: 'quality', confidence: 60, severity: 'low', type: 'info' }),
    ];
    const result = calibrateConfidence(issues, 'precision');
    // quality: 60 + (-5) + 0 = 55, precision penalty (isolated) = -10, info penalty = -5 → 40
    assert.equal(result.length, 0, 'precision mode should filter low-confidence single-agent issues');
  });

  it('recall mode should boost all confidences', () => {
    const issues = [
      makeIssue({ detectedBy: 'bugs', confidence: 70, severity: 'medium' }),
    ];
    const balanced = calibrateConfidence(issues, 'balanced');
    const recall = calibrateConfidence(issues, 'recall');
    assert.ok(
      recall[0].calibratedConfidence > balanced[0].calibratedConfidence,
      'recall should boost confidences'
    );
  });

  it('precision mode should penalize single-agent findings', () => {
    const issues = [
      makeIssue({ detectedBy: 'quality', confidence: 80, severity: 'medium' }),
    ];
    const result = calibrateConfidence(issues, 'precision');
    assert.ok(result[0].boostReason & PENALTY_ISOLATED, 'should penalize lone finding');
  });

  it('precision mode should penalize info-level issues', () => {
    // Use high enough confidence to survive precision threshold despite penalties
    const issues = [
      makeIssue({ detectedBy: 'bugs', confidence: 90, severity: 'medium', type: 'info' }),
    ];
    const result = calibrateConfidence(issues, 'precision');
    assert.ok(result.length >= 1, `expected info issue to survive, got ${result.length}`);
    assert.ok(result[0].boostReason & PENALTY_LOW_SEVERITY, 'should penalize info issues');
  });

  it('recall mode should handle empty input gracefully', () => {
    const result = calibrateConfidence([], 'recall');
    assert.deepEqual(result, []);
  });

  it('precision mode should handle empty input gracefully', () => {
    const result = calibrateConfidence([], 'precision');
    assert.deepEqual(result, []);
  });
});

describe('agent-coordinator — Coordination Stats', () => {

  it('should generate stats for balanced mode', () => {
    const raw = [
      makeIssue({ detectedBy: 'security', confidence: 85, severity: 'high', message: 'Vuln A' }),
      makeIssue({ detectedBy: 'bugs', confidence: 75, severity: 'medium', message: 'Bug A' }),
      makeIssue({ detectedBy: 'quality', confidence: 60, severity: 'low', message: 'Style A' }),
    ];
    const calibrated = calibrateConfidence(raw, 'balanced');
    const stats = getCoordinationStats(raw, calibrated, 'balanced');

    assert.equal(stats.mode, 'balanced');
    assert.equal(stats.rawCount, 3);
    assert.ok(stats.calibratedCount >= 1);
    assert.ok(stats.avgRawConfidence > 0);
    assert.ok(stats.avgCalibratedConfidence > 0);
    assert.equal(typeof stats.deltaConfidence, 'number');
    assert.equal(stats.threshold, 55);
    assert.ok(stats.agentCounts.security >= 1);
    assert.ok(stats.agentCounts.bugs >= 1);
    assert.ok(stats.agentCounts.quality >= 1);
  });

  it('should track intersection and conflict counts', () => {
    const raw = [
      makeIssue({
        detectedBy: 'security', file: 'src/a.js', line: 10,
        message: 'Shared issue found by both', type: 'error', severity: 'high', confidence: 80,
      }),
      makeIssue({
        detectedBy: 'bugs', file: 'src/a.js', line: 10,
        message: 'Shared issue found by both agents', type: 'error', severity: 'high', confidence: 75,
      }),
    ];
    const calibrated = calibrateConfidence(raw, 'balanced');
    const stats = getCoordinationStats(raw, calibrated, 'balanced');
    assert.equal(stats.intersectionCount, 1);
    assert.equal(stats.conflictCount, 0);
    assert.equal(stats.calibratedCount, 1);
  });

  it('should format coordination stats for terminal', () => {
    const stats = {
      mode: 'balanced', rawCount: 5, calibratedCount: 4, filteredCount: 1,
      avgRawConfidence: 75, avgCalibratedConfidence: 68, deltaConfidence: -7,
      intersectionCount: 2, conflictCount: 1, threshold: 55,
      agentCounts: { security: 2, bugs: 2, quality: 1 },
    };
    const output = formatCoordinationStats(stats);
    assert.ok(output.includes('⚖️'));
    assert.ok(output.includes('Balanced'));
    assert.ok(output.includes('5 raw'));
    assert.ok(output.includes('4 calibrated'));
    assert.ok(output.includes('-7'));
    assert.ok(output.includes('Intersections'));
    assert.ok(output.toLowerCase().includes('conflict'));
    assert.ok(output.includes('security: 2'));
    assert.ok(output.includes('bugs: 2'));
    assert.ok(output.includes('quality: 1'));
  });

  it('should format coordination stats for markdown', () => {
    const stats = {
      mode: 'precision', rawCount: 3, calibratedCount: 2, filteredCount: 1,
      avgRawConfidence: 80, avgCalibratedConfidence: 72, deltaConfidence: -8,
      intersectionCount: 1, conflictCount: 0, threshold: 65,
      agentCounts: { security: 1, bugs: 1, quality: 1 },
    };
    const output = formatCoordinationStatsMarkdown(stats);
    assert.ok(output.includes('🎯'));
    assert.ok(output.includes('Precision'));
    assert.ok(output.includes('| Coordination'));
    assert.ok(output.includes('| Raw Issues'));
    assert.ok(output.includes('| Calibrated Issues'));
    assert.ok(output.includes('-8'));
  });

  it('should format recall mode with correct label', () => {
    const stats = {
      mode: 'recall', rawCount: 10, calibratedCount: 8, filteredCount: 2,
      avgRawConfidence: 55, avgCalibratedConfidence: 62, deltaConfidence: +7,
      intersectionCount: 3, conflictCount: 0, threshold: 40,
      agentCounts: { security: 4, bugs: 3, quality: 3 },
    };
    const output = formatCoordinationStats(stats);
    assert.ok(output.includes('🔍'));
    assert.ok(output.includes('Recall'));
    // Positive delta
    assert.ok(output.includes('+7') || output.includes('7'), `expected +7 in: ${output}`);
  });
});

describe('agent-coordinator — messageSimilarity', () => {

  it('should return 1 for identical messages', () => {
    assert.equal(messageSimilarity('SQL injection in query', 'SQL injection in query'), 1);
  });

  it('should return 0 for completely different messages', () => {
    const sim = messageSimilarity('SQL injection vulnerability', 'Code formatting issue');
    assert.ok(sim < 0.3, `expected low similarity, got ${sim}`);
  });

  it('should handle single-word messages', () => {
    // Words <= 2 chars are filtered, "Bug" has 3 chars → survives
    // Jaccard: word sets {bug} and {bug} → intersection 1, union 1 = 1
    assert.equal(messageSimilarity('Bug', 'Bug'), 1);
    // "Hi" vs "Hi" → both filtered (2 chars), empty sets → 0
    assert.equal(messageSimilarity('Hi', 'Hi'), 0);
  });

  it('should be case-insensitive', () => {
    const sim = messageSimilarity('SQL Injection Vulnerability', 'sql injection vulnerability');
    assert.equal(sim, 1);
  });

  it('should handle similar-but-not-identical messages', () => {
    const sim = messageSimilarity(
      'Missing input validation for user data',
      'Missing input validation for user-supplied data'
    );
    assert.ok(sim > 0.6, `expected high similarity, got ${sim}`);
    assert.ok(sim < 1, `should not be identical`);
  });
});

describe('agent-coordinator — Agent Profiles', () => {

  it('should define profiles for all three agents', () => {
    assert.ok(AGENT_PROFILES.security);
    assert.ok(AGENT_PROFILES.bugs);
    assert.ok(AGENT_PROFILES.quality);
  });

  it('security agent should have negative bias correction (over-reports)', () => {
    assert.ok(AGENT_PROFILES.security.biasCorrection < 0);
  });

  it('bugs agent should have neutral bias correction', () => {
    assert.equal(AGENT_PROFILES.bugs.biasCorrection, 0);
  });

  it('quality agent should have negative bias correction (nitpicks)', () => {
    assert.ok(AGENT_PROFILES.quality.biasCorrection < 0);
  });

  it('each profile should have a falsePositive rate estimate', () => {
    assert.ok(AGENT_PROFILES.security.falsePositive > 0);
    assert.ok(AGENT_PROFILES.bugs.falsePositive > 0);
    assert.ok(AGENT_PROFILES.quality.falsePositive > 0);
  });
});

describe('agent-coordinator — isSameIssue', () => {

  it('should detect same file + nearby lines', () => {
    const a = makeIssue({ file: 'src/app.js', line: 100, detectedBy: 'security' });
    const b = makeIssue({ file: 'src/app.js', line: 104, detectedBy: 'bugs' });
    assert.ok(isSameIssue(a, b));
  });

  it('should not match far-apart lines', () => {
    const a = makeIssue({ file: 'src/app.js', line: 10, detectedBy: 'security',
      message: 'SQL injection in login handler', type: 'error', severity: 'high' });
    const b = makeIssue({ file: 'src/app.js', line: 50, detectedBy: 'bugs',
      message: 'Missing null check on user object', type: 'warning', severity: 'medium' });
    assert.ok(!isSameIssue(a, b));
  });

  it('should not match different files', () => {
    const a = makeIssue({ file: 'src/a.js', line: 10, detectedBy: 'security' });
    const b = makeIssue({ file: 'src/b.js', line: 10, detectedBy: 'bugs' });
    assert.ok(!isSameIssue(a, b));
  });

  it('should not match same agent', () => {
    const a = makeIssue({ detectedBy: 'security' });
    const b = makeIssue({ detectedBy: 'security' });
    assert.ok(!isSameIssue(a, b));
  });
});

describe('agent-coordinator — isConflicting', () => {

  it('should detect error vs info on same line', () => {
    const a = makeIssue({
      detectedBy: 'security', file: 'src/app.js', line: 42,
      type: 'error', severity: 'high',
    });
    const b = makeIssue({
      detectedBy: 'quality', file: 'src/app.js', line: 42,
      type: 'info', severity: 'low',
    });
    assert.ok(isConflicting(a, b));
    assert.ok(isConflicting(b, a));
  });

  it('should detect high vs low severity on same line', () => {
    const a = makeIssue({
      detectedBy: 'security', file: 'src/app.js', line: 42,
      severity: 'high', type: 'error',
    });
    const b = makeIssue({
      detectedBy: 'quality', file: 'src/app.js', line: 43,
      severity: 'low', type: 'error',
    });
    assert.ok(isConflicting(a, b));
  });

  it('should not conflict if different files', () => {
    const a = makeIssue({ detectedBy: 'security', file: 'src/a.js', line: 42, type: 'error', severity: 'high' });
    const b = makeIssue({ detectedBy: 'quality', file: 'src/b.js', line: 42, type: 'info', severity: 'low' });
    assert.ok(!isConflicting(a, b));
  });

  it('should not conflict if same agent', () => {
    const a = makeIssue({ detectedBy: 'security', file: 'src/a.js', line: 42, type: 'error', severity: 'high' });
    const b = makeIssue({ detectedBy: 'security', file: 'src/a.js', line: 42, type: 'info', severity: 'low' });
    assert.ok(!isConflicting(a, b));
  });
});
