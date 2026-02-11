/**
 * Phone blacklist: bad/disconnected numbers we never call again.
 * Stored in data/blacklist.txt (one number per line, last 10 digits).
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.APP_DATA_DIR || path.join(__dirname, '..', 'data');
const BLACKLIST_PATH = path.join(DATA_DIR, 'blacklist.txt');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function readBlacklistSet() {
  ensureDataDir();
  if (!fs.existsSync(BLACKLIST_PATH)) return new Set();
  const content = fs.readFileSync(BLACKLIST_PATH, 'utf8');
  const set = new Set();
  content.split(/\r?\n/).forEach((line) => {
    const n = line.trim();
    if (n.length >= 10) set.add(normalizePhone(n));
  });
  return set;
}

function isBlacklisted(phone) {
  const n = normalizePhone(phone);
  if (!n || n.length < 10) return false;
  return readBlacklistSet().has(n);
}

function addToBlacklist(phone) {
  const n = normalizePhone(phone);
  if (!n || n.length < 10) return false;
  const set = readBlacklistSet();
  if (set.has(n)) return false;
  ensureDataDir();
  fs.appendFileSync(BLACKLIST_PATH, n + '\n', 'utf8');
  return true;
}

function clearBlacklist() {
  ensureDataDir();
  fs.writeFileSync(BLACKLIST_PATH, '', 'utf8');
}

module.exports = { isBlacklisted, addToBlacklist, clearBlacklist, normalizePhone };
