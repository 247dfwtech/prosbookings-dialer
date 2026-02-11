/**
 * Dialer scheduler: per-dialer loop, round-robin, CST run window, daily stats.
 */

const { getConfig, getState, updateState } = require('./store');
const { getUploadMeta, parseExternalId } = require('./upload-store');
const { getNextNotCalledRow, updateRow } = require('./spreadsheet');
const { isBlacklisted, addToBlacklist } = require('./blacklist');
const { isAddressBooked } = require('./booked');

const PENDING_CALL_TIMEOUT_MS = 2 * 60 * 1000;
const { createCall } = require('./vapi');
const { spin, substituteVariables } = require('./spin');
const { isWithinRunWindow, isAllowedDay } = require('./cst');

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
  if (state.dialers[dialerId]?.paused) return;

  const dialerConfig = config.dialers[dialerId];
  if (!dialerConfig?.assistantId || !dialerConfig?.phoneNumberIds?.length || !dialerConfig?.spreadsheetId) {
    console.log(`[scheduler] ${dialerId} skip: need assistant, phone numbers, and spreadsheet configured`);
    return;
  }

  if (!isWithinRunWindow(dialerConfig.startTime || '', dialerConfig.endTime || '')) return;
  if (!isAllowedDay(dialerConfig.daysOfWeek)) return;

  const meta = getUploadMeta(dialerConfig.spreadsheetId);
  if (!meta?.path) {
    console.log(`[scheduler] ${dialerId} skip: no upload meta/path for spreadsheetId ${dialerConfig.spreadsheetId}`);
    return;
  }

  const targetZip = dialerConfig.targetZip ? String(dialerConfig.targetZip).trim() : '';
  let next = getNextNotCalledRow(meta.path, targetZip);
  while (next && (isBlacklisted(next.row.phone) || isAddressBooked(next.row.address))) {
    const reason = isBlacklisted(next.row.phone) ? 'blacklisted' : 'address-already-booked';
    try {
      updateRow(meta.path, next.rowIndex, { status: 'called', endedReason: reason });
    } catch (e) {
      console.error(`[scheduler] ${dialerId} skip updateRow:`, e.message);
    }
    const skipReason = isBlacklisted(next.row.phone) ? 'blacklisted' : 'address already booked';
    console.log(`[scheduler] ${dialerId} row ${next.rowIndex} skipped (${skipReason})`);
    next = getNextNotCalledRow(meta.path, targetZip);
  }
  if (!next) return;

  const { rowIndex, row } = next;
  const externalId = buildExternalId(dialerId, dialerConfig.spreadsheetId, rowIndex);

  if (state.pendingCallPhoneNumber?.[externalId]) {
    const startedAt = state.pendingCallStartedAt?.[externalId];
    if (startedAt && Date.now() - startedAt > PENDING_CALL_TIMEOUT_MS) {
      try {
        updateRow(meta.path, rowIndex, { status: 'called', endedReason: 'call-failed-timeout' });
      } catch (e) {
        console.error(`[scheduler] ${dialerId} timeout updateRow:`, e.message);
      }
      const phone = row.phone != null ? String(row.phone).replace(/\D/g, '').slice(-10) : '';
      if (phone && addToBlacklist(phone)) {
        console.log(`[scheduler] ${dialerId} row ${rowIndex} added to blacklist (timeout, no webhook):`, phone);
      }
      updateState((s) => {
        if (s.pendingCallPhoneNumber) delete s.pendingCallPhoneNumber[externalId];
        if (s.pendingCallStartedAt) delete s.pendingCallStartedAt[externalId];
        return s;
      });
      console.log(`[scheduler] ${dialerId} row ${rowIndex} marked called (timeout, no webhook)`);
    }
    return;
  }

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

  console.log(`[scheduler] ${dialerId} placing call row ${rowIndex} to ${row.phone} (externalId ${externalId})`);

  createCall({
    assistantId: dialerConfig.assistantId,
    phoneNumberId,
    customerNumber: row.phone,
    customerName: `${row.firstName} ${row.lastName}`.trim(),
    externalId,
    variableValues,
    voicemailMessage: voicemailMessage || undefined,
  }).then(() => {
    updateState((s) => {
      s.pendingCallPhoneNumber = s.pendingCallPhoneNumber || {};
      s.pendingCallPhoneNumber[externalId] = phoneNumberId;
      s.pendingCallStartedAt = s.pendingCallStartedAt || {};
      s.pendingCallStartedAt[externalId] = Date.now();
      s.dialers[dialerId].callsPlacedToday = (s.dialers[dialerId].callsPlacedToday || 0) + 1;
      return s;
    });
    incrementCallCount(dialerId);
  }).catch((err) => {
    console.error(`Dialer ${dialerId} createCall failed:`, err.message, err.stack || '');
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

function buildExternalId(dialerId, spreadsheetId, rowIndex) {
  const d = dialerId === 'dialer1' ? 'd1' : dialerId === 'dialer2' ? 'd2' : dialerId === 'dialer3' ? 'd3' : dialerId;
  const short = String(spreadsheetId || '').slice(0, 8);
  return `${d}:${short}:${rowIndex}`;
}

function scheduleDoubleTapRetry(externalId) {
  const parsed = parseExternalId(externalId);
  if (!parsed) return;
  const { dialerId, uploadId, rowIndex } = parsed;

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
