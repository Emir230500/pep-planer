const summaryBox = document.querySelector("#goodsSummary");
const listBox = document.querySelector("#goodsList");
const msg = document.querySelector("#goodsMsg");
const importBox = document.querySelector("#goodsImport");
let goodsData = { entries: [], summary: {} };
let goodsFilter = "alerts";

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function money(value) { return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(value) || 0); }
function dateText(value) { const [y, m, d] = String(value || "").split("-"); return y ? `${d}.${m}.${y}` : ""; }
async function api(url, options = {}) {
  const response = await fetch(url, { method: options.method || "GET", headers: { "content-type": "application/json", accept: "application/json" }, body: options.body ? JSON.stringify(options.body) : undefined });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Aktion fehlgeschlagen."); return data;
}
function renderSummary() {
  const s = goodsData.summary || {};
  summaryBox.innerHTML = `<div class="goods-summary-grid"><article><small>Wareneingänge</small><strong>${s.total || 0}</strong></article><article class="danger"><small>Sichere Dubletten</small><strong>${s.duplicates || 0}</strong></article><article class="warning"><small>Hohe Warenwerte</small><strong>${s.unusual || 0}</strong></article><article><small>Aktueller Stand</small><strong>${dateText(s.latestDate) || "–"}</strong></article></div>`;
}
function levelLabel(item) {
  if (item.review?.status === "ok") return "Geprüft: in Ordnung";
  if (item.review?.status === "duplicate") return "Bestätigte Doppelbuchung";
  return ({ duplicate: "Sehr wahrscheinlich doppelt", danger: "Extrem hoher Warenwert", high: "Sehr hoher Warenwert", warning: "Ungewöhnlich hoher Warenwert", normal: item.baseline?.count < 10 ? "Noch zu wenig Vergleichsdaten" : "Keine Auffälligkeit" })[item.level] || "Prüfen";
}
function renderList() {
  const selectedDate = document.querySelector("#goodsDate")?.value || "";
  const alerts = new Set(["duplicate", "danger", "high", "warning"]);
  const entries = (goodsData.entries || []).filter(item => (!selectedDate || item.date === selectedDate) && (goodsFilter === "all" || alerts.has(item.level)));
  if (!entries.length) { listBox.innerHTML = '<div class="panel empty">Für diese Auswahl gibt es keine Auffälligkeiten.</div>'; return; }
  listBox.innerHTML = `<div class="goods-entry-list">${entries.map(item => `<article class="goods-entry ${escapeHtml(item.level)} ${item.review ? "reviewed" : ""}">
    <header><div><small>${escapeHtml(dateText(item.date))} · ${escapeHtml(item.department || "Wareneingang")}</small><h2>${escapeHtml(item.supplier)}</h2></div><strong>${escapeHtml(money(item.value))}</strong></header>
    <div class="goods-reference"><span>Referenzbeleg</span><b>${escapeHtml(item.reference)}</b></div>
    <p class="goods-reason"><b>${escapeHtml(levelLabel(item))}</b><span>${escapeHtml(item.reason)}</span></p>
    ${item.baseline?.count >= 10 ? `<p class="goods-baseline">Typischer Warenwert bei diesem Lieferanten: <b>${escapeHtml(money(item.baseline.typical))}</b> · Vergleich aus ${item.baseline.count} Lieferungen</p>` : ""}
    ${item.duplicateDates?.length > 1 ? `<p class="goods-duplicate-dates">Gefunden am: ${item.duplicateDates.map(dateText).join(" und ")}</p>` : ""}
    <div class="goods-actions"><button data-review-id="${item.id}" data-review-status="ok" class="secondary">In Ordnung</button><button data-review-id="${item.id}" data-review-status="duplicate" class="danger">Doppelbuchung bestätigen</button></div>
  </article>`).join("")}</div>`;
  listBox.querySelectorAll("[data-review-id]").forEach(button => button.addEventListener("click", async () => { await api("/api/me/goods-receipts/review", { method: "POST", body: { id: button.dataset.reviewId, status: button.dataset.reviewStatus } }); await loadGoods(); }));
}
function fillDates() {
  const select = document.querySelector("#goodsDate"); const current = select.value;
  const dates = [...new Set((goodsData.entries || []).map(item => item.date))].sort().reverse();
  select.innerHTML = '<option value="">Alle Tage</option>' + dates.map(date => `<option value="${date}">${dateText(date)}</option>`).join("");
  if (dates.includes(current)) select.value = current;
  else if (goodsData.summary?.latestDate) select.value = goodsData.summary.latestDate;
}
async function loadGoods() {
  try { goodsData = await api("/api/me/goods-receipts"); renderSummary(); fillDates(); renderList(); if (goodsData.canImport) importBox.classList.remove("hidden"); }
  catch (error) { msg.textContent = error.message; msg.classList.add("error"); }
}
document.querySelectorAll("[data-goods-filter]").forEach(button => button.addEventListener("click", () => { goodsFilter = button.dataset.goodsFilter; document.querySelectorAll("[data-goods-filter]").forEach(item => item.classList.toggle("active", item === button)); renderList(); }));
document.querySelector("#goodsDate").addEventListener("change", renderList);
document.querySelector("#goodsImportBtn").addEventListener("click", async () => {
  const files = [...document.querySelector("#goodsFiles").files]; const importMsg = document.querySelector("#goodsImportMsg");
  if (!files.length) { importMsg.textContent = "Bitte Monatsdateien auswählen."; return; }
  importMsg.textContent = "Dateien werden eingelesen…";
  try { const encoded = await Promise.all(files.map(file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, base64: reader.result }); reader.onerror = reject; reader.readAsDataURL(file); }))); const result = await api("/api/me/goods-receipts/upload", { method: "POST", body: { files: encoded } }); importMsg.textContent = `${result.added} Wareneingänge wurden neu übernommen.`; await loadGoods(); }
  catch (error) { importMsg.textContent = error.message; importMsg.classList.add("error"); }
});
loadGoods();
