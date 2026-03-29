-- ================================================================
-- TradeLedger — database/schema.sql
-- Run: mysql -u root -p < schema.sql
-- ================================================================

CREATE DATABASE IF NOT EXISTS tradeledger
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE tradeledger;

-- ── USERS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT          NOT NULL AUTO_INCREMENT,
  username      VARCHAR(64)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_username (username)
);

-- Demo seed user (password: demo123 — bcrypt hash)
INSERT IGNORE INTO users (username, password_hash)
VALUES ('demo', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');

-- ── TRADES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
  id             INT           NOT NULL AUTO_INCREMENT,
  user_id        INT           NOT NULL,
  date           DATE          NOT NULL,
  type           ENUM('LONG','SHORT') NOT NULL,
  entry_price    DECIMAL(18,4) NOT NULL,
  exit_price     DECIMAL(18,4) NOT NULL,
  position_size  DECIMAL(18,4) NOT NULL DEFAULT 1,
  pnl            DECIMAL(18,4) NOT NULL COMMENT 'Auto-calculated: (exit-entry)*size for LONG, (entry-exit)*size for SHORT',
  notes          TEXT          NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_user_date (user_id, date),
  CONSTRAINT fk_trades_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── USEFUL VIEWS ─────────────────────────────────────────────────
-- Daily summary per user
CREATE OR REPLACE VIEW daily_summary AS
SELECT
  user_id,
  date,
  COUNT(*)                            AS trade_count,
  SUM(pnl)                            AS daily_pnl,
  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS wins,
  SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) AS losses,
  SUM(CASE WHEN type='LONG'  THEN 1 ELSE 0 END) AS longs,
  SUM(CASE WHEN type='SHORT' THEN 1 ELSE 0 END) AS shorts
FROM trades
GROUP BY user_id, date;

-- Monthly summary per user
CREATE OR REPLACE VIEW monthly_summary AS
SELECT
  user_id,
  DATE_FORMAT(date, '%Y-%m')         AS month,
  COUNT(*)                            AS trade_count,
  SUM(pnl)                            AS net_pnl,
  SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS wins,
  SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) AS losses,
  ROUND(
    SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) / COUNT(*) * 100, 1
  )                                   AS win_rate_pct,
  ROUND(
    SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) /
    NULLIF(ABS(SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END)), 0),
    2
  )                                   AS profit_factor
FROM trades
GROUP BY user_id, month;

-- ── EXAMPLE QUERIES ──────────────────────────────────────────────
-- Get all trades for a user in a date range:
-- SELECT * FROM trades WHERE user_id=1 AND date BETWEEN '2024-01-01' AND '2024-12-31' ORDER BY date;

-- Get monthly stats for a user:
-- SELECT * FROM monthly_summary WHERE user_id=1 ORDER BY month DESC;

-- Get cumulative PnL by day:
-- SELECT date, SUM(SUM(pnl)) OVER (ORDER BY date) AS cumulative_pnl
-- FROM trades WHERE user_id=1 GROUP BY date ORDER BY date;
