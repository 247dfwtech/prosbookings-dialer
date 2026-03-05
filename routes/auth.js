const express = require('express');
const router = express.Router();
const { validateUser } = require('../lib/users');

const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_MAX_ATTEMPTS = 5;
const loginAttempts = new Map();

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

/** Normalize so Safari/Chrome private/paste don't break login. */
function normalizePassword(str) {
  if (typeof str !== 'string') return '';
  let s = str.trim();
  // Strip zero-width and other invisible chars
  s = s.replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g, '');
  // Fullwidth forms -> ASCII (U+FF01–U+FF5E -> 0x21–0x7E)
  s = s.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCodePoint(ch.codePointAt(0) - 0xfee0));
  // Dollar lookalikes -> ASCII $
  s = s.replace(/\uFF04/g, '$'); // fullwidth dollar
  return s.trim();
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect('/');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  return res.status(403).json({ error: 'Admin only' });
}

function isFormPost(req) {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  return ct.includes('application/x-www-form-urlencoded');
}

router.post('/login', (req, res) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const formPost = isFormPost(req);

  let record = loginAttempts.get(ip);
  if (record) {
    if (now - record.firstAt > LOGIN_RATE_WINDOW_MS) {
      record = { count: 0, firstAt: now };
      loginAttempts.set(ip, record);
    }
    if (record.count >= LOGIN_RATE_MAX_ATTEMPTS) {
      if (formPost) return res.redirect(302, '/?error=too_many');
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
    }
  } else {
    record = { count: 0, firstAt: now };
    loginAttempts.set(ip, record);
  }

  const body = req.body || {};
  const rawUsername = typeof body.username === 'string' ? body.username.trim() : '';
  const rawPassword = typeof body.password === 'string' ? body.password : '';
  const password = normalizePassword(rawPassword);

  if (!rawUsername) {
    if (formPost) return res.redirect(302, '/?error=invalid');
    return res.status(400).json({ error: 'Username required' });
  }
  if (!password) {
    if (formPost) return res.redirect(302, '/?error=invalid');
    return res.status(400).json({ error: 'Password required' });
  }

  const user = validateUser(rawUsername, password);
  if (!user) {
    record.count += 1;
    console.log('[auth] login failed: username=', rawUsername);
    if (formPost) return res.redirect(302, '/?error=invalid');
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  loginAttempts.delete(ip);
  req.session.authenticated = true;
  req.session.username = user.username;
  req.session.role = user.role;
  req.session.dialerId = user.dialerId || null;

  console.log(`[auth] login ok: ${user.username} (${user.role})`);

  if (formPost) return res.redirect(302, '/dashboard');
  res.json({ ok: true, role: user.role, dialerId: user.dialerId });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('[auth] logout session.destroy error:', err);
    res.clearCookie('connect.sid', { path: '/' });
    res.json({ ok: true });
  });
});

router.get('/check', (req, res) => {
  if (!(req.session && req.session.authenticated)) {
    return res.json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    username: req.session.username || null,
    role: req.session.role || 'admin',
    dialerId: req.session.dialerId || null,
  });
});

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.requireAdmin = requireAdmin;
