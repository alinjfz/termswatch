import test from 'node:test';
import assert from 'node:assert/strict';

/*
 * Auth is now handled by Supabase directly (supabase.auth.signUp /
 * signInWithPassword / signOut). The local storage layer only manages
 * reports. These tests verify report-scoping logic using the storage
 * module against the live Supabase database.
 *
 * They require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set.
 * If those are missing the tests are skipped gracefully.
 */

const hasSupabase =
  (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
  process.env.SUPABASE_SERVICE_ROLE_KEY;

function skipIfNoSupabase(t) {
  if (!hasSupabase) {
    t.skip('Supabase credentials not configured');
    return true;
  }
  return false;
}

function fakeUserId() {
  return crypto.randomUUID();
}

function fakeReport(headline = 'Test report') {
  return {
    createdAt: new Date().toISOString(),
    mode: 'text',
    sources: {
      previous: { label: 'Original', value: '', title: 'Original policy', mode: 'text' },
      current: { label: 'Updated', value: '', title: 'Updated policy', mode: 'text' },
    },
    overview: {
      headline,
      modelMode: 'deterministic',
      summaryBullets: [],
      whyMatters: [],
      disclaimer: '',
    },
    metrics: { total: 1, highRisk: 0, modified: 1, added: 0, removed: 0, score: 10 },
    changes: [],
    runLog: [],
  };
}

test('reports are scoped per user', async (t) => {
  if (skipIfNoSupabase(t)) return;

  const { saveReport, listReports, getReport } = await import('./server/storage.js');

  const userA = fakeUserId();
  const userB = fakeUserId();

  const reportA = await saveReport(fakeReport('A report'), userA);
  await saveReport(fakeReport('B report'), userB);

  const reportsForA = await listReports(userA);
  const reportsForB = await listReports(userB);
  const hiddenFromB = await getReport(reportA.id, userB);

  assert.equal(reportsForA.length >= 1, true);
  assert.equal(reportsForB.length >= 1, true);
  assert.ok(reportsForA.every((r) => r.id !== reportsForB[0]?.id || reportsForA[0]?.id !== reportsForB[0]?.id));
  assert.equal(hiddenFromB, null);
});

test('getReport returns null for unknown id', async (t) => {
  if (skipIfNoSupabase(t)) return;

  const { getReport } = await import('./server/storage.js');
  const result = await getReport(crypto.randomUUID(), fakeUserId());
  assert.equal(result, null);
});

test('getUserDashboardStats aggregates correctly', async (t) => {
  if (skipIfNoSupabase(t)) return;

  const { saveReport, getUserDashboardStats } = await import('./server/storage.js');

  const userId = fakeUserId();
  await saveReport({ ...fakeReport('Stats test 1'), metrics: { total: 3, highRisk: 2 } }, userId);
  await saveReport({ ...fakeReport('Stats test 2'), metrics: { total: 5, highRisk: 1 } }, userId);

  const stats = await getUserDashboardStats(userId);
  assert.equal(stats.totalComparisons, 2);
  assert.equal(stats.highRiskFlags, 3);
  assert.equal(stats.totalChangedClauses, 8);
});
