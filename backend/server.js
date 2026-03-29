/**
 * TradeLedger — backend/server.js (PostgreSQL / Railway)
 *
 * Install: npm install express pg cors bcryptjs jsonwebtoken dotenv
 * Run:     node server.js
 */

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'tradeledger_secret_change_me';

// ── MIDDLEWARE ──────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// ── POSTGRESQL CONFIG ───────────────────────────────────────────
// Railway injects DATABASE_URL automatically
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// ── AUTH MIDDLEWARE ─────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.userId = jwt.verify(token, JWT_SECRET).userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── AUTH ROUTES ─────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  if (password.length < 4) return res.status(400).json({ error: 'Password too short' });
  try {
    const check = await pool.query(
      'SELECT id FROM users WHERE username = $1', [username]
    );
    if (check.rows.length) return res.status(409).json({ error: 'Username taken' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, created_at) VALUES ($1, $2, NOW()) RETURNING id',
      [username, hash]
    );
    const userId = result.rows[0].id;
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error', detail: err.detail || null, code: err.code || null });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1', [username]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error', detail: err.detail || null, code: err.code || null });
  }
});

// ── TRADE ROUTES ────────────────────────────────────────────────
app.get('/api/trades', authMiddleware, async (req, res) => {
  const { from, to } = req.query;
  try {
    const params = [req.userId];
    let query = 'SELECT * FROM trades WHERE user_id = $1';
    if (from) { params.push(from); query += ` AND date >= $${params.length}`; }
    if (to) { params.push(to); query += ` AND date <= $${params.length}`; }
    query += ' ORDER BY date DESC, created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error', detail: err.detail || null, code: err.code || null });
  }
});

app.post('/api/trades', authMiddleware, async (req, res) => {
  const { date, type, entry_price, exit_price, position_size, grade, notes } = req.body;
  if (!date || !type || entry_price == null || exit_price == null)
    return res.status(400).json({ error: 'Missing required fields' });
  const size = position_size || 1;
  const pnl = type === 'LONG'
    ? +((exit_price - entry_price) * size).toFixed(2)
    : +((entry_price - exit_price) * size).toFixed(2);
  try {
    const result = await pool.query(
      `INSERT INTO trades (user_id, date, type, entry_price, exit_price, position_size, pnl, grade, notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING *`,
      [req.userId, date, type, entry_price, exit_price, size, pnl, grade || null, notes || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error', detail: err.detail || null, code: err.code || null });
  }
});

app.put('/api/trades/:id', authMiddleware, async (req, res) => {
  const { date, type, entry_price, exit_price, position_size, grade, notes } = req.body;
  const size = position_size || 1;
  const pnl = type === 'LONG'
    ? +((exit_price - entry_price) * size).toFixed(2)
    : +((entry_price - exit_price) * size).toFixed(2);
  try {
    const result = await pool.query(
      `UPDATE trades
       SET date=$1, type=$2, entry_price=$3, exit_price=$4,
           position_size=$5, pnl=$6, grade=$7, notes=$8
       WHERE id=$9 AND user_id=$10
       RETURNING *`,
      [date, type, entry_price, exit_price, size, pnl, grade || null, notes || '', req.params.id, req.userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Trade not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error', detail: err.detail || null, code: err.code || null });
  }
});

app.delete('/api/trades/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM trades WHERE id=$1 AND user_id=$2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Trade not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error', detail: err.detail || null, code: err.code || null });
  }
});

app.get('/api/stats', authMiddleware, async (req, res) => {
  const { from, to } = req.query;
  try {
    const params = [req.userId];
    let query = 'SELECT * FROM trades WHERE user_id = $1';
    if (from) { params.push(from); query += ` AND date >= $${params.length}`; }
    if (to) { params.push(to); query += ` AND date <= $${params.length}`; }
    const { rows } = await pool.query(query, params);

    const wins = rows.filter(t => t.pnl > 0);
    const losses = rows.filter(t => t.pnl < 0);
    const net = rows.reduce((s, t) => s + parseFloat(t.pnl), 0);
    const grossW = wins.reduce((s, t) => s + parseFloat(t.pnl), 0);
    const grossL = Math.abs(losses.reduce((s, t) => s + parseFloat(t.pnl), 0));

    res.json({
      total: rows.length,
      wins: wins.length,
      losses: losses.length,
      win_rate: rows.length ? +((wins.length / rows.length) * 100).toFixed(1) : 0,
      profit_factor: grossL === 0 ? null : +(grossW / grossL).toFixed(2),
      net_pnl: +net.toFixed(2),
      longs: rows.filter(t => t.type === 'LONG').length,
      shorts: rows.filter(t => t.type === 'SHORT').length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Server error', detail: err.detail || null, code: err.code || null });
  }
});

// Health check for Railway
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ── START ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`TradeLedger API (PostgreSQL) running on http://localhost:${PORT}`);
});
