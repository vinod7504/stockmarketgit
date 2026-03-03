# FactoResearch NSE/BSE Dashboard

NSE + BSE stock analytics dashboard with automatic multi-provider failover.
All prices and values are shown in Indian Rupees (INR).

## Data Providers

- Primary: `INDIAN_STOCK_API_BASE_URL` (your configured NSE/BSE API)
- Secondary: NSE official APIs (search + NSE quote fallback)
- Fallback: Yahoo Finance (intraday chart/search)

If the primary provider is down, the backend automatically fails over to NSE (for NSE symbols) and then Yahoo.
If a BSE (`.BO`) quote is unavailable from active providers, the API returns a BSE-specific unavailable error (it will not silently switch to NSE data).

## Structure

- `backend/` - Node.js API server
- `frontend/` - static website (HTML/CSS/JS)

## Features

- Company/ticker search across NSE and BSE.
- Symbol support with exchange suffixes:
  - `.NS` for NSE (default if suffix is omitted)
  - `.BO` for BSE
- INR metric display and IST timestamps.
- Intraday chart (5-minute interval when available).
- Fundamentals (as available from active provider).
- Alternate exchange quick switch (e.g., `RELIANCE.NS` <-> `RELIANCE.BO`).

## Setup

1. Edit `.env` in project root (optional):

```env
INDIAN_STOCK_API_BASE_URL=https://military-jobye-haiqstudios-14f59639.koyeb.app/
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
- `GET /api/stock/RELIANCE`
- `GET /api/stock/RELIANCE.NS`
- `GET /api/stock/RELIANCE.BO`
