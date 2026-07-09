import cors from 'cors';
import express from 'express';
import { z } from 'zod';

import { loadEnvFile } from './env.js';

loadEnvFile();

import {
  attachCurrentUser,
  clearSession,
  loginAndCreateSession,
  requireAuth,
  signupAndCreateSession,
  writeSessionCookie,
} from './auth.js';
import { resolveSource } from './extract.js';
import { analyzeDocuments, getAIProviderStatus } from './llm.js';
import { getSampleById, samplePolicies } from './samples.js';
import { getReport, getUserDashboardStats, listReports, saveReport } from './storage.js';

const app = express();
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (/^https?:\/\/127\.0\.0\.1:\d+$/.test(origin) || /^https?:\/\/localhost:\d+$/.test(origin)) {
        callback(null, true);
        return;
      }

      callback(null, true);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(attachCurrentUser);

const CompareSchema = z.object({
  mode: z.enum(['url', 'text']),
  model: z.string().optional(),
  previous: z.object({ kind: z.enum(['url', 'text']), value: z.string().min(1) }),
  current: z.object({ kind: z.enum(['url', 'text']), value: z.string().min(1) }),
});
const SignupSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});
const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function compactReport(report) {
  return {
    id: report.id,
    createdAt: report.createdAt,
    mode: report.mode,
    headline: report.overview.headline,
    metrics: report.metrics,
    sources: report.sources,
    modelMode: report.overview.modelMode,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: getAIProviderStatus() });
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.user) {
    res.json({ user: null });
    return;
  }

  const stats = await getUserDashboardStats(req.user.id);
  res.json({ user: req.user, stats });
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const payload = SignupSchema.parse(req.body);
    const { user, token } = await signupAndCreateSession(payload);
    writeSessionCookie(res, token);
    const stats = await getUserDashboardStats(user.id);
    res.status(201).json({ user, stats });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Signup failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const payload = LoginSchema.parse(req.body);
    const { user, token } = await loginAndCreateSession(payload);
    writeSessionCookie(res, token);
    const stats = await getUserDashboardStats(user.id);
    res.json({ user, stats });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Login failed' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  await clearSession(res, req.sessionToken);
  res.json({ ok: true });
});

app.get('/api/samples', (_req, res) => {
  res.json({
    samples: samplePolicies.map((sample) => ({
      id: sample.id,
      name: sample.name,
      category: sample.category,
      description: sample.description,
      recommendedMode: sample.recommendedMode,
      expectedOutcome: sample.expectedOutcome,
      previousUrl: sample.previousUrl,
      currentUrl: sample.currentUrl,
    })),
  });
});

app.get('/api/sample/:id', (req, res) => {
  const sample = getSampleById(req.params.id);
  if (!sample) {
    res.status(404).json({ error: 'Sample not found' });
    return;
  }
  res.json({ sample });
});

app.get('/api/history', requireAuth, async (req, res) => {
  const reports = await listReports(req.user.id);
  res.json({ reports: reports.map(compactReport) });
});

app.get('/api/report/:id', requireAuth, async (req, res) => {
  const report = await getReport(req.params.id, req.user.id);
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  res.json({ report });
});

app.get('/api/export/:id', requireAuth, async (req, res) => {
  const report = await getReport(req.params.id, req.user.id);
  if (!report) {
    res.status(404).send('Report not found');
    return;
  }

  const markdown = [
    '# TermsWatch Report',
    '',
    `Generated: ${new Date(report.createdAt).toLocaleString()}`,
    `Headline: ${report.overview.headline}`,
    `Model mode: ${report.overview.modelMode}`,
    '',
    '## Summary',
    ...report.overview.summaryBullets.map((item) => `- ${item}`),
    '',
    '## Why This Matters',
    ...report.overview.whyMatters.map((item) => `- ${item}`),
    '',
    '## Changed Clauses',
    ...report.changes.flatMap((change) => [
      `### ${change.heading}`,
      `- Change: ${change.changeLabel}`,
      `- Risk: ${change.riskLevel} / ${change.riskLabel}`,
      `- Summary: ${change.summary}`,
      `- Why it matters: ${change.whyItMatters}`,
      '',
      'Before:',
      change.beforeText || 'None',
      '',
      'After:',
      change.afterText || 'None',
      '',
    ]),
  ].join('\n');

  res.setHeader('content-type', 'text/markdown; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="termswatch-${report.id}.md"`);
  res.send(markdown);
});

app.post('/api/compare', requireAuth, async (req, res) => {
  try {
    const payload = CompareSchema.parse(req.body);
    const previous = await resolveSource({ ...payload.previous, label: 'Original policy' });
    const current = await resolveSource({ ...payload.current, label: 'Updated policy' });
    const analysis = await analyzeDocuments({
      previousText: previous.content,
      currentText: current.content,
      mode: payload.mode,
      model: payload.model,
    });

    const report = await saveReport(
      {
        createdAt: new Date().toISOString(),
        mode: payload.mode,
        sources: {
          previous: { label: previous.label, value: previous.value, title: previous.title, mode: previous.mode },
          current: { label: current.label, value: current.value, title: current.title, mode: current.mode },
        },
        ...analysis,
      },
      req.user.id,
    );

    res.json({ report });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Comparison failed',
    });
  }
});

const port = Number(process.env.PORT) || 8787;
app.listen(port, '127.0.0.1', () => {
  console.log(`TermsWatch API listening on http://127.0.0.1:${port}`);
});
