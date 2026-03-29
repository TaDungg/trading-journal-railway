/**
 * TradeLedger — backend/server.js (SQL Server version)
 *
 * Install: npm install express mssql cors bcryptjs jsonwebtoken dotenv
 * Run:     node server.js
 */

const express = require('express');
const sql = require('mssql');
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

// ── SQL SERVER CONFIG ───────────────────────────────────────────
const dbConfig = {
  server: process.env.DB_HOST || 'MSI\\SQLEXPRESS',
  database: process.env.DB_NAME || 'tradeledger',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    trustedConnection: true       // ← dùng Windows Authentication
  }
};

let pool;
async function getPool() {
  if (!pool) pool = await sql.connect(dbConfig);
  return pool;
}

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
    const db = await getPool();
    const check = await db.request()
      .input('username', sql.NVarChar, username)
      .query('SELECT id FROM users WHERE username = @username');
    if (check.recordset.length) return res.status(409).json({ error: 'Username taken' });

    const hash = await bcrypt.hash(password, 10);
    const result = await db.request()
      .input('username', sql.NVarChar, username)
      .input('hash', sql.NVarChar, hash)
      .query('INSERT INTO users (username, password_hash) OUTPUT INSERTED.id VALUES (@username, @hash)');

    const userId = result.recordset[0].id;
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const db = await getPool();
    const result = await db.request()
      .input('username', sql.NVarChar, username)
      .query('SELECT * FROM users WHERE username = @username');
    if (!result.recordset.length) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.recordset[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── TRADE ROUTES ────────────────────────────────────────────────
app.get('/api/trades', authMiddleware, async (req, res) => {
  const { from, to } = req.query;
  try {
    const db = await getPool();
    const req2 = db.request().input('userId', sql.Int, req.userId);
    let query = 'SELECT * FROM trades WHERE user_id = @userId';
    if (from) { req2.input('from', sql.Date, from); query += ' AND date >= @from'; }
    if (to) { req2.input('to', sql.Date, to); query += ' AND date <= @to'; }
    query += ' ORDER BY date DESC, created_at DESC';
    const result = await req2.query(query);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/trades', authMiddleware, async (req, res) => {
  const { date, type, entry_price, exit_price, position_size, notes } = req.body;
  if (!date || !type || entry_price == null || exit_price == null)
    return res.status(400).json({ error: 'Missing required fields' });
  const size = position_size || 1;
  const pnl = type === 'LONG'
    ? +((exit_price - entry_price) * size).toFixed(2)
    : +((entry_price - exit_price) * size).toFixed(2);
  try {
    const db = await getPool();
    const result = await db.request()
      .input('userId', sql.Int, req.userId)
      .input('date', sql.Date, date)
      .input('type', sql.NVarChar(5), type)
      .input('entry', sql.Decimal(18, 4), entry_price)
      .input('exit', sql.Decimal(18, 4), exit_price)
      .input('size', sql.Decimal(18, 4), size)
      .input('pnl', sql.Decimal(18, 4), pnl)
      .input('notes', sql.NVarChar(sql.MAX), notes || '')
      .query(`INSERT INTO trades (user_id,date,type,entry_price,exit_price,position_size,pnl,notes)
              OUTPUT INSERTED.*
              VALUES (@userId,@date,@type,@entry,@exit,@size,@pnl,@notes)`);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/trades/:id', authMiddleware, async (req, res) => {
  const { date, type, entry_price, exit_price, position_size, notes } = req.body;
  const size = position_size || 1;
  const pnl = type === 'LONG'
    ? +((exit_price - entry_price) * size).toFixed(2)
    : +((entry_price - exit_price) * size).toFixed(2);
  try {
    const db = await getPool();
    const result = await db.request()
      .input('id', sql.Int, req.params.id)
      .input('userId', sql.Int, req.userId)
      .input('date', sql.Date, date)
      .input('type', sql.NVarChar(5), type)
      .input('entry', sql.Decimal(18, 4), entry_price)
      .input('exit', sql.Decimal(18, 4), exit_price)
      .input('size', sql.Decimal(18, 4), size)
      .input('pnl', sql.Decimal(18, 4), pnl)
      .input('notes', sql.NVarChar(sql.MAX), notes || '')
      .query(`UPDATE trades
              SET date=@date, type=@type, entry_price=@entry, exit_price=@exit,
                  position_size=@size, pnl=@pnl, notes=@notes
              OUTPUT INSERTED.*
              WHERE id=@id AND user_id=@userId`);
    if (!result.recordset.length) return res.status(404).json({ error: 'Trade not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/trades/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input('id', sql.Int, req.params.id)
      .input('userId', sql.Int, req.userId)
      .query('DELETE FROM trades OUTPUT DELETED.id WHERE id=@id AND user_id=@userId');
    if (!result.recordset.length) return res.status(404).json({ error: 'Trade not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/stats', authMiddleware, async (req, res) => {
  const { from, to } = req.query;
  try {
    const db = await getPool();
    const req2 = db.request().input('userId', sql.Int, req.userId);
    let query = 'SELECT * FROM trades WHERE user_id = @userId';
    if (from) { req2.input('from', sql.Date, from); query += ' AND date >= @from'; }
    if (to) { req2.input('to', sql.Date, to); query += ' AND date <= @to'; }
    const { recordset: rows } = await req2.query(query);

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
    res.status(500).json({ error: 'Server error' });
  }
});

// ── START ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`TradeLedger API (SQL Server) running on http://localhost:${PORT}`);
});