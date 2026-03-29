# TradeLedger — Trading Journal

A full-stack trading journal with calendar view, dashboard analytics, PnL tracking, and authentication.

## Project Structure

```
/trading-journal
  /frontend
    index.html        ← Trade Journal (calendar view)
    dashboard.html    ← Dashboard (chart + trade table)
    styles.css        ← All styles (dark/light theme)
    script.js         ← All frontend logic
  /backend
    server.js         ← Node.js + Express REST API
    package.json
  /database
    schema.sql        ← MySQL schema + views
```

---

## Quick Start (Frontend Only)

The frontend works **standalone** with `localStorage` — no backend needed to try it out.

1. Open `frontend/index.html` in a browser (or serve with any static server)
2. Login with demo credentials: `demo` / `demo123`
3. Demo trades are seeded automatically for the past 90 days

---

## Full Stack Setup

### 1. Database

```bash
mysql -u root -p < database/schema.sql
```

### 2. Backend

```bash
cd backend
npm install
```

Create a `.env` file:
```env
PORT=3001
DB_HOST=localhost
DB_USER=root
DB_PASS=your_password
DB_NAME=tradeledger
JWT_SECRET=your_jwt_secret_here
FRONTEND_URL=http://localhost:3000
```

Start the server:
```bash
npm start
# or for development with auto-reload:
npm run dev
```

API runs at `http://localhost:3001`

### 3. Connect Frontend to Backend

In `frontend/script.js`, replace the localStorage functions with fetch calls to the API:

```js
const API = 'http://localhost:3001/api';
// Use Authorization: Bearer <token> header on all protected requests
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, get JWT |
| GET | `/api/trades` | Get all trades (auth required) |
| POST | `/api/trades` | Add a trade |
| PUT | `/api/trades/:id` | Update a trade |
| DELETE | `/api/trades/:id` | Delete a trade |
| GET | `/api/stats` | Get aggregated stats |

Query params for GET `/api/trades` and `/api/stats`: `?from=YYYY-MM-DD&to=YYYY-MM-DD`

---

## Features

- **Trade Calendar** — monthly grid with daily PnL color-coding (green/red) and weekly totals
- **Dashboard** — KPI cards + cumulative PnL line chart with 7D/30D/3M/1Y/All filters
- **Trade Log** — full CRUD with auto-calculated PnL
- **Authentication** — login/register with JWT (backend) or localStorage (frontend)
- **Export CSV** — download all trades as CSV
- **Dark/Light Mode** — toggle with persisted preference
- **Date Range Filtering** — filter trade table by date range
- **Responsive** — works on mobile/tablet

---

## PnL Calculation

- **LONG**: `(exit_price − entry_price) × position_size`
- **SHORT**: `(entry_price − exit_price) × position_size`
