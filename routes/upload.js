const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { listUploads, saveUploadMeta, getUploadMeta, removeUpload } = require('../lib/upload-store');
const { getConfig, updateConfig } = require('../lib/store');
const { readSheet, findHeaders, normalizeRow, findRowByPhone } = require('../lib/spreadsheet');
const { addToBlacklist } = require('../lib/blacklist');
const { addBooking } = require('../lib/booked');

const UPLOAD_DIR = process.env.APP_UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const MAX_SIZE = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${uuidv4()}.xlsx`),
  }),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').trim();
    const ok = /\.(xlsx|xls)$/i.test(name);
    if (!ok) return cb(new Error('Use .xls or .xlsx only'), false);
    cb(null, true);
  },
});

router.post('/', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large (max 10MB)' });
      console.error('Upload multer error:', err);
      return res.status(500).json({ error: err.message || 'Upload failed' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file or invalid type (use .xls or .xlsx)' });
    try {
      const uploadId = path.basename(req.file.filename, path.extname(req.file.filename));
      saveUploadMeta(uploadId, { originalName: req.file.originalname || 'spreadsheet.xlsx', path: req.file.path });
      res.json({ uploadId, originalName: req.file.originalname || 'spreadsheet.xlsx' });
    } catch (e) {
      console.error('Upload save error:', e);
      res.status(500).json({ error: e.message || 'Upload failed' });
    }
  });
});

router.get('/list', (req, res) => res.json(listUploads()));

router.get('/phone-lookup', (req, res) => {
  const phone = req.query.phone;
  if (!phone || String(phone).replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Enter at least 10 digits' });
  }
  const uploads = listUploads();
  const matches = [];
  for (const { uploadId, originalName } of uploads) {
    const meta = getUploadMeta(uploadId);
    if (!meta?.path || !fs.existsSync(meta.path)) continue;
    try {
      const found = findRowByPhone(meta.path, phone);
      if (found) {
        matches.push({
          firstName: found.row.firstName,
          lastName: found.row.lastName,
          address: found.row.address,
          city: found.row.city,
          zip: found.row.zip,
          spreadsheetName: meta.originalName || originalName || uploadId,
          uploadId,
        });
      }
    } catch (e) {
      console.error('phone-lookup', uploadId, e.message);
    }
  }
  res.json({ matches });
});

router.get('/:uploadId/meta', (req, res) => {
  const meta = getUploadMeta(req.params.uploadId);
  if (!meta) return res.status(404).json({ error: 'Not found' });
  res.json(meta);
});

router.get('/:uploadId/data', (req, res) => {
  const meta = getUploadMeta(req.params.uploadId);
  if (!meta?.path) return res.status(404).json({ error: 'Not found' });
  try {
    const { data } = readSheet(meta.path);
    const headers = findHeaders(data);
    const rows = [];
    for (let i = 1; i < data.length; i++) {
      rows.push(normalizeRow(data[i], headers));
    }
    res.json({ headers, rows, originalName: meta.originalName || req.params.uploadId });
  } catch (e) {
    console.error('upload data', e);
    res.status(500).json({ error: e.message || 'Failed to read spreadsheet' });
  }
});

router.get('/:uploadId/download', (req, res) => {
  const meta = getUploadMeta(req.params.uploadId);
  if (!meta?.path) return res.status(404).send('Not found');
  const filename = meta.originalName || `${req.params.uploadId}.xlsx`;
  res.download(meta.path, filename);
});

const replaceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    cb(null, /\.(xlsx|xls)$/i.test(file.originalname));
  },
});

router.put('/:uploadId/replace', replaceUpload.single('file'), (req, res) => {
  const { uploadId } = req.params;
  const meta = getUploadMeta(uploadId);
  if (!meta?.path) return res.status(404).json({ error: 'Not found' });
  if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'No file or invalid type (use .xls or .xlsx)' });
  try {
    fs.writeFileSync(meta.path, req.file.buffer);
    saveUploadMeta(uploadId, { originalName: req.file.originalname || meta.originalName || 'spreadsheet.xlsx' });
    res.json({ uploadId, originalName: req.file.originalname || meta.originalName });
  } catch (e) {
    console.error('upload replace', e);
    res.status(500).json({ error: e.message || 'Failed to replace file' });
  }
});

router.delete('/:uploadId', (req, res) => {
  const { uploadId } = req.params;
  const meta = getUploadMeta(uploadId);
  if (!meta) return res.status(404).json({ error: 'Not found' });
  try {
    if (meta.path && fs.existsSync(meta.path)) fs.unlinkSync(meta.path);
    removeUpload(uploadId);
    updateConfig((c) => {
      for (const dialerId of Object.keys(c.dialers || {})) {
        if (c.dialers[dialerId].spreadsheetId === uploadId) c.dialers[dialerId].spreadsheetId = '';
      }
      return c;
    });
    res.json({ ok: true, message: 'Deleted' });
  } catch (e) {
    console.error('upload delete', e);
    res.status(500).json({ error: e.message || 'Failed to delete' });
  }
});

// Bad number ended reasons (same as webhooks.js)
const BAD_NUMBER_ENDED_REASONS = new Set([
  'call.start.error-get-transport',
  'call.start.error-get-customer',
  'call.start.error-get-org',
  'call.start.error-get-subscription',
  'call.start.error-get-assistant',
  'call.start.error-get-phone-number',
  'call.start.error-get-resources-validation',
  'call.start.error-vapi-number-international',
  'call.start.error-vapi-number-outbound-daily-limit',
  'call-start-error-neither-assistant-nor-server-set',
  'twilio-failed-to-connect-call',
  'twilio-reported-customer-misdialed',
  'vonage-failed-to-connect-call',
  'vonage-rejected',
  'vonage-disconnected',
  'call.in-progress.error-sip-telephony-provider-failed-to-connect-call',
  'phone-call-provider-closed-websocket',
  'phone-call-provider-bypass-enabled-but-no-call-received',
  'call-failed-timeout',
]);

router.post('/update-blacklists', (req, res) => {
  try {
    const uploads = listUploads();
    const excludeNames = ['blacklist.txt', 'booked.xlsx'];
    let blacklistedCount = 0;
    let bookedCount = 0;
    let processedCount = 0;
    let errorCount = 0;

    for (const { uploadId, originalName } of uploads) {
      // Skip blacklist.txt and booked.xlsx if they somehow got uploaded
      if (excludeNames.some(name => originalName.toLowerCase().includes(name.toLowerCase()))) {
        continue;
      }

      const meta = getUploadMeta(uploadId);
      if (!meta?.path || !fs.existsSync(meta.path)) {
        console.log(`[update-blacklists] Skipping ${uploadId}: file not found`);
        continue;
      }

      try {
        const { data } = readSheet(meta.path);
        const headers = findHeaders(data);
        processedCount++;

        for (let i = 1; i < data.length; i++) {
          const row = normalizeRow(data[i], headers);
          
          // Check for bad number ended reasons → add to blacklist
          if (row.endedReason && BAD_NUMBER_ENDED_REASONS.has(row.endedReason)) {
            if (row.phone && addToBlacklist(row.phone)) {
              blacklistedCount++;
            }
          }

          // Check for booked appointments → add to booked.xlsx
          if (row.successEvaluation && String(row.successEvaluation).trim().toLowerCase() === 'true') {
            if (addBooking({
              firstName: row.firstName || '',
              lastName: row.lastName || '',
              address: row.address || '',
              phone: row.phone || '',
              transcript: row.transcript || '',
            })) {
              bookedCount++;
            }
          }
        }
      } catch (e) {
        console.error(`[update-blacklists] Error processing ${uploadId}:`, e.message);
        errorCount++;
      }
    }

    res.json({
      ok: true,
      processed: processedCount,
      blacklisted: blacklistedCount,
      booked: bookedCount,
      errors: errorCount,
      message: `Processed ${processedCount} spreadsheet(s). Added ${blacklistedCount} phone(s) to blacklist, ${bookedCount} booking(s) to booked.xlsx.`,
    });
  } catch (e) {
    console.error('[update-blacklists] Error:', e);
    res.status(500).json({ error: e.message || 'Failed to update blacklists' });
  }
});

router.get('/download-all', (req, res) => {
  try {
    const uploads = listUploads();
    if (uploads.length === 0) {
      return res.status(404).json({ error: 'No spreadsheets to download' });
    }

    // If only one file, download it directly
    if (uploads.length === 1) {
      const { uploadId } = uploads[0];
      const meta = getUploadMeta(uploadId);
      if (!meta?.path || !fs.existsSync(meta.path)) {
        return res.status(404).json({ error: 'File not found' });
      }
      const filename = meta.originalName || `${uploadId}.xlsx`;
      return res.download(meta.path, filename);
    }

    // Multiple files: create zip
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // Format: 2026-02-08T14-30-22
    const filename = `all-spreadsheets-${dateStr}.zip`;
    const archive = archiver('zip', { zlib: { level: 9 } });
    res.attachment(filename);
    archive.pipe(res);

    let addedCount = 0;
    for (const { uploadId } of uploads) {
      const meta = getUploadMeta(uploadId);
      if (!meta?.path || !fs.existsSync(meta.path)) {
        console.log(`[download-all] Skipping ${uploadId}: file not found`);
        continue;
      }
      const filename = meta.originalName || `${uploadId}.xlsx`;
      archive.file(meta.path, { name: filename });
      addedCount++;
    }

    if (addedCount === 0) {
      archive.abort();
      return res.status(404).json({ error: 'No files found to download' });
    }

    archive.finalize();
  } catch (e) {
    console.error('[download-all] Error:', e);
    res.status(500).json({ error: e.message || 'Failed to create download' });
  }
});

module.exports = router;
