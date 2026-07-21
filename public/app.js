const login = document.querySelector("#login");
const plans = document.querySelector("#plans");
const loginMsg = document.querySelector("#loginMsg");
const shiftList = document.querySelector("#shiftList");
const hello = document.querySelector("#hello");
const pushBox = document.querySelector("#pushBox");
const pushBtn = document.querySelector("#pushBtn");
const pushMsg = document.querySelector("#pushMsg");
let currentTeamData = null;
let teamEditShift = null;
let teamEditMap = new Map();
let activeViewPanel = "own";

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
  if (sessionStorage.getItem("sessionReloadedAfter401")) return;
  sessionStorage.setItem("sessionReloadedAfter401", "1");
  window.setTimeout(() => window.location.reload(), 500);
}

function showShifts(data) {
  sessionStorage.removeItem("sessionReloadedAfter401");
  login.classList.add("hidden");
  plans.classList.remove("hidden");
  hello.textContent = data.name;
  setupPushButton();

  if (!data.plans.length) {
    shiftList.innerHTML = '<div class="panel empty">Noch kein veroeffentlichter Dienstplan vorhanden.</div>';
    return;
  }

  if (data.teamView) {
    showTeamShifts(data);
    return;
  }

  const weeks = groupByPlans(data.plans);
  if (!weeks.some(week => week.isCurrent) && weeks.length) {
    weeks[0].isOpen = true;
  }
  const nextWorkDay = findNextWorkDay(weeks);
  shiftList.innerHTML = `
    ${renderNextWorkDay(nextWorkDay)}
    <nav class="week-nav">
      ${weeks.map(week => `<button class="${week.isCurrent ? "active" : ""}" data-week-target="kw-${week.year}-${week.week}">KW ${week.week}</button>`).join("")}
    </nav>
    ${weeks.map(week => renderWeek(week)).join("")}
  `;
  document.querySelectorAll("[data-week-target]").forEach(button => {
    button.addEventListener("click", () => {
      const week = document.querySelector(`#${button.dataset.weekTarget}`);
      week?.classList.remove("collapsed");
      week?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.querySelectorAll("[data-week-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      const week = button.closest(".week");
      week?.classList.toggle("collapsed");
    });
  });
}

function showTeamShifts(data) {
  currentTeamData = data;
  teamEditMap = new Map();
  const ownPlans = data.plans.map(plan => ({
    ...plan,
    changes: (plan.changes || []).filter(change => employeeKey(change.name) === employeeKey(data.name)),
    changeCount: (plan.changes || []).filter(change => employeeKey(change.name) === employeeKey(data.name)).length,
    shifts: plan.shifts.filter(shift => employeeKey(shift.name) === employeeKey(data.name))
  }));
  const ownWeeks = groupByPlans(ownPlans);
  if (!ownWeeks.some(week => week.isCurrent) && ownWeeks.length) {
    ownWeeks[0].isOpen = true;
  }
  const nextWorkDay = findNextWorkDay(ownWeeks);
  const otherPlans = data.plans.map(plan => ({
    ...plan,
    shifts: plan.shifts
  }));
  const teamWeeks = groupTeamByPlans(otherPlans);
  if (!teamWeeks.some(week => week.isCurrent) && teamWeeks.length) {
    teamWeeks[0].isOpen = false;
  }

  shiftList.innerHTML = `
    ${renderNextWorkDay(nextWorkDay)}
    <nav class="view-switch" aria-label="Ansicht wechseln">
      <button class="${activeViewPanel === "own" ? "active" : ""}" data-view-panel="own" type="button">Mein Plan</button>
      <button class="${activeViewPanel === "team" ? "active" : ""}" data-view-panel="team" type="button">Teamplan</button>
    </nav>
    <section class="own-plan-block view-panel ${activeViewPanel === "own" ? "" : "hidden"}" data-view-content="own">
      <h2>Mein Plan</h2>
      ${activeViewPanel === "own" ? renderTeamEditForm() : ""}
      <nav class="week-nav">
        ${ownWeeks.map(week => `<button class="${week.isCurrent ? "active" : ""}" data-week-target="kw-${week.year}-${week.week}">KW ${week.week}</button>`).join("")}
      </nav>
      ${ownWeeks.map(week => renderWeek(week)).join("")}
    </section>
    <section class="team-plan-block view-panel ${activeViewPanel === "team" ? "" : "hidden"}" data-view-content="team">
      <h2>Teamplan</h2>
      ${activeViewPanel === "team" ? renderTeamEditForm() : ""}
      <nav class="week-nav">
        ${teamWeeks.map(week => `<button class="${week.isCurrent ? "active" : ""}" data-week-target="team-kw-${week.year}-${week.week}">KW ${week.week}</button>`).join("")}
      </nav>
      ${teamWeeks.map(week => renderTeamWeek(week)).join("")}
    </section>
  `;

  document.querySelectorAll("[data-view-panel]").forEach(button => {
    button.addEventListener("click", () => {
      const target = button.dataset.viewPanel;
      activeViewPanel = target;
      document.querySelectorAll("[data-view-panel]").forEach(item => item.classList.toggle("active", item === button));
      document.querySelectorAll("[data-view-content]").forEach(panel => {
        panel.classList.toggle("hidden", panel.dataset.viewContent !== target);
      });
    });
  });
  document.querySelectorAll("[data-week-target]").forEach(button => {
    button.addEventListener("click", () => {
      const week = document.querySelector(`#${button.dataset.weekTarget}`);
      week?.classList.remove("collapsed");
      week?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.querySelectorAll("[data-week-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      button.closest(".week")?.classList.toggle("collapsed");
    });
  });
  document.querySelectorAll("[data-team-day-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      button.closest(".team-day")?.classList.toggle("collapsed");
    });
  });
  document.querySelectorAll("[data-team-department-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      button.closest(".department-group")?.classList.toggle("collapsed");
    });
  });
  document.querySelectorAll("[data-team-edit]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      teamEditShift = teamEditMap.get(button.dataset.teamEdit) || null;
      activeViewPanel = button.dataset.editView || activeViewPanel;
      showTeamShifts(currentTeamData);
      document.querySelector("#teamEditBox")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.querySelectorAll("[data-team-add]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      const plan = (currentTeamData?.plans || []).find(item => item.id === button.dataset.planId);
      teamEditShift = newTeamShift(button.dataset.planId, button.dataset.date, plan);
      activeViewPanel = button.dataset.editView || "team";
      showTeamShifts(currentTeamData);
      document.querySelector("#teamEditBox")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.querySelector("#cancelTeamEdit")?.addEventListener("click", () => {
    teamEditShift = null;
    showTeamShifts(currentTeamData);
  });
  document.querySelectorAll("#teamEditStart, #teamEditEnd").forEach(input => {
    input.addEventListener("blur", () => {
      input.value = normalizeTimeValue(input.value);
    });
  });
  document.querySelectorAll("[data-team-edit-date-choice]").forEach(button => {
    button.addEventListener("click", () => {
      if (!teamEditShift) return;
      teamEditShift.date = button.dataset.teamEditDateChoice;
      showTeamShifts(currentTeamData);
    });
  });
  document.querySelector("#saveTeamEdit")?.addEventListener("click", saveTeamEdit);
  document.querySelector("#deleteTeamEdit")?.addEventListener("click", deleteTeamEdit);
}

function groupByPlans(plans) {
  const grouped = new Map();
  for (const plan of plans) {
    const rangeDates = datesFromPlanRange(plan.range);
    const changedDates = new Set((plan.changes || []).map(change => change.date).filter(Boolean));
    if (!plan.shifts.length) {
      const date = rangeDates.start;
      if (!date) continue;
      const info = isoWeekInfo(date);
      const key = `${info.year}-${String(info.week).padStart(2, "0")}`;
      if (!grouped.has(key)) {
        grouped.set(key, { ...info, shifts: [], days: new Map(), changedDates: new Set(), isCurrent: isCurrentWeek(date), planTitle: plan.title, range: plan.range, displayStart: rangeDates.start, displayEnd: rangeDates.end, version: plan.version || 1, updatedAt: plan.updatedAt || plan.uploadedAt, changeCount: plan.changeCount || 0 });
      }
      const week = grouped.get(key);
      changedDates.forEach(day => week.changedDates.add(day));
      continue;
    }
    for (const original of plan.shifts) {
      const shift = { ...original, planId: plan.id, planTitle: plan.title, planRange: plan.range, changed: (plan.changes || []).some(change => employeeKey(change.name) === employeeKey(original.name) && change.date === original.date) };
      const date = parseGermanDate(shift.date);
      if (!date) continue;
      const info = isoWeekInfo(date);
      const key = `${info.year}-${String(info.week).padStart(2, "0")}`;
      if (!grouped.has(key)) {
        grouped.set(key, { ...info, shifts: [], days: new Map(), changedDates: new Set(), isCurrent: isCurrentWeek(date), planTitle: plan.title, range: plan.range, version: plan.version || 1, updatedAt: plan.updatedAt || plan.uploadedAt, changeCount: plan.changeCount || 0 });
      }
      const week = grouped.get(key);
      week.displayStart = earlierDate(week.displayStart, rangeDates.start || date);
      week.displayEnd = laterDate(week.displayEnd, rangeDates.end || date);
      changedDates.forEach(day => week.changedDates.add(day));
      week.shifts.push(shift);
      if (!week.days.has(shift.date)) week.days.set(shift.date, []);
      week.days.get(shift.date).push(shift);
    }
  }

  return Array.from(grouped.values()).sort((a, b) => a.startDate - b.startDate);
}

function groupTeamByPlans(plans) {
  const grouped = new Map();
  for (const plan of plans) {
    const rangeDates = datesFromPlanRange(plan.range);
    for (const original of plan.shifts) {
      const shift = { ...original, planId: plan.id, planTitle: plan.title, planRange: plan.range, changed: (plan.changes || []).some(change => employeeKey(change.name) === employeeKey(original.name) && change.date === original.date) };
      const date = parseGermanDate(shift.date);
      if (!date) continue;
      const info = isoWeekInfo(date);
      const key = `${info.year}-${String(info.week).padStart(2, "0")}`;
      if (!grouped.has(key)) {
        grouped.set(key, { ...info, shifts: [], days: new Map(), isCurrent: isCurrentWeek(date), planTitle: plan.title, range: plan.range, version: plan.version || 1, updatedAt: plan.updatedAt || plan.uploadedAt, changeCount: plan.changeCount || 0 });
      }
      const week = grouped.get(key);
      week.displayStart = earlierDate(week.displayStart, rangeDates.start || date);
      week.displayEnd = laterDate(week.displayEnd, rangeDates.end || date);
      week.shifts.push(shift);
      if (!week.days.has(shift.date)) week.days.set(shift.date, []);
      week.days.get(shift.date).push(shift);
    }
  }
  return Array.from(grouped.values()).sort((a, b) => a.startDate - b.startDate);
}

function findNextWorkDay(weeks) {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const days = [];

  for (const week of weeks) {
    for (const [dateValue, dayShifts] of week.days.entries()) {
      const date = parseGermanDate(dateValue);
      if (!date || date < today) continue;
      const workShifts = dayShifts
        .filter(isWorkShift)
        .filter(shift => date > today || timeToMinutes(shift.start) > currentMinutes)
        .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
      if (workShifts.length) days.push({ dateValue, date, shifts: workShifts });
    }
  }

  return days.sort((a, b) => {
    const byDate = a.date - b.date;
    if (byDate) return byDate;
    return timeToMinutes(a.shifts[0]?.start) - timeToMinutes(b.shifts[0]?.start);
  })[0] || null;
}

function isWorkShift(shift) {
  return !detectStatus(shift) && timeToMinutes(shift.start) !== 9999 && timeToMinutes(shift.end) !== 9999;
}

function renderNextWorkDay(nextWorkDay) {
  if (!nextWorkDay) {
    return `
      <section class="next-card muted-card">
        <p class="next-label">Naechste Schicht</p>
        <h2>Keine kommende Schicht gefunden</h2>
      </section>
    `;
  }

  const multiDepartment = new Set(nextWorkDay.shifts.map(shift => shift.department).filter(Boolean)).size > 1;
  return `
    <section class="next-card">
      <p class="next-label">Naechste Schicht</p>
      <div class="next-main">
        <div>
          <h2>${weekdayLong(nextWorkDay.date)}, ${formatGermanDate(nextWorkDay.date)}</h2>
          <p>${escapeHtml(dayTimeRange(nextWorkDay.shifts))}${multiDepartment ? " - mehrere Abteilungen" : ""}</p>
        </div>
        <span class="badge">Anstehend</span>
      </div>
      <div class="day-shifts">
        ${nextWorkDay.shifts.map(shift => renderShift(shift, multiDepartment)).join("")}
      </div>
      ${multiDepartment ? `<div class="day-summary next-summary">Tagespause: ${dayPauseText(nextWorkDay.shifts)}</div>` : ""}
    </section>
  `;
}

function renderWeek(week) {
  const isOpen = week.isCurrent || week.isOpen;
  const startDate = week.displayStart || week.startDate;
  const endDate = week.displayEnd || week.endDate;
  const days = datesBetween(startDate, endDate)
    .map(date => {
      const dateValue = formatGermanDate(date);
      const dayShifts = week.days.get(dateValue) || [];
      const changed = week.changedDates?.has(dateValue);
      return dayShifts.length ? renderDay(dateValue, dayShifts, changed) : renderFreeDay(date, changed);
    })
    .join("");

  return `
    <section id="kw-${week.year}-${week.week}" class="week ${week.isCurrent ? "current-week" : ""} ${isOpen ? "" : "collapsed"}">
      <button class="week-head" data-week-toggle type="button">
        <div>
          <h2>KW ${week.week} - ${formatShortDate(startDate)} bis ${formatGermanDate(endDate)}</h2>
          <p>${escapeHtml(week.shifts[0]?.planTitle || week.planTitle || "")}${week.version > 1 ? ` - Version ${week.version}` : ""}${week.updatedAt ? ` - aktualisiert ${formatDateTime(week.updatedAt)}` : ""}</p>
        </div>
        <span class="week-actions">
          ${week.isCurrent ? '<span class="badge">Aktuelle Woche</span>' : '<span class="badge subtle">Anzeigen</span>'}
          ${week.changeCount ? `<span class="badge warn-badge">${week.changeCount} geaendert</span>` : ""}
        </span>
      </button>
      <div class="week-body">
        ${days || '<div class="empty-week">Keine Schichten fuer dich in dieser KW.</div>'}
      </div>
    </section>
  `;
}

function renderTeamWeek(week) {
  const isOpen = week.isCurrent || week.isOpen;
  const startDate = week.displayStart || week.startDate;
  const endDate = week.displayEnd || week.endDate;
  const days = Array.from(week.days.entries())
    .sort(([a], [b]) => parseGermanDate(a) - parseGermanDate(b))
    .map(([date, dayShifts]) => renderTeamDay(date, dayShifts, week))
    .join("");

  return `
    <section id="team-kw-${week.year}-${week.week}" class="week team-week ${week.isCurrent ? "current-week" : ""} ${isOpen ? "" : "collapsed"}">
      <button class="week-head" data-week-toggle type="button">
        <div>
          <h2>KW ${week.week} - ${formatShortDate(startDate)} bis ${formatGermanDate(endDate)}</h2>
          <p>${escapeHtml(week.shifts[0]?.planTitle || week.planTitle || "")}</p>
        </div>
        <span class="week-actions">
          <span class="badge subtle">${week.shifts.length} Eintraege</span>
          ${week.isCurrent ? '<span class="badge">Aktuelle Woche</span>' : ""}
        </span>
      </button>
      <div class="week-body">
        ${days || '<div class="empty-week">Keine Schichten in dieser KW.</div>'}
      </div>
    </section>
  `;
}

function renderTeamDay(dateValue, dayShifts, week) {
  const date = parseGermanDate(dateValue);
  const currentDay = isToday(date);
  const sorted = dayShifts.slice().sort((a, b) => {
    const byTime = timeToMinutes(a.start) - timeToMinutes(b.start);
    if (byTime) return byTime;
    const byDepartment = departmentLabel(a).localeCompare(departmentLabel(b), "de");
    if (byDepartment) return byDepartment;
    return a.name.localeCompare(b.name, "de");
  });
  const departments = groupTeamDayByDepartment(sorted);

  return `
    <article class="day team-day ${currentDay ? "today-team-day" : "collapsed"}">
      <button class="day-title team-day-head" data-team-day-toggle type="button">
        <span>
          <strong>${weekdayLong(date)}, ${formatGermanDate(date)}</strong>
          ${currentDay ? '<span class="badge">Heute</span>' : ""}
        </span>
          <span class="team-day-actions">
          <span class="team-day-open-hint">${currentDay ? "Heute offen" : "Tag oeffnen"}</span>
          <span class="badge subtle">${sorted.length} Eintraege</span>
        </span>
      </button>
      <div class="team-day-body">
        <div class="team-day-add-row">
          <button class="mini-button add-shift-inline" data-team-add data-plan-id="${escapeHtml(sorted[0]?.planId || "")}" data-date="${escapeHtml(dateValue)}" type="button">+ Schicht hinzufuegen</button>
        </div>
        ${departments.map(group => `
          <div class="department-group collapsed">
            <button class="department-head" data-team-department-toggle type="button">
              <span>${escapeHtml(group.department)}</span>
              <span class="badge subtle">${group.shifts.length}</span>
            </button>
            <div class="team-shifts">
              ${group.shifts.map(shift => renderTeamShift(shift, sorted)).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function groupTeamDayByDepartment(shifts) {
  const groups = new Map();
  for (const shift of shifts) {
    const department = departmentLabel(shift);
    if (!groups.has(department)) groups.set(department, []);
    groups.get(department).push(shift);
  }
  return Array.from(groups.entries())
    .map(([department, groupShifts]) => ({
      department,
      start: Math.min(...groupShifts.map(shift => timeToMinutes(shift.start))),
      shifts: groupShifts.slice().sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start) || a.name.localeCompare(b.name, "de"))
    }))
    .sort((a, b) => a.start - b.start || a.department.localeCompare(b.department, "de"));
}

function departmentLabel(shift) {
  const status = detectStatus(shift);
  if (status) return status;
  const department = String(shift.department || "");
  const lower = department.toLowerCase();
  if (lower.includes("marktleitung") || lower.includes("marktaufsicht")) return "Marktleitung / Marktaufsicht";
  if (department.toLowerCase().includes("sco kasse")) return "Kasse";
  return department || "Abteilung pruefen";
}

function departmentClass(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("marktleitung")) return "dept-marktleitung";
  if (text.includes("marktaufsicht")) return "dept-marktaufsicht";
  if (text.includes("einarbeitung")) return "dept-einarbeitung";
  if (text.includes("kasse")) return "dept-kasse";
  if (text.includes("food")) return "dept-food";
  if (text.includes("getraenke") || text.includes("getränke")) return "dept-getraenke";
  if (text.includes("bakeoff") || text.includes("backshop")) return "dept-bakeoff";
  if (text.includes("auto dispo") || text.includes("autodispo")) return "dept-autodispo";
  if (text.includes("mopro")) return "dept-mopro";
  if (text.includes("tiefkuehl") || text.includes("tiefkühl")) return "dept-tiefkuehl";
  if (text.includes("obst")) return "dept-obst";
  return "";
}

function renderTeamShift(shift, dayShifts = []) {
  const status = detectStatus(shift);
  const statusClass = status ? ` status-row ${statusClassName(status)}` : "";
  const statusLabel = status;
  const splitInfo = teamSplitInfo(shift, dayShifts);
  const splitClass = splitInfo ? " split-shift" : "";
  const editKey = teamShiftKey(shift);
  teamEditMap.set(editKey, shift);
  return `
    <div class="team-shift${statusClass}${splitClass} ${departmentClass(shift.department)}">
      <span class="team-name">${escapeHtml(shift.name)}</span>
      <span class="team-time">${status ? "Kein Dienst" : `${escapeHtml(shift.start)}-${escapeHtml(shift.end)}`}</span>
      <span class="team-department">${status ? escapeHtml(statusLabel) : escapeHtml(shift.department || "Abteilung pruefen")}</span>
      <span class="team-pause">${status ? "" : splitInfo || renderPauseText(shift)}</span>
      <button class="mini-button secondary team-edit-btn" data-team-edit="${escapeHtml(editKey)}" type="button">Bearbeiten</button>
    </div>
  `;
}

function teamShiftKey(shift) {
  return [
    shift.planId || "",
    employeeKey(shift.name),
    shift.date || "",
    shift.start || "",
    shift.end || "",
    shift.department || "",
    shift.break || ""
  ].join("|");
}

function renderTeamEditForm() {
  if (!teamEditShift) return "";
  const dateValues = teamEditDateValues(teamEditShift);
  const departments = editDepartmentOptions();
  const employees = editEmployeeOptions();
  const isNew = Boolean(teamEditShift.isNew);
  return `
    <div id="teamEditBox" class="shift-edit-box team-edit-box">
      <strong>${isNew ? "Teamplan-Schicht hinzufuegen" : "Teamplan-Schicht bearbeiten"}</strong>
      <p class="hint">${isNew ? "Neue Schicht" : `${escapeHtml(teamEditShift.name)} - ${escapeHtml(teamEditShift.date)}`}. Nach dem Speichern landet es als haendische PEP-Korrektur in der Admin-Liste.</p>
      <div class="shift-edit-grid">
        <label>Mitarbeiter
          <input id="teamEditName" list="teamEditEmployeeOptions" value="${escapeHtml(teamEditShift.name)}" placeholder="Mitarbeiter auswaehlen">
          <datalist id="teamEditEmployeeOptions">
            ${employees.map(name => `<option value="${escapeHtml(name)}"></option>`).join("")}
          </datalist>
        </label>
        <label>Datum
          <input id="teamEditDate" type="hidden" value="${escapeHtml(teamEditShift.date)}">
          ${renderTeamEditDatePicker(dateValues, teamEditShift.date)}
        </label>
        <label>Start<input id="teamEditStart" value="${escapeHtml(teamEditShift.start)}" placeholder="06:00"></label>
        <label>Ende<input id="teamEditEnd" value="${escapeHtml(teamEditShift.end)}" placeholder="14:00"></label>
        <label>Abteilung
          <select id="teamEditDepartment">
            ${departments.map(department => `<option value="${escapeHtml(department)}" ${departmentOptionKey(department) === departmentOptionKey(teamEditShift.department) ? "selected" : ""}>${escapeHtml(department)}</option>`).join("")}
          </select>
        </label>
        <label>Pause<input id="teamEditBreak" value="${escapeHtml(teamEditShift.break || "")}" placeholder="00:30"></label>
        <label>Benachrichtigung
          <select id="teamEditNotifyMode">
            <option value="affected" selected>Nur betroffene Person</option>
            <option value="none">Niemand</option>
            <option value="all">Alle Mitarbeiter</option>
          </select>
        </label>
      </div>
      <div class="actions">
        ${isNew ? "" : '<button id="deleteTeamEdit" class="danger" type="button">Schicht loeschen</button>'}
        <button id="saveTeamEdit" type="button">Speichern</button>
        <button id="cancelTeamEdit" class="secondary" type="button">Abbrechen</button>
      </div>
    </div>
  `;
}

function teamEditDateValues(shift) {
  const range = datesFromPlanRange(shift.planRange || "");
  if (range.start) {
    const end = range.end || range.start;
    const values = [];
    const cursor = new Date(range.start);
    while (cursor <= end) {
      values.push(formatGermanDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return values;
  }
  return teamEditDateOptions(shift).map(option => option.value);
}

function renderTeamEditDatePicker(values, selectedDate) {
  return `
    <div class="edit-date-picker">
      <div class="edit-date-selected">${escapeHtml(weekdayLong(parseGermanDate(selectedDate)) || "")}, ${escapeHtml(selectedDate)}</div>
      <div class="edit-date-grid">
        ${values.map(value => {
          const parsed = parseGermanDate(value);
          return `<button class="edit-date-chip ${value === selectedDate ? "selected" : ""}" data-team-edit-date-choice="${escapeHtml(value)}" type="button">
            <span>${escapeHtml(weekdayShort(parsed))}</span>
            <strong>${escapeHtml(parsed ? String(parsed.getDate()).padStart(2, "0") : value)}</strong>
          </button>`;
        }).join("")}
      </div>
    </div>
  `;
}

function newTeamShift(planId, date, plan) {
  return {
    isNew: true,
    planId,
    planRange: plan?.range || "",
    planTitle: plan?.title || "",
    name: "",
    date,
    start: "06:00",
    end: "14:00",
    department: "Kasse",
    break: "00:30"
  };
}

function teamEditDateOptions(shift) {
  const range = datesFromPlanRange(shift.planRange || "");
  const base = parseGermanDate(shift.date) || range.start;
  if (!base) return shift.date ? [{ value: shift.date, label: shift.date }] : [];
  const month = base.getMonth();
  const year = base.getFullYear();
  const options = [];
  const cursor = new Date(year, month, 1);
  while (cursor.getMonth() === month) {
    const value = formatGermanDate(cursor);
    options.push({ value, label: `${weekdayLong(cursor)}, ${value}` });
    cursor.setDate(cursor.getDate() + 1);
  }
  if (shift.date && !options.some(option => option.value === shift.date)) {
    options.unshift({ value: shift.date, label: shift.date });
  }
  return options;
}

function editDepartmentOptions() {
  const fromPlans = (currentTeamData?.plans || [])
    .flatMap(plan => plan.shifts || [])
    .map(shift => shift.department || "")
    .filter(Boolean);
  return uniqueDepartments([...knownDepartments(), ...fromPlans]).sort((a, b) => a.localeCompare(b, "de"));
}

function editEmployeeOptions() {
  const fromPlans = (currentTeamData?.plans || [])
    .flatMap(plan => plan.shifts || [])
    .map(shift => shift.name || "")
    .filter(Boolean);
  return unique(fromPlans).sort((a, b) => a.localeCompare(b, "de"));
}

async function deleteTeamEdit() {
  if (!teamEditShift?.planId) return;
  if (!window.confirm("Diese Schicht wirklich loeschen?")) return;
  try {
    await api(`/api/me/plans/${encodeURIComponent(teamEditShift.planId)}/shifts/edit`, {
      method: "POST",
      body: { before: teamEditShift, after: null, notifyMode: document.querySelector("#teamEditNotifyMode")?.value || "affected" }
    });
    teamEditShift = null;
    await loadMine();
  } catch (error) {
    const box = document.querySelector("#teamEditBox");
    if (box && !box.querySelector(".team-edit-error")) {
      box.insertAdjacentHTML("beforeend", `<p class="msg error team-edit-error">${escapeHtml(error.message)}</p>`);
    }
  }
}

async function saveTeamEdit() {
  if (!teamEditShift?.planId) return;
  try {
    await api(`/api/me/plans/${encodeURIComponent(teamEditShift.planId)}/shifts/edit`, {
      method: "POST",
      body: {
        before: teamEditShift.isNew ? null : teamEditShift,
        after: {
          name: document.querySelector("#teamEditName").value,
          date: document.querySelector("#teamEditDate").value,
          start: normalizeTimeValue(document.querySelector("#teamEditStart").value),
          end: normalizeTimeValue(document.querySelector("#teamEditEnd").value),
          department: document.querySelector("#teamEditDepartment").value,
          break: normalizeBreakValue(document.querySelector("#teamEditBreak").value)
        },
        notifyMode: document.querySelector("#teamEditNotifyMode")?.value || "affected"
      }
    });
    teamEditShift = null;
    await loadMine();
  } catch (error) {
    const box = document.querySelector("#teamEditBox");
    if (box && !box.querySelector(".team-edit-error")) {
      box.insertAdjacentHTML("beforeend", `<p class="msg error team-edit-error">${escapeHtml(error.message)}</p>`);
    }
  }
}

function teamSplitInfo(shift, dayShifts) {
  if (detectStatus(shift)) return "";
  const samePerson = dayShifts
    .filter(item => employeeKey(item.name) === employeeKey(shift.name))
    .filter(isWorkShift)
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const departments = new Set(samePerson.map(item => item.department).filter(Boolean));
  if (samePerson.length < 2 || departments.size < 2) return "";
  const index = samePerson.findIndex(item =>
    item.start === shift.start &&
    item.end === shift.end &&
    item.department === shift.department
  );
  const dayChain = samePerson
    .map(item => `${shortTime(item.start)}-${shortTime(item.end)} ${shortDepartment(item.department)}`)
    .join(" | ");
  const part = `Tag: ${dayChain}`;
  return index === 0 ? `${part} | Pause ${dayPauseText(samePerson)}` : part;
}

function shortTime(value) {
  return String(value || "").replace(/:00\b/g, "");
}

function shortDepartment(value) {
  return String(value || "")
    .replace(/Obst\s*&\s*Gemüse/i, "Obst")
    .replace(/Getränke Abteilung/i, "Getraenke")
    .replace(/Food Abteilung/i, "Food");
}

function renderFreeDay(date, changed = false) {
  return `
    <article class="day free-day ${isToday(date) ? "today-day" : ""} ${changed ? "changed-day" : ""}">
      <div class="day-title">
        <strong>${weekdayLong(date)}, ${formatGermanDate(date)}</strong>
        ${isToday(date) ? '<span class="badge">Heute</span>' : ""}
        ${changed ? '<span class="badge warn-badge">Geaendert</span>' : ""}
      </div>
      <div class="shift-row status-row">
        <span class="time">X</span>
        <span class="department">Keine Schicht</span>
      </div>
    </article>
  `;
}

function renderDay(dateValue, dayShifts, changed = false) {
  const date = parseGermanDate(dateValue);
  const currentDay = isToday(date);
  const sorted = dayShifts.slice().sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const multiDepartment = new Set(sorted.map(shift => shift.department).filter(Boolean)).size > 1;
  const dayPause = dayPauseText(sorted);

  return `
    <article class="day ${currentDay ? "today-day" : ""} ${changed ? "changed-day" : ""}">
      <div class="day-title">
        <strong>${weekdayLong(date)}, ${formatGermanDate(date)}</strong>
        ${currentDay ? '<span class="badge">Heute</span>' : ""}
        ${changed ? '<span class="badge warn-badge">Geaendert</span>' : ""}
        ${multiDepartment ? '<span class="badge subtle">Mehrere Abteilungen</span>' : ""}
      </div>
      ${multiDepartment ? `<div class="day-summary">Gesamt: ${escapeHtml(dayTimeRange(sorted))} - Tagespause: ${dayPause}</div>` : ""}
      <div class="day-shifts">
        ${sorted.map(shift => renderShift(shift, multiDepartment)).join("")}
      </div>
    </article>
  `;
}

function renderShift(shift, compactPause = false) {
  const status = detectStatus(shift);
  const canEdit = Boolean(currentTeamData?.teamView && shift.planId);
  const editKey = canEdit ? teamShiftKey(shift) : "";
  if (canEdit) teamEditMap.set(editKey, shift);
  if (status) {
    const statusLabel = status;
    return `
      <div class="shift-row status-row ${statusClassName(status)}">
        <span class="time">Kein Dienst</span>
        <span class="department">${escapeHtml(statusLabel)}</span>
        ${canEdit ? `<button class="mini-button secondary own-edit-btn" data-team-edit="${escapeHtml(editKey)}" data-edit-view="own" type="button">Bearbeiten</button>` : ""}
      </div>
    `;
  }

  return `
    <div class="shift-row ${departmentClass(shift.department)} ${shift.changed ? "changed-shift" : ""}">
      <span class="time">${escapeHtml(shift.start)}-${escapeHtml(shift.end)}</span>
      <span class="department">${escapeHtml(shift.department || "Abteilung pruefen")}</span>
      ${shift.changed ? '<span class="badge warn-badge">Geaendert</span>' : ""}
      ${compactPause ? '<span class="pause">Teilblock</span>' : renderPause(shift)}
      ${canEdit ? `<button class="mini-button secondary own-edit-btn" data-team-edit="${escapeHtml(editKey)}" data-edit-view="own" type="button">Bearbeiten</button>` : ""}
    </div>
  `;
}

function renderPause(shift) {
  if (shift.break) return `<span class="pause">Pause ${escapeHtml(shift.break)}</span>`;
  if (needsBreakCheck(shift)) return '<span class="pause warn">Pause pruefen</span>';
  return '<span class="pause">keine Pause</span>';
}

function renderPauseText(shift) {
  if (shift.break) return `Pause ${shift.break}`;
  if (needsBreakCheck(shift)) return "Pause pruefen";
  return "keine Pause";
}

function detectStatus(shift) {
  const text = `${shift.department || ""} ${shift.start || ""} ${shift.end || ""}`.toLowerCase();
  if (text.includes("sonderurlaub")) return "Sonderurlaub";
  if (text.includes("seminar")) return "Seminar";
  if (text.includes("krank") && text.includes("aau")) return "Krank angemeldet (aAu)";
  if (text.includes("urlaub")) return "Urlaub";
  if (text.includes("krank")) return "Krankheit";
  if (text.includes("abwesenheit")) return "Abwesenheit";
  if (text.includes("frei")) return "Frei";
  return "";
}

function statusClassName(status) {
  const text = String(status || "").toLowerCase();
  if (text.includes("urlaub")) return "status-urlaub";
  if (text.includes("krank")) return "status-krankheit";
  if (text.includes("seminar")) return "status-seminar";
  if (text.includes("frei")) return "status-frei";
  if (text.includes("abwesenheit")) return "status-abwesenheit";
  return "status-row";
}

function employeeKey(name) {
  return String(name || "").trim().replace(/\s+/g, " ").replace(/\s+,/g, ",").toLowerCase();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
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
  if (key === "obstgemuse") return "Obst & Gemüse";
  if (key === "getrankeabteilung") return "Getränke Abteilung";
  if (key === "getranke") return "Getränke";
  if (key === "tiefkuhl") return "Tiefkühl";
  if (key === "buro") return "Büro";
  return fixMojibake(value).trim();
}

function fixMojibake(value) {
  return String(value || "")
    .replace(/Ã¤/g, "ä")
    .replace(/Ã¶/g, "ö")
    .replace(/Ã¼/g, "ü")
    .replace(/Ã„/g, "Ä")
    .replace(/Ã–/g, "Ö")
    .replace(/Ãœ/g, "Ü")
    .replace(/ÃŸ/g, "ß");
}

function knownDepartments() {
  return [
    "Marktleitung", "Marktaufsicht", "SCO Kasse", "Backshop", "Einarbeitung intern",
    "Einarbeitung", "Kasse", "Food Abteilung", "Obst & Gemüse", "Obst & Gemuese",
    "Getränke", "Getraenke", "Getränke Abteilung", "Getraenke Abteilung",
    "BakeOff", "Tiefkühl", "Tiefkuehl", "Inventur", "Lotto", "Information",
    "Next Kurse", "Notdienst", "Büro", "Buero", "Zeitung", "Remision",
    "Auto Dispo", "Lager", "Mopro", "Non Food", "Werbung",
    "Urlaub", "Krankheit", "Krank angemeldet (aAu)", "Seminar", "Frei", "Abwesenheit"
  ];
}

function parseGermanDate(value) {
  const match = String(value || "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function datesFromPlanRange(value) {
  const matches = Array.from(String(value || "").matchAll(/(\d{1,2}\.\d{1,2}\.\d{4})/g)).map(match => parseGermanDate(match[1])).filter(Boolean);
  return { start: matches[0] || null, end: matches[1] || matches[0] || null };
}

function earlierDate(first, second) {
  if (!first) return second || null;
  if (!second) return first;
  return first <= second ? first : second;
}

function laterDate(first, second) {
  if (!first) return second || null;
  if (!second) return first;
  return first >= second ? first : second;
}

function datesBetween(start, end) {
  if (!start || !end) return [];
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < 14) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function isoWeekInfo(date) {
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = current.getDay() || 7;
  current.setDate(current.getDate() + 4 - day);
  const yearStart = new Date(current.getFullYear(), 0, 1);
  const week = Math.ceil((((current - yearStart) / 86400000) + 1) / 7);
  const startDate = new Date(date);
  startDate.setDate(date.getDate() - ((date.getDay() || 7) - 1));
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  return { week, year: current.getFullYear(), startDate, endDate };
}

function isCurrentWeek(date) {
  const today = new Date();
  const a = isoWeekInfo(today);
  const b = isoWeekInfo(date);
  return a.week === b.week && a.year === b.year;
}

function isToday(date) {
  const today = new Date();
  return date
    && date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

function formatGermanDate(date) {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function formatShortDate(date) {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.`;
}

function weekday(date) {
  return ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][date.getDay()];
}

function weekdayLong(date) {
  return ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][date.getDay()];
}

function weekdayShort(date) {
  if (!date) return "";
  return ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][date.getDay()];
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 9999;
}

function normalizeBreakValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{1,2}$/.test(text)) return `00:${String(Number(text)).padStart(2, "0")}`;
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return text;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
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

function shiftDurationMinutes(shift) {
  const start = timeToMinutes(shift.start);
  const end = timeToMinutes(shift.end);
  if (start === 9999 || end === 9999) return 0;
  return end >= start ? end - start : end + 1440 - start;
}

function needsBreakCheck(shift) {
  return shiftDurationMinutes(shift) > 360;
}

function totalDayMinutes(shifts) {
  return shifts.reduce((sum, shift) => sum + shiftDurationMinutes(shift), 0);
}

function legalBreakForMinutes(minutes) {
  if (minutes > 540) return "00:45";
  if (minutes > 360) return "00:30";
  return "";
}

function maxBreak(shifts) {
  const values = shifts.map(shift => shift.break).filter(Boolean).map(timeToMinutes).filter(minutes => minutes !== 9999);
  return values.length ? Math.max(...values) : 0;
}

function minutesToTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function dayPauseText(shifts) {
  const existing = maxBreak(shifts);
  if (existing) return minutesToTime(existing);
  return totalDayMinutes(shifts) > 360 ? "Keine Pause erkannt" : "keine Pause";
}

function dayTimeRange(shifts) {
  const times = shifts.flatMap(shift => [shift.start, shift.end]).filter(value => timeToMinutes(value) !== 9999);
  if (!times.length) return "";
  const sorted = times.slice().sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  return `${sorted[0]}-${sorted[sorted.length - 1]}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

async function submitLogin() {
  const button = document.querySelector("#loginBtn");
  if (button?.disabled) return;
  loginMsg.textContent = "Anmeldung laeuft...";
  loginMsg.classList.remove("error", "success-msg");
  button?.classList.remove("login-tap");
  void button?.offsetWidth;
  button?.classList.add("login-tap");
  if (button) {
    button.disabled = true;
    button.textContent = "Anmelden...";
  }
  try {
    await api("/api/employee/login", { method: "POST", body: { name: document.querySelector("#name").value, pin: document.querySelector("#pin").value } });
    loginMsg.textContent = "Angemeldet.";
    loginMsg.classList.add("success-msg");
    await loadMine();
  } catch (error) {
    loginMsg.textContent = error.message;
    loginMsg.classList.add("error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Anmelden";
    }
  }
}

document.querySelector("#loginBtn").addEventListener("click", submitLogin);
document.querySelectorAll("#name, #pin").forEach(input => {
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") submitLogin();
  });
});

document.querySelector("#logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  location.reload();
});

async function loadMine() {
  try {
    showShifts(await api("/api/me/shifts"));
  } catch {
    login.classList.remove("hidden");
    plans.classList.add("hidden");
  }
}

loadMine();

function supportsPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}

async function setupPushButton() {
  if (!pushBox || !pushBtn || !pushMsg || !supportsPush()) return;
  pushBox.classList.remove("hidden");
  pushMsg.textContent = "";

  if (Notification.permission === "granted") {
    pushBtn.textContent = "Push ist aktiv";
  } else {
    pushBtn.textContent = "Push aktivieren";
  }
}

async function activatePush() {
  if (!supportsPush()) {
    pushMsg.textContent = "Push wird auf diesem Geraet nicht unterstuetzt.";
    pushMsg.classList.add("error");
    return;
  }

  pushMsg.textContent = "";
  pushMsg.classList.remove("error");
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      pushMsg.textContent = "Push wurde nicht erlaubt.";
      pushMsg.classList.add("error");
      return;
    }

    const keyData = await api("/api/push/public-key");
    if (!keyData.enabled) throw new Error("Push ist online noch nicht aktiv. Bitte neu deployen.");
    const registration = await navigator.serviceWorker.register("/sw.js");
    const oldSubscription = await registration.pushManager.getSubscription();
    if (oldSubscription) await oldSubscription.unsubscribe();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
    });
    await api("/api/push/subscribe", { method: "POST", body: { subscription } });
    pushBtn.textContent = "Push ist aktiv";
    pushMsg.textContent = "Du bekommst jetzt eine Meldung, wenn ein Plan veroeffentlicht wird.";
  } catch (error) {
    pushMsg.textContent = error.message || "Push konnte nicht aktiviert werden.";
    pushMsg.classList.add("error");
  }
}

pushBtn?.addEventListener("click", activatePush);
