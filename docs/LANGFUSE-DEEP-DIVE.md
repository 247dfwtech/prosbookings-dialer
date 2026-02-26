# Langfuse Deep Dive: Improve Calls & Voicemails

Use this guide to get everything you need from Langfuse to improve VAPI calls and voicemails. Your project: **solar vapi cold caller**.

---

## 1. What We Added in the Dialer (Done)

Every outbound call from the dialer now sends **metadata** to Langfuse via VAPI:

- **source:** `prosbookings-dialer`
- **dialerId:** `dialer1` | `dialer2` | `dialer3`
- **isRetry:** `true` on double-tap retry, `false` on first attempt
- **hasVoicemail:** `true` when a voicemail message was sent for this call

In Langfuse you can **filter traces** by these fields (e.g. `metadata.dialerId = dialer1`, `metadata.isRetry = true`) to analyze first vs retry and voicemail behavior.

---

## 2. Langfuse UI: Where to Go

1. **Traces**  
   `https://cloud.langfuse.com/project/clkpwwm0m000gmm094odg11gi/traces`  
   - Lists all VAPI calls. Use filters (see below).

2. **Single trace**  
   Click a row to open a trace. You’ll see:
   - **Metadata** (including our `source`, `dialerId`, `isRetry`, `hasVoicemail`)
   - **Spans** (LLM, TTS, STT, tool calls)
   - **Input/output** (transcript, messages)
   - **Scores** (if you set up evaluations)

3. **Analytics / Dashboards**  
   Use Langfuse’s analytics to build charts (e.g. by `endedReason`, by `metadata.dialerId`).

---

## 3. What to Do in Langfuse (Step by Step)

### A. Filter to Dialer-Only Calls

- In Traces, open the **filter** (or “Filter” / “Where”).
- Add a condition on **metadata**:  
  `metadata.source` = `prosbookings-dialer`  
  (or the key might appear as `assistantOverrides.metadata.source` depending on how VAPI sends it.)
- Save or apply. You should see only calls from our app.

### B. Find Voicemail vs Human-Answered

- VAPI sends **endedReason** (or similar) on the trace. In the trace list or trace detail, look for:
  - **voicemail** – VM was left or detected
  - **customer-did-not-answer** – no answer
  - **customer-ended-call**, **assistant-ended-call**, **assistant-forwarded-call** – human answered
- Filter or tag by these to count:
  - How many went to voicemail
  - How many were “no answer” vs “answered then hung up / transferred”

### C. Check Voicemail Content and Variables

- Open a trace that ended as **voicemail**.
- In **metadata** or **input**, check:
  - **variableValues** (or similar): `firstName`, `lastName`, etc.  
    Confirm they’re correct so the VM isn’t “Hello , this is…” (missing name).
- In the **message** or **override** that contains the voicemail script, confirm:
  - No typos in spin syntax: use `{Hi|Hello}` not `[Hi!Hello}`.
  - Variables use `{{firstName}}` (or your chosen format) and are substituted.

### D. Find Errors and Failed Calls

- Filter or search for traces where:
  - **endedReason** (or status) looks like an error, e.g.:
    - `twilio-failed-to-connect-call`
    - `assistant-*` errors
    - `call-failed-timeout`
- Open a few. Check:
  - **Spans** for red/failed steps (STT, LLM, TTS, tool calls).
  - **Error message** or **stack** if present.
- Use this to fix: prompt/script, tool config, or Twilio/number issues.

### E. Compare First Attempt vs Retry (Double-Tap)

- Filter: **metadata.isRetry** = `false` → first attempt.
- Filter: **metadata.isRetry** = `true` → retry (second attempt).
- Compare:
  - First attempt: many **voicemail** or **customer-did-not-answer**; few with long conversations.
  - Retry: some **voicemail** (VM left on second try), some **customer-ended-call** or **assistant-ended-call** (human picked up).
- If retries rarely show “human answered,” consider timing (30s delay) or messaging.

### F. Export or Report for “Everything You Need”

- **Export traces:** Use Langfuse’s export (CSV/JSON if available) for the date range you care about.
- **Columns to include:**  
  trace id, timestamp, `metadata.dialerId`, `metadata.isRetry`, `metadata.hasVoicemail`, `endedReason`, duration, cost (if present).
- **Optional:** Add a **Score** or **Tag** in Langfuse for “voicemail left correctly” (e.g. manual tag or a rule based on endedReason + duration) so you can filter “good VM” vs “bad VM” later.

---

## 4. Changes to Make in Langfuse (Settings / Structure)

- **Environments:** If you use prod vs staging, set the Langfuse environment in VAPI (e.g. `observabilityPlan.environment` or env variable) so you can filter by environment.
- **Tags:** In VAPI assistant config you can add **observabilityPlan.tags**, e.g. `["outbound", "solar-cold-call"]`, to group traces in Langfuse.
- **Scores:** Create a Langfuse score (e.g. “voicemail_ok”) and, if possible, set it from VAPI or from your webhook (e.g. “1 if endedReason = voicemail and duration &gt; 10s”) to track “good” voicemails over time.

---

## 5. Changes to Make in VAPI (Assistant / Dashboard)

- **Voicemail detection:** Keep provider **Vapi**. If VMs are cut off, increase **beepMaxAwaitSeconds** (e.g. 25–30) so the bot waits for the beep.
- **Voicemail message:** Fix spin syntax in the script (e.g. `{Hi|Hello there}`) and ensure variables are correct; confirm in Langfuse that `variableValues` and the final VM text look right.
- **Prompt:** In the assistant, add one line: “If you detect voicemail, deliver the provided voicemail message once, then end the call.”
- **Observability:** In the VAPI dashboard, under the assistant’s observability/Langfuse settings, add **tags** (e.g. `solar-cold-call`, `outbound`) so Langfuse filters are easier.

---

## 6. Quick Checklist (Run This Regularly)

- [ ] Open Traces, filter by `metadata.source` = `prosbookings-dialer`.
- [ ] Filter by `endedReason = voicemail`; open 2–3 traces and confirm `variableValues` and VM content.
- [ ] Filter by `metadata.isRetry = true`; confirm retries look correct (VM on second attempt).
- [ ] Search for error-like `endedReason`; fix assistant or Twilio/number issues.
- [ ] Export last 7 days of traces; compare “answered” vs “voicemail” vs “no answer” and error rate.
- [ ] In VAPI dashboard: fix voicemail spin syntax and add observability tags if not done yet.

---

## 7. Summary

- **Dialer:** Already sends `source`, `dialerId`, `isRetry`, `hasVoicemail` so Langfuse can filter and analyze.
- **You in Langfuse:** Use filters (source, dialerId, isRetry, endedReason), open traces to check metadata and voicemail content, and use exports/scores to track quality.
- **VAPI:** Fix VM script syntax, set beep wait, add a one-line VM instruction in the prompt, and add tags for Langfuse.

After you run through this once, you’ll have a repeatable process to use Langfuse for improving calls and voicemails.
