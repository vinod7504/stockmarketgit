const form = document.getElementById("search-form");
const input = document.getElementById("search-input");
const searchStatus = document.getElementById("search-status");
const matchList = document.getElementById("match-list");
const stockContent = document.getElementById("stock-content");
const stockTitle = document.getElementById("stock-title");
const stockSubtitle = document.getElementById("stock-subtitle");
const summaryGrid = document.getElementById("summary-grid");
const buyersTableWrap = document.getElementById("buyers-table-wrap");
const sellersTableWrap = document.getElementById("sellers-table-wrap");
const relatedStocksWrap = document.getElementById("related-stocks");
const overviewGrid = document.getElementById("overview-grid");
const warningList = document.getElementById("warning-list");
const refreshBtn = document.getElementById("refresh-btn");
const chartCanvas = document.getElementById("price-chart");
const liveTime = document.getElementById("live-time");
const liveDate = document.getElementById("live-date");

const IST_TIMEZONE = "Asia/Kolkata";

let currentSymbol = null;
let chart = null;

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value));
}

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(value));
}

function formatCompact(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(Number(value));
}

function updateLiveClock() {
  const now = new Date();
  liveTime.textContent = now.toLocaleTimeString("en-IN", {
    timeZone: IST_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  liveDate.textContent = now.toLocaleDateString("en-IN", {
    timeZone: IST_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

async function fetchJSON(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function clearMatches() {
  matchList.innerHTML = "";
}

function setStatus(message, isError = false) {
  searchStatus.textContent = message;
  searchStatus.style.color = isError ? "#c43838" : "#64748b";
}

function renderSearchMatches(matches) {
  clearMatches();
  const topMatches = matches.slice(0, 10);

  topMatches.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "match-chip";
    btn.textContent = `${item.symbol} • ${item.name}`;
    btn.addEventListener("click", () => loadStock(item.symbol));
    matchList.appendChild(btn);
  });
}

function renderSummary(data) {
  const metrics = [
    { label: "Current Price", value: formatCurrency(data.summary.currentPrice) },
    { label: "Current Date (IST)", value: data.now?.date || "-" },
    { label: "Current Time (IST)", value: data.now?.time || "-" },
    { label: "Latest Trading Day", value: data.summary.latestTradingDay || "-" },
    { label: "P/E Ratio", value: formatNumber(data.summary.peRatio) },
    { label: "EPS", value: formatNumber(data.summary.eps) },
    { label: "Market Cap", value: formatCompact(data.summary.marketCapitalization) },
    {
      label: "Dividend Yield",
      value:
        data.summary.dividendYield !== null
          ? `${(Number(data.summary.dividendYield) * 100).toFixed(2)}%`
          : "-"
    },
    { label: "52W High", value: formatCurrency(data.summary.high52Week) },
    { label: "52W Low", value: formatCurrency(data.summary.low52Week) },
    { label: "Beta", value: formatNumber(data.summary.beta) },
    { label: "Volume", value: formatCompact(data.summary.volume) }
  ];

  summaryGrid.innerHTML = metrics
    .map((m) => `<article class="metric"><h4>${m.label}</h4><p>${m.value}</p></article>`)
    .join("");
}

function renderTable(rows) {
  if (!rows.length) {
    return `<p class="muted">No recent insider records returned for this symbol.</p>`;
  }

  const limited = rows.slice(0, 12);

  return `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Date</th>
          <th>Type</th>
          <th>Shares</th>
          <th>Value (INR)</th>
        </tr>
      </thead>
      <tbody>
        ${limited
          .map(
            (row) => `
              <tr>
                <td>${row.insiderName}</td>
                <td>${row.transactionDate}</td>
                <td>${row.transactionType}</td>
                <td>${formatNumber(row.shares)}</td>
                <td>${formatCurrency(row.totalValue)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderRelatedStocks(items) {
  if (!items.length) {
    relatedStocksWrap.innerHTML =
      `<p class="muted">No related BSE stocks found in recent sentiment feed.</p>`;
    return;
  }

  relatedStocksWrap.innerHTML = items
    .map(
      (item) => `
      <article class="related-card" data-symbol="${item.ticker}">
        <h4>${item.ticker}</h4>
        <p>Mentions: ${item.articles}</p>
        <p>Relevance: ${formatNumber(item.averageRelevance)}</p>
        <p>Sentiment: ${formatNumber(item.averageSentiment)}</p>
      </article>
    `
    )
    .join("");

  relatedStocksWrap.querySelectorAll(".related-card").forEach((node) => {
    node.addEventListener("click", () => loadStock(node.dataset.symbol));
  });
}

function renderOverview(overview) {
  const entries = Object.entries(overview || {});
  if (!entries.length) {
    overviewGrid.innerHTML = `<p class="muted">No fundamentals returned.</p>`;
    return;
  }

  overviewGrid.innerHTML = entries
    .map(
      ([key, value]) => `
      <article class="overview-item">
        <h5>${key}</h5>
        <p>${value || "-"}</p>
      </article>
    `
    )
    .join("");
}

function renderWarnings(partialErrors) {
  warningList.innerHTML = "";
  if (!partialErrors?.length) {
    warningList.innerHTML = `<li style="color:#0f766e;">No warnings. Data loaded successfully.</li>`;
    return;
  }

  warningList.innerHTML = partialErrors.map((error) => `<li>${error}</li>`).join("");
}

function renderChart(points, symbol) {
  const series = points.slice(-120);
  const labels = series.map((d) => d.date);
  const data = series.map((d) => d.close);

  if (chart) {
    chart.destroy();
  }

  chart = new Chart(chartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: `${symbol} Close (INR)`,
          data,
          borderColor: "#00b386",
          backgroundColor: "rgba(0, 208, 156, 0.18)",
          borderWidth: 2,
          fill: true,
          tension: 0.28,
          pointRadius: 0
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
        x: {
          ticks: { maxTicksLimit: 7 }
        },
        y: {
          ticks: {
            callback: (value) => `₹${formatNumber(value)}`
          }
        }
      }
    }
  });
}

async function searchStocks(query) {
  setStatus("Searching BSE stocks...");
  const data = await fetchJSON(`/api/search?q=${encodeURIComponent(query)}`);
  renderSearchMatches(data.matches || []);
  if (!data.matches?.length) {
    setStatus("No BSE INR matches found. Try a different company name.", true);
    return null;
  }

  setStatus(`Found ${data.matches.length} BSE match(es). Loading best match...`);
  return data.matches;
}

function pickBestMatch(query, matches) {
  const clean = query.trim().toUpperCase();
  const bseQuery = clean.endsWith(".BSE") ? clean : `${clean}.BSE`;
  return matches.find((m) => m.symbol.toUpperCase() === bseQuery) || matches[0];
}

async function loadStock(symbol) {
  if (!symbol) {
    return;
  }

  currentSymbol = symbol.toUpperCase();
  setStatus(`Loading ${currentSymbol}...`);
  stockContent.classList.remove("hidden");

  try {
    const data = await fetchJSON(`/api/stock/${encodeURIComponent(currentSymbol)}`);

    stockTitle.textContent = `${data.name} (${data.symbol})`;
    stockSubtitle.textContent = `BSE • INR • ${data.now?.date || "-"} • ${data.now?.time || "-"}`;

    renderSummary(data);
    renderChart(data.chart || [], data.symbol);
    buyersTableWrap.innerHTML = renderTable(data.insider.buyers || []);
    sellersTableWrap.innerHTML = renderTable(data.insider.sellers || []);
    renderRelatedStocks(data.relatedStocks || []);
    renderOverview(data.overview || {});
    renderWarnings(data.partialErrors || []);

    setStatus(`Loaded ${data.symbol}.`);
  } catch (error) {
    setStatus(error.message || "Failed to load stock data.", true);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) {
    return;
  }

  clearMatches();

  try {
    const matches = await searchStocks(query);
    if (!matches?.length) {
      return;
    }
    const best = pickBestMatch(query, matches);
    await loadStock(best.symbol);
  } catch (error) {
    setStatus(error.message || "Search failed.", true);
  }
});

refreshBtn.addEventListener("click", async () => {
  if (currentSymbol) {
    await loadStock(currentSymbol);
  }
});

updateLiveClock();
setInterval(updateLiveClock, 1000);
