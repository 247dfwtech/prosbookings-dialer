#!/usr/bin/env node
/**
 * Creates the Book_FF_pros Function Tool in your VAPI account via the API.
 * The tool calls our /api/webhook/booking-tool endpoint (VAPI function-tool format).
 * Run from project root with your VAPI API key set:
 *   VAPI_API_KEY=your_key node scripts/create-book-ff-pros-tool.js
 * Or copy .env from Railway and run: node scripts/create-book-ff-pros-tool.js
 */
require('dotenv').config();

const VAPI_API_KEY = process.env.VAPI_API_KEY;
if (!VAPI_API_KEY) {
  console.error('Set VAPI_API_KEY (e.g. export VAPI_API_KEY=your_key)');
  process.exit(1);
}

const BOOKING_TOOL_URL = 'https://prosbookings-dialer-production.up.railway.app/api/webhook/booking-tool';

const TOOL = {
  type: 'function',
  function: {
    name: 'Book_FF_pros',
    description: "Books an appointment via Adrian's COLD Calling Beast app and sends an Outlook email notification. Call this when the customer has confirmed a date/time and you have their name, phone, and address.",
    parameters: {
      type: 'object',
      properties: {
        start: {
          type: 'string',
          description: 'ISO 8601 start datetime of the appointment (e.g. 2026-02-12T15:00:00-06:00)',
        },
        end: {
          type: 'string',
          description: 'ISO 8601 end datetime of the appointment',
        },
        attendeeEmail: {
          type: 'string',
          description: 'Email of the agent who will attend the appointment',
        },
        customerName: {
          type: 'string',
          description: 'Full name of the customer',
        },
        customerPhone: {
          type: 'string',
          description: 'Customer phone number',
        },
        customerAddress: {
          type: 'string',
          description: 'Full service address (street, city, state, ZIP)',
        },
        recordingUrl: {
          type: 'string',
          description: 'Direct URL to the audio recording of this call from VAPI',
        },
      },
      required: ['start', 'end', 'attendeeEmail', 'customerName', 'customerPhone'],
    },
  },
  server: {
    url: BOOKING_TOOL_URL,
  },
};

async function main() {
  const res = await fetch('https://api.vapi.ai/tool', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(TOOL),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    console.error('VAPI API error:', res.status, data);
    process.exit(1);
  }

  console.log('Book_FF_pros tool created successfully.');
  console.log('Tool ID:', data.id || data._id || '(check dashboard)');
  console.log('Add this tool to your assistant in the VAPI dashboard.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
