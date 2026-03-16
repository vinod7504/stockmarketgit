const form = document.getElementById("search-form");
const input = document.getElementById("search-input");
const searchStatus = document.getElementById("search-status");
const matchList = document.getElementById("match-list");
const homeStatus = document.getElementById("home-status");
const dayGainersBody = document.getElementById("day-gainers-body");
const dayLosersBody = document.getElementById("day-losers-body");
const weekGainersBody = document.getElementById("week-gainers-body");
const weekLosersBody = document.getElementById("week-losers-body");
const mostBuyDayBody = document.getElementById("most-buy-day-body");
const mostBuyWeekBody = document.getElementById("most-buy-week-body");
const intradayBody = document.getElementById("intraday-body");
const sectorChipList = document.getElementById("sector-chip-list");
const sectorStocksBody = document.getElementById("sector-stocks-body");
const homeDashboard = document.getElementById("home-dashboard");
const stockContent = document.getElementById("stock-content");
const stockTitle = document.getElementById("stock-title");
const stockSubtitle = document.getElementById("stock-subtitle");
const tickerLogo = document.getElementById("ticker-logo");
const priceNow = document.getElementById("price-now");
const priceChange = document.getElementById("price-change");
const exchangeBadge = document.getElementById("exchange-badge");
const currencyBadge = document.getElementById("currency-badge");
const optionChainLink = document.getElementById("option-chain-link");
const refreshBtn = document.getElementById("refresh-btn");
const switchNseBtn = document.getElementById("switch-nse");
const switchBseBtn = document.getElementById("switch-bse");
const searchPrefNseBtn = document.getElementById("search-pref-nse");
const searchPrefBseBtn = document.getElementById("search-pref-bse");
const warningList = document.getElementById("warning-list");
const overviewGrid = document.getElementById("overview-grid");
const fundamentalsGrid = document.getElementById("fundamentals-grid");
const similarStocksBody = document.getElementById("similar-stocks-body");
const topFundsBody = document.getElementById("top-funds-body");
const chartCanvas = document.getElementById("price-chart");
const financialCanvas = document.getElementById("financial-chart");
const chartRangeText = document.getElementById("chart-range-text");
const chartLastValue = document.getElementById("chart-last-value");
const liveTime = document.getElementById("live-time");
const liveDate = document.getElementById("live-date");
const marketTimeLabel = document.getElementById("market-time-label");
const rangeChips = Array.from(document.querySelectorAll(".range-chip"));
const sipToggle = document.getElementById("sip-toggle");
const sipLinks = document.getElementById("sip-links");
const sipGrowwLink = document.getElementById("sip-groww-link");
const sipUpstoxLink = document.getElementById("sip-upstox-link");
const sipZerodhaLink = document.getElementById("sip-zerodha-link");
const sipOtherLink = document.getElementById("sip-other-link");

const todayLowValue = document.getElementById("today-low-value");
const todayHighValue = document.getElementById("today-high-value");
const todayPin = document.getElementById("today-pin");
const weekLowValue = document.getElementById("week-low-value");
const weekHighValue = document.getElementById("week-high-value");
const weekPin = document.getElementById("week-pin");

const statOpen = document.getElementById("stat-open");
const statPrevClose = document.getElementById("stat-prev-close");
const statVolume = document.getElementById("stat-volume");
const statValue = document.getElementById("stat-value");
const statUpper = document.getElementById("stat-upper");
const statLower = document.getElementById("stat-lower");

const aboutText = document.getElementById("about-text");
const aboutFounded = document.getElementById("about-founded");
const aboutIndustry = document.getElementById("about-industry");
const aboutExchange = document.getElementById("about-exchange");
const aboutSymbol = document.getElementById("about-symbol");

const shPromoters = document.getElementById("sh-promoters");
const shMf = document.getElementById("sh-mf");
const shRetail = document.getElementById("sh-retail");
const shPromotersVal = document.getElementById("sh-promoters-val");
const shMfVal = document.getElementById("sh-mf-val");
const shRetailVal = document.getElementById("sh-retail-val");

const IST_TIMEZONE = "Asia/Kolkata";
const DEFAULT_REMOTE_API_BASE_URL = "https://stockmarketgit.onrender.com";
const API_BASE_URL = (() => {
  const override = String(window.__API_BASE_URL__ || "").trim();
  if (override) {
    return override;
  }

  const host = String(window.location.hostname || "").toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") {
    return window.location.origin;
  }

  return DEFAULT_REMOTE_API_BASE_URL;
})();

let currentSymbol = null;
let currentBaseSymbol = null;
let mainChart = null;
let financialChart = null;
let preferredExchange = "NSE";
let currentSectorName = "";
let currentChartRange = "1D";
let lastSearchQuery = "";

function buildApiUrl(pathOrUrl) {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) {
    return API_BASE_URL;
  }
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  if (raw.startsWith("/")) {
    return `${API_BASE_URL}${raw}`;
  }
  return `${API_BASE_URL}/${raw}`;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "" || value === "-") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(value, maxFractionDigits = 2) {
  const n = toNumber(value);
  if (n === null) {
    return "-";
  }
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: maxFractionDigits }).format(n);
}

function formatCurrency(value) {
  const n = toNumber(value);
  if (n === null) {
    return "-";
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(n);
}

function formatCompact(value) {
  const n = toNumber(value);
  if (n === null) {
    return "-";
  }
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(n);
}

function formatPercent(value) {
  const n = toNumber(value);
  if (n === null) {
    return "-";
  }
  const percent = Math.abs(n) <= 1 ? n * 100 : n;
  return `${percent.toFixed(2)}%`;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatUnixToIstLabel(input) {
  const raw = toNumber(input);
  if (raw === null) {
    return "";
  }

  const ms = raw > 1000000000000 ? raw : raw * 1000;
  const dt = new Date(ms);
  if (Number.isNaN(dt.getTime())) {
    return "";
  }

  return dt.toLocaleString("en-IN", {
    timeZone: IST_TIMEZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

function resolveStockUpdateText(data) {
  const market = data?.market || {};
  const overview = data?.overview || {};
  if (data?.providerTimestampText) {
    return String(data.providerTimestampText);
  }

  if (market.lastTradeTimeText) {
    return market.lastTradeTimeText;
  }

  const fromTimestamp = formatUnixToIstLabel(overview.Timestamp);
  if (fromTimestamp) {
    return fromTimestamp;
  }

  if (overview.LastUpdateTime) {
    return String(overview.LastUpdateTime);
  }

  if (overview.Timestamp) {
    return String(overview.Timestamp);
  }

  if (overview.LastUpdate) {
    return String(overview.LastUpdate);
  }

  if (data?.summary?.latestTradingDay) {
    return String(data.summary.latestTradingDay);
  }

  return "Unavailable";
}

function resolveMarketStateText(data) {
  const stateRaw = String(data?.market?.state || "").toUpperCase();
  if (!stateRaw || stateRaw === "UNKNOWN") {
    return "";
  }
  if (stateRaw === "REGULAR" || stateRaw === "OPEN") {
    return "Market Open";
  }
  return `Market ${stateRaw}`;
}

function formatDelayText(seconds) {
  const n = toNumber(seconds);
  if (n === null) {
    return "";
  }
  if (n < 60) {
    return `Delay ${Math.max(0, Math.floor(n))}s`;
  }
  if (n < 3600) {
    return `Delay ${Math.floor(n / 60)}m`;
  }
  return `Delay ${Math.floor(n / 3600)}h`;
}

function setMarketUpdateDisplay(data) {
  const updateText = resolveStockUpdateText(data);
  const stateText = resolveMarketStateText(data);
  const delayText = formatDelayText(data?.dataDelaySeconds);
  const mongoText = data?.fromMongoCache ? "Mongo snapshot" : "";
  marketTimeLabel.textContent = "Last Market Update (IST)";
  liveTime.textContent = updateText || "--";
  liveDate.textContent = [stateText, delayText, mongoText].filter(Boolean).join(" • ") || "Source timestamp from exchange feed";
}

function formatPointAxisLabel(point, range = "1D") {
  const ts = toNumber(point?.timestamp);
  if (ts === null) {
    return String(point?.date || "-");
  }

  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) {
    return String(point?.date || "-");
  }

  const isIntraday = range === "1D" || range === "1W";
  return dt.toLocaleString("en-IN", {
    timeZone: IST_TIMEZONE,
    day: "2-digit",
    month: "short",
    ...(isIntraday
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : { year: range === "1Y" || range === "5Y" || range === "ALL" ? "2-digit" : undefined })
  });
}

function formatPointTooltipLabel(point) {
  const ts = toNumber(point?.timestamp);
  if (ts === null) {
    return String(point?.date || "-");
  }
  return formatUnixToIstLabel(ts);
}

function setActiveRangeChip(range) {
  const normalized = String(range || "1D").toUpperCase();
  rangeChips.forEach((chip) => {
    chip.classList.toggle("chip-active", chip.dataset.range === normalized);
  });
}

function normalizeBaseSymbol(rawSymbol) {
  const clean = String(rawSymbol || "")
    .trim()
    .toUpperCase()
    .replace(/\.(NS|BO)$/i, "");

  if (!/^[A-Z0-9._-]+$/.test(clean)) {
    return "";
  }

  return clean;
}

function buildBrokerSlug(name, symbol) {
  let source = String(name || "").trim();
  if (!source) {
    source = String(symbol || "").trim();
  }

  if (!source) {
    return "";
  }

  return source
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\blimited\b/g, "ltd")
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function detectInstrumentType(data, fallbackName = "", fallbackSymbol = "") {
  const name = String(data?.name || data?.overview?.CompanyName || fallbackName || "").toLowerCase();
  const symbol = String(data?.symbol || fallbackSymbol || "").toLowerCase();
  const typeHint = String(
    data?.instrumentType ||
      data?.assetType ||
      data?.type ||
      data?.overview?.InstrumentType ||
      data?.overview?.Type ||
      ""
  ).toLowerCase();

  const blob = `${name} ${symbol} ${typeHint}`.replace(/\s+/g, " ");

  if (
    /\b(mutual\s*fund|fund\s*of\s*fund|fof|direct\s*plan|regular\s*plan|nav)\b/.test(blob)
  ) {
    return "mutual-fund";
  }

  if (/\b(etf|exchange\s*traded\s*fund|index\s*etf|bees)\b/.test(blob)) {
    return "etf";
  }

  return "stock";
}

function buildGrowwUrl(type, slug) {
  const pathMap = {
    stock: "stocks",
    etf: "etfs",
    "mutual-fund": "mutual-funds"
  };
  const path = pathMap[type] || pathMap.stock;
  if (!slug) {
    return `https://groww.in/${path}`;
  }
  return `https://groww.in/${path}/${encodeURIComponent(slug)}`;
}

function buildUpstoxUrl(type, slug, isin) {
  const cleanIsin = String(isin || "").trim().toUpperCase();
  if ((type === "stock" || type === "etf") && slug && cleanIsin) {
    return `https://upstox.com/stocks/${encodeURIComponent(slug)}-share-price/${encodeURIComponent(cleanIsin)}/`;
  }

  if (type === "mutual-fund") {
    return "https://upstox.com/mutual-funds/";
  }

  return "https://upstox.com/stocks/";
}

function buildZerodhaUrl(type, queryText) {
  const q = encodeURIComponent(String(queryText || "").trim());
  if (type === "mutual-fund") {
    return q ? `https://coin.zerodha.com/mf?search=${q}` : "https://coin.zerodha.com/mf";
  }
  return q ? `https://kite.zerodha.com/?q=${q}` : "https://kite.zerodha.com/";
}

function updateBrokerLinks(data) {
  const symbol = normalizeBaseSymbol(data?.symbol || currentBaseSymbol || currentSymbol || "");
  const name = String(data?.name || data?.overview?.CompanyName || lastSearchQuery || symbol || "").trim();
  const assetType = detectInstrumentType(data, name, symbol);
  const growwSlug = buildBrokerSlug(name, symbol);
  const preferredQuery = symbol || name || "";
  const isin = data?.overview?.ISIN || data?.overview?.Isin || data?.overview?.isin || "";

  const growwUrl = buildGrowwUrl(assetType, growwSlug);
  const upstoxUrl = buildUpstoxUrl(assetType, growwSlug, isin);
  const zerodhaUrl = buildZerodhaUrl(assetType, preferredQuery);

  if (sipGrowwLink) {
    sipGrowwLink.href = growwUrl;
    sipGrowwLink.textContent = symbol ? `Groww (${symbol})` : "Groww";
    sipGrowwLink.title = name ? `Open ${name} on Groww` : "Open Groww";
  }

  if (sipUpstoxLink) {
    sipUpstoxLink.href = upstoxUrl;
    sipUpstoxLink.textContent = symbol ? `Upstox (${symbol})` : "Upstox";
    sipUpstoxLink.title = name ? `Open ${name} on Upstox` : "Open Upstox";
  }

  if (sipZerodhaLink) {
    sipZerodhaLink.href = zerodhaUrl;
    sipZerodhaLink.textContent = symbol ? `Zerodha (${symbol})` : "Zerodha";
    sipZerodhaLink.title = name ? `Open ${name} on Zerodha` : "Open Zerodha";
  }

  if (sipOtherLink) {
    sipOtherLink.href = "https://www.nseindia.com/invest/first-time-investor";
    sipOtherLink.title = "Learn about demat accounts from NSE";
  }
}

async function fetchJSON(url) {
  const endpoint = buildApiUrl(url);
  const res = await fetch(endpoint);
  const data = await res.json();
  if (!res.ok) {
    const detailText = Array.isArray(data?.details) ? data.details.filter(Boolean).join(" | ") : "";
    throw new Error(data.error || detailText || "Request failed.");
  }
  return data;
}

function clearMatches() {
  matchList.innerHTML = "";
}

function setStatus(message, isError = false) {
  searchStatus.textContent = message;
  searchStatus.style.color = isError ? "#da4545" : "#64748b";
}

function setHomeStatus(message = "") {
  homeStatus.textContent = message;
}

function setPageMode(showStockDetails) {
  const shouldShowStock = Boolean(showStockDetails);
  stockContent.classList.toggle("hidden", !shouldShowStock);
  homeDashboard.classList.toggle("hidden", shouldShowStock);
}

function setPreferredExchange(exchange) {
  preferredExchange = exchange === "BSE" ? "BSE" : "NSE";
  searchPrefNseBtn.classList.toggle("chip-active", preferredExchange === "NSE");
  searchPrefBseBtn.classList.toggle("chip-active", preferredExchange === "BSE");
}

function resolveTickerByPreference(baseSymbol) {
  const clean = String(baseSymbol || "").trim().toUpperCase();
  if (!clean) {
    return "";
  }
  if (clean.endsWith(".NS") || clean.endsWith(".BO")) {
    return clean;
  }
  return `${clean}.${preferredExchange === "BSE" ? "BO" : "NS"}`;
}

function renderSearchMatches(matches) {
  clearMatches();
  matches.slice(0, 12).forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "match-chip";
    btn.textContent = `${item.symbol} • ${item.name}`;
    btn.addEventListener("click", () => {
      lastSearchQuery = item.name || item.symbol || lastSearchQuery;
      const preferredSymbol =
        preferredExchange === "BSE"
          ? item.bseSymbol || item.nseSymbol || item.symbol
          : item.nseSymbol || item.bseSymbol || item.symbol;
      loadStock(preferredSymbol);
    });
    matchList.appendChild(btn);
  });
}

function getTickerFromRow(row, forcePreference = false) {
  const ticker = String(row?.ticker || "").trim().toUpperCase();
  const symbol = String(row?.symbol || "").trim().toUpperCase();

  if (forcePreference && symbol) {
    return resolveTickerByPreference(symbol);
  }

  if (ticker) {
    return ticker;
  }

  if (!symbol) {
    return "";
  }

  const exchange = String(row?.exchange || "NSE").toUpperCase();
  return `${symbol}.${exchange === "BSE" ? "BO" : "NS"}`;
}

function renderHomeRows(tbody, rows, mode = "price", emptyText = "No data available") {
  if (!Array.isArray(rows) || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="3">${escapeHtml(emptyText)}</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .slice(0, 10)
    .map((row) => {
      const ticker = getTickerFromRow(row, false);
      const pct = toNumber(row.percentChange);
      const pctClass = pct !== null && pct < 0 ? "chg-neg" : "chg-pos";
      let middle = formatCurrency(row.lastPrice);

      if (mode === "value") {
        middle = formatCompact(row.turnover ?? row.totalTradedValue);
      } else if (mode === "volume") {
        middle = formatCompact(row.volume ?? row.totalTradedVolume);
      }

      return `
        <tr>
          <td>
            <button class="row-link" data-symbol="${escapeHtml(ticker)}">
              ${escapeHtml(row.symbol || "-")}
            </button>
          </td>
          <td>${escapeHtml(middle)}</td>
          <td class="${pctClass}">${escapeHtml(formatPercent(pct))}</td>
        </tr>
      `;
    })
    .join("");

  tbody.querySelectorAll("button[data-symbol]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.symbol) {
        lastSearchQuery = btn.dataset.symbol || lastSearchQuery;
        loadStock(btn.dataset.symbol);
      }
    });
  });
}

function renderSectorChips(sectors) {
  sectorChipList.innerHTML = "";
  if (!Array.isArray(sectors) || !sectors.length) {
    sectorChipList.innerHTML = `<p class="muted">No sectors available.</p>`;
    return;
  }

  sectors.forEach((sector) => {
    const name = String(sector?.name || "");
    if (!name) {
      return;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sector-chip";
    btn.textContent = name;
    btn.dataset.sector = name;
    btn.addEventListener("click", () => loadSectorStocks(name));
    sectorChipList.appendChild(btn);
  });
}

function updateActiveSectorChip(name) {
  sectorChipList.querySelectorAll(".sector-chip").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.sector === name);
  });
}

async function loadSectorStocks(name, updateHomeMessage = true) {
  const sectorName = String(name || "").trim();
  if (!sectorName) {
    return;
  }

  currentSectorName = sectorName;
  updateActiveSectorChip(sectorName);

  try {
    const data = await fetchJSON(`/api/market/sector?name=${encodeURIComponent(sectorName)}`);
    renderHomeRows(
      sectorStocksBody,
      data.stocks || [],
      "price",
      "No stocks returned for this sector."
    );

    if (updateHomeMessage) {
      setHomeStatus(`Loaded sector: ${sectorName}`);
    }
  } catch (error) {
    sectorStocksBody.innerHTML = `<tr><td colspan="3">${escapeHtml(error.message)}</td></tr>`;
    if (updateHomeMessage) {
      setHomeStatus(error.message || "Failed to load sector stocks.");
    }
  }
}

async function loadHomeDashboard() {
  setHomeStatus("Loading market movers...");

  try {
    const data = await fetchJSON("/api/market/home");

    renderHomeRows(dayGainersBody, data.topGainersDay || [], "price");
    renderHomeRows(dayLosersBody, data.topLosersDay || [], "price");
    renderHomeRows(
      weekGainersBody,
      data.topGainersWeek || [],
      "price",
      "Weekly gainers not available from active feed."
    );
    renderHomeRows(
      weekLosersBody,
      data.topLosersWeek || [],
      "price",
      "Weekly losers not available from active feed."
    );
    renderHomeRows(mostBuyDayBody, data.mostBuyDay || [], "value");
    renderHomeRows(
      mostBuyWeekBody,
      data.mostBuyWeek || [],
      "value",
      "Weekly most-buy feed not available."
    );
    renderHomeRows(intradayBody, data.topIntraday || [], "volume");

    renderSectorChips(data.sectors || []);

    const preferredSector =
      currentSectorName ||
      data.defaultSector ||
      (Array.isArray(data.sectors) && data.sectors[0] ? data.sectors[0].name : "");
    if (preferredSector) {
      await loadSectorStocks(preferredSector, false);
    } else {
      sectorStocksBody.innerHTML = `<tr><td colspan="3">No sector selected.</td></tr>`;
    }

    const notes = [...(data.notes || []), ...(data.partialErrors || [])].filter(Boolean);
    setHomeStatus(notes.length ? notes.join(" | ") : "Home dashboard loaded.");
  } catch (error) {
    setHomeStatus(error.message || "Failed to load market dashboard.");
  }
}

function setRange(pinNode, lowNode, highNode, lowValue, highValue, currentValue) {
  lowNode.textContent = formatCurrency(lowValue);
  highNode.textContent = formatCurrency(highValue);

  const low = toNumber(lowValue);
  const high = toNumber(highValue);
  const current = toNumber(currentValue);

  let percent = 50;
  if (low !== null && high !== null && current !== null && high > low) {
    percent = ((current - low) / (high - low)) * 100;
  }

  percent = Math.max(0, Math.min(100, percent));
  pinNode.style.left = `calc(${percent}% - 6px)`;
}

function renderHero(data) {
  currentBaseSymbol = data.symbol || "";
  if ((data.ticker || "").toUpperCase().endsWith(".BO")) {
    setPreferredExchange("BSE");
  } else if ((data.ticker || "").toUpperCase().endsWith(".NS")) {
    setPreferredExchange("NSE");
  }

  const updateText = resolveStockUpdateText(data);
  const marketStateText = resolveMarketStateText(data);
  const delayText = formatDelayText(data?.dataDelaySeconds);
  const subtitleParts = [
    data.ticker || data.symbol || "-",
    data.exchange || "-",
    `Last update: ${updateText}`
  ];
  if (marketStateText) {
    subtitleParts.push(marketStateText);
  }
  if (delayText) {
    subtitleParts.push(delayText);
  }
  if (data?.fromMongoCache) {
    subtitleParts.push("Mongo snapshot");
  }

  stockTitle.textContent = data.name || data.symbol || "-";
  stockSubtitle.textContent = subtitleParts.join(" • ");
  tickerLogo.textContent = String(data.symbol || data.name || "S").charAt(0).toUpperCase();

  priceNow.textContent = formatCurrency(data.summary?.currentPrice);

  const dayChange = toNumber(data.summary?.dayChange);
  const dayChangePercent = data.summary?.dayChangePercent || "-";
  if (dayChange !== null) {
    const prefix = dayChange > 0 ? "+" : "";
    priceChange.textContent = `${prefix}${formatCurrency(dayChange)} (${dayChangePercent}) 1D`;
    priceChange.classList.remove("pos", "neg");
    priceChange.classList.add(dayChange >= 0 ? "pos" : "neg");
  } else {
    priceChange.textContent = dayChangePercent;
    priceChange.classList.remove("pos", "neg");
  }

  exchangeBadge.textContent = data.exchange || "-";
  currencyBadge.textContent = data.currency || "INR";

  const quoteSymbol = data.symbol || currentBaseSymbol || "";
  const exchange = String(data.exchange || "").toUpperCase();
  if (exchange === "NSE" && quoteSymbol) {
    optionChainLink.href = "https://www.nseindia.com/option-chain";
  } else {
    optionChainLink.href = "https://www.nseindia.com/option-chain";
  }

  switchNseBtn.classList.toggle("chip-active", (data.ticker || "").toUpperCase().endsWith(".NS"));
  switchBseBtn.classList.toggle("chip-active", (data.ticker || "").toUpperCase().endsWith(".BO"));

  currentChartRange = String(data.chartRange || currentChartRange || "1D").toUpperCase();
  setActiveRangeChip(currentChartRange);
  setMarketUpdateDisplay(data);
  updateBrokerLinks(data);
}

function renderPerformance(data) {
  const overview = data.overview || {};
  const summary = data.summary || {};

  const dayLow = overview.DayLow ?? summary.low52Week;
  const dayHigh = overview.DayHigh ?? summary.high52Week;

  setRange(todayPin, todayLowValue, todayHighValue, dayLow, dayHigh, summary.currentPrice);
  setRange(
    weekPin,
    weekLowValue,
    weekHighValue,
    summary.low52Week,
    summary.high52Week,
    summary.currentPrice
  );

  statOpen.textContent = formatCurrency(overview.Open);
  statPrevClose.textContent = formatCurrency(summary.previousClose);
  statVolume.textContent = formatCompact(summary.volume);

  const tradedValue =
    toNumber(summary.currentPrice) !== null && toNumber(summary.volume) !== null
      ? toNumber(summary.currentPrice) * toNumber(summary.volume)
      : null;
  statValue.textContent = tradedValue !== null ? formatCompact(tradedValue) : "-";

  statUpper.textContent = formatCurrency(overview.UpperCircuit || overview.upperCP || null);
  statLower.textContent = formatCurrency(overview.LowerCircuit || overview.lowerCP || null);
}

function renderFundamentals(data) {
  const summary = data.summary || {};
  const overview = data.overview || {};

  const entries = [
    ["Market Cap", formatCompact(summary.marketCapitalization)],
    ["P/E Ratio", formatNumber(summary.peRatio)],
    ["EPS (TTM)", formatNumber(summary.eps)],
    ["Dividend Yield", formatPercent(summary.dividendYield)],
    ["Book Value", formatNumber(overview.BookValue)],
    ["Sector", overview.Sector || "-"],
    ["Industry", overview.Industry || "-"],
    ["52W High", formatCurrency(summary.high52Week)],
    ["52W Low", formatCurrency(summary.low52Week)],
    ["Volume", formatCompact(summary.volume)]
  ];

  fundamentalsGrid.innerHTML = entries
    .map(
      ([label, value]) => `
        <article>
          <small>${escapeHtml(label)}</small>
          <p>${escapeHtml(value)}</p>
        </article>
      `
    )
    .join("");
}

function renderFinancialChart(points, symbol) {
  let series = Array.isArray(points) ? points.slice(-5) : [];

  if (!series.length) {
    const fallbackPrice = 0;
    series = [
      { date: "Q1", close: fallbackPrice },
      { date: "Q2", close: fallbackPrice },
      { date: "Q3", close: fallbackPrice },
      { date: "Q4", close: fallbackPrice }
    ];
  }

  const labels = series.map((p) => String(p.date || "-").slice(0, 10));
  const values = series.map((p) => toNumber(p.close) || 0);

  if (financialChart) {
    financialChart.destroy();
  }

  financialChart = new Chart(financialCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: `${symbol} Snapshot`,
          data: values,
          backgroundColor: "rgba(37, 99, 235, 0.85)",
          borderRadius: 6,
          maxBarThickness: 34
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          ticks: {
            callback: (v) => `₹${formatNumber(v, 0)}`
          }
        }
      }
    }
  });
}

function renderMainChart(points, symbol, range = "1D") {
  const series = Array.isArray(points) ? points.slice(-420) : [];
  const normalizedRange = String(range || "1D").toUpperCase();
  const labels = series.map((d) => formatPointAxisLabel(d, normalizedRange));
  const tooltipTitles = series.map((d) => formatPointTooltipLabel(d));
  const prices = series.map((d) => toNumber(d.close));
  const volumes = series.map((d) => toNumber(d.volume));
  const values = prices.filter((v) => v !== null);
  const volumeValues = volumes.filter((v) => v !== null);
  const hasVolume = volumeValues.length > 0;
  const lastPrice = values.length ? values[values.length - 1] : null;
  const lastLabel = tooltipTitles.length
    ? tooltipTitles[tooltipTitles.length - 1]
    : labels.length
      ? labels[labels.length - 1]
      : "";

  chartRangeText.textContent = `Range: ${normalizedRange}`;
  chartLastValue.textContent =
    lastPrice !== null ? `Last: ${formatCurrency(lastPrice)}${lastLabel ? ` • ${lastLabel}` : ""}` : "Last: -";

  if (mainChart) {
    mainChart.destroy();
  }

  const ctx = chartCanvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, chartCanvas.height || 180);
  gradient.addColorStop(0, "rgba(37, 99, 235, 0.35)");
  gradient.addColorStop(1, "rgba(37, 99, 235, 0.02)");

  mainChart = new Chart(chartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "Volume",
          data: volumes,
          yAxisID: "yVolume",
          backgroundColor: "rgba(147, 197, 253, 0.3)",
          borderWidth: 0,
          barPercentage: 1,
          categoryPercentage: 1,
          order: 2
        },
        {
          type: "line",
          label: `${symbol} Price`,
          data: prices,
          yAxisID: "yPrice",
          borderColor: "#60a5fa",
          backgroundColor: gradient,
          borderWidth: 1.6,
          pointRadius: 0,
          pointHoverRadius: 2.5,
          tension: 0,
          fill: true,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0b1f3d",
          borderColor: "#244a7c",
          borderWidth: 1,
          titleColor: "#dbeafe",
          bodyColor: "#dbeafe",
          callbacks: {
            title: (items) => {
              const idx = items?.[0]?.dataIndex ?? -1;
              if (idx < 0) {
                return "";
              }
              return tooltipTitles[idx] || labels[idx] || "";
            },
            label: (ctxItem) => {
              if (ctxItem.dataset.label === "Volume") {
                return `Volume: ${formatCompact(ctxItem.parsed.y)}`;
              }
              return `Price: ${formatCurrency(ctxItem.parsed.y)}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#a8c2e7",
            maxTicksLimit: 9
          },
          grid: {
            color: "rgba(46, 92, 150, 0.3)"
          }
        },
        yPrice: {
          position: "right",
          ticks: {
            color: "#a8c2e7",
            callback: (value) => `₹${formatNumber(value)}`
          },
          grid: {
            color: "rgba(46, 92, 150, 0.45)"
          }
        },
        yVolume: {
          display: hasVolume,
          position: "left",
          beginAtZero: true,
          grid: {
            display: false
          },
          ticks: {
            display: false
          }
        }
      }
    }
  });

  if (!values.length) {
    setStatus("Chart points are limited for this symbol.", true);
  }
}

function renderAbout(data) {
  const overview = data.overview || {};
  const description =
    overview.Description ||
    overview.BusinessSummary ||
    `${data.name || data.symbol} is listed on ${data.exchange || "Indian exchanges"}.`;

  aboutText.textContent = description;
  aboutFounded.textContent = overview.Founded || overview.ListingDate || overview.LastUpdate || "-";
  aboutIndustry.textContent = overview.Industry || "-";
  aboutExchange.textContent = data.exchange || "-";
  aboutSymbol.textContent = data.ticker || data.symbol || "-";
}

function renderShareholding() {
  const promoters = 73.15;
  const mutualFunds = 11.96;
  const retail = 7.21;

  shPromoters.style.width = `${promoters}%`;
  shMf.style.width = `${mutualFunds}%`;
  shRetail.style.width = `${retail}%`;

  shPromotersVal.textContent = `${promoters.toFixed(2)}%`;
  shMfVal.textContent = `${mutualFunds.toFixed(2)}%`;
  shRetailVal.textContent = `${retail.toFixed(2)}%`;
}

function renderTopFunds() {
  const rows = [
    ["Data not provided by active API provider", "-"]
  ];

  topFundsBody.innerHTML = rows
    .map(
      ([name, aum]) => `
        <tr>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(aum)}</td>
        </tr>
      `
    )
    .join("");
}

function renderSimilarStocks(items) {
  if (!Array.isArray(items) || !items.length) {
    similarStocksBody.innerHTML = `
      <tr>
        <td colspan="3">No similar stocks returned by provider.</td>
      </tr>
    `;
    return;
  }

  similarStocksBody.innerHTML = items
    .slice(0, 10)
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.label || item.ticker || "-")}</td>
          <td>${escapeHtml(item.exchange || "-")}</td>
          <td><button class="match-chip" data-symbol="${escapeHtml(item.ticker || "")}">${escapeHtml(item.ticker || "-")}</button></td>
        </tr>
      `
    )
    .join("");

  similarStocksBody.querySelectorAll("button[data-symbol]").forEach((btn) => {
    btn.addEventListener("click", () => {
      lastSearchQuery = btn.dataset.symbol || lastSearchQuery;
      loadStock(btn.dataset.symbol);
    });
  });
}

function renderOverview(overview) {
  const entries = Object.entries(overview || {});
  if (!entries.length) {
    overviewGrid.innerHTML = `<p class="muted">No raw fields returned.</p>`;
    return;
  }

  overviewGrid.innerHTML = entries
    .map(
      ([key, value]) => `
        <article class="overview-item">
          <h5>${escapeHtml(key)}</h5>
          <p>${escapeHtml(value === null || value === undefined || value === "" ? "-" : value)}</p>
        </article>
      `
    )
    .join("");
}

function renderWarnings(partialErrors) {
  if (!Array.isArray(partialErrors) || !partialErrors.length) {
    warningList.innerHTML = `<li>No provider warnings. Data loaded successfully.</li>`;
    return;
  }

  warningList.innerHTML = partialErrors
    .map((entry) => `<li>${escapeHtml(entry)}</li>`)
    .join("");
}

function pickBestMatch(query, matches) {
  const clean = query.trim().toUpperCase();
  return (
    matches.find(
      (m) =>
        m.symbol?.toUpperCase() === clean ||
        m.nseSymbol?.toUpperCase() === clean ||
        m.bseSymbol?.toUpperCase() === clean
    ) || matches[0]
  );
}

function resolveMatchSymbol(query, match) {
  const clean = query.trim().toUpperCase();
  if (clean.endsWith(".BO") && match?.bseSymbol) {
    return match.bseSymbol;
  }
  if (clean.endsWith(".NS") && match?.nseSymbol) {
    return match.nseSymbol;
  }
  if (preferredExchange === "BSE") {
    return match?.bseSymbol || match?.nseSymbol || match?.symbol || "";
  }
  return match?.nseSymbol || match?.bseSymbol || match?.symbol || "";
}

function looksLikeTicker(query) {
  return /^[A-Za-z0-9.-]{1,24}$/.test(query.trim());
}

function normalizeTicker(query) {
  const clean = query.trim().toUpperCase();
  if (!clean) {
    return "";
  }
  if (clean.endsWith(".NS") || clean.endsWith(".BO")) {
    return clean;
  }
  return `${clean}.${preferredExchange === "BSE" ? "BO" : "NS"}`;
}

function buildStockRoute(symbol) {
  const clean = String(symbol || "").trim().toUpperCase();
  if (!clean) {
    return "/";
  }
  return `/stock/${encodeURIComponent(clean)}`;
}

function parseRoutedSymbol(pathname) {
  const rawPath = String(pathname || "").split("?")[0];

  const stockMatch = rawPath.match(/^\/stock\/([^/]+)$/i);
  if (stockMatch && stockMatch[1]) {
    try {
      return decodeURIComponent(stockMatch[1]).trim().toUpperCase();
    } catch {
      return stockMatch[1].trim().toUpperCase();
    }
  }

  const singleMatch = rawPath.match(/^\/([^/]+)$/);
  if (!singleMatch || !singleMatch[1]) {
    return "";
  }

  const reserved = new Set(["index.html", "app.js", "styles.css", "favicon.ico"]);
  const single = singleMatch[1].trim();
  if (!single || reserved.has(single.toLowerCase())) {
    return "";
  }

  if (!looksLikeTicker(single)) {
    return "";
  }

  try {
    return decodeURIComponent(single).trim().toUpperCase();
  } catch {
    return single.toUpperCase();
  }
}

function updateStockRoute(symbol, replace = false) {
  const route = buildStockRoute(symbol);
  if (!route || route === window.location.pathname) {
    return;
  }

  if (replace) {
    window.history.replaceState({ symbol }, "", route);
    return;
  }

  window.history.pushState({ symbol }, "", route);
}

async function searchStocks(query) {
  setStatus("Searching symbols...");
  const data = await fetchJSON(`/api/search?q=${encodeURIComponent(query)}`);
  renderSearchMatches(data.matches || []);

  if (!data.matches?.length) {
    setStatus("No matches found. Trying direct symbol lookup...", true);
    return null;
  }

  setStatus(`Found ${data.matches.length} match(es).`);
  return data.matches;
}

async function loadChartRange(range) {
  if (!currentSymbol) {
    setStatus("Search and open a stock first.", true);
    return;
  }

  const nextRange = String(range || "1D").toUpperCase();
  setActiveRangeChip(nextRange);
  setStatus(`Loading ${currentSymbol} ${nextRange} chart...`);

  try {
    const payload = await fetchJSON(
      `/api/stock/${encodeURIComponent(currentSymbol)}/chart?range=${encodeURIComponent(nextRange)}`
    );
    currentChartRange = String(payload.range || nextRange).toUpperCase();
    renderMainChart(payload.points || [], payload.symbol || currentSymbol, currentChartRange);
    renderWarnings(payload.warnings || []);
    setMarketUpdateDisplay({
      ...payload,
      market: {
        state: payload.marketState,
        lastTradeTimeText: payload.lastTradeTimeText
      }
    });
    setStatus(`Loaded ${currentSymbol} ${currentChartRange} chart.`);
  } catch (error) {
    try {
      const fallback = await fetchJSON(
        `/api/stock/${encodeURIComponent(currentSymbol)}?range=${encodeURIComponent(nextRange)}`
      );
      currentChartRange = String(fallback.chartRange || nextRange).toUpperCase();
      setActiveRangeChip(currentChartRange);
      renderMainChart(fallback.chart || [], fallback.symbol || currentSymbol, currentChartRange);
      renderWarnings(fallback.partialErrors || []);
      setMarketUpdateDisplay(fallback);
      setStatus(`Loaded ${currentSymbol} ${currentChartRange} chart (fallback mode).`);
    } catch (fallbackError) {
      setStatus(fallbackError.message || error.message || `Failed to load ${nextRange} chart.`, true);
    }
  }
}

async function loadStock(symbol, requestedRange = "1D", options = {}) {
  if (!symbol) {
    return;
  }

  const hadVisibleStock = !stockContent.classList.contains("hidden");
  const { updateRoute = true, replaceRoute = false } = options;
  currentSymbol = symbol.toUpperCase();
  currentChartRange = String(requestedRange || currentChartRange || "1D").toUpperCase();
  setActiveRangeChip(currentChartRange);
  setPageMode(true);
  setStatus(`Loading ${currentSymbol}...`);

  try {
    const data = await fetchJSON(
      `/api/stock/${encodeURIComponent(currentSymbol)}?range=${encodeURIComponent(currentChartRange)}`
    );

    renderHero(data);
    renderMainChart(data.chart || [], data.symbol || currentSymbol, currentChartRange);
    renderPerformance(data);
    renderFundamentals(data);
    renderFinancialChart(data.chart || [], data.symbol || currentSymbol);
    renderAbout(data);
    renderShareholding();
    renderTopFunds();
    renderSimilarStocks(data.relatedStocks || []);
    renderOverview(data.overview || {});
    renderWarnings(data.partialErrors || []);

    if (updateRoute) {
      updateStockRoute(data.ticker || currentSymbol, replaceRoute);
    }
    setStatus(`Loaded ${data.ticker || data.symbol}.`);
  } catch (error) {
    updateBrokerLinks({
      symbol: normalizeBaseSymbol(currentSymbol),
      name: lastSearchQuery || normalizeBaseSymbol(currentSymbol)
    });
    if (!hadVisibleStock) {
      setPageMode(false);
    }
    setStatus(error.message || "Failed to load stock data.", true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) {
    return;
  }
  lastSearchQuery = query;
  updateBrokerLinks({ symbol: normalizeBaseSymbol(query), name: query });

  clearMatches();

  try {
    const matches = await searchStocks(query);
    if (matches?.length) {
      const best = pickBestMatch(query, matches);
      await loadStock(resolveMatchSymbol(query, best));
      return;
    }

    if (looksLikeTicker(query)) {
      await loadStock(normalizeTicker(query));
      return;
    }
  } catch (error) {
    if (looksLikeTicker(query)) {
      setStatus(
        `${error.message || "Search failed."} Trying direct ${preferredExchange} lookup...`,
        true
      );
      try {
        await loadStock(normalizeTicker(query));
        return;
      } catch (innerError) {
        setStatus(innerError.message || "Direct lookup failed.", true);
        return;
      }
    }
    setStatus(error.message || "Search failed.", true);
  }
});

refreshBtn.addEventListener("click", async () => {
  if (currentSymbol) {
    await loadStock(currentSymbol, currentChartRange, { updateRoute: false });
  }
});

switchNseBtn.addEventListener("click", async () => {
  setPreferredExchange("NSE");
  if (currentBaseSymbol) {
    await loadStock(`${currentBaseSymbol}.NS`);
  }
});

switchBseBtn.addEventListener("click", async () => {
  setPreferredExchange("BSE");
  if (currentBaseSymbol) {
    await loadStock(`${currentBaseSymbol}.BO`);
  }
});

searchPrefNseBtn.addEventListener("click", () => {
  setPreferredExchange("NSE");
});

searchPrefBseBtn.addEventListener("click", () => {
  setPreferredExchange("BSE");
});

rangeChips.forEach((chip) => {
  chip.addEventListener("click", async () => {
    const range = String(chip.dataset.range || "1D").toUpperCase();
    if (range === currentChartRange && mainChart) {
      return;
    }
    await loadChartRange(range);
  });
});

if (sipToggle && sipLinks) {
  sipToggle.addEventListener("click", () => {
    const isHidden = sipLinks.classList.toggle("hidden");
    sipToggle.setAttribute("aria-expanded", String(!isHidden));
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (!sipToggle.contains(target) && !sipLinks.contains(target)) {
      sipLinks.classList.add("hidden");
      sipToggle.setAttribute("aria-expanded", "false");
    }
  });
}

window.addEventListener("popstate", () => {
  const routed = parseRoutedSymbol(window.location.pathname);
  if (!routed) {
    currentSymbol = null;
    currentBaseSymbol = null;
    setPageMode(false);
    setStatus("Search a stock to view details.");
    return;
  }

  const routedTicker =
    routed.endsWith(".NS") || routed.endsWith(".BO") ? routed : normalizeTicker(routed);
  if (!routedTicker) {
    return;
  }

  loadStock(routedTicker, currentChartRange, { updateRoute: false });
});

marketTimeLabel.textContent = "Last Market Update (IST)";
liveTime.textContent = "--";
liveDate.textContent = "Search a stock to see exchange timestamp";
updateBrokerLinks({});
setPreferredExchange("NSE");
setStatus("Search a stock to view details.");
setPageMode(false);
loadHomeDashboard();
setInterval(loadHomeDashboard, 180000);

const initialRouted = parseRoutedSymbol(window.location.pathname);
if (initialRouted) {
  const initialTicker =
    initialRouted.endsWith(".NS") || initialRouted.endsWith(".BO")
      ? initialRouted
      : normalizeTicker(initialRouted);

  if (initialTicker) {
    loadStock(initialTicker, currentChartRange, { updateRoute: false, replaceRoute: true });
  }
}
