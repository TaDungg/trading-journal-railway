/* ================================================================
   TradeLedger — script.js
   Handles: Auth, Trade CRUD, Calendar, Dashboard, Chart, Export
   Storage: localStorage (production would use MySQL via backend)
   ================================================================ */

'use strict';

// ── CONSTANTS ──────────────────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// ── STATE ──────────────────────────────────────────────────────
let currentUser = null;
let currentYear, currentMonth; // for journal calendar view
let editingId = null;
let chartInstance = null;
let activeRange = '30';
let filterFrom = null, filterTo = null;

// ── STORAGE HELPERS ────────────────────────────────────────────
function usersDB() { return JSON.parse(localStorage.getItem('tl_users') || '{}'); }
function tradesDB() {
  const all = JSON.parse(localStorage.getItem('tl_trades') || '{}');
  return all[currentUser] || [];
}
function saveUsers(u) { localStorage.setItem('tl_users', JSON.stringify(u)); }
function saveTrades(arr) {
  const all = JSON.parse(localStorage.getItem('tl_trades') || '{}');
  all[currentUser] = arr;
  localStorage.setItem('tl_trades', JSON.stringify(all));
}
function getSession() { return localStorage.getItem('tl_session'); }
function setSession(u) { localStorage.setItem('tl_session', u); }
function clearSession() { localStorage.removeItem('tl_session'); }

// ── AUTH ───────────────────────────────────────────────────────
function authLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  if (!u || !p) return showAuthError('Fill in all fields.');
  const users = usersDB();
  if (!users[u] || users[u] !== btoa(p)) return showAuthError('Wrong username or password.');
  loginSuccess(u);
}
function authRegister() {
  const u = document.getElementById('reg-user').value.trim();
  const p = document.getElementById('reg-pass').value;
  if (!u || !p) return showAuthError('Fill in all fields.');
  if (p.length < 4) return showAuthError('Password must be at least 4 chars.');
  const users = usersDB();
  if (users[u]) return showAuthError('Username already taken.');
  users[u] = btoa(p);
  saveUsers(users);
  loginSuccess(u);
}
function loginSuccess(u) {
  currentUser = u;
  setSession(u);
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('sidebar-user').textContent = u;
  init();
}
function authLogout() {
  currentUser = null;
  clearSession();
  location.reload();
}
function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// Auth tab switching
document.addEventListener('DOMContentLoaded', () => {
  // Seed demo user
  const users = usersDB();
  if (!users['demo']) { users['demo'] = btoa('demo123'); saveUsers(users); }
  if (!users['demo'].includes('=') && users['demo'] !== btoa('demo123')) {
    users['demo'] = btoa('demo123'); saveUsers(users);
  }

  // Seed demo trades if none
  const allTrades = JSON.parse(localStorage.getItem('tl_trades') || '{}');
  if (!allTrades['demo'] || allTrades['demo'].length === 0) seedDemoTrades();

  // Auth tabs
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.getElementById('auth-login').classList.toggle('hidden', target !== 'login');
      document.getElementById('auth-register').classList.toggle('hidden', target !== 'register');
      document.getElementById('auth-error').classList.add('hidden');
    });
  });

  // Check session
  const session = getSession();
  if (session) {
    currentUser = session;
    document.getElementById('auth-overlay').classList.add('hidden');
    document.getElementById('sidebar-user').textContent = session;
    init();
  }

  // Chart filter buttons (dashboard only)
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeRange = btn.dataset.range;
      renderChart();
    });
  });

  // Theme
  if (localStorage.getItem('tl_theme') === 'light') document.body.classList.add('light');
});

// ── INIT ───────────────────────────────────────────────────────
function init() {
  const page = location.pathname.split('/').pop();
  if (page === 'dashboard.html' || page === '') {
    initDashboard();
  } else {
    initJournal();
  }
}
function initDashboard() {
  const now = new Date();
  const greet = document.getElementById('greeting');
  const h = now.getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  if (greet) greet.textContent = `${g}, ${currentUser}!`;
  renderStats(tradesDB());
  renderChart();
  renderAllTrades(tradesDB());
}
function initJournal() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();
  renderJournal();
}

// ── THEME ──────────────────────────────────────────────────────
function toggleTheme() {
  document.body.classList.toggle('light');
  localStorage.setItem('tl_theme', document.body.classList.contains('light') ? 'light' : 'dark');
  if (chartInstance) renderChart();
}

// ── STATS CARDS ────────────────────────────────────────────────
function calcStats(trades) {
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl < 0);
  const net = trades.reduce((s, t) => s + t.pnl, 0);
  const grossW = wins.reduce((s, t) => s + t.pnl, 0);
  const grossL = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const pf = grossL === 0 ? (grossW > 0 ? Infinity : 0) : +(grossW / grossL).toFixed(2);
  const wr = trades.length ? +((wins.length / trades.length) * 100).toFixed(1) : 0;
  const longs = trades.filter(t => t.type === 'LONG').length;
  const shorts = trades.filter(t => t.type === 'SHORT').length;
  return { net, pf, wr, longs, shorts, total: trades.length };
}
function renderStats(trades) {
  const el = document.getElementById('stats-row');
  if (!el) return;
  const s = calcStats(trades);
  const netClass = s.net > 0 ? 'green' : s.net < 0 ? 'red' : 'neutral';
  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Net PnL</div>
      <div class="stat-value ${netClass}">${fmt(s.net)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Win Rate</div>
      <div class="stat-value ${s.wr >= 50 ? 'green' : 'red'}">${s.wr}%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Profit Factor</div>
      <div class="stat-value ${s.pf >= 1 ? 'green' : 'red'}">${isFinite(s.pf) ? s.pf : '∞'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Trades</div>
      <div class="stat-value neutral">${s.total}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Long</div>
      <div class="stat-value" style="color:var(--accent2)">${s.longs}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Short</div>
      <div class="stat-value" style="color:var(--red)">${s.shorts}</div>
    </div>
  `;
}

// ── JOURNAL / CALENDAR ─────────────────────────────────────────
function renderJournal() {
  const lbl = document.getElementById('month-label');
  if (lbl) lbl.textContent = `${MONTHS[currentMonth]} ${currentYear}`;
  const calLbl = document.getElementById('cal-month-label');
  if (calLbl) calLbl.textContent = `${MONTHS[currentMonth]} ${currentYear}`;
  const trades = tradesDB();
  const monthTrades = trades.filter(t => {
    const d = new Date(t.date + 'T00:00:00');
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  });
  renderStats(monthTrades);
  buildCalendar(trades);
}
function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  renderJournal();
}
function buildCalendar(trades) {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  grid.innerHTML = '';
  // Headers
  DAYS.forEach(d => {
    const cell = document.createElement('div');
    cell.className = 'cal-header-cell';
    cell.textContent = d;
    grid.appendChild(cell);
  });
  const weekHdr = document.createElement('div');
  weekHdr.className = 'cal-header-cell';
  weekHdr.textContent = 'Week PnL';
  grid.appendChild(weekHdr);

  // Build day index
  const dayMap = {};
  trades.forEach(t => {
    const d = new Date(t.date + 'T00:00:00');
    if (d.getFullYear() !== currentYear || d.getMonth() !== currentMonth) return;
    const key = d.getDate();
    if (!dayMap[key]) dayMap[key] = [];
    dayMap[key].push(t);
  });

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  let dayNum = 1;
  let weekPnl = 0;

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    appendEmptyCell(grid);
    if ((i + 1) % 7 === 0) { appendWeekSummary(grid, weekPnl); weekPnl = 0; }
  }

  let col = firstDay;
  while (dayNum <= daysInMonth) {
    const ts = dayMap[dayNum] || [];
    const pnl = ts.reduce((s, t) => s + t.pnl, 0);
    weekPnl += pnl;
    const cell = document.createElement('div');
    cell.className = 'cal-day' + (ts.length === 0 ? ' empty' : pnl > 0 ? ' profit' : ' loss');
    cell.innerHTML = `
      <div class="cal-day-num">${dayNum}</div>
      ${ts.length ? `<div class="cal-pnl ${pnl >= 0 ? 'pos' : 'neg'}">${fmt(pnl)}</div><div class="cal-trade-count">${ts.length} trade${ts.length > 1 ? 's' : ''}</div>` : ''}
    `;
    if (ts.length) cell.addEventListener('click', () => openDayModal(dayNum, ts));
    grid.appendChild(cell);
    col++;
    if (col % 7 === 0) { appendWeekSummary(grid, weekPnl); weekPnl = 0; }
    dayNum++;
  }
  // Fill remaining cells in last row
  const remaining = (7 - (col % 7)) % 7;
  for (let i = 0; i < remaining; i++) appendEmptyCell(grid);
  if (remaining > 0 || col % 7 !== 0) appendWeekSummary(grid, weekPnl);
}
function appendEmptyCell(grid) {
  const cell = document.createElement('div');
  cell.className = 'cal-day empty';
  grid.appendChild(cell);
}
function appendWeekSummary(grid, pnl) {
  const cell = document.createElement('div');
  cell.className = 'cal-week-summary';
  cell.innerHTML = `<div class="week-label">Week</div><div class="week-pnl ${pnl >= 0 ? 'pos' : 'neg'}">${fmt(pnl)}</div>`;
  grid.appendChild(cell);
}

// ── DAY DETAIL MODAL ───────────────────────────────────────────
function openDayModal(day, trades) {
  const d = new Date(currentYear, currentMonth, day);
  document.getElementById('day-modal-title').textContent = `Trades — ${MONTHS[currentMonth]} ${day}, ${currentYear}`;
  const tbody = document.getElementById('day-trade-tbody');
  tbody.innerHTML = trades.map(t => `
    <tr>
      <td><span class="badge ${t.type === 'LONG' ? 'long' : 'short'}">${t.type}</span></td>
      <td class="pnl-cell ${t.pnl >= 0 ? 'pos' : 'neg'}">${fmt(t.pnl)}</td>
      <td>${t.grade ? `<span class="grade-badge g${t.grade.replace('+', 'p')}">${t.grade}</span>` : '—'}</td>
      <td style="color:var(--text3);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.notes || '—'}</td>
      <td>
        <button class="action-btn" onclick="closeDayModal();openTradeModal('${t.id}')">✏</button>
        <button class="action-btn del" onclick="deleteTrade('${t.id}')">✕</button>
      </td>
    </tr>
  `).join('');
  document.getElementById('day-modal').classList.remove('hidden');
}
function closeDayModal() {
  document.getElementById('day-modal').classList.add('hidden');
}

// ── CHART ──────────────────────────────────────────────────────
function renderChart() {
  const canvas = document.getElementById('pnl-chart');
  if (!canvas) return;
  const emptyEl = document.getElementById('chart-empty');
  const trades = tradesDB().sort((a, b) => a.date.localeCompare(b.date));

  // Filter by range
  const now = new Date();
  const filtered = activeRange === 'all' ? trades : trades.filter(t => {
    const days = parseInt(activeRange);
    const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - days);
    return new Date(t.date + 'T00:00:00') >= cutoff;
  });

  if (filtered.length === 0) {
    if (emptyEl) emptyEl.classList.remove('hidden');
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }
  if (emptyEl) emptyEl.classList.add('hidden');

  // Group by date → cumulative
  const dayMap = {};
  filtered.forEach(t => {
    dayMap[t.date] = (dayMap[t.date] || 0) + t.pnl;
  });
  const labels = Object.keys(dayMap).sort();
  let cum = 0;
  const data = labels.map(l => { cum += dayMap[l]; return +cum.toFixed(2); });

  const isLight = document.body.classList.contains('light');
  const gridColor = isLight ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.05)';
  const textColor = isLight ? '#6b7280' : '#555d75';
  const lineColor = data[data.length - 1] >= 0 ? '#4ade80' : '#f87171';
  const fillColor = data[data.length - 1] >= 0
    ? 'rgba(74,222,128,.08)' : 'rgba(248,113,113,.08)';

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: lineColor,
        backgroundColor: fillColor,
        fill: true,
        tension: .4,
        borderWidth: 2,
        pointRadius: data.length > 60 ? 0 : 3,
        pointHoverRadius: 5,
        pointBackgroundColor: lineColor,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isLight ? '#fff' : '#1a1d27',
          borderColor: isLight ? '#dde0eb' : '#252836',
          borderWidth: 1,
          titleColor: isLight ? '#111' : '#e8eaf0',
          bodyColor: isLight ? '#6b7280' : '#8891aa',
          titleFont: { family: 'Syne', weight: '700', size: 12 },
          bodyFont: { family: 'DM Mono', size: 12 },
          callbacks: {
            label: ctx => ` $${ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: 'DM Mono', size: 11 }, maxTicksLimit: 10 }
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { family: 'DM Mono', size: 11 },
            callback: v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0 })
          }
        }
      }
    }
  });
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
        <button class="action-btn" onclick="openTradeModal('${t.id}')">✏</button>
        <button class="action-btn del" onclick="deleteTrade('${t.id}')">✕</button>
      </td>
    </tr>
  `).join('');
}
function applyFilter() {
  filterFrom = document.getElementById('filter-from')?.value || null;
  filterTo = document.getElementById('filter-to')?.value || null;
  const trades = tradesDB();
  renderStats(trades);
  renderAllTrades(trades);
}
function clearFilter() {
  filterFrom = filterTo = null;
  const ff = document.getElementById('filter-from');
  const ft = document.getElementById('filter-to');
  if (ff) ff.value = '';
  if (ft) ft.value = '';
  const trades = tradesDB();
  renderStats(trades);
  renderAllTrades(trades);
}

// ── TRADE MODAL ────────────────────────────────────────────────
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
function openTradeModal(id) {
  editingId = id || null;
  document.getElementById('modal-title').textContent = id ? 'Edit Trade' : 'Add Trade';
  if (id) {
    const trade = tradesDB().find(t => t.id === id);
    if (trade) {
      document.getElementById('f-date').value = trade.date;
      document.getElementById('f-pnl').value = trade.pnl;
      document.getElementById('f-notes').value = trade.notes || '';
      setType(trade.type || 'LONG');
      setGrade(trade.grade || '');
    }
  } else {
    document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('f-pnl').value = '';
    document.getElementById('f-notes').value = '';
    setType('LONG');
    // clear grade
    document.getElementById('f-grade').value = '';
    document.querySelectorAll('.grade-btn').forEach(b => b.classList.remove('active'));
  }
  document.getElementById('trade-modal').classList.remove('hidden');
}
function closeTradeModal() {
  document.getElementById('trade-modal').classList.add('hidden');
  editingId = null;
}
function saveTrade() {
  const date = document.getElementById('f-date').value;
  const type = document.getElementById('f-type').value;
  const pnl = parseFloat(document.getElementById('f-pnl').value);
  const grade = document.getElementById('f-grade').value;
  const notes = document.getElementById('f-notes').value.trim();
  if (!date || isNaN(pnl)) {
    alert('Please fill in Date and PnL.'); return;
  }
  const trades = tradesDB();
  if (editingId) {
    const idx = trades.findIndex(t => t.id === editingId);
    if (idx !== -1) {
      trades[idx] = { ...trades[idx], date, type, pnl: +pnl.toFixed(2), grade, notes };
    }
  } else {
    trades.push({ id: uid(), date, type, pnl: +pnl.toFixed(2), grade, notes, created_at: new Date().toISOString() });
  }
  saveTrades(trades);
  closeTradeModal();
  refresh();
}
function deleteTrade(id) {
  if (!confirm('Delete this trade?')) return;
  const trades = tradesDB().filter(t => t.id !== id);
  saveTrades(trades);
  closeDayModal();
  refresh();
}
function refresh() {
  const page = location.pathname.split('/').pop();
  if (page === 'dashboard.html' || page === '') {
    renderStats(tradesDB());
    renderChart();
    renderAllTrades(tradesDB());
  } else {
    renderJournal();
  }
}

// ── EXPORT CSV ─────────────────────────────────────────────────
function exportCSV() {
  const trades = tradesDB();
  if (!trades.length) { alert('No trades to export.'); return; }
  const headers = ['id', 'date', 'type', 'entry_price', 'exit_price', 'position_size', 'pnl', 'notes', 'created_at'];
  const rows = [headers.join(','), ...trades.map(t =>
    headers.map(h => JSON.stringify(t[h] ?? '')).join(',')
  )];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `trades_${currentUser}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ── UTILS ──────────────────────────────────────────────────────
function fmt(n) { return (n >= 0 ? '+' : '') + n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('$', n >= 0 ? '$' : '-$').replace('--', '-'); }
function fmt2(n) { return n != null ? '$' + parseFloat(n).toFixed(2) : '—'; }
function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36); }

// ── SEED DEMO TRADES ───────────────────────────────────────────
function seedDemoTrades() {
  const now = new Date();
  const data = [];
  // generate 3 months of trades
  for (let i = 90; i >= 0; i--) {
    if (Math.random() < 0.45) continue; // ~55% days have trades
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const numTrades = Math.floor(Math.random() * 3) + 1;
    for (let j = 0; j < numTrades; j++) {
      const type = Math.random() > 0.5 ? 'LONG' : 'SHORT';
      const entry = +(100 + Math.random() * 400).toFixed(2);
      const move = (Math.random() * 10 - 4); // bias slightly positive
      const exit = +(entry + move).toFixed(2);
      const size = +(Math.random() * 5 + 0.5).toFixed(2);
      const pnl = type === 'LONG' ? +((exit - entry) * size).toFixed(2) : +((entry - exit) * size).toFixed(2);
      data.push({ id: uid(), date, type, entry_price: entry, exit_price: exit, position_size: size, pnl, notes: '', created_at: new Date().toISOString() });
    }
  }
  const all = JSON.parse(localStorage.getItem('tl_trades') || '{}');
  all['demo'] = data;
  localStorage.setItem('tl_trades', JSON.stringify(all));
}