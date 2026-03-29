-- ================================================================
-- TradeLedger — SQL Server Schema
-- Run this in SSMS
-- ================================================================

-- Create database
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'tradeledger')
    CREATE DATABASE tradeledger;
GO

USE tradeledger;
GO

-- ── USERS ────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
CREATE TABLE users (
    id            INT           NOT NULL IDENTITY(1,1),
    username      NVARCHAR(64)  NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    created_at    DATETIME2     NOT NULL DEFAULT GETDATE(),
    PRIMARY KEY (id)
);
GO

-- Demo seed user (password: demo123)
IF NOT EXISTS (SELECT * FROM users WHERE username = 'demo')
    INSERT INTO users (username, password_hash)
    VALUES ('demo', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
GO

-- ── TRADES ───────────────────────────────────────────────────────
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='trades' AND xtype='U')
CREATE TABLE trades (
    id             INT            NOT NULL IDENTITY(1,1),
    user_id        INT            NOT NULL,
    date           DATE           NOT NULL,
    type           NVARCHAR(5)    NOT NULL CHECK (type IN ('LONG','SHORT')),
    entry_price    DECIMAL(18,4)  NOT NULL,
    exit_price     DECIMAL(18,4)  NOT NULL,
    position_size  DECIMAL(18,4)  NOT NULL DEFAULT 1,
    pnl            DECIMAL(18,4)  NOT NULL,
    notes          NVARCHAR(MAX)  NULL,
    created_at     DATETIME2      NOT NULL DEFAULT GETDATE(),
    PRIMARY KEY (id),
    CONSTRAINT fk_trades_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
GO

CREATE INDEX idx_user_date ON trades(user_id, date);
GO

-- ── DAILY SUMMARY VIEW ────────────────────────────────────────────
IF EXISTS (SELECT * FROM sys.views WHERE name = 'daily_summary')
    DROP VIEW daily_summary;
GO
CREATE VIEW daily_summary AS
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
GO

-- ── MONTHLY SUMMARY VIEW ─────────────────────────────────────────
IF EXISTS (SELECT * FROM sys.views WHERE name = 'monthly_summary')
    DROP VIEW monthly_summary;
GO
CREATE VIEW monthly_summary AS
SELECT
    user_id,
    FORMAT(date, 'yyyy-MM')                               AS month,
    COUNT(*)                                              AS trade_count,
    SUM(pnl)                                              AS net_pnl,
    SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)             AS wins,
    SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END)             AS losses,
    ROUND(
        CAST(SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) AS FLOAT)
        / NULLIF(COUNT(*), 0) * 100, 1
    )                                                     AS win_rate_pct,
    ROUND(
        SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END)
        / NULLIF(ABS(SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END)), 0),
        2
    )                                                     AS profit_factor
FROM trades
GROUP BY user_id, FORMAT(date, 'yyyy-MM');
GO
