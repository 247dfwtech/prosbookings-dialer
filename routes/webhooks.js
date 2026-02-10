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

const TEST_PHONE_LAST10 = new Set(['2146002023', '8178086172', '9156379939']);

const BAD_NUMBER_ENDED_REASONS = new Set([
  'call.start.error-get-transport',
  'call.start.error-get-customer',
  'twilio-failed-to-connect-call',
  'twilio-reported-customer-misdialed',
  'vonage-failed-to-connect-call',
  'vonage-rejected',
  'call.in-progress.error-sip-telephony-provider-failed-to-connect-call',
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

router.post('/booking', async (req, res) => {
  const body = req.body || {};
  const {
    summary,
    description,
    start,
    end,
    attendeeEmail,
    customerName,
    customerPhone,
  } = body;

  try {
    const startDt = start || body.startDateTime || body.dateTime;
    const endDt = end || body.endDateTime || body.endTime;
    if (!startDt || !endDt) {
      return res.status(400).json({ error: 'start and end date/time required' });
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
      attendeeEmail,
      calendarEventId: calResult?.id,
    };

    await sendBookingConfirmation(details).catch((e) => console.error('Booking email failed:', e));
    recordBooking();

    res.status(200).json({
      success: true,
      message: 'Appointment booked',
      eventId: calResult?.id,
    });
  } catch (e) {
    console.error('Booking webhook:', e);
    res.status(500).json({ error: e.message || 'Booking failed' });
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
