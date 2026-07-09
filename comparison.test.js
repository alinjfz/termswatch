import test from 'node:test';
import assert from 'node:assert/strict';

import { getAIProviderStatus } from './server/llm.js';
import { runDeterministicAnalysis } from './shared/analysis.js';

const fallbackTexts = {
  old: `Privacy Policy

Data We Collect
We collect account details, basic usage information, and device identifiers needed to operate the service.

Sharing Information
We do not sell personal information. We share data with service providers only to support operations on our behalf.

Disputes
Disputes may be brought in local courts where required by law.`,
  current: `Privacy Policy

Data We Collect
We collect account details, device identifiers, approximate location, and product interaction data to operate and improve the service.

Sharing Information
We may share personal information with affiliates, analytics partners, and advertising partners to measure campaigns and improve recommendations.

Dispute Resolution
Any dispute will be resolved through binding arbitration on an individual basis, and users waive participation in class actions.

Billing
Paid plans automatically renew unless canceled before the renewal date.`,
};

test('fallback comparison detects added, modified, and high-risk clauses', () => {
  const result = runDeterministicAnalysis(fallbackTexts.old, fallbackTexts.current);

  assert.ok(result.metrics.total >= 4);
  assert.ok(result.metrics.added >= 1);
  assert.ok(result.metrics.modified >= 1);
  assert.ok(result.metrics.highRisk >= 1);
  assert.ok(result.overview.summaryBullets.length >= 3);
});

test('identical text yields no material changes', () => {
  const source = `Terms

Sharing
We do not sell data.

Retention
We delete data after closure.`;

  const result = runDeterministicAnalysis(source, source);

  assert.equal(result.metrics.total, 0);
  assert.equal(result.metrics.score, 0);
});

test('arbitration language is classified as high risk', () => {
  const previous = `Disputes

Disputes may be brought in court.`;
  const current = `Dispute Resolution

All disputes will be resolved through binding arbitration and users waive participation in class actions.`;

  const result = runDeterministicAnalysis(previous, current);

  assert.ok(result.changes.some((change) => change.riskLabel === 'Arbitration or class action'));
});

test('getAIProviderStatus reports whether model credentials are configured', () => {
  const originalOpenRouter = process.env.OPENROUTER_API_KEY;
  const originalOpenAI = process.env.OPENAI_API_KEY;

  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const unconfigured = getAIProviderStatus();
  assert.equal(unconfigured.configured, false);
  assert.match(unconfigured.message, /Deterministic comparison/i);

  process.env.OPENROUTER_API_KEY = 'test-key';
  const configured = getAIProviderStatus();
  assert.equal(configured.configured, true);
  assert.equal(configured.provider, 'Model API');

  if (originalOpenRouter === undefined) {
    delete process.env.OPENROUTER_API_KEY;
  } else {
    process.env.OPENROUTER_API_KEY = originalOpenRouter;
  }

  if (originalOpenAI === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAI;
  }
});
