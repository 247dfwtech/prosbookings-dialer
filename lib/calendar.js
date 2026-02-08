const fs = require('fs');
let calendar = null;

function getCredentials() {
  const json = process.env.GOOGLE_CALENDAR_CREDENTIALS_JSON;
  if (json && json.trim()) {
    try {
      return JSON.parse(json);
    } catch (_) {}
  }
  const credPath = process.env.GOOGLE_CALENDAR_CREDENTIALS_PATH;
  if (credPath && fs.existsSync(credPath)) {
    try {
      return JSON.parse(fs.readFileSync(credPath, 'utf8'));
    } catch (_) {}
  }
  return null;
}

function getClient() {
  if (calendar) return Promise.resolve(calendar);
  const cred = getCredentials();
  if (!cred) return Promise.resolve(null);
  try {
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials: cred,
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    });
    calendar = google.calendar({ version: 'v3', auth });
    return Promise.resolve(calendar);
  } catch (e) {
    return Promise.resolve(null);
  }
}

async function createEvent({ summary, description, start, end, attendeeEmail }) {
  const cal = await getClient();
  if (!cal) return { skipped: true };
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  const event = {
    summary: summary || 'Appointment',
    description: description || '',
    start: { dateTime: start, timeZone: 'America/Chicago' },
    end: { dateTime: end, timeZone: 'America/Chicago' },
    attendees: attendeeEmail ? [{ email: attendeeEmail }] : [],
  };
  const res = await cal.events.insert({ calendarId, requestBody: event });
  return res.data;
}

module.exports = { createEvent, getClient };
