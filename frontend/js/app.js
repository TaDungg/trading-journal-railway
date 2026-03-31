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

// ── THEME ──────────────────────────────────────────────────────
function toggleTheme() {
  document.body.classList.toggle('light');
  localStorage.setItem('tl_theme', document.body.classList.contains('light') ? 'light' : 'dark');
  if (chartInstance) renderChart();
  renderStats(cachedTrades);
}