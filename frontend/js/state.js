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
let currentTradeBlob = null;

// ── UTILS ──────────────────────────────────────────────────────
function fmt(n) { return (n >= 0 ? '+' : '') + n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace('$', n >= 0 ? '$' : '-$').replace('--', '-'); }
function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36); }