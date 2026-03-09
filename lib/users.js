/**
 * User management: admin + subuser accounts backed by data/users.json.
 */

const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

function getUsersPath() {
  const DATA_DIR = process.env.APP_DATA_DIR || path.join(__dirname, '..', 'data');
  return path.join(DATA_DIR, 'users.json');
}

function readUsers() {
  const p = getUsersPath();
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}

function writeUsers(users) {
  const p = getUsersPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(users, null, 2), 'utf8');
}

/** Seed admin + Zeke on first run if users.json doesn't exist yet. */
function seedUsers() {
  const p = getUsersPath();
  if (fs.existsSync(p)) {
    // Backfill embedToken for any subuser missing it
    const users = readUsers();
    let changed = false;
    for (const u of users) {
      if (u.role === 'subuser' && !u.embedToken) {
        u.embedToken = uuidv4();
        changed = true;
      }
    }
    if (changed) writeUsers(users);
    return;
  }
  const adminHash = bcrypt.hashSync('Caleb$771', 10);
  const zekeHash = bcrypt.hashSync('Zeke', 10);
  writeUsers([
    { username: 'admin', passwordHash: adminHash, role: 'admin' },
    { username: 'Zeke', passwordHash: zekeHash, role: 'subuser', dialerId: 'dialer4', embedToken: uuidv4() },
  ]);
  console.log('[users] Seeded admin + Zeke in users.json');
}

function findUser(username) {
  return readUsers().find((u) => u.username.toLowerCase() === username.toLowerCase()) || null;
}

/** Returns user object (without hash) on success, null on failure. */
function validateUser(username, password) {
  const user = findUser(username);
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.passwordHash)) return null;
  return { username: user.username, role: user.role, dialerId: user.dialerId || null };
}

function listSubusers() {
  return readUsers()
    .filter((u) => u.role === 'subuser')
    .map(({ username, dialerId, embedToken }) => ({ username, dialerId, embedToken }));
}

/** Find a subuser by their embedToken. Returns full user object or null. */
function findUserByEmbedToken(token) {
  if (!token) return null;
  return readUsers().find((u) => u.role === 'subuser' && u.embedToken === token) || null;
}

function nextDialerId(users) {
  const existing = users.filter((u) => u.role === 'subuser').map((u) => u.dialerId).filter(Boolean);
  for (let i = 4; i <= 99; i++) {
    const id = `dialer${i}`;
    if (!existing.includes(id)) return id;
  }
  throw new Error('Too many subusers');
}

/**
 * Create a new subuser. Returns { username, role, dialerId }.
 * Throws if username already exists.
 */
function createSubuser(username, password) {
  const users = readUsers();
  if (users.find((u) => u.username.toLowerCase() === username.toLowerCase())) {
    throw new Error('Username already exists');
  }
  const dialerId = nextDialerId(users);
  const passwordHash = bcrypt.hashSync(password, 10);
  const embedToken = uuidv4();
  users.push({ username, passwordHash, role: 'subuser', dialerId, embedToken });
  writeUsers(users);
  console.log(`[users] Created subuser ${username} → ${dialerId}`);
  return { username, role: 'subuser', dialerId, embedToken };
}

/**
 * Delete a subuser by username. Returns the removed user object.
 * Throws if not found or if trying to delete admin.
 */
function deleteSubuser(username) {
  const users = readUsers();
  const idx = users.findIndex(
    (u) => u.username.toLowerCase() === username.toLowerCase() && u.role === 'subuser'
  );
  if (idx === -1) throw new Error('Subuser not found');
  const [removed] = users.splice(idx, 1);
  writeUsers(users);
  console.log(`[users] Deleted subuser ${removed.username} (${removed.dialerId})`);
  return { username: removed.username, dialerId: removed.dialerId };
}

module.exports = {
  seedUsers,
  findUser,
  validateUser,
  listSubusers,
  createSubuser,
  deleteSubuser,
  findUserByEmbedToken,
};
