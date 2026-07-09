import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

async function withApiServer(run) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'termswatch-e2e-'));
  const dataFile = path.join(tempDir, 'app.json');
  const legacyFile = path.join(tempDir, 'legacy.json');
  const port = 18000 + Math.floor(Math.random() * 1000);

  const serverProcess = spawn('node', ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TERMSWATCH_DATA_FILE: dataFile,
      TERMSWATCH_LEGACY_FILE: legacyFile,
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForHealth(baseUrl, 15000);
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => {
      if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
        resolve();
        return;
      }

      serverProcess.once('exit', resolve);
      serverProcess.kill('SIGTERM');
    });
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function waitForHealth(baseUrl, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`API did not become healthy within ${timeoutMs}ms`);
}

function parseSetCookie(setCookieHeader) {
  if (!setCookieHeader) {
    return '';
  }
  const first = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  return first.split(';')[0];
}

async function apiJson(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const rawText = await response.text();
  const json = rawText ? JSON.parse(rawText) : null;

  return { response, json };
}

test('e2e smoke: signup, compare, history, export, and landing build', async () => {
  await withApiServer(async (baseUrl) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'password12345';

    const signup = await apiJson(baseUrl, '/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name: 'E2E User', email, password }),
    });

    assert.equal(signup.response.status, 201, 'signup should succeed');
    assert.ok(signup.json.user?.email, 'signup should return user');
    const cookie = parseSetCookie(signup.response.headers.get('set-cookie'));
    assert.ok(cookie, 'signup should set session cookie');

    const me = await apiJson(baseUrl, '/api/auth/me', {
      headers: { cookie },
    });
    assert.equal(me.json.user.email, email, 'session should restore user');

    const compare = await apiJson(baseUrl, '/api/compare', {
      method: 'POST',
      headers: { cookie },
      body: JSON.stringify({
        mode: 'text',
        model: 'openrouter/free',
        previous: { kind: 'text', value: 'We share data with service providers only.' },
        current: { kind: 'text', value: 'We may share personal information with affiliates and partners.' },
      }),
    });

    assert.equal(compare.response.status, 200, 'compare should succeed');
    assert.ok(compare.json.report?.id, 'compare should return report id');
    assert.ok(compare.json.report?.overview, 'compare should return overview');
    assert.ok(Array.isArray(compare.json.report?.changes), 'compare should return changes');

    const reportId = compare.json.report.id;

    const history = await apiJson(baseUrl, '/api/history', {
      headers: { cookie },
    });
    assert.ok(history.json.reports?.some((item) => item.id === reportId), 'history should include new report');

    const report = await apiJson(baseUrl, `/api/report/${reportId}`, {
      headers: { cookie },
    });
    assert.equal(report.json.report.id, reportId, 'report detail should load');

    const exportResponse = await fetch(`${baseUrl}/api/export/${reportId}`, {
      headers: { cookie },
    });
    assert.equal(exportResponse.status, 200, 'export should succeed');
    const markdown = await exportResponse.text();
    assert.match(markdown, /#|report|change/i, 'export should return markdown content');
  });

  const distIndex = await fs.readFile(path.join(process.cwd(), 'dist/index.html'), 'utf8');
  assert.match(distIndex, /TermsWatch/, 'built landing should include product name');
  assert.match(distIndex, /Newsreader|Instrument Sans/, 'built landing should include fonts');
});

test('e2e smoke: built index is servable and contains landing markers', async () => {
  const distDir = path.join(process.cwd(), 'dist');
  const indexPath = path.join(distDir, 'index.html');
  const indexHtml = await fs.readFile(indexPath, 'utf8');

  await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const requested = req.url === '/' ? '/index.html' : req.url;
        const filePath = path.join(distDir, requested);
        const content = await fs.readFile(filePath);
        const ext = path.extname(filePath);
        const type = ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'text/html';
        res.writeHead(200, { 'content-type': type });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    });

    server.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`);
        const html = await response.text();
        assert.equal(response.status, 200);
        assert.match(html, /Policy change intelligence/);
        assert.match(html, /root/);
        server.close(resolve);
      } catch (error) {
        server.close(() => reject(error));
      }
    });
  });
});
