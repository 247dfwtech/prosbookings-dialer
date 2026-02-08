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
- **Email (booking confirmations):** Use either:
  - **Microsoft / Outlook / Office 365 (SMTP):** `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`. For Outlook.com use `smtp-mail.outlook.com`; for Office 365 use `smtp.office365.com`. Turn on 2FA and create an **App password** at account.microsoft.com (Security) and use that as `SMTP_PASS`.
  - **Resend:** `RESEND_API_KEY` and `FROM_EMAIL` (optional).
- `BOOKING_NOTIFY_EMAIL` – Where to send booking notifications (default asanchezept@yahoo.com).
- **Google Calendar (booking webhook):**
  - **Option A (Railway / no file):** `GOOGLE_CALENDAR_CREDENTIALS_JSON` – full JSON string of your Google service account key (paste the contents of the key file).
  - **Option B (local / VPS):** `GOOGLE_CALENDAR_CREDENTIALS_PATH` – path to the JSON key file.
  - `GOOGLE_CALENDAR_ID` – optional; defaults to `primary` if unset.
