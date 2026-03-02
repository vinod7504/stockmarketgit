# FactoResearch BSE Dashboard

BSE-only stock analytics dashboard powered by Alpha Vantage.
All prices and values are shown in Indian Rupees (INR).

## Structure

- `backend/` - Node.js API server
- `frontend/` - static website (HTML/CSS/JS)

## Features

- Company/ticker search restricted to BSE stocks.
- INR-only metric display.
- Live current date and time in IST.
- Daily price chart.
- Fundamentals (P/E, EPS, market cap, dividend yield, beta, 52-week range).
- Insider buyers and sellers details.
- Related BSE stocks from sentiment co-mentions.

## Setup

1. Edit `.env` in project root:

```env
ALPHA_VANTAGE_KEY=YOUR_KEY
PORT=3000
HOST=127.0.0.1
```

2. Start server:

```bash
npm start
```

3. Open:

`http://localhost:3000`

## API Routes

- `GET /api/health`
- `GET /api/search?q=reliance`
- `GET /api/stock/RELIANCE.BSE`
