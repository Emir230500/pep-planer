let parsedRows = [];
let headers = [];
let currentFileType = "";
let adminState = { plans: [], employees: [], publishedPlans: [] };
let inspected = { plan: null, shifts: [], issues: [], missingEmployees: [], changes: [] };
let lastPepTextNames = [];
let lastCoverageWarning = "";
let editShift = null;
let inspectionEditMap = new Map();
let activeAdminViewPanel = "plans";
let inspectCalendarOpen = false;
let inspectCalendarMonth = "";
let inspectPanelVisible = false;

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
  if (!res.ok) {
    const error = new Error(res.status === 401 ? "Sitzung abgelaufen. Bitte neu anmelden." : (data.error || "Fehler"));
    error.status = res.status;
    if (res.status === 401) reloadOnceAfterExpiredSession();
    throw error;
  }
  return data;
}

function reloadOnceAfterExpiredSession() {
  if (sessionStorage.getItem("adminSessionReloadedAfter401")) return;
  sessionStorage.setItem("adminSessionReloadedAfter401", "1");
  window.setTimeout(() => window.location.reload(), 500);
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

document.querySelectorAll("[data-admin-view]").forEach(button => {
  button.addEventListener("click", () => {
    activeAdminViewPanel = button.dataset.adminView;
    renderAdminViewSwitch();
  });
});

async function submitAdminLogin() {
  const msg = document.querySelector("#adminLoginMsg");
  const button = document.querySelector("#adminLoginBtn");
  if (button?.disabled) return;
  msg.textContent = "Anmeldung laeuft...";
  msg.classList.remove("error", "success-msg");
  button?.classList.remove("login-tap");
  void button?.offsetWidth;
  button?.classList.add("login-tap");
  if (button) {
    button.disabled = true;
    button.textContent = "Anmelden...";
  }
  try {
    await api("/api/admin/login", { method: "POST", body: { password: document.querySelector("#adminPassword").value } });
    msg.textContent = "Admin angemeldet.";
    msg.classList.add("success-msg");
    await loadAdmin();
  } catch (error) {
    msg.textContent = error.message;
    msg.classList.add("error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Anmelden";
    }
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
    sessionStorage.removeItem("adminSessionReloadedAfter401");
    adminState = data;
    const buildVersion = document.querySelector("#buildVersion");
    if (buildVersion) buildVersion.textContent = `Version: ${data.buildVersion || "alt/ohne Pausenfix"}`;
    loginBox.classList.add("hidden");
    adminArea.classList.remove("hidden");
    try {
      renderAdminViewSwitch();
      renderActivePlan(data.publishedPlans || []);
      renderPepCorrections(data.pepCorrections || []);
      renderPlans(data.plans);
      renderPins(data.employees);
      refreshUploadModeChoice();
      const firstPlan = (data.publishedPlans || [])[0] || data.plans[0];
      renderInspectPlanOptions(data.plans, firstPlan?.id || "");
      if (firstPlan?.id) await loadInspection(firstPlan.id);
    } catch (renderError) {
      const msg = document.querySelector("#inspectMsg") || document.querySelector("#uploadMsg");
      if (msg) {
        msg.textContent = `Admin geladen, aber ein Bereich hat einen Fehler: ${renderError.message}`;
        msg.classList.add("error");
      }
    }
  } catch (error) {
    const msg = document.querySelector("#adminLoginMsg");
    if (msg) {
      msg.textContent = error.message || "Bitte neu anmelden.";
      msg.classList.add("error");
      msg.classList.remove("success-msg");
    }
    loginBox.classList.remove("hidden");
    adminArea.classList.add("hidden");
  }
}

function renderAdminViewSwitch() {
  document.querySelectorAll("[data-admin-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.adminView === activeAdminViewPanel);
  });
  document.querySelectorAll("[data-admin-view-content]").forEach(panel => {
    panel.classList.toggle("hidden", panel.dataset.adminViewContent !== activeAdminViewPanel);
  });
  document.querySelector("#inspectPanel")?.classList.toggle("hidden", !inspectPanelVisible);
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

function employeeKey(name) {
  return normalizePersonName(name).toLowerCase();
}

function renderPlans(plans) {
  const sortedPlans = sortPlansByDate(plans);
  document.querySelector("#planList").innerHTML = sortedPlans.length ? sortedPlans.map(plan => `
    <div class="item plan-item plan-row ${isCurrentPlanWeek(plan) ? "current-plan-item" : ""}">
      <div class="plan-row-main">
        <div class="plan-title-line">
          <strong>${escapeHtml(plan.title)}</strong>
          ${isCurrentPlanWeek(plan) ? '<span class="badge">Aktuelle KW</span>' : ""}
          ${plan.isPublished ? '<span class="badge">Veroeffentlicht</span>' : ""}
          ${plan.version > 1 ? `<span class="badge subtle">Version ${plan.version}</span>` : ""}
        </div>
        <div class="plan-row-meta">
          <span>Zeitraum: ${escapeHtml(plan.range || "offen")}</span>
          <span>Upload: ${formatDateTime(plan.uploadedAt)}</span>
          <span>${plan.shiftCount} Schichten</span>
          ${plan.changeCount ? `<span class="warn-text">${plan.changeCount} Aenderungen</span>` : ""}
          ${plan.issueCount ? `<span class="warn-text">${plan.issueCount} Hinweise</span>` : ""}
        </div>
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
      activeAdminViewPanel = "manage";
      inspectPanelVisible = true;
      renderAdminViewSwitch();
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
      <div class="active-card ${isCurrentPlanWeek(plan) ? "current-active-card" : ""}">
        <div>
          <strong>${escapeHtml(plan.title)}</strong> ${isCurrentPlanWeek(plan) ? '<span class="badge">Aktuelle KW</span>' : ""} ${plan.version > 1 ? `<span class="badge subtle">Version ${plan.version}</span>` : ""}<br>
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
      <details class="correction-overview">
        <summary>
          <span><strong>Offene PEP-Korrekturen</strong><small>KW, Tage und Namen erst beim Oeffnen anzeigen</small></span>
          <span class="badge warn-badge">${open.length} offen</span>
        </summary>
        ${renderPepCorrectionGroups(open, false)}
      </details>
    ` : '<p class="ok-text">Alles fuer PEP abgehakt.</p>'}
    ${done.length ? `
      <details class="done-corrections">
        <summary>Erledigte Korrekturen anzeigen (${done.length})</summary>
        ${renderPepCorrectionGroups(done, true)}
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
  document.querySelectorAll("[data-correction-done-many]").forEach(button => {
    button.addEventListener("click", async () => {
      for (const id of button.dataset.correctionDoneMany.split("|").filter(Boolean)) {
        await api(`/api/admin/pep-corrections/${encodeURIComponent(id)}/done`, {
          method: "POST",
          body: { done: true }
        });
      }
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
  document.querySelectorAll("[data-correction-open-many]").forEach(button => {
    button.addEventListener("click", async () => {
      for (const id of button.dataset.correctionOpenMany.split("|").filter(Boolean)) {
        await api(`/api/admin/pep-corrections/${encodeURIComponent(id)}/done`, {
          method: "POST",
          body: { done: false }
        });
      }
      await loadAdmin();
    });
  });
}

function renderPepCorrectionGroups(corrections, doneList) {
  const weeks = groupChangesByWeek(corrections);
  return `
    <div class="correction-week-list ${doneList ? "done-list" : ""}">
      ${weeks.map((week, index) => `
        <details class="correction-week ${week.isCurrent ? "current-correction-week" : ""}" ${week.isCurrent || index === 0 ? "open" : ""}>
          <summary>
            <span><strong>KW ${escapeHtml(week.week)}</strong>${week.year ? ` / ${escapeHtml(week.year)}` : ""}</span>
            <span class="correction-summary-badges">
              ${week.isCurrent ? '<span class="badge">Aktuelle KW</span>' : ""}
              <span class="badge ${doneList ? "subtle" : "warn-badge"}">${week.changes.length} ${doneList ? "erledigt" : "offen"}</span>
            </span>
          </summary>
          <div class="correction-day-list">
            ${week.days.map(day => {
              const parsed = parseGermanDate(day.date);
              return `
                <details class="correction-day">
                  <summary>
                    <span><strong>${escapeHtml(weekdayLong(parsed))}</strong>, ${escapeHtml(day.date)}</span>
                    <span class="badge subtle">${day.changes.length}</span>
                  </summary>
                  <div class="correction-list">
                    ${groupCorrectionsByPerson(day.changes).map(group => renderPepCorrectionPerson(group, doneList)).join("")}
                  </div>
                </details>
              `;
            }).join("")}
          </div>
        </details>
      `).join("")}
    </div>
  `;
}

function groupCorrectionsByPerson(corrections) {
  const groups = new Map();
  for (const item of corrections || []) {
    const key = employeeKey(item.name);
    if (!groups.has(key)) groups.set(key, { name: item.name, items: [] });
    groups.get(key).items.push(item);
  }
  return Array.from(groups.values())
    .map(group => ({
      ...group,
      items: group.items.slice().sort((a, b) => Number(b.isLatestForPersonDay) - Number(a.isLatestForPersonDay) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    }))
    .sort((a, b) => Number(b.items.some(item => item.isLatestForPersonDay)) - Number(a.items.some(item => item.isLatestForPersonDay)) || a.name.localeCompare(b.name, "de"));
}

function renderPepCorrectionPerson(group, doneList) {
  const ids = group.items.map(item => item.id).filter(Boolean).join("|");
  const latest = group.items.find(item => item.isLatestForPersonDay) || group.items[0];
  const older = group.items.filter(item => item !== latest);
  return `
    <details class="correction-person ${doneList ? "done" : ""}">
      <summary class="correction-person-head">
        <span>
          <strong>${escapeHtml(group.name)}</strong>
          <span class="badge subtle">${group.items.length} ${group.items.length === 1 ? "Aenderung" : "Aenderungen"}</span>
          ${latest?.isLatestForPersonDay ? '<span class="badge">Aktuell gueltig</span>' : ""}
        </span>
      </summary>
      <div class="correction-person-body">
        <div class="actions">
          ${doneList
            ? `<button class="secondary" data-correction-open-many="${escapeHtml(ids)}">Wieder offen</button>`
            : `<button data-correction-done-many="${escapeHtml(ids)}">Erledigt</button>`}
        </div>
        <div class="correction-mini-list">
          ${latest ? renderPepCorrectionMini(latest, true) : ""}
          ${older.length ? `
            <details class="older-corrections">
              <summary>${older.length} vorherige ${older.length === 1 ? "Aenderung" : "Aenderungen"} anzeigen</summary>
              ${older.map(item => renderPepCorrectionMini(item, false)).join("")}
            </details>
          ` : ""}
        </div>
      </div>
    </details>
  `;
}

function renderPepCorrectionMini(item, prominent = false) {
  return `
    <div class="correction-mini ${prominent || item.isLatestForPersonDay ? "latest-correction-mini" : ""}">
      <div>
        <span class="badge subtle">${changeTypeLabel(item.type)}</span>
        ${prominent || item.isLatestForPersonDay ? '<span class="badge">Diese Schicht ist aktuell</span>' : ""}
        <span class="meta">Quelle: ${escapeHtml(item.source || "Import")}</span>
      </div>
      <p><span class="meta">Alt:</span> ${escapeHtml(item.before)}</p>
      <p><span class="meta">Neu:</span> ${escapeHtml(item.after)}</p>
      <p class="correction-note">PEP: ${escapeHtml(correctionShortInstruction(item))}</p>
    </div>
  `;
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
document.querySelectorAll("#inspectEmployee, #inspectDepartment, #inspectDay").forEach(input => {
  input.addEventListener("change", renderInspection);
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

function isCurrentPlanWeek(plan) {
  const start = new Date(planStartDate(plan));
  if (Number.isNaN(start.getTime())) return false;
  const current = isoWeekInfo(new Date());
  const planWeek = isoWeekInfo(start);
  return Boolean(current && planWeek && current.week === planWeek.week && current.year === planWeek.year);
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
  if (focusPanel) {
    activeAdminViewPanel = "manage";
    inspectPanelVisible = true;
    renderAdminViewSwitch();
  }
  const msg = document.querySelector("#inspectMsg");
  if (msg) {
    msg.textContent = "Plan wird geladen...";
    msg.classList.remove("error");
  }
  try {
    const data = await api(`/api/admin/plans/${encodeURIComponent(id)}`);
    inspected = data;
    inspectCalendarMonth = monthKey(planDateRange(data.plan)?.start) || inspectCalendarMonth;
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
  updateInspectFilterOptions();
  issueList.innerHTML = `${renderInspectActions()}${renderShiftEditForm()}${issues.length ? `
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
    issueList.innerHTML += renderInspectionChanges(changes);
  }

  const employee = document.querySelector("#inspectEmployee")?.value || "";
  const department = document.querySelector("#inspectDepartment")?.value || "";
  renderInspectCalendar();
  const day = document.querySelector("#inspectDay")?.value || "";
  const filtered = inspected.shifts
    .filter(shift => !employee || normalizePersonName(shift.name) === employee)
    .filter(shift => !department || (shift.department || "") === department)
    .filter(shift => !day || shift.date === day)
    .sort((a, b) => (parseGermanDate(a.date) - parseGermanDate(b.date)) || a.name.localeCompare(b.name, "de") || timeToMinutes(a.start) - timeToMinutes(b.start));

  const groupedWeeks = groupInspectionByWeek(filtered);
  inspectionEditMap = new Map();
  inspectList.innerHTML = groupedWeeks.length
    ? groupedWeeks.map(group => renderInspectionWeek(group, group.isCurrent)).join("")
    : '<p class="hint">Keine Schichten fuer diese Filter.</p>';

  document.querySelectorAll("[data-inspect-week-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      button.closest(".inspect-week")?.classList.toggle("collapsed");
    });
  });
  document.querySelectorAll("[data-inspect-day-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      button.closest(".inspect-day")?.classList.toggle("collapsed");
    });
  });
  document.querySelectorAll("[data-edit-shift]").forEach(button => {
    button.addEventListener("click", () => {
      editShift = inspectionEditMap.get(button.dataset.editShift) || null;
      renderInspection();
      document.querySelector("#shiftEditBox")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.querySelector("#addInspectionShift")?.addEventListener("click", () => {
    editShift = newInspectionShift();
    renderInspection();
    document.querySelector("#shiftEditBox")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelector("#cancelShiftEdit")?.addEventListener("click", () => {
    editShift = null;
    renderInspection();
  });
  document.querySelectorAll("#editStart, #editEnd").forEach(input => {
    input.addEventListener("blur", () => {
      input.value = normalizeTimeValue(input.value);
    });
  });
  document.querySelector("#saveShiftEdit")?.addEventListener("click", saveShiftEdit);
  document.querySelector("#deleteShiftEdit")?.addEventListener("click", deleteShiftEdit);
}

function renderInspectActions() {
  return `
    <div class="inspection-actions">
      <div>
        <strong>Plan pruefen und korrigieren</strong>
        <p class="hint">Hier kontrollierst du den geladenen Plan, bearbeitest Dienste oder fuegst fehlende Schichten hinzu.</p>
      </div>
      <button id="addInspectionShift" class="secondary" type="button">+ Schicht hinzufuegen</button>
    </div>
  `;
}

function updateInspectFilterOptions() {
  const shifts = inspected.shifts || [];
  const selectedEmployee = document.querySelector("#inspectEmployee")?.value || "";
  const selectedDay = document.querySelector("#inspectDay")?.value || "";
  const employees = unique(shifts.map(shift => normalizePersonName(shift.name)).filter(Boolean))
    .sort((a, b) => a.localeCompare(b, "de"));
  const employeeShifts = selectedEmployee
    ? shifts.filter(shift => normalizePersonName(shift.name) === selectedEmployee)
    : shifts;
  const dayEmployeeShifts = selectedDay
    ? employeeShifts.filter(shift => shift.date === selectedDay)
    : [];
  const departmentSource = dayEmployeeShifts.length ? dayEmployeeShifts : employeeShifts;
  const departments = uniqueDepartments(departmentSource.map(shift => shift.department || "").filter(Boolean))
    .sort((a, b) => a.localeCompare(b, "de"));
  updateSelectOptions("#inspectEmployee", "Alle Mitarbeiter", employees, value => value);
  updateSelectOptions("#inspectDepartment", "Alle Abteilungen", departments, value => value, Boolean(selectedEmployee));
}

function updateSelectOptions(selector, emptyLabel, values, labelFn, autoSelectSingle = false) {
  const select = document.querySelector(selector);
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>${values.map(value => `
    <option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(labelFn(value))}</option>
  `).join("")}`;
  if (current && !values.includes(current)) select.value = "";
  if (autoSelectSingle && !select.value && values.length === 1) select.value = values[0];
}

function inspectMonthLabel(value) {
  const [year, month] = String(value || "").split("-").map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

function inspectDayOptions(selectedMonth) {
  return inspectSelectableDates(selectedMonth);
}

function monthCalendarDates(selectedMonth) {
  if (selectedMonth) {
    const [year, month] = selectedMonth.split("-").map(Number);
    if (year && month) {
      const options = [];
      const cursor = new Date(year, month - 1, 1);
      while (cursor.getMonth() === month - 1) {
        options.push(formatGermanDate(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      return options;
    }
  }
  return unique((inspected.shifts || []).map(shift => shift.date).filter(Boolean))
    .sort((a, b) => parseGermanDate(a) - parseGermanDate(b));
}

function inspectSelectableDates(selectedMonth = "") {
  const range = planDateRange(inspected.plan);
  const dates = [];
  if (range) {
    const cursor = new Date(range.start);
    while (cursor <= range.end) {
      const value = formatGermanDate(cursor);
      if (!selectedMonth || monthKey(cursor) === selectedMonth) dates.push(value);
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }
  return monthCalendarDates(selectedMonth);
}

function renderInspectCalendar() {
  const box = document.querySelector("#inspectCalendar");
  const input = document.querySelector("#inspectDay");
  if (!box || !input) return;
  const months = inspectMonthOptions();
  if (!months.length) {
    input.value = "";
    box.innerHTML = "";
    return;
  }
  const allDates = months.flatMap(month => inspectDayOptions(month));
  if (input.value && !allDates.includes(input.value)) input.value = "";
  const selectedMonth = input.value ? monthKey(parseGermanDate(input.value)) : "";
  const rangeMonth = inspected.plan ? monthKey(planDateRange(inspected.plan)?.start) : "";
  if (!inspectCalendarMonth || !months.includes(inspectCalendarMonth)) {
    inspectCalendarMonth = selectedMonth || rangeMonth || months[0];
  }
  const monthIndex = months.indexOf(inspectCalendarMonth);
  const hasPrevious = monthIndex > 0;
  const hasNext = monthIndex >= 0 && monthIndex < months.length - 1;
  const selectedInMonth = input.value && monthKey(parseGermanDate(input.value)) === inspectCalendarMonth;
  box.innerHTML = `
    <div class="calendar-picker">
      <button class="calendar-arrow" data-calendar-prev type="button" ${hasPrevious ? "" : "disabled"} aria-label="Vormonat">&lt;</button>
      <button class="calendar-summary" data-calendar-toggle type="button" aria-expanded="${inspectCalendarOpen ? "true" : "false"}">
        <span>
          <strong>${escapeHtml(inspectMonthLabel(inspectCalendarMonth))}</strong>
          <small>${selectedInMonth ? escapeHtml(`${weekdayLong(parseGermanDate(input.value))}, ${input.value}`) : "Alle Tage"}</small>
        </span>
        <b>${inspectCalendarOpen ? "Schliessen" : "Kalender oeffnen"}</b>
      </button>
      <button class="calendar-arrow" data-calendar-next type="button" ${hasNext ? "" : "disabled"} aria-label="Naechster Monat">&gt;</button>
    </div>
    ${inspectCalendarOpen ? `<div class="calendar-months single">${renderInspectCalendarMonth(inspectCalendarMonth, input.value)}</div>` : ""}
  `;
  document.querySelector("[data-calendar-toggle]")?.addEventListener("click", () => {
    inspectCalendarOpen = !inspectCalendarOpen;
    renderInspection();
  });
  document.querySelector("[data-calendar-prev]")?.addEventListener("click", () => {
    if (!hasPrevious) return;
    inspectCalendarMonth = months[monthIndex - 1];
    inspectCalendarOpen = true;
    renderInspection();
  });
  document.querySelector("[data-calendar-next]")?.addEventListener("click", () => {
    if (!hasNext) return;
    inspectCalendarMonth = months[monthIndex + 1];
    inspectCalendarOpen = true;
    renderInspection();
  });
  document.querySelectorAll("[data-inspect-calendar-day]").forEach(button => {
    button.addEventListener("click", async () => {
      input.value = button.dataset.inspectCalendarDay;
      inspectCalendarMonth = monthKey(parseGermanDate(input.value)) || inspectCalendarMonth;
      const targetPlan = planForDate(input.value);
      if (targetPlan && targetPlan.id !== inspected.plan?.id) {
        await loadInspection(targetPlan.id, false);
      } else {
        renderInspection();
      }
    });
    button.addEventListener("dblclick", async () => {
      input.value = button.dataset.inspectCalendarDay;
      inspectCalendarMonth = monthKey(parseGermanDate(input.value)) || inspectCalendarMonth;
      inspectCalendarOpen = false;
      const targetPlan = planForDate(input.value);
      if (targetPlan && targetPlan.id !== inspected.plan?.id) {
        await loadInspection(targetPlan.id, false);
      } else {
        renderInspection();
      }
    });
  });
  document.querySelectorAll("[data-clear-inspect-day]").forEach(button => {
    button.addEventListener("click", () => {
      input.value = "";
      renderInspection();
    });
  });
}

function renderInspectCalendarMonth(month, selectedDate) {
  const dates = monthCalendarDates(month);
  const selectableDates = new Set(inspectSelectableDates(month));
  const activeDates = inspectCalendarActiveDates();
  const hasFocusedFilter = Boolean(document.querySelector("#inspectEmployee")?.value || document.querySelector("#inspectDepartment")?.value);
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push({ muted: true, label: "" });
  for (const dateValue of dates) {
    const parsed = parseGermanDate(dateValue);
    cells.push({
      date: dateValue,
      label: parsed ? String(parsed.getDate()) : dateValue,
      selected: selectedDate === dateValue,
      today: isSameGermanDate(parsed, new Date()),
      hasPlan: selectableDates.has(dateValue),
      hasMatch: activeDates.has(dateValue)
    });
  }
  return `
    <div class="calendar-card">
      <div class="calendar-card-head">
        <div>
          <strong>${escapeHtml(inspectMonthLabel(month))}</strong>
          <p>${selectedDate && monthKey(parseGermanDate(selectedDate)) === month ? escapeHtml(`${weekdayLong(parseGermanDate(selectedDate))}, ${selectedDate}`) : "Monat"}</p>
        </div>
        ${selectedDate && monthKey(parseGermanDate(selectedDate)) === month ? '<button data-clear-inspect-day class="mini-button secondary" type="button">Alle Tage</button>' : ""}
      </div>
      <div class="calendar-weekdays">
        ${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map(day => `<span>${day}</span>`).join("")}
      </div>
      <div class="calendar-days">
        ${cells.map(cell => cell.muted
          ? '<span class="calendar-empty"></span>'
          : `<button class="calendar-day ${cell.selected ? "selected" : ""} ${cell.today ? "today" : ""} ${cell.hasPlan ? "" : "no-plan"} ${hasFocusedFilter && cell.hasMatch ? "has-filter-match" : ""} ${hasFocusedFilter && !cell.hasMatch ? "no-filter-match" : ""}" data-inspect-calendar-day="${escapeHtml(cell.date)}" type="button" ${cell.hasPlan ? "" : "disabled"}>
              <span>${escapeHtml(cell.label)}</span>
              ${hasFocusedFilter && cell.hasMatch ? '<small>Eintrag</small>' : ""}
            </button>`
        ).join("")}
      </div>
    </div>
  `;
}

function inspectCalendarActiveDates() {
  const employee = document.querySelector("#inspectEmployee")?.value || "";
  const department = document.querySelector("#inspectDepartment")?.value || "";
  return new Set((inspected.shifts || [])
    .filter(shift => !employee || normalizePersonName(shift.name) === employee)
    .filter(shift => !department || (shift.department || "") === department)
    .map(shift => shift.date)
    .filter(Boolean));
}

function inspectMonthOptions() {
  const ranges = (adminState.plans || []).map(planDateRange).filter(Boolean);
  if (ranges.length) {
    const start = new Date(Math.min(...ranges.map(range => range.start.getTime())));
    const end = new Date(Math.max(...ranges.map(range => range.end.getTime())));
    const months = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= last) {
      months.push(monthKey(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }
  return unique((inspected.shifts || []).map(shift => monthKey(parseGermanDate(shift.date))).filter(Boolean)).sort();
}

function isSameGermanDate(a, b) {
  return Boolean(a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate());
}

function planDateRange(plan) {
  const dates = Array.from(String(plan?.range || "").matchAll(/(\d{1,2}\.\d{1,2}\.\d{4})/g))
    .map(match => parseLooseGermanDate(match[1]))
    .filter(Boolean);
  if (!dates.length) return null;
  return { start: dates[0], end: dates[1] || dates[0] };
}

function planForDate(dateValue) {
  const date = parseGermanDate(dateValue);
  if (!date) return null;
  if (inspected.plan) {
    const currentRange = planDateRange(inspected.plan);
    if (currentRange && date >= currentRange.start && date <= currentRange.end) return inspected.plan;
  }
  return sortPlansByDate(adminState.plans || []).find(plan => {
    const range = planDateRange(plan);
    return range && date >= range.start && date <= range.end;
  }) || null;
}

function newInspectionShift() {
  const selectedDay = document.querySelector("#inspectDay")?.value || "";
  const planRange = planDateRange(inspected.plan);
  const date = selectedDay || inspected.shifts[0]?.date || (planRange ? formatGermanDate(planRange.start) : "") || formatGermanDate(new Date());
  return {
    isNew: true,
    name: document.querySelector("#inspectEmployee")?.value || (inspected.shifts[0]?.name || ""),
    date,
    start: "06:00",
    end: "14:00",
    department: document.querySelector("#inspectDepartment")?.value || "Kasse",
    break: "00:30"
  };
}

function renderShiftEditForm() {
  if (!editShift) return "";
  const departmentOptions = editDepartmentOptions();
  const employeeOptions = editEmployeeOptions();
  const isNew = Boolean(editShift.isNew);
  return `
    <div id="shiftEditBox" class="shift-edit-box">
      <strong>${isNew ? "Schicht hinzufuegen" : "Schicht bearbeiten"}</strong>
      <p class="hint">${isNew ? "Neue Schicht" : `${escapeHtml(editShift.name)} - ${escapeHtml(editShift.date)}`}. Nach dem Speichern wird automatisch eine PEP-Korrektur mit Quelle Haendisch angelegt.</p>
      <div class="shift-edit-grid">
        <label>Mitarbeiter
          <input id="editName" list="editEmployeeOptions" value="${escapeHtml(editShift.name)}" placeholder="Name auswaehlen oder eingeben">
          <datalist id="editEmployeeOptions">
            ${employeeOptions.map(name => `<option value="${escapeHtml(name)}"></option>`).join("")}
          </datalist>
        </label>
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
          <select id="editDepartment">
            ${departmentOptions.map(department => `<option value="${escapeHtml(department)}" ${departmentOptionKey(department) === departmentOptionKey(editShift.department) ? "selected" : ""}>${escapeHtml(department)}</option>`).join("")}
          </select>
        </label>
        <label>Pause<input id="editBreak" value="${escapeHtml(editShift.break || "")}" placeholder="00:30"></label>
        <label>Benachrichtigung
          <select id="editNotifyMode">
            <option value="affected" selected>Nur betroffene Person</option>
            <option value="all">Alle Mitarbeiter</option>
            <option value="none">Keine Benachrichtigung</option>
          </select>
        </label>
      </div>
      <div class="actions">
        ${isNew ? "" : '<button id="deleteShiftEdit" class="danger" type="button">Schicht loeschen</button>'}
        <button id="saveShiftEdit" type="button">Speichern</button>
        <button id="cancelShiftEdit" class="secondary" type="button">Abbrechen</button>
      </div>
    </div>
  `;
}

function editEmployeeOptions() {
  const fromEmployees = (adminState.employees || []).map(employee => employee.name || "");
  const fromPlan = (inspected.shifts || []).map(shift => shift.name || "");
  return unique([...fromEmployees, ...fromPlan].map(normalizePersonName).filter(Boolean))
    .sort((a, b) => a.localeCompare(b, "de"));
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
  return uniqueDepartments([...knownDepartments(), ...fromPlan])
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
      body: {
        before: editShift,
        after: null,
        notifyMode: document.querySelector("#editNotifyMode")?.value || "affected"
      }
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
        before: editShift.isNew ? null : editShift,
        after: {
          name: document.querySelector("#editName").value,
          date: document.querySelector("#editDate").value,
          start: normalizeTimeValue(document.querySelector("#editStart").value),
          end: normalizeTimeValue(document.querySelector("#editEnd").value),
          department: document.querySelector("#editDepartment").value,
          break: normalizeBreakValue(document.querySelector("#editBreak").value)
        },
        notifyMode: document.querySelector("#editNotifyMode")?.value || "affected"
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

function renderInspectionChanges(changes) {
  const groupedWeeks = groupChangesByWeek(changes);
  return `
    <div class="issue-box change-box">
      <strong>${changes.length} Aenderungen zum vorher veroeffentlichten Plan</strong>
      <div class="change-week-list">
        ${groupedWeeks.map((week, index) => `
          <details class="change-week ${week.isCurrent ? "current-change-week" : ""}" ${week.isCurrent || index === 0 ? "open" : ""}>
            <summary>
              <span><strong>KW ${escapeHtml(week.week)}</strong>${week.year ? ` / ${escapeHtml(week.year)}` : ""}</span>
              <span class="correction-summary-badges">
                ${week.isCurrent ? '<span class="badge">Aktuelle KW</span>' : ""}
                <span class="badge warn-badge">${week.changes.length} Aenderungen</span>
              </span>
            </summary>
            <div class="change-day-list">
              ${week.days.map(day => {
                const parsed = parseGermanDate(day.date);
                return `
                  <details class="change-day" open>
                    <summary>
                      <span><strong>${escapeHtml(weekdayLong(parsed))}</strong>, ${escapeHtml(day.date)}</span>
                      <span class="badge subtle">${day.changes.length}</span>
                    </summary>
                    <div class="change-items">
                      ${day.changes.map(change => renderInspectionChangeItem(change)).join("")}
                    </div>
                  </details>
                `;
              }).join("")}
            </div>
          </details>
        `).join("")}
      </div>
    </div>
  `;
}

function renderInspectionChangeItem(change) {
  return `
    <div class="change-item ${change.isLatestForPersonDay ? "latest-change-item" : ""}">
      <div>
        <strong>${escapeHtml(change.name)}</strong>
        <span class="badge subtle">${escapeHtml(changeTypeLabel(change.type))}</span>
        ${change.isLatestForPersonDay ? '<span class="badge">Aktuell gueltig</span>' : ""}
      </div>
      <div class="change-before-after">
        <p><span class="meta">Alt:</span> ${escapeHtml(change.before)}</p>
        <p><span class="meta">Neu:</span> ${escapeHtml(change.after)}</p>
      </div>
    </div>
  `;
}

function groupChangesByWeek(changes) {
  const groups = new Map();
  const todayInfo = isoWeekInfo(new Date());
  const seenPersonDays = new Set();
  const orderedChanges = (changes || []).slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  for (const change of orderedChanges) {
    const latestKey = `${employeeKey(change.name)}|${change.date || ""}`;
    const preparedChange = {
      ...change,
      isLatestForPersonDay: !seenPersonDays.has(latestKey)
    };
    seenPersonDays.add(latestKey);
    const date = parseGermanDate(change.date);
    const info = isoWeekInfo(date);
    const key = `${info?.year || "0000"}-${String(info?.week || 0).padStart(2, "0")}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        week: info?.week || "-",
        year: info?.year || "",
        isCurrent: Boolean(info && todayInfo && info.week === todayInfo.week && info.year === todayInfo.year),
        changes: [],
        days: new Map()
      });
    }
    const group = groups.get(key);
    group.changes.push(preparedChange);
    const dayKey = change.date || "Ohne Datum";
    if (!group.days.has(dayKey)) group.days.set(dayKey, []);
    group.days.get(dayKey).push(preparedChange);
  }
  return Array.from(groups.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(group => ({
      ...group,
      days: Array.from(group.days.entries())
        .map(([date, dayChanges]) => ({
          date,
          changes: dayChanges.slice().sort((a, b) => Number(b.isLatestForPersonDay) - Number(a.isLatestForPersonDay) || a.name.localeCompare(b.name, "de"))
        }))
        .sort((a, b) => (parseGermanDate(a.date) || 0) - (parseGermanDate(b.date) || 0))
    }));
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
  const todayInfo = isoWeekInfo(new Date());
  for (const shift of shifts) {
    const date = parseGermanDate(shift.date);
    const info = isoWeekInfo(date);
    const key = `${info?.year || "0000"}-${String(info?.week || 0).padStart(2, "0")}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        week: info?.week || "-",
        year: info?.year || "",
        isCurrent: Boolean(info && todayInfo && info.week === todayInfo.week && info.year === todayInfo.year),
        shifts: []
      });
    }
    groups.get(key).shifts.push(shift);
  }

  return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function renderInspectionWeek(group, open) {
  const workCount = group.shifts.filter(shift => !isInspectionStatus(shift)).length;
  const statusCount = group.shifts.length - workCount;
  const dayBreaks = dailyBreakMap(group.shifts);
  const days = groupInspectionDays(group.shifts);
  return `
    <section class="inspect-week ${group.isCurrent ? "current-inspect-week" : ""} ${open ? "" : "collapsed"}">
      <button class="inspect-week-head" data-inspect-week-toggle type="button">
        <span><strong>KW ${group.week}</strong>${group.year ? ` / ${group.year}` : ""}</span>
        <span class="inspect-week-badges">
          ${group.isCurrent ? '<span class="badge">Aktuelle KW</span>' : ""}
          <span class="badge subtle">${workCount} Dienste${statusCount ? `, ${statusCount} Abwesenheiten` : ""}</span>
        </span>
      </button>
      <div class="inspect-week-body admin-preview">
        ${days.map(day => {
          const dayWorkCount = day.shifts.filter(shift => !isInspectionStatus(shift)).length;
          const dayStatusCount = day.shifts.length - dayWorkCount;
          return `
          <section class="inspect-day collapsed">
            <button class="inspect-day-head" data-inspect-day-toggle type="button">
              <span class="inspect-day-title">
                <strong>${escapeHtml(weekdayLong(parseGermanDate(day.date)) || "")}</strong>
                <small>${escapeHtml(day.date)}</small>
              </span>
              <span class="inspect-day-actions">
                <span class="badge subtle">${dayWorkCount} Dienste</span>
                ${dayStatusCount ? `<span class="badge warn-badge">${dayStatusCount} Abwesenheiten</span>` : ""}
                <span class="badge subtle">Tag oeffnen</span>
              </span>
            </button>
            <div class="preview inspect-day-table">
              <table>
                <thead><tr><th>Mitarbeiter</th><th>Zeit</th><th>Abteilung</th><th>Pause</th><th>Aktion</th></tr></thead>
                <tbody>
                  ${day.shifts.map(shift => renderInspectionRow(shift, dayBreaks)).join("")}
                </tbody>
              </table>
            </div>
          </section>
        `}).join("")}
      </div>
    </section>
  `;
}

function groupInspectionDays(shifts) {
  const groups = new Map();
  for (const shift of shifts) {
    if (!groups.has(shift.date)) groups.set(shift.date, []);
    groups.get(shift.date).push(shift);
  }
  return Array.from(groups.entries())
    .map(([date, dayShifts]) => ({
      date,
      shifts: dayShifts.slice().sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start) || a.name.localeCompare(b.name, "de"))
    }))
    .sort((a, b) => parseGermanDate(a.date) - parseGermanDate(b.date));
}

function isInspectionStatus(shift) {
  return Boolean(detectStatusText(`${shift.department || ""} ${shift.start || ""} ${shift.end || ""}`));
}

function renderInspectionRow(shift, dayBreaks = new Map()) {
  const key = String(inspectionEditMap.size);
  inspectionEditMap.set(key, shift);
  return `<tr>
    <td>${escapeHtml(shift.name)}</td>
    <td>${escapeHtml(shift.start)}-${escapeHtml(shift.end)}</td>
    <td>${escapeHtml(shift.department || "Abteilung pruefen")}</td>
    <td>${renderAdminPause(shift, dayBreaks)}</td>
    <td><button class="mini-button secondary" data-edit-shift="${escapeHtml(key)}" type="button">Bearbeiten</button></td>
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

function weekdayLong(date) {
  if (!date) return "";
  return ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][date.getDay()];
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

function normalizeTimeValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const colon = text.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colon) {
    const hours = Number(colon[1]);
    const minutes = Number(colon[2]);
    if (hours <= 23 && minutes <= 59) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  if (/^\d{1,2}$/.test(text)) {
    const hours = Number(text);
    if (hours <= 23) return `${String(hours).padStart(2, "0")}:00`;
  }
  if (/^\d{3,4}$/.test(text)) {
    const hours = Number(text.slice(0, -2));
    const minutes = Number(text.slice(-2));
    if (hours <= 23 && minutes <= 59) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  return text;
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
    "Obst & Gem\u00fcse", "Obst & Gemuese", "Getr\u00e4nke", "Getraenke", "BakeOff",
    "Tiefk\u00fchl", "Tiefkuehl", "Inventur", "Lotto", "Information",
    "Next Kurse", "Notdienst", "B\u00fcro", "Buero", "Zeitung", "Remision",
    "Auto Dispo",
    "Lager", "Mopro", "Non Food", "Werbung", "Getr\u00e4nke Abteilung", "Getraenke Abteilung"
  ];
}

function uniqueDepartments(values) {
  const map = new Map();
  for (const value of values || []) {
    const key = departmentOptionKey(value);
    if (!key || map.has(key)) continue;
    map.set(key, preferredDepartmentLabel(value));
  }
  return Array.from(map.values());
}

function departmentOptionKey(value) {
  return fixMojibake(value)
    .toLowerCase()
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function preferredDepartmentLabel(value) {
  const key = departmentOptionKey(value);
  if (key === "obstgemuse") return "Obst & Gem\u00fcse";
  if (key === "getrankeabteilung") return "Getr\u00e4nke Abteilung";
  if (key === "getranke") return "Getr\u00e4nke";
  if (key === "tiefkuhl") return "Tiefk\u00fchl";
  if (key === "buro") return "B\u00fcro";
  return fixMojibake(value).trim();
}

function fixMojibake(value) {
  return String(value || "")
    .replace(/Ã¤/g, "\u00e4")
    .replace(/Ã¶/g, "\u00f6")
    .replace(/Ã¼/g, "\u00fc")
    .replace(/Ã„/g, "\u00c4")
    .replace(/Ã–/g, "\u00d6")
    .replace(/Ãœ/g, "\u00dc")
    .replace(/ÃŸ/g, "\u00df");
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




