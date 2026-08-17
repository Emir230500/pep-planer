const content = document.querySelector("#kpiContent");
const msg = document.querySelector("#kpiMsg");
let trendSourceEntries = [];
let activeTrendMetric = "revenue";
let activeTrendRange = "days";

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

function dateText(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value || "-");
}

function trend(value) {
  if (value === null || value === undefined || value === "") return "";
  return Number(value) < 0 ? "negative" : "positive";
}

const trendMetrics = {
  revenue: { label: "Umsatz", value: item => item.revenue, format: value => money(value) },
  customers: { label: "Kunden", value: item => item.customers, format: value => number(value) },
  averageBasket: { label: "D-Bon", value: item => item.averageBasket, format: value => money(value, 2) }
};

function monthLabel(key, long = false) {
  const match = String(key || "").match(/^(\d{4})-(\d{2})/);
  if (!match) return String(key || "-");
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString("de-DE", {
    month: long ? "long" : "short",
    year: "2-digit"
  });
}

function monthlyTrendEntries(entries) {
  const months = new Map();
  for (const item of entries) {
    const key = String(item.date || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    if (!months.has(key)) months.set(key, { key, revenue: 0, customers: 0, revenueDays: 0, customerDays: 0 });
    const month = months.get(key);
    if (item.revenue != null && Number.isFinite(Number(item.revenue))) {
      month.revenue += Number(item.revenue);
      month.revenueDays += 1;
    }
    if (item.customers != null && Number.isFinite(Number(item.customers))) {
      month.customers += Number(item.customers);
      month.customerDays += 1;
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
      averageBasket: month.customerDays && month.customers ? month.revenue / month.customers : null
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
  if (context) context.textContent = activeTrendRange === "months" ? "Dein Markt · Letzte 12 Monate" : "Dein Markt · Letzte 14 Tagesberichte";
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

function renderDashboard(revenue, canSeePrivateInsights = false) {
  const entries = Array.isArray(revenue.entries) ? revenue.entries : [];
  const comparison = Array.isArray(revenue.comparison) ? revenue.comparison : [];
  const latest = entries[0];
  if (!latest) {
    content.innerHTML = '<div class="panel empty">Noch keine Umsatzmail eingelesen. Die Daten erscheinen nach dem automatischen GMX-Abruf.</div>';
    return;
  }
  const ownRank = comparison.findIndex(item => String(item.marketCode) === String(latest.marketCode)) + 1;
  const rankedComparison = comparison.map((item, index) => ({ ...item, rank: index + 1 }));
  const mobileComparison = rankedComparison.slice().sort((a, b) => {
    const aOwn = String(a.marketCode) === String(latest.marketCode);
    const bOwn = String(b.marketCode) === String(latest.marketCode);
    if (aOwn !== bOwn) return aOwn ? -1 : 1;
    return a.rank - b.rank;
  });
  trendSourceEntries = entries;
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

function privateInsightsHtml(latest) {
  return `
    <section class="kpi-trend-card">
      <div class="kpi-trend-head">
        <div>
          <small id="kpiTrendContext">${activeTrendRange === "months" ? "Dein Markt · Letzte 12 Monate" : "Dein Markt · Letzte 14 Tagesberichte"}</small>
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

loadKpis();
