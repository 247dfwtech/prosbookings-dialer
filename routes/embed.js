/**
 * Embed routes — token-authenticated (no session required).
 * Each subuser has a UUID embedToken stored in users.json.
 * The embed page polls these endpoints to show a compact dialer widget in an iframe.
 *
 * Routes (all mounted at root):
 *   GET  /embed/:token           — serves embed.html
 *   GET  /api/embed/:token/state — current state JSON
 *   POST /api/embed/:token/start
 *   POST /api/embed/:token/stop
 *   POST /api/embed/:token/pause
 *   POST /api/embed/:token/resume
 */

const express = require('express');
const path = require('path');
const router = express.Router();
const { findUserByEmbedToken } = require('../lib/users');
const { getConfig, getState, updateState } = require('../lib/store');
const scheduler = require('../lib/scheduler');

function resolveToken(req, res, next) {
  const token = req.params.token;
  const user = findUserByEmbedToken(token);
  if (!user) return res.status(404).json({ error: 'Invalid embed token' });
  req.embedUser = user;
  req.embedDialerId = user.dialerId;
  next();
}

// Serve standalone embed page
router.get('/embed/:token', resolveToken, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'embed.html'));
});

// State
router.get('/api/embed/:token/state', resolveToken, (req, res) => {
  const dialerId = req.embedDialerId;
  const config = getConfig();
  const state = getState();
  const ds = state.dialers?.[dialerId] || {};
  const dc = config.dialers?.[dialerId] || {};
  res.json({
    dialerId,
    username: req.embedUser.username,
    running: !!ds.running,
    paused: !!ds.paused,
    callsPlacedToday: ds.callsPlacedToday || 0,
    spreadsheetId: dc.spreadsheetId || null,
  });
});

// Start
router.post('/api/embed/:token/start', resolveToken, (req, res) => {
  const dialerId = req.embedDialerId;
  const config = getConfig();
  if (!config.dialers[dialerId]) return res.status(400).json({ error: 'Dialer not configured' });
  updateState((s) => { s.dialers[dialerId].running = true; s.dialers[dialerId].paused = false; return s; });
  scheduler.startDialer(dialerId);
  res.json({ ok: true });
});

// Stop
router.post('/api/embed/:token/stop', resolveToken, (req, res) => {
  const dialerId = req.embedDialerId;
  updateState((s) => { s.dialers[dialerId].running = false; s.dialers[dialerId].paused = false; return s; });
  scheduler.stopDialer(dialerId);
  res.json({ ok: true });
});

// Pause
router.post('/api/embed/:token/pause', resolveToken, (req, res) => {
  const dialerId = req.embedDialerId;
  updateState((s) => { s.dialers[dialerId].paused = true; return s; });
  res.json({ ok: true });
});

// Resume
router.post('/api/embed/:token/resume', resolveToken, (req, res) => {
  const dialerId = req.embedDialerId;
  updateState((s) => { s.dialers[dialerId].paused = false; return s; });
  res.json({ ok: true });
});

module.exports = router;
