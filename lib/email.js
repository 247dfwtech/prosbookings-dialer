const fetch = require('node-fetch');
const nodemailer = require('nodemailer');

const FROM_EMAIL = process.env.FROM_EMAIL || process.env.SMTP_FROM || 'noreply@example.com';
const BOOKING_NOTIFY_EMAIL = process.env.BOOKING_NOTIFY_EMAIL || 'asanchezept@yahoo.com';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

function getTransporter() {
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return null;
}

async function sendEmail({ to, subject, text }) {
  const transporter = getTransporter();
  if (transporter) {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to,
      subject,
      text,
    });
    return { ok: true };
  }
  if (RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, text }),
    });
    if (!res.ok) throw new Error(`Resend: ${res.status} ${await res.text()}`);
    return res.json();
  }
  return { ok: false, skipped: true };
}

async function sendBookingConfirmation(details) {
  return sendEmail({
    to: BOOKING_NOTIFY_EMAIL,
    subject: 'New appointment booked',
    text: `A new appointment was booked.\n\n${JSON.stringify(details, null, 2)}`,
  });
}

module.exports = { sendEmail, sendBookingConfirmation };
