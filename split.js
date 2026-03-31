const fs = require('fs');

const content = fs.readFileSync('./frontend/script.js', 'utf-8');

function extract(startStr, endStr) {
  const start = content.indexOf(startStr);
  if (start === -1) return '';
  const end = endStr ? content.indexOf(endStr, start) : content.length;
  if (end === -1) return content.slice(start);
  return content.slice(start, end).trim();
}

const state = extract('// ── API CONFIG', '// ── TOKEN HELPERS');
const apiTokens = extract('// ── TOKEN HELPERS', '// ── AUTH');
const authCode = extract('// ── AUTH', '// ── INIT');
const initCode = extract('// ── INIT', '// ── TRADE DATA');
const tradeData = extract('// ── TRADE DATA', '// ── THEME');
const themeCode = extract('// ── THEME', '// ── ACCOUNTS');
const acctCode = extract('// ── ACCOUNTS', '// ── STATS CARDS');
const statsCode = extract('// ── STATS CARDS', '// ── EDGE & CONSISTENCY PANEL');
const edgeCode = extract('// ── EDGE & CONSISTENCY PANEL', '// ── JOURNAL / CALENDAR');
const calCode = extract('// ── JOURNAL / CALENDAR', '// ── CHART');
const chartCode = extract('// ── CHART', '// ── ALL TRADES TABLE (dashboard)');
const tableCode = extract('// ── ALL TRADES TABLE (dashboard)', '// ── TRADE MODAL');
const modalCode = extract('// ── TRADE MODAL', '// ── IMAGE UPLOAD');
const uploadCode = extract('// ── IMAGE UPLOAD', '// ── UTILS');
const utilsCode = extract('// ── UTILS', null); // goes to end of file

fs.mkdirSync('./frontend/js', { recursive: true });

fs.writeFileSync('./frontend/js/state.js', state + '\n\n' + utilsCode);
fs.writeFileSync('./frontend/js/api.js', apiTokens);
fs.writeFileSync('./frontend/js/auth.js', authCode);
fs.writeFileSync('./frontend/js/accounts.js', acctCode);
fs.writeFileSync('./frontend/js/stats.js', statsCode + '\n\n' + edgeCode);
fs.writeFileSync('./frontend/js/calendar.js', calCode);
fs.writeFileSync('./frontend/js/charts.js', chartCode);
fs.writeFileSync('./frontend/js/trades.js', tradeData + '\n\n' + tableCode + '\n\n' + modalCode + '\n\n' + uploadCode);
fs.writeFileSync('./frontend/js/app.js', initCode + '\n\n' + themeCode);

console.log('Successfully split files!');
