# Claude Handoff — Prosbookings Dialer

**Date:** 2026-03-09
**Worktree:** `/Users/adrian/Desktop/dialer copy/.claude/worktrees/inspiring-mcclintock`
**Branch:** `claude/inspiring-mcclintock` (merged to `main` and deployed)
**GitHub:** https://github.com/247dfwtech/prosbookings-dialer.git
**Deploy:** Railway — auto-deploys on push to `main`

---

## What Was Built (This Session)

### 1. Multi-User System (Admin + Subusers)
Full username/password login replacing the old single-password system.

- **Admin** (`admin` / `Caleb$771`): sees all 3 original dialers + Subuser Management section
- **Subusers** (e.g. `Zeke` / `Zeke`): see a compact single-dialer view with only Start/Stop/Pause and phone lookup
- Subuser dialer settings configured exclusively by admin via "Subuser Settings" toggle in admin dashboard
- Blacklist is universal — shared across all accounts
- Spreadsheet logging/updates work identically for subuser dialers

### 2. Dynamic Dialer Support (dialer4+)
- Subusers auto-assigned `dialer4`, `dialer5`, etc.
- All hardcoded `['dialer1','dialer2','dialer3']` arrays replaced with dynamic `Object.keys(config.dialers)`
- `buildExternalId` / `pendingPrefix` use `dialerId.replace('dialer', 'd')` — works for any dialerId

### 3. Shared Spreadsheet Race Condition Fix
- Row marked as `calling` **immediately** before `createCall()` — prevents multiple dialers from grabbing the same row
- On call failure: row marked `called` (never reset to `not-called`) to prevent retry loops

### 4. Embed Feature (iframe-embeddable widget)
Each subuser gets a UUID `embedToken` stored in `users.json`. Token is permanent and doesn't require login.

- **Embed page:** `GET /embed/:token` — serves `public/embed.html` (dark-themed compact widget)
- **API endpoints:** `GET/POST /api/embed/:token/state|start|stop|pause|resume`
- **Admin dashboard:** "Copy Embed Code" button per subuser copies `<iframe src="https://app.railway.app/embed/TOKEN" ...>` to clipboard
- Widget polls every 10 seconds, shows: username, status badge (Running/Paused/Stopped), Calls Today, action buttons

---

## Current Project State

### Credentials
- Admin login: `admin` / `Caleb$771`
- Zeke login: `Zeke` / `Zeke`
- VAPI API Key: `e28662f1-b99f-4932-a33a-1b6d42b3846b`

### Data Files (persistent, Railway volume)
- `data/users.json` — all user accounts with bcrypt hashes + embedTokens
- `data/config.json` — dialer configurations (assistantId, phoneNumberIds, spreadsheetId, etc.)
- `data/state.json` — running/paused state, call counts, pending calls
- `data/blacklist.txt` — universal blacklist (phone numbers, one per line)

### Key Architecture Decisions
- File-based JSON storage (no database) — Railway volume mounted at `PERSISTENT_DATA_PATH`
- Sessions use memory store on Railway (no file store — ENOENT issues), file store locally
- Embed tokens are permanent UUIDs — no expiry, no rotation (simple for CRM embedding)
- On Railway: `SESSION_SECRET` env var should be set for security (falls back to `'change-me'`)

---

## File Map

```
server.js                  — app entry, mounts all routers, seeds users, restores dialers
lib/
  users.js                 — user CRUD (seedUsers, validateUser, createSubuser, deleteSubuser, findUserByEmbedToken)
  store.js                 — config/state read/write, ensureDialerInConfig(), dynamic dialer support
  scheduler.js             — per-dialer tick loop, buildExternalId, double-tap retry, 'calling' status fix
  spreadsheet.js           — xlsx read/write, getNextNotCalledRow, updateRow
  vapi.js                  — VAPI REST API calls (createCall, listAssistants, listPhoneNumbers)
  blacklist.js             — universal blacklist read/write
  booked.js                — address-already-booked check
  upload-store.js          — upload metadata, parseExternalId
  spin.js                  — {option1|option2} spin syntax + variable substitution
  cst.js                   — run window (startTime/endTime) + daysOfWeek enforcement
routes/
  auth.js                  — login (username+password), /api/auth/check, requireAuth, requireAdmin
  dialer.js                — config/state/start/stop/pause/vapi-info, validateDialerAccess()
  upload.js                — spreadsheet upload, replace, delete, list, phone-lookup
  admin.js                 — GET/POST/DELETE /api/admin/users (admin-only)
  embed.js                 — token-auth embed page + API (no session required)
  webhooks.js              — VAPI webhook handler, updates spreadsheet rows
public/
  login.html               — username + password login form
  dashboard.html           — main app shell (admin + subuser views)
  dashboard.js             — all frontend logic (initAdmin/initSubuser, renderSubuserMgmt, embed copy button)
  embed.html               — standalone iframe-embeddable compact dialer widget
data/
  users.json               — [{ username, passwordHash, role, dialerId?, embedToken? }]
  config.json              — { dialers: { dialer1: {...}, dialer4: {...}, ... } }
  state.json               — { dialers: { dialer1: { running, paused, callsPlacedToday, ... } } }
  blacklist.txt            — one phone number per line
```

---

## Next Steps / Ideas (not yet built)

- **Reset embed token** button per subuser (in case token is compromised)
- **Calls Today reset** — currently resets on server restart; could add daily midnight cron
- **Subuser can see their own call log** (read-only spreadsheet view)
- **Admin notification** when a subuser's call list runs out
- **Rate limiting** on embed API endpoints (currently open to anyone with token)

---

## How to Run Locally

```bash
cd "/Users/adrian/Desktop/dialer copy/.claude/worktrees/inspiring-mcclintock"
# Create .env with:
# VAPI_API_KEY=e28662f1-b99f-4932-a33a-1b6d42b3846b
npm start
# Open http://localhost:3000
```

Or use Claude Code preview (`.claude/launch.json` is configured).

## How to Deploy

```bash
# From main repo directory:
cd "/Users/adrian/Desktop/dialer copy"
git merge claude/inspiring-mcclintock --no-edit
git push origin main
# Railway auto-deploys in ~1-2 minutes
```
