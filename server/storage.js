import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_FILE = path.resolve(process.env.TERMSWATCH_DATA_FILE || 'data/app.json');
const LEGACY_FILE = path.resolve(process.env.TERMSWATCH_LEGACY_FILE || 'data/comparisons.json');

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, encodedHash) {
  const [salt, hash] = String(encodedHash || '').split(':');
  if (!salt || !hash) return false;
  const comparison = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(comparison, 'hex'));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function readLegacyReports() {
  try {
    const raw = await fs.readFile(LEGACY_FILE, 'utf8');
    const reports = JSON.parse(raw);
    return Array.isArray(reports) ? reports : [];
  } catch {
    return [];
  }
}

async function ensureDataFile() {
  try {
    await fs.access(DATA_FILE);
    return;
  } catch {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  }

  const legacyReports = await readLegacyReports();
  const initialState = {
    users: [],
    sessions: [],
    reports: legacyReports.map((report) => ({
      ...report,
      userId: report.userId || null,
    })),
  };
  await fs.writeFile(DATA_FILE, JSON.stringify(initialState, null, 2), 'utf8');
}

async function readState() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    return {
      users: [],
      sessions: [],
      reports: parsed.map((report) => ({ ...report, userId: report.userId || null })),
    };
  }

  return {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    reports: Array.isArray(parsed.reports) ? parsed.reports : [],
  };
}

async function writeState(state) {
  await fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export async function createUser({ name, email, password }) {
  const state = await readState();
  const normalizedEmail = normalizeEmail(email);
  if (state.users.some((user) => user.email === normalizedEmail)) {
    throw new Error('An account with that email already exists.');
  }

  const user = {
    id: crypto.randomUUID(),
    name: String(name || '').trim(),
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };

  state.users.unshift(user);
  await writeState(state);
  return sanitizeUser(user);
}

export async function authenticateUser({ email, password }) {
  const state = await readState();
  const normalizedEmail = normalizeEmail(email);
  const user = state.users.find((entry) => entry.email === normalizedEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error('Invalid email or password.');
  }
  return sanitizeUser(user);
}

export async function createSession(userId) {
  const state = await readState();
  const token = crypto.randomBytes(32).toString('hex');
  const session = {
    id: crypto.randomUUID(),
    userId,
    tokenHash: hashSecret(token),
    createdAt: new Date().toISOString(),
  };

  state.sessions = [session, ...state.sessions.filter((entry) => entry.userId !== userId)].slice(0, 200);
  await writeState(state);
  return token;
}

export async function getUserBySessionToken(token) {
  if (!token) return null;
  const state = await readState();
  const tokenHash = hashSecret(token);
  const session = state.sessions.find((entry) => entry.tokenHash === tokenHash);
  if (!session) return null;
  const user = state.users.find((entry) => entry.id === session.userId);
  return user ? sanitizeUser(user) : null;
}

export async function deleteSession(token) {
  if (!token) return;
  const state = await readState();
  const tokenHash = hashSecret(token);
  state.sessions = state.sessions.filter((entry) => entry.tokenHash !== tokenHash);
  await writeState(state);
}

export async function listReports(userId) {
  const state = await readState();
  return state.reports
    .filter((report) => report.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function getReport(id, userId) {
  const state = await readState();
  return state.reports.find((report) => report.id === id && report.userId === userId) || null;
}

export async function saveReport(report, userId) {
  const state = await readState();
  const entry = {
    ...report,
    id: report.id || crypto.randomUUID(),
    userId,
  };
  const nextReports = [entry, ...state.reports.filter((item) => item.id !== entry.id)].slice(0, 500);
  state.reports = nextReports;
  await writeState(state);
  return entry;
}

export async function getUserDashboardStats(userId) {
  const reports = await listReports(userId);
  const totalComparisons = reports.length;
  const highRiskFlags = reports.reduce((sum, report) => sum + (report.metrics?.highRisk || 0), 0);
  const totalChangedClauses = reports.reduce((sum, report) => sum + (report.metrics?.total || 0), 0);
  return {
    totalComparisons,
    highRiskFlags,
    totalChangedClauses,
  };
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}
