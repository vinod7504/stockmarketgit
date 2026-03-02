const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");
const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";
const IST_TIMEZONE = "Asia/Kolkata";

loadEnv(path.join(ROOT_DIR, ".env"));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY;

if (!ALPHA_VANTAGE_KEY) {
  console.warn(
    "[WARN] Missing ALPHA_VANTAGE_KEY in environment. API routes will fail until it is set."
  );
}

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

function toNumber(value) {
  if (value === undefined || value === null || value === "" || value === "None") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getIstNow() {
  const now = new Date();
  return {
    iso: now.toISOString(),
    date: new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      day: "2-digit",
      month: "long",
      year: "numeric",
      weekday: "long"
    }).format(now),
    time: new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }).format(now),
    timezone: IST_TIMEZONE
  };
}

function isBseSymbol(symbol) {
  return String(symbol || "").toUpperCase().endsWith(".BSE");
}

function normalizeToBseSymbol(symbol) {
  const clean = String(symbol || "").trim().toUpperCase();
  if (!clean) {
    return "";
  }
  if (isBseSymbol(clean)) {
    return clean;
  }
  if (clean.includes(".")) {
    return clean;
  }
  return `${clean}.BSE`;
}

function buildAlphaVantageUrl(params) {
  const url = new URL(ALPHA_VANTAGE_BASE_URL);
  url.search = new URLSearchParams({
    ...params,
    apikey: ALPHA_VANTAGE_KEY || ""
  }).toString();
  return url;
}

async function fetchFromAlphaVantage(params) {
  if (!ALPHA_VANTAGE_KEY) {
    throw new Error("Server API key is not configured.");
  }

  const url = buildAlphaVantageUrl(params);
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Alpha Vantage HTTP ${res.status}`);
  }

  const data = await res.json();

  if (data["Error Message"]) {
    throw new Error(data["Error Message"]);
  }

  if (data.Note) {
    throw new Error(data.Note);
  }

  if (data.Information) {
    throw new Error(data.Information);
  }

  return data;
}

function normalizeInsiderTransaction(row) {
  const type =
    row.transaction_type ||
    row.acquisition_or_disposal ||
    row.transaction ||
    row.transaction_code ||
    "";

  const shares =
    toNumber(row.shares) ??
    toNumber(row.share_count) ??
    toNumber(row.shares_traded) ??
    toNumber(row.number_of_shares) ??
    0;

  const sharePrice =
    toNumber(row.share_price) ??
    toNumber(row.price) ??
    toNumber(row.transaction_price) ??
    null;

  const totalValue =
    toNumber(row.value) ??
    toNumber(row.transaction_value) ??
    (sharePrice !== null ? sharePrice * shares : null);

  return {
    insiderName: row.insider_name || row.name || row.executive || "Unknown",
    transactionDate: row.transaction_date || row.filing_date || row.date || "Unknown",
    transactionType: type || "Unknown",
    shares,
    sharePrice,
    totalValue,
    title: row.insider_title || row.title || ""
  };
}

function classifyTransactionType(type) {
  const value = String(type || "").toLowerCase();

  if (
    value.includes("buy") ||
    value.includes("purchase") ||
    value.includes("acquisition") ||
    value === "a"
  ) {
    return "buyer";
  }

  if (
    value.includes("sell") ||
    value.includes("sale") ||
    value.includes("disposal") ||
    value === "d"
  ) {
    return "seller";
  }

  return "other";
}

function aggregateRelatedStocks(newsPayload, targetSymbol) {
  const feed = Array.isArray(newsPayload?.feed) ? newsPayload.feed : [];
  const map = new Map();

  for (const item of feed) {
    const sentiments = Array.isArray(item?.ticker_sentiment) ? item.ticker_sentiment : [];
    for (const s of sentiments) {
      const ticker = String(s.ticker || "").toUpperCase();
      if (!ticker || ticker === targetSymbol || !isBseSymbol(ticker)) {
        continue;
      }

      const relevance = toNumber(s.relevance_score) ?? 0;
      const sentiment = toNumber(s.ticker_sentiment_score) ?? 0;
      const label = s.ticker || ticker;
      const current = map.get(ticker) || {
        ticker,
        label,
        articles: 0,
        relevanceSum: 0,
        sentimentSum: 0
      };

      current.articles += 1;
      current.relevanceSum += relevance;
      current.sentimentSum += sentiment;
      map.set(ticker, current);
    }
  }

  return Array.from(map.values())
    .map((item) => ({
      ticker: item.ticker,
      label: item.label,
      articles: item.articles,
      averageRelevance: item.articles ? item.relevanceSum / item.articles : 0,
      averageSentiment: item.articles ? item.sentimentSum / item.articles : 0
    }))
    .sort((a, b) => {
      const scoreA = a.averageRelevance * a.articles;
      const scoreB = b.averageRelevance * b.articles;
      return scoreB - scoreA;
    })
    .slice(0, 10);
}

function parseDailySeries(dailyPayload) {
  const series = dailyPayload?.["Time Series (Daily)"] || {};
  return Object.entries(series)
    .map(([date, point]) => ({
      date,
      open: toNumber(point["1. open"]),
      high: toNumber(point["2. high"]),
      low: toNumber(point["3. low"]),
      close: toNumber(point["4. close"]),
      volume: toNumber(point["5. volume"])
    }))
    .filter((point) => point.close !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
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

function serveStatic(req, res, urlPathname) {
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

async function handleSearch(req, res, urlObj) {
  const query = String(urlObj.searchParams.get("q") || "").trim();
  if (!query) {
    sendJson(res, 400, { error: "Query parameter q is required." });
    return;
  }

  try {
    const data = await fetchFromAlphaVantage({
      function: "SYMBOL_SEARCH",
      keywords: query
    });

    const matches = Array.isArray(data.bestMatches)
      ? data.bestMatches
          .map((match) => ({
            symbol: String(match["1. symbol"] || "").toUpperCase(),
            name: match["2. name"] || "",
            type: match["3. type"] || "",
            region: match["4. region"] || "",
            marketOpen: match["5. marketOpen"] || "",
            marketClose: match["6. marketClose"] || "",
            timezone: match["7. timezone"] || "",
            currency: String(match["8. currency"] || "").toUpperCase(),
            matchScore: toNumber(match["9. matchScore"]) ?? 0
          }))
          .filter((match) => isBseSymbol(match.symbol) && match.currency === "INR")
          .sort((a, b) => b.matchScore - a.matchScore)
      : [];

    sendJson(res, 200, { query, exchange: "BSE", currency: "INR", matches });
  } catch (error) {
    sendJson(res, 502, { error: error.message || "Search request failed." });
  }
}

async function handleStock(req, res, urlObj) {
  const parts = urlObj.pathname.split("/");
  const requestedSymbol = String(parts[3] || "").trim().toUpperCase();
  if (!requestedSymbol) {
    sendJson(res, 400, { error: "Stock symbol is required." });
    return;
  }

  if (requestedSymbol.includes(".") && !isBseSymbol(requestedSymbol)) {
    sendJson(res, 400, {
      error: "This dashboard supports only BSE symbols and INR pricing."
    });
    return;
  }

  const symbol = normalizeToBseSymbol(requestedSymbol);

  const results = await Promise.allSettled([
    fetchFromAlphaVantage({ function: "OVERVIEW", symbol }),
    fetchFromAlphaVantage({ function: "GLOBAL_QUOTE", symbol }),
    fetchFromAlphaVantage({ function: "TIME_SERIES_DAILY", symbol, outputsize: "compact" }),
    fetchFromAlphaVantage({ function: "INSIDER_TRANSACTIONS", symbol }),
    fetchFromAlphaVantage({ function: "NEWS_SENTIMENT", tickers: symbol, limit: "100" })
  ]);

  const [overviewResult, quoteResult, dailyResult, insiderResult, newsResult] = results;

  const errors = results
    .filter((r) => r.status === "rejected")
    .map((r) => r.reason?.message || "Unknown upstream error.");

  if (errors.length === results.length) {
    sendJson(res, 502, {
      error: "Unable to fetch stock data.",
      details: errors
    });
    return;
  }

  const overview = overviewResult.status === "fulfilled" ? overviewResult.value : {};
  const quotePayload = quoteResult.status === "fulfilled" ? quoteResult.value : {};
  const dailyPayload = dailyResult.status === "fulfilled" ? dailyResult.value : {};
  const insiderPayload = insiderResult.status === "fulfilled" ? insiderResult.value : {};
  const newsPayload = newsResult.status === "fulfilled" ? newsResult.value : {};
  const quote = quotePayload?.["Global Quote"] || {};

  const exchange = String(overview.Exchange || "BSE").toUpperCase();
  const currency = String(overview.Currency || "INR").toUpperCase();

  if (exchange && !exchange.includes("BSE")) {
    sendJson(res, 400, {
      error: "This dashboard supports only BSE symbols."
    });
    return;
  }

  if (currency && currency !== "INR") {
    sendJson(res, 400, {
      error: "This dashboard supports only INR-priced stocks."
    });
    return;
  }

  const chart = parseDailySeries(dailyPayload);
  const latestPoint = chart[chart.length - 1] || null;
  const istNow = getIstNow();

  const quoteCurrentPrice = toNumber(quote["05. price"]);
  const quoteVolume = toNumber(quote["06. volume"]);
  const quoteLatestTradingDay = quote["07. latest trading day"] || null;
  const quotePreviousClose = toNumber(quote["08. previous close"]);
  const quoteDayChange = toNumber(quote["09. change"]);
  const quoteDayChangePercent = quote["10. change percent"] || null;

  const insiderRows = Array.isArray(insiderPayload?.data)
    ? insiderPayload.data.map(normalizeInsiderTransaction)
    : [];

  const buyers = insiderRows.filter(
    (row) => classifyTransactionType(row.transactionType) === "buyer"
  );
  const sellers = insiderRows.filter(
    (row) => classifyTransactionType(row.transactionType) === "seller"
  );

  const summary = {
    currentPrice: quoteCurrentPrice ?? latestPoint?.close ?? null,
    latestTradingDay: quoteLatestTradingDay ?? latestPoint?.date ?? null,
    previousClose:
      quotePreviousClose ?? (chart.length > 1 ? chart[chart.length - 2].close : null),
    dayChange: quoteDayChange,
    dayChangePercent: quoteDayChangePercent,
    peRatio: toNumber(overview.PERatio),
    eps: toNumber(overview.EPS),
    marketCapitalization: toNumber(overview.MarketCapitalization),
    dividendYield: toNumber(overview.DividendYield),
    beta: toNumber(overview.Beta),
    high52Week: toNumber(overview["52WeekHigh"]),
    low52Week: toNumber(overview["52WeekLow"]),
    volume: quoteVolume ?? latestPoint?.volume ?? null,
    currency: "INR"
  };

  sendJson(res, 200, {
    symbol,
    exchange: "BSE",
    currency: "INR",
    name: overview.Name || symbol,
    now: istNow,
    summary,
    overview,
    chart,
    insider: {
      buyers,
      sellers,
      allTransactions: insiderRows
    },
    relatedStocks: aggregateRelatedStocks(newsPayload, symbol),
    newsCount: Array.isArray(newsPayload?.feed) ? newsPayload.feed.length : 0,
    partialErrors: errors
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `localhost:${PORT}`;
    const urlObj = new URL(req.url, `http://${host}`);

    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed." });
      return;
    }

    if (urlObj.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        apiKeyConfigured: Boolean(ALPHA_VANTAGE_KEY)
      });
      return;
    }

    if (urlObj.pathname === "/api/search") {
      await handleSearch(req, res, urlObj);
      return;
    }

    if (urlObj.pathname.startsWith("/api/stock/")) {
      await handleStock(req, res, urlObj);
      return;
    }

    serveStatic(req, res, urlObj.pathname);
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
