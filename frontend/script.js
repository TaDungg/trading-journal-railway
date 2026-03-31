/* ================================================================
   TradeLedger — script.js
   Handles: Auth (JWT), Trade CRUD via REST API, Calendar, Dashboard, Chart, Export
   Backend: Railway PostgreSQL API
   ================================================================ */

'use strict';

// ── API CONFIG ─────────────────────────────────────────────────
const API_URL = 'https://trading-journal-railway-production.up.railway.app';

// ── CONSTANTS ──────────────────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// ── STATE ──────────────────────────────────────────────────────
let currentUser = null;
let authToken = null;
let currentYear, currentMonth;
let editingId = null;
let chartInstance = null;
let lsChartInstance = null;
let activeRange = '30';
let filterFrom = null, filterTo = null;
let cachedTrades = [];
let accounts = [];
let activeAccountId = null;
let currentTradeImage = null;

// ── TOKEN HELPERS ──────────────────────────────────────────────
function getToken() { return localStorage.getItem('tl_token'); }
function setToken(t) { localStorage.setItem('tl_token', t); }
function clearToken() { localStorage.removeItem('tl_token'); localStorage.removeItem('tl_user'); }
function getStoredUser() { return localStorage.getItem('tl_user'); }
function setStoredUser(u) { localStorage.setItem('tl_user', u); }

// ── API HELPERS ────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(API_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
}

// ── AUTH ───────────────────────────────────────────────────────
async function authLogin() {
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value;
  if (!u || !p) return showAuthError('Fill in all fields.');
  try {
    showAuthError('Signing in…', false);
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: u, password: p }),
    });
    loginSuccess(data.token, data.username);
  } catch (err) {
    showAuthError(err.message || 'Login failed.');
  }
}

async function authRegister() {
  const u = document.getElementById('reg-user').value.trim();
  const p = document.getElementById('reg-pass').value;
  if (!u || !p) return showAuthError('Fill in all fields.');
  if (p.length < 4) return showAuthError('Password must be at least 4 chars.');
  try {
    showAuthError('Creating account…', false);
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: u, password: p }),
    });
    loginSuccess(data.token, data.username);
  } catch (err) {
    showAuthError(err.message || 'Registration failed.');
  }
}

function loginSuccess(token, username) {
  authToken = token;
  currentUser = username;
  setToken(token);
  setStoredUser(username);
  document.getElementById('auth-overlay').classList.add('hidden');
  document.getElementById('sidebar-user').textContent = username;
  init();
}

function authLogout() {
  currentUser = null;
  authToken = null;
  clearToken();
  location.reload();
}

function showAuthError(msg, isError = true) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.color = isError ? 'var(--red)' : 'var(--text3)';
}

// ── INIT ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
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

  // Check stored session
  const token = getToken();
  const user = getStoredUser();
  if (token && user) {
    authToken = token;
    currentUser = user;
    document.getElementById('auth-overlay').classList.add('hidden');
    document.getElementById('sidebar-user').textContent = user;
    init();
  }

  // Chart filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeRange = btn.dataset.range;
      renderChart();
    });
  });

  // Close account dropdown when clicking outside
  document.addEventListener('click', e => {
    const sel = document.getElementById('acct-selector');
    if (sel && !sel.contains(e.target)) {
      document.getElementById('acct-dropdown')?.classList.add('hidden');
      sel.classList.remove('open');
    }
  });

  // Theme
  if (localStorage.getItem('tl_theme') === 'light') document.body.classList.add('light');
});

function init() {
  const page = location.pathname.split('/').pop();
  if (page === 'dashboard.html' || page === '') {
    initDashboard();
  } else {
    initJournal();
  }
}

async function initDashboard() {
  const now = new Date();
  const greet = document.getElementById('greeting');
  const h = now.getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  if (greet) greet.textContent = `${g}, ${currentUser}!`;
  await loadAccounts();
  renderAccountSelector();
  await loadTrades();
  renderStats(cachedTrades);
  renderChart();
  renderAllTrades(cachedTrades);
}

async function initJournal() {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();
  await loadAccounts();
  renderAccountSelector();
  await loadTrades();
  renderJournal();
}

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

// ── THEME ──────────────────────────────────────────────────────
function toggleTheme() {
  document.body.classList.toggle('light');
  localStorage.setItem('tl_theme', document.body.classList.contains('light') ? 'light' : 'dark');
  if (chartInstance) renderChart();
  renderStats(cachedTrades);
}

// ── ACCOUNTS ───────────────────────────────────────────────────
async function loadAccounts() {
  try {
    accounts = await apiFetch('/api/accounts');
  } catch (err) {
    console.error('Failed to load accounts:', err);
    accounts = [];
  }
}

function renderAccountSelector() {
  const list = document.getElementById('acct-list');
  const btnLabel = document.getElementById('acct-btn-label');
  if (!list) return;

  const active = accounts.find(a => String(a.id) === String(activeAccountId));
  if (btnLabel) btnLabel.textContent = active ? active.name : 'All Accounts';

  const allItem = `
    <div class="acct-item${activeAccountId === null ? ' active' : ''}" onclick="selectAccount(null)">
      <span class="acct-item-dot all"></span>
      <div class="acct-item-info">
        <div class="acct-item-name">All Accounts</div>
        <div class="acct-item-meta">${accounts.length} account${accounts.length !== 1 ? 's' : ''}</div>
      </div>
    </div>`;

  const items = accounts.map(a => `
    <div class="acct-item${String(a.id) === String(activeAccountId) ? ' active' : ''}" onclick="selectAccount(${a.id})">
      <span class="acct-item-dot ${a.type}"></span>
      <div class="acct-item-info">
        <div class="acct-item-name">${a.name}</div>
        <div class="acct-item-meta">${a.type === 'prop' ? '🏆 Prop Firm' : '💼 Live'} · $${Number(a.size).toLocaleString()}</div>
      </div>
    </div>`).join('');

  list.innerHTML = allItem + items;
}

function toggleAccountDropdown() {
  const dd = document.getElementById('acct-dropdown');
  const sel = document.getElementById('acct-selector');
  if (!dd) return;
  const isOpen = !dd.classList.contains('hidden');
  if (isOpen) {
    dd.classList.add('hidden');
    sel?.classList.remove('open');
  } else {
    renderAccountSelector();
    dd.classList.remove('hidden');
    sel?.classList.add('open');
  }
}

async function selectAccount(id) {
  activeAccountId = id;
  renderAccountSelector();
  document.getElementById('acct-dropdown')?.classList.add('hidden');
  document.getElementById('acct-selector')?.classList.remove('open');
  await refresh();
}

function openAccountModal() {
  document.getElementById('acct-dropdown')?.classList.add('hidden');
  document.getElementById('acct-selector')?.classList.remove('open');
  const nameEl = document.getElementById('acct-name');
  const sizeEl = document.getElementById('acct-size');
  if (nameEl) nameEl.value = '';
  if (sizeEl) sizeEl.value = '';
  const typeEl = document.getElementById('acct-type');
  if (typeEl) typeEl.value = 'live';
  document.querySelectorAll('.acct-type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === 'live');
  });
  document.getElementById('account-modal')?.classList.remove('hidden');
}

function closeAccountModal() {
  document.getElementById('account-modal')?.classList.add('hidden');
}

function setAccountType(val) {
  const typeEl = document.getElementById('acct-type');
  if (typeEl) typeEl.value = val;
  document.querySelectorAll('.acct-type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === val);
  });
}

async function saveAccount() {
  const name = document.getElementById('acct-name')?.value.trim();
  const type = document.getElementById('acct-type')?.value || 'live';
  const size = parseFloat(document.getElementById('acct-size')?.value) || 0;
  if (!name) { alert('Please enter an account name.'); return; }
  try {
    const newAcct = await apiFetch('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({ name, type, size }),
    });
    accounts.push(newAcct);
    closeAccountModal();
    await selectAccount(newAcct.id);
  } catch (err) {
    alert('Failed to create account: ' + err.message);
  }
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
  const avgWin = wins.length ? +(grossW / wins.length).toFixed(2) : 0;
  const avgLoss = losses.length ? +(grossL / losses.length).toFixed(2) : 0;
  const avgRR = (avgWin > 0 && avgLoss > 0) ? +(avgWin / avgLoss).toFixed(2) : null;
  return { net, pf, wr, longs, shorts, total: trades.length, avgWin, avgLoss, avgRR, grossW };
}

function renderStats(trades) {
  const el = document.getElementById('stats-row');
  if (!el) return;
  const s = calcStats(trades);
  const netClass = s.net > 0 ? 'green' : s.net < 0 ? 'red' : 'neutral';
  const rrClass = s.avgRR !== null ? (s.avgRR >= 1 ? 'green' : 'red') : 'neutral';
  const rrDisplay = s.avgRR !== null ? s.avgRR + 'R' : '—';
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
      <div class="stat-label">Avg Win</div>
      <div class="stat-value green">${s.avgWin > 0 ? fmt(s.avgWin) : '—'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg Loss</div>
      <div class="stat-value red">${s.avgLoss > 0 ? fmt(-s.avgLoss) : '—'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg R:R</div>
      <div class="stat-value ${rrClass}">${rrDisplay}</div>
    </div>
    <div class="stat-card donut-card">
      <div class="stat-label">Long vs Short</div>
      <canvas id="ls-donut" width="72" height="72"></canvas>
    </div>
  `;
  renderLSDonut(s.longs, s.shorts);
  renderEdgePanel(trades, s);
}

function renderLSDonut(longs, shorts) {
  const canvas = document.getElementById('ls-donut');
  if (!canvas || typeof Chart === 'undefined') return;
  if (lsChartInstance) { lsChartInstance.destroy(); lsChartInstance = null; }
  const total = longs + shorts;
  const isLight = document.body.classList.contains('light');
  lsChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: [`Long: ${longs}`, `Short: ${shorts}`],
      datasets: [{
        data: total === 0 ? [1, 1] : [longs || 0.001, shorts || 0.001],
        backgroundColor: total === 0
          ? ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.07)']
          : ['#4ade80', '#f87171'],
        borderWidth: 0,
        hoverOffset: 6,
        clip: false,
      }],
    },
    options: {
      cutout: '68%',
      responsive: false,
      layout: { padding: { top: 2, bottom: 2, left: 2, right: 2 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: total > 0,
          backgroundColor: isLight ? '#fff' : '#1a1d27',
          borderColor: isLight ? '#dde0eb' : '#252836',
          borderWidth: 1,
          titleColor: isLight ? '#111' : '#e8eaf0',
          bodyColor: isLight ? '#4b5563' : '#8891aa',
          padding: 10,
          displayColors: true,
          xAlign: 'center',
          yAlign: 'bottom',
          callbacks: {
            title: () => '',
            label: ctx => `  ${ctx.label} trades`,
          },
        },
      },
    },
  });
}

// ── EDGE & CONSISTENCY PANEL ───────────────────────────────────
let edgeRadarInstance = null;

function renderEdgePanel(trades, stats) {
  const consistencyEl = document.getElementById('consistency-score');
  const canvas = document.getElementById('edgeRadarChart');
  if (!consistencyEl || !canvas) return;

  // 1. Consistency Score: Best Day / Total Net Profit * 100
  const dayPnl = {};
  trades.forEach(t => {
    dayPnl[t.date] = (dayPnl[t.date] || 0) + t.pnl;
  });

  const dailyPnls = Object.values(dayPnl);
  const bestDay = dailyPnls.length ? Math.max(...dailyPnls, 0) : 0;

  let consistency = 0;
  if (stats.net > 0 && bestDay > 0) {
    consistency = (bestDay / stats.net) * 100;
  }

  consistencyEl.innerHTML = stats.net > 0 ? `${consistency.toFixed(1)}<span>%</span>` : '--<span>%</span>';

  // Color the consistency based on prop firm strictness (e.g. <30% is great, >50% is bad)
  if (stats.net > 0) {
    consistencyEl.style.color = consistency < 30 ? 'var(--green)' : consistency > 50 ? 'var(--red)' : 'var(--text)';
  } else {
    consistencyEl.style.color = 'var(--text)';
  }

  // 2. Edge Radar Metrics
  const winRateScore = stats.wr || 0;
  const pfRaw = isFinite(stats.pf) ? stats.pf : (stats.grossW > 0 ? 3 : 0);
  const pfScore = Math.min(100, (pfRaw / 3) * 100);
  const rrRaw = stats.avgRR || 0;
  const rrScore = Math.min(100, (rrRaw / 3) * 100);

  if (edgeRadarInstance) { edgeRadarInstance.destroy(); }

  const isLight = document.body.classList.contains('light');
  const textColor = isLight ? '#4b5563' : '#8891aa';
  const gridColor = isLight ? 'rgba(0,0,0,.08)' : 'rgba(255,255,255,.05)';
  const brandColor = '#4ade80';

  edgeRadarInstance = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: ['Win %', 'Profit Factor', 'Avg W/L'],
      datasets: [{
        data: trades.length ? [winRateScore, pfScore, rrScore] : [0, 0, 0],
        backgroundColor: 'rgba(74, 222, 128, 0.15)',
        borderColor: brandColor,
        pointBackgroundColor: brandColor,
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: brandColor,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          angleLines: { color: gridColor },
          grid: { color: gridColor },
          pointLabels: { color: textColor, font: { family: "'DM Mono', monospace", size: 10 } },
          ticks: { display: false, min: 0, max: 100, stepSize: 20 }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isLight ? '#fff' : '#1a1d27',
          borderColor: isLight ? '#dde0eb' : '#252836',
          borderWidth: 1,
          titleColor: isLight ? '#111' : '#e8eaf0',
          bodyColor: isLight ? '#4b5563' : '#8891aa',
          callbacks: {
            title: () => 'Metric Detail',
            label: (ctx) => {
              if (ctx.dataIndex === 0) return `  Win Rate: ${stats.wr}%`;
              if (ctx.dataIndex === 1) return `  Profit Factor: ${isFinite(stats.pf) ? stats.pf : '∞'}`;
              if (ctx.dataIndex === 2) return `  Avg W/L: ${stats.avgRR || 0}R`;
            }
          }
        }
      }
    }
  });
}

// ── JOURNAL / CALENDAR ─────────────────────────────────────────
function renderJournal() {
  const lbl = document.getElementById('month-label');
  if (lbl) lbl.textContent = `${MONTHS[currentMonth]} ${currentYear}`;
  const calLbl = document.getElementById('cal-month-label');
  if (calLbl) calLbl.textContent = `${MONTHS[currentMonth]} ${currentYear}`;
  const monthTrades = cachedTrades.filter(t => {
    const d = new Date(t.date + 'T00:00:00');
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  });
  renderStats(monthTrades);
  buildCalendar(cachedTrades);
}

async function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  renderJournal();
}

function buildCalendar(trades) {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  grid.innerHTML = '';
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
    const clickedDay = dayNum;
    if (ts.length) cell.addEventListener('click', () => openDayModal(clickedDay, ts));
    grid.appendChild(cell);
    col++;
    if (col % 7 === 0) { appendWeekSummary(grid, weekPnl); weekPnl = 0; }
    dayNum++;
  }
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
  document.getElementById('day-modal-title').textContent = `Trades — ${MONTHS[currentMonth]} ${day}, ${currentYear}`;
  const tbody = document.getElementById('day-trade-tbody');
  tbody.innerHTML = trades.map(t => `
    <tr>
      <td><span class="badge ${t.type === 'LONG' ? 'long' : 'short'}">${t.type}</span></td>
      <td class="pnl-cell ${t.pnl >= 0 ? 'pos' : 'neg'}">${fmt(t.pnl)}</td>
      <td>${t.grade ? `<span class="grade-badge g${t.grade.replace('+', 'p')}">${t.grade}</span>` : '—'}</td>
      <td style="color:var(--text3);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.notes || '—'}</td>
      <td>
        <button class="action-btn" onclick="closeDayModal();openTradeModal('${t.id}')">👁</button>
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
  const trades = [...cachedTrades].sort((a, b) => a.date.localeCompare(b.date));

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

  const dayMap = {};
  filtered.forEach(t => { dayMap[t.date] = (dayMap[t.date] || 0) + t.pnl; });
  const labels = Object.keys(dayMap).sort();
  let cum = 0;
  const data = labels.map(l => { cum += dayMap[l]; return +cum.toFixed(2); });

  const isLight = document.body.classList.contains('light');
  const gridColor = isLight ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.05)';
  const textColor = isLight ? '#6b7280' : '#555d75';
  const lineColor = data[data.length - 1] >= 0 ? '#4ade80' : '#f87171';
  const fillColor = data[data.length - 1] >= 0 ? 'rgba(74,222,128,.08)' : 'rgba(248,113,113,.08)';

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

  const image_data = currentTradeImage || null;

  if (!date || isNaN(pnl)) { alert('Please fill in Date and PnL.'); return; }

  const entry_price = 100;
  const exit_price = type === 'LONG' ? +(100 + pnl).toFixed(4) : +(100 - pnl).toFixed(4);
  const position_size = 1;

  try {
    const body = {
      date, type, entry_price, exit_price, position_size,
      grade, notes, account_ids, mental, initial_risk, image_data
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

// ── UTILS ──────────────────────────────────────────────────────
function fmt(n) { return (n >= 0 ? '+' : '') + n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('$', n >= 0 ? '$' : '-$').replace('--', '-'); }
function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36); }