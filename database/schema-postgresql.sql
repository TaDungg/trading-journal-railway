-- ================================================================
-- TradeLedger — PostgreSQL Schema (Railway-ready)
-- Run this in Railway's Query tab or psql
-- ================================================================

-- ── USERS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL        PRIMARY KEY,
    username      VARCHAR(64)   NOT NULL UNIQUE,
    password_hash VARCHAR(255)  NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Demo seed user (password: demo123 — bcrypt hash)
INSERT INTO users (username, password_hash)
VALUES ('demo', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy')
ON CONFLICT (username) DO NOTHING;

-- ── TRADES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
    id             SERIAL         PRIMARY KEY,
    user_id        INT            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date           DATE           NOT NULL,
    type           VARCHAR(5)     NOT NULL CHECK (type IN ('LONG', 'SHORT')),
    entry_price    DECIMAL(18,4)  NOT NULL,
    exit_price     DECIMAL(18,4)  NOT NULL,
    position_size  DECIMAL(18,4)  NOT NULL DEFAULT 1,
    pnl            DECIMAL(18,4)  NOT NULL,
    grade          VARCHAR(3)     NULL,
    notes          TEXT           NULL,
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_date ON trades(user_id, date);

-- ── DAILY SUMMARY VIEW ────────────────────────────────────────────
CREATE OR REPLACE VIEW daily_summary AS
SELECT
    user_id,
    date,
    COUNT(*)                                              AS trade_count,
    SUM(pnl)                                              AS daily_pnl,
    SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)             AS wins,
    SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END)             AS losses,
    SUM(CASE WHEN type = 'LONG'  THEN 1 ELSE 0 END)      AS longs,
    SUM(CASE WHEN type = 'SHORT' THEN 1 ELSE 0 END)      AS shorts
FROM trades
GROUP BY user_id, date;

-- ── MONTHLY SUMMARY VIEW ─────────────────────────────────────────
CREATE OR REPLACE VIEW monthly_summary AS
SELECT
    user_id,
    TO_CHAR(date, 'YYYY-MM')                             AS month,
    COUNT(*)                                              AS trade_count,
    SUM(pnl)                                              AS net_pnl,
    SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)             AS wins,
    SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END)             AS losses,
    ROUND(
        CAST(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS NUMERIC)
        / NULLIF(COUNT(*), 0) * 100, 1
    )                                                     AS win_rate_pct,
    ROUND(
        SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END)
        / NULLIF(ABS(SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END)), 0),
        2
    )                                                     AS profit_factor
FROM trades
GROUP BY user_id, TO_CHAR(date, 'YYYY-MM');
