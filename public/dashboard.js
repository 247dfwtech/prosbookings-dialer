(function () {
  // Populated after auth check
  let currentUser = { role: 'admin', dialerId: null, username: '' };
  let DIALER_IDS = ['dialer1', 'dialer2', 'dialer3'];

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      credentials: 'same-origin',
    });
    if (res.status === 401) {
      window.location.href = '/';
      throw new Error('Unauthorized');
    }
    return res.json().catch(() => ({}));
  }

  let config = { dialers: {} };
  let state = { dialers: {} };
  let vapiInfo = { assistants: [], phoneNumbers: [] };
  let filterSuccessOnly = false;

  async function loadConfig() {
    config = await api('/api/dialer/config');
  }
  async function loadState() {
    state = await api('/api/dialer/state');
  }
  async function loadVapiInfo() {
    vapiInfo = await api('/api/dialer/vapi-info');
  }
  async function loadUploads() {
    return api('/api/upload/list');
  }

  function renderFileList(files) {
    const el = document.getElementById('file-list');
    if (!files || files.length === 0) {
      el.textContent = 'No files uploaded.';
      return;
    }
    el.innerHTML = files.map((f) =>
      `<div class="file-list-item">
        <span>${escapeHtml(f.originalName)}</span>
        <a href="#" class="link-view-sheet" data-upload-id="${escapeHtml(f.uploadId)}">View</a>
        <a href="/api/upload/${encodeURIComponent(f.uploadId)}/download" class="link-download-sheet" download>Download</a>
        <a href="#" class="link-replace-sheet" data-upload-id="${escapeHtml(f.uploadId)}">Replace</a>
        <input type="file" class="input-replace-sheet" data-upload-id="${escapeHtml(f.uploadId)}" accept=".xlsx,.xls" style="display:none">
        <a href="#" class="link-delete-sheet" data-upload-id="${escapeHtml(f.uploadId)}">Delete</a>
      </div>`
    ).join('');
    document.querySelectorAll('.link-view-sheet').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); viewSpreadsheet(a.dataset.uploadId); });
    });
    document.querySelectorAll('.link-replace-sheet').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); e.target.closest('.file-list-item').querySelector('.input-replace-sheet').click(); });
    });
    document.querySelectorAll('.input-replace-sheet').forEach((input) => {
      input.addEventListener('change', async () => {
        if (!input.files?.length) return;
        const uploadId = input.dataset.uploadId;
        const form = new FormData();
        form.append('file', input.files[0]);
        try {
          const res = await fetch(`/api/upload/${encodeURIComponent(uploadId)}/replace`, {
            method: 'PUT',
            body: form,
            credentials: 'same-origin',
          });
          if (res.status === 401) { window.location.href = '/'; return; }
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Replace failed');
          }
          input.value = '';
          const list = await loadUploads();
          window.__uploadList = list;
          renderFileList(list);
          refreshDialers();
        } catch (err) {
          alert(err.message || 'Replace failed');
        }
      });
    });
    document.querySelectorAll('.link-delete-sheet').forEach((a) => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!confirm('Delete this spreadsheet? Dialers using it will be cleared.')) return;
        const uploadId = a.dataset.uploadId;
        try {
          await api(`/api/upload/${uploadId}`, { method: 'DELETE' });
          const list = await loadUploads();
          window.__uploadList = list;
          renderFileList(list);
          await loadConfig();
          refreshDialers();
        } catch (err) {
          alert(err.message || 'Delete failed');
        }
      });
    });
  }

  async function viewSpreadsheet(uploadId) {
    try {
      const data = await api(`/api/upload/${uploadId}/data`);
      const section = document.getElementById('spreadsheet-view-section');
      document.getElementById('sheet-view-title').textContent = data.originalName || uploadId;
      const downloadLink = document.getElementById('btn-download-current-sheet');
      if (downloadLink) {
        downloadLink.href = `/api/upload/${encodeURIComponent(uploadId)}/download`;
        downloadLink.setAttribute('download', data.originalName || '');
      }
      section.style.display = 'block';
      window.__currentSheetUploadId = uploadId;
      window.__currentSheetData = data;
      window.__currentSpecialView = null;
      renderSheetTable(data.headers, data.rows);
    } catch (e) {
      alert(e.message || 'Failed to load spreadsheet');
    }
  }

  async function viewBlacklist() {
    try {
      const data = await api('/api/upload/system/blacklist/data');
      const section = document.getElementById('spreadsheet-view-section');
      document.getElementById('sheet-view-title').textContent = 'blacklist.txt';
      const downloadLink = document.getElementById('btn-download-current-sheet');
      if (downloadLink) {
        downloadLink.href = '/api/upload/blacklist/download';
        downloadLink.setAttribute('download', 'blacklist.txt');
      }
      section.style.display = 'block';
      window.__currentSheetUploadId = null;
      window.__currentSheetData = null;
      window.__currentSpecialView = 'blacklist';
      filterSuccessOnly = false;
      const btnFilter = document.getElementById('btn-filter-success');
      if (btnFilter) {
        btnFilter.textContent = 'Success evaluation True';
        btnFilter.classList.remove('btn-primary');
        btnFilter.classList.add('btn-secondary');
      }
      const table = document.getElementById('sheet-table');
      const phones = data.phones || [];
      let html = '<thead><tr><th>Phone</th></tr></thead><tbody>';
      phones.forEach((p) => {
        html += `<tr><td>${escapeHtml(String(p))}</td></tr>`;
      });
      html += '</tbody>';
      table.innerHTML = html;
    } catch (e) {
      alert(e.message || 'Failed to load blacklist');
    }
  }

  async function viewBooked() {
    try {
      const data = await api('/api/upload/system/booked/data');
      const section = document.getElementById('spreadsheet-view-section');
      document.getElementById('sheet-view-title').textContent = 'booked.xlsx';
      const downloadLink = document.getElementById('btn-download-current-sheet');
      if (downloadLink) {
        downloadLink.href = '/api/upload/booked/download';
        downloadLink.setAttribute('download', 'booked.xlsx');
      }
      section.style.display = 'block';
      window.__currentSheetUploadId = null;
      window.__currentSheetData = null;
      window.__currentSpecialView = 'booked';
      filterSuccessOnly = false;
      const btnFilter = document.getElementById('btn-filter-success');
      if (btnFilter) {
        btnFilter.textContent = 'Success evaluation True';
        btnFilter.classList.remove('btn-primary');
        btnFilter.classList.add('btn-secondary');
      }
      const table = document.getElementById('sheet-table');
      const headers = data.headers || [];
      const rows = data.rows || [];
      let html = '<thead><tr>' + headers.map((h) => `<th>${escapeHtml(String(h))}</th>`).join('') + '</tr></thead><tbody>';
      rows.forEach((row) => {
        html += '<tr>' + headers.map((_, idx) => `<td>${escapeHtml(String(row[idx] ?? ''))}</td>`).join('') + '</tr>';
      });
      html += '</tbody>';
      table.innerHTML = html;
    } catch (e) {
      alert(e.message || 'Failed to load booked.xlsx');
    }
  }

  function renderSheetTable(headers, rows) {
    const displayHeaders = ['firstName', 'lastName', 'address', 'city', 'zip', 'phone', 'status', 'endedReason', 'successEvaluation', 'transcript'];
    const labels = { firstName: 'First name', lastName: 'Last name', address: 'Address', city: 'City', zip: 'Zip', status: 'Status', endedReason: 'Ended reason', successEvaluation: 'Success evaluation', transcript: 'Transcript' };
    const table = document.getElementById('sheet-table');
    let filteredRows = rows;
    if (filterSuccessOnly) {
      filteredRows = rows.filter((row) => {
        const val = String(row.successEvaluation ?? '').trim().toLowerCase();
        return val === 'true';
      });
    }
    let html = '<thead><tr>' + displayHeaders.map((h) => `<th>${escapeHtml(labels[h] || h)}</th>`).join('') + '</tr></thead><tbody>';
    filteredRows.forEach((row) => {
      html += '<tr>' + displayHeaders.map((h) => `<td>${escapeHtml(String(row[h] ?? ''))}</td>`).join('') + '</tr>';
    });
    html += '</tbody>';
    table.innerHTML = html;
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderDialer(dialerId) {
    const d = config.dialers[dialerId] || {};
    const s = state.dialers[dialerId] || {};
    const assistants = vapiInfo.assistants || [];
    const phoneNumbers = vapiInfo.phoneNumbers || [];
    const selectedPhones = d.phoneNumberIds || [];
    const allSelected = phoneNumbers.length > 0 && selectedPhones.length === phoneNumbers.length;
    const label = dialerId.replace('dialer', 'Dialer ');
    const stats = {
      placed: s.callsPlacedToday ?? 0,
      answered: s.callsAnsweredToday ?? 0,
      notAnswered: s.callsNotAnsweredToday ?? 0,
      booked: state.appointmentsBookedToday ?? 0,
    };
    const running = !!s.running;
    const paused = !!s.paused;
    const statusText = !running ? 'Stopped' : paused ? 'Paused' : 'Running';

    return `
      <div class="dialer-box" data-dialer="${dialerId}">
        <h2>${label}</h2>
        <button type="button" class="btn-secondary btn-vapi-info" data-dialer="${dialerId}">Get latest VAPI info</button>
        <div class="status ${running && !paused ? 'running' : ''} ${paused ? 'paused' : ''}" id="status-${dialerId}">${statusText}</div>
        <p class="next-up" id="next-up-${dialerId}"></p>

        <label>Call list (spreadsheet)</label>
        <select class="dialer-spreadsheet" data-dialer="${dialerId}">
          <option value="">-- Select --</option>
          ${(vapiInfo.uploadList || []).map((f) => `<option value="${f.uploadId}" ${d.spreadsheetId === f.uploadId ? 'selected' : ''}>${escapeHtml(f.originalName)}</option>`).join('')}
        </select>

        <label>Target Zip</label>
        <input type="text" class="dialer-target-zip" data-dialer="${dialerId}" value="${d.targetZip || ''}" placeholder="e.g. 75001 (leave empty for all zip codes)">

        <label>Assistant</label>
        <select class="dialer-assistant" data-dialer="${dialerId}">
          <option value="">-- Select --</option>
          ${assistants.map((a) => `<option value="${a.id}" ${d.assistantId === a.id ? 'selected' : ''}>${escapeHtml(a.name || a.id)}</option>`).join('')}
        </select>

        <label>Phone numbers</label>
        <label class="check-all-row"><input type="checkbox" class="dialer-phone-check-all" data-dialer="${dialerId}" ${allSelected ? 'checked' : ''}> Select all</label>
        <div class="phone-multi" data-dialer="${dialerId}">
          ${phoneNumbers.length === 0 ? '<p class="status">Click "Get latest VAPI info" first.</p>' : phoneNumbers.map((p) => `<label><input type="checkbox" class="dialer-phone" data-id="${p.id}" data-dialer="${dialerId}" ${selectedPhones.includes(p.id) ? 'checked' : ''}> ${escapeHtml(p.number || p.id)}</label>`).join('')}
        </div>

        <label>Days of week</label>
        <div class="row days-of-week">
          ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
            const dayNum = idx === 6 ? 0 : idx + 1;
            const checked = (d.daysOfWeek || [1,2,3,4,5]).includes(dayNum);
            return `<label class="${checked ? 'day-checked' : ''}"><input type="checkbox" class="dialer-day" data-day="${dayNum}" data-dialer="${dialerId}" ${checked ? 'checked' : ''}> ${day}</label>`;
          }).join('')}
        </div>

        <label>Run window (CST)</label>
        <div class="row run-window">
          <input type="time" class="dialer-start-time" data-dialer="${dialerId}" value="${d.startTime || ''}" placeholder="Start">
          <span>to</span>
          <input type="time" class="dialer-end-time" data-dialer="${dialerId}" value="${d.endTime || ''}" placeholder="End">
        </div>

        <label>Call every (seconds)</label>
        <input type="number" class="dialer-call-every" data-dialer="${dialerId}" value="${d.callEverySeconds ?? 30}" min="1">

        <label>Max simultaneous calls</label>
        <select class="dialer-max-concurrent" data-dialer="${dialerId}">
          ${[1,2,3,4,5,6,7,8,9,10].map((n) => `<option value="${n}" ${(d.maxConcurrentCalls ?? 1) === n ? 'selected' : ''}>${n}</option>`).join('')}
        </select>

        <label>Double tap (retry if no answer)</label>
        <select class="dialer-double-tap" data-dialer="${dialerId}">
          <option value="false" ${!d.doubleTap ? 'selected' : ''}>No</option>
          <option value="true" ${d.doubleTap ? 'selected' : ''}>Yes</option>
        </select>

        <label>Voicemail (leave N every M calls)</label>
        <div class="row">
          <select class="dialer-voicemail-n" data-dialer="${dialerId}">
            ${[0,1,2,3,4,5,6,7,8,9,10].map((n) => `<option value="${n}" ${(d.voicemailN ?? 0) === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
          <span>every</span>
          <select class="dialer-voicemail-m" data-dialer="${dialerId}">
            ${[1,2,3,4,5,6,7,8,9,10].map((m) => `<option value="${m}" ${(d.voicemailM ?? 1) === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
          <span>calls</span>
        </div>

        <label>Voicemail message (use {hi|hello} for spin)</label>
        <textarea class="dialer-voicemail-msg" data-dialer="${dialerId}" placeholder="e.g. Hi {there|you}, this is...">${escapeHtml(d.voicemailMessage || '')}</textarea>
        <button type="button" class="btn-secondary btn-save-voicemail" data-dialer="${dialerId}">Save voicemail message</button>

        <div>
          <button type="button" class="btn-primary btn-start" data-dialer="${dialerId}" ${running ? 'disabled' : ''}>Start</button>
          <button type="button" class="btn-secondary btn-pause" data-dialer="${dialerId}" ${!running || paused ? 'disabled' : ''}>Pause</button>
          <button type="button" class="btn-secondary btn-resume" data-dialer="${dialerId}" ${!running || !paused ? 'disabled' : ''}>Resume</button>
          <button type="button" class="btn-danger btn-stop" data-dialer="${dialerId}" ${!running ? 'disabled' : ''}>Stop</button>
        </div>

        <div class="stats-box" data-dialer="${dialerId}">
          <h3 class="stats-title">Today's stats (CST)</h3>
          <div class="stats-row"><span>Calls placed</span><strong id="stats-placed-${dialerId}">${stats.placed}</strong></div>
          <div class="stats-row"><span>Calls answered</span><strong id="stats-answered-${dialerId}">${stats.answered}</strong></div>
          <div class="stats-row"><span>Calls not answered</span><strong id="stats-notanswered-${dialerId}">${stats.notAnswered}</strong></div>
          <div class="stats-row"><span>Appointments booked</span><strong id="stats-booked-${dialerId}">${stats.booked}</strong></div>
        </div>

        <hr class="dialer-hr">
        <h3 class="test-call-title">Test call</h3>
        <label>First name</label>
        <input type="text" class="test-first-name" data-dialer="${dialerId}" placeholder="First name">
        <label>Address</label>
        <input type="text" class="test-address" data-dialer="${dialerId}" placeholder="Address">
        <label>Phone</label>
        <input type="tel" class="test-phone" data-dialer="${dialerId}" placeholder="10-digit phone">
        <button type="button" class="btn-primary btn-test-call" data-dialer="${dialerId}">Place test call</button>
        <p class="test-call-status" id="test-status-${dialerId}"></p>
      </div>
    `;
  }

  /** Compact dialer for subuser: just status, stats, and Start/Stop/Pause. */
  function renderCompactDialer(dialerId) {
    const s = state.dialers[dialerId] || {};
    const running = !!s.running;
    const paused = !!s.paused;
    const statusText = !running ? 'Stopped' : paused ? 'Paused' : 'Running';
    const stats = {
      placed: s.callsPlacedToday ?? 0,
      answered: s.callsAnsweredToday ?? 0,
      notAnswered: s.callsNotAnsweredToday ?? 0,
      booked: state.appointmentsBookedToday ?? 0,
    };
    return `
      <div class="dialer-box" data-dialer="${dialerId}">
        <h2>Your Dialer</h2>
        <div class="status ${running && !paused ? 'running' : ''} ${paused ? 'paused' : ''}" id="status-${dialerId}">${statusText}</div>
        <p class="next-up" id="next-up-${dialerId}"></p>
        <div style="margin: 16px 0;">
          <button type="button" class="btn-primary btn-start" data-dialer="${dialerId}" ${running ? 'disabled' : ''}>Start</button>
          <button type="button" class="btn-secondary btn-pause" data-dialer="${dialerId}" ${!running || paused ? 'disabled' : ''}>Pause</button>
          <button type="button" class="btn-secondary btn-resume" data-dialer="${dialerId}" ${!running || !paused ? 'disabled' : ''}>Resume</button>
          <button type="button" class="btn-danger btn-stop" data-dialer="${dialerId}" ${!running ? 'disabled' : ''}>Stop</button>
        </div>
        <div class="stats-box" data-dialer="${dialerId}">
          <h3 class="stats-title">Today's stats (CST)</h3>
          <div class="stats-row"><span>Calls placed</span><strong id="stats-placed-${dialerId}">${stats.placed}</strong></div>
          <div class="stats-row"><span>Calls answered</span><strong id="stats-answered-${dialerId}">${stats.answered}</strong></div>
          <div class="stats-row"><span>Calls not answered</span><strong id="stats-notanswered-${dialerId}">${stats.notAnswered}</strong></div>
          <div class="stats-row"><span>Appointments booked</span><strong id="stats-booked-${dialerId}">${stats.booked}</strong></div>
        </div>
      </div>
    `;
  }

  function getUploadList() {
    return (window.__uploadList || []).map((f) => ({ uploadId: f.uploadId, originalName: f.originalName }));
  }

  function refreshDialers() {
    vapiInfo.uploadList = getUploadList();
    if (currentUser.role === 'subuser') {
      document.getElementById('dialer-grid').innerHTML = DIALER_IDS.map(renderCompactDialer).join('');
    } else {
      document.getElementById('dialer-grid').innerHTML = DIALER_IDS.map(renderDialer).join('');
    }
    bindDialerEvents();
  }

  function updateStatsOnly() {
    Promise.all([loadState(), api('/api/dialer/next-up').catch(() => ({}))]).then(([, nextUp]) => {
      nextUp = nextUp || {};
      DIALER_IDS.forEach((dialerId) => {
        const s = state.dialers[dialerId] || {};
        const running = !!s.running;
        const paused = !!s.paused;
        const statusEl = document.getElementById('status-' + dialerId);
        if (statusEl) {
          statusEl.textContent = !running ? 'Stopped' : paused ? 'Paused' : 'Running';
          statusEl.classList.toggle('running', running && !paused);
          statusEl.classList.toggle('paused', paused);
        }
        const nextUpEl = document.getElementById('next-up-' + dialerId);
        if (nextUpEl) {
          const n = nextUp[dialerId];
          if (n?.noContactsInTargetZip) nextUpEl.textContent = 'No more contacts in target zip.';
          else if (n?.done) nextUpEl.textContent = 'Next: All done for this list.';
          else if (n?.firstName != null || n?.phone) nextUpEl.textContent = `Next: ${[n.firstName, n.lastName].filter(Boolean).join(' ')} (row ${n.rowIndex})`;
          else nextUpEl.textContent = '';
        }
        const root = getDialerEl(dialerId);
        if (root) {
          const btnStart = root.querySelector('.btn-start');
          const btnPause = root.querySelector('.btn-pause');
          const btnResume = root.querySelector('.btn-resume');
          const btnStop = root.querySelector('.btn-stop');
          if (btnStart) btnStart.disabled = running;
          if (btnPause) btnPause.disabled = !running || paused;
          if (btnResume) btnResume.disabled = !running || !paused;
          if (btnStop) btnStop.disabled = !running;
        }
        const placed = document.getElementById('stats-placed-' + dialerId);
        const answered = document.getElementById('stats-answered-' + dialerId);
        const notAnswered = document.getElementById('stats-notanswered-' + dialerId);
        const booked = document.getElementById('stats-booked-' + dialerId);
        if (placed) placed.textContent = s.callsPlacedToday ?? 0;
        if (answered) answered.textContent = s.callsAnsweredToday ?? 0;
        if (notAnswered) notAnswered.textContent = s.callsNotAnsweredToday ?? 0;
        if (booked) booked.textContent = state.appointmentsBookedToday ?? 0;
      });
    });
  }

  function getDialerEl(dialerId) {
    return document.querySelector(`.dialer-box[data-dialer="${dialerId}"]`);
  }

  function collectDialerForm(dialerId) {
    const root = getDialerEl(dialerId);
    if (!root) return {};
    const spreadsheet = root.querySelector('.dialer-spreadsheet');
    const assistant = root.querySelector('.dialer-assistant');
    const callEvery = root.querySelector('.dialer-call-every');
    const maxConcurrent = root.querySelector('.dialer-max-concurrent');
    const doubleTap = root.querySelector('.dialer-double-tap');
    const vmN = root.querySelector('.dialer-voicemail-n');
    const vmM = root.querySelector('.dialer-voicemail-m');
    const vmMsg = root.querySelector('.dialer-voicemail-msg');
    const startTime = root.querySelector('.dialer-start-time');
    const endTime = root.querySelector('.dialer-end-time');
    const targetZip = root.querySelector('.dialer-target-zip');
    const phoneChecks = root.querySelectorAll('.dialer-phone:checked');
    const dayChecks = root.querySelectorAll('.dialer-day:checked');
    const daysOfWeek = Array.from(dayChecks).map((c) => parseInt(c.dataset.day, 10));
    return {
      dialerId,
      spreadsheetId: spreadsheet?.value || '',
      assistantId: assistant?.value || '',
      callEverySeconds: parseInt(callEvery?.value, 10) || 30,
      maxConcurrentCalls: parseInt(maxConcurrent?.value, 10) || 1,
      doubleTap: doubleTap?.value === 'true',
      voicemailN: parseInt(vmN?.value, 10) ?? 0,
      voicemailM: parseInt(vmM?.value, 10) ?? 1,
      voicemailMessage: vmMsg?.value || '',
      phoneNumberIds: Array.from(phoneChecks).map((c) => c.dataset.id),
      startTime: startTime?.value || '',
      endTime: endTime?.value || '',
      targetZip: targetZip?.value?.trim() || '',
      daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : [1, 2, 3, 4, 5],
    };
  }

  async function saveDialerConfig(dialerId) {
    const payload = collectDialerForm(dialerId);
    await api('/api/dialer/config', { method: 'PUT', body: JSON.stringify(payload) });
    await loadConfig();
  }

  function bindDialerEvents() {
    document.querySelectorAll('.btn-vapi-info').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          vapiInfo = await api('/api/dialer/vapi-info');
          vapiInfo.uploadList = getUploadList();
          refreshDialers();
        } catch (e) {
          alert(e.message || 'Failed to fetch VAPI info');
        }
      });
    });

    document.querySelectorAll('.dialer-phone-check-all').forEach((cb) => {
      cb.addEventListener('change', () => {
        const dialerId = cb.dataset.dialer;
        const root = getDialerEl(dialerId);
        const all = root.querySelectorAll('.dialer-phone');
        all.forEach((c) => { c.checked = cb.checked; });
        saveDialerConfig(dialerId);
      });
    });

    document.querySelectorAll('.dialer-spreadsheet').forEach((sel) => {
      sel.addEventListener('change', () => saveDialerConfig(sel.dataset.dialer));
    });
    document.querySelectorAll('.dialer-assistant').forEach((sel) => {
      sel.addEventListener('change', () => saveDialerConfig(sel.dataset.dialer));
    });
    document.querySelectorAll('.dialer-call-every').forEach((inp) => {
      inp.addEventListener('change', () => saveDialerConfig(inp.dataset.dialer));
    });
    document.querySelectorAll('.dialer-max-concurrent').forEach((sel) => {
      sel.addEventListener('change', () => saveDialerConfig(sel.dataset.dialer));
    });
    document.querySelectorAll('.dialer-double-tap').forEach((sel) => {
      sel.addEventListener('change', () => saveDialerConfig(sel.dataset.dialer));
    });
    document.querySelectorAll('.dialer-voicemail-n, .dialer-voicemail-m').forEach((el) => {
      el.addEventListener('change', () => saveDialerConfig(el.dataset.dialer));
    });
    document.querySelectorAll('.dialer-voicemail-msg').forEach((ta) => {
      ta.addEventListener('blur', () => saveDialerConfig(ta.dataset.dialer));
    });
    document.querySelectorAll('.btn-save-voicemail').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.dialer;
        const origText = btn.textContent;
        try {
          await saveDialerConfig(id);
          btn.textContent = 'Saved';
          setTimeout(() => { btn.textContent = origText; }, 1500);
        } catch (e) {
          alert(e.message || 'Failed to save');
        }
      });
    });
    document.querySelectorAll('.dialer-start-time, .dialer-end-time, .dialer-target-zip').forEach((el) => {
      el.addEventListener('change', () => saveDialerConfig(el.dataset.dialer));
    });
    document.querySelectorAll('.dialer-target-zip').forEach((inp) => {
      inp.addEventListener('blur', () => saveDialerConfig(inp.dataset.dialer));
    });
    document.querySelectorAll('.dialer-day').forEach((cb) => {
      cb.addEventListener('change', () => {
        const label = cb.closest('label');
        if (cb.checked) {
          label.classList.add('day-checked');
        } else {
          label.classList.remove('day-checked');
        }
        saveDialerConfig(cb.dataset.dialer);
      });
    });
    document.querySelectorAll('.dialer-phone').forEach((cb) => {
      cb.addEventListener('change', () => {
        const dialerId = cb.dataset.dialer;
        const root = getDialerEl(dialerId);
        const all = root.querySelectorAll('.dialer-phone');
        const checkAll = root.querySelector('.dialer-phone-check-all');
        if (checkAll) checkAll.checked = all.length === root.querySelectorAll('.dialer-phone:checked').length;
        saveDialerConfig(dialerId);
      });
    });

    document.querySelectorAll('.btn-start').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.dialer;
        // Only save full config for admin dialers (subuser view has no settings form)
        if (currentUser.role === 'admin') await saveDialerConfig(id);
        await api(`/api/dialer/start/${id}`, { method: 'POST' });
        await loadState();
        refreshDialers();
        updateStatsOnly();
      });
    });
    document.querySelectorAll('.btn-pause').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.dialer;
        await api(`/api/dialer/pause/${id}`, { method: 'POST' });
        await loadState();
        refreshDialers();
      });
    });
    document.querySelectorAll('.btn-resume').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.dialer;
        await api(`/api/dialer/resume/${id}`, { method: 'POST' });
        await loadState();
        refreshDialers();
      });
    });
    document.querySelectorAll('.btn-stop').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.dialer;
        await api(`/api/dialer/stop/${id}`, { method: 'POST' });
        await loadState();
        refreshDialers();
      });
    });

    document.querySelectorAll('.btn-test-call').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.dialer;
        const root = getDialerEl(id);
        const firstName = root?.querySelector('.test-first-name')?.value?.trim() || '';
        const address = root?.querySelector('.test-address')?.value?.trim() || '';
        const phone = root?.querySelector('.test-phone')?.value?.trim() || '';
        const statusEl = document.getElementById(`test-status-${id}`);
        if (statusEl) statusEl.textContent = '';
        if (!phone) {
          if (statusEl) statusEl.textContent = 'Enter a phone number.';
          return;
        }
        try {
          const data = await api('/api/dialer/test-call', {
            method: 'POST',
            body: JSON.stringify({ dialerId: id, firstName, address, phone }),
          });
          if (statusEl) {
            statusEl.textContent = data.ok ? 'Test call placed.' : (data.error || '');
            statusEl.classList.toggle('error', !data.ok);
          }
        } catch (e) {
          if (statusEl) {
            statusEl.textContent = e.message || 'Failed to place test call';
            statusEl.classList.add('error');
          }
        }
      });
    });
  }

  // ──────────────────────────────────────────────────────────
  // Subuser Management (admin only)
  // ──────────────────────────────────────────────────────────

  async function renderSubuserMgmt() {
    const section = document.getElementById('subuser-mgmt-section');
    if (!section) return;
    section.style.display = 'block';

    let subusers = [];
    try {
      subusers = await api('/api/admin/users');
    } catch (_) {}

    section.innerHTML = `
      <h2>Subuser Management</h2>
      <div id="subuser-list">
        ${subusers.length === 0
          ? '<p class="muted">No subusers yet.</p>'
          : subusers.map((u) => `
            <div class="subuser-row" data-username="${escapeHtml(u.username)}">
              <strong>${escapeHtml(u.username)}</strong>
              <span class="muted" style="margin-left:8px;">(${escapeHtml(u.dialerId)})</span>
              <button type="button" class="btn-secondary btn-subuser-settings" data-username="${escapeHtml(u.username)}" data-dialer-id="${escapeHtml(u.dialerId)}" style="margin-left:12px;">Subuser Settings</button>
              ${u.embedToken ? `<button type="button" class="btn-secondary btn-copy-embed" data-token="${escapeHtml(u.embedToken)}" data-username="${escapeHtml(u.username)}" style="margin-left:8px;" title="Copy iframe embed code for ${escapeHtml(u.username)}">Copy Embed Code</button>` : ''}
              <button type="button" class="btn-danger btn-delete-subuser" data-username="${escapeHtml(u.username)}" style="margin-left:8px;">Delete</button>
              <div class="subuser-settings-panel" id="settings-panel-${escapeHtml(u.dialerId)}" style="display:none; margin-top:12px;"></div>
            </div>
          `).join('')}
      </div>
      <hr style="margin: 20px 0;">
      <h3>Add subuser</h3>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <input type="text" id="new-subuser-username" placeholder="Username" style="width:140px;">
        <input type="password" id="new-subuser-password" placeholder="Password" style="width:140px;">
        <button type="button" class="btn-primary" id="btn-create-subuser">Create</button>
      </div>
      <p id="subuser-create-status" style="margin-top:8px;"></p>
    `;

    bindSubuserMgmtEvents();
  }

  function bindSubuserMgmtEvents() {
    // Delete subuser
    document.querySelectorAll('.btn-delete-subuser').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const username = btn.dataset.username;
        if (!confirm(`Delete subuser "${username}"? Their dialer will be stopped.`)) return;
        try {
          await api(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
          await renderSubuserMgmt();
        } catch (e) {
          alert(e.message || 'Delete failed');
        }
      });
    });

    // Copy embed iframe code
    document.querySelectorAll('.btn-copy-embed').forEach((btn) => {
      btn.addEventListener('click', () => {
        const token = btn.dataset.token;
        const username = btn.dataset.username;
        const origin = window.location.origin;
        const iframeCode = `<iframe src="${origin}/embed/${token}" width="340" height="220" frameborder="0" style="border-radius:12px;overflow:hidden;" title="${username} Dialer"></iframe>`;
        navigator.clipboard.writeText(iframeCode).then(() => {
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = orig; }, 2000);
        }).catch(() => {
          prompt('Copy this embed code:', iframeCode);
        });
      });
    });

    // Subuser Settings toggle — shows full dialer config panel for that subuser's dialerId
    document.querySelectorAll('.btn-subuser-settings').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const dialerId = btn.dataset.dialerId;
        const panel = document.getElementById(`settings-panel-${dialerId}`);
        if (!panel) return;
        if (panel.style.display !== 'none') {
          panel.style.display = 'none';
          btn.textContent = 'Subuser Settings';
          return;
        }
        btn.textContent = 'Hide Settings';
        // Fetch latest vapi info and config to render the settings panel
        try {
          if (!vapiInfo.assistants?.length) vapiInfo = await api('/api/dialer/vapi-info');
          vapiInfo.uploadList = getUploadList();
          await loadConfig();
          await loadState();
        } catch (_) {}
        panel.style.display = 'block';
        panel.innerHTML = renderDialer(dialerId);
        bindDialerEvents();
      });
    });

    // Create subuser
    document.getElementById('btn-create-subuser')?.addEventListener('click', async () => {
      const username = document.getElementById('new-subuser-username')?.value?.trim();
      const password = document.getElementById('new-subuser-password')?.value;
      const statusEl = document.getElementById('subuser-create-status');
      if (!username || !password) {
        if (statusEl) statusEl.textContent = 'Username and password required.';
        return;
      }
      try {
        const data = await api('/api/admin/users', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });
        if (data.ok) {
          if (statusEl) statusEl.textContent = '';
          await renderSubuserMgmt();
        } else {
          if (statusEl) statusEl.textContent = data.error || 'Failed to create';
        }
      } catch (e) {
        if (statusEl) statusEl.textContent = e.message || 'Failed to create';
      }
    });
  }

  // ──────────────────────────────────────────────────────────
  // Shared event bindings (both admin and subuser)
  // ──────────────────────────────────────────────────────────

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  });

  const btnRefreshSheet = document.getElementById('btn-refresh-sheet');
  if (btnRefreshSheet) {
    btnRefreshSheet.addEventListener('click', () => {
      if (window.__currentSheetUploadId) {
        viewSpreadsheet(window.__currentSheetUploadId);
      } else if (window.__currentSpecialView === 'blacklist') {
        viewBlacklist();
      } else if (window.__currentSpecialView === 'booked') {
        viewBooked();
      }
    });
  }

  const btnFilterSuccess = document.getElementById('btn-filter-success');
  if (btnFilterSuccess) {
    btnFilterSuccess.addEventListener('click', () => {
      filterSuccessOnly = !filterSuccessOnly;
      btnFilterSuccess.textContent = filterSuccessOnly ? 'Show all' : 'Success evaluation True';
      btnFilterSuccess.classList.toggle('btn-primary', filterSuccessOnly);
      btnFilterSuccess.classList.toggle('btn-secondary', !filterSuccessOnly);
      if (window.__currentSheetData) {
        renderSheetTable(window.__currentSheetData.headers, window.__currentSheetData.rows);
      }
    });
  }

  const phoneLookupInput = document.getElementById('phone-lookup-input');
  const phoneLookupResult = document.getElementById('phone-lookup-result');
  const btnPhoneLookup = document.getElementById('btn-phone-lookup');
  if (btnPhoneLookup) btnPhoneLookup.addEventListener('click', runPhoneLookup);
  if (phoneLookupInput) {
    phoneLookupInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runPhoneLookup(); } });
  }
  async function runPhoneLookup() {
    const phone = (phoneLookupInput?.value || '').trim();
    if (!phone) {
      if (phoneLookupResult) phoneLookupResult.innerHTML = '<p class="phone-lookup-msg">Enter a phone number.</p>';
      return;
    }
    if (phone.replace(/\D/g, '').length < 10) {
      if (phoneLookupResult) phoneLookupResult.innerHTML = '<p class="phone-lookup-msg error">Enter at least 10 digits.</p>';
      return;
    }
    if (phoneLookupResult) phoneLookupResult.innerHTML = '<p class="phone-lookup-msg">Searching…</p>';
    try {
      const data = await api(`/api/upload/phone-lookup?phone=${encodeURIComponent(phone)}`);
      const matches = data.matches || [];
      if (matches.length === 0) {
        if (phoneLookupResult) phoneLookupResult.innerHTML = '<p class="phone-lookup-msg">No matches in any spreadsheet.</p>';
        return;
      }
      if (phoneLookupResult) phoneLookupResult.innerHTML = matches.map((m) => {
        const name = [m.firstName, m.lastName].filter(Boolean).join(' ') || '—';
        const address = [m.address, m.city, m.zip].filter(Boolean).join(', ') || '—';
        return `<div class="phone-lookup-card">
          <div class="phone-lookup-name">${escapeHtml(name)}</div>
          <div class="phone-lookup-address">${escapeHtml(address)}</div>
          <div class="phone-lookup-spreadsheet">Found in: ${escapeHtml(m.spreadsheetName)}</div>
        </div>`;
      }).join('');
    } catch (e) {
      if (phoneLookupResult) phoneLookupResult.innerHTML = `<p class="phone-lookup-msg error">${escapeHtml(e.message || 'Search failed')}</p>`;
    }
  }

  const btnPauseAll = document.getElementById('btn-pause-all');
  if (btnPauseAll) {
    btnPauseAll.addEventListener('click', async () => {
      const prevText = btnPauseAll.textContent;
      btnPauseAll.disabled = true;
      btnPauseAll.textContent = 'Pausing…';
      try {
        const data = await api('/api/dialer/pause-all', { method: 'POST' });
        if (data.ok) {
          await loadState();
          refreshDialers();
        } else {
          alert(data.error || 'Failed to pause');
        }
      } catch (e) {
        alert(e.message || 'Failed to pause all');
      } finally {
        btnPauseAll.disabled = false;
        btnPauseAll.textContent = prevText;
      }
    });
  }

  // Admin-only upload/blacklist events (only bound if elements exist)
  const btnUpload = document.getElementById('btn-upload');
  if (btnUpload) {
    btnUpload.addEventListener('click', async () => {
      const input = document.getElementById('file-input');
      if (!input.files?.length) { alert('Select a file first'); return; }
      const form = new FormData();
      form.append('file', input.files[0]);
      const prevText = btnUpload.textContent;
      btnUpload.disabled = true;
      btnUpload.textContent = 'Uploading…';
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: form, credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) { window.location.href = '/'; return; }
        if (!res.ok) { alert(data.error || 'Upload failed'); return; }
        input.value = '';
        const list = await loadUploads();
        window.__uploadList = list;
        renderFileList(list);
        refreshDialers();
      } catch (e) {
        alert(e.message || 'Upload failed (network error)');
      } finally {
        btnUpload.disabled = false;
        btnUpload.textContent = prevText;
      }
    });
  }

  const btnDownloadAll = document.getElementById('btn-download-all');
  if (btnDownloadAll) {
    btnDownloadAll.addEventListener('click', () => { window.location.href = '/api/upload/download-all'; });
  }

  async function updateBlacklistBookedStatus() {
    try {
      const [blacklistStatus, bookedStatus] = await Promise.all([
        api('/api/upload/blacklist/status').catch(() => ({ exists: false, count: 0 })),
        api('/api/upload/booked/status').catch(() => ({ exists: false, count: 0 })),
      ]);
      const blacklistEl = document.getElementById('blacklist-status');
      const bookedEl = document.getElementById('booked-status');
      if (blacklistEl) {
        blacklistEl.textContent = (blacklistStatus.exists && blacklistStatus.count > 0) ? `(${blacklistStatus.count} phone${blacklistStatus.count !== 1 ? 's' : ''})` : '(empty)';
        blacklistEl.style.color = (blacklistStatus.exists && blacklistStatus.count > 0) ? '#666' : '#999';
      }
      if (bookedEl) {
        bookedEl.textContent = (bookedStatus.exists && bookedStatus.count > 0) ? `(${bookedStatus.count} booking${bookedStatus.count !== 1 ? 's' : ''})` : '(empty)';
        bookedEl.style.color = (bookedStatus.exists && bookedStatus.count > 0) ? '#666' : '#999';
      }
    } catch (_) {}
  }

  const btnUploadBlacklist = document.getElementById('btn-upload-blacklist');
  if (btnUploadBlacklist) {
    btnUploadBlacklist.addEventListener('click', () => document.getElementById('blacklist-upload-input').click());
  }
  const blacklistUploadInput = document.getElementById('blacklist-upload-input');
  if (blacklistUploadInput) {
    blacklistUploadInput.addEventListener('change', async () => {
      if (!blacklistUploadInput.files?.length) return;
      const file = blacklistUploadInput.files[0];
      if (file.name.toLowerCase() !== 'blacklist.txt') { alert('File must be named blacklist.txt'); blacklistUploadInput.value = ''; return; }
      const form = new FormData();
      form.append('file', file);
      try {
        const res = await fetch('/api/upload/blacklist/upload', { method: 'POST', body: form, credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) { window.location.href = '/'; return; }
        if (!res.ok) { alert(data.error || 'Upload failed'); return; }
        alert(data.message || 'Blacklist uploaded successfully');
        blacklistUploadInput.value = '';
        updateBlacklistBookedStatus();
      } catch (e) { alert(e.message || 'Upload failed'); }
    });
  }

  const btnUploadBooked = document.getElementById('btn-upload-booked');
  if (btnUploadBooked) {
    btnUploadBooked.addEventListener('click', () => document.getElementById('booked-upload-input').click());
  }
  const bookedUploadInput = document.getElementById('booked-upload-input');
  if (bookedUploadInput) {
    bookedUploadInput.addEventListener('change', async () => {
      if (!bookedUploadInput.files?.length) return;
      const file = bookedUploadInput.files[0];
      const name = file.name.toLowerCase();
      if (name !== 'booked.xlsx' && name !== 'booked.xls') { alert('File must be named booked.xlsx or booked.xls'); bookedUploadInput.value = ''; return; }
      const form = new FormData();
      form.append('file', file);
      try {
        const res = await fetch('/api/upload/booked/upload', { method: 'POST', body: form, credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) { window.location.href = '/'; return; }
        if (!res.ok) { alert(data.error || 'Upload failed'); return; }
        alert(data.message || 'Booked file uploaded successfully');
        bookedUploadInput.value = '';
        updateBlacklistBookedStatus();
      } catch (e) { alert(e.message || 'Upload failed'); }
    });
  }

  const btnViewBlacklist = document.getElementById('btn-view-blacklist');
  if (btnViewBlacklist) btnViewBlacklist.addEventListener('click', (e) => { e.preventDefault(); viewBlacklist(); });

  const btnViewBooked = document.getElementById('btn-view-booked');
  if (btnViewBooked) btnViewBooked.addEventListener('click', (e) => { e.preventDefault(); viewBooked(); });

  const btnUpdateBlacklists = document.getElementById('btn-update-blacklists');
  if (btnUpdateBlacklists) {
    btnUpdateBlacklists.addEventListener('click', async () => {
      const prevText = btnUpdateBlacklists.textContent;
      btnUpdateBlacklists.disabled = true;
      btnUpdateBlacklists.textContent = 'Updating…';
      try {
        const data = await api('/api/upload/update-blacklists', { method: 'POST' });
        if (data.ok) {
          alert(data.message || `Processed ${data.processed} spreadsheet(s).`);
          updateBlacklistBookedStatus();
        } else {
          alert(data.error || 'Update failed');
        }
      } catch (e) {
        alert(e.message || 'Update failed');
      } finally {
        btnUpdateBlacklists.disabled = false;
        btnUpdateBlacklists.textContent = prevText;
      }
    });
  }

  const btnClearBlacklistBooked = document.getElementById('btn-clear-blacklist-booked');
  if (btnClearBlacklistBooked) {
    btnClearBlacklistBooked.addEventListener('click', async () => {
      if (!confirm('Clear blacklist and booked? This cannot be undone.')) return;
      const prevText = btnClearBlacklistBooked.textContent;
      btnClearBlacklistBooked.disabled = true;
      btnClearBlacklistBooked.textContent = 'Clearing…';
      try {
        const data = await api('/api/upload/clear-blacklist-booked', { method: 'POST' });
        if (data.ok) {
          updateBlacklistBookedStatus();
          if (window.__currentSpecialView === 'blacklist' || window.__currentSpecialView === 'booked') {
            document.getElementById('spreadsheet-view-section').style.display = 'none';
            window.__currentSpecialView = null;
          }
          alert(data.message || 'Cleared.');
        } else {
          alert(data.error || 'Clear failed');
        }
      } catch (e) {
        alert(e.message || 'Clear failed');
      } finally {
        btnClearBlacklistBooked.disabled = false;
        btnClearBlacklistBooked.textContent = prevText;
      }
    });
  }

  // ──────────────────────────────────────────────────────────
  // Init
  // ──────────────────────────────────────────────────────────

  async function init() {
    // Check who's logged in
    try {
      const authInfo = await api('/api/auth/check');
      if (!authInfo.authenticated) { window.location.href = '/'; return; }
      currentUser = { role: authInfo.role || 'admin', dialerId: authInfo.dialerId || null, username: authInfo.username || '' };
    } catch (_) {}

    if (currentUser.role === 'subuser') {
      await initSubuser();
    } else {
      await initAdmin();
    }
  }

  async function initAdmin() {
    DIALER_IDS = ['dialer1', 'dialer2', 'dialer3'];
    const list = await loadUploads();
    window.__uploadList = list;
    renderFileList(list);
    await loadConfig();
    await loadState();
    try { await loadVapiInfo(); } catch (_) {}
    refreshDialers();
    updateBlacklistBookedStatus();
    setInterval(updateStatsOnly, 10000);
    // Render subuser management section
    await renderSubuserMgmt();
  }

  async function initSubuser() {
    DIALER_IDS = [currentUser.dialerId];
    // Hide admin-only UI sections
    const uploadSection = document.querySelector('.upload-section');
    if (uploadSection) uploadSection.style.display = 'none';
    const spreadsheetViewSection = document.getElementById('spreadsheet-view-section');
    if (spreadsheetViewSection) spreadsheetViewSection.style.display = 'none';
    // Update header to show username
    const titleEl = document.querySelector('.app-title');
    if (titleEl) titleEl.textContent = `Dialer – ${currentUser.username}`;
    // Load state and render compact dialer
    await loadState();
    refreshDialers();
    setInterval(updateStatsOnly, 10000);
  }

  init();
})();
