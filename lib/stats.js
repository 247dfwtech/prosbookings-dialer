/**
 * Record daily stats (CST): call ended answered/not answered, appointment booked.
 */

const { updateState, getState } = require('./store');

function recordCallEnded(dialerId, endedReason) {
  if (!dialerId || !['dialer1', 'dialer2', 'dialer3'].includes(dialerId)) return;
  updateState((s) => {
    if (!s.dialers[dialerId]) return s;
    if (endedReason === 'customer-did-not-answer') {
      s.dialers[dialerId].callsNotAnsweredToday = (s.dialers[dialerId].callsNotAnsweredToday || 0) + 1;
    } else {
      s.dialers[dialerId].callsAnsweredToday = (s.dialers[dialerId].callsAnsweredToday || 0) + 1;
    }
    return s;
  });
}

function recordBooking() {
  updateState((s) => {
    s.appointmentsBookedToday = (s.appointmentsBookedToday || 0) + 1;
    return s;
  });
}

module.exports = { recordCallEnded, recordBooking };
