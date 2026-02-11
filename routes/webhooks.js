/**
 * Webhooks: VAPI end-of-call, booking_tool (calendar + email), inbound lookup.
 * Includes daily stats: recordCallEnded (answered/not answered), recordBooking.
 */

const express = require('express');
const router = express.Router();
const { getUploadMeta, parseExternalId } = require('../lib/upload-store');
const { updateRow, findRowByPhone } = require('../lib/spreadsheet');
const { listUploads } = require('../lib/upload-store');
const scheduler = require('../lib/scheduler');
const { sendBookingConfirmation } = require('../lib/email');
const { createEvent } = require('../lib/calendar');
const { updateState } = require('../lib/store');
const { recordCallEnded, recordBooking } = require('../lib/stats');
const { addToBlacklist } = require('../lib/blacklist');
const { addBooking } = require('../lib/booked');

const TEST_PHONE_LAST10 = new Set(['2146002023', '8178086172', '9156379939']);

// VAPI ended reasons that indicate a bad/unreachable number or connectivity failure — we blacklist the number.
// See https://docs.vapi.ai/calls/call-ended-reason
const BAD_NUMBER_ENDED_REASONS = new Set([
  // Call start errors (transport, customer, phone number, etc.)
  'call.start.error-get-transport',
  'call.start.error-get-customer',
  'call.start.error-get-org',
  'call.start.error-get-subscription',
  'call.start.error-get-assistant',
  'call.start.error-get-phone-number',
  'call.start.error-get-resources-validation',
  'call.start.error-vapi-number-international',
  'call.start.error-vapi-number-outbound-daily-limit',
  'call-start-error-neither-assistant-nor-server-set',
  // Twilio
  'twilio-failed-to-connect-call',
  'twilio-reported-customer-misdialed',
  // Vonage
  'vonage-failed-to-connect-call',
  'vonage-rejected',
  'vonage-disconnected',
  // SIP / provider connectivity
  'call.in-progress.error-sip-telephony-provider-failed-to-connect-call',
  'phone-call-provider-closed-websocket',
  'phone-call-provider-bypass-enabled-but-no-call-received',
  // Our synthetic: scheduler timed out waiting for webhook (no VAPI end event received)
  'call-failed-timeout',
]);

function normalizePhoneForCompare(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function applyCallEnded(message) {
  const customer = message.customer || message.call?.customer || {};
  const externalId = customer.externalId || message.externalId || '';
  const endedReason = message.endedReason || message.call?.endedReason || '';
  const analysis = message.analysis || {};
  const successEvaluation = analysis.successEvaluation ?? (message.successEvaluation ?? '');
  const artifact = message.artifact || {};
  let transcript = artifact.transcript ?? (message.transcript ?? '');
  const audioUrl =
    artifact.audioUrl ||
    artifact.recordingUrl ||
    message.recordingUrl ||
    (analysis.recording && analysis.recording.url) ||
    '';
  // Put each speaker turn on its own line in the spreadsheet
  transcript = transcript.replace(/\s+AI:\s+/g, '\nAI: ').replace(/\s+User:\s+/g, '\nUser: ').trim();

  if (!externalId) return;
  const parsed = parseExternalId(externalId);
  if (!parsed) return;

  const { dialerId, uploadId, rowIndex } = parsed;
  const customerNumber = normalizePhoneForCompare(customer.number || message.customer?.number);
  const isTestNumber = customerNumber && TEST_PHONE_LAST10.has(customerNumber);
  if (dialerId !== 'test' && !isTestNumber) {
    recordCallEnded(dialerId, endedReason);
  }
  if (!isNaN(rowIndex)) {
    const meta = getUploadMeta(uploadId);
    if (meta?.path) {
      try {
        updateRow(meta.path, rowIndex, {
          status: 'called',
          endedReason,
          successEvaluation,
          transcript,
        });
      } catch (e) {
        console.error('Webhook vapi updateRow:', e);
      }
    }
    
    // If appointment was booked (successEvaluation === 'True'), add to booked.xlsx
    if (successEvaluation && String(successEvaluation).trim().toLowerCase() === 'true') {
      const { readSheet, findHeaders, normalizeRow } = require('../lib/spreadsheet');
      try {
        const { data } = readSheet(meta.path);
        const headers = findHeaders(data);
        const row = normalizeRow(data[rowIndex], headers);
        addBooking({
          firstName: row.firstName || '',
          lastName: row.lastName || '',
          address: row.address || '',
          phone: row.phone || customerNumber || '',
          transcript: transcript || '',
          audioUrl: audioUrl || '',
        });
      } catch (e) {
        console.error('[webhook] Error adding to booked.xlsx:', e.message);
      }
    }
    
    if (customerNumber && BAD_NUMBER_ENDED_REASONS.has(endedReason)) {
      if (addToBlacklist(customerNumber)) {
        console.log('[webhook] Added to blacklist (bad number):', customerNumber, endedReason);
      }
    }
    if (endedReason === 'customer-did-not-answer') {
      scheduler.scheduleDoubleTapRetry(externalId);
    }
  }
  updateState((s) => {
    if (s.pendingCallPhoneNumber) delete s.pendingCallPhoneNumber[externalId];
    if (s.pendingCallStartedAt) delete s.pendingCallStartedAt[externalId];
    return s;
  });
}

router.post('/vapi', (req, res) => {
  const { message } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  if (message.type === 'end-of-call-report') {
    applyCallEnded(message);
  } else if (message.endedReason || message.call?.endedReason) {
    applyCallEnded(message);
  }

  res.status(200).json({ received: true });
});

/**
 * Shared booking logic: calendar event + confirmation email + stats.
 * @param {object} body - { start, end, attendeeEmail, customerName, customerPhone, customerAddress?, recordingUrl?, summary?, description? }
 * @returns {{ success: true, message: string, eventId?: string }}
 */
async function executeBooking(body) {
  const {
    summary,
    description,
    start,
    end,
    attendeeEmail,
    customerName,
    customerPhone,
  } = body || {};
  const customerAddress = body.customerAddress || body.address || '';
  const recordingUrl =
    body.recordingUrl ||
    body.audioUrl ||
    body.callRecordingUrl ||
    (body.analysis && body.analysis.recording && body.analysis.recording.url) ||
    '';

  const startDt = start || body.startDateTime || body.dateTime;
  const endDt = end || body.endDateTime || body.endTime;
  if (!startDt || !endDt) {
    throw new Error('start and end date/time required');
  }

  const calResult = await createEvent({
    summary: summary || 'Appointment',
    description: description || '',
    start: startDt,
    end: endDt,
    attendeeEmail: attendeeEmail || body.attendee,
  });

  const details = {
    summary: summary || 'Appointment',
    start: startDt,
    end: endDt,
    customerName,
    customerPhone,
    customerAddress,
    attendeeEmail,
    recordingUrl,
    calendarEventId: calResult?.id,
  };

  await sendBookingConfirmation(details).catch((e) => console.error('Booking email failed:', e));
  recordBooking();

  return {
    success: true,
    message: 'Appointment booked',
    eventId: calResult?.id,
  };
}

router.post('/booking', async (req, res) => {
  try {
    const result = await executeBooking(req.body);
    res.status(200).json(result);
  } catch (e) {
    console.error('Booking webhook:', e);
    const status = e.message && e.message.includes('required') ? 400 : 500;
    res.status(status).json({ error: e.message || 'Booking failed' });
  }
});

/**
 * VAPI function-tool adapter: receives tool-call payload, extracts arguments,
 * runs booking, returns { results: [ { toolCallId, result } ] }.
 */
router.post('/booking-tool', async (req, res) => {
  const payload = req.body || {};
  const message = payload.message || {};
  const toolCallList = message.toolCallList || message.toolCalls || [];
  const first = toolCallList[0];
  if (!first || !first.id) {
    return res.status(400).json({ error: 'Missing toolCallList[0].id' });
  }
  const toolCallId = first.id;
  const args = first.arguments || first.parameters || {};

  // Map tool params (dashboard may use Summary, CustomerPhone) to our booking body
  const body = {
    start: args.start || '',
    end: args.end || '',
    attendeeEmail: args.attendeeEmail,
    customerName: args.customerName,
    customerPhone: args.CustomerPhone || args.customerPhone || '',
    customerAddress: args.customerAddress || '',
    recordingUrl: args.recordingUrl || '',
    summary: args.Summary || args.summary || 'Home energy efficiency appointment',
    description: args.description || "Booked by the Vapi calling assistant.",
  };

  try {
    const result = await executeBooking(body);
    const resultText = result.eventId
      ? `Appointment booked. Event ID: ${result.eventId}.`
      : result.message;
    return res.status(200).json({
      results: [{ toolCallId, result: resultText }],
    });
  } catch (e) {
    console.error('Booking tool webhook:', e);
    return res.status(200).json({
      results: [{ toolCallId, result: `Booking failed: ${e.message || 'Unknown error'}.` }],
    });
  }
});

router.post('/inbound-lookup', (req, res) => {
  const body = req.body || {};
  const phone = body.phone || body.customer?.number || body.number || '';
  if (!phone) {
    return res.status(400).json({ error: 'phone required' });
  }

  const uploads = listUploads();

  for (const { uploadId } of uploads) {
    const meta = getUploadMeta(uploadId);
    const filePath = meta?.path;
    if (!filePath || !require('fs').existsSync(filePath)) continue;
    const found = findRowByPhone(filePath, phone);
    if (found) {
      return res.status(200).json({
        found: true,
        firstName: found.row.firstName,
        lastName: found.row.lastName,
        address: found.row.address,
        city: found.row.city,
        zip: found.row.zip,
        phone: found.row.phone,
      });
    }
  }

  res.status(200).json({ found: false });
});

module.exports = router;
