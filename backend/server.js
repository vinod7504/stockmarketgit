const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const IST_TIMEZONE = "Asia/Kolkata";
const DEFAULT_STOCK_API_BASE_URL =
  "https://military-jobye-haiqstudios-14f59639.koyeb.app/";
const NSE_BASE_URL = "https://www.nseindia.com";
const YAHOO_CHART_BASE_URL = "https://query1.finance.yahoo.com";
const YAHOO_SEARCH_BASE_URL = "https://query2.finance.yahoo.com";
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,23}$/;
const YAHOO_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*"
};
const NSE_HEADERS = {
  "User-Agent": YAHOO_HEADERS["User-Agent"],
  Accept: "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/"
};

loadEnv(path.join(ROOT_DIR, ".env"));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const STOCK_API_BASE_URL =
  process.env.INDIAN_STOCK_API_BASE_URL || DEFAULT_STOCK_API_BASE_URL;
const DEFAULT_CORS_ALLOW_ORIGINS = [
  "https://stockmarketfactoresearch.netlify.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];
const CORS_ALLOW_ORIGINS = new Set(
  String(
    process.env.CORS_ALLOW_ORIGINS ||
      process.env.CORS_ALLOW_ORIGIN ||
      DEFAULT_CORS_ALLOW_ORIGINS.join(",")
  )
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
);
const CORS_ALLOW_METHODS = "GET,OPTIONS";
const CORS_ALLOW_HEADERS = "Content-Type";
const CHART_CACHE_TTL_MS = 45000;
const chartCache = new Map();
const CHART_RANGE_MAP = Object.freeze({
  "1D": { range: "1d", interval: "5m" },
  "1W": { range: "5d", interval: "15m" },
  "1M": { range: "1mo", interval: "60m" },
  "3M": { range: "3mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1wk" },
  "5Y": { range: "5y", interval: "1mo" },
  ALL: { range: "max", interval: "1mo" }
});

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const idx = line.indexOf("=");
    if (idx === -1) {
      continue;
    }

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function resolveCorsAllowOrigin(req) {
  const requestOrigin = String(req?.headers?.origin || "").trim();
  if (!requestOrigin) {
    return "*";
  }

  if (CORS_ALLOW_ORIGINS.has("*")) {
    return "*";
  }

  if (CORS_ALLOW_ORIGINS.has(requestOrigin)) {
    return requestOrigin;
  }

  return "";
}

function applyCorsHeaders(req, res) {
  const allowOrigin = resolveCorsAllowOrigin(req);
  if (allowOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", CORS_ALLOW_METHODS);
  res.setHeader("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
}

function toNumber(value) {
  if (value === undefined || value === null || value === "" || value === "None") {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeDecode(part) {
  try {
    return decodeURIComponent(String(part || ""));
  } catch {
    return String(part || "");
  }
}

function normalizeSearchSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase().replace(/\.(NS|BO)$/i, "");
}

function parseSymbolInput(input) {
  const clean = String(input || "").trim().toUpperCase();

  if (!clean) {
    return {
      requested: "",
      querySymbol: "",
      baseSymbol: "",
      exchange: "NSE",
      ticker: ""
    };
  }

  if (clean.endsWith(".NS")) {
    const baseSymbol = clean.slice(0, -3);
    return {
      requested: clean,
      querySymbol: clean,
      baseSymbol,
      exchange: "NSE",
      ticker: clean
    };
  }

  if (clean.endsWith(".BO")) {
    const baseSymbol = clean.slice(0, -3);
    return {
      requested: clean,
      querySymbol: clean,
      baseSymbol,
      exchange: "BSE",
      ticker: clean
    };
  }

  return {
    requested: clean,
    querySymbol: clean,
    baseSymbol: clean,
    exchange: "NSE",
    ticker: `${clean}.NS`
  };
}

function exchangeFromTicker(ticker) {
  const upper = String(ticker || "").toUpperCase();
  if (upper.endsWith(".BO")) {
    return "BSE";
  }
  return "NSE";
}

function toTicker(symbol, exchange) {
  const cleanSymbol = normalizeSearchSymbol(symbol);
  if (!cleanSymbol) {
    return "";
  }
  return `${cleanSymbol}.${exchange === "BSE" ? "BO" : "NS"}`;
}

function normalizeChartRange(rawRange) {
  const clean = String(rawRange || "")
    .trim()
    .toUpperCase();

  if (!clean) {
    return "1D";
  }

  if (CHART_RANGE_MAP[clean]) {
    return clean;
  }

  const compact = clean.replace(/\s+/g, "");
  if (compact === "1D" || compact === "1DAY") {
    return "1D";
  }
  if (compact === "1W" || compact === "1WK" || compact === "1WEEK" || compact === "5D") {
    return "1W";
  }
  if (compact === "1M" || compact === "1MO" || compact === "1MONTH") {
    return "1M";
  }
  if (compact === "3M" || compact === "3MO") {
    return "3M";
  }
  if (compact === "6M" || compact === "6MO") {
    return "6M";
  }
  if (compact === "1Y" || compact === "1YR") {
    return "1Y";
  }
  if (compact === "5Y" || compact === "5YR") {
    return "5Y";
  }
  if (compact === "ALL" || compact === "MAX") {
    return "ALL";
  }

  return "1D";
}

function getYahooChartConfig(rawRange) {
  const normalized = normalizeChartRange(rawRange);
  return {
    chartRange: normalized,
    ...(CHART_RANGE_MAP[normalized] || CHART_RANGE_MAP["1D"])
  };
}

function formatIsoDate(unixSeconds) {
  if (!unixSeconds) {
    return null;
  }
  const dt = new Date(Number(unixSeconds) * 1000);
  if (Number.isNaN(dt.getTime())) {
    return null;
  }
  return dt.toISOString().slice(0, 10);
}

function formatIstDateTimeLabel(unixSeconds) {
  if (!unixSeconds) {
    return null;
  }
  const dt = new Date(Number(unixSeconds) * 1000);
  if (Number.isNaN(dt.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIMEZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(dt);
}

function formatChartLabel(unixSeconds, chartRange) {
  if (!unixSeconds) {
    return "";
  }
  const dt = new Date(Number(unixSeconds) * 1000);
  if (Number.isNaN(dt.getTime())) {
    return "";
  }

  const range = normalizeChartRange(chartRange);
  const isIntraday = range === "1D" || range === "1W";
  const opts = isIntraday
    ? {
        timeZone: IST_TIMEZONE,
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }
    : {
        timeZone: IST_TIMEZONE,
        day: "2-digit",
        month: "short",
        year: range === "ALL" || range === "5Y" || range === "1Y" ? "2-digit" : undefined
      };

  return new Intl.DateTimeFormat("en-IN", opts).format(dt);
}

function buildUrl(baseUrl, pathname, params) {
  const base = new URL(baseUrl);
  const url = new URL(pathname, base);

  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function createProviderError(message, options = {}) {
  const error = new Error(message);
  if (options.statusCode) {
    error.statusCode = options.statusCode;
  }
  if (options.upstream) {
    error.upstream = options.upstream;
  }
  if (options.provider) {
    error.provider = options.provider;
  }
  return error;
}

function parseNseLastUpdateDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (!match) {
    return null;
  }

  const months = {
    JAN: "01",
    FEB: "02",
    MAR: "03",
    APR: "04",
    MAY: "05",
    JUN: "06",
    JUL: "07",
    AUG: "08",
    SEP: "09",
    OCT: "10",
    NOV: "11",
    DEC: "12"
  };

  const day = match[1].padStart(2, "0");
  const mon = months[match[2].toUpperCase()];
  const year = match[3];
  if (!mon) {
    return null;
  }

  return `${year}-${mon}-${day}`;
}

function cropCookie(item) {
  return String(item || "").split(";")[0];
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    headers: options.headers || {}
  });

  const raw = await res.text();
  const lowerRaw = String(raw || "").toLowerCase();

  if (res.status === 429 || lowerRaw.includes("too many requests")) {
    throw createProviderError(`${options.providerName} rate limit reached. Please retry shortly.`, {
      statusCode: 429,
      provider: options.providerName
    });
  }

  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    if (lowerRaw.includes("no active service")) {
      throw createProviderError(`Upstream service is inactive at ${options.serviceBaseUrl}`, {
        statusCode: 503,
        provider: options.providerName
      });
    }

    throw createProviderError(
      `${options.providerName} returned non-JSON response (HTTP ${res.status}).`,
      {
        statusCode: 502,
        provider: options.providerName
      }
    );
  }

  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error ||
      data?.finance?.error?.description ||
      `${options.providerName} HTTP ${res.status}`;

    throw createProviderError(msg, {
      statusCode: res.status,
      upstream: data,
      provider: options.providerName
    });
  }

  return data;
}

async function fetchFromPrimary(pathname, params) {
  const url = buildUrl(STOCK_API_BASE_URL, pathname, params);
  const data = await requestJson(url, {
    providerName: "Primary stock API",
    serviceBaseUrl: STOCK_API_BASE_URL
  });

  if (data?.status && String(data.status).toLowerCase() === "error") {
    const msg = data.message || "Primary stock API returned an error.";
    const statusCode = /no data found|not exist/i.test(msg) ? 404 : 400;
    throw createProviderError(msg, {
      statusCode,
      upstream: data,
      provider: "Primary stock API"
    });
  }

  return data;
}

async function fetchFromNse(pathname, params, refererSymbol = "") {
  const url = buildUrl(NSE_BASE_URL, pathname, params);
  const directHeaders = { ...NSE_HEADERS };
  if (refererSymbol) {
    directHeaders.Referer = `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(
      refererSymbol
    )}`;
  }

  try {
    return await requestJson(url, {
      headers: directHeaders,
      providerName: "NSE",
      serviceBaseUrl: NSE_BASE_URL
    });
  } catch (error) {
    if (error?.statusCode !== 401 && error?.statusCode !== 403) {
      throw error;
    }
  }

  const landing = await fetch(new URL("/", NSE_BASE_URL), { headers: NSE_HEADERS });
  const setCookies =
    typeof landing.headers.getSetCookie === "function" ? landing.headers.getSetCookie() : [];
  const cookieHeader = setCookies.map(cropCookie).filter(Boolean).join("; ");

  if (!cookieHeader) {
    throw createProviderError("NSE session bootstrap failed (no cookies returned).", {
      statusCode: 503,
      provider: "NSE"
    });
  }

  const retryHeaders = {
    ...directHeaders,
    Cookie: cookieHeader
  };

  return requestJson(url, {
    headers: retryHeaders,
    providerName: "NSE",
    serviceBaseUrl: NSE_BASE_URL
  });
}

async function fetchYahoo(pathname, params, useSearchHost = false) {
  const baseUrl = useSearchHost ? YAHOO_SEARCH_BASE_URL : YAHOO_CHART_BASE_URL;
  const url = buildUrl(baseUrl, pathname, params);

  const data = await requestJson(url, {
    headers: YAHOO_HEADERS,
    providerName: "Yahoo Finance",
    serviceBaseUrl: baseUrl
  });

  if (data?.finance?.error) {
    const msg = data.finance.error.description || "Yahoo Finance returned an error.";
    const statusCode = data.finance.error.code === "Unauthorized" ? 401 : 502;
    throw createProviderError(msg, {
      statusCode,
      upstream: data,
      provider: "Yahoo Finance"
    });
  }

  if (data?.chart?.error) {
    const msg = data.chart.error.description || "Yahoo Finance chart error.";
    const statusCode = /no data|not found|delisted/i.test(msg) ? 404 : 502;
    throw createProviderError(msg, {
      statusCode,
      upstream: data,
      provider: "Yahoo Finance"
    });
  }

  return data;
}

function buildSnapshotChart(stockData) {
  const raw = [
    ["Previous Close", stockData.previous_close],
    ["Open", stockData.open],
    ["Day Low", stockData.day_low],
    ["Last Price", stockData.last_price],
    ["Day High", stockData.day_high],
    ["52W Low", stockData.year_low],
    ["52W High", stockData.year_high]
  ];

  return raw
    .map(([label, value]) => ({
      date: label,
      open: null,
      high: null,
      low: null,
      close: toNumber(value),
      volume: null
    }))
    .filter((point) => point.close !== null);
}

function buildOverviewFromPrimary(upstreamPayload) {
  const data = upstreamPayload?.data || {};
  const alt = upstreamPayload?.alternate_exchange || {};

  return {
    DataSource: "Primary NSE/BSE API",
    Symbol: upstreamPayload?.symbol || "",
    Ticker: upstreamPayload?.ticker || "",
    Exchange: upstreamPayload?.exchange || "",
    InstrumentType: data.instrument_type || data.instrumentType || data.type || "",
    ISIN: data.isin || data.ISIN || "",
    CompanyName: data.company_name || "",
    Sector: data.sector || "",
    Industry: data.industry || "",
    Currency: data.currency || "INR",
    LastUpdate: data.last_update || "",
    Timestamp: data.timestamp || "",
    LastPrice: data.last_price,
    Change: data.change,
    PercentChange: data.percent_change,
    PreviousClose: data.previous_close,
    Open: data.open,
    DayHigh: data.day_high,
    DayLow: data.day_low,
    YearHigh: data.year_high,
    YearLow: data.year_low,
    Volume: data.volume,
    MarketCap: data.market_cap,
    PERatio: data.pe_ratio,
    DividendYield: data.dividend_yield,
    BookValue: data.book_value,
    EarningsPerShare: data.earnings_per_share,
    AlternateExchange: alt.exchange || "",
    AlternateTicker: alt.ticker || "",
    AlternateApiUrl: alt.api_url || ""
  };
}

function buildPrimaryResponse(payload, normalizedInput, warnings = []) {
  const data = payload?.data || {};
  const symbol = normalizeSearchSymbol(payload?.symbol || normalizedInput.baseSymbol);
  const exchange = String(payload?.exchange || normalizedInput.exchange || "NSE").toUpperCase();
  const ticker = String(payload?.ticker || toTicker(symbol, exchange)).toUpperCase();
  const currency = String(data.currency || "INR").toUpperCase();

  const percent = toNumber(data.percent_change);

  const summary = {
    currentPrice: toNumber(data.last_price),
    latestTradingDay: data.last_update || null,
    previousClose: toNumber(data.previous_close),
    dayChange: toNumber(data.change),
    dayChangePercent: percent !== null ? `${percent}%` : null,
    peRatio: toNumber(data.pe_ratio),
    eps: toNumber(data.earnings_per_share),
    marketCapitalization: toNumber(data.market_cap),
    dividendYield: toNumber(data.dividend_yield),
    beta: null,
    high52Week: toNumber(data.year_high),
    low52Week: toNumber(data.year_low),
    volume: toNumber(data.volume),
    currency
  };

  const alternateTicker = String(payload?.alternate_exchange?.ticker || "").toUpperCase();
  const relatedStocks = alternateTicker
    ? [
        {
          ticker: alternateTicker,
          label: alternateTicker,
          exchange: String(payload?.alternate_exchange?.exchange || "").toUpperCase(),
          kind: "alternate_exchange",
          apiUrl: payload?.alternate_exchange?.api_url || ""
        }
      ]
    : [];

  const partialErrors = [...warnings];
  partialErrors.push(
    "Primary provider returns snapshot data only. Insider and sentiment feeds are unavailable."
  );

  const chart = buildSnapshotChart(data);
  if (!chart.length) {
    partialErrors.push("No chart points available for this symbol from primary provider.");
  }

  return {
    symbol,
    ticker,
    exchange,
    currency,
    instrumentType: data.instrument_type || data.instrumentType || data.type || "",
    source: "primary",
    name: data.company_name || symbol,
    market: {
      state: "UNKNOWN",
      isOpen: null,
      range: "1D",
      timezone: IST_TIMEZONE,
      lastTradeTimestamp: null,
      lastTradeDate: data.last_update || null,
      lastTradeTimeText: data.timestamp || data.last_update || null
    },
    summary,
    overview: buildOverviewFromPrimary(payload),
    chart,
    chartRange: "1D",
    insider: {
      buyers: [],
      sellers: [],
      allTransactions: []
    },
    relatedStocks,
    newsCount: 0,
    partialErrors
  };
}

function isIndianYahooEquity(row) {
  const symbol = String(row?.symbol || "").toUpperCase();
  const exchange = String(row?.exchange || "").toUpperCase();
  const isEquity = String(row?.quoteType || "").toUpperCase() === "EQUITY";

  return isEquity && (symbol.endsWith(".NS") || symbol.endsWith(".BO") || exchange === "NSI" || exchange === "BSE");
}

function mapYahooSearchResults(data) {
  const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
  const byBase = new Map();

  for (const row of quotes) {
    if (!isIndianYahooEquity(row)) {
      continue;
    }

    const ticker = String(row.symbol || "").toUpperCase();
    const base = normalizeSearchSymbol(ticker);
    if (!base) {
      continue;
    }

    const current = byBase.get(base) || {
      symbol: base,
      name: row.longname || row.shortname || base,
      type: row.typeDisp || "Equity",
      region: "India",
      marketOpen: "09:15",
      marketClose: "15:30",
      timezone: "Asia/Kolkata",
      currency: "INR",
      matchScore: toNumber(row.score) ?? 0,
      nseSymbol: `${base}.NS`,
      bseSymbol: `${base}.BO`,
      source: "yahoo-search",
      defaultSymbol: base,
      sector: row.sectorDisp || row.sector || "",
      industry: row.industryDisp || row.industry || ""
    };

    const thisScore = toNumber(row.score) ?? 0;
    if (thisScore > (current.matchScore || 0)) {
      current.matchScore = thisScore;
    }

    if (ticker.endsWith(".NS")) {
      current.nseSymbol = ticker;
    } else if (ticker.endsWith(".BO")) {
      current.bseSymbol = ticker;
    }

    if (!current.name && (row.longname || row.shortname)) {
      current.name = row.longname || row.shortname;
    }

    if (!current.sector && (row.sectorDisp || row.sector)) {
      current.sector = row.sectorDisp || row.sector;
    }

    if (!current.industry && (row.industryDisp || row.industry)) {
      current.industry = row.industryDisp || row.industry;
    }

    byBase.set(base, current);
  }

  return Array.from(byBase.values()).sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
}

async function searchWithNse(query) {
  const data = await fetchFromNse("/api/search/autocomplete", { q: query });
  const rows = Array.isArray(data?.symbols) ? data.symbols : [];

  const matches = rows
    .filter(
      (row) =>
        String(row?.result_type || "").toLowerCase() === "symbol" &&
        String(row?.result_sub_type || "").toLowerCase() === "equity"
    )
    .map((row) => {
      const symbol = normalizeSearchSymbol(row.symbol);
      return {
        symbol,
        name: row.symbol_info || symbol,
        type: "equity",
        region: "India",
        marketOpen: "09:15",
        marketClose: "15:30",
        timezone: "Asia/Kolkata",
        currency: "INR",
        matchScore: 1,
        nseSymbol: `${symbol}.NS`,
        bseSymbol: `${symbol}.BO`,
        source: "nse",
        defaultSymbol: symbol
      };
    })
    .filter((item) => Boolean(item.symbol));

  return {
    matches,
    source: "nse",
    note: "Search served by NSE official endpoint."
  };
}

function extractVariationRows(payload) {
  const buckets = ["allSec", "FOSec", "NIFTY", "BANKNIFTY", "NIFTYNEXT50", "SecGtr20"];
  for (const key of buckets) {
    const rows = payload?.[key]?.data;
    if (Array.isArray(rows) && rows.length) {
      return rows;
    }
  }
  return [];
}

function normalizeMoverRows(rows, exchange = "NSE") {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const symbol = normalizeSearchSymbol(row.symbol);
      if (!symbol || !/^[A-Z0-9.-]+$/.test(symbol)) {
        return null;
      }

      return {
        symbol,
        ticker: toTicker(symbol, exchange),
        exchange,
        lastPrice: toNumber(row.ltp ?? row.lastPrice),
        percentChange: toNumber(row.perChange ?? row.pChange ?? row.net_price),
        change: toNumber(row.net_price ?? row.change),
        volume: toNumber(row.trade_quantity ?? row.quantityTraded ?? row.totalTradedVolume),
        turnover: toNumber(row.turnover ?? row.totalTradedValue)
      };
    })
    .filter(Boolean);
}

function normalizeActiveRows(rows, exchange = "NSE") {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const symbol = normalizeSearchSymbol(row.symbol);
      if (!symbol || !/^[A-Z0-9.-]+$/.test(symbol)) {
        return null;
      }

      return {
        symbol,
        ticker: toTicker(symbol, exchange),
        exchange,
        lastPrice: toNumber(row.lastPrice ?? row.ltp),
        percentChange: toNumber(row.pChange ?? row.perChange ?? row.net_price),
        change: toNumber(row.change ?? row.net_price),
        volume: toNumber(row.quantityTraded ?? row.totalTradedVolume ?? row.trade_quantity),
        turnover: toNumber(row.totalTradedValue ?? row.turnover)
      };
    })
    .filter(Boolean);
}

function extractSectors(indicesPayload) {
  const rows = Array.isArray(indicesPayload?.data) ? indicesPayload.data : [];
  return rows
    .filter((row) => String(row?.key || "").toUpperCase() === "SECTORAL INDICES")
    .map((row) => ({
      name: String(row.index || "").trim(),
      last: toNumber(row.last),
      percentChange: toNumber(row.percentChange)
    }))
    .filter((row) => row.name)
    .slice(0, 16);
}

async function buildMarketHomeData() {
  const calls = await Promise.allSettled([
    fetchFromNse("/api/live-analysis-variations", { index: "gainers" }),
    fetchFromNse("/api/live-analysis-variations", { index: "loosers" }),
    fetchFromNse("/api/live-analysis-most-active-securities", { index: "volume" }),
    fetchFromNse("/api/live-analysis-most-active-securities", { index: "value" }),
    fetchFromNse("/api/allIndices", {})
  ]);

  const [gainersResult, losersResult, activeVolumeResult, activeValueResult, allIndicesResult] =
    calls;

  const partialErrors = calls
    .filter((r) => r.status === "rejected")
    .map((r) => r.reason?.message || "Unknown upstream error.");

  const gainersRows =
    gainersResult.status === "fulfilled"
      ? normalizeMoverRows(extractVariationRows(gainersResult.value))
      : [];
  const losersRows =
    losersResult.status === "fulfilled"
      ? normalizeMoverRows(extractVariationRows(losersResult.value))
      : [];
  const activeVolumeRows =
    activeVolumeResult.status === "fulfilled"
      ? normalizeActiveRows(activeVolumeResult.value?.data)
      : [];
  const activeValueRows =
    activeValueResult.status === "fulfilled"
      ? normalizeActiveRows(activeValueResult.value?.data)
      : [];
  const sectors =
    allIndicesResult.status === "fulfilled" ? extractSectors(allIndicesResult.value) : [];

  if (
    !gainersRows.length &&
    !losersRows.length &&
    !activeVolumeRows.length &&
    !activeValueRows.length &&
    !sectors.length
  ) {
    throw createProviderError("Unable to load market home data from NSE feeds.", {
      statusCode: 502,
      provider: "NSE"
    });
  }

  const mostBuyDay = activeValueRows
    .filter((row) => (row.percentChange ?? 0) >= 0)
    .sort((a, b) => (b.turnover ?? 0) - (a.turnover ?? 0))
    .slice(0, 10);

  const notes = [
    "Weekly stock lists currently use latest available NSE movers feed (week-specific stock feed unavailable).",
    "Sector stock lists are sourced from NSE sectoral indices."
  ];

  return {
    source: "nse_home",
    generatedAt: new Date().toISOString(),
    topGainersDay: gainersRows.slice(0, 10),
    topLosersDay: losersRows.slice(0, 10),
    topGainersWeek: gainersRows.slice(0, 10),
    topLosersWeek: losersRows.slice(0, 10),
    mostBuyDay,
    mostBuyWeek: mostBuyDay,
    topIntraday: activeVolumeRows.slice(0, 10),
    sectors,
    defaultSector: sectors[0]?.name || "",
    notes,
    partialErrors
  };
}

async function searchWithPrimary(query) {
  const data = await fetchFromPrimary("/search", { q: query });

  const matches = Array.isArray(data.results)
    ? data.results
        .map((item) => {
          const symbol = normalizeSearchSymbol(item.symbol);
          return {
            symbol,
            name: item.company_name || symbol,
            type: item.match_type || "",
            region: "India",
            marketOpen: "09:15",
            marketClose: "15:30",
            timezone: "Asia/Kolkata",
            currency: "INR",
            matchScore: String(item.match_type || "").toLowerCase() === "exact" ? 1 : 0.5,
            nseSymbol: `${symbol}.NS`,
            bseSymbol: `${symbol}.BO`,
            source: item.source || "primary",
            defaultSymbol: symbol
          };
        })
        .filter((item) => Boolean(item.symbol))
    : [];

  return {
    matches,
    note: data.note || "Default exchange is NSE. Use .BO for BSE.",
    source: "primary"
  };
}

async function searchWithYahoo(query) {
  const data = await fetchYahoo(
    "/v1/finance/search",
    {
      q: query,
      lang: "en-US",
      region: "IN",
      quotesCount: "20",
      newsCount: "0"
    },
    true
  );

  const matches = mapYahooSearchResults(data);

  if (!matches.length) {
    const direct = normalizeSearchSymbol(query);
    if (direct && SYMBOL_PATTERN.test(direct)) {
      return {
        matches: [
          {
            symbol: direct,
            name: direct,
            type: "Direct Symbol",
            region: "India",
            marketOpen: "09:15",
            marketClose: "15:30",
            timezone: "Asia/Kolkata",
            currency: "INR",
            matchScore: 0,
            nseSymbol: `${direct}.NS`,
            bseSymbol: `${direct}.BO`,
            source: "direct-input",
            defaultSymbol: direct
          }
        ],
        note: "No search matches returned. Trying direct symbol format.",
        source: "yahoo"
      };
    }
  }

  return {
    matches,
    note: "Search served by Yahoo Finance fallback.",
    source: "yahoo"
  };
}

async function fetchYahooProfileHint(symbol, ticker) {
  const data = await fetchYahoo(
    "/v1/finance/search",
    {
      q: symbol,
      lang: "en-US",
      region: "IN",
      quotesCount: "20",
      newsCount: "0"
    },
    true
  );

  const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
  const upperTicker = String(ticker || "").toUpperCase();

  const exact = quotes.find((row) => String(row?.symbol || "").toUpperCase() === upperTicker);
  if (exact) {
    return {
      sector: exact.sectorDisp || exact.sector || "",
      industry: exact.industryDisp || exact.industry || ""
    };
  }

  const sameBase = quotes.find(
    (row) => normalizeSearchSymbol(row?.symbol) === symbol && isIndianYahooEquity(row)
  );

  return {
    sector: sameBase?.sectorDisp || sameBase?.sector || "",
    industry: sameBase?.industryDisp || sameBase?.industry || ""
  };
}

function buildYahooChartSeries(result, chartRange = "1D") {
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const quote = result?.indicators?.quote?.[0] || {};

  const points = timestamps
    .map((ts, idx) => ({
      date: formatChartLabel(ts, chartRange),
      timestamp: Number(ts) * 1000,
      open: toNumber(quote?.open?.[idx]),
      high: toNumber(quote?.high?.[idx]),
      low: toNumber(quote?.low?.[idx]),
      close: toNumber(quote?.close?.[idx]),
      volume: toNumber(quote?.volume?.[idx])
    }))
    .filter((point) => point.close !== null);

  return points;
}

function buildYahooMarketMeta(meta, chartRange = "1D") {
  const regularTime = toNumber(meta?.regularMarketTime);
  const state = String(meta?.marketState || "").toUpperCase() || "UNKNOWN";

  return {
    state,
    isOpen: state === "REGULAR" || state === "OPEN",
    range: normalizeChartRange(chartRange),
    timezone: IST_TIMEZONE,
    lastTradeTimestamp: regularTime !== null ? regularTime * 1000 : null,
    lastTradeDate: formatIsoDate(regularTime),
    lastTradeTimeText: formatIstDateTimeLabel(regularTime)
  };
}

function getChartCache(key) {
  const hit = chartCache.get(key);
  if (!hit) {
    return null;
  }
  if (Date.now() - hit.ts > CHART_CACHE_TTL_MS) {
    chartCache.delete(key);
    return null;
  }
  return hit.value;
}

function setChartCache(key, value) {
  chartCache.set(key, { ts: Date.now(), value });
}

async function fetchYahooChartSeries(ticker, rawRange = "1D") {
  const upperTicker = String(ticker || "").trim().toUpperCase();
  if (!upperTicker) {
    throw createProviderError("Ticker is required for chart data.", {
      statusCode: 400,
      provider: "Yahoo Finance"
    });
  }

  const config = getYahooChartConfig(rawRange);
  const cacheKey = `${upperTicker}|${config.chartRange}`;
  const cached = getChartCache(cacheKey);
  if (cached) {
    return cached;
  }

  const yahooChart = await fetchYahoo(
    `/v8/finance/chart/${encodeURIComponent(upperTicker)}`,
    {
      interval: config.interval,
      range: config.range
    },
    false
  );

  const result = yahooChart?.chart?.result?.[0];
  if (!result) {
    throw createProviderError(`No chart data found for symbol: ${upperTicker}`, {
      statusCode: 404,
      provider: "Yahoo Finance"
    });
  }

  const meta = result.meta || {};
  const points = buildYahooChartSeries(result, config.chartRange);
  const payload = {
    ticker: String(meta.symbol || upperTicker).toUpperCase(),
    chartRange: config.chartRange,
    interval: config.interval,
    points,
    meta,
    market: buildYahooMarketMeta(meta, config.chartRange)
  };

  setChartCache(cacheKey, payload);
  return payload;
}

async function enrichResponseWithYahooChart(response, rawRange = "1D") {
  const chartRange = normalizeChartRange(rawRange);
  const ticker = String(response?.ticker || "").toUpperCase();
  if (!ticker) {
    response.chartRange = chartRange;
    return response;
  }

  try {
    const chartBundle = await fetchYahooChartSeries(ticker, chartRange);
    const returnedTicker = String(chartBundle.ticker || "").toUpperCase();
    if (ticker.endsWith(".BO") && !returnedTicker.endsWith(".BO")) {
      throw createProviderError(
        "Requested BSE chart data, but chart provider returned a non-BSE ticker.",
        { statusCode: 502, provider: "Yahoo Finance" }
      );
    }
    if (ticker.endsWith(".NS") && !returnedTicker.endsWith(".NS")) {
      throw createProviderError(
        "Requested NSE chart data, but chart provider returned a non-NSE ticker.",
        { statusCode: 502, provider: "Yahoo Finance" }
      );
    }

    response.chart = chartBundle.points;
    response.chartRange = chartBundle.chartRange;
    response.market = {
      ...(response.market || {}),
      ...(chartBundle.market || {})
    };

    if (response.summary && !response.summary.latestTradingDay) {
      response.summary.latestTradingDay = chartBundle.market?.lastTradeDate || null;
    }

    if (response.overview) {
      if (!response.overview.LastUpdate) {
        response.overview.LastUpdate = chartBundle.market?.lastTradeDate || "";
      }
      if (!response.overview.Timestamp && chartBundle.meta?.regularMarketTime) {
        response.overview.Timestamp = chartBundle.meta.regularMarketTime;
      }
    }
  } catch (error) {
    response.chartRange = chartRange;
    response.partialErrors = Array.isArray(response.partialErrors) ? response.partialErrors : [];
    response.partialErrors.push(
      `Chart feed fallback failed for ${chartRange}: ${error?.message || "Unknown error"}`
    );
  }

  return response;
}

function buildNseResponse(baseSymbol, quotePayload, tradeInfoPayload, primaryErrorMessage) {
  const info = quotePayload?.info || {};
  const metadata = quotePayload?.metadata || {};
  const priceInfo = quotePayload?.priceInfo || {};
  const industryInfo = quotePayload?.industryInfo || {};
  const preOpen = quotePayload?.preOpenMarket || {};
  const tradeInfo = tradeInfoPayload?.marketDeptOrderBook?.tradeInfo || {};

  const symbol = normalizeSearchSymbol(baseSymbol || metadata.symbol || info.symbol);
  const ticker = `${symbol}.NS`;
  const exchange = "NSE";
  const currency = "INR";

  const marketCapCrores = toNumber(tradeInfo.totalMarketCap);
  const marketCapRupees = marketCapCrores !== null ? marketCapCrores * 10000000 : null;

  const summary = {
    currentPrice: toNumber(priceInfo.lastPrice),
    latestTradingDay: parseNseLastUpdateDate(metadata.lastUpdateTime),
    previousClose: toNumber(priceInfo.previousClose),
    dayChange: toNumber(priceInfo.change),
    dayChangePercent:
      toNumber(priceInfo.pChange) !== null ? `${toNumber(priceInfo.pChange)}%` : null,
    peRatio: toNumber(metadata.pdSymbolPe),
    eps: null,
    marketCapitalization: marketCapRupees,
    dividendYield: null,
    beta: null,
    high52Week: toNumber(priceInfo?.weekHighLow?.max),
    low52Week: toNumber(priceInfo?.weekHighLow?.min),
    volume:
      toNumber(tradeInfoPayload?.securityWiseDP?.quantityTraded) ??
      toNumber(preOpen.totalTradedVolume),
    currency
  };

  const chart = buildSnapshotChart({
    previous_close: summary.previousClose,
    open: toNumber(priceInfo.open),
    day_low: toNumber(priceInfo?.intraDayHighLow?.min),
    last_price: summary.currentPrice,
    day_high: toNumber(priceInfo?.intraDayHighLow?.max),
    year_low: summary.low52Week,
    year_high: summary.high52Week
  });

  const partialErrors = [];
  if (primaryErrorMessage) {
    partialErrors.push(`Primary provider failed: ${primaryErrorMessage}`);
  }

  partialErrors.push("Serving realtime/delayed quotes from NSE official endpoint.");
  partialErrors.push("NSE fallback covers NSE symbols only. BSE symbols use other providers.");
  partialErrors.push("Intraday candles are unavailable in NSE quote endpoint; rendered snapshot chart.");
  if (marketCapCrores !== null) {
    partialErrors.push("NSE market cap is converted from Crores to Rupees for display.");
  }

  const relatedStocks = [
    {
      ticker: `${symbol}.BO`,
      label: `${symbol}.BO`,
      exchange: "BSE",
      kind: "alternate_exchange"
    }
  ];

  const market = {
    state: "UNKNOWN",
    isOpen: null,
    range: "1D",
    timezone: IST_TIMEZONE,
    lastTradeTimestamp: null,
    lastTradeDate: parseNseLastUpdateDate(metadata.lastUpdateTime),
    lastTradeTimeText: metadata.lastUpdateTime || parseNseLastUpdateDate(metadata.lastUpdateTime)
  };

  return {
    symbol,
    ticker,
    exchange,
    currency,
    instrumentType: metadata.series || info.instrument || "EQUITY",
    source: "nse",
    name: info.companyName || symbol,
    market,
    summary,
    overview: {
      DataSource: "NSE official quote endpoint",
      Symbol: symbol,
      Ticker: ticker,
      Exchange: exchange,
      InstrumentType: metadata.series || info.instrument || "",
      ISIN: metadata.isin || info.isin || "",
      CompanyName: info.companyName || symbol,
      Industry: industryInfo.industry || metadata.industry || info.industry || "",
      Sector: industryInfo.sector || "",
      BasicIndustry: industryInfo.basicIndustry || "",
      Currency: currency,
      LastUpdate: parseNseLastUpdateDate(metadata.lastUpdateTime),
      LastUpdateTime: metadata.lastUpdateTime || "",
      LastPrice: summary.currentPrice,
      Change: summary.dayChange,
      PercentChange: summary.dayChangePercent,
      PreviousClose: summary.previousClose,
      Open: toNumber(priceInfo.open),
      DayHigh: toNumber(priceInfo?.intraDayHighLow?.max),
      DayLow: toNumber(priceInfo?.intraDayHighLow?.min),
      YearHigh: summary.high52Week,
      YearLow: summary.low52Week,
      Volume: summary.volume,
      MarketCap: summary.marketCapitalization,
      PERatio: summary.peRatio
    },
    chart,
    chartRange: "1D",
    insider: {
      buyers: [],
      sellers: [],
      allTransactions: []
    },
    relatedStocks,
    newsCount: 0,
    partialErrors
  };
}

async function buildYahooResponse(normalizedInput, primaryErrorMessage, rawRange = "1D") {
  const chartBundle = await fetchYahooChartSeries(normalizedInput.ticker, rawRange);
  const meta = chartBundle.meta || {};
  const symbol = normalizeSearchSymbol(meta.symbol || normalizedInput.baseSymbol);
  const ticker = String(chartBundle.ticker || normalizedInput.ticker).toUpperCase();
  const exchange = String(
    meta.fullExchangeName || exchangeFromTicker(ticker)
  ).toUpperCase().includes("BSE")
    ? "BSE"
    : "NSE";
  const currency = String(meta.currency || "INR").toUpperCase();

  const chart = chartBundle.points || [];
  const fallbackSnapshot = {
    previous_close: meta.previousClose ?? meta.chartPreviousClose,
    open: meta.regularMarketOpen,
    day_low: meta.regularMarketDayLow,
    last_price: meta.regularMarketPrice,
    day_high: meta.regularMarketDayHigh,
    year_low: meta.fiftyTwoWeekLow,
    year_high: meta.fiftyTwoWeekHigh
  };

  const chartData = chart.length ? chart : buildSnapshotChart(fallbackSnapshot);

  const currentPrice = toNumber(meta.regularMarketPrice) ?? chartData[chartData.length - 1]?.close ?? null;
  const previousClose = toNumber(meta.previousClose ?? meta.chartPreviousClose);
  const computedDayChange =
    currentPrice !== null && previousClose !== null ? currentPrice - previousClose : null;

  const percent =
    computedDayChange !== null && previousClose
      ? (computedDayChange / previousClose) * 100
      : null;

  let sector = "";
  let industry = "";
  try {
    const profile = await fetchYahooProfileHint(symbol, ticker);
    sector = profile.sector || "";
    industry = profile.industry || "";
  } catch {
    // Optional enrichment only.
  }

  const alternateExchange = exchange === "BSE" ? "NSE" : "BSE";
  const alternateTicker = toTicker(symbol, alternateExchange);

  const summary = {
    currentPrice,
    latestTradingDay: formatIsoDate(meta.regularMarketTime),
    previousClose,
    dayChange: computedDayChange,
    dayChangePercent: percent !== null ? `${percent.toFixed(2)}%` : null,
    peRatio: toNumber(meta.trailingPE),
    eps: toNumber(meta.epsTrailingTwelveMonths),
    marketCapitalization: toNumber(meta.marketCap),
    dividendYield: toNumber(meta.trailingAnnualDividendYield),
    beta: toNumber(meta.beta),
    high52Week: toNumber(meta.fiftyTwoWeekHigh),
    low52Week: toNumber(meta.fiftyTwoWeekLow),
    volume: toNumber(meta.regularMarketVolume),
    currency
  };

  const overview = {
    DataSource: "Yahoo Finance fallback",
    Symbol: symbol,
    Ticker: ticker,
    Exchange: exchange,
    InstrumentType: meta.instrumentType || "",
    ISIN: meta.isin || "",
    CompanyName: meta.longName || meta.shortName || symbol,
    Sector: sector,
    Industry: industry,
    Currency: currency,
    LastUpdate: formatIsoDate(meta.regularMarketTime),
    Timestamp: meta.regularMarketTime || null,
    LastPrice: summary.currentPrice,
    Change: summary.dayChange,
    PercentChange: summary.dayChangePercent,
    PreviousClose: summary.previousClose,
    Open: toNumber(meta.regularMarketOpen),
    DayHigh: toNumber(meta.regularMarketDayHigh),
    DayLow: toNumber(meta.regularMarketDayLow),
    YearHigh: summary.high52Week,
    YearLow: summary.low52Week,
    Volume: summary.volume,
    MarketCap: summary.marketCapitalization,
    PERatio: summary.peRatio,
    DividendYield: summary.dividendYield,
    EarningsPerShare: summary.eps,
    AlternateExchange: alternateExchange,
    AlternateTicker: alternateTicker
  };

  const partialErrors = [];
  if (primaryErrorMessage) {
    partialErrors.push(`Primary provider failed: ${primaryErrorMessage}`);
  }

  partialErrors.push("Serving realtime/delayed quotes from Yahoo Finance fallback (usually near realtime).");

  if (!chart.length) {
    partialErrors.push("Intraday candle series unavailable. Rendered snapshot-based chart from latest market fields.");
  }

  if (
    summary.peRatio === null &&
    summary.eps === null &&
    summary.marketCapitalization === null &&
    summary.dividendYield === null
  ) {
    partialErrors.push("Some fundamentals are unavailable on the Yahoo fallback endpoint for this symbol.");
  }

  return {
    symbol,
    ticker,
    exchange,
    currency,
    instrumentType: meta.instrumentType || "",
    source: "yahoo",
    name: meta.longName || meta.shortName || symbol,
    market: chartBundle.market || buildYahooMarketMeta(meta, rawRange),
    summary,
    overview,
    chart: chartData,
    chartRange: chartBundle.chartRange || normalizeChartRange(rawRange),
    insider: {
      buyers: [],
      sellers: [],
      allTransactions: []
    },
    relatedStocks: [
      {
        ticker: alternateTicker,
        label: alternateTicker,
        exchange: alternateExchange,
        kind: "alternate_exchange"
      }
    ],
    newsCount: 0,
    partialErrors
  };
}

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function resolveStaticPath(urlPathname) {
  const decoded = decodeURIComponent(urlPathname);
  const relative = decoded.replace(/^[/\\]+/, "");
  const resolved = path.resolve(FRONTEND_DIR, relative);

  if (resolved !== FRONTEND_DIR && !resolved.startsWith(`${FRONTEND_DIR}${path.sep}`)) {
    return null;
  }

  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return resolved;
  }

  return path.join(FRONTEND_DIR, "index.html");
}

function serveStatic(res, urlPathname) {
  const pathname = urlPathname === "/" ? "/index.html" : urlPathname;
  const filePath = resolveStaticPath(pathname);

  if (!filePath) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 500, { error: "Failed to read static file." });
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

async function handleMarketHome(res) {
  try {
    const data = await buildMarketHomeData();
    sendJson(res, 200, data);
  } catch (error) {
    sendJson(res, error?.statusCode || 502, {
      error: error?.message || "Failed to load market home data."
    });
  }
}

async function handleMarketSector(res, urlObj) {
  const sectorName = String(urlObj.searchParams.get("name") || "").trim();
  if (!sectorName) {
    sendJson(res, 400, { error: "Query parameter name is required." });
    return;
  }

  try {
    const payload = await fetchFromNse("/api/equity-stockIndices", { index: sectorName });
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const sectorSymbolNormalized = normalizeSearchSymbol(sectorName);

    const stocks = rows
      .map((row) => {
        const symbol = normalizeSearchSymbol(row.symbol || row.identifier || "");
        if (!symbol || !/^[A-Z0-9.-]+$/.test(symbol)) {
          return null;
        }

        if (symbol === sectorSymbolNormalized || symbol.includes("NIFTY")) {
          return null;
        }

        return {
          symbol,
          ticker: `${symbol}.NS`,
          exchange: "NSE",
          lastPrice: toNumber(row.lastPrice),
          percentChange: toNumber(row.pChange),
          change: toNumber(row.change),
          volume: toNumber(row.totalTradedVolume),
          turnover: toNumber(row.totalTradedValue)
        };
      })
      .filter(Boolean)
      .slice(0, 60);

    sendJson(res, 200, {
      source: "nse_sector",
      sector: sectorName,
      timestamp: payload?.timestamp || null,
      stocks
    });
  } catch (error) {
    sendJson(res, error?.statusCode || 502, {
      error: error?.message || "Failed to load sector stocks."
    });
  }
}

async function handleSearch(res, urlObj) {
  const query = String(urlObj.searchParams.get("q") || "").trim();
  if (!query) {
    sendJson(res, 400, { error: "Query parameter q is required." });
    return;
  }

  let primaryError = null;
  let nseError = null;

  try {
    const primary = await searchWithPrimary(query);
    if (primary.matches.length > 0) {
      sendJson(res, 200, {
        query,
        exchange: "NSE/BSE",
        currency: "INR",
        source: primary.source,
        matches: primary.matches,
        note: primary.note
      });
      return;
    }
  } catch (error) {
    primaryError = error;
  }

  try {
    const nse = await searchWithNse(query);
    if (nse.matches.length > 0) {
      const noteParts = [nse.note];
      if (primaryError) {
        noteParts.push(`Primary search unavailable: ${primaryError.message}`);
      }

      sendJson(res, 200, {
        query,
        exchange: "NSE/BSE",
        currency: "INR",
        source: nse.source,
        matches: nse.matches,
        note: noteParts.filter(Boolean).join(" | ")
      });
      return;
    }
  } catch (error) {
    nseError = error;
  }

  try {
    const yahoo = await searchWithYahoo(query);
    const noteParts = [yahoo.note];
    if (primaryError) {
      noteParts.push(`Primary search unavailable: ${primaryError.message}`);
    }
    if (nseError) {
      noteParts.push(`NSE search unavailable: ${nseError.message}`);
    }

    sendJson(res, 200, {
      query,
      exchange: "NSE/BSE",
      currency: "INR",
      source: yahoo.source,
      matches: yahoo.matches,
      note: noteParts.filter(Boolean).join(" | ")
    });
  } catch (yahooError) {
    const direct = normalizeSearchSymbol(query);
    if (direct && SYMBOL_PATTERN.test(direct)) {
      sendJson(res, 200, {
        query,
        exchange: "NSE/BSE",
        currency: "INR",
        source: "direct-fallback",
        matches: [
          {
            symbol: direct,
            name: direct,
            type: "Direct Symbol",
            region: "India",
            marketOpen: "09:15",
            marketClose: "15:30",
            timezone: "Asia/Kolkata",
            currency: "INR",
            matchScore: 0,
            nseSymbol: `${direct}.NS`,
            bseSymbol: `${direct}.BO`,
            source: "direct-input",
            defaultSymbol: direct
          }
        ],
        note:
          "Search providers are unavailable; returning direct symbol fallback. If no suffix is provided, NSE is used by default.",
        warnings: [primaryError?.message, nseError?.message, yahooError?.message].filter(Boolean)
      });
      return;
    }

    sendJson(res, 502, {
      error: "Search failed on all providers.",
      details: [primaryError?.message, nseError?.message, yahooError?.message].filter(Boolean)
    });
  }
}

async function handleStockChart(res, urlObj) {
  const parts = urlObj.pathname.split("/");
  const requestedSymbol = safeDecode(parts[3]).trim().toUpperCase();
  const chartRange = normalizeChartRange(urlObj.searchParams.get("range"));

  if (!requestedSymbol) {
    sendJson(res, 400, { error: "Stock symbol is required." });
    return;
  }

  if (!SYMBOL_PATTERN.test(requestedSymbol)) {
    sendJson(res, 400, {
      error: "Invalid stock symbol format. Use symbols like ITC, RELIANCE.NS, or TCS.BO."
    });
    return;
  }

  const normalizedInput = parseSymbolInput(requestedSymbol);
  const requestedExchange = requestedSymbol.endsWith(".BO")
    ? "BSE"
    : requestedSymbol.endsWith(".NS")
      ? "NSE"
      : null;

  try {
    const chartBundle = await fetchYahooChartSeries(normalizedInput.ticker, chartRange);
    const ticker = String(chartBundle.ticker || normalizedInput.ticker).toUpperCase();
    const exchange = exchangeFromTicker(ticker);

    const warnings = [];
    if (requestedExchange && exchange !== requestedExchange) {
      warnings.push(
        `Requested ${requestedExchange} chart, but provider returned ${exchange}. Showing available fallback chart.`
      );
    }

    sendJson(res, 200, {
      symbol: normalizeSearchSymbol(ticker),
      ticker,
      exchange,
      requestedExchange,
      fallbackExchange: requestedExchange && exchange !== requestedExchange ? exchange : null,
      range: chartBundle.chartRange,
      interval: chartBundle.interval,
      marketState: chartBundle.market?.state || "UNKNOWN",
      lastTradeDate: chartBundle.market?.lastTradeDate || null,
      lastTradeTimeText: chartBundle.market?.lastTradeTimeText || null,
      points: chartBundle.points || [],
      warnings
    });
  } catch (error) {
    if (requestedExchange === "BSE") {
      try {
        const nseQuote = await fetchFromNse(
          "/api/quote-equity",
          { symbol: normalizedInput.baseSymbol },
          normalizedInput.baseSymbol
        );
        const nseTrade = await fetchFromNse(
          "/api/quote-equity",
          {
            symbol: normalizedInput.baseSymbol,
            section: "trade_info"
          },
          normalizedInput.baseSymbol
        );
        const nseResponse = buildNseResponse(
          normalizedInput.baseSymbol,
          nseQuote,
          nseTrade,
          error?.message || null
        );

        sendJson(res, 200, {
          symbol: nseResponse.symbol,
          ticker: nseResponse.ticker,
          exchange: "NSE",
          requestedExchange: "BSE",
          fallbackExchange: "NSE",
          range: chartRange,
          interval: "snapshot",
          marketState: nseResponse.market?.state || "UNKNOWN",
          lastTradeDate: nseResponse.market?.lastTradeDate || nseResponse.summary?.latestTradingDay || null,
          lastTradeTimeText:
            nseResponse.market?.lastTradeTimeText || nseResponse.summary?.latestTradingDay || null,
          points: nseResponse.chart || [],
          warnings: [
            "Requested BSE chart is currently unavailable; showing NSE fallback chart.",
            error?.message || "Unknown provider error."
          ]
        });
        return;
      } catch {
        // Continue to standard error response below.
      }
    }

    const explicitExchangeHint = requestedSymbol.endsWith(".BO")
      ? "Requested BSE (.BO) symbol. BSE chart data is currently unavailable from active providers."
      : requestedSymbol.endsWith(".NS")
        ? "Requested NSE (.NS) symbol. NSE chart data is currently unavailable from active providers."
        : null;

    sendJson(res, error?.statusCode || 502, {
      error: error?.message || "Failed to load chart data.",
      details: [explicitExchangeHint].filter(Boolean)
    });
  }
}

async function handleStock(res, urlObj) {
  const parts = urlObj.pathname.split("/");
  const requestedSymbol = safeDecode(parts[3]).trim().toUpperCase();
  const chartRange = normalizeChartRange(urlObj.searchParams.get("range"));
  const requestedExchange = requestedSymbol.endsWith(".BO")
    ? "BSE"
    : requestedSymbol.endsWith(".NS")
      ? "NSE"
      : null;

  if (!requestedSymbol) {
    sendJson(res, 400, { error: "Stock symbol is required." });
    return;
  }

  if (!SYMBOL_PATTERN.test(requestedSymbol)) {
    sendJson(res, 400, {
      error: "Invalid stock symbol format. Use symbols like ITC, RELIANCE.NS, or TCS.BO."
    });
    return;
  }

  const normalizedInput = parseSymbolInput(requestedSymbol);
  let primaryError = null;
  let nseError = null;

  try {
    const primaryPayload = await fetchFromPrimary("/stock", {
      symbol: normalizedInput.querySymbol,
      res: "num"
    });

    const response = buildPrimaryResponse(primaryPayload, normalizedInput);
    await enrichResponseWithYahooChart(response, chartRange);
    sendJson(res, 200, response);
    return;
  } catch (error) {
    primaryError = error;
  }

  if (normalizedInput.exchange === "NSE") {
    try {
      const nseQuote = await fetchFromNse(
        "/api/quote-equity",
        { symbol: normalizedInput.baseSymbol },
        normalizedInput.baseSymbol
      );
      const nseTrade = await fetchFromNse(
        "/api/quote-equity",
        {
          symbol: normalizedInput.baseSymbol,
          section: "trade_info"
        },
        normalizedInput.baseSymbol
      );

      const nseResponse = buildNseResponse(
        normalizedInput.baseSymbol,
        nseQuote,
        nseTrade,
        primaryError?.message || null
      );
      await enrichResponseWithYahooChart(nseResponse, chartRange);
      sendJson(res, 200, nseResponse);
      return;
    } catch (error) {
      nseError = error;
    }
  }

  try {
    const warningParts = [primaryError?.message, nseError?.message].filter(Boolean);
    const yahooResponse = await buildYahooResponse(
      normalizedInput,
      warningParts.length ? warningParts.join(" | ") : null,
      chartRange
    );

    const actualExchange = String(yahooResponse.exchange || "").toUpperCase();
    if (requestedExchange && actualExchange && actualExchange !== requestedExchange) {
      yahooResponse.requestedExchange = requestedExchange;
      yahooResponse.fallbackExchange = actualExchange;
      yahooResponse.partialErrors = Array.isArray(yahooResponse.partialErrors)
        ? yahooResponse.partialErrors
        : [];
      yahooResponse.partialErrors.push(
        `Requested ${requestedExchange} quote is unavailable right now; showing ${actualExchange} fallback data.`
      );
    }

    sendJson(res, 200, yahooResponse);
  } catch (yahooError) {
    if (requestedExchange === "BSE") {
      try {
        const nseQuote = await fetchFromNse(
          "/api/quote-equity",
          { symbol: normalizedInput.baseSymbol },
          normalizedInput.baseSymbol
        );
        const nseTrade = await fetchFromNse(
          "/api/quote-equity",
          {
            symbol: normalizedInput.baseSymbol,
            section: "trade_info"
          },
          normalizedInput.baseSymbol
        );

        const warningParts = [
          primaryError?.message,
          nseError?.message,
          yahooError?.message
        ].filter(Boolean);
        const nseFallbackResponse = buildNseResponse(
          normalizedInput.baseSymbol,
          nseQuote,
          nseTrade,
          warningParts.join(" | ")
        );
        await enrichResponseWithYahooChart(nseFallbackResponse, chartRange);
        nseFallbackResponse.requestedExchange = "BSE";
        nseFallbackResponse.fallbackExchange = "NSE";
        nseFallbackResponse.partialErrors = Array.isArray(nseFallbackResponse.partialErrors)
          ? nseFallbackResponse.partialErrors
          : [];
        nseFallbackResponse.partialErrors.push(
          "Requested BSE data is currently unavailable; showing NSE fallback data."
        );
        sendJson(res, 200, nseFallbackResponse);
        return;
      } catch {
        // Continue with standard error response below.
      }
    }

    const code = yahooError?.statusCode || 502;
    const explicitExchangeHint = requestedSymbol.endsWith(".BO")
      ? "Requested BSE (.BO) symbol. BSE data is currently unavailable from active providers."
      : requestedSymbol.endsWith(".NS")
        ? "Requested NSE (.NS) symbol. NSE data is currently unavailable from active providers."
        : null;

    sendJson(res, code, {
      error: "Unable to fetch stock data from all providers.",
      details: [
        primaryError?.message,
        nseError?.message,
        yahooError?.message,
        explicitExchangeHint
      ].filter(Boolean)
    });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    applyCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const host = req.headers.host || `localhost:${PORT}`;
    const urlObj = new URL(req.url, `http://${host}`);

    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    if (urlObj.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        providers: {
          primary: STOCK_API_BASE_URL,
          secondary: "NSE official quote/search",
          fallback: "Yahoo Finance chart/search"
        },
        authRequired: false
      });
      return;
    }

    if (urlObj.pathname === "/api/search") {
      await handleSearch(res, urlObj);
      return;
    }

    if (urlObj.pathname === "/api/market/home") {
      await handleMarketHome(res);
      return;
    }

    if (urlObj.pathname === "/api/market/sector") {
      await handleMarketSector(res, urlObj);
      return;
    }

    if (urlObj.pathname.startsWith("/api/stock/") && urlObj.pathname.endsWith("/chart")) {
      await handleStockChart(res, urlObj);
      return;
    }

    if (urlObj.pathname.startsWith("/api/stock/")) {
      await handleStock(res, urlObj);
      return;
    }

    serveStatic(res, urlObj.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Internal server error." });
  }
});

let activePort = PORT;
const maxPortAttempts = 10;
let attempts = 0;

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE" && attempts < maxPortAttempts) {
    attempts += 1;
    activePort += 1;
    console.warn(
      `[WARN] Port ${activePort - 1} is in use. Trying http://${HOST}:${activePort} ...`
    );
    setTimeout(() => {
      server.listen(activePort, HOST);
    }, 120);
    return;
  }

  console.error("[ERROR] Unable to start server:", error?.message || error);
  process.exit(1);
});

server.on("listening", () => {
  console.log(`Server running on http://${HOST}:${activePort}`);
});

server.listen(activePort, HOST);
