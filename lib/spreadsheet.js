const XLSX = require('xlsx');
const fs = require('fs');

function readSheet(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const firstSheet = wb.SheetNames[0];
  const ws = wb.Sheets[firstSheet];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  return { data, sheetName: firstSheet, wb };
}

function findHeaders(data) {
  return (data[0] || []).map((c) => String(c ?? '').trim());
}

/** Expected upload format: first name, last name, address, city, zip code, phone, email, email2, Status.
 *  After calls we append: ended reason, success evaluation, transcript (after Status).
 *  City is used as-is. Email and email2 are not used by the app (columns may exist but are ignored).
 *  Status is set to "called" after each call. */
function normalizeRow(row, headers) {
  const get = (name) => {
    const i = headers.findIndex((h) => String(h).trim().toLowerCase() === name.toLowerCase());
    return i >= 0 ? String(row[i] ?? '').trim() : '';
  };
  return {
    firstName: get('First Name') || get('first name'),
    lastName: get('Last Name') || get('last name'),
    address: get('Address') || get('address'),
    city: get('City') || get('city'),
    zip: get('Zip Code') || get('Zip') || get('zip code') || get('zip'),
    phone: get('Phone') || get('phone'),
    email: get('Email') || get('email'),
    email2: get('Email2') || get('email2') || get('email 2'),
    status: get('Status') || get('status'),
    endedReason: get('Ended Reason') || get('ended reason'),
    successEvaluation: get('Success Evaluation') || get('success evaluation'),
    transcript: get('Transcript') || get('transcript'),
  };
}

function getNextNotCalledRow(filePath) {
  const { data } = readSheet(filePath);
  const headers = findHeaders(data);
  for (let i = 1; i < data.length; i++) {
    const row = normalizeRow(data[i], headers);
    if (row.status.toLowerCase() === 'not-called' && row.phone) {
      return { rowIndex: i, row, headers, data };
    }
  }
  return null;
}

function updateRow(filePath, rowIndex, updates) {
  const { data, sheetName, wb } = readSheet(filePath);
  const headers = findHeaders(data);
  const row = data[rowIndex];
  if (!row) return;

  const idx = (name) => headers.findIndex((h) => String(h).trim().toLowerCase() === name.toLowerCase());
  const ensureCol = (name) => {
    let i = idx(name);
    if (i >= 0) return i;
    headers.push(name);
    if (data[0]) { while (data[0].length < headers.length) data[0].push(''); data[0][headers.length - 1] = name; }
    return headers.length - 1;
  };

  const sIdx = ensureCol('Status');
  const eIdx = ensureCol('ended reason');
  const vIdx = ensureCol('success evaluation');
  const tIdx = ensureCol('transcript');
  while (row.length <= Math.max(sIdx, eIdx, vIdx, tIdx)) row.push('');
  if (updates.status !== undefined) row[sIdx] = updates.status;
  if (updates.endedReason !== undefined) row[eIdx] = updates.endedReason;
  if (updates.successEvaluation !== undefined) row[vIdx] = updates.successEvaluation;
  if (updates.transcript !== undefined) row[tIdx] = updates.transcript;

  const ws = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let c = 0; c < row.length; c++) ws[XLSX.utils.encode_cell({ r: rowIndex, c })] = { t: 's', v: String(row[c]) };
  if (data[0]) for (let c = 0; c < data[0].length; c++) ws[XLSX.utils.encode_cell({ r: 0, c })] = { t: 's', v: String(data[0][c]) };
  range.e.c = Math.max(range.e.c, row.length - 1, (data[0] || []).length - 1);
  range.e.r = Math.max(range.e.r, rowIndex);
  ws['!ref'] = XLSX.utils.encode_range(range);
  XLSX.writeFile(wb, filePath);
}

function findRowByPhone(filePath, phone) {
  const normalized = String(phone).replace(/\D/g, '').slice(-10);
  if (!normalized) return null;
  const { data } = readSheet(filePath);
  const headers = findHeaders(data);
  for (let i = 1; i < data.length; i++) {
    const row = normalizeRow(data[i], headers);
    if (String(row.phone).replace(/\D/g, '').slice(-10) === normalized) return { rowIndex: i, row };
  }
  return null;
}

module.exports = { readSheet, getNextNotCalledRow, updateRow, findRowByPhone, findHeaders, normalizeRow };
