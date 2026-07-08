import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function withTempStorage(run) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'termswatch-auth-'));
  process.env.TERMSWATCH_DATA_FILE = path.join(tempDir, 'app.json');
  process.env.TERMSWATCH_LEGACY_FILE = path.join(tempDir, 'legacy.json');

  const storage = await import(`./server/storage.js?case=${Date.now()}${Math.random()}`);
  try {
    await run(storage, tempDir);
  } finally {
    delete process.env.TERMSWATCH_DATA_FILE;
    delete process.env.TERMSWATCH_LEGACY_FILE;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('createUser and authenticateUser work with hashed passwords', async () => {
  await withTempStorage(async (storage) => {
    const user = await storage.createUser({
      name: 'Ali Tester',
      email: 'ali@example.com',
      password: 'password123',
    });

    assert.equal(user.email, 'ali@example.com');

    const authed = await storage.authenticateUser({
      email: 'ali@example.com',
      password: 'password123',
    });

    assert.equal(authed.id, user.id);
  });
});

test('session tokens resolve back to the correct user', async () => {
  await withTempStorage(async (storage) => {
    const user = await storage.createUser({
      name: 'Session User',
      email: 'session@example.com',
      password: 'password123',
    });

    const token = await storage.createSession(user.id);
    const resolved = await storage.getUserBySessionToken(token);

    assert.equal(resolved.email, 'session@example.com');
  });
});

test('reports are scoped per user', async () => {
  await withTempStorage(async (storage) => {
    const userA = await storage.createUser({
      name: 'User A',
      email: 'a@example.com',
      password: 'password123',
    });
    const userB = await storage.createUser({
      name: 'User B',
      email: 'b@example.com',
      password: 'password123',
    });

    const reportA = await storage.saveReport(
      {
        createdAt: new Date().toISOString(),
        overview: { headline: 'A report' },
        metrics: { total: 1, highRisk: 0 },
      },
      userA.id,
    );

    await storage.saveReport(
      {
        createdAt: new Date().toISOString(),
        overview: { headline: 'B report' },
        metrics: { total: 2, highRisk: 1 },
      },
      userB.id,
    );

    const reportsForA = await storage.listReports(userA.id);
    const reportsForB = await storage.listReports(userB.id);
    const hiddenFromB = await storage.getReport(reportA.id, userB.id);

    assert.equal(reportsForA.length, 1);
    assert.equal(reportsForB.length, 1);
    assert.equal(hiddenFromB, null);
  });
});
