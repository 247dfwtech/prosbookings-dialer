const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const HASH = process.env.SITE_PASSWORD_HASH || '';

const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_MAX_ATTEMPTS = 5;
const loginAttempts = new Map();

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect('/');
}

router.post('/login', (req, res) => {
  const ip = getClientIp(req);
  const now = Date.now();
  let record = loginAttempts.get(ip);
  if (record) {
    if (now - record.firstAt > LOGIN_RATE_WINDOW_MS) {
      record = { count: 0, firstAt: now };
      loginAttempts.set(ip, record);
    }
    if (record.count >= LOGIN_RATE_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
    }
  } else {
    record = { count: 0, firstAt: now };
    loginAttempts.set(ip, record);
  }

  const password = req.body.password;
  if (!password) return res.status(400).json({ error: 'Password required' });
  if (!HASH) return res.status(500).json({ error: 'SITE_PASSWORD_HASH not set' });
  if (!bcrypt.compareSync(password, HASH)) {
    record.count += 1;
    return res.status(401).json({ error: 'Invalid password' });
  }
  loginAttempts.delete(ip);
  req.session.authenticated = true;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

router.get('/check', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

module.exports = router;
module.exports.requireAuth = requireAuth;
