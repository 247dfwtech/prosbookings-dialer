const fetch = require('node-fetch');
const BASE = 'https://api.vapi.ai';

function headers() {
  const key = process.env.VAPI_API_KEY;
  if (!key) throw new Error('VAPI_API_KEY not set');
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function listAssistants() {
  const res = await fetch(`${BASE}/assistant?limit=100`, { headers: headers() });
  if (!res.ok) throw new Error(`VAPI assistants: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.data || [];
}

async function listPhoneNumbers() {
  const res = await fetch(`${BASE}/phone-number?limit=100`, { headers: headers() });
  if (!res.ok) throw new Error(`VAPI phone numbers: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.data || [];
}

async function createCall(opts) {
  const customerNumber = String(opts.customerNumber || '').replace(/\D/g, '');
  const e164 = customerNumber.length === 10 ? `+1${customerNumber}` : customerNumber.startsWith('+') ? customerNumber : `+${customerNumber}`;

  const rawExternalId = opts.externalId || undefined;
  const externalId = rawExternalId && rawExternalId.length > 40 ? rawExternalId.slice(0, 40) : rawExternalId;
  if (rawExternalId && rawExternalId.length > 40) {
    console.warn('externalId truncated to 40 chars for VAPI:', rawExternalId, '->', externalId);
  }

  const body = {
    assistantId: opts.assistantId,
    phoneNumberId: opts.phoneNumberId,
    customer: {
      number: e164,
      name: opts.customerName || '',
      externalId: externalId,
    },
    assistantOverrides: {
      variableValues: {
        firstName: opts.variableValues?.firstName ?? '',
        lastName: opts.variableValues?.lastName ?? '',
        address: opts.variableValues?.address ?? '',
        city: opts.variableValues?.city ?? '',
        zip: opts.variableValues?.zip ?? '',
      },
    },
  };
  if (opts.voicemailMessage) {
    body.assistantOverrides.voicemailMessage = opts.voicemailMessage;
    body.assistantOverrides.voicemailDetection = { provider: 'vapi' };
  }

  const res = await fetch(`${BASE}/call`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`VAPI createCall: ${res.status} ${await res.text()}`);
  return res.json();
}

module.exports = { listAssistants, listPhoneNumbers, createCall };
