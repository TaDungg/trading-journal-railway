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