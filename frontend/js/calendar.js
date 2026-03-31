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