const summaryBox = document.querySelector("#goodsSummary");
const listBox = document.querySelector("#goodsList");
const msg = document.querySelector("#goodsMsg");
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
async function api(url, options = {}) {
  const response = await fetch(url, { method: options.method || "GET", headers: { "content-type": "application/json", accept: "application/json" }, body: options.body ? JSON.stringify(options.body) : undefined });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Aktion fehlgeschlagen."); return data;
}

function annotateReferenceDuplicates() {
  const entries = goodsData.entries || [];
  const groups = new Map();
  for (const item of entries) {
    const key = `${supplierKey(item.supplier)}|${referenceKey(item.reference)}`;
    if (!referenceKey(item.reference)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  let duplicateGroups = 0;
  for (const items of groups.values()) {
    if (items.length < 2) continue;
    const distinct = new Set(items.map(item => `${item.date}|${Number(item.value).toFixed(2)}|${item.department || ""}`));
    if (distinct.size < 2) continue;
    duplicateGroups += 1;
    const dates = [...new Set(items.map(item => item.date))].sort();
    const values = [...new Set(items.map(item => Number(item.value).toFixed(2)))].map(Number).sort((a, b) => a - b);
    const sameValue = values.length === 1;
    const sameDay = dates.length === 1;
    const valueText = values.map(money).join(" / ");
    for (const item of items) {
      item.level = "duplicate";
      item.duplicateDates = dates;
      item.duplicateValues = values;
      if (!sameValue) {
        item.reason = `Gleicher Lieferant und Referenzbeleg mehrfach erfasst, aber mit unterschiedlichen Warenwerten (${valueText}). Bitte prüfen.`;
      } else if (sameDay) {
        item.reason = "Gleicher Lieferant und Referenzbeleg wurde am selben Tag mehrfach erfasst. Bitte prüfen.";
      } else {
        item.reason = `Gleicher Lieferant und Referenzbeleg wurde an ${dates.length} Tagen erfasst. Bitte prüfen.`;
      }
    }
  }
  const s = goodsData.summary || (goodsData.summary = {});
  s.historicalDuplicateGroups = Math.max(Number(s.historicalDuplicateGroups || 0), duplicateGroups);
  const latestDate = s.latestDate || "";
  if (latestDate) s.duplicates = entries.filter(item => item.date === latestDate && item.level === "duplicate").length;
}

function renderSummary() {
  const s = goodsData.summary || {};
  const allDays = !(document.querySelector("#goodsDate")?.value || "");
  const total = allDays ? s.historyTotal : s.total;
  const duplicates = allDays ? (s.historicalDuplicateGroups ?? s.historicalDuplicates) : s.duplicates;
  const unusual = allDays ? s.historicalUnusual : s.unusual;
  summaryBox.innerHTML = `<div class="goods-summary-grid"><article><small>Wareneingänge</small><strong>${total || 0}</strong></article><article class="danger"><small>Doppelte / auffällige Belege</small><strong>${duplicates || 0}</strong></article><article class="warning"><small>Hohe Warenwerte</small><strong>${unusual || 0}</strong></article><article><small>Aktueller Stand</small><strong>${dateText(s.latestDate) || "–"}</strong></article></div>`;
}
function levelLabel(item) {
  if (item.review?.status === "ok") return "Geprüft: in Ordnung";
  if (item.review?.status === "duplicate") return "Bestätigte Doppelbuchung";
  return ({ duplicate: "Mögliche Doppelbuchung", danger: "Extrem hoher Warenwert", high: "Sehr hoher Warenwert", warning: "Ungewöhnlich hoher Warenwert", normal: item.baseline?.count < 10 ? "Noch zu wenig Vergleichsdaten" : "Keine Auffälligkeit" })[item.level] || "Prüfen";
}
function renderList() {
  const selectedDate = document.querySelector("#goodsDate")?.value || "";
  const alerts = new Set(["duplicate", "danger", "high", "warning"]);
  const entries = (goodsData.entries || []).filter(item =>
    (!selectedDate || item.date === selectedDate) &&
    (!goodsSupplier || item.supplier === goodsSupplier) &&
    (goodsFilter === "all" || alerts.has(item.level))
  ).sort((a, b) => {
    if (goodsSort === "date") {
      return String(b.date).localeCompare(String(a.date)) || String(a.supplier).localeCompare(String(b.supplier), "de") || String(a.reference).localeCompare(String(b.reference), "de", { numeric: true });
    }
    return String(a.supplier).localeCompare(String(b.supplier), "de") || String(b.date).localeCompare(String(a.date)) || String(a.department).localeCompare(String(b.department), "de") || String(a.reference).localeCompare(String(b.reference), "de", { numeric: true });
  });
  if (!entries.length) { listBox.innerHTML = '<div class="panel empty">Für diese Auswahl gibt es keine passenden Wareneingänge.</div>'; return; }
  let previousSupplier = "";
  listBox.innerHTML = `<div class="goods-entry-list">${entries.map(item => {
    const supplierHeading = goodsSort === "supplier" && item.supplier !== previousSupplier ? `<h2 class="goods-supplier-heading">${escapeHtml(item.supplier)}</h2>` : "";
    previousSupplier = item.supplier;
    const supplierInline = goodsSort === "date" ? `<small>${escapeHtml(item.supplier)}</small>` : `<small>${escapeHtml(dateText(item.date))}</small>`;
    const dateInline = goodsSort === "date" ? `<span>${escapeHtml(dateText(item.date))}</span>` : "";
    return `${supplierHeading}<article class="goods-entry ${escapeHtml(item.level)} ${item.review ? "reviewed" : ""}">
    <header><div>${supplierInline}<h2>${escapeHtml(item.department || "Wareneingang")}</h2>${dateInline}</div><strong>${escapeHtml(money(item.value))}</strong></header>
    <div class="goods-reference"><span>Referenzbeleg</span><b>${escapeHtml(item.reference)}</b></div>
    <p class="goods-reason"><b>${escapeHtml(levelLabel(item))}</b><span>${escapeHtml(item.reason)}</span></p>
    ${item.baseline?.count >= 10 ? `<p class="goods-baseline">Typischer Warenwert bei diesem Lieferanten: <b>${escapeHtml(money(item.baseline.typical))}</b> · Vergleich aus ${item.baseline.count} Lieferungen</p>` : ""}
    ${item.duplicateDates?.length ? `<p class="goods-duplicate-dates">Gefunden am: ${item.duplicateDates.map(dateText).join(" und ")}${item.duplicateValues?.length > 1 ? ` · Warenwerte: ${item.duplicateValues.map(money).join(" / ")}` : ""}</p>` : ""}
    <div class="goods-actions"><button data-review-id="${item.id}" data-review-status="ok" class="secondary">In Ordnung</button><button data-review-id="${item.id}" data-review-status="duplicate" class="danger">Doppelbuchung bestätigen</button></div>
  </article>`; }).join("")}</div>`;
  listBox.querySelectorAll("[data-review-id]").forEach(button => button.addEventListener("click", async () => { await api("/api/me/goods-receipts/review", { method: "POST", body: { id: button.dataset.reviewId, status: button.dataset.reviewStatus } }); await loadGoods(); }));
}
function fillDates() {
  const select = document.querySelector("#goodsDate"); const current = select.value;
  const dates = Array.isArray(goodsData.availableDates) && goodsData.availableDates.length
    ? goodsData.availableDates
    : [...new Set((goodsData.entries || []).map(item => item.date))].sort().reverse();
  select.innerHTML = '<option value="">Alle Tage</option>' + dates.map(date => `<option value="${date}">${dateText(date)}</option>`).join("");
  if (dates.includes(current)) select.value = current;
  else if (goodsData.summary?.latestDate) select.value = goodsData.summary.latestDate;
}
function fillSuppliers() {
  const select = document.querySelector("#goodsSupplier");
  if (!select) return;
  const current = goodsSupplier || select.value || "";
  const suppliers = [...new Set((goodsData.entries || []).map(item => String(item.supplier || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
  select.innerHTML = '<option value="">Alle Lieferanten</option>' + suppliers.map(supplier => `<option value="${escapeHtml(supplier)}">${escapeHtml(supplier)}</option>`).join("");
  if (suppliers.includes(current)) select.value = current;
}
async function loadGoods() {
  try { goodsData = await api("/api/me/goods-receipts"); annotateReferenceDuplicates(); fillDates(); fillSuppliers(); renderSummary(); renderList(); if (goodsData.canImport) importBox.classList.remove("hidden"); }
  catch (error) { msg.textContent = error.message; msg.classList.add("error"); }
}
document.querySelectorAll("[data-goods-filter]").forEach(button => button.addEventListener("click", () => { goodsFilter = button.dataset.goodsFilter; document.querySelectorAll("[data-goods-filter]").forEach(item => item.classList.toggle("active", item === button)); renderList(); }));
document.querySelector("#goodsDate").addEventListener("change", () => { renderSummary(); renderList(); });
document.querySelector("#goodsSupplier")?.addEventListener("change", event => { goodsSupplier = event.target.value; renderList(); });
document.querySelector("#goodsSort")?.addEventListener("change", event => { goodsSort = event.target.value; renderList(); });
document.querySelector("#goodsImportBtn").addEventListener("click", async () => {
  const files = [...document.querySelector("#goodsFiles").files]; const importMsg = document.querySelector("#goodsImportMsg");
  if (!files.length) { importMsg.textContent = "Bitte Monatsdateien auswählen."; return; }
  importMsg.textContent = "Dateien werden eingelesen…";
  try { const encoded = await Promise.all(files.map(file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, base64: reader.result }); reader.onerror = reject; reader.readAsDataURL(file); }))); const result = await api("/api/me/goods-receipts/upload", { method: "POST", body: { files: encoded } }); importMsg.textContent = `${result.added} Wareneingänge wurden neu übernommen.`; await loadGoods(); }
  catch (error) { importMsg.textContent = error.message; importMsg.classList.add("error"); }
});
loadGoods();
