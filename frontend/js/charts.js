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