const fs = require('fs');
const path = require('path');
const DATA_DIR = process.env.APP_DATA_DIR || path.join(__dirname, '..', 'data');
const META_PATH = path.join(DATA_DIR, 'uploads.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readMeta() {
  ensureDataDir();
  if (!fs.existsSync(META_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(META_PATH, 'utf8')); } catch { return {}; }
}

function writeMeta(obj) {
  ensureDataDir();
  fs.writeFileSync(META_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

function listUploads() {
  return Object.entries(readMeta()).map(([uploadId, m]) => ({
    uploadId,
    originalName: m.originalName || uploadId,
  }));
}

function saveUploadMeta(uploadId, data) {
  const meta = readMeta();
  meta[uploadId] = { ...meta[uploadId], ...data };
  writeMeta(meta);
}

function getUploadMeta(uploadId) {
  return readMeta()[uploadId] || null;
}

function removeUpload(uploadId) {
  const meta = readMeta();
  if (!meta[uploadId]) return false;
  delete meta[uploadId];
  writeMeta(meta);
  return true;
}

/** Parse short externalId (d1:abc12345:0) to { dialerId, uploadId, rowIndex }. VAPI limits externalId to 40 chars. */
function parseExternalId(externalId) {
  if (!externalId || typeof externalId !== 'string') return null;
  const parts = externalId.split(':');
  if (parts.length < 3) return null;
  const [dialerShort, shortUploadId, rowIndexStr] = parts;
  const dialerId = dialerShort === 'd1' ? 'dialer1' : dialerShort === 'd2' ? 'dialer2' : dialerShort === 'd3' ? 'dialer3' : dialerShort;
  const uploads = listUploads();
  const upload = uploads.find((u) => u.uploadId.startsWith(shortUploadId));
  if (!upload) return null;
  const rowIndex = parseInt(rowIndexStr, 10);
  if (isNaN(rowIndex)) return null;
  return { dialerId, uploadId: upload.uploadId, rowIndex };
}

module.exports = { listUploads, saveUploadMeta, getUploadMeta, removeUpload, parseExternalId };
