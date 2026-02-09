/**
 * Dialer API: config (with startTime/endTime), state (with daily stats), VAPI info, start/stop, test-call.
 */

const express = require('express');
const router = express.Router();
const { getConfig, updateConfig, getState, updateState } = require('../lib/store');
const { getUploadMeta } = require('../lib/upload-store');
const { getNextNotCalledRow } = require('../lib/spreadsheet');
const { listAssistants, listPhoneNumbers, createCall } = require('../lib/vapi');
const scheduler = require('../lib/scheduler');
const { spin, substituteVariables } = require('../lib/spin');

router.get('/config', (req, res) => {
  res.json(getConfig());
});

router.put('/config', (req, res) => {
  const body = req.body || {};
  const dialerId = body.dialerId;
  if (!dialerId || !['dialer1', 'dialer2', 'dialer3'].includes(dialerId)) {
    return res.status(400).json({ error: 'Invalid dialerId' });
  }
  const config = updateConfig((c) => {
    const d = c.dialers[dialerId] || {};
    c.dialers[dialerId] = { ...d, ...body };
    delete c.dialers[dialerId].dialerId;
    return c;
  });
  res.json(config);
});

router.get('/state', (req, res) => {
  res.json(getState());
});

router.get('/next-up', (req, res) => {
  const config = getConfig();
  const state = getState();
  const nextUp = {};
  for (const id of ['dialer1', 'dialer2', 'dialer3']) {
    const dialerConfig = config.dialers[id];
    if (!dialerConfig?.spreadsheetId || !state.dialers[id]?.running) {
      nextUp[id] = null;
      continue;
    }
    const meta = getUploadMeta(dialerConfig.spreadsheetId);
    if (!meta?.path) {
      nextUp[id] = null;
      continue;
    }
    try {
      const next = getNextNotCalledRow(meta.path);
      if (!next) {
        nextUp[id] = { done: true };
        continue;
      }
      nextUp[id] = {
        firstName: next.row.firstName,
        lastName: next.row.lastName,
        phone: next.row.phone,
        rowIndex: next.rowIndex,
      };
    } catch (e) {
      nextUp[id] = null;
    }
  }
  res.json(nextUp);
});

router.get('/vapi-info', async (req, res) => {
  try {
    const [assistants, phoneNumbers] = await Promise.all([
      listAssistants(),
      listPhoneNumbers(),
    ]);
    res.json({ assistants, phoneNumbers });
  } catch (e) {
    console.error('vapi-info', e);
    res.status(500).json({ error: e.message || 'Failed to fetch VAPI info' });
  }
});

router.post('/start/:dialerId', (req, res) => {
  const { dialerId } = req.params;
  if (!['dialer1', 'dialer2', 'dialer3'].includes(dialerId)) {
    return res.status(400).json({ error: 'Invalid dialerId' });
  }
  const config = getConfig();
  const dialerConfig = config.dialers[dialerId];
  if (!dialerConfig?.assistantId || !dialerConfig?.phoneNumberIds?.length || !dialerConfig?.spreadsheetId) {
    return res.status(400).json({ error: 'Configure assistant, phone numbers, and spreadsheet first' });
  }
  updateState((s) => {
    s.dialers[dialerId].running = true;
    s.dialers[dialerId].paused = false;
    return s;
  });
  scheduler.startDialer(dialerId);
  res.json({ ok: true, running: true });
});

router.post('/stop/:dialerId', (req, res) => {
  const { dialerId } = req.params;
  if (!['dialer1', 'dialer2', 'dialer3'].includes(dialerId)) {
    return res.status(400).json({ error: 'Invalid dialerId' });
  }
  updateState((s) => {
    s.dialers[dialerId].running = false;
    s.dialers[dialerId].paused = false;
    return s;
  });
  scheduler.stopDialer(dialerId);
  res.json({ ok: true, running: false });
});

router.post('/pause/:dialerId', (req, res) => {
  const { dialerId } = req.params;
  if (!['dialer1', 'dialer2', 'dialer3'].includes(dialerId)) {
    return res.status(400).json({ error: 'Invalid dialerId' });
  }
  updateState((s) => {
    s.dialers[dialerId].paused = true;
    return s;
  });
  res.json({ ok: true, paused: true });
});

router.post('/resume/:dialerId', (req, res) => {
  const { dialerId } = req.params;
  if (!['dialer1', 'dialer2', 'dialer3'].includes(dialerId)) {
    return res.status(400).json({ error: 'Invalid dialerId' });
  }
  updateState((s) => {
    s.dialers[dialerId].paused = false;
    return s;
  });
  res.json({ ok: true, paused: false });
});

router.post('/test-call', async (req, res) => {
  console.log('[test-call] Request received', { body: req.body });
  const { dialerId, firstName, address, phone } = req.body || {};
  if (!dialerId || !['dialer1', 'dialer2', 'dialer3'].includes(dialerId)) {
    return res.status(400).json({ error: 'Invalid dialerId' });
  }
  if (!phone || String(phone).replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Valid phone number required (10 digits)' });
  }
  const config = getConfig();
  const dialerConfig = config.dialers[dialerId];
  if (!dialerConfig?.assistantId || !dialerConfig?.phoneNumberIds?.length) {
    return res.status(400).json({ error: 'Configure assistant and at least one phone number first' });
  }
  const phoneNumberId = dialerConfig.phoneNumberIds[0];
  const voicemailN = dialerConfig.voicemailN ?? 0;
  const variableValues = {
    firstName: String(firstName || '').trim(),
    lastName: '',
    address: String(address || '').trim(),
    city: '',
    zip: '',
  };
  let voicemailMessage;
  if (voicemailN >= 1 && dialerConfig.voicemailMessage) {
    const afterSpin = spin(dialerConfig.voicemailMessage);
    voicemailMessage = substituteVariables(afterSpin, variableValues);
    console.log('[test-call] variableValues', variableValues, 'voicemailMessage (first 120 chars)', (voicemailMessage || '').slice(0, 120));
  }
  try {
    console.log('[test-call] Placing call for', dialerId, 'to', phone, 'assistant', dialerConfig.assistantId, 'phoneNumberId', phoneNumberId);
    const call = await createCall({
      assistantId: dialerConfig.assistantId,
      phoneNumberId,
      customerNumber: phone,
      customerName: variableValues.firstName || 'Test',
      externalId: 'test:test:0',
      variableValues,
      voicemailMessage,
    });
    console.log('[test-call] VAPI accepted call id:', call?.id || call);
    res.json({ ok: true, message: 'Test call placed', callId: call?.id });
  } catch (e) {
    console.error('[test-call] Failed:', e.message, e.stack || '');
    res.status(500).json({ error: e.message || 'Failed to place test call' });
  }
});

module.exports = router;
