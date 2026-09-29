const summaryBox = document.querySelector("#goodsSummary");
const listBox = document.querySelector("#goodsList");
const msg = document.querySelector("#goodsMsg");
const rangeMsg = document.querySelector("#goodsRangeMsg");
const importBox = document.querySelector("#goodsImport");
let goodsData = { entries: [], summary: {} };
let goodsFilter = "alerts";
let goodsSupplier = "";
let goodsSort = "supplier";

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function money(value) { return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(value) || 0); }
function dateText(value) { const [y, m, d] = String(value || "").split("-"); return y ? `${d}.${m}.${y}` : ""; }
function supplierKey(value) { return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function referenceKey(value) { return String(value || "").trim().toLowerCase().replace(/\s+/g, ""); }
function isoBerlin(value = new Date()) { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(value); }
function addDays(date, days) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
async function api(url, options = {}) {
  const response = await fetch(url, { method: options.method || "GET", headers: { "content-type": "application/json", accept: "application/json" }, body: options.body ? JSON.stringify(options.body) : undefined });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Aktion fehlgeschlagen."); return data;
}

function rangeBounds() {
  let from = document.querySelector("#goodsFrom")?.value || "";
  let to = document.querySelector("#goodsTo")?.value || "";
  if (from && to && from > to) [from, to] = [to, from];
  return { from, to };
}

function entriesInRange() {
  const { from, to } = rangeBounds();
  return (goodsData.entries || []).filter(item => (!from || item.date >= from) && (!to || item.date <= to));
}

function prepareRangeEntries() {
  const entries = entriesInRange().map(item => {
    const wasDuplicate = item.level === "duplicate";
    return {
      ...item,
      level: wasDuplicate ? "normal" : item.level,
      reason: wasDuplicate ? "Im gewählten Zeitraum noch keine Doppelbuchung erkannt." : item.reason,
      duplicateDates: [],
      duplicateValues: []
    };
  });
  const groups = new Map();
  for (const item of entries) {
    const reference = referenceKey(item.reference);
    if (!reference) continue;
    const key = `${supplierKey(item.supplier)}|${reference}|${Number(item.value).toFixed(2)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  let duplicateGroups = 0;
  for (const items of groups.values()) {
    if (items.length < 2) continue;
    duplicateGroups += 1;
    const dates = [...new Set(items.map(item => item.date))].sort();
    const sameDay = dates.length === 1;
    for (const item of items) {
      item.level = "duplicate";
      item.duplicateDates = dates;
      item.duplicateValues = [Number(item.value)];
      item.reason = sameDay
        ? "Gleicher Lieferant, Referenzbeleg und Warenwert wurde am selben Tag mehrfach erfasst. Bitte prüfen."
        : `Gleicher Lieferant, Referenzbeleg und Warenwert wurde im gewählten Zeitraum an ${dates.length} Tagen erfasst. Bitte prüfen.`;
    }
  }
  return { entries, duplicateGroups };
}

function renderSummary() {
  const prepared = prepareRangeEntries();
  const total = prepared.entries.length;
  const unusual = prepared.entries.filter(item => ["danger", "high", "warning"].includes(item.level)).length;
  const latest = goodsData.summary?.latestDate || "";
  summaryBox.innerHTML = `<div class="goods-summary-grid"><article><small>Wareneingänge im Zeitraum</small><strong>${total}</strong></article><article class="danger"><small>Doppelte / auffällige Belege</small><strong>${prepared.duplicateGroups}</strong></article><article class="warning"><small>Hohe Warenwerte</small><strong>${unusual}</strong></article><article><small>Aktueller Datenstand</small><strong>${dateText(latest) || "–"}</strong></article></div>`;
  renderRangeStatus();
}

function renderRangeStatus() {
  const { from, to } = rangeBounds();
  const latest = goodsData.summary?.latestDate || "";
  rangeMsg.classList.remove("error");
  if (to && latest && latest < to) {
    rangeMsg.textContent = `Achtung: Daten sind aktuell nur bis ${dateText(latest)} importiert. Für den ausgewählten Zeitraum fehlen danach Daten bis ${dateText(to)}.`;
    rangeMsg.classList.add("error");
    return;
  }
  rangeMsg.textContent = from || to ? `Geprüfter Zeitraum: ${from ? dateText(from) : "Beginn"} bis ${to ? dateText(to) : "heute"}.` : "Alle vorhandenen Wareneingänge werden verglichen.";
}

function levelLabel(item) {
  if (item.review?.status === "ok") return "Geprüft: in Ordnung";
  if (item.review?.status === "duplicate") return "Bestätigte Doppelbuchung";
  return ({ duplicate: "Mögliche Doppelbuchung", danger: "Extrem hoher Warenwert", high: "Sehr hoher Warenwert", warning: "Ungewöhnlich hoher Warenwert", normal: item.baseline?.count < 10 ? "Noch zu wenig Vergleichsdaten" : "Keine Auffälligkeit" })[item.level] || "Prüfen";
}

function renderList() {
  const alerts = new Set(["duplicate", "danger", "high", "warning"]);
  const prepared = prepareRangeEntries().entries;
  const entries = prepared.filter(item =>
    (!goodsSupplier || item.supplier === goodsSupplier) &&
    (goodsFilter === "all" || alerts.has(item.level) || item.review?.status === "duplicate")
  ).sort((a, b) => {
    if (goodsSort === "date") return String(b.date).localeCompare(String(a.date)) || String(a.supplier).localeCompare(String(b.supplier), "de") || String(a.reference).localeCompare(String(b.reference), "de", { numeric: true });
    return String(a.supplier).localeCompare(String(b.supplier), "de") || String(b.date).localeCompare(String(a.date)) || String(a.department).localeCompare(String(b.department), "de") || String(a.reference).localeCompare(String(b.reference), "de", { numeric: true });
  });
  if (!entries.length) { listBox.innerHTML = '<div class="panel empty">Für diesen Zeitraum und Filter gibt es keine passenden Wareneingänge.</div>'; return; }
  let previousSupplier = "";
  listBox.innerHTML = `<div class="goods-entry-list">${entries.map(item => {
    const supplierHeading = goodsSort === "supplier" && item.supplier !== previousSupplier ? `<h2 class="goods-supplier-heading">${escapeHtml(item.supplier)}</h2>` : "";
    previousSupplier = item.supplier;
    const supplierInline = goodsSort === "date" ? `<small>${escapeHtml(item.supplier)}</small>` : `<small>${escapeHtml(dateText(item.date))}</small>`;
    const dateInline = goodsSort === "date" ? `<span>${escapeHtml(dateText(item.date))}</span>` : "";
    return `${supplierHeading}<article class="goods-entry ${escapeHtml(item.level)} ${item.review ? "reviewed" : ""}">
    <header><div>${supplierInline}<h2>${escapeHtml(item.department || "Wareneingang")}</h2>${dateInline}</div><strong>${escapeHtml(money(item.value))}</strong></header>
    <div class="goods-reference"><span>Referenzbeleg</span><b>${escapeHtml(item.reference)}</b></div>
    <p class="goods-reason"><b>${escapeHtml(levelLabel(item))}</b><span>${escapeHtml(item.reason || "")}</span></p>
    ${item.baseline?.count >= 10 ? `<p class="goods-baseline">Typischer Warenwert bei diesem Lieferanten: <b>${escapeHtml(money(item.baseline.typical))}</b> · Vergleich aus ${item.baseline.count} Lieferungen</p>` : ""}
    ${item.duplicateDates?.length ? `<p class="goods-duplicate-dates">Gefunden am: ${item.duplicateDates.map(dateText).join(" und ")}</p>` : ""}
    <div class="goods-actions"><button data-review-id="${item.id}" data-review-status="ok" class="secondary">In Ordnung</button><button data-review-id="${item.id}" data-review-status="duplicate" class="danger">Doppelbuchung bestätigen</button></div>
  </article>`; }).join("")}</div>`;
  listBox.querySelectorAll("[data-review-id]").forEach(button => button.addEventListener("click", async () => { await api("/api/me/goods-receipts/review", { method: "POST", body: { id: button.dataset.reviewId, status: button.dataset.reviewStatus } }); await loadGoods(false); }));
}

function fillSuppliers() {
  const select = document.querySelector("#goodsSupplier");
  if (!select) return;
  const current = goodsSupplier || select.value || "";
  const suppliers = [...new Set(entriesInRange().map(item => String(item.supplier || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
  select.innerHTML = '<option value="">Alle Lieferanten</option>' + suppliers.map(supplier => `<option value="${escapeHtml(supplier)}">${escapeHtml(supplier)}</option>`).join("");
  if (suppliers.includes(current)) select.value = current; else goodsSupplier = "";
}

function setDefaultRange() {
  const from = document.querySelector("#goodsFrom");
  const to = document.querySelector("#goodsTo");
  if (!from || !to || from.value || to.value) return;
  const yesterday = addDays(isoBerlin(), -1);
  to.value = yesterday;
  from.value = addDays(yesterday, -34);
  from.max = yesterday;
  to.max = yesterday;
}

function renderAll() { fillSuppliers(); renderSummary(); renderList(); }

async function loadGoods(resetRange = true) {
  try {
    goodsData = await api("/api/me/goods-receipts");
    if (resetRange) setDefaultRange();
    renderAll();
    if (goodsData.canImport) importBox.classList.remove("hidden");
  } catch (error) { msg.textContent = error.message; msg.classList.add("error"); }
}

document.querySelectorAll("[data-goods-filter]").forEach(button => button.addEventListener("click", () => { goodsFilter = button.dataset.goodsFilter; document.querySelectorAll("[data-goods-filter]").forEach(item => item.classList.toggle("active", item === button)); renderList(); }));
["#goodsFrom", "#goodsTo"].forEach(selector => document.querySelector(selector)?.addEventListener("change", renderAll));
document.querySelector("#goodsSupplier")?.addEventListener("change", event => { goodsSupplier = event.target.value; renderList(); });
document.querySelector("#goodsSort")?.addEventListener("change", event => { goodsSort = event.target.value; renderList(); });
document.querySelector("#goodsImportBtn").addEventListener("click", async () => {
  const files = [...document.querySelector("#goodsFiles").files]; const importMsg = document.querySelector("#goodsImportMsg");
  if (!files.length) { importMsg.textContent = "Bitte Monatsdateien auswählen."; return; }
  importMsg.textContent = "Dateien werden eingelesen…";
  importMsg.classList.remove("error");
  try { const encoded = await Promise.all(files.map(file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, base64: reader.result }); reader.onerror = reject; reader.readAsDataURL(file); }))); const result = await api("/api/me/goods-receipts/upload", { method: "POST", body: { files: encoded } }); importMsg.textContent = `${result.added} Wareneingänge wurden neu übernommen.`; await loadGoods(false); }
  catch (error) { importMsg.textContent = error.message; importMsg.classList.add("error"); }
});
loadGoods();
