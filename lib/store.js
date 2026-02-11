/**
 * Simple file-based store for dialer config and state.
 * config.json: per-dialer settings, selected spreadsheet id per dialer.
 * state.json: running/stopped, round-robin index, call counters, daily stats (CST).
 */

const fs = require('fs');
const path = require('path');
const { todayCSTDateString } = require('./cst');

const DATA_DIR = process.env.APP_DATA_DIR || path.join(__dirname, '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const STATE_PATH = path.join(DATA_DIR, 'state.json');

const dialerDefaults = () => ({
  assistantId: '',
  phoneNumberIds: [],
  callEverySeconds: 30,
  doubleTap: false,
  voicemailN: 0,
  voicemailM: 1,
  voicemailMessage: '',
  spreadsheetId: '',
  startTime: '',
  endTime: '',
  targetZip: '',
  daysOfWeek: [1, 2, 3, 4, 5], // Default: Mon-Fri (0=Sun, 1=Mon, ..., 6=Sat)
});

const DEFAULT_CONFIG = {
  dialers: {
    dialer1: dialerDefaults(),
    dialer2: dialerDefaults(),
    dialer3: dialerDefaults(),
  },
};

const DEFAULT_STATE = {
  dialers: {
    dialer1: { running: false, paused: false, roundRobinIndex: 0, callCount: 0, callsPlacedToday: 0, callsAnsweredToday: 0, callsNotAnsweredToday: 0 },
    dialer2: { running: false, paused: false, roundRobinIndex: 0, callCount: 0, callsPlacedToday: 0, callsAnsweredToday: 0, callsNotAnsweredToday: 0 },
    dialer3: { running: false, paused: false, roundRobinIndex: 0, callCount: 0, callsPlacedToday: 0, callsAnsweredToday: 0, callsNotAnsweredToday: 0 },
  },
  doubleTapRetry: {},
  pendingCallPhoneNumber: {},
  pendingCallStartedAt: {},
  dailyStatsDate: '',
  appointmentsBookedToday: 0,
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJson(filePath, defaultValue) {
  ensureDataDir();
  if (!fs.existsSync(filePath)) return defaultValue;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return defaultValue;
  }
}

function writeJson(filePath, data) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getConfig() {
  const config = readJson(CONFIG_PATH, DEFAULT_CONFIG);
  for (const id of ['dialer1', 'dialer2', 'dialer3']) {
    if (config.dialers[id]) {
      config.dialers[id].startTime = config.dialers[id].startTime ?? '';
      config.dialers[id].endTime = config.dialers[id].endTime ?? '';
      config.dialers[id].daysOfWeek = config.dialers[id].daysOfWeek || [1, 2, 3, 4, 5]; // Default Mon-Fri
    }
  }
  return config;
}

function setConfig(config) {
  writeJson(CONFIG_PATH, config);
  return config;
}

function getState() {
  let state = readJson(STATE_PATH, DEFAULT_STATE);
  const today = todayCSTDateString();
  state.dailyStatsDate = state.dailyStatsDate || '';
  state.appointmentsBookedToday = state.appointmentsBookedToday ?? 0;
  state.dialers = state.dialers || {};
  for (const id of ['dialer1', 'dialer2', 'dialer3']) {
    if (!state.dialers[id]) state.dialers[id] = {};
    const d = state.dialers[id];
    d.paused = d.paused ?? false;
    d.callsPlacedToday = d.callsPlacedToday ?? 0;
    d.callsAnsweredToday = d.callsAnsweredToday ?? 0;
    d.callsNotAnsweredToday = d.callsNotAnsweredToday ?? 0;
  }
  if (state.dailyStatsDate !== today) {
    const next = { ...state, dailyStatsDate: today, appointmentsBookedToday: 0 };
    next.dialers = {};
    for (const [id, d] of Object.entries(state.dialers)) {
      next.dialers[id] = { ...d, callsPlacedToday: 0, callsAnsweredToday: 0, callsNotAnsweredToday: 0 };
    }
    setState(next);
    return next;
  }
  return state;
}

function setState(state) {
  writeJson(STATE_PATH, state);
  return state;
}

function updateConfig(updater) {
  const config = getConfig();
  const next = typeof updater === 'function' ? updater(config) : { ...config, ...updater };
  setConfig(next);
  return next;
}

function updateState(updater) {
  const state = getState();
  const next = typeof updater === 'function' ? updater(state) : { ...state, ...updater };
  setState(next);
  return next;
}

module.exports = {
  getConfig,
  setConfig,
  updateConfig,
  getState,
  setState,
  updateState,
  DEFAULT_CONFIG,
  DEFAULT_STATE,
};
