/**
 * CST (Central Standard Time) helpers for dialer run window.
 * All times are in America/Chicago (CST/CDT).
 */

function nowCST() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
}

function todayCSTDateString() {
  const d = nowCST();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse "HH:MM" or "HH:MM:SS" to minutes since midnight (CST).
 */
function parseTimeToMinutes(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.trim().split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1] ? parseInt(parts[1], 10) : 0;
  if (isNaN(h)) return null;
  return h * 60 + m;
}

/**
 * Is current time (CST) within [startTime, endTime]?
 * startTime/endTime are "HH:MM" or "" (empty = no limit).
 */
function isWithinRunWindow(startTime, endTime) {
  const startMin = parseTimeToMinutes(startTime);
  const endMin = parseTimeToMinutes(endTime);
  if (startMin == null && endMin == null) return true;
  const d = nowCST();
  const currentMin = d.getHours() * 60 + d.getMinutes();
  if (startMin != null && currentMin < startMin) return false;
  if (endMin != null && currentMin >= endMin) return false;
  return true;
}

/**
 * Is today (CST) in the allowed days of week?
 * daysOfWeek is an array of day numbers: [0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat]
 * If empty or null, allow all days.
 */
function isAllowedDay(daysOfWeek) {
  if (!daysOfWeek || !Array.isArray(daysOfWeek) || daysOfWeek.length === 0) return true;
  const d = nowCST();
  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return daysOfWeek.includes(dayOfWeek);
}

module.exports = { nowCST, todayCSTDateString, isWithinRunWindow, isAllowedDay, parseTimeToMinutes };
