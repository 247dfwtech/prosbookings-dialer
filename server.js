require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');

function validateEnv() {
  const missing = [];
  if (!process.env.SITE_PASSWORD_HASH) missing.push('SITE_PASSWORD_HASH');
  if (!process.env.VAPI_API_KEY) missing.push('VAPI_API_KEY');
  if (missing.length) {
    console.error('Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'change-me')) {
    console.warn('WARNING: In production, set SESSION_SECRET in Railway Variables to a long random string (e.g. openssl rand -hex 32)');
  }
}
validateEnv();

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const authRouter = require('./routes/auth');
const dialerRouter = require('./routes/dialer');
const uploadRouter = require('./routes/upload');
const webhooksRouter = require('./routes/webhooks');
const { requireAuth } = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

const FileStore = require('session-file-store')(session);
const sessionDir = path.join(DATA_DIR, 'sessions');
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 },
    store: new FileStore({ path: sessionDir }),
  })
);

app.use('/api/auth', authRouter);
app.use('/api/webhook', webhooksRouter);
app.use('/api/dialer', requireAuth, dialerRouter);
app.use('/api/upload', requireAuth, uploadRouter);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const { getState } = require('./lib/store');
const scheduler = require('./lib/scheduler');

const server = app.listen(PORT, () => {
  console.log(`Prosbookings Dialer at http://localhost:${PORT} (VAPI_API_KEY set: ${!!process.env.VAPI_API_KEY})`);
  const state = getState();
  for (const id of ['dialer1', 'dialer2', 'dialer3']) {
    if (state.dialers[id]?.running) {
      console.log(`[startup] Restoring running dialer ${id}`);
      scheduler.startDialer(id);
    }
  }
});

function shutdown(signal) {
  console.log(`[${signal}] Shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced exit after 30s');
    process.exit(1);
  }, 30000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
