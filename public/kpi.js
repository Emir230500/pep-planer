const content = document.querySelector("#kpiContent");
const msg = document.querySelector("#kpiMsg");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

function money(value) {
  if (value === null || value === undefined || value === "") return "Noch kein Vergleich";
  return Number(value).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
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

function renderDashboard(revenue) {
  const entries = Array.isArray(revenue.entries) ? revenue.entries : [];
  const comparison = Array.isArray(revenue.comparison) ? revenue.comparison : [];
  const latest = entries[0];
  if (!latest) {
    content.innerHTML = '<div class="panel empty">Noch keine Umsatzmail eingelesen. Die Daten erscheinen nach dem automatischen GMX-Abruf.</div>';
    return;
  }
  const ownRank = comparison.findIndex(item => String(item.marketCode) === String(latest.marketCode)) + 1;
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
      <article><small>Durchschnittsbon</small><strong>${latest.averageBasket == null ? "-" : escapeHtml(money(latest.averageBasket))}</strong></article>
      <article><small>Rang im Vergleich</small><strong>${ownRank ? `${ownRank} von ${comparison.length}` : "-"}</strong></article>
    </section>

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

    <details class="revenue-details">
      <summary>Alle Maerkte vergleichen</summary>
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
    </details>
  `;
}

async function loadKpis() {
  try {
    const response = await fetch("/api/me/revenue", { headers: { accept: "application/json" } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "KPIs konnten nicht geladen werden.");
    renderDashboard(data.revenue || {});
  } catch (error) {
    content.innerHTML = '<div class="panel empty">Kein Zugriff auf die KPI-Seite.</div>';
    msg.textContent = error.message;
    msg.classList.add("error");
  }
}

loadKpis();
