/**
 * Admin-only routes: subuser management.
 * All routes here require requireAuth + requireAdmin (applied in server.js).
 */

const express = require('express');
const router = express.Router();
const { listSubusers, createSubuser, deleteSubuser } = require('../lib/users');
const { ensureDialerInConfig } = require('../lib/store');
const scheduler = require('../lib/scheduler');
const { getState } = require('../lib/store');

router.get('/users', (req, res) => {
  res.json(listSubusers());
});

router.post('/users', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Username required' });
  }
  if (!password || typeof password !== 'string' || password.length < 1) {
    return res.status(400).json({ error: 'Password required' });
  }
  try {
    const user = createSubuser(username.trim(), password);
    ensureDialerInConfig(user.dialerId);
    res.json({ ok: true, user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/users/:username', (req, res) => {
  const { username } = req.params;
  try {
    const removed = deleteSubuser(username);
    // Stop their dialer if it's running
    const state = getState();
    if (state.dialers[removed.dialerId]?.running) {
      scheduler.stopDialer(removed.dialerId);
    }
    res.json({ ok: true, removed });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
