const content = document.querySelector("#kpiContent");
const msg = document.querySelector("#kpiMsg");
let trendSourceEntries = [];
let activeTrendMetric = "revenue";
let activeTrendRange = "days";
let activeTrendContext = "Dein Markt";
let dashboardRevenue = {};
let dashboardPrivateInsights = false;
let activeDashboardView = "market";
let activeProduceRange = "week";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function money(value, fractionDigits = 0) {
  if (value === null || value === undefined || value === "") return "Noch kein Vergleich";
  return Number(value).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  });
}

function number(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "Noch kein Vergleich";
  const parsed = Number(value);
  return `${parsed > 0 && suffix === " %" ? "+" : ""}${parsed.toLocaleString("de-DE", { maximumFractionDigits: 2 })}${suffix}`;
}

function percent(value) {
  if (value === null || value === undefined || value === "") return "Noch kein Vergleich";
  return `${Number(value).toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;
}

function dateText(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value || "-");
}

function parseIsoDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : null;
}

function isoDateValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currentWeekSummary(entries) {
  const latestDateKey = entries.map(item => String(item.date || "")).filter(Boolean).sort().pop();
  const latestDate = parseIsoDate(latestDateKey);
  if (!latestDate) return null;
  const monday = new Date(latestDate);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const mondayKey = isoDateValue(monday);
  const days = entries
    .filter(item => String(item.date || "") >= mondayKey && String(item.date || "") <= latestDateKey)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!days.length) return null;
  const revenue = days.reduce((sum, item) => sum + (Number(item.revenue) || 0), 0);
  const customerValues = days.filter(item => item.customers != null && Number.isFinite(Number(item.customers)));
  const customers = customerValues.length ? customerValues.reduce((sum, item) => sum + Number(item.customers), 0) : null;
  const priorYearComplete = days.every(item => item.priorYearRevenue != null && Number.isFinite(Number(item.priorYearRevenue)));
  const priorYearRevenue = priorYearComplete ? days.reduce((sum, item) => sum + Number(item.priorYearRevenue), 0) : null;
  const deviation = priorYearRevenue ? (revenue - priorYearRevenue) / priorYearRevenue * 100 : null;
  let runningRevenue = 0;
  const progression = days.map(item => {
    runningRevenue += Number(item.revenue) || 0;
    const parsed = parseIsoDate(item.date);
    return {
      date: item.date,
      day: parsed ? parsed.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "") : "-",
      revenue: Number(item.revenue) || 0,
      runningRevenue
    };
  });
  return {
    mondayKey,
    latestDateKey,
    days,
    revenue,
    customers,
    averageBasket: customers ? revenue / customers : null,
    priorYearRevenue,
    deviation,
    progression
  };
}

function weekRevenueHtml(summary) {
  if (!summary) return "";
  return `
    <section class="kpi-week-card">
      <div class="kpi-week-head">
        <div>
          <small>Aktuelle Woche · ${escapeHtml(dateText(summary.mondayKey))} bis ${escapeHtml(dateText(summary.latestDateKey))}</small>
          <h2>Wochenumsatz</h2>
        </div>
        <span>${summary.days.length} ${summary.days.length === 1 ? "Tagesbericht" : "Tagesberichte"}</span>
      </div>
      <strong class="kpi-week-total">${escapeHtml(money(summary.revenue))}</strong>
      <div class="kpi-week-facts">
        <div><small>Kunden Woche</small><strong>${summary.customers == null ? "-" : escapeHtml(number(summary.customers))}</strong></div>
        <div><small>D-Bon Woche</small><strong>${summary.averageBasket == null ? "-" : escapeHtml(money(summary.averageBasket, 2))}</strong></div>
        <div><small>Zum Vorjahr</small><strong class="${trend(summary.deviation)}">${summary.deviation == null ? "VJ unvollständig" : escapeHtml(number(summary.deviation, " %"))}</strong></div>
      </div>
      <div class="kpi-week-progression" aria-label="Wochenumsatz wächst mit jedem Tagesbericht">
        ${summary.progression.map(item => `
          <div><small>${escapeHtml(item.day)} · ${escapeHtml(dateText(item.date).slice(0, 5))}</small><strong>${escapeHtml(money(item.runningRevenue))}</strong></div>
        `).join("")}
      </div>
      <p>Die Summe wächst automatisch mit jeder neuen Tagesmail.</p>
    </section>
  `;
}

function trend(value) {
  if (value === null || value === undefined || value === "") return "";
  return Number(value) < 0 ? "negative" : "positive";
}

const trendMetrics = {
  revenue: { label: "Umsatz", value: item => item.revenue, format: value => money(value) },
  customers: { label: "Kunden", value: item => item.customers, format: value => number(value) },
  averageBasket: { label: "D-Bon", value: item => item.averageBasket, format: value => money(value, 2) },
  writeOffs: { label: "Abschriften", value: item => item.writeOffsGross == null ? null : Math.abs(Number(item.writeOffsGross)), format: value => money(value, 2) }
};

function monthLabel(key, long = false) {
  const match = String(key || "").match(/^(\d{4})-(\d{2})/);
  if (!match) return String(key || "-");
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString("de-DE", {
    month: long ? "long" : "short",
    year: long ? "numeric" : "2-digit"
  });
}

function monthlyTrendEntries(entries) {
  const months = new Map();
  for (const item of entries) {
    const key = String(item.date || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    if (!months.has(key)) months.set(key, { key, revenue: 0, customers: 0, writeOffs: 0, revenueDays: 0, customerDays: 0, writeOffDays: 0 });
    const month = months.get(key);
    if (item.revenue != null && Number.isFinite(Number(item.revenue))) {
      month.revenue += Number(item.revenue);
      month.revenueDays += 1;
    }
    if (item.customers != null && Number.isFinite(Number(item.customers))) {
      month.customers += Number(item.customers);
      month.customerDays += 1;
    }
    if (item.writeOffsGross != null && Number.isFinite(Number(item.writeOffsGross))) {
      month.writeOffs += Math.abs(Number(item.writeOffsGross));
      month.writeOffDays += 1;
    }
  }
  return Array.from(months.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-12)
    .map(month => ({
      date: `${month.key}-01`,
      chartLabel: monthLabel(month.key),
      fullLabel: monthLabel(month.key, true),
      revenue: month.revenueDays ? month.revenue : null,
      customers: month.customerDays ? month.customers : null,
      averageBasket: month.customerDays && month.customers ? month.revenue / month.customers : null,
      writeOffsGross: month.writeOffDays ? month.writeOffs : null
    }));
}

function displayedTrendEntries() {
  if (activeTrendRange === "months") return monthlyTrendEntries(trendSourceEntries);
  return trendSourceEntries.slice(0, 14).reverse();
}

function trendChartSvg(entries, metricName, rangeName = "days") {
  const metric = trendMetrics[metricName] || trendMetrics.revenue;
  const rows = entries
    .map(item => ({
      date: item.date,
      chartLabel: item.chartLabel || dateText(item.date).slice(0, 5),
      fullLabel: item.fullLabel || dateText(item.date),
      value: Number(metric.value(item))
    }))
    .filter(item => Number.isFinite(item.value));
  if (!rows.length) return '<div class="kpi-trend-empty">Noch keine Werte für diese Kurve vorhanden.</div>';

  const width = 720;
  const top = 36;
  const bottom = 224;
  const left = 34;
  const right = 686;
  const values = rows.map(item => item.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  const padding = max === min ? Math.max(Math.abs(max) * 0.08, 1) : (max - min) * 0.16;
  min -= padding;
  max += padding;
  const xFor = index => rows.length === 1 ? width / 2 : left + index * (right - left) / (rows.length - 1);
  const yFor = value => bottom - (value - min) / (max - min) * (bottom - top);
  const points = rows.map((item, index) => ({ ...item, x: xFor(index), y: yFor(item.value) }));
  let linePath = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const middleX = (previous.x + current.x) / 2;
    linePath += ` C ${middleX.toFixed(1)} ${previous.y.toFixed(1)}, ${middleX.toFixed(1)} ${current.y.toFixed(1)}, ${current.x.toFixed(1)} ${current.y.toFixed(1)}`;
  }
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${bottom} L ${points[0].x.toFixed(1)} ${bottom} Z`;
  const labelEvery = rows.length > 8 ? 2 : 1;
  return `
    <div class="kpi-trend-current"><small>${escapeHtml(metric.label)} ${rangeName === "months" ? "im laufenden Monat" : "aktuell"}</small><strong>${escapeHtml(metric.format(rows[rows.length - 1].value))}</strong></div>
    <svg class="kpi-trend-svg" viewBox="0 0 ${width} 270" role="img" aria-label="${escapeHtml(metric.label)}-Entwicklung über ${rows.length} ${rangeName === "months" ? "Monate" : "Tage"}">
      <defs>
        <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0a84ff" stop-opacity="0.3"></stop>
          <stop offset="100%" stop-color="#0a84ff" stop-opacity="0.02"></stop>
        </linearGradient>
      </defs>
      <line class="kpi-trend-gridline" x1="${left}" y1="${top}" x2="${right}" y2="${top}"></line>
      <line class="kpi-trend-gridline" x1="${left}" y1="${((top + bottom) / 2).toFixed(1)}" x2="${right}" y2="${((top + bottom) / 2).toFixed(1)}"></line>
      <line class="kpi-trend-gridline" x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}"></line>
      <path class="kpi-trend-area" d="${areaPath}"></path>
      <path class="kpi-trend-line" d="${linePath}"></path>
      ${points.map((point, index) => `
        <circle class="kpi-trend-point" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="5">
          <title>${escapeHtml(point.fullLabel)}: ${escapeHtml(metric.format(point.value))}</title>
        </circle>
        ${index % labelEvery === 0 || index === points.length - 1 ? `<text class="kpi-trend-date" x="${point.x.toFixed(1)}" y="252" text-anchor="middle">${escapeHtml(point.chartLabel)}</text>` : ""}
      `).join("")}
    </svg>
    ${rangeName === "months" ? '<p class="kpi-trend-hint">Monatssumme aus den bisher eingelesenen Tagesberichten. Der aktuelle Monat läuft noch.</p>' : ""}
    ${rows.length === 1 ? `<p class="kpi-trend-hint">Die Kurve entsteht automatisch, sobald Daten für einen weiteren ${rangeName === "months" ? "Monat" : "Tag"} vorhanden sind.</p>` : ""}
  `;
}

function updateTrendChart(metricName = activeTrendMetric, rangeName = activeTrendRange) {
  activeTrendMetric = trendMetrics[metricName] ? metricName : "revenue";
  activeTrendRange = ["days", "months"].includes(rangeName) ? rangeName : "days";
  document.querySelectorAll("[data-trend-metric]").forEach(button => {
    const active = button.dataset.trendMetric === activeTrendMetric;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll("[data-trend-range]").forEach(button => {
    const active = button.dataset.trendRange === activeTrendRange;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  const context = document.querySelector("#kpiTrendContext");
  if (context) context.textContent = activeTrendRange === "months" ? `${activeTrendContext} · Letzte 12 Monate` : `${activeTrendContext} · Letzte 14 Tagesberichte`;
  const chart = document.querySelector("#kpiTrendChart");
  if (chart) chart.innerHTML = trendChartSvg(displayedTrendEntries(), activeTrendMetric, activeTrendRange);
}

function ownMarketWarnings(latest) {
  const warnings = [];
  const addDeviation = (label, value) => {
    if (value == null || !Number.isFinite(Number(value))) return;
    const deviation = Number(value);
    if (deviation <= -10) warnings.push({ level: "danger", title: `${label} deutlich unter Vorjahr`, value: number(deviation, " %") });
    else if (deviation <= -5) warnings.push({ level: "warning", title: `${label} unter Vorjahr`, value: number(deviation, " %") });
  };
  addDeviation("Umsatz", latest.priorYearDeviationPercent);
  addDeviation("Kunden", latest.customerDeviationPercent);
  if (latest.averageBasket != null && latest.priorYearAverageBasket != null && Number(latest.priorYearAverageBasket) !== 0) {
    const basketDeviation = (Number(latest.averageBasket) - Number(latest.priorYearAverageBasket)) / Number(latest.priorYearAverageBasket) * 100;
    addDeviation("Durchschnittsbon", Math.round(basketDeviation * 100) / 100);
  }
  if (!warnings.length) {
    return [{ level: "good", title: "Keine auffällige negative Abweichung", value: "Dein Markt liegt innerhalb der eingestellten Grenzwerte." }];
  }
  return warnings;
}

function warningIcon(level) {
  if (level === "danger") return "!";
  if (level === "warning") return "↘";
  return "✓";
}

function dashboardSwitchHtml() {
  return `
    <nav class="kpi-section-switch" aria-label="KPI-Bereich wählen">
      <button type="button" data-kpi-view="market" class="${activeDashboardView === "market" ? "active" : ""}">Gesamtmarkt</button>
      <button type="button" data-kpi-view="produce" class="${activeDashboardView === "produce" ? "active" : ""}">Obst &amp; Gemüse</button>
    </nav>
  `;
}

function bindDashboardSwitch() {
  content.querySelectorAll("[data-kpi-view]").forEach(button => {
    button.addEventListener("click", () => {
      activeDashboardView = button.dataset.kpiView === "produce" ? "produce" : "market";
      renderActiveDashboard();
    });
  });
}

function renderDashboard(revenue, canSeePrivateInsights = false) {
  dashboardRevenue = revenue || {};
  dashboardPrivateInsights = Boolean(canSeePrivateInsights);
  renderActiveDashboard();
}

function renderActiveDashboard() {
  if (activeDashboardView === "produce") renderProduceDashboard(dashboardRevenue, dashboardPrivateInsights);
  else renderMarketDashboard(dashboardRevenue, dashboardPrivateInsights);
  if (content.firstElementChild) content.insertAdjacentHTML("afterbegin", dashboardSwitchHtml());
  bindDashboardSwitch();
}

function renderMarketDashboard(revenue, canSeePrivateInsights = false) {
  const entries = Array.isArray(revenue.entries) ? revenue.entries : [];
  const comparison = Array.isArray(revenue.comparison) ? revenue.comparison : [];
  const latest = entries[0];
  if (!latest) {
    content.innerHTML = '<div class="panel empty">Noch keine Umsatzmail eingelesen. Die Daten erscheinen nach dem automatischen GMX-Abruf.</div>';
    return;
  }
  const ownRank = comparison.findIndex(item => String(item.marketCode) === String(latest.marketCode)) + 1;
  const weekSummary = currentWeekSummary(entries);
  const rankedComparison = comparison.map((item, index) => ({ ...item, rank: index + 1 }));
  const mobileComparison = rankedComparison.slice().sort((a, b) => {
    const aOwn = String(a.marketCode) === String(latest.marketCode);
    const bOwn = String(b.marketCode) === String(latest.marketCode);
    if (aOwn !== bOwn) return aOwn ? -1 : 1;
    return a.rank - b.rank;
  });
  trendSourceEntries = entries;
  activeTrendContext = "Dein Markt";
  content.innerHTML = `
    <section class="revenue-hero">
      <small>Umsatz Vortag · ${escapeHtml(dateText(latest.date))}</small>
      <strong>${escapeHtml(money(latest.revenue))}</strong>
      <span class="${trend(latest.priorYearDeviationPercent)}">
        ${latest.priorYearDeviationPercent == null ? "Noch kein Vorjahresvergleich" : `${escapeHtml(number(latest.priorYearDeviationPercent, " %"))} zum Vorjahr`}
      </span>
    </section>

    <section class="revenue-summary-grid">
      <article><small>Umsatz Vorjahr</small><strong>${escapeHtml(money(latest.priorYearRevenue))}</strong></article>
      <article><small>Kunden</small><strong>${latest.customers == null ? "-" : escapeHtml(number(latest.customers))}</strong></article>
      <article><small>Durchschnittsbon</small><strong>${latest.averageBasket == null ? "-" : escapeHtml(money(latest.averageBasket, 2))}</strong></article>
      <article><small>Rang im Vergleich</small><strong>${ownRank ? `${ownRank} von ${comparison.length}` : "-"}</strong></article>
    </section>

    ${weekRevenueHtml(weekSummary)}

    ${canSeePrivateInsights ? privateInsightsHtml(latest) : ""}

    <details class="revenue-details">
      <summary>Weitere Kennzahlen</summary>
      <div class="revenue-detail-grid">
        <article><small>Kunden zum Vorjahr</small><strong class="${trend(latest.customerDeviationPercent)}">${escapeHtml(number(latest.customerDeviationPercent, " %"))}</strong></article>
        <article><small>Umsatzspanne</small><strong>${escapeHtml(number(latest.grossMarginPercent, " %"))}</strong></article>
        <article><small>Nettoertragsspanne</small><strong>${escapeHtml(number(latest.netMarginPercent, " %"))}</strong></article>
        <article><small>Abschriften</small><strong>${escapeHtml(money(latest.writeOffsGross))}</strong></article>
        <article><small>App-Anteil</small><strong>${escapeHtml(number(latest.appSharePercent, " %"))}</strong></article>
        <article><small>Aktionsanteil</small><strong>${escapeHtml(number(latest.promotionSharePercent, " %"))}</strong></article>
      </div>
    </details>

    <details class="revenue-details kpi-market-comparison">
      <summary>Alle Märkte vergleichen</summary>
      <div class="revenue-table-wrap">
        <table class="revenue-table revenue-comparison-table">
          <thead><tr><th>Rang</th><th>Markt</th><th>Umsatz</th><th>Vorjahr</th><th>Abweichung</th></tr></thead>
          <tbody>${comparison.map((item, index) => `
            <tr class="${String(item.marketCode) === String(latest.marketCode) ? "own-market-row" : ""}">
              <td>${index + 1}</td>
              <td>${escapeHtml(item.marketName)}</td>
              <td>${escapeHtml(money(item.revenue))}</td>
              <td>${escapeHtml(money(item.priorYearRevenue))}</td>
              <td class="${trend(item.priorYearDeviationPercent)}">${escapeHtml(number(item.priorYearDeviationPercent, " %"))}</td>
            </tr>
          `).join("")}</tbody>
        </table>
      </div>
      <div class="market-comparison-cards">
        ${mobileComparison.map(item => {
          const ownMarket = String(item.marketCode) === String(latest.marketCode);
          return `
            <article class="market-comparison-card ${ownMarket ? "own" : ""}">
              <header>
                <span class="market-rank">#${item.rank}</span>
                <strong>${escapeHtml(item.marketName)}</strong>
                ${ownMarket ? '<span class="own-market-badge">Dein Markt</span>' : ""}
              </header>
              <div class="market-card-main">
                <div><small>Umsatz</small><strong>${escapeHtml(money(item.revenue))}</strong></div>
                <span class="market-card-change ${trend(item.priorYearDeviationPercent)}">${item.priorYearDeviationPercent == null ? "Kein VJ" : escapeHtml(number(item.priorYearDeviationPercent, " %"))}</span>
              </div>
              <div class="market-card-facts">
                <div><small>Vorjahr</small><strong>${item.priorYearRevenue == null ? "Kein VJ" : escapeHtml(money(item.priorYearRevenue))}</strong></div>
                <div><small>Kunden</small><strong>${item.customers == null ? "-" : escapeHtml(number(item.customers))}</strong></div>
                <div><small>D-Bon</small><strong>${item.averageBasket == null ? "-" : escapeHtml(money(item.averageBasket, 2))}</strong></div>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </details>
  `;
  document.querySelectorAll("[data-trend-metric]").forEach(button => {
    button.addEventListener("click", () => updateTrendChart(button.dataset.trendMetric));
  });
  document.querySelectorAll("[data-trend-range]").forEach(button => {
    button.addEventListener("click", () => updateTrendChart(activeTrendMetric, button.dataset.trendRange));
  });
}

function produceRangeBounds(latestDate, rangeName) {
  const latest = parseIsoDate(latestDate);
  if (!latest) return { start: "", end: "" };
  const start = new Date(latest);
  if (rangeName === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (rangeName === "month") start.setDate(1);
  return { start: isoDateValue(start), end: latestDate };
}

function producePeriodLabel(rangeName, start, end) {
  if (rangeName === "day") return `Tag · ${dateText(end)}`;
  if (rangeName === "month") return `Laufender Monat · ${monthLabel(String(end).slice(0, 7), true)}`;
  return `Laufende Woche · ${dateText(start)} bis ${dateText(end)}`;
}

function aggregateProduce(revenue, rangeName) {
  const produce = revenue.produce || {};
  const latestDate = produce.latestDate || produce.entries?.[0]?.date || "";
  const bounds = produceRangeBounds(latestDate, rangeName);
  const inRange = item => String(item.date || "") >= bounds.start && String(item.date || "") <= bounds.end;
  const entries = (produce.entries || []).filter(inRange);
  const revenueTotal = entries.reduce((sum, item) => sum + (Number(item.revenue) || 0), 0);
  const writeOffs = entries.reduce((sum, item) => sum + Math.abs(Number(item.writeOffsGross) || 0), 0);
  const customersAvailable = entries.filter(item => item.customers != null && Number.isFinite(Number(item.customers)));
  const customers = customersAvailable.length ? customersAvailable.reduce((sum, item) => sum + Number(item.customers), 0) : null;
  const priorComplete = entries.length > 0 && entries.every(item => item.priorYearRevenue != null && Number.isFinite(Number(item.priorYearRevenue)));
  const priorYearRevenue = priorComplete ? entries.reduce((sum, item) => sum + Number(item.priorYearRevenue), 0) : null;
  const deviation = priorYearRevenue ? (revenueTotal / priorYearRevenue - 1) * 100 : null;
  const overallByDate = new Map((revenue.entries || []).map(item => [String(item.date), item]));
  let matchedProduceRevenue = 0;
  let matchedOverallRevenue = 0;
  let matchedDays = 0;
  for (const item of entries) {
    const overall = overallByDate.get(String(item.date));
    if (!overall || !Number.isFinite(Number(overall.revenue)) || Number(overall.revenue) <= 0) continue;
    matchedProduceRevenue += Number(item.revenue) || 0;
    matchedOverallRevenue += Number(overall.revenue);
    matchedDays += 1;
  }
  const revenueSharePercent = matchedOverallRevenue ? matchedProduceRevenue / matchedOverallRevenue * 100 : null;

  const marketMap = new Map();
  for (const item of (produce.comparisonEntries || []).filter(inRange)) {
    const key = String(item.marketCode || item.marketName || "");
    if (!marketMap.has(key)) marketMap.set(key, { marketCode: item.marketCode, marketName: item.marketName, revenue: 0, priorYearRevenue: 0, priorComplete: true });
    const market = marketMap.get(key);
    market.revenue += Number(item.revenue) || 0;
    if (item.priorYearRevenue == null || !Number.isFinite(Number(item.priorYearRevenue))) market.priorComplete = false;
    else market.priorYearRevenue += Number(item.priorYearRevenue);
  }
  const comparison = Array.from(marketMap.values()).map(item => ({
    ...item,
    priorYearRevenue: item.priorComplete ? item.priorYearRevenue : null,
    priorYearDeviationPercent: item.priorComplete && item.priorYearRevenue ? (item.revenue / item.priorYearRevenue - 1) * 100 : null
  })).sort((a, b) => b.revenue - a.revenue);
  const ownCode = entries[0]?.marketCode || produce.entries?.[0]?.marketCode || "";
  const ownRank = comparison.findIndex(item => String(item.marketCode) === String(ownCode)) + 1;

  const articleMap = new Map();
  for (const report of (produce.articleEntries || []).filter(inRange)) {
    for (const article of (report.articles || [])) {
      const key = String(article.articleNo || article.articleName || "");
      if (!articleMap.has(key)) articleMap.set(key, { articleNo: article.articleNo, articleName: article.articleName, revenue: 0, writeOffs: 0 });
      const total = articleMap.get(key);
      total.revenue += Number(article.revenue) || 0;
      total.writeOffs += Math.abs(Number(article.writeOffsGross) || 0);
    }
  }
  const articles = Array.from(articleMap.values());
  return {
    latest: entries[0] || produce.entries?.[0] || null,
    latestDate,
    bounds,
    entries,
    revenue: revenueTotal,
    priorYearRevenue,
    deviation,
    writeOffs,
    writeOffRate: revenueTotal ? writeOffs / revenueTotal * 100 : null,
    customers,
    averageBasket: customers ? revenueTotal / customers : null,
    revenueSharePercent,
    matchedDays,
    comparison,
    ownRank,
    topRevenue: articles.filter(item => item.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    topWriteOffs: articles.filter(item => item.writeOffs > 0).sort((a, b) => b.writeOffs - a.writeOffs).slice(0, 5)
  };
}

function produceTopListHtml(title, items, valueKey, emptyText) {
  return `
    <section class="produce-ranking-card">
      <h2>${escapeHtml(title)}</h2>
      ${items.length ? `<ol>${items.map(item => `
        <li><span><strong>${escapeHtml(item.articleName)}</strong><small>Art. ${escapeHtml(item.articleNo)}</small></span><b>${escapeHtml(money(item[valueKey], 2))}</b></li>
      `).join("")}</ol>` : `<p class="produce-empty">${escapeHtml(emptyText)}</p>`}
    </section>
  `;
}

function seasonalProduceTip(date) {
  const month = Number(String(date || "").slice(5, 7));
  const tips = {
    1: "Zitrusfrüchte, Kohl, Lauch und Wurzelgemüse sichtbar platzieren.",
    2: "Zitrusfrüchte, Kohl und erste Frühlingsimpulse prüfen.",
    3: "Spargelstart, Kräuter und Frühlingsgemüse rechtzeitig vorbereiten.",
    4: "Spargel, Erdbeeren und Salat gehören jetzt in den Fokus.",
    5: "Erdbeeren, Spargel, Beeren und Grillgemüse aufmerksam nachführen.",
    6: "Beeren, Kirschen, Melonen und Grillgemüse stark präsentieren.",
    7: "Beeren, Steinobst, Melonen und regionale Ware in den Mittelpunkt stellen.",
    8: "Beeren, Melonen, Steinobst und erste Pflaumen aktiv präsentieren.",
    9: "Pflaumen, Trauben, Äpfel, Birnen und Kürbis sichtbar aufbauen.",
    10: "Äpfel, Birnen, Kürbis, Pilze und Kohl als Herbstthemen nutzen.",
    11: "Zitrusfrüchte, Nüsse, Kohl und Suppengemüse in den Fokus nehmen.",
    12: "Zitrusfrüchte, Nüsse, exotische Früchte und Festtagsgemüse hervorheben."
  };
  return tips[month] || "Saisonartikel und regionale Schwerpunkte regelmäßig prüfen.";
}

function produceWarnings(summary) {
  const warnings = [];
  if (summary.deviation != null && summary.deviation <= -10) warnings.push({ level: "danger", title: "Obst-Umsatz deutlich unter Vorjahr", value: number(summary.deviation, " %") });
  else if (summary.deviation != null && summary.deviation <= -5) warnings.push({ level: "warning", title: "Obst-Umsatz unter Vorjahr", value: number(summary.deviation, " %") });
  if (summary.writeOffRate != null && summary.writeOffRate >= 4) warnings.push({ level: "danger", title: "Abschriftenquote sehr hoch", value: percent(summary.writeOffRate) });
  else if (summary.writeOffRate != null && summary.writeOffRate >= 2) warnings.push({ level: "warning", title: "Abschriftenquote beobachten", value: percent(summary.writeOffRate) });
  if (!warnings.length) warnings.push({ level: "good", title: "Keine akute Auffälligkeit", value: "Umsatz und Abschriften liegen innerhalb der Grenzwerte." });
  warnings.push({ level: "season", title: "Saisonhinweis", value: seasonalProduceTip(summary.latestDate) });
  return warnings;
}

function producePrivateInsightsHtml(summary) {
  return `
    <section class="kpi-trend-card">
      <div class="kpi-trend-head">
        <div><small id="kpiTrendContext">${escapeHtml(activeTrendContext)} · Letzte 14 Tagesberichte</small><h2>Umsatz &amp; Abschriften</h2></div>
        <div class="kpi-trend-controls">
          <div class="kpi-range-switch" role="tablist" aria-label="Zeitraum für Kurve wählen">
            <button type="button" role="tab" data-trend-range="days" class="${activeTrendRange === "days" ? "active" : ""}">14 Tage</button>
            <button type="button" role="tab" data-trend-range="months" class="${activeTrendRange === "months" ? "active" : ""}">Monate</button>
          </div>
          <div class="kpi-trend-switch produce-trend-switch" role="tablist" aria-label="Kennzahl für Kurve wählen">
            ${["revenue", "writeOffs"].map(key => `<button type="button" role="tab" data-trend-metric="${key}" class="${key === activeTrendMetric ? "active" : ""}">${escapeHtml(trendMetrics[key].label)}</button>`).join("")}
          </div>
        </div>
      </div>
      <div id="kpiTrendChart">${trendChartSvg(displayedTrendEntries(), activeTrendMetric, activeTrendRange)}</div>
    </section>
    <section class="kpi-warning-card">
      <div class="kpi-warning-head"><small>Nur für Emirkan</small><h2>Warnungen &amp; Saison</h2></div>
      <div class="kpi-warning-list">${produceWarnings(summary).map(item => `
        <article class="kpi-warning-item ${item.level}"><span class="kpi-warning-icon" aria-hidden="true">${item.level === "season" ? "☀" : warningIcon(item.level)}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.value)}</small></div></article>
      `).join("")}</div>
    </section>
  `;
}

function renderProduceDashboard(revenue, canSeePrivateInsights = false) {
  const produce = revenue.produce || {};
  if (!Array.isArray(produce.entries) || !produce.entries.length) {
    content.innerHTML = '<div class="panel empty">Noch keine Obst-Umsatzmail eingelesen. Sobald beide täglichen Obst-Berichte im GMX-Postfach liegen, erscheinen die Daten hier automatisch.</div>';
    return;
  }
  const summary = aggregateProduce(revenue, activeProduceRange);
  trendSourceEntries = produce.entries || [];
  activeTrendContext = "Obst & Gemüse";
  if (!["revenue", "writeOffs"].includes(activeTrendMetric)) activeTrendMetric = "revenue";
  content.innerHTML = `
    <section class="produce-toolbar">
      <div><small>Abteilung</small><h2>Obst &amp; Gemüse</h2></div>
      <div class="produce-range-switch" role="tablist" aria-label="Zeitraum wählen">
        ${[["day", "Tag"], ["week", "Woche"], ["month", "Monat"]].map(([key, label]) => `<button type="button" data-produce-range="${key}" class="${activeProduceRange === key ? "active" : ""}">${label}</button>`).join("")}
      </div>
    </section>
    <section class="revenue-hero produce-hero">
      <small>${escapeHtml(producePeriodLabel(activeProduceRange, summary.bounds.start, summary.bounds.end))}</small>
      <strong>${escapeHtml(money(summary.revenue, 2))}</strong>
      <span class="${trend(summary.deviation)}">${summary.deviation == null ? "Noch kein vollständiger Vorjahresvergleich" : `${escapeHtml(number(summary.deviation, " %"))} zum Vorjahr`}</span>
    </section>
    <section class="revenue-summary-grid produce-summary-grid">
      <article class="produce-share-card"><small>Anteil am Gesamtumsatz</small><strong>${summary.revenueSharePercent == null ? "Noch nicht verfügbar" : escapeHtml(percent(summary.revenueSharePercent))}</strong><em>${summary.matchedDays ? `aus ${summary.matchedDays} gemeinsamem Tagesbericht${summary.matchedDays === 1 ? "" : "en"}` : "Gesamt- und Obstbericht müssen zum selben Tag vorliegen"}</em></article>
      <article><small>Abschriften</small><strong>${escapeHtml(money(summary.writeOffs, 2))}</strong></article>
      <article><small>Abschriftenquote</small><strong>${summary.writeOffRate == null ? "-" : escapeHtml(percent(summary.writeOffRate))}</strong></article>
      <article><small>Rang im Obst-Vergleich</small><strong>${summary.ownRank ? `${summary.ownRank} von ${summary.comparison.length}` : "-"}</strong></article>
    </section>
    <section class="produce-secondary-grid">
      <article><small>Umsatz Vorjahr</small><strong>${summary.priorYearRevenue == null ? "Noch kein Vergleich" : escapeHtml(money(summary.priorYearRevenue, 2))}</strong></article>
      <article><small>Kunden</small><strong>${summary.customers == null ? "-" : escapeHtml(number(summary.customers))}</strong></article>
      <article><small>Durchschnittsbon</small><strong>${summary.averageBasket == null ? "-" : escapeHtml(money(summary.averageBasket, 2))}</strong></article>
      <article><small>Eingelesene Tage</small><strong>${summary.entries.length}</strong></article>
    </section>
    <section class="produce-rankings">
      ${produceTopListHtml("Top 5 Verkaufsartikel", summary.topRevenue, "revenue", "Für diesen Zeitraum fehlen noch Artikeldetails.")}
      ${produceTopListHtml("Top 5 Abschriftenartikel", summary.topWriteOffs, "writeOffs", "Keine Abschriftenartikel in diesem Zeitraum.")}
    </section>
    ${canSeePrivateInsights ? producePrivateInsightsHtml(summary) : ""}
    <details class="revenue-details kpi-market-comparison">
      <summary>Obst-Umsatz aller Märkte</summary>
      <div class="market-comparison-cards produce-market-cards">${summary.comparison.map((item, index) => `
        <article class="market-comparison-card ${index + 1 === summary.ownRank ? "own" : ""}">
          <header><span class="market-rank">#${index + 1}</span><strong>${escapeHtml(item.marketName)}</strong>${index + 1 === summary.ownRank ? '<span class="own-market-badge">Dein Markt</span>' : ""}</header>
          <div class="market-card-main"><div><small>Obst-Umsatz</small><strong>${escapeHtml(money(item.revenue, 2))}</strong></div><span class="market-card-change ${trend(item.priorYearDeviationPercent)}">${item.priorYearDeviationPercent == null ? "Kein VJ" : escapeHtml(number(item.priorYearDeviationPercent, " %"))}</span></div>
        </article>
      `).join("")}</div>
    </details>
  `;
  content.querySelectorAll("[data-produce-range]").forEach(button => button.addEventListener("click", () => {
    activeProduceRange = ["day", "week", "month"].includes(button.dataset.produceRange) ? button.dataset.produceRange : "week";
    renderActiveDashboard();
  }));
  content.querySelectorAll("[data-trend-metric]").forEach(button => button.addEventListener("click", () => updateTrendChart(button.dataset.trendMetric)));
  content.querySelectorAll("[data-trend-range]").forEach(button => button.addEventListener("click", () => updateTrendChart(activeTrendMetric, button.dataset.trendRange)));
}

function privateInsightsHtml(latest) {
  return `
    <section class="kpi-trend-card">
      <div class="kpi-trend-head">
        <div>
          <small id="kpiTrendContext">${activeTrendRange === "months" ? `${escapeHtml(activeTrendContext)} · Letzte 12 Monate` : `${escapeHtml(activeTrendContext)} · Letzte 14 Tagesberichte`}</small>
          <h2>Entwicklung</h2>
        </div>
        <div class="kpi-trend-controls">
          <div class="kpi-range-switch" role="tablist" aria-label="Zeitraum für Kurve wählen">
            <button type="button" role="tab" data-trend-range="days" class="${activeTrendRange === "days" ? "active" : ""}" aria-selected="${activeTrendRange === "days"}">14 Tage</button>
            <button type="button" role="tab" data-trend-range="months" class="${activeTrendRange === "months" ? "active" : ""}" aria-selected="${activeTrendRange === "months"}">Monate</button>
          </div>
          <div class="kpi-trend-switch" role="tablist" aria-label="Kennzahl für Kurve wählen">
            ${Object.entries(trendMetrics).map(([key, metric]) => `<button type="button" role="tab" data-trend-metric="${key}" class="${key === activeTrendMetric ? "active" : ""}" aria-selected="${key === activeTrendMetric}">${escapeHtml(metric.label)}</button>`).join("")}
          </div>
        </div>
      </div>
      <div id="kpiTrendChart">${trendChartSvg(displayedTrendEntries(), activeTrendMetric, activeTrendRange)}</div>
    </section>

    <section class="kpi-warning-card">
      <div class="kpi-warning-head">
        <small>Nur dein Markt</small>
        <h2>Warnungen</h2>
      </div>
      <div class="kpi-warning-list">
        ${ownMarketWarnings(latest).map(item => `
          <article class="kpi-warning-item ${item.level}">
            <span class="kpi-warning-icon" aria-hidden="true">${warningIcon(item.level)}</span>
            <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.value)}</small></div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

async function loadKpis() {
  try {
    const response = await fetch("/api/me/revenue", { headers: { accept: "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "KPIs konnten nicht geladen werden.");
    renderDashboard(data.revenue || {}, Boolean(data.canSeePrivateInsights));
  } catch (error) {
    content.innerHTML = '<div class="panel empty">Kein Zugriff auf die KPI-Seite.</div>';
    msg.textContent = error.message;
    msg.classList.add("error");
  }
}

document.querySelector("#kpiLogoutBtn")?.addEventListener("click", async () => {
  const button = document.querySelector("#kpiLogoutBtn");
  if (button) button.disabled = true;
  try {
    await fetch("/api/logout", { method: "POST", headers: { accept: "application/json" } });
  } finally {
    location.replace("/");
  }
});

loadKpis();

// Keep the dashboard current when the daily report arrives shortly after the
// page was opened. The server de-duplicates the actual GMX checks.
setInterval(loadKpis, 2 * 60 * 1000);
