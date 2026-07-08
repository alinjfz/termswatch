import {
  authenticateUser,
  createSession,
  createUser,
  deleteSession,
  getUserBySessionToken,
} from './storage.js';

const SESSION_COOKIE = 'termswatch_session';

function parseCookies(header) {
  return String(header || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return acc;
      const key = part.slice(0, separatorIndex).trim();
      const value = decodeURIComponent(part.slice(separatorIndex + 1));
      acc[key] = value;
      return acc;
    }, {});
}

function sessionCookie(value, expires = '') {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=2592000',
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  if (expires) {
    parts.push(expires);
  }
  return parts.join('; ');
}

export async function attachCurrentUser(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie);
  req.sessionToken = cookies[SESSION_COOKIE] || null;
  req.user = await getUserBySessionToken(req.sessionToken);
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  next();
}

export async function signupAndCreateSession({ name, email, password }) {
  const user = await createUser({ name, email, password });
  const token = await createSession(user.id);
  return { user, token };
}

export async function loginAndCreateSession({ email, password }) {
  const user = await authenticateUser({ email, password });
  const token = await createSession(user.id);
  return { user, token };
}

export function writeSessionCookie(res, token) {
  res.setHeader('Set-Cookie', sessionCookie(token));
}

export async function clearSession(res, token) {
  await deleteSession(token);
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
  );
}
