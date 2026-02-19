const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const HASH = process.env.SITE_PASSWORD_HASH || '';
// Built-in fallback so you can always get in with Caleb$771 from any browser
const FALLBACK_HASH = '$2a$10$z.Ja6/zrRxADwOS/9QNHleDw0jCDwIq574VQgKhobTw.1PAMoTh3u';

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
  const raw = typeof body.password === 'string' ? body.password : '';
  const password = normalizePassword(raw);
  if (!password) {
    console.log('[auth] login failed: no password. body keys=', body ? Object.keys(body) : 'none');
    if (formPost) return res.redirect(302, '/?error=invalid');
    return res.status(400).json({ error: 'Password required' });
  }
  const literalMatch = password === 'Caleb$771';
  const matchesEnv = HASH && bcrypt.compareSync(password, HASH);
  const matchesFallback = bcrypt.compareSync(password, FALLBACK_HASH);
  if (!literalMatch && !matchesEnv && !matchesFallback) {
    record.count += 1;
    const codes = [...raw].map((c) => c.codePointAt(0));
    console.log('[auth] login failed: len=', raw.length, 'normalizedLen=', password.length, 'charCodes=', codes.join(','));
    if (formPost) return res.redirect(302, '/?error=invalid');
    return res.status(401).json({
      error: 'Invalid password',
      debug: { rawLength: raw.length, normalizedLength: password.length, charCodes: codes },
    });
  }
  loginAttempts.delete(ip);
  req.session.authenticated = true;
  if (formPost) return res.redirect(302, '/dashboard');
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('[auth] logout session.destroy error:', err);
    res.clearCookie('connect.sid', { path: '/' });
    res.json({ ok: true });
  });
});

router.get('/check', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

module.exports = router;
module.exports.requireAuth = requireAuth;
