// ── TRADE DATA ─────────────────────────────────────────────────
async function loadTrades(from, to) {
  try {
    let path = '/api/trades';
    const params = [];
    if (from) params.push(`from=${from}`);
    if (to) params.push(`to=${to}`);
    if (activeAccountId !== null) params.push(`account_id=${activeAccountId}`);
    if (params.length) path += '?' + params.join('&');
    cachedTrades = await apiFetch(path);
    cachedTrades = cachedTrades.map(t => ({
      ...t,
      pnl: parseFloat(t.pnl),
      date: t.date ? t.date.substring(0, 10) : t.date,
    }));
  } catch (err) {
    console.error('Failed to load trades:', err);
    cachedTrades = [];
  }
}

// ── ALL TRADES TABLE (dashboard) ───────────────────────────────
function renderAllTrades(trades) {
  const tbody = document.getElementById('all-trade-tbody');
  if (!tbody) return;
  const emptyEl = document.getElementById('table-empty');
  let list = [...trades].sort((a, b) => b.date.localeCompare(a.date));
  if (filterFrom) list = list.filter(t => t.date >= filterFrom);
  if (filterTo) list = list.filter(t => t.date <= filterTo);
  if (list.length === 0) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }
  if (emptyEl) emptyEl.classList.add('hidden');
  tbody.innerHTML = list.map(t => `
    <tr>
      <td>${t.date}</td>
      <td><span class="badge ${t.type === 'LONG' ? 'long' : 'short'}">${t.type}</span></td>
      <td class="pnl-cell ${t.pnl >= 0 ? 'pos' : 'neg'}">${fmt(t.pnl)}</td>
      <td>${t.grade ? `<span class="grade-badge g${t.grade.replace('+', 'p')}">${t.grade}</span>` : '—'}</td>
      <td style="color:var(--text3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.notes || '—'}</td>
      <td>
        <button class="action-btn" onclick="openTradeModal('${t.id}')">👁</button>
        <button class="action-btn del" onclick="deleteTrade('${t.id}')">✕</button>
      </td>
    </tr>
  `).join('');
}

async function applyFilter() {
  filterFrom = document.getElementById('filter-from')?.value || null;
  filterTo = document.getElementById('filter-to')?.value || null;
  await loadTrades(filterFrom, filterTo);
  renderStats(cachedTrades);
  renderAllTrades(cachedTrades);
}

async function clearFilter() {
  filterFrom = filterTo = null;
  const ff = document.getElementById('filter-from');
  const ft = document.getElementById('filter-to');
  if (ff) ff.value = '';
  if (ft) ft.value = '';
  await loadTrades();
  renderStats(cachedTrades);
  renderAllTrades(cachedTrades);
}

// ── TRADE MODAL ────────────────────────────────────────────
function setType(val) {
  document.getElementById('f-type').value = val;
  document.querySelectorAll('.type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === val);
  });
}

function setGrade(val) {
  document.getElementById('f-grade').value = val;
  document.querySelectorAll('.grade-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.grade === val);
  });
}

function setMood(val) {
  const el = document.getElementById('f-mental');
  if (el) el.value = val;
  document.querySelectorAll('.mood-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mood === val);
  });
}

function toggleAllAccounts(checked) {
  document.querySelectorAll('.trade-acct-chk').forEach(chk => chk.checked = checked);
}

function handleAccountCheck() {
  const allChk = document.getElementById('acct-all-chk');
  const individualChks = document.querySelectorAll('.trade-acct-chk');
  if (!allChk || individualChks.length === 0) return;
  const allChecked = Array.from(individualChks).every(c => c.checked);
  allChk.checked = allChecked;
}

function setTradeAccounts(idsArray) {
  if (!Array.isArray(idsArray)) idsArray = [];
  document.querySelectorAll('.trade-acct-chk').forEach(chk => {
    chk.checked = idsArray.includes(parseInt(chk.value));
  });
  handleAccountCheck();
}

function renderTradeAccountPicker() {
  const container = document.getElementById('trade-acct-picker');
  if (!container) return;
  const allItem = `<label class="trade-acct-label">
    <input type="checkbox" id="acct-all-chk" onchange="toggleAllAccounts(this.checked)">
    <strong>All Accounts</strong>
  </label>`;
  const items = accounts.map(a => `
    <label class="trade-acct-label">
      <input type="checkbox" class="trade-acct-chk" value="${a.id}" onchange="handleAccountCheck()">
      <span class="acct-item-dot ${a.type}"></span>${a.name}
    </label>`).join('');
  container.innerHTML = allItem + '<div class="trade-acct-list">' + items + '</div>';
  const defaultIds = activeAccountId ? [activeAccountId] : accounts.map(a => a.id);
  setTradeAccounts(defaultIds);
}

// ── IMAGE UPLOAD ───────────────────────────────────────────────
function handleImageUpload(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const MAX_W = 2560, MAX_H = 1440, QUALITY = 1.0;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > MAX_W) { h = Math.round(h * MAX_W / w); w = MAX_W; }
      if (h > MAX_H) { w = Math.round(w * MAX_H / h); h = MAX_H; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        currentTradeBlob = blob;
      }, 'image/webp', QUALITY);
      currentTradeImage = canvas.toDataURL('image/webp', QUALITY);
      showImagePreview(currentTradeImage);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function handleImageDrop(e) {
  e.preventDefault();
  document.getElementById('img-dropzone')?.classList.remove('dragover');
  const file = e.dataTransfer?.files[0];
  if (file && file.type.startsWith('image/')) handleImageUpload(file);
}

function showImagePreview(src) {
  const zone = document.getElementById('img-dropzone');
  const placeholder = document.getElementById('img-placeholder');
  const clearBtn = document.getElementById('img-clear-btn');
  if (!zone) return;
  
  // Remove existing previews and backgrounds
  const existingPreview = zone.querySelector('.trade-img-preview');
  if (existingPreview) existingPreview.remove();
  const existingBg = zone.querySelector('.trade-img-bg');
  if (existingBg) existingBg.remove();

  // Create blurred background
  const bgImg = document.createElement('img');
  bgImg.className = 'trade-img-bg';
  bgImg.src = src;
  zone.appendChild(bgImg);

  // Create main preview image
  const imgEl = document.createElement('img');
  imgEl.className = 'trade-img-preview';
  imgEl.src = src;
  zone.appendChild(imgEl);

  if (placeholder) placeholder.style.display = 'none';
  if (clearBtn) clearBtn.classList.remove('hidden');
}

function clearTradeImage() {
  currentTradeImage = null;
  currentTradeBlob = null;
  const fileInput = document.getElementById('f-image');
  if (fileInput) fileInput.value = '';
  const zone = document.getElementById('img-dropzone');
  const placeholder = document.getElementById('img-placeholder');
  const clearBtn = document.getElementById('img-clear-btn');
  if (zone) { 
    const ex = zone.querySelector('.trade-img-preview'); 
    if (ex) ex.remove(); 
    const bg = zone.querySelector('.trade-img-bg');
    if (bg) bg.remove();
  }
  if (placeholder) placeholder.style.display = '';
  if (clearBtn) clearBtn.classList.add('hidden');
}

function openTradeModal(id) {
  editingId = id || null;
  document.getElementById('modal-title').textContent = id ? 'Edit Trade' : 'Add Trade';
  clearTradeImage();
  renderTradeAccountPicker();
  if (id) {
    const trade = cachedTrades.find(t => String(t.id) === String(id));
    if (trade) {
      document.getElementById('f-date').value = trade.date;
      document.getElementById('f-pnl').value = trade.pnl;
      const riskEl = document.getElementById('f-risk');
      if (riskEl) riskEl.value = trade.initial_risk || '';
      document.getElementById('f-notes').value = trade.notes || '';
      setType(trade.type || 'LONG');
      setGrade(trade.grade || '');
      setMood(trade.mental || '');
      setTradeAccounts(trade.account_ids || []);
      if (trade.image_data) {
        currentTradeImage = trade.image_data;
        showImagePreview(trade.image_data);
      }
    }
  } else {
    document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('f-pnl').value = '';
    const riskEl = document.getElementById('f-risk');
    if (riskEl) riskEl.value = '';
    document.getElementById('f-notes').value = '';
    setType('LONG');
    setGrade('');
    setMood('');
    setTradeAccounts(activeAccountId ? [parseInt(activeAccountId)] : accounts.map(a => a.id));
    document.getElementById('f-grade').value = '';
    document.querySelectorAll('.grade-btn').forEach(b => b.classList.remove('active'));
  }
  document.getElementById('trade-modal').classList.remove('hidden');
}

function closeTradeModal() {
  document.getElementById('trade-modal').classList.add('hidden');
  editingId = null;
  clearTradeImage();
  setMood('');
}

async function saveTrade() {
  const date = document.getElementById('f-date').value;
  const type = document.getElementById('f-type').value;
  const pnl = parseFloat(document.getElementById('f-pnl').value);
  const grade = document.getElementById('f-grade').value || null;
  const notes = document.getElementById('f-notes').value.trim();
  const mental = document.getElementById('f-mental')?.value || null;
  const riskVal = document.getElementById('f-risk')?.value;
  const initial_risk = riskVal ? parseFloat(riskVal) : null;

  const acctChks = document.querySelectorAll('.trade-acct-chk:checked');
  const account_ids = Array.from(acctChks).map(c => parseInt(c.value));

  if (!date || isNaN(pnl)) { alert('Please fill in Date and PnL.'); return; }

  const saveBtn = document.querySelector('#trade-modal .modal-footer .btn-primary');
  const ogSaveBtnText = saveBtn ? saveBtn.textContent : 'Save Trade';
  if (saveBtn) { saveBtn.textContent = 'Uploading Image...'; saveBtn.style.opacity = '0.7'; saveBtn.style.pointerEvents = 'none'; }

  try {
    let finalImageUrl = currentTradeImage || null;

    if (currentTradeBlob) {
      const uploadConf = await apiFetch('/api/upload-url');
      const res = await fetch(uploadConf.uploadUrl, {
        method: 'PUT',
        body: currentTradeBlob,
        headers: { 'Content-Type': 'image/webp' }
      });
      if (!res.ok) throw new Error('Cloud storage upload failed.');
      finalImageUrl = uploadConf.imageUrl;
    }

    const entry_price = 100;
    const exit_price = type === 'LONG' ? +(100 + pnl).toFixed(4) : +(100 - pnl).toFixed(4);
    const position_size = 1;

    const body = {
      date, type, entry_price, exit_price, position_size,
      grade, notes, account_ids, mental, initial_risk, image_data: finalImageUrl
    };
    if (editingId) {
      await apiFetch(`/api/trades/${editingId}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      await apiFetch('/api/trades', { method: 'POST', body: JSON.stringify(body) });
    }
    closeTradeModal();
    await refresh();
  } catch (err) {
    alert('Failed to save trade: ' + err.message);
  } finally {
    if (saveBtn) { saveBtn.textContent = ogSaveBtnText; saveBtn.style.opacity = '1'; saveBtn.style.pointerEvents = 'auto'; }
  }
}


async function deleteTrade(id) {
  if (!confirm('Delete this trade?')) return;
  try {
    await apiFetch(`/api/trades/${id}`, { method: 'DELETE' });
    closeDayModal();
    await refresh();
  } catch (err) {
    alert('Failed to delete trade: ' + err.message);
  }
}

async function refresh() {
  await loadTrades();
  const page = location.pathname.split('/').pop();
  if (page === 'dashboard.html' || page === '') {
    renderStats(cachedTrades);
    renderChart();
    renderAllTrades(cachedTrades);
  } else {
    renderJournal();
  }
}

// ── EXPORT CSV ─────────────────────────────────────────────────
function exportCSV() {
  if (!cachedTrades.length) { alert('No trades to export.'); return; }
  const headers = ['id', 'date', 'type', 'entry_price', 'exit_price', 'position_size', 'pnl', 'notes', 'created_at'];
  const rows = [headers.join(','), ...cachedTrades.map(t =>
    headers.map(h => JSON.stringify(t[h] ?? '')).join(',')
  )];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `trades_${currentUser}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}