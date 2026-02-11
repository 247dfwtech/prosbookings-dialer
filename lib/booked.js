/**
 * Booked appointments tracker: stores appointments in booked.xlsx.
 * Address-based blacklist: if an address is already booked, we skip calling that address again.
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.APP_DATA_DIR || path.join(__dirname, '..', 'data');
const BOOKED_PATH = path.join(DATA_DIR, 'booked.xlsx');

function normalizeAddress(address) {
  return String(address || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function ensureBookedFile() {
  ensureDataDir();
  if (!fs.existsSync(BOOKED_PATH)) {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['First Name', 'Last Name', 'Address', 'Phone', 'Transcript']]);
    XLSX.utils.book_append_sheet(wb, ws, 'Booked');
    XLSX.writeFile(wb, BOOKED_PATH);
  }
}

function readBookedAddresses() {
  ensureBookedFile();
  if (!fs.existsSync(BOOKED_PATH)) return new Set();
  try {
    const wb = XLSX.readFile(BOOKED_PATH);
    const firstSheet = wb.SheetNames[0];
    const ws = wb.Sheets[firstSheet];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const addresses = new Set();
    // Skip header row (index 0), read from row 1
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row && row.length >= 3 && row[2]) {
        addresses.add(normalizeAddress(row[2]));
      }
    }
    return addresses;
  } catch (e) {
    console.error('[booked] Error reading booked.xlsx:', e.message);
    return new Set();
  }
}

function isAddressBooked(address) {
  const normalized = normalizeAddress(address);
  if (!normalized) return false;
  return readBookedAddresses().has(normalized);
}

function addBooking({ firstName, lastName, address, phone, transcript }) {
  ensureBookedFile();
  try {
    const wb = XLSX.readFile(BOOKED_PATH);
    const firstSheet = wb.SheetNames[0];
    const ws = wb.Sheets[firstSheet];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    
    // Check if this address is already in the file
    const normalizedAddr = normalizeAddress(address);
    for (let i = 1; i < data.length; i++) {
      if (data[i] && data[i].length >= 3 && normalizeAddress(data[i][2]) === normalizedAddr) {
        console.log('[booked] Address already exists in booked.xlsx:', normalizedAddr);
        return false;
      }
    }
    
    // Add new row: First Name, Last Name, Address, Phone, Transcript
    const newRow = [
      String(firstName || '').trim(),
      String(lastName || '').trim(),
      String(address || '').trim(),
      String(phone || '').trim(),
      String(transcript || '').trim(),
    ];
    data.push(newRow);
    
    const newWs = XLSX.utils.aoa_to_sheet(data);
    wb.Sheets[firstSheet] = newWs;
    XLSX.writeFile(wb, BOOKED_PATH);
    console.log('[booked] Added booking to booked.xlsx:', normalizedAddr);
    return true;
  } catch (e) {
    console.error('[booked] Error adding to booked.xlsx:', e.message);
    return false;
  }
}

module.exports = { isAddressBooked, addBooking, normalizeAddress };
