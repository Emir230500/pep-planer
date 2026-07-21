let parsedRows = [];
let headers = [];
let currentFileType = "";
let adminState = { plans: [], employees: [], publishedPlans: [] };
let inspected = { plan: null, shifts: [], issues: [], missingEmployees: [], changes: [] };
let lastPepTextNames = [];
let lastCoverageWarning = "";
let editShift = null;

const loginBox = document.querySelector("#adminLogin");
const adminArea = document.querySelector("#adminArea");
const mapping = document.querySelector("#mapping");
const uploadBtn = document.querySelector("#uploadBtn");
const uploadMsg = document.querySelector("#uploadMsg");
const fileInput = document.querySelector("#fileInput");
const pepTextInput = document.querySelector("#pepTextInput");
const uploadModeBox = document.querySelector("#uploadModeBox");

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Fehler");
  return data;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

document.querySelector("#adminLoginBtn").addEventListener("click", async () => {
  await submitAdminLogin();
});

document.querySelector("#adminPassword").addEventListener("keydown", event => {
  if (event.key === "Enter") submitAdminLogin();
});

async function submitAdminLogin() {
  const msg = document.querySelector("#adminLoginMsg");
  msg.textContent = "";
  msg.classList.remove("error");
  try {
    await api("/api/admin/login", { method: "POST", body: { password: document.querySelector("#adminPassword").value } });
    await loadAdmin();
  } catch (error) {
    msg.textContent = error.message;
    msg.classList.add("error");
  }
}

pepTextInput?.addEventListener("input", () => {
  parsedRows = [];
  headers = [];
  fileInput.value = "";
  renderPreview();
  renderMapping();
  refreshUploadModeChoice();
  uploadBtn.disabled = true;
  uploadMsg.textContent = "Text eingefuegt. Jetzt PEP-Text erkennen druecken.";
  uploadMsg.classList.remove("error");
});

fileInput.addEventListener("change", async event => {
  uploadMsg.textContent = "";
  uploadMsg.classList.remove("error");
  if (pepTextInput) pepTextInput.value = "";
  lastPepTextNames = [];
  const file = event.target.files[0];
  if (!file) return;
  try {
    parsedRows = await readFile(file);
    headers = Object.keys(parsedRows[0] || {});
    renderPreview();
    renderMapping();
    refreshUploadModeChoice();
    uploadBtn.disabled = !parsedRows.length;
    uploadMsg.textContent = parsedRows.length ? importSummary(parsedRows) : "";
  } catch (error) {
    parsedRows = [];
    headers = [];
    renderPreview();
    renderMapping();
    refreshUploadModeChoice();
    uploadBtn.disabled = true;
    uploadMsg.textContent = error.message;
    uploadMsg.classList.add("error");
  }
});

document.querySelector("#clearImportBtn")?.addEventListener("click", () => {
  parsedRows = [];
  headers = [];
  currentFileType = "";
  lastPepTextNames = [];
  fileInput.value = "";
  if (pepTextInput) pepTextInput.value = "";
  renderPreview();
  renderMapping();
  refreshUploadModeChoice();
  uploadBtn.disabled = true;
  uploadMsg.textContent = "Ausgewaehlte Datei entfernt.";
  uploadMsg.classList.remove("error");
});

document.querySelector("#parseTextBtn")?.addEventListener("click", () => {
  parsePepTextInput();
});

document.querySelector("#publishChoice")?.addEventListener("click", async event => {
  const button = event.target.closest("[data-publish-confirm], [data-publish-cancel]");
  if (!button) return;
  const box = document.querySelector("#publishChoice");
  if (button.dataset.publishCancel) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  const notifyMode = document.querySelector("input[name='publishNotifyMode']:checked")?.value || "none";
  await api(`/api/admin/plans/${encodeURIComponent(button.dataset.publishConfirm)}/publish`, {
    method: "POST",
    body: { notifyMode }
  });
  box.classList.add("hidden");
  box.innerHTML = "";
  await loadAdmin();
});

document.querySelector("#openPepBrowserBtn")?.addEventListener("click", async () => {
  uploadMsg.textContent = "PEP-Browser wird geoeffnet...";
  uploadMsg.classList.remove("error");
  try {
    await api("/api/admin/open-pep-browser", { method: "POST" });
    uploadMsg.textContent = "PEP-Browser ist geoeffnet. Dort einloggen, Einsatzplanung/Druckansicht oeffnen, dann hier 'PEP direkt aus offenem Browser lesen' klicken.";
  } catch (error) {
    uploadMsg.textContent = error.message;
    uploadMsg.classList.add("error");
  }
});

document.querySelector("#readPepBrowserBtn")?.addEventListener("click", async () => {
  uploadMsg.textContent = "PEP wird aus dem offenen Browser gelesen...";
  uploadMsg.classList.remove("error");
  try {
    const result = await api("/api/admin/pep-browser-text", { method: "POST" });
    pepTextInput.value = result.text;
    uploadMsg.textContent = `PEP gelesen: ${result.employeeCount} Mitarbeiter, ${result.chars} Zeichen. Erkennung startet...`;
    parsePepTextInput();
  } catch (error) {
    uploadMsg.textContent = error.message;
    uploadMsg.classList.add("error");
  }
});

function parsePepTextInput() {
  uploadMsg.textContent = "";
  uploadMsg.classList.remove("error");
  try {
    fileInput.value = "";
    const text = pepTextInput.value;
    lastPepTextNames = pepTextNames(text);
    parsedRows = rowsFromCopiedPepPlan(text);
    headers = Object.keys(parsedRows[0] || {});
    renderPreview();
    renderMapping();
    refreshUploadModeChoice();
    uploadBtn.disabled = !parsedRows.length;
    uploadMsg.textContent = parsedRows.length ? importSummary(parsedRows) : "";
    if (!parsedRows.length) throw new Error("Aus dem eingefuegten PEP-Text wurden keine Schichten erkannt.");
  } catch (error) {
    parsedRows = [];
    headers = [];
    renderPreview();
    renderMapping();
    refreshUploadModeChoice();
    uploadBtn.disabled = true;
    uploadMsg.textContent = error.message;
    uploadMsg.classList.add("error");
  }
}

uploadBtn.addEventListener("click", async () => {
  uploadMsg.textContent = "";
  uploadMsg.classList.remove("error");
  try {
    const shifts = shiftsFromParsedRows();
    validateShiftsBeforeSave(shifts);
    lastCoverageWarning = employeeCoverageWarning(shifts);
    const info = planInfoFromShifts(shifts);
    const title = finalUploadTitle(info);
    const uploadMode = document.querySelector("input[name='uploadMode']:checked")?.value || "normal";
    const result = await api("/api/admin/upload", {
      method: "POST",
      body: { title, uploadMode, shifts, seenEmployees: lastPepTextNames }
    });
    uploadMsg.textContent = `Gespeichert: ${result.plan.shiftCount} Schichten. ${result.plan.changeCount ? `${result.plan.changeCount} Aenderungen erkannt. ` : ""}${result.pepCorrections?.length ? `${result.pepCorrections.length} PEP-Korrekturen offen. ` : ""}Bitte pruefen und danach veroeffentlichen.`;
    if (lastCoverageWarning) uploadMsg.textContent += ` Hinweis: ${lastCoverageWarning}`;
    await loadAdmin();
    await loadInspection(result.plan.id);
  } catch (error) {
    uploadMsg.textContent = error.message;
    uploadMsg.classList.add("error");
  }
});

async function loadAdmin() {
  try {
    const data = await api("/api/admin/overview");
    adminState = data;
    const buildVersion = document.querySelector("#buildVersion");
    if (buildVersion) buildVersion.textContent = `Version: ${data.buildVersion || "alt/ohne Pausenfix"}`;
    loginBox.classList.add("hidden");
    adminArea.classList.remove("hidden");
    renderActivePlan(data.publishedPlans || []);
    renderPepCorrections(data.pepCorrections || []);
    renderPlans(data.plans);
    renderPins(data.employees);
    refreshUploadModeChoice();
    const firstPlan = (data.publishedPlans || [])[0] || data.plans[0];
    renderInspectPlanOptions(data.plans, firstPlan?.id || "");
    if (firstPlan?.id) await loadInspection(firstPlan.id);
  } catch {
    loginBox.classList.remove("hidden");
    adminArea.classList.add("hidden");
  }
}

function validateShiftsBeforeSave(shifts) {
  const unknown = shifts.filter(shift => !shift.department || shift.department === "PEP");
  if (unknown.length > 0) {
    throw new Error(`Import gestoppt: ${unknown.length} Schichten haben keine erkannte Abteilung. Bitte nicht speichern, sonst stehen falsche Werte im Dienstplan.`);
  }
}

function normalizeShiftTimes(shift) {
  if (!isTime(shift.start) || !isTime(shift.end)) return shift;
  const ordered = orderTimes(shift.start, shift.end);
  return { ...shift, start: ordered.start, end: ordered.end };
}

function isNoiseShift(shift) {
  const start = normalizeBreakValue(shift.start);
  const end = normalizeBreakValue(shift.end);
  const department = String(shift.department || "").trim();
  if ((start || end) && !department) return true;
  if ((isBreakTimeValue(shift.start) || isBreakTimeValue(shift.end)) && (!department || department === "PEP")) return true;
  return false;
}

function employeeCoverageWarning(shifts) {
  const knownNames = (adminState.employees || []).map(employee => normalizePersonName(employee.name));
  if (knownNames.length < 10) return "";
  const imported = new Set(shifts.map(shift => normalizePersonName(shift.name)).filter(Boolean));
  const seenInPepText = new Set(lastPepTextNames.map(normalizePersonName));
  const covered = new Set([...imported, ...seenInPepText]);
  const missing = knownNames.filter(name => !covered.has(name));
  if (missing.length >= 4 || covered.size < knownNames.length * 0.85) {
    return `${missing.length} bekannte Mitarbeiter fehlen, z. B. ${missing.slice(0, 8).join(", ")}. Wenn du sie bewusst rausgenommen hast, ist das okay.`;
  }
  return "";
}

function pepTextNames(text) {
  return unique(Array.from(String(text || "").matchAll(/([A-Z\u00c4\u00d6\u00dc][A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df .'\-]+,\s*[A-Z\u00c4\u00d6\u00dc][A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df .'\-]+)/g))
    .map(match => normalizePersonName(match[1]))
    .filter(name => !/Name|Datum|Summe/.test(name)));
}

function importSummary(rows) {
  const names = unique(rows.map(row => row.Mitarbeiter || row.name || row.Name || "").filter(Boolean).map(normalizePersonName));
  const seenCount = lastPepTextNames.length;
  if (seenCount) {
    return `${rows.length} Eintraege erkannt, ${seenCount} Mitarbeiter in der Datei, ${names.length} Mitarbeiter mit Eintraegen.`;
  }
  return `${rows.length} Eintraege erkannt, ${names.length} Mitarbeiter mit Eintraegen.`;
}

function shiftsFromParsedRows() {
  const pick = id => document.querySelector(`#${id}`)?.value || "";
  const cols = {
    name: pick("col_name"),
    date: pick("col_date"),
    start: pick("col_start"),
    end: pick("col_end"),
    department: pick("col_department"),
    break: pick("col_break")
  };
  return parsedRows.map(row => normalizeShiftTimes({
    name: row[cols.name],
    date: row[cols.date],
    start: row[cols.start],
    end: row[cols.end],
    department: row[cols.department],
    break: cols.break ? normalizeBreakValue(row[cols.break]) : ""
  })).filter(shift => !isNoiseShift(shift));
}

function planInfoFromShifts(shifts) {
  const dates = shifts
    .map(shift => parseGermanDate(shift.date))
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (!dates.length) return null;
  const start = dates[0];
  const end = dates[dates.length - 1];
  const info = isoWeekInfo(start);
  return {
    week: info?.week || "",
    year: info?.year || start.getFullYear(),
    title: info?.week ? `KW ${info.week}` : "",
    weekKey: info ? `${info.year}-${String(info.week).padStart(2, "0")}` : "",
    rangeKey: `${formatGermanDate(start)}|${formatGermanDate(end)}`,
    rangeText: `${formatGermanDate(start)} bis ${formatGermanDate(end)}`
  };
}

function planRangeKey(plan) {
  const dates = Array.from(String(plan?.range || "").matchAll(/(\d{1,2}\.\d{1,2}\.\d{4})/g))
    .map(match => parseLooseGermanDate(match[1]))
    .filter(Boolean);
  if (!dates.length) return "";
  const start = dates[0];
  const end = dates[1] || dates[0];
  return `${formatGermanDate(start)}|${formatGermanDate(end)}`;
}

function planWeekKey(plan) {
  const startText = String(plan?.range || "").match(/(\d{1,2}\.\d{1,2}\.\d{4})/)?.[1];
  const info = isoWeekInfo(parseLooseGermanDate(startText));
  return info ? `${info.year}-${String(info.week).padStart(2, "0")}` : "";
}

function parseLooseGermanDate(value) {
  const match = String(value || "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function matchingUploadedPlan(info) {
  return (adminState.plans || [])
    .filter(plan => planRangeKey(plan) === info.rangeKey || (info.weekKey && planWeekKey(plan) === info.weekKey))
    .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0))[0] || null;
}

function refreshUploadModeChoice() {
  if (!uploadModeBox) return;
  if (!parsedRows.length || !headers.length) {
    uploadModeBox.classList.add("hidden");
    uploadModeBox.innerHTML = "";
    return;
  }

  const shifts = shiftsFromParsedRows();
  const info = planInfoFromShifts(shifts);
  const titleInput = document.querySelector("#planTitle");
  if (titleInput && info?.title) {
    const current = titleInput.value.trim();
    if (!current || !/^kw\s*\d+/i.test(current)) titleInput.value = info.title;
  }

  const existing = info?.rangeKey ? matchingUploadedPlan(info) : null;
  if (!existing) {
    uploadModeBox.classList.add("hidden");
    uploadModeBox.innerHTML = "";
    return;
  }

  uploadModeBox.classList.remove("hidden");
  uploadModeBox.innerHTML = `
    <strong>Diese KW ist schon hochgeladen</strong>
    <p>${escapeHtml(info.title || "Plan")} (${escapeHtml(info.rangeText)}) gibt es bereits: ${escapeHtml(existing.title || "ohne Titel")}.</p>
    <label class="choice-line">
      <input type="radio" name="uploadMode" value="correction" checked>
      <span><b>Plan-Korrektur</b> - mit vorhandener Woche vergleichen und offene PEP-Korrekturen anlegen.</span>
    </label>
    <label class="choice-line">
      <input type="radio" name="uploadMode" value="normal">
      <span><b>Nur neuer Upload</b> - speichern, aber keine Korrektur-Aufgaben erzeugen.</span>
    </label>
  `;
}

function finalUploadTitle(info) {
  const typed = document.querySelector("#planTitle")?.value.trim() || "";
  if (typed && /^kw\s*\d+/i.test(typed)) return typed;
  return info?.title || typed || "Wochenplan";
}

function normalizePersonName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").replace(/\s+,/g, ",");
}

function renderPlans(plans) {
  const sortedPlans = sortPlansByDate(plans);
  document.querySelector("#planList").innerHTML = sortedPlans.length ? sortedPlans.map(plan => `
    <div class="item">
      <div>
        <strong>${escapeHtml(plan.title)}</strong> ${plan.isPublished ? '<span class="badge">Veroeffentlicht</span>' : ""} ${plan.version > 1 ? `<span class="badge subtle">Version ${plan.version}</span>` : ""}<br>
        <span class="meta">Zeitraum: ${escapeHtml(plan.range || "offen")}</span><br>
        <span class="meta">Upload: ${formatDateTime(plan.uploadedAt)} - ${plan.shiftCount} Schichten</span>
        ${plan.changeCount ? `<br><span class="warn-text">${plan.changeCount} Aenderungen zum alten Plan</span>` : ""}
        ${plan.issueCount ? `<br><span class="warn-text">${plan.issueCount} Hinweise pruefen</span>` : ""}
      </div>
      <div class="actions">
        <button class="secondary" data-inspect="${escapeHtml(plan.id)}">Pruefen</button>
        ${plan.isPublished
          ? `<button class="secondary" data-unpublish="${escapeHtml(plan.id)}">Zuruecknehmen</button>`
          : `<button data-publish="${escapeHtml(plan.id)}">Veroeffentlichen</button>`}
        <button class="danger" data-delete="${escapeHtml(plan.id)}">Loeschen</button>
      </div>
    </div>
  `).join("") : '<p class="hint">Noch kein Plan hochgeladen.</p>';

  document.querySelectorAll("[data-inspect]").forEach(button => {
    button.addEventListener("click", async () => {
      await loadInspection(button.dataset.inspect, true);
    });
  });
  document.querySelectorAll("[data-publish]").forEach(button => {
    button.addEventListener("click", () => showPublishChoice(button.dataset.publish));
  });
  document.querySelectorAll("[data-unpublish]").forEach(button => {
    button.addEventListener("click", async () => {
      await api(`/api/admin/plans/${encodeURIComponent(button.dataset.unpublish)}/unpublish`, { method: "POST" });
      await loadAdmin();
    });
  });
  document.querySelectorAll("[data-delete]").forEach(button => {
    button.addEventListener("click", async () => {
      await api(`/api/admin/plans/${encodeURIComponent(button.dataset.delete)}`, { method: "DELETE" });
      await loadAdmin();
    });
  });
}

function showPublishChoice(planId) {
  const plan = (adminState.plans || []).find(item => item.id === planId);
  const box = document.querySelector("#publishChoice");
  if (!box || !plan) return;
  const recommended = plan.recommendedNotifyMode || (plan.changeCount ? "affected" : "all");
  box.classList.remove("hidden");
  box.innerHTML = `
    <h2>Plan veroeffentlichen</h2>
    <p class="hint">${escapeHtml(plan.title)} ${plan.range ? `(${escapeHtml(plan.range)})` : ""}</p>
    <div class="publish-options">
      ${renderPublishOption("all", "Alle Mitarbeiter benachrichtigen", "Alle mit Push-Aktivierung bekommen eine Nachricht.", recommended)}
      ${renderPublishOption("affected", "Nur betroffene Mitarbeiter", "Nur Mitarbeiter mit erkannter Aenderung bekommen eine Nachricht.", recommended)}
      ${renderPublishOption("none", "Niemand benachrichtigen", "Plan wird veroeffentlicht, aber ohne Push-Nachricht.", recommended)}
    </div>
    <div class="actions">
      <button data-publish-confirm="${escapeHtml(plan.id)}" type="button">Veroeffentlichen</button>
      <button data-publish-cancel="1" class="secondary" type="button">Abbrechen</button>
    </div>
  `;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderPublishOption(value, title, text, selected) {
  return `
    <label class="choice-line publish-option">
      <input type="radio" name="publishNotifyMode" value="${value}" ${value === selected ? "checked" : ""}>
      <span><b>${escapeHtml(title)}</b><small>${escapeHtml(text)}</small></span>
    </label>
  `;
}

function renderActivePlan(plans) {
  const box = document.querySelector("#activePlan");
  if (!plans.length) {
    box.innerHTML = '<p class="hint">Noch kein Plan veroeffentlicht. Mitarbeiter sehen erst nach dem Veroeffentlichen ihre Dienstplaene.</p>';
    return;
  }
  box.innerHTML = `
    ${sortPlansByDate(plans).map(plan => `
      <div class="active-card">
        <div>
          <strong>${escapeHtml(plan.title)}</strong> ${plan.version > 1 ? `<span class="badge subtle">Version ${plan.version}</span>` : ""}<br>
          <span class="meta">Zeitraum: ${escapeHtml(plan.range || "offen")}</span><br>
          <span class="meta">Upload: ${formatDateTime(plan.uploadedAt)}</span>
          ${plan.changeCount ? `<br><span class="warn-text">${plan.changeCount} Aenderungen veroeffentlicht</span>` : ""}
        </div>
        <span class="badge">Veroeffentlicht</span>
      </div>
    `).join("")}
  `;
}

function renderPepCorrections(corrections) {
  const box = document.querySelector("#pepCorrections");
  if (!box) return;
  const open = corrections.filter(item => !item.done);
  const done = corrections.filter(item => item.done);
  if (!corrections.length) {
    box.innerHTML = '<p class="ok-text">Keine offenen PEP-Korrekturen.</p>';
    return;
  }

  box.innerHTML = `
    <div class="correction-summary">
      <span class="badge warn-badge">${open.length} offen</span>
      ${done.length ? `<span class="badge subtle">${done.length} erledigt</span>` : ""}
    </div>
    ${open.length ? `
      <div class="correction-list">
        ${open.map(item => renderPepCorrection(item)).join("")}
      </div>
    ` : '<p class="ok-text">Alles fuer PEP abgehakt.</p>'}
    ${done.length ? `
      <details class="done-corrections">
        <summary>Erledigte Korrekturen anzeigen (${done.length})</summary>
        <div class="correction-list done-list">
          ${done.map(item => renderPepCorrection(item)).join("")}
        </div>
      </details>
    ` : ""}
  `;

  document.querySelectorAll("[data-correction-done]").forEach(button => {
    button.addEventListener("click", async () => {
      await api(`/api/admin/pep-corrections/${encodeURIComponent(button.dataset.correctionDone)}/done`, {
        method: "POST",
        body: { done: true }
      });
      await loadAdmin();
    });
  });
  document.querySelectorAll("[data-correction-open]").forEach(button => {
    button.addEventListener("click", async () => {
      await api(`/api/admin/pep-corrections/${encodeURIComponent(button.dataset.correctionOpen)}/done`, {
        method: "POST",
        body: { done: false }
      });
      await loadAdmin();
    });
  });
}

function renderPepCorrection(item) {
  return `
    <div class="correction-item ${item.done ? "done" : ""}">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span class="meta">${escapeHtml(item.date)} - ${changeTypeLabel(item.type)} - Quelle: ${escapeHtml(item.source || "Import")}</span>
        <p><span class="meta">Alt:</span> ${escapeHtml(item.before)}</p>
        <p><span class="meta">Neu:</span> ${escapeHtml(item.after)}</p>
        <p class="correction-note">In PEP korrigieren: ${escapeHtml(correctionShortInstruction(item))}</p>
      </div>
      <div class="actions">
        ${item.done
          ? `<button class="secondary" data-correction-open="${escapeHtml(item.id)}">Wieder offen</button>`
          : `<button data-correction-done="${escapeHtml(item.id)}">Erledigt</button>`}
      </div>
    </div>
  `;
}

function correctionShortInstruction(item) {
  if (item.type === "removed") return "Dienst entfernen";
  if (item.type === "added") return "Dienst eintragen";
  return "Zeit/Abteilung/Pause anpassen";
}

function renderPins(employees) {
  const query = normalizeText(document.querySelector("#employeeSearch")?.value || "");
  const visible = employees.filter(emp => normalizeText(emp.name).includes(query));
  const grouped = groupEmployeesByLetter(visible);
  document.querySelector("#pinList").innerHTML = grouped.length ? grouped.map(group => `
    <section class="employee-group ${query ? "" : "collapsed"}">
      <button class="employee-group-head" data-employee-toggle type="button">
        <span><strong>${escapeHtml(group.letter)}</strong></span>
        <span class="badge subtle">${group.employees.length} Mitarbeiter</span>
      </button>
      <div class="employee-group-body">
        ${group.employees.map(emp => `
          <div class="employee-row">
            <div>
              <strong>${escapeHtml(emp.name)}</strong><br>
              <span class="meta">Aktuelle PIN: <code>${escapeHtml(emp.initialPin || "gesetzt")}</code></span>
            </div>
            <div class="pin-edit">
              <input data-pin-name="${escapeHtml(emp.name)}" inputmode="numeric" placeholder="Neue PIN">
              <button class="secondary" data-pin-save="${escapeHtml(emp.name)}">Speichern</button>
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `).join("") : '<p class="hint">Mitarbeiter erscheinen nach dem ersten Upload oder koennen oben manuell angelegt werden.</p>';

  document.querySelectorAll("[data-employee-toggle]").forEach(button => {
    button.addEventListener("click", () => button.closest(".employee-group")?.classList.toggle("collapsed"));
  });
  document.querySelectorAll("[data-pin-save]").forEach(button => {
    button.addEventListener("click", () => saveEmployeePin(button.dataset.pinSave));
  });
}

document.querySelector("#employeeSearch")?.addEventListener("input", () => renderPins(adminState.employees || []));
document.querySelector("#addEmployeeBtn")?.addEventListener("click", addEmployee);
document.querySelector("#inspectPlan")?.addEventListener("change", event => loadInspection(event.target.value, false));
document.querySelectorAll("#inspectSearch, #inspectWeek, #inspectMonth").forEach(input => {
  input.addEventListener("input", renderInspection);
});

function renderInspectPlanOptions(plans, selectedId) {
  const select = document.querySelector("#inspectPlan");
  if (!select) return;
  select.innerHTML = sortPlansByDate(plans).map(plan => `<option value="${escapeHtml(plan.id)}" ${plan.id === selectedId ? "selected" : ""}>${escapeHtml(plan.title)} ${plan.range ? `(${escapeHtml(plan.range)})` : ""}</option>`).join("");
}

function sortPlansByDate(plans) {
  return (plans || []).slice().sort((a, b) => {
    const byStart = planStartDate(a) - planStartDate(b);
    if (byStart) return byStart;
    return new Date(a.uploadedAt || 0) - new Date(b.uploadedAt || 0);
  });
}

function planStartDate(plan) {
  const match = String(plan?.range || "").match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return new Date(plan?.uploadedAt || 0).getTime();
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime();
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unbekannt";
  return date.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function groupEmployeesByLetter(employees) {
  const groups = new Map();
  for (const employee of employees) {
    const letter = (employee.name || "#").trim().charAt(0).toUpperCase();
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(employee);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b, "de"))
    .map(([letter, groupEmployees]) => ({ letter, employees: groupEmployees.sort((a, b) => a.name.localeCompare(b.name, "de")) }));
}

async function saveEmployeePin(name) {
  const msg = document.querySelector("#employeeMsg");
  const input = document.querySelector(`[data-pin-name="${cssEscape(name)}"]`);
  msg.textContent = "";
  msg.classList.remove("error");
  try {
    await api(`/api/admin/employees/${encodeURIComponent(name)}/pin`, { method: "POST", body: { pin: input.value } });
    msg.textContent = `PIN fuer ${name} gespeichert.`;
    await loadAdmin();
  } catch (error) {
    msg.textContent = error.message;
    msg.classList.add("error");
  }
}

async function addEmployee() {
  const msg = document.querySelector("#employeeMsg");
  msg.textContent = "";
  msg.classList.remove("error");
  try {
    await api("/api/admin/employees", {
      method: "POST",
      body: {
        name: document.querySelector("#newEmployeeName").value,
        pin: document.querySelector("#newEmployeePin").value
      }
    });
    document.querySelector("#newEmployeeName").value = "";
    document.querySelector("#newEmployeePin").value = "";
    msg.textContent = "Mitarbeiter angelegt.";
    await loadAdmin();
  } catch (error) {
    msg.textContent = error.message;
    msg.classList.add("error");
  }
}

function cssEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function loadInspection(id, focusPanel = false) {
  if (!id) return;
  const msg = document.querySelector("#inspectMsg");
  if (msg) {
    msg.textContent = "Plan wird geladen...";
    msg.classList.remove("error");
  }
  try {
    const data = await api(`/api/admin/plans/${encodeURIComponent(id)}`);
    inspected = data;
    const select = document.querySelector("#inspectPlan");
    if (select) select.value = id;
    renderInspection();
    if (msg) msg.textContent = `Pruefansicht geladen: ${data.plan.title} (${data.plan.range || "Zeitraum offen"})`;
    if (focusPanel) {
      const panel = document.querySelector("#inspectPanel");
      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
      panel?.classList.add("flash");
      window.setTimeout(() => panel?.classList.remove("flash"), 1200);
    }
  } catch (error) {
    inspected = { plan: null, shifts: [], issues: [], missingEmployees: [], changes: [] };
    renderInspection();
    if (msg) {
      msg.textContent = error.message;
      msg.classList.add("error");
    }
  }
}

function renderInspection() {
  const issueList = document.querySelector("#issueList");
  const inspectList = document.querySelector("#inspectList");
  if (!inspected.plan) {
    issueList.innerHTML = "";
    inspectList.innerHTML = '<p class="hint">Bitte einen Plan auswaehlen.</p>';
    return;
  }

  const issues = filterDailyBreakIssues(inspected.issues || [], inspected.shifts || []);
  const missingEmployees = inspected.missingEmployees || [];
  issueList.innerHTML = `${renderShiftEditForm()}${issues.length ? `
    <div class="issue-box">
      <strong>${issues.length} Hinweise im Plan</strong>
      ${issues.slice(0, 12).map(issue => `<p>${escapeHtml(issue.message)}</p>`).join("")}
      ${issues.length > 12 ? `<p>... ${issues.length - 12} weitere Hinweise</p>` : ""}
    </div>
  ` : '<p class="ok-text">Keine Importfehler gefunden.</p>'}`;

  if (missingEmployees.length) {
    issueList.innerHTML += `
      <div class="issue-box danger-box">
        <strong>${missingEmployees.length} Mitarbeiter fehlen in diesem Plan</strong>
        <p>Wenn diese Personen laut PEP Schichten haben, ist der Import unvollstaendig und der Plan sollte neu importiert werden.</p>
        <p>${missingEmployees.map(name => escapeHtml(name)).join(", ")}</p>
      </div>
    `;
  }

  const changes = inspected.changes || [];
  if (changes.length) {
    issueList.innerHTML += `
      <div class="issue-box change-box">
        <strong>${changes.length} Aenderungen zum vorher veroeffentlichten Plan</strong>
        ${changes.slice(0, 20).map(change => `
          <p><strong>${escapeHtml(change.name)}</strong> ${escapeHtml(change.date)}: ${changeTypeLabel(change.type)}<br>
          <span class="meta">Alt: ${escapeHtml(change.before)}</span><br>
          <span class="meta">Neu: ${escapeHtml(change.after)}</span></p>
        `).join("")}
        ${changes.length > 20 ? `<p>... ${changes.length - 20} weitere Aenderungen</p>` : ""}
      </div>
    `;
  }

  const query = normalizeText(document.querySelector("#inspectSearch").value);
  const week = document.querySelector("#inspectWeek").value.trim();
  const month = document.querySelector("#inspectMonth").value;
  const filtered = inspected.shifts
    .filter(shift => !query || normalizeText(`${shift.name} ${shift.department}`).includes(query))
    .filter(shift => !week || String(isoWeekInfo(parseGermanDate(shift.date))?.week || "") === week)
    .filter(shift => !month || monthKey(parseGermanDate(shift.date)) === month)
    .sort((a, b) => (parseGermanDate(a.date) - parseGermanDate(b.date)) || a.name.localeCompare(b.name, "de") || timeToMinutes(a.start) - timeToMinutes(b.start));

  const groupedWeeks = groupInspectionByWeek(filtered);
  inspectList.innerHTML = groupedWeeks.length
    ? groupedWeeks.map((group, index) => renderInspectionWeek(group, week ? index === 0 : false)).join("")
    : '<p class="hint">Keine Schichten fuer diese Filter.</p>';

  document.querySelectorAll("[data-inspect-week-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      button.closest(".inspect-week")?.classList.toggle("collapsed");
    });
  });
  document.querySelectorAll("[data-edit-shift]").forEach(button => {
    button.addEventListener("click", () => {
      editShift = inspected.shifts.find(shift => shiftEditKey(shift) === button.dataset.editShift) || null;
      renderInspection();
      document.querySelector("#shiftEditBox")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.querySelector("#cancelShiftEdit")?.addEventListener("click", () => {
    editShift = null;
    renderInspection();
  });
  document.querySelector("#saveShiftEdit")?.addEventListener("click", saveShiftEdit);
  document.querySelector("#deleteShiftEdit")?.addEventListener("click", deleteShiftEdit);
}

function renderShiftEditForm() {
  if (!editShift) return "";
  const departmentOptions = editDepartmentOptions();
  return `
    <div id="shiftEditBox" class="shift-edit-box">
      <strong>Schicht bearbeiten</strong>
      <p class="hint">${escapeHtml(editShift.name)} - ${escapeHtml(editShift.date)}. Nach dem Speichern wird automatisch eine PEP-Korrektur mit Quelle Haendisch angelegt.</p>
      <div class="shift-edit-grid">
        <label>Mitarbeiter<input id="editName" value="${escapeHtml(editShift.name)}"></label>
        <label>Datum
          <select id="editDate">
            ${editDateOptions(editShift.date).map(option => `
              <option value="${escapeHtml(option.value)}" ${option.value === editShift.date ? "selected" : ""}>${escapeHtml(option.label)}</option>
            `).join("")}
          </select>
        </label>
        <label>Start<input id="editStart" value="${escapeHtml(editShift.start)}" placeholder="06:00"></label>
        <label>Ende<input id="editEnd" value="${escapeHtml(editShift.end)}" placeholder="14:00"></label>
        <label>Abteilung
          <input id="editDepartment" list="editDepartmentOptions" value="${escapeHtml(editShift.department)}" placeholder="Abteilung eingeben">
          <datalist id="editDepartmentOptions">
            ${departmentOptions.map(department => `<option value="${escapeHtml(department)}"></option>`).join("")}
          </datalist>
        </label>
        <label>Pause<input id="editBreak" value="${escapeHtml(editShift.break || "")}" placeholder="00:30"></label>
      </div>
      <div class="actions">
        <button id="deleteShiftEdit" class="danger" type="button">Schicht loeschen</button>
        <button id="saveShiftEdit" type="button">Speichern</button>
        <button id="cancelShiftEdit" class="secondary" type="button">Abbrechen</button>
      </div>
    </div>
  `;
}

function editDateOptions(selectedDate) {
  const base = parseGermanDate(selectedDate) || parseGermanDate(inspected.shifts[0]?.date);
  if (!base) return selectedDate ? [{ value: selectedDate, label: selectedDate }] : [];
  const year = base.getFullYear();
  const month = base.getMonth();
  const options = [];
  const cursor = new Date(year, month, 1);
  while (cursor.getMonth() === month) {
    const value = formatGermanDate(cursor);
    options.push({ value, label: `${weekdayLong(cursor)}, ${value}` });
    cursor.setDate(cursor.getDate() + 1);
  }
  if (selectedDate && !options.some(option => option.value === selectedDate)) {
    options.unshift({ value: selectedDate, label: selectedDate });
  }
  return options;
}

function editDepartmentOptions() {
  const fromPlan = (inspected.shifts || [])
    .map(shift => shift.department || "")
    .filter(Boolean);
  return unique([...knownDepartments(), ...fromPlan])
    .sort((a, b) => a.localeCompare(b, "de"));
}

async function deleteShiftEdit() {
  if (!editShift || !inspected.plan?.id) return;
  if (!window.confirm("Diese Schicht wirklich loeschen?")) return;
  const planId = inspected.plan.id;
  const msg = document.querySelector("#inspectMsg");
  if (msg) {
    msg.textContent = "Schicht wird geloescht...";
    msg.classList.remove("error");
  }
  try {
    await api(`/api/admin/plans/${encodeURIComponent(planId)}/shifts/edit`, {
      method: "POST",
      body: { before: editShift, after: null }
    });
    editShift = null;
    await loadAdmin();
    await loadInspection(planId, true);
    if (msg) msg.textContent = "Schicht geloescht. PEP-Korrektur wurde angelegt.";
  } catch (error) {
    if (msg) {
      msg.textContent = error.message;
      msg.classList.add("error");
    }
  }
}

async function saveShiftEdit() {
  if (!editShift || !inspected.plan?.id) return;
  const planId = inspected.plan.id;
  const msg = document.querySelector("#inspectMsg");
  if (msg) {
    msg.textContent = "Schicht wird gespeichert...";
    msg.classList.remove("error");
  }
  try {
    await api(`/api/admin/plans/${encodeURIComponent(planId)}/shifts/edit`, {
      method: "POST",
      body: {
        before: editShift,
        after: {
          name: document.querySelector("#editName").value,
          date: document.querySelector("#editDate").value,
          start: document.querySelector("#editStart").value,
          end: document.querySelector("#editEnd").value,
          department: document.querySelector("#editDepartment").value,
          break: normalizeBreakValue(document.querySelector("#editBreak").value)
        }
      }
    });
    editShift = null;
    await loadAdmin();
    await loadInspection(planId, true);
    if (msg) msg.textContent = "Schicht gespeichert. PEP-Korrektur wurde angelegt.";
  } catch (error) {
    if (msg) {
      msg.textContent = error.message;
      msg.classList.add("error");
    }
  }
}

function filterDailyBreakIssues(issues, shifts) {
  const dayBreaks = new Map();
  for (const shift of shifts || []) {
    const key = dailyIssueKey(shift.name, shift.date);
    if (!key) continue;
    const current = dayBreaks.get(key) || { hasBreak: false, totalMinutes: 0 };
    current.hasBreak = current.hasBreak || Boolean(shift.break);
    current.totalMinutes += shiftDurationMinutes(shift);
    dayBreaks.set(key, current);
  }

  return (issues || []).filter(issue => {
    if (issue.type !== "break" && !String(issue.message || "").toLowerCase().includes("keine pause erkannt")) return true;
    const parsed = parseDailyIssueMessage(issue.message);
    const key = dailyIssueKey(parsed.name, parsed.date);
    const day = key ? dayBreaks.get(key) : null;
    return !(day && day.hasBreak);
  });
}

function changeTypeLabel(type) {
  if (type === "added") return "neue Schicht";
  if (type === "removed") return "Schicht entfernt";
  return "Schicht geaendert";
}

function parseDailyIssueMessage(message) {
  const text = String(message || "");
  const match = text.match(/Keine Pause erkannt:\s*(.+?)\s+(\d{2}\.\d{2}\.\d{4})/i);
  return {
    name: match ? match[1].trim() : "",
    date: match ? match[2] : ""
  };
}

function dailyIssueKey(name, date) {
  const person = normalizeText(name).replace(/\s+,/g, ",");
  const day = String(date || "").trim();
  return person && day ? `${person}|${day}` : "";
}

function groupInspectionByWeek(shifts) {
  const groups = new Map();
  for (const shift of shifts) {
    const date = parseGermanDate(shift.date);
    const info = isoWeekInfo(date);
    const key = `${info?.year || "0000"}-${String(info?.week || 0).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, { key, week: info?.week || "-", year: info?.year || "", shifts: [] });
    groups.get(key).shifts.push(shift);
  }

  return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function renderInspectionWeek(group, open) {
  const workCount = group.shifts.filter(shift => !isInspectionStatus(shift)).length;
  const statusCount = group.shifts.length - workCount;
  const dayBreaks = dailyBreakMap(group.shifts);
  return `
    <section class="inspect-week ${open ? "" : "collapsed"}">
      <button class="inspect-week-head" data-inspect-week-toggle type="button">
        <span><strong>KW ${group.week}</strong>${group.year ? ` / ${group.year}` : ""}</span>
        <span class="badge subtle">${workCount} Dienste${statusCount ? `, ${statusCount} Abwesenheiten` : ""}</span>
      </button>
      <div class="inspect-week-body preview admin-preview">
        <table>
          <thead><tr><th>Mitarbeiter</th><th>Datum</th><th>Zeit</th><th>Abteilung</th><th>Pause</th><th>Aktion</th></tr></thead>
          <tbody>
            ${group.shifts.map(shift => renderInspectionRow(shift, dayBreaks)).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function isInspectionStatus(shift) {
  return Boolean(detectStatusText(`${shift.department || ""} ${shift.start || ""} ${shift.end || ""}`));
}

function renderInspectionRow(shift, dayBreaks = new Map()) {
  return `<tr>
    <td>${escapeHtml(shift.name)}</td>
    <td>${escapeHtml(shift.date)}</td>
    <td>${escapeHtml(shift.start)}-${escapeHtml(shift.end)}</td>
    <td>${escapeHtml(shift.department || "Abteilung pruefen")}</td>
    <td>${renderAdminPause(shift, dayBreaks)}</td>
    <td><button class="mini-button secondary" data-edit-shift="${escapeHtml(shiftEditKey(shift))}" type="button">Bearbeiten</button></td>
  </tr>`;
}

function shiftEditKey(shift) {
  return [
    normalizePersonName(shift.name),
    shift.date || "",
    shift.start || "",
    shift.end || "",
    shift.department || "",
    shift.break || ""
  ].join("|");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isoWeekInfo(date) {
  if (!date) return null;
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = current.getDay() || 7;
  current.setDate(current.getDate() + 4 - day);
  const yearStart = new Date(current.getFullYear(), 0, 1);
  const week = Math.ceil((((current - yearStart) / 86400000) + 1) / 7);
  return { week, year: current.getFullYear() };
}

function monthKey(date) {
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function renderAdminPause(shift, dayBreaks = new Map()) {
  const day = dayBreaks.get(dailyIssueKey(shift.name, shift.date));
  if (day?.hasBreak) return escapeHtml(day.breakText || "Tagespause erkannt");
  if (shift.break) return escapeHtml(shift.break);
  if (day && day.totalMinutes > 360) return '<span class="warn-text">Keine Pause erkannt</span>';
  return "keine Pause";
}

function dailyBreakMap(shifts) {
  const map = new Map();
  for (const shift of shifts || []) {
    const key = dailyIssueKey(shift.name, shift.date);
    if (!key) continue;
    const current = map.get(key) || { hasBreak: false, breakText: "", totalMinutes: 0 };
    current.totalMinutes += shiftDurationMinutes(shift);
    if (shift.break) {
      current.hasBreak = true;
      current.breakText = current.breakText || shift.break;
    }
    map.set(key, current);
  }
  return map;
}

function shiftDurationMinutes(shift) {
  if (!isTime(shift.start) || !isTime(shift.end)) return 0;
  const start = timeToMinutes(shift.start);
  const end = timeToMinutes(shift.end);
  return end >= start ? end - start : end + 1440 - start;
}

function needsBreakCheck(shift) {
  return shiftDurationMinutes(shift) > 360;
}

function renderMapping() {
  const fields = [
    ["col_name", "Mitarbeiter", ["mitarbeiter", "name", "personal", "employee", "person"]],
    ["col_date", "Datum", ["datum", "date", "tag", "arbeitstag"]],
    ["col_start", "Start", ["start", "beginn", "von", "arbeitsbeginn"]],
    ["col_end", "Ende", ["ende", "end", "bis", "arbeitsende"]],
    ["col_department", "Abteilung/Aufgabe", ["abteilung", "aufgabe", "bereich", "taetigkeit", "tatigkeit", "dienst", "position"]],
    ["col_break", "Pause", ["pause", "break", "pausenzeit"]]
  ];
  mapping.classList.add("hidden");
  if (!headers.length) {
    mapping.innerHTML = fields.map(([id]) => `<select id="${id}"></select>`).join("");
    return;
  }
  mapping.innerHTML = fields.map(([id, label, guesses]) => `
    <label class="hidden">${label}
      <select id="${id}">
        ${id === "col_break" ? '<option value="">Keine Angabe</option>' : ""}
        ${headers.map(header => `<option value="${escapeHtml(header)}" ${header === bestHeader(guesses) ? "selected" : ""}>${escapeHtml(header)}</option>`).join("")}
      </select>
    </label>
  `).join("");
  mapping.querySelectorAll("select").forEach(select => select.addEventListener("change", refreshUploadModeChoice));
}

function bestHeader(words) {
  let best = "";
  let score = 0;
  for (const header of headers) {
    const clean = normalizeHeader(header);
    const exact = words.includes(clean) ? 10 : 0;
    const partial = words.some(word => clean.includes(word) || word.includes(clean)) ? 3 : 0;
    const current = exact + partial;
    if (current > score) {
      score = current;
      best = header;
    }
  }
  return best || headers[0] || "";
}

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\u00e4/g, "ae")
    .replace(/\u00f6/g, "oe")
    .replace(/\u00fc/g, "ue")
    .replace(/\u00df/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

function renderPreview() {
  const box = document.querySelector("#preview");
  if (!parsedRows.length) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  const rows = parsedRows.slice(0, 12);
  const names = unique(parsedRows.map(row => row.Mitarbeiter || row.name || row.Name || "").filter(Boolean).map(normalizePersonName)).sort((a, b) => a.localeCompare(b, "de"));
  box.innerHTML = `
    <div class="preview-summary">
      <strong>${names.length} Mitarbeiter im Import</strong>
      <p>${names.slice(0, 18).map(name => escapeHtml(name)).join(", ")}${names.length > 18 ? ` ... und ${names.length - 18} weitere` : ""}</p>
    </div>
    <table>
      <thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.map(row => `<tr>${headers.map(header => `<td>${escapeHtml(row[header])}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function readFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  currentFileType = ext;
  if (ext === "html" || ext === "htm") return readHtml(file);
  if (ext === "pdf") return readPdf(file);
  if (ext === "csv") return readCsv(file);
  return readExcel(file);
}

function readHtml(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("HTML-Datei konnte nicht gelesen werden."));
    reader.onload = () => {
      try {
        const rows = rowsFromPepHtml(String(reader.result || ""));
        if (!rows.length) {
          throw new Error("In der HTML-Datei wurden keine Schichten erkannt. Bitte die PEP-Druckansicht als Webseite/HTML speichern und diese Datei hochladen.");
        }
        resolve(rows);
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsText(file, "utf-8");
  });
}

function readCsv(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("CSV konnte nicht gelesen werden."));
    reader.onload = () => resolve(csvToRows(String(reader.result || "")));
    reader.readAsText(file, "utf-8");
  });
}

function readExcel(file) {
  return new Promise((resolve, reject) => {
    if (!window.XLSX) return reject(new Error("Excel-Leser ist nicht geladen. Bitte CSV oder PDF nutzen."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Excel-Datei konnte nicht gelesen werden."));
    reader.onload = () => {
      const workbook = XLSX.read(reader.result, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      resolve(XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }));
    };
    reader.readAsArrayBuffer(file);
  });
}

function readPdf(file) {
  return new Promise((resolve, reject) => {
    if (!window.pdfjsLib) return reject(new Error("PDF-Leser ist nicht geladen. Bitte Seite neu laden und nochmal versuchen."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("PDF konnte nicht gelesen werden."));
    reader.onload = async () => {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
        const pdf = await window.pdfjsLib.getDocument({ data: reader.result }).promise;
        let text = "";
        const pages = [];
        for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
          const page = await pdf.getPage(pageNo);
          const viewport = page.getViewport({ scale: 1 });
          const content = await page.getTextContent();
          const items = content.items
            .map(item => ({
              text: String(item.str || "").trim(),
              x: item.transform[4],
              y: item.transform[5],
              w: item.width || 0,
              h: Math.abs(item.transform[3]) || 0
            }))
            .filter(item => item.text);
          pages.push({ width: viewport.width, height: viewport.height, items });
          text += items.map(item => item.text).join("\n") + "\n";
        }
        const rows = rowsFromPepPages(pages, text);
        if (!rows.length) throw new Error("Im PDF wurden keine Schichten erkannt. Bitte PEP-Druckplan mit Namen und Zeiten hochladen.");
        resolve(rows);
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function rowsFromPepHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const dates = detectHtmlDates(doc, html);
  const employees = Array.from(doc.querySelectorAll('[id^="employee-"]'))
    .map(cell => {
      const match = String(cell.id || "").match(/^employee-(\d+)$/);
      const name = normalizePersonName(cell.querySelector(".Employee__Link")?.textContent || "");
      return match && name ? { rowIndex: match[1], name } : null;
    })
    .filter(Boolean);

  if (!employees.length) {
    throw new Error("HTML nicht erkannt: Es wurden keine Mitarbeiterzeilen gefunden. Bitte aus der PEP-Druckansicht speichern, nicht aus einer leeren/normalen Seite.");
  }

  if (dates.length < 3) {
    throw new Error("HTML nicht erkannt: Es wurden keine Kalenderdaten gefunden. Bitte die Wochen-Druckansicht aus PEP speichern.");
  }

  lastPepTextNames = employees.map(employee => employee.name);
  const rows = [];
  for (const employee of employees) {
    for (let dayIndex = 0; dayIndex < dates.length; dayIndex++) {
      const cell = doc.querySelector(`td[data-tr-index="${employee.rowIndex}"][data-td-index="${dayIndex}"]`);
      if (!cell) continue;
      const cellText = cleanDomText(cell.textContent || "");
      for (const shift of extractCellShifts(cellText)) {
        rows.push({
          Mitarbeiter: employee.name,
          Datum: dates[dayIndex] || "",
          Start: shift.start,
          Ende: shift.end,
          Abteilung: shift.department || "",
          Pause: shift.breakTime || ""
        });
      }
    }
  }

  if (!rows.length) {
    throw new Error(`HTML erkannt (${employees.length} Mitarbeiter), aber keine Schichten gefunden. Bitte pruefen, ob die gespeicherte PEP-Datei die Druckansicht mit sichtbaren Dienstzeiten enthaelt.`);
  }

  return rows;
}

function detectHtmlDates(doc, html) {
  const headerDates = Array.from(doc.querySelectorAll(".DayHeaderOnPrint .date-format"))
    .map(item => cleanDomText(item.textContent || ""))
    .filter(Boolean);
  const year = detectHtmlYear(doc, html);
  const uniqueDates = unique(headerDates)
    .map(value => dateFromHeader(value, [`01.01.${year}`]))
    .filter(Boolean);
  if (uniqueDates.length >= 3) return uniqueDates.slice(0, 7);

  const savedUrlDate = String(html || "").match(/\/(20\d{2})-(\d{1,2})-(\d{1,2})(?:[^\d]|$)/);
  if (savedUrlDate) {
    const start = `${savedUrlDate[3].padStart(2, "0")}.${savedUrlDate[2].padStart(2, "0")}.${savedUrlDate[1]}`;
    const startDate = parseGermanDate(start);
    const maxDayIndex = Math.max(0, ...Array.from(String(html).matchAll(/data-td-index="(\d+)"/g)).map(match => Number(match[1])).filter(Number.isFinite));
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + Math.min(Math.max(maxDayIndex, 5), 6));
    return dateRange(start, formatGermanDate(endDate));
  }

  return detectDates(doc.body?.textContent || html);
}

function detectHtmlYear(doc, html) {
  const title = doc.querySelector("title")?.textContent || "";
  return (title.match(/\b(20\d{2})\b/) || String(html).match(/\b(20\d{2})\b/) || [null, String(new Date().getFullYear())])[1];
}

function cleanDomText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowsFromPepPages(pages, text) {
  const dates = detectDates(text);
  const rows = [];
  for (const page of pages) {
    const pageRows = rowsFromPositionedPage(page, dates);
    rows.push(...pageRows);
  }
  if (rows.length) return rows;
  return rowsFromPepText(text);
}

function rowsFromCopiedPepPlan(text) {
  const rawText = String(text || "").replace(/\u00a0/g, " ").replace(/\r/g, "");
  assertCompletePepCopy(rawText);
  const dates = detectDates(rawText);
  const rows = [];
  const blocks = splitEmployeeBlocks(rawText);

  for (const block of blocks) {
    rows.push(...rowsFromCopiedEmployeeBlock(block.name, block.text, dates));
  }

  return rows;
}

function assertCompletePepCopy(text) {
  const blocks = splitEmployeeBlocks(text);
  const ranges = extractTimeRanges(text);
  const hasDepartment = knownDepartments().some(department => text.toLowerCase().includes(department.toLowerCase()));
  if (blocks.length >= 5 && ranges.length < 3 && !hasDepartment) {
    throw new Error("Der kopierte PEP-Text ist unvollstaendig: Es sind nur Namen/Kalenderdaten drin, aber keine Schichten mit Zeiten und Abteilungen. Bitte PDF hochladen oder den Plan direkt aus PEP importieren lassen.");
  }
}

function rowsFromCopiedEmployeeBlock(employee, block, dates) {
  const rows = [];
  const cells = String(block)
    .split(/\n\s*\t+\s*\n/g)
    .map(cell => cell.trim())
    .filter(cell => cell && !cell.startsWith("drag_handle"));

  for (let dayIndex = 0; dayIndex < cells.length && dayIndex < dates.length; dayIndex++) {
    const cell = cells[dayIndex];
    for (const shift of extractCellShifts(cell)) {
      rows.push({
        Mitarbeiter: employee,
        Datum: dates[dayIndex] || "",
        Start: shift.start,
        Ende: shift.end,
        Abteilung: shift.department || "",
        Pause: shift.breakTime || ""
      });
    }
  }

  return rows;
}

function isTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function orderTimes(first, second) {
  if (!isTime(first) || !isTime(second)) return { start: first, end: second };
  const firstMinutes = timeToMinutes(first);
  const secondMinutes = timeToMinutes(second);
  if (firstMinutes > secondMinutes && first !== "00:00" && second !== "00:00") {
    return { start: second, end: first };
  }
  return { start: first, end: second };
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

function firstPause(lines) {
  return normalizeBreakValue(lines.find(line => normalizeBreakValue(line)) || "");
}

function isBreakTimeValue(value) {
  return /^00:(15|30|45)$/.test(String(value || ""));
}

function firstDepartment(lines) {
  const joined = lines.join(" ");
  const known = knownDepartments();
  return known.find(item => joined.toLowerCase().includes(item.toLowerCase())) || "";
}

function indexAfterDepartment(lines) {
  const known = knownDepartments();
  for (let i = 0; i < lines.length; i++) {
    if (known.some(item => lines.slice(i, i + 3).join(" ").toLowerCase().includes(item.toLowerCase()))) return i + 3;
  }
  return 8;
}

function rowsFromPositionedPage(page, dates) {
  const rows = [];
  const items = page.items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const nameItems = items
    .filter(item => item.x < page.width * 0.28 && isEmployeeName(item.text))
    .sort((a, b) => b.y - a.y);
  if (!nameItems.length) return rows;

  const columns = detectDayColumns(page, dates);
  if (!columns.length) return rows;

  for (let i = 0; i < nameItems.length; i++) {
    const nameItem = nameItems[i];
    const upper = i === 0 ? nameItem.y + 32 : (nameItems[i - 1].y + nameItem.y) / 2;
    const lower = i === nameItems.length - 1 ? nameItem.y - 42 : (nameItem.y + nameItems[i + 1].y) / 2;
    const band = items.filter(item => item.y <= upper && item.y >= lower && item.x > page.width * 0.16);

    for (let c = 0; c < columns.length; c++) {
      const column = columns[c];
      const cellText = band
        .filter(item => item.x >= column.left && item.x < column.right)
        .sort((a, b) => b.y - a.y || a.x - b.x)
        .map(item => item.text)
        .join(" ");
      for (const shift of extractCellShifts(cellText)) {
        rows.push({
          Mitarbeiter: nameItem.text.replace(/\s+/g, " ").trim(),
          Datum: column.date || dates[c] || "",
          Start: shift.start,
          Ende: shift.end,
          Abteilung: shift.department || "",
          Pause: shift.breakTime || ""
        });
      }
    }
  }

  return rows;
}

function detectDayColumns(page, dates) {
  const headerItems = page.items
    .filter(item => item.x > page.width * 0.12 && item.y > page.height * 0.55 && isDateLike(item.text))
    .sort((a, b) => a.x - b.x);
  const headers = [];
  for (const item of headerItems) {
    if (!headers.some(existing => Math.abs(existing.x - item.x) < 18)) {
      headers.push(item);
    }
  }

  if (headers.length >= 3) {
    return headers.map((item, index) => {
      const left = index === 0 ? page.width * 0.13 : (headers[index - 1].x + item.x) / 2;
      const right = index === headers.length - 1 ? page.width + 1 : (item.x + headers[index + 1].x) / 2;
      return { left, right, date: dates[index] || dateFromHeader(item.text, dates) };
    });
  }

  const count = dates.length >= 6 ? dates.length : 6;
  const left = page.width * 0.16;
  const right = page.width - 4;
  const width = (right - left) / count;
  return Array.from({ length: count }, (_, index) => ({
    left: left + index * width,
    right: left + (index + 1) * width,
    date: dates[index] || ""
  }));
}

function isEmployeeName(value) {
  const text = String(value || "").trim();
  if (/^(Name|Datum|Summe|PEP|KW|Juli|August|September|Montag|Dienstag)$/i.test(text)) return false;
  return /^[A-Z\u00c4\u00d6\u00dc][A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df .'-]+,\s*[A-Z\u00c4\u00d6\u00dc][A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df .'-]+$/.test(text);
}

function isDateLike(value) {
  return /\b(?:Mo|Di|Mi|Do|Fr|Sa|So)?\.?\s*\d{1,2}\.\d{1,2}\.?(?:\d{2,4})?\b/.test(String(value || ""));
}

function dateFromHeader(value, dates) {
  const match = String(value || "").match(/(\d{1,2})\.(\d{1,2})\.?(?:(\d{2,4}))?/);
  if (!match) return "";
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : ((dates[0] || "").split(".")[2] || String(new Date().getFullYear()));
  return `${day}.${month}.${year}`;
}

function rowsFromPepText(text) {
  const cleanText = String(text || "").replace(/\u00a0/g, " ");
  const dates = detectDates(cleanText);
  const employeeBlocks = splitEmployeeBlocks(cleanText);
  const rows = [];

  for (const block of employeeBlocks) {
    const ranges = extractTimeRanges(block.text);
    let dateIndex = 0;
    for (const range of ranges) {
      if (range.start === "00:00" && (range.end === "00:00" || range.end === "01:00")) continue;
      rows.push({
        Mitarbeiter: block.name,
        Datum: dates[dateIndex] || "",
        Start: range.start,
        Ende: range.end,
        Abteilung: range.department || "",
        Pause: range.breakTime || ""
      });
      dateIndex++;
    }
  }

  return rows;
}

function detectDates(text) {
  const weekRange = String(text || "").match(/KW\s+\d+\s+(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})/);
  if (weekRange) {
    return dateRange(
      `${weekRange[1]}.${weekRange[2]}.${weekRange[3]}`,
      `${weekRange[4]}.${weekRange[5]}.${weekRange[6]}`
    );
  }

  const fullDates = Array.from(text.matchAll(/\b(\d{2})\.(\d{2})\.(\d{4})\b/g)).map(match => match[0]);
  const visiblePlanDates = fullDates.filter(date => !String(text).includes(`cloud_upload${date}`));
  if (visiblePlanDates.length >= 3) return unique(visiblePlanDates).slice(0, 7);

  const year = (text.match(/\b(20\d{2})\b/) || [null, String(new Date().getFullYear())])[1];
  const shortDates = [];
  for (const match of text.matchAll(/\b(?:Mo|Di|Mi|Do|Fr|Sa|So)\.?\s*(\d{1,2})\.(\d{1,2})\.?/g)) {
    shortDates.push(`${match[1].padStart(2, "0")}.${match[2].padStart(2, "0")}.${year}`);
  }
  return unique(shortDates).slice(0, 7);
}

function dateRange(start, end) {
  const startDate = parseGermanDate(start);
  const endDate = parseGermanDate(end);
  if (!startDate || !endDate) return [];
  const dates = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate && dates.length < 14) {
    dates.push(formatGermanDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function parseGermanDate(value) {
  const match = String(value || "").match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function formatGermanDate(date) {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function splitEmployeeBlocks(text) {
  const nameRegex = /([A-Z\u00c4\u00d6\u00dc][A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df .'\-]+,\s*[A-Z\u00c4\u00d6\u00dc][A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df .'\-]+)/g;
  const matches = Array.from(text.matchAll(nameRegex)).filter(match => !/Name|Datum|Summe/.test(match[1]));
  const blocks = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i][0].length;
    const end = matches[i + 1]?.index ?? text.length;
    blocks.push({ name: matches[i][1].replace(/\s+/g, " ").trim(), text: text.slice(start, end) });
  }
  return blocks;
}

function extractTimeRanges(text) {
  const flat = String(text || "").replace(/\s+/g, " ");
  const ranges = [];
  const rangeRegex = /(\d{2}:\d{2})\s*(?:-|–|—|â€“|â€”|-)\s*(\d{2}:\d{2})/g;
  const matches = Array.from(flat.matchAll(rangeRegex));
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const nextIndex = matches[index + 1]?.index ?? match.index + 180;
    const context = match.input.slice(match.index, Math.min(nextIndex, match.index + 180));
    ranges.push({
      start: match[1],
      end: match[2],
      breakTime: detectBreak(context),
      department: detectDepartment(context)
    });
  }

  if (ranges.length) return ranges;

  const tokens = flat.match(/\d{2}:\d{2}|[A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df&/]+/g) || [];
  for (let i = 0; i < tokens.length - 2; i++) {
    if (/^\d{2}:\d{2}$/.test(tokens[i]) && /^\d{2}:\d{2}$/.test(tokens[i + 1])) {
      const context = tokens.slice(i, i + 12).join(" ");
      ranges.push({
        start: tokens[i],
        end: tokens[i + 1],
        breakTime: detectBreak(context),
        department: detectDepartment(context)
      });
      i++;
    }
  }
  return ranges;
}

function extractCellShifts(text) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (!flat) return [];

  const status = detectStatusText(flat);
  if (status) {
    return [{
      start: "00:00",
      end: "00:00",
      breakTime: "",
      department: status
    }];
  }

  const explicit = extractTimeRanges(flat)
    .filter(range => isTime(range.start) && isTime(range.end))
    .filter(range => !isPlaceholderRange(range.start, range.end));
  const dayBreak = detectBreak(flat);
  const withDepartment = explicit
    .filter(range => range.department)
    .map(range => ({ ...range, breakTime: range.breakTime || dayBreak || "" }));
  if (withDepartment.length) return dedupeShifts(withDepartment);
  if (explicit.length) return [];

  const times = Array.from(flat.matchAll(/\b\d{2}:\d{2}\b/g)).map(match => match[0]);
  if (times.length < 2) return [];
  const start = times[0];
  const end = times[1];
  if (isBreakTimeValue(start) || isBreakTimeValue(end)) return [];
  const ordered = orderTimes(start, end);
  if (isPlaceholderRange(ordered.start, ordered.end)) return [];
  const department = detectDepartment(flat);
  if (!department) return [];
  return [{
    start: ordered.start,
    end: ordered.end,
    breakTime: detectBreak(flat) || "",
    department
  }];
}

function detectStatusText(text) {
  const value = String(text || "").toLowerCase();
  if (value.includes("sonderurlaub")) return "Sonderurlaub";
  if (value.includes("seminar")) return "Seminar";
  if (value.includes("krank") && value.includes("aau")) return "Krank angemeldet (aAu)";
  if (value.includes("krank")) return "Krankheit";
  if (value.includes("urlaub")) return "Urlaub";
  if (value.includes("abwesenheit")) return "Abwesenheit";
  if (value.includes("frei")) return "Frei";
  return "";
}

function dedupeShifts(shifts) {
  const seen = new Set();
  const result = [];
  for (const shift of shifts) {
    const key = `${shift.start}|${shift.end}|${shift.department || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(shift);
  }
  return removeSummaryRanges(result);
}

function removeSummaryRanges(shifts) {
  return shifts.filter((shift, index) => {
    const start = timeToMinutes(shift.start);
    const end = timeToMinutes(shift.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return true;
    const inside = shifts.filter((other, otherIndex) => {
      if (otherIndex === index) return false;
      const otherStart = timeToMinutes(other.start);
      const otherEnd = timeToMinutes(other.end);
      return Number.isFinite(otherStart) && Number.isFinite(otherEnd) && otherStart >= start && otherEnd <= end;
    });
    if (inside.length < 2) return true;
    const minStart = Math.min(...inside.map(other => timeToMinutes(other.start)));
    const maxEnd = Math.max(...inside.map(other => timeToMinutes(other.end)));
    return !(minStart === start && maxEnd === end);
  });
}

function fallbackBreak(start, end) {
  if (!isTime(start) || !isTime(end)) return "";
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  const duration = endMinutes >= startMinutes ? endMinutes - startMinutes : endMinutes + 1440 - startMinutes;
  if (duration > 360 && duration <= 540) return "00:30";
  if (duration > 540) return "00:45";
  return "";
}

function isPlaceholderRange(start, end) {
  return start === "00:00" && (end === "00:00" || end === "01:00");
}

function detectBreak(text) {
  return normalizeBreakValue(text);
}

function normalizeBreakValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const lower = text.toLowerCase().replace(",", ".");

  const time = lower.match(/\b(?:00?|0):(15|30|45)\b/);
  if (time) return `00:${time[1]}`;

  const compactTime = lower.match(/\b00(15|30|45)\b/);
  if (compactTime) return `00:${compactTime[1]}`;

  const standaloneMinutes = lower.match(/(?:^|[^\d:])(15|30|45)(?![\d:])/);
  if (standaloneMinutes) return `00:${standaloneMinutes[1]}`;

  const minutes = lower.match(/\b(15|30|45|60)\s*(?:min|minute|minutes|m)\b/);
  if (minutes) return minutes[1] === "60" ? "01:00" : `00:${minutes[1]}`;

  const decimal = lower.match(/\b0\.(25|5|50|75)\b/);
  if (decimal) {
    if (decimal[1] === "25") return "00:15";
    if (decimal[1] === "5" || decimal[1] === "50") return "00:30";
    if (decimal[1] === "75") return "00:45";
  }

  if (/^\s*(15|30|45|60)\s*$/.test(lower)) {
    const onlyMinutes = lower.match(/\d+/)[0];
    return onlyMinutes === "60" ? "01:00" : `00:${onlyMinutes}`;
  }

  return "";
}

function detectDepartment(text) {
  const value = String(text || "").toLowerCase();
  const known = knownDepartments();
  return known
    .filter(item => value.includes(item.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0] || "";
}

function knownDepartments() {
  return [
    "Marktleitung", "Marktaufsicht", "SCO Kasse", "Backshop", "Einarbeitung intern", "Einarbeitung", "Kasse", "Food Abteilung",
    "Obst & Gemuese", "Obst & Gem\u00fcse", "Getraenke", "Getr\u00e4nke", "BakeOff",
    "Tiefkuehl", "Tiefk\u00fchl", "Inventur", "Lotto", "Information",
    "Next Kurse", "Notdienst", "B\u00fcro", "Buero", "Zeitung", "Remision",
    "Auto Dispo",
    "Lager", "Mopro", "Non Food", "Werbung", "Getraenke Abteilung", "Getr\u00e4nke Abteilung"
  ];
}

function unique(values) {
  return Array.from(new Set(values));
}

function csvToRows(text) {
  const lines = parseCsv(text);
  const head = (lines.shift() || []).map(x => String(x || "").replace(/^\uFEFF/, "").trim());
  return lines.filter(row => row.some(Boolean)).map(row => Object.fromEntries(head.map((key, i) => [key, row[i] || ""])));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const sep = text.includes(";") ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === sep && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

loadAdmin();




