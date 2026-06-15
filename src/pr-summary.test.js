/**
 * Tests for pr-summary.js — PR Summary & Walkthrough Generator
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  formatPrSummaryMarkdown,
  formatPrSummaryTerminal,
} = require('./pr-summary');

// ── formatPrSummaryMarkdown ──

describe('formatPrSummaryMarkdown', () => {
  it('generates a complete markdown summary', () => {
    const summary = {
      title: 'Add user authentication endpoint',
      summary: 'This PR adds JWT-based authentication with login/register endpoints.',
      type: 'feat',
      walkthrough: [
        { file: 'src/auth.js', summary: 'New authentication module with JWT logic', type: 'added' },
        { file: 'src/routes.js', summary: 'Added login and register routes', type: 'modified' },
        { file: 'src/middleware.js', summary: 'Added auth middleware for protected routes', type: 'modified' },
      ],
      riskAssessment: {
        level: 'medium',
        concerns: ['JWT secret is loaded from env var — ensure it is set in production'],
        mitigations: ['Document the required env vars in README'],
      },
      reviewChecklist: [
        'Verify JWT token expiry is reasonable (24h?)',
        'Check password hashing uses bcrypt with sufficient rounds',
        'Confirm rate limiting on login endpoint',
      ],
    };

    const md = formatPrSummaryMarkdown(summary);
    // Should contain key sections
    assert.ok(md.includes('AI Code Review Summary'));
    assert.ok(md.includes('Add user authentication endpoint'));
    assert.ok(md.includes('File Walkthrough'));
    assert.ok(md.includes('src/auth.js'));
    assert.ok(md.includes('Risk Assessment'));
    assert.ok(md.includes('Review Checklist'));
    assert.ok(md.includes('Verify JWT token expiry'));
    // Should link back to coderev
    assert.ok(md.includes('coderev'));
  });

  it('handles empty walkthrough', () => {
    const summary = {
      summary: 'Minor formatting changes',
      type: 'chore',
      walkthrough: [],
      riskAssessment: { level: 'low', concerns: [], mitigations: [] },
      reviewChecklist: [],
    };

    const md = formatPrSummaryMarkdown(summary);
    assert.ok(md.includes('AI Code Review Summary'));
    assert.ok(md.includes('Minor formatting changes'));
    // Should NOT have walkthrough section
    assert.ok(!md.includes('File Walkthrough'));
  });

  it('handles missing risk assessment', () => {
    const summary = {
      summary: 'Simple fix',
      type: 'fix',
      walkthrough: [{ file: 'src/fix.js', summary: 'Patched', type: 'modified' }],
    };

    const md = formatPrSummaryMarkdown(summary);
    assert.ok(md.includes('File Walkthrough'));
    // Should not crash
    assert.ok(md.length > 50);
  });

  it('handles high risk assessment', () => {
    const summary = {
      summary: 'Database migration',
      type: 'feat',
      walkthrough: [{ file: 'src/db.js', summary: 'Schema migration', type: 'modified' }],
      riskAssessment: {
        level: 'high',
        concerns: ['Irreversible migration', 'May cause data loss'],
        mitigations: ['Take a backup first', 'Run on staging first'],
      },
      reviewChecklist: ['Test migration rollback'],
    };

    const md = formatPrSummaryMarkdown(summary);
    assert.ok(md.includes('HIGH'));
    assert.ok(md.includes('Irreversible migration'));
    assert.ok(md.includes('Take a backup first'));
  });

  it('can disable collapsible sections', () => {
    const summary = {
      summary: 'Fix',
      type: 'fix',
      walkthrough: [],
      riskAssessment: { level: 'low', concerns: ['minor'], mitigations: [] },
      reviewChecklist: ['check'],
    };

    const mdWith = formatPrSummaryMarkdown(summary, { collapsible: true });
    const mdWithout = formatPrSummaryMarkdown(summary, { collapsible: false });
    assert.ok(mdWith.includes('<details>'));
    assert.ok(mdWith.includes('<summary>'));
    assert.ok(!mdWithout.includes('<details>'));
    assert.ok(!mdWithout.includes('<summary>'));
  });

  it('handles minimal summary gracefully', () => {
    const summary = {
      summary: '',
      type: 'unknown',
      walkthrough: [],
    };

    const md = formatPrSummaryMarkdown(summary);
    assert.ok(md.includes('AI Code Review Summary'));
    // Should not crash
    assert.ok(md.length > 20);
  });
});

// ── formatPrSummaryTerminal ──

describe('formatPrSummaryTerminal', () => {
  it('generates terminal output with walkthrough', () => {
    const summary = {
      title: 'Fix login bug',
      summary: 'Fixed the login redirect loop.',
      walkthrough: [
        { file: 'src/login.js', summary: 'Fixed redirect logic', type: 'modified' },
        { file: 'src/auth.js', summary: 'Updated token refresh', type: 'modified' },
      ],
      riskAssessment: { level: 'low' },
    };

    const output = formatPrSummaryTerminal(summary);
    assert.ok(output.includes('PR Summary'));
    assert.ok(output.includes('Fix login bug'));
    assert.ok(output.includes('src/login.js'));
    assert.ok(output.includes('src/auth.js'));
    assert.ok(output.includes('LOW'));
  });

  it('handles empty walkthrough', () => {
    const summary = {
      summary: 'Simple fix',
      walkthrough: [],
      riskAssessment: { level: 'low' },
    };

    const output = formatPrSummaryTerminal(summary);
    assert.ok(output.includes('PR Summary'));
    assert.ok(output.includes('Simple fix'));
  });
});
