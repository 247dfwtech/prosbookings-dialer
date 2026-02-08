/**
 * Dialer API: config (with startTime/endTime), state (with daily stats), VAPI info, start/stop, test-call.
 */

const express = require('express');
const router = express.Router();
const { getConfig, updateConfig, getState, updateState } = require('../lib/store');
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
    return s;
  });
  scheduler.stopDialer(dialerId);
  res.json({ ok: true, running: false });
});

router.post('/test-call', async (req, res) => {
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
    await createCall({
      assistantId: dialerConfig.assistantId,
      phoneNumberId,
      customerNumber: phone,
      customerName: variableValues.firstName || 'Test',
      externalId: 'test:test:0',
      variableValues,
      voicemailMessage,
    });
    res.json({ ok: true, message: 'Test call placed' });
  } catch (e) {
    console.error('test-call', e);
    res.status(500).json({ error: e.message || 'Failed to place test call' });
  }
});

module.exports = router;
