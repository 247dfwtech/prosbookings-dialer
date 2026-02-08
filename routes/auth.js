const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const HASH = process.env.SITE_PASSWORD_HASH || '';

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect('/');
}

router.post('/login', (req, res) => {
  const password = req.body.password;
  if (!password) return res.status(400).json({ error: 'Password required' });
  if (!HASH) return res.status(500).json({ error: 'SITE_PASSWORD_HASH not set' });
  if (!bcrypt.compareSync(password, HASH)) return res.status(401).json({ error: 'Invalid password' });
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
