/**
 * Dialer scheduler: per-dialer loop, round-robin, CST run window, daily stats.
 */

const { getConfig, getState, updateState } = require('./store');
const { getUploadMeta } = require('./upload-store');
const { getNextNotCalledRow, updateRow } = require('./spreadsheet');
const { createCall } = require('./vapi');
const { spin, substituteVariables } = require('./spin');
const { isWithinRunWindow } = require('./cst');

const timers = {};

function getNextPhoneNumberId(dialerId) {
  const config = getConfig();
  const state = getState();
  const ids = config.dialers[dialerId]?.phoneNumberIds || [];
  if (ids.length === 0) return null;
  const idx = state.dialers[dialerId]?.roundRobinIndex ?? 0;
  const nextId = ids[idx % ids.length];
  updateState((s) => {
    s.dialers[dialerId].roundRobinIndex = (idx + 1) % ids.length;
    return s;
  });
  return nextId;
}

function shouldLeaveVoicemail(dialerId) {
  const config = getConfig();
  const state = getState();
  const n = config.dialers[dialerId]?.voicemailN ?? 0;
  const m = config.dialers[dialerId]?.voicemailM ?? 1;
  if (n <= 0 || m < 1) return false;
  const count = state.dialers[dialerId]?.callCount ?? 0;
  return count % m < n;
}

function incrementCallCount(dialerId) {
  updateState((s) => {
    s.dialers[dialerId].callCount = (s.dialers[dialerId].callCount || 0) + 1;
    return s;
  });
}

function tick(dialerId) {
  const config = getConfig();
  const state = getState();
  if (!state.dialers[dialerId]?.running) return;

  const dialerConfig = config.dialers[dialerId];
  if (!dialerConfig?.assistantId || !dialerConfig?.phoneNumberIds?.length || !dialerConfig?.spreadsheetId) return;

  if (!isWithinRunWindow(dialerConfig.startTime || '', dialerConfig.endTime || '')) return;

  const meta = getUploadMeta(dialerConfig.spreadsheetId);
  if (!meta?.path) return;

  const next = getNextNotCalledRow(meta.path);
  if (!next) return;

  const { rowIndex, row } = next;
  const phoneNumberId = getNextPhoneNumberId(dialerId);
  if (!phoneNumberId) return;

  const variableValues = {
    firstName: row.firstName,
    lastName: row.lastName,
    address: row.address,
    city: row.city,
    zip: row.zip,
  };
  const leaveVoicemail = shouldLeaveVoicemail(dialerId);
  let voicemailMessage = '';
  if (leaveVoicemail && dialerConfig.voicemailMessage) {
    voicemailMessage = substituteVariables(spin(dialerConfig.voicemailMessage), variableValues);
  }

  const externalId = `${dialerId}:${dialerConfig.spreadsheetId}:${rowIndex}`;

  updateState((s) => {
    s.pendingCallPhoneNumber = s.pendingCallPhoneNumber || {};
    s.pendingCallPhoneNumber[externalId] = phoneNumberId;
    s.dialers[dialerId].callsPlacedToday = (s.dialers[dialerId].callsPlacedToday || 0) + 1;
    return s;
  });

  createCall({
    assistantId: dialerConfig.assistantId,
    phoneNumberId,
    customerNumber: row.phone,
    customerName: `${row.firstName} ${row.lastName}`.trim(),
    externalId,
    variableValues,
    voicemailMessage: voicemailMessage || undefined,
  }).then(() => {
    incrementCallCount(dialerId);
  }).catch((err) => {
    console.error(`Dialer ${dialerId} createCall failed:`, err.message);
  });
}

function startDialer(dialerId) {
  stopDialer(dialerId);
  const config = getConfig();
  const sec = config.dialers[dialerId]?.callEverySeconds ?? 30;
  timers[dialerId] = setInterval(() => tick(dialerId), sec * 1000);
  tick(dialerId);
}

function stopDialer(dialerId) {
  if (timers[dialerId]) {
    clearInterval(timers[dialerId]);
    timers[dialerId] = null;
  }
}

function scheduleDoubleTapRetry(externalId) {
  const parts = externalId.split(':');
  if (parts.length < 3) return;
  const [dialerId, uploadId, rowIndexStr] = parts;
  const rowIndex = parseInt(rowIndexStr, 10);
  if (isNaN(rowIndex)) return;

  const config = getConfig();
  if (!config.dialers[dialerId]?.doubleTap) return;

  const state = getState();
  const key = externalId;
  if (state.doubleTapRetry[key]) return;
  updateState((s) => {
    s.doubleTapRetry[key] = { at: Date.now(), dialerId };
    return s;
  });

  setTimeout(() => {
    const meta = getUploadMeta(uploadId);
    if (!meta?.path) return;

    const { readSheet, findHeaders, normalizeRow } = require('./spreadsheet');
    const { data } = readSheet(meta.path);
    const headers = findHeaders(data);
    const rowData = data[rowIndex];
    if (!rowData) return;
    const row = normalizeRow(rowData, headers);
    if (row.status.toLowerCase() !== 'not-called') return;

    const dialerConfig = getConfig().dialers[dialerId];
    const currentState = getState();
    const phoneNumberId = (currentState.pendingCallPhoneNumber && currentState.pendingCallPhoneNumber[externalId])
      || dialerConfig?.phoneNumberIds?.[0];
    if (!phoneNumberId) return;

    createCall({
      assistantId: dialerConfig.assistantId,
      phoneNumberId,
      customerNumber: row.phone,
      customerName: `${row.firstName} ${row.lastName}`.trim(),
      externalId,
      variableValues: {
        firstName: row.firstName,
        lastName: row.lastName,
        address: row.address,
        city: row.city,
        zip: row.zip,
      },
    }).catch((err) => console.error('Double-tap createCall failed:', err.message));

    updateState((s) => {
      delete s.doubleTapRetry[key];
      if (s.pendingCallPhoneNumber) delete s.pendingCallPhoneNumber[externalId];
      return s;
    });
  }, 30 * 1000);
}

module.exports = {
  startDialer,
  stopDialer,
  tick,
  scheduleDoubleTapRetry,
};
