const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { listUploads, saveUploadMeta, getUploadMeta, removeUpload } = require('../lib/upload-store');
const { getConfig, updateConfig } = require('../lib/store');
const { readSheet, findHeaders, normalizeRow } = require('../lib/spreadsheet');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_SIZE = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${uuidv4()}.xlsx`),
  }),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    cb(null, /\.(xlsx|xls)$/i.test(file.originalname));
  },
});

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file or invalid type (use .xls or .xlsx)' });
  const uploadId = path.basename(req.file.filename, path.extname(req.file.filename));
  saveUploadMeta(uploadId, { originalName: req.file.originalname || 'spreadsheet.xlsx', path: req.file.path });
  res.json({ uploadId, originalName: req.file.originalname || 'spreadsheet.xlsx' });
});

router.get('/list', (req, res) => res.json(listUploads()));
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

module.exports = router;
