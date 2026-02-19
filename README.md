# Prosbookings Dialer

Password-protected dashboard with three dialers, XLS uploads, VAPI outbound calling, webhooks, and daily stats (CST).

## New in this version

- **Select all**: Checkbox above phone numbers to select/deselect all for that dialer.
- **Run window (CST)**: Start time and end time per dialer. The dialer only places calls when the current time (America/Chicago) is within that window. Leave blank for 24/7.
- **Today's stats**: Per dialer: Calls placed, Calls answered, Calls not answered. Appointments booked is shown on each dialer (global for the day). Stats reset at midnight CST.

## Spreadsheet format

**Upload columns (order):** first name, last name, address, city, zip code, phone, email, email2, Status

- Rows are called from the **top**; we use the first row with **Status** = `not-called` and a valid **phone**.
- After each call we set **Status** to `called` and append three columns after Status: **ended reason**, **success evaluation**, **transcript**.

**Full format after calls:** first name, last name, address, city, zip code, phone, email, email2, Status, ended reason, success evaluation, transcript

(email and email2 are read from the sheet but are not sent to VAPI.)

## Variables sent to VAPI

These are sent as `assistantOverrides.variableValues` (and substituted into the voicemail message before sending). Use them in your VAPI assistant system prompt and in the voicemail message field; both **camelCase** and **snake_case** work in voicemail text.

| Variable | Format in prompt/voicemail | Source (test call / spreadsheet) |
|----------|----------------------------|-----------------------------------|
| First name | `{{firstName}}` or `{{first_name}}` | Test: First name field. List: "First Name" column. |
| Last name | `{{lastName}}` or `{{last_name}}` | Test: (empty). List: "Last Name" column. |
| Address | `{{address}}` | Test: Address field. List: "Address" column. |
| City | `{{city}}` | Test: (empty). List: "City" column. |
| ZIP | `{{zip}}` | Test: (empty). List: "Zip Code" or "Zip" column. |

Voicemail message: we **spin** first (e.g. `{Hi|Hello}`), then **substitute** these variables, then send the final string to VAPI (VAPI does not substitute variables in the voicemail text itself).

## Setup

Generate password hash: `node scripts/hash-password.js`.

**Environment variables**

- `SITE_PASSWORD_HASH` – bcrypt hash of dashboard password (required).
- `VAPI_API_KEY` – VAPI API key (required for calls).
- `SESSION_SECRET` – Optional. Secret for signing session cookies; if unset, a default is used. For production you can set this to a long random string (e.g. `openssl rand -hex 32`) in Railway Variables.
- **Email (booking confirmations):** Use either:
  - **Microsoft / Outlook / Office 365 (SMTP):** `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`. For Outlook.com use `smtp-mail.outlook.com`; for Office 365 use `smtp.office365.com`. Turn on 2FA and create an **App password** at account.microsoft.com (Security) and use that as `SMTP_PASS`.
  - **Resend:** `RESEND_API_KEY` and `FROM_EMAIL` (optional).
- `BOOKING_NOTIFY_EMAIL` – Where to send booking notifications (default asanchezept@yahoo.com).
- **Google Calendar (booking webhook):**
  - **Option A (Railway / no file):** `GOOGLE_CALENDAR_CREDENTIALS_JSON` – full JSON string of your Google service account key (paste the contents of the key file).
  - **Option B (local / VPS):** `GOOGLE_CALENDAR_CREDENTIALS_PATH` – path to the JSON key file.
  - `GOOGLE_CALENDAR_ID` – optional; defaults to `primary` if unset.

## Publishing updates (local → published app)

To push your local changes to the live app on Railway:

1. **Commit and push to GitHub** (Railway deploys from your repo):
   ```bash
   cd /path/to/dialer
   git add -A
   git commit -m "Describe your updates"
   git push origin main
   ```
2. Railway will **auto-deploy** when it sees the new commit. Check the **Deployments** tab on Railway; when the new deployment is active, your published app is updated.
3. If you use a **volume** and `PERSISTENT_DATA_PATH`, your config and uploads are kept; only the app code changes.

## Deploying on Railway (step-by-step)

On Railway, the app’s disk is **temporary**: every time you deploy or the app restarts, anything saved (dialer settings, uploaded spreadsheets, voicemail messages) is wiped. So test calls and the dialer can “do nothing” because config and uploads are gone. Fix this by adding a **volume** with mount path `/app/uploads` and setting **Variables** → **`PERSISTENT_DATA_PATH`** = **`/app/uploads`** so the app stores all data (uploads, config, voicemail) on that volume.

### Step 1: Open your project on Railway

1. Go to [railway.app](https://railway.app) and log in.
2. Open the project that has your **Prosbookings Dialer** app (the one you deployed from GitHub).
3. Click on the **service** that runs the dialer (the box that shows your app name, e.g. “prosbookings-dialer” or similar). You should see tabs like **Deployments**, **Settings**, **Variables**, etc.

### Step 2: Add a volume and set the variable

1. In the left sidebar for that service, click **“Volumes”** (or find it under **Resources** / **Storage** depending on Railway’s current UI).
2. If you don’t see “Volumes”, look for **“+ New”** or **“Add volume”** or a **“Storage”** section.
3. Click **“Add Volume”** or **“Create Volume”**.
4. You’ll be asked for a **mount path**. This is the folder path inside the app where the volume will appear. Type exactly:
   ```text
   /app/uploads
   ```
5. In **Variables**, add **`PERSISTENT_DATA_PATH`** = **`/app/uploads`**. Then create the volume and redeploy.

### Step 3: Redeploy

1. After adding the volume and variable, redeploy. Either:
   - Use **“Redeploy”** or **“Deploy”** from the latest deployment (e.g. from the **Deployments** tab), or  
   - Push a small change to your GitHub repo so Railway deploys again.
2. Wait until the deployment finishes (green / “Success” or “Active”).

### Step 4: Configure the app again (one time after adding the volume)

The first time after adding volumes, the app may start with empty storage. Do this once:

1. Open your dialer in the browser (e.g. `https://your-app.up.railway.app`).
2. Log in with your password.
3. For **Dialer 1** (and any other dialer you use):
   - Choose the **Assistant** and **Phone numbers** again.
   - Set the **Run window** (or leave blank for 24/7) if you use it.
4. **Upload your spreadsheet** again (Upload → choose file → upload).
5. In the dialer section, pick that spreadsheet from the **“Call list (spreadsheet)”** dropdown.
6. Click **Start** when you want calls to run.

From now on, this config and your uploads are stored on the volumes. They will **persist** across restarts and future deploys. You only need to reconfigure if you delete the volumes or create a new service.

### If something goes wrong

- **“Volumes” not in the menu**  
  Railway sometimes moves this. Look under **Settings** → **Storage**, or **Resources**, or search the dashboard for “Volume” or “Persistent storage”.

- **Mount path**  
  Use exactly `/app/uploads` (no extra slash). If you use one volume + `PERSISTENT_DATA_PATH=/app/uploads`, that’s enough for everything to persist.

- **After redeploy, config or uploads are still gone**  
  Ensure **Variables** includes **`PERSISTENT_DATA_PATH`** = **`/app/uploads`** (same as the volume mount path). Redeploy, then configure again once; after that it should stick.
