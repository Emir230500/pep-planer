const login = document.querySelector("#login");
const plans = document.querySelector("#plans");
const loginMsg = document.querySelector("#loginMsg");
const shiftList = document.querySelector("#shiftList");
const hello = document.querySelector("#hello");
const pushBox = document.querySelector("#pushBox");
const pushBtn = document.querySelector("#pushBtn");
const pushMsg = document.querySelector("#pushMsg");
const adminLink = document.querySelector("#adminLink");
let currentTeamData = null;
let teamEditShift = null;
let teamSickEntry = null;
let teamEditMap = new Map();
let activeViewPanel = "own";
let activeWeekOverviewSort = "time";

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
  plans.classList.remove("page-enter");
  void plans.offsetWidth;
  plans.classList.add("page-enter");
  window.setTimeout(() => plans.classList.remove("page-enter"), 420);
  hello.textContent = data.name;
  adminLink?.classList.add("hidden");
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
  document.querySelectorAll("[data-own-day-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      button.closest(".day")?.classList.toggle("collapsed");
    });
  });
}

function showTeamShifts(data) {
  currentTeamData = data;
  if (activeViewPanel === "manage" && !data.canManage) activeViewPanel = "own";
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
      <button class="${activeViewPanel === "week" ? "active" : ""}" data-view-panel="week" type="button">Wochenplan</button>
      ${data.canManage ? `<button class="${activeViewPanel === "manage" ? "active" : ""}" data-view-panel="manage" type="button">Verwalten</button>` : ""}
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
      <div class="team-section-head">
        <h2>Teamplan</h2>
        <button id="showTeamSick" class="mini-button secondary" type="button">Krank melden</button>
      </div>
      ${activeViewPanel === "team" ? `${renderTeamSickForm()}${renderTeamEditForm()}` : ""}
      <nav class="week-nav">
        ${teamWeeks.map(week => `<button class="${week.isCurrent ? "active" : ""}" data-week-target="team-kw-${week.year}-${week.week}">KW ${week.week}</button>`).join("")}
      </nav>
      ${teamWeeks.map(week => renderTeamWeek(week)).join("")}
    </section>
    <section class="week-overview-block view-panel ${activeViewPanel === "week" ? "" : "hidden"}" data-view-content="week">
      <div class="team-section-head">
        <div>
          <h2>Wochenplan</h2>
          <p class="hint">Ganze Woche als ruhige Uebersicht. Seitlich wischen, wenn es eng wird.</p>
        </div>
      </div>
      <div class="sort-switch" aria-label="Wochenplan sortieren">
        <button class="${activeWeekOverviewSort === "time" ? "active" : ""}" data-week-overview-sort="time" type="button">Frueh -> Spaet</button>
        <button class="${activeWeekOverviewSort === "department" ? "active" : ""}" data-week-overview-sort="department" type="button">Abteilung</button>
        <button class="${activeWeekOverviewSort === "name" ? "active" : ""}" data-week-overview-sort="name" type="button">Name</button>
      </div>
      <nav class="week-nav">
        ${teamWeeks.map(week => `<button class="${week.isCurrent ? "active" : ""}" data-week-target="overview-kw-${week.year}-${week.week}">KW ${week.week}</button>`).join("")}
      </nav>
      ${teamWeeks.map(week => renderWeekOverview(week)).join("")}
    </section>
    ${data.canManage ? `
      <section class="manage-plan-block view-panel ${activeViewPanel === "manage" ? "" : "hidden"}" data-view-content="manage">
        <div class="team-section-head">
          <div>
            <h2>Verwalten</h2>
            <p class="hint">Dienstplaene hochladen, veroeffentlichen, korrigieren und Mitarbeiter/PINs pflegen.</p>
          </div>
        </div>
        <iframe class="admin-frame" src="/admin.html?embedded=1" title="Verwalten"></iframe>
      </section>
    ` : ""}
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
  document.querySelectorAll("[data-week-overview-sort]").forEach(button => {
    button.addEventListener("click", () => {
      activeWeekOverviewSort = button.dataset.weekOverviewSort || "time";
      activeViewPanel = "week";
      showTeamShifts(currentTeamData);
    });
  });
  document.querySelectorAll("[data-week-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      button.closest(".week")?.classList.toggle("collapsed");
    });
  });
  document.querySelectorAll("[data-own-day-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      button.closest(".day")?.classList.toggle("collapsed");
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
      teamSickEntry = null;
      teamEditShift = teamEditMap.get(button.dataset.teamEdit) || null;
      activeViewPanel = button.dataset.editView || activeViewPanel;
      showTeamShifts(currentTeamData);
      document.querySelector("#teamEditBox")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.querySelectorAll("[data-team-add]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      teamSickEntry = null;
      const plan = (currentTeamData?.plans || []).find(item => item.id === button.dataset.planId);
      teamEditShift = newTeamShift(button.dataset.planId, button.dataset.date, plan);
      activeViewPanel = button.dataset.editView || "team";
      showTeamShifts(currentTeamData);
      document.querySelector("#teamEditBox")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.querySelector("#showTeamSick")?.addEventListener("click", () => {
    if (teamSickEntry) {
      teamSickEntry = null;
      showTeamShifts(currentTeamData);
      return;
    }
    teamEditShift = null;
    teamSickEntry = newTeamSickEntry();
    activeViewPanel = "team";
    showTeamShifts(currentTeamData);
    document.querySelector("#teamSickBox")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelector("#cancelTeamEdit")?.addEventListener("click", () => {
    teamEditShift = null;
    showTeamShifts(currentTeamData);
  });
  document.querySelector("#cancelTeamSick")?.addEventListener("click", () => {
    teamSickEntry = null;
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
  document.querySelectorAll("[data-team-sick-date-choice]").forEach(button => {
    button.addEventListener("click", () => {
      if (!teamSickEntry) return;
      syncTeamSickFormState();
      const value = button.dataset.teamSickDateChoice;
      const current = new Set(teamSickEntry.dates || []);
      if (current.has(value) && current.size > 1) current.delete(value);
      else current.add(value);
      teamSickEntry.dates = Array.from(current);
      teamSickEntry.date = teamSickEntry.dates[0] || value;
      teamSickEntry.wholeWeek = false;
      showTeamShifts(currentTeamData);
    });
  });
  document.querySelectorAll("[data-team-sick-week]").forEach(button => {
    button.addEventListener("click", () => {
      if (!teamSickEntry) return;
      syncTeamSickFormState();
      const values = button.dataset.teamSickWeek.split("|").filter(Boolean);
      const current = new Set(teamSickEntry.dates || []);
      const allSelected = values.every(value => current.has(value));
      values.forEach(value => allSelected ? current.delete(value) : current.add(value));
      if (!current.size) values.forEach(value => current.add(value));
      teamSickEntry.dates = Array.from(current).sort((a, b) => parseGermanDate(a) - parseGermanDate(b));
      teamSickEntry.date = teamSickEntry.dates[0] || values[0] || teamSickEntry.date;
      teamSickEntry.wholeWeek = values.every(value => teamSickEntry.dates.includes(value));
      showTeamShifts(currentTeamData);
    });
  });
  document.querySelector("#teamSickPlan")?.addEventListener("change", event => {
    if (!teamSickEntry) return;
    syncTeamSickFormState();
    const plan = (currentTeamData?.plans || []).find(item => item.id === event.target.value);
    teamSickEntry.planId = event.target.value;
    teamSickEntry.planRange = plan?.range || "";
    const values = teamEditDateValues(teamSickEntry);
    teamSickEntry.date = values[0] || teamSickEntry.date;
    teamSickEntry.dates = [teamSickEntry.date].filter(Boolean);
    showTeamShifts(currentTeamData);
  });
  document.querySelector("#teamSickWholeWeek")?.addEventListener("change", event => {
    if (!teamSickEntry) return;
    syncTeamSickFormState();
    teamSickEntry.wholeWeek = event.target.checked;
    if (teamSickEntry.wholeWeek) {
      const week = groupTeamSickDatesByWeek(teamSickDateValues()).find(group => group.dates.includes(teamSickEntry.date));
      teamSickEntry.dates = week?.dates || teamEditDateValues(teamSickEntry);
    }
    showTeamShifts(currentTeamData);
  });
  document.querySelector("#teamSickName")?.addEventListener("change", syncTeamSickFormState);
  document.querySelector("#teamSickNotifyMode")?.addEventListener("change", () => {
    syncTeamSickFormState();
    showTeamShifts(currentTeamData);
  });
  document.querySelector("#teamSickPushMessage")?.addEventListener("input", syncTeamSickFormState);
  document.querySelectorAll(".team-sick-leadership-name").forEach(input => input.addEventListener("change", syncTeamSickFormState));
  document.querySelector("#saveTeamSick")?.addEventListener("click", saveTeamSick);
  document.querySelector("#saveTeamEdit")?.addEventListener("click", saveTeamEdit);
  document.querySelector("#deleteTeamEdit")?.addEventListener("click", deleteTeamEdit);
  document.querySelector("#teamEditNameSelect")?.addEventListener("change", syncTeamEditNameMode);
  document.querySelector("#teamEditNameCustom")?.addEventListener("input", syncTeamEditNameMode);
  document.querySelector("#teamEditDepartment")?.addEventListener("change", syncTeamEditNameMode);
  document.querySelector("#teamEditBreak")?.addEventListener("blur", event => {
    event.target.value = normalizeBreakValue(event.target.value);
  });
  document.querySelector("#teamEditNotifyMode")?.addEventListener("change", event => {
    document.querySelector("#teamEditNotifyPeople")?.classList.toggle("hidden", event.target.value !== "selected_leadership");
  });
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
      const change = latestChangeForShift(plan, original);
      const shift = { ...original, planId: plan.id, planTitle: plan.title, planRange: plan.range, changed: Boolean(change), change };
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
      const change = latestChangeForShift(plan, original);
      const shift = { ...original, planId: plan.id, planTitle: plan.title, planRange: plan.range, changed: Boolean(change), change };
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

function latestChangeForShift(plan, shift) {
  return (plan.changes || [])
    .filter(change => employeeKey(change.name) === employeeKey(shift.name) && change.date === shift.date)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
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
  const multiBlock = nextWorkDay.shifts.length > 1;
  const showDayPause = multiBlock || multiDepartment;
  const nextRange = escapeHtml(dayTimeRange(nextWorkDay.shifts));
  return `
    <section class="next-card ${multiBlock || multiDepartment ? "" : "compact-next-card"}">
      <p class="next-label">Naechste Schicht</p>
      <div class="next-main">
        <div>
          <h2>${weekdayLong(nextWorkDay.date)}, ${formatGermanDate(nextWorkDay.date)}</h2>
          <p>${nextRange}${multiDepartment ? " - mehrere Abteilungen" : ""}</p>
        </div>
        <span class="badge">Anstehend</span>
      </div>
      <div class="day-shifts">
        ${nextWorkDay.shifts.map(shift => renderShift(shift, multiBlock || multiDepartment, nextWorkDay.shifts)).join("")}
      </div>
      ${showDayPause ? `<div class="day-summary next-summary">Tagespause: ${dayPauseText(nextWorkDay.shifts)}</div>` : ""}
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

function renderWeekOverview(week) {
  const isOpen = week.isCurrent || week.isOpen;
  const startDate = week.displayStart || week.startDate;
  const endDate = week.displayEnd || week.endDate;
  const days = datesBetween(startDate, endDate);
  const employees = sortOverviewEmployees(unique(week.shifts.map(shift => shift.name).filter(Boolean)), week);

  return `
    <section id="overview-kw-${week.year}-${week.week}" class="week overview-week ${week.isCurrent ? "current-week" : ""} ${isOpen ? "" : "collapsed"}">
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
        <div class="overview-scroll">
          <div class="overview-grid" style="--overview-days:${days.length}">
            <div class="overview-name overview-corner">Mitarbeiter</div>
            ${days.map(date => `<div class="overview-day-head ${isToday(date) ? "today-overview-head" : ""}">
              <strong>${weekdayLong(date)}</strong>
              <span>${formatGermanDate(date)}</span>
            </div>`).join("")}
            ${employees.map(name => renderOverviewEmployeeRow(name, days, week)).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderOverviewEmployeeRow(name, days, week) {
  return `
    <div class="overview-name">${escapeHtml(name)}</div>
    ${days.map(date => {
      const dateValue = formatGermanDate(date);
      const dayShifts = (week.days.get(dateValue) || []).filter(shift => employeeKey(shift.name) === employeeKey(name));
      return `<div class="overview-cell ${isToday(date) ? "today-overview-cell" : ""}">
        ${renderOverviewCell(dayShifts)}
      </div>`;
    }).join("")}
  `;
}

function sortOverviewEmployees(employees, week) {
  return employees.slice().sort((a, b) => {
    const shiftsA = overviewEmployeeShifts(a, week);
    const shiftsB = overviewEmployeeShifts(b, week);
    if (activeWeekOverviewSort === "name") return a.localeCompare(b, "de");
    if (activeWeekOverviewSort === "department") {
      const sortA = overviewDepartmentSortInfo(shiftsA);
      const sortB = overviewDepartmentSortInfo(shiftsB);
      const byDepartment = sortA.rank - sortB.rank;
      if (byDepartment) return byDepartment;
      const byTimeInDepartment = sortA.start - sortB.start;
      if (byTimeInDepartment) return byTimeInDepartment;
      const byFirstDayInDepartment = sortA.date - sortB.date;
      if (byFirstDayInDepartment) return byFirstDayInDepartment;
    }
    const byTime = overviewFirstWorkOrder(shiftsA) - overviewFirstWorkOrder(shiftsB);
    if (byTime) return byTime;
    const byDepartment = departmentSortRank(overviewPrimaryDepartment(shiftsA)) - departmentSortRank(overviewPrimaryDepartment(shiftsB));
    if (byDepartment) return byDepartment;
    return a.localeCompare(b, "de");
  });
}

function overviewEmployeeShifts(name, week) {
  return week.shifts.filter(shift => employeeKey(shift.name) === employeeKey(name));
}

function overviewFirstStart(shifts) {
  const values = shifts.filter(isWorkShift).map(shift => timeToMinutes(shift.start)).filter(value => value !== 9999);
  return values.length ? Math.min(...values) : 9999;
}

function overviewFirstWorkOrder(shifts) {
  const starts = shifts
    .filter(isWorkShift)
    .map(shift => timeToMinutes(shift.start))
    .filter(value => value !== 9999);
  return starts.length ? Math.min(...starts) : 9999;
}

function overviewDepartmentSortInfo(shifts) {
  const work = shifts.filter(isWorkShift).sort((a, b) => {
    const byDepartment = departmentSortRank(overviewDepartmentLabel(a)) - departmentSortRank(overviewDepartmentLabel(b));
    if (byDepartment) return byDepartment;
    const byTime = timeToMinutes(a.start) - timeToMinutes(b.start);
    if (byTime) return byTime;
    return dateSortValue(a.date) - dateSortValue(b.date);
  });
  if (!work.length) {
    const status = shifts.find(shift => detectStatus(shift));
    return {
      rank: status ? departmentSortRank(detectStatus(status)) : 9999,
      start: 9999,
      date: 999999
    };
  }
  const selected = work[0];
  return {
    rank: departmentSortRank(overviewDepartmentLabel(selected)),
    start: timeToMinutes(selected.start),
    date: dateSortValue(selected.date)
  };
}

function dateSortValue(value) {
  const date = parseGermanDate(value);
  if (!date) return 999999;
  return Math.floor(date.getTime() / 86400000);
}

function overviewPrimaryDepartment(shifts) {
  const work = shifts.filter(isWorkShift).sort((a, b) => {
    const byDepartment = departmentSortRank(overviewDepartmentLabel(a)) - departmentSortRank(overviewDepartmentLabel(b));
    if (byDepartment) return byDepartment;
    return timeToMinutes(a.start) - timeToMinutes(b.start);
  });
  const selected = work[0] || shifts[0] || {};
  const status = detectStatus(selected);
  if (status) return status;
  return overviewDepartmentLabel(selected);
}

function overviewDepartmentLabel(shift) {
  const department = String(shift?.department || "");
  if (department.toLowerCase().includes("sco kasse")) return "Kasse";
  return department || departmentLabel(shift || {});
}

function overviewDistinctDepartments(shifts) {
  const labels = [];
  shifts.forEach(shift => {
    const label = overviewDepartmentLabel(shift);
    const key = departmentOptionKey(label);
    if (label && !labels.some(item => item.key === key)) labels.push({ key, label });
  });
  return labels;
}

function renderOverviewCell(shifts) {
  if (!shifts.length) return '<span class="overview-empty">-</span>';
  const sorted = sortOverviewShifts(shifts);
  const statusOnly = sorted.every(shift => detectStatus(shift));
  if (statusOnly) {
    const status = detectStatus(sorted[0]) || "Abwesenheit";
    return `
      <div class="overview-shift overview-shift-combined status-row ${statusClassName(status)}">
        <strong>Kein Dienst</strong>
        <span>${escapeHtml(status)}</span>
      </div>
    `;
  }
  const workShifts = sorted.filter(isWorkShift);
  const statusShifts = sorted.filter(shift => !isWorkShift(shift));
  const distinctDepartments = overviewDistinctDepartments(workShifts);
  const showParts = distinctDepartments.length > 1;
  const mainLabel = workShifts.length > 1 ? `${dayTimeRange(workShifts)} Gesamt` : `${workShifts[0]?.start || ""}-${workShifts[0]?.end || ""}`;
  const mainDepartment = showParts ? `${distinctDepartments.length} Bereiche` : (distinctDepartments[0]?.label || "Abteilung pruefen");
  return `
    <div class="overview-shift overview-shift-combined ${departmentClass(distinctDepartments[0]?.label || workShifts[0]?.department)}">
      <strong>${escapeHtml(mainLabel)}</strong>
      <span>${escapeHtml(mainDepartment)}</span>
      ${showParts ? workShifts.map(shift => `
        <small class="overview-part ${departmentClass(shift.department)}">
          <b>${escapeHtml(shift.start)}-${escapeHtml(shift.end)}</b>
          ${escapeHtml(overviewDepartmentLabel(shift) || "Abteilung pruefen")}
        </small>
      `).join("") : ""}
      ${statusShifts.map(shift => `<small class="overview-part">${escapeHtml(detectStatus(shift) || "Abwesenheit")}</small>`).join("")}
      <small>${escapeHtml(dayPauseText(workShifts))}</small>
    </div>
  `;
}

function sortOverviewShifts(shifts) {
  return shifts.slice().sort((a, b) => {
    if (activeWeekOverviewSort === "department") {
      const byDepartment = departmentSortRank(departmentLabel(a)) - departmentSortRank(departmentLabel(b));
      if (byDepartment) return byDepartment;
    }
    if (activeWeekOverviewSort === "name") {
      const byName = a.name.localeCompare(b.name, "de");
      if (byName) return byName;
    }
    const byTime = timeToMinutes(a.start) - timeToMinutes(b.start);
    if (byTime) return byTime;
    const byDepartment = departmentSortRank(departmentLabel(a)) - departmentSortRank(departmentLabel(b));
    if (byDepartment) return byDepartment;
    return departmentLabel(a).localeCompare(departmentLabel(b), "de");
  });
}

function renderPausePlain(shift) {
  if (shift.break) return `Pause ${shift.break}`;
  return needsBreakCheck(shift) ? "Pause pruefen" : "keine Pause";
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
    .sort((a, b) => {
      const byDepartment = departmentSortRank(a.department) - departmentSortRank(b.department);
      if (byDepartment) return byDepartment;
      return a.start - b.start || a.department.localeCompare(b.department, "de");
    });
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

function departmentSortRank(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("marktleitung")) return 10;
  if (text.includes("marktaufsicht")) return 20;
  if (text.includes("werbung")) return 30;
  if (text.includes("obst")) return 40;
  if (text.includes("kasse")) return 50;
  if (text.includes("bakeoff") || text.includes("backshop")) return 60;
  if (text.includes("getraenke") || text.includes("getränke")) return 70;
  if (text.includes("mopro")) return 80;
  if (text.includes("tiefkuehl") || text.includes("tiefkühl")) return 90;
  if (text.includes("food")) return 100;
  if (text.includes("auto dispo") || text.includes("autodispo")) return 110;
  if (text.includes("abwesenheit") || text.includes("frei") || text.includes("urlaub") || text.includes("krank")) return 999;
  return 500;
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
  const changeNote = renderShiftChangeNote(shift);
  teamEditMap.set(editKey, shift);
  return `
    <div class="team-shift${statusClass}${splitClass} ${departmentClass(shift.department)} ${shift.changed ? "changed-shift" : ""}">
      <span class="team-name">${escapeHtml(shift.name)}</span>
      <span class="team-time">${status ? "Kein Dienst" : `${escapeHtml(shift.start)}-${escapeHtml(shift.end)}`}</span>
      <span class="team-department">${status ? escapeHtml(statusLabel) : escapeHtml(shift.department || "Abteilung pruefen")}</span>
      <span class="team-pause">${status ? "" : splitInfo || renderPauseText(shift)}</span>
      ${changeNote}
      <button class="mini-button secondary team-edit-btn" data-team-edit="${escapeHtml(editKey)}" type="button">Bearbeiten</button>
    </div>
  `;
}

function renderShiftChangeNote(shift) {
  const change = shift.change;
  if (!change) return "";
  const editor = change.editorInitials || "";
  const before = compactSignatureForDisplay(change.before);
  const after = compactSignatureForDisplay(change.after);
  return `
    <span class="change-note">
      <b>Aktuell</b>${editor ? ` von ${escapeHtml(editor)}` : ""}: ${escapeHtml(after)}
      ${before ? `<small>Vorher: ${escapeHtml(before)}</small>` : ""}
    </span>
  `;
}

function compactSignatureForDisplay(value) {
  const text = String(value || "").trim();
  if (!text || text === "Keine Schicht") return "Keine Schicht";
  return text
    .split(" / ")
    .map(part => {
      const [time = "", department = "", pause = ""] = part.split("|");
      const shortTime = time.replace(/:00\b/g, "");
      return `${shortTime} ${shortDepartment(department)}${pause ? ` Pause ${pause}` : ""}`.trim();
    })
    .join(" + ");
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

function teamLeadershipOptions() {
  return [
    "Demircan, Emirkan",
    "Brockling, Angelina",
    "Konxheli, Dafina",
    "Konxhelli, Blerina",
    "Hammer, Pascal",
    "Rode, Joanna"
  ];
}

function newTeamSickEntry() {
  const plans = currentTeamData?.plans || [];
  const currentPlan = plans.find(plan => isCurrentPlanRange(plan.range)) || plans[0] || {};
  const range = datesFromPlanRange(currentPlan.range || "");
  return {
    planId: currentPlan.id || "",
    planRange: currentPlan.range || "",
    name: "",
    date: range.start ? formatGermanDate(range.start) : formatGermanDate(new Date()),
    dates: [range.start ? formatGermanDate(range.start) : formatGermanDate(new Date())],
    wholeWeek: false,
    notifyMode: "leadership",
    notifyNames: [],
    pushMessage: ""
  };
}

function isCurrentPlanRange(rangeText) {
  const range = datesFromPlanRange(rangeText || "");
  const today = new Date();
  return Boolean(range.start && range.end && today >= range.start && today <= range.end);
}

function renderTeamSickForm() {
  if (!teamSickEntry) return "";
  const plans = currentTeamData?.plans || [];
  const employees = editEmployeeOptions();
  const leadership = teamLeadershipOptions();
  const dateValues = teamSickDateValues();
  return `
    <div id="teamSickBox" class="shift-edit-box team-edit-box sick-entry-box">
      <strong>Mitarbeiter krank melden</strong>
      <p class="hint">Ersetzt die Dienste der Person durch Krankheit. Bei ganzer Woche werden alle Dienste dieser Woche entfernt.</p>
      <div class="shift-edit-grid">
        <label>Plan
          <select id="teamSickPlan">
            ${plans.map(plan => `<option value="${escapeHtml(plan.id)}" ${plan.id === teamSickEntry.planId ? "selected" : ""}>${escapeHtml(plan.title || plan.range || "Plan")}</option>`).join("")}
          </select>
        </label>
        <label>Person waehlen
          <select id="teamSickName">
            <option value="">Person waehlen</option>
            ${employees.map(name => `<option value="${escapeHtml(name)}" ${name === teamSickEntry.name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
          </select>
        </label>
        <label class="full-row">Tage waehlen
          <input id="teamSickDate" type="hidden" value="${escapeHtml(teamSickEntry.date)}">
          ${renderTeamSickDatePicker(dateValues, teamSickEntry.dates || [teamSickEntry.date], "data-team-sick-date-choice")}
        </label>
        <label class="checkbox-label">
          <input id="teamSickWholeWeek" type="checkbox" ${teamSickEntry.wholeWeek ? "checked" : ""}>
          Ganze Woche krank
        </label>
        <label>Benachrichtigung
          <select id="teamSickNotifyMode">
            <option value="leadership" ${teamSickEntry.notifyMode === "leadership" ? "selected" : ""}>Team Marktleitung</option>
            <option value="selected_leadership" ${teamSickEntry.notifyMode === "selected_leadership" ? "selected" : ""}>Person waehlen</option>
            <option value="none" ${teamSickEntry.notifyMode === "none" ? "selected" : ""}>Niemand</option>
          </select>
        </label>
        <label>Eigene Push-Nachricht<input id="teamSickPushMessage" maxlength="180" value="${escapeHtml(teamSickEntry.pushMessage || "")}" placeholder="Leer = Standardtext"></label>
      </div>
      ${teamSickEntry.notifyMode === "selected_leadership" ? `<details class="person-picker" open>
        <summary>Personen fuer Benachrichtigung auswaehlen</summary>
        <div class="leadership-checks">
          ${leadership.map(name => `
            <label><input type="checkbox" class="team-sick-leadership-name" value="${escapeHtml(name)}" ${(teamSickEntry.notifyNames || []).includes(name) ? "checked" : ""}> ${escapeHtml(name)}</label>
          `).join("")}
        </div>
      </details>` : ""}
      ${renderTeamSickNotificationPreview(teamSickEntry)}
      <div class="actions">
        <button id="saveTeamSick" class="danger" type="button">Krank melden</button>
        <button id="cancelTeamSick" class="secondary" type="button">Abbrechen</button>
      </div>
    </div>
  `;
}

function teamSickDateValues() {
  const dates = [];
  for (const plan of currentTeamData?.plans || []) {
    const range = datesFromPlanRange(plan.range || "");
    if (!range.start) continue;
    const end = range.end || range.start;
    const cursor = new Date(range.start);
    while (cursor <= end) {
      dates.push(formatGermanDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return Array.from(new Set(dates)).sort((a, b) => parseGermanDate(a) - parseGermanDate(b));
}

function renderTeamSickDatePicker(values, selectedDates, dataAttr) {
  const selectedSet = new Set((selectedDates || []).filter(Boolean));
  const label = selectedSet.size > 1 ? `${selectedSet.size} Tage ausgewaehlt` : (Array.from(selectedSet)[0] || "Tag waehlen");
  const weeks = groupTeamSickDatesByWeek(values);
  return `
    <div class="edit-date-picker">
      <div class="edit-date-selected">${escapeHtml(label)}</div>
      ${weeks.map(week => `
        <div class="sick-week-group">
          <button class="sick-week-select" data-team-sick-week="${escapeHtml(week.dates.join("|"))}" type="button">
            KW ${escapeHtml(week.week)} - ${escapeHtml(week.dates[0])} bis ${escapeHtml(week.dates[week.dates.length - 1])}
          </button>
          <div class="edit-date-grid">
            ${week.dates.map(value => {
              const parsed = parseGermanDate(value);
              return `<button class="edit-date-chip ${selectedSet.has(value) ? "selected" : ""}" ${dataAttr}="${escapeHtml(value)}" type="button">
                <span>${escapeHtml(weekdayShort(parsed))}</span>
                <strong>${escapeHtml(parsed ? String(parsed.getDate()).padStart(2, "0") : value)}</strong>
              </button>`;
            }).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function groupTeamSickDatesByWeek(values) {
  const groups = new Map();
  for (const value of values || []) {
    const parsed = parseGermanDate(value);
    if (!parsed) continue;
    const info = isoWeekInfo(parsed);
    const key = `${info.year}-${info.week}`;
    if (!groups.has(key)) groups.set(key, { week: info.week, year: info.year, dates: [] });
    groups.get(key).dates.push(value);
  }
  return Array.from(groups.values()).map(group => ({
    ...group,
    dates: group.dates.sort((a, b) => parseGermanDate(a) - parseGermanDate(b))
  })).sort((a, b) => parseGermanDate(a.dates[0]) - parseGermanDate(b.dates[0]));
}

function renderTeamSickNotificationPreview(entry) {
  const selectedDates = Array.from(new Set((entry.dates || []).filter(Boolean))).sort((a, b) => parseGermanDate(a) - parseGermanDate(b));
  const notifyText = entry.notifyMode === "none"
    ? "Niemand bekommt eine Push-Nachricht."
    : entry.notifyMode === "selected_leadership"
      ? `${entry.notifyNames?.length || 0} ausgewaehlte Person(en) bekommen eine Push-Nachricht.`
      : "Team Marktleitung bekommt eine Push-Nachricht.";
  const rangeText = selectedDates.length > 1 ? `${selectedDates[0]} bis ${selectedDates[selectedDates.length - 1]}` : (selectedDates[0] || "kein Tag gewaehlt");
  return `
    <div class="sick-preview">
      <strong>Vorschau</strong>
      <p>${escapeHtml(entry.name || "Keine Person gewaehlt")} krank: ${escapeHtml(rangeText)}</p>
      <p>${escapeHtml(notifyText)}</p>
      <small>${escapeHtml(entry.pushMessage || sickDefaultPushMessage(entry.name, selectedDates, initialsFromName(currentTeamData?.name || "")))}</small>
    </div>
  `;
}

function sickDefaultPushMessage(name, dates, initials = "") {
  const sortedDates = (dates || []).slice().sort((a, b) => parseGermanDate(a) - parseGermanDate(b));
  const editor = initials ? ` (${initials})` : "";
  if (!sortedDates.length) return `Krankmeldung: ${name || "Person"}${editor}`;
  if (sortedDates.length === 1) {
    const parsed = parseGermanDate(sortedDates[0]);
    return `Krankmeldung: ${name || "Person"}${editor} ${weekdayShort(parsed)} ${sortedDates[0]}`;
  }
  const first = sortedDates[0];
  const last = sortedDates[sortedDates.length - 1];
  return `Krankmeldung: ${name || "Person"}${editor} ${weekdayShort(parseGermanDate(first))} ${first} bis ${weekdayShort(parseGermanDate(last))} ${last}`;
}

function initialsFromName(name) {
  const value = String(name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
  const parts = value.includes(",")
    ? value.split(",").map(part => part.trim())
    : value.split(/\s+/).filter(Boolean).reverse();
  const last = parts[0] || "";
  const first = parts[1] || "";
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function syncTeamSickFormState() {
  if (!teamSickEntry) return;
  teamSickEntry.name = document.querySelector("#teamSickName")?.value || teamSickEntry.name || "";
  teamSickEntry.notifyMode = document.querySelector("#teamSickNotifyMode")?.value || teamSickEntry.notifyMode || "leadership";
  teamSickEntry.notifyNames = Array.from(document.querySelectorAll(".team-sick-leadership-name:checked")).map(input => input.value);
  teamSickEntry.pushMessage = document.querySelector("#teamSickPushMessage")?.value || "";
}

function renderTeamEditForm() {
  if (!teamEditShift) return "";
  const dateValues = teamEditDateValues(teamEditShift);
  const departments = editDepartmentOptions();
  const employees = editEmployeeOptions();
  const leadership = teamLeadershipOptions();
  const isNew = Boolean(teamEditShift.isNew);
  const isProbe = departmentOptionKey(teamEditShift.department) === "probearbeiten";
  const selectedKnownEmployee = employees.some(name => employeeKey(name) === employeeKey(teamEditShift.name));
  return `
    <div id="teamEditBox" class="shift-edit-box team-edit-box">
      <strong>${isNew ? "Teamplan-Schicht hinzufuegen" : "Teamplan-Schicht bearbeiten"}</strong>
      <p class="hint">${isNew ? "Neue Schicht" : `${escapeHtml(teamEditShift.name)} - ${escapeHtml(teamEditShift.date)}`}. Nach dem Speichern landet es als haendische PEP-Korrektur in der Admin-Liste.</p>
      <div class="shift-edit-grid">
        <label>Mitarbeiter
          <input id="teamEditName" type="hidden" value="${escapeHtml(teamEditShift.name || "")}">
          <select id="teamEditNameSelect" ${isProbe ? "disabled" : ""}>
            <option value="">Mitarbeiter auswaehlen</option>
            ${employees.map(name => `<option value="${escapeHtml(name)}" ${!isProbe && employeeKey(name) === employeeKey(teamEditShift.name) ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
          </select>
          <input id="teamEditNameCustom" class="${isProbe ? "" : "hidden"}" value="${escapeHtml(isProbe && !selectedKnownEmployee ? teamEditShift.name || "" : "")}" placeholder="Name fuer Probearbeiten eingeben" ${isProbe ? "" : "disabled"}>
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
            <option value="affected_leadership">Betroffene Person + Team Marktleitung</option>
            <option value="leadership">Team Marktleitung</option>
            <option value="selected_leadership">Einzelne Marktleiter</option>
            <option value="none">Niemand</option>
            <option value="all">Alle Mitarbeiter</option>
          </select>
        </label>
        <label>Eigene Push-Nachricht<input id="teamEditPushMessage" maxlength="180" placeholder="Leer = Standardtext"></label>
      </div>
      <details id="teamEditNotifyPeople" class="person-picker hidden">
        <summary>Marktleiter auswaehlen</summary>
        <div class="leadership-checks">
          ${leadership.map(name => `
            <label><input type="checkbox" class="team-edit-leadership-name" value="${escapeHtml(name)}"> ${escapeHtml(name)}</label>
          `).join("")}
        </div>
      </details>
      <div class="actions">
        ${isNew ? "" : '<button id="deleteTeamEdit" class="danger" type="button">Schicht loeschen</button>'}
        <button id="saveTeamEdit" type="button">Speichern</button>
        <button id="cancelTeamEdit" class="secondary" type="button">Abbrechen</button>
      </div>
    </div>
  `;
}

function syncTeamEditNameMode() {
  const department = document.querySelector("#teamEditDepartment")?.value || "";
  const isProbe = departmentOptionKey(department) === "probearbeiten";
  const hidden = document.querySelector("#teamEditName");
  const select = document.querySelector("#teamEditNameSelect");
  const custom = document.querySelector("#teamEditNameCustom");
  if (!hidden || !select || !custom) return;
  select.disabled = isProbe;
  custom.disabled = !isProbe;
  custom.classList.toggle("hidden", !isProbe);
  hidden.value = isProbe ? custom.value : select.value;
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

function renderTeamEditDatePicker(values, selectedDate, dataAttr = "data-team-edit-date-choice") {
  return `
    <div class="edit-date-picker">
      <div class="edit-date-selected">${escapeHtml(weekdayLong(parseGermanDate(selectedDate)) || "")}, ${escapeHtml(selectedDate)}</div>
      <div class="edit-date-grid">
        ${values.map(value => {
          const parsed = parseGermanDate(value);
          return `<button class="edit-date-chip ${value === selectedDate ? "selected" : ""}" ${dataAttr}="${escapeHtml(value)}" type="button">
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
  const fromEmployees = currentTeamData?.employees || [];
  const fromPlans = (currentTeamData?.plans || [])
    .flatMap(plan => plan.shifts || [])
    .map(shift => shift.name || "")
    .filter(Boolean);
  return unique([...fromEmployees, ...fromPlans]).sort((a, b) => a.localeCompare(b, "de"));
}

async function deleteTeamEdit() {
  if (!teamEditShift?.planId) return;
  if (!window.confirm("Diese Schicht wirklich loeschen?")) return;
  try {
    await api(`/api/me/plans/${encodeURIComponent(teamEditShift.planId)}/shifts/edit`, {
      method: "POST",
      body: {
        before: teamEditShift,
        after: null,
        notifyMode: document.querySelector("#teamEditNotifyMode")?.value || "affected",
        notifyNames: selectedTeamEditNotifyNames(),
        pushMessage: document.querySelector("#teamEditPushMessage")?.value || ""
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
        notifyMode: document.querySelector("#teamEditNotifyMode")?.value || "affected",
        notifyNames: selectedTeamEditNotifyNames(),
        pushMessage: document.querySelector("#teamEditPushMessage")?.value || ""
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

function selectedTeamEditNotifyNames() {
  return Array.from(document.querySelectorAll(".team-edit-leadership-name:checked")).map(input => input.value);
}

async function saveTeamSick() {
  if (!teamSickEntry?.planId) return;
  try {
    syncTeamSickFormState();
    const selectedDates = Array.from(new Set((teamSickEntry.dates || [document.querySelector("#teamSickDate")?.value || ""]).filter(Boolean)))
      .sort((a, b) => parseGermanDate(a) - parseGermanDate(b));
    const groups = groupTeamDatesByPlan(selectedDates);
    if (!groups.length) throw new Error("Bitte mindestens einen Tag auswaehlen.");
    const pushText = document.querySelector("#teamSickPushMessage")?.value || sickDefaultPushMessage(teamSickEntry.name, selectedDates, initialsFromName(currentTeamData?.name || ""));
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      await api(`/api/me/plans/${encodeURIComponent(group.planId)}/sick`, {
        method: "POST",
        body: {
          name: document.querySelector("#teamSickName")?.value || "",
          date: group.dates,
          wholeWeek: false,
          notifyMode: index === 0 ? (document.querySelector("#teamSickNotifyMode")?.value || "leadership") : "none",
          notifyNames: index === 0 ? Array.from(document.querySelectorAll(".team-sick-leadership-name:checked")).map(input => input.value) : [],
          pushMessage: index === 0 ? pushText : ""
        }
      });
    }
    teamSickEntry = null;
    await loadMine();
  } catch (error) {
    const box = document.querySelector("#teamSickBox");
    if (box && !box.querySelector(".team-edit-error")) {
      box.insertAdjacentHTML("beforeend", `<p class="msg error team-edit-error">${escapeHtml(error.message)}</p>`);
    }
  }
}

function teamPlanForDate(dateValue) {
  const date = parseGermanDate(dateValue);
  if (!date) return null;
  return (currentTeamData?.plans || []).find(plan => {
    const range = datesFromPlanRange(plan.range || "");
    return range.start && range.end && date >= range.start && date <= range.end;
  }) || null;
}

function groupTeamDatesByPlan(dates) {
  const groups = new Map();
  for (const dateValue of dates || []) {
    const plan = teamPlanForDate(dateValue) || (currentTeamData?.plans || []).find(item => item.id === teamSickEntry?.planId);
    if (!plan?.id) continue;
    if (!groups.has(plan.id)) groups.set(plan.id, { planId: plan.id, dates: [] });
    groups.get(plan.id).dates.push(dateValue);
  }
  return Array.from(groups.values());
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
  const currentDay = isToday(date);
  const isCollapsed = !currentDay;
  return `
    <article class="day free-day own-day ${currentDay ? "today-day" : ""} ${changed ? "changed-day" : ""} ${isCollapsed ? "collapsed" : ""}">
      <button class="day-title own-day-head" data-own-day-toggle type="button">
        <span>
          <strong>${weekdayLong(date)}, ${formatGermanDate(date)}</strong>
          <small>X</small>
        </span>
        <span class="own-day-actions">
          ${currentDay ? '<span class="badge">Heute</span>' : ""}
          ${changed ? '<span class="badge warn-badge">Geaendert</span>' : ""}
        </span>
      </button>
      <div class="own-day-body">
        <div class="shift-row status-row">
          <span class="time">X</span>
          <span class="department">Keine Schicht</span>
        </div>
      </div>
    </article>
  `;
}

function renderDay(dateValue, dayShifts, changed = false) {
  const date = parseGermanDate(dateValue);
  const currentDay = isToday(date);
  const sorted = dayShifts.slice().sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const multiDepartment = new Set(sorted.map(shift => shift.department).filter(Boolean)).size > 1;
  const multiBlock = sorted.length > 1;
  const dayPause = dayPauseText(sorted);
  const showDaySummary = multiBlock || multiDepartment;
  const isCollapsed = !currentDay;
  const shortSummary = `${escapeHtml(dayTimeRange(sorted))}${dayPause ? ` | ${escapeHtml(dayPause)}` : ""}${multiDepartment ? " | mehrere Abteilungen" : ""}`;

  return `
    <article class="day own-day ${currentDay ? "today-day" : ""} ${changed ? "changed-day" : ""} ${isCollapsed ? "collapsed" : ""}">
      <button class="day-title own-day-head" data-own-day-toggle type="button">
        <span>
          <strong>${weekdayLong(date)}, ${formatGermanDate(date)}</strong>
          <small>${shortSummary}</small>
        </span>
        <span class="own-day-actions">
          ${currentDay ? '<span class="badge">Heute</span>' : ""}
          ${changed ? '<span class="badge warn-badge">Geaendert</span>' : ""}
          ${multiDepartment ? '<span class="badge subtle">Mehrere Abteilungen</span>' : ""}
        </span>
      </button>
      <div class="own-day-body">
        ${showDaySummary ? `<div class="day-summary">Gesamt: ${escapeHtml(dayTimeRange(sorted))} - Tagespause: ${dayPause}</div>` : ""}
        <div class="day-shifts">
          ${sorted.map(shift => renderShift(shift, multiBlock || multiDepartment, sorted)).join("")}
        </div>
      </div>
    </article>
  `;
}

function renderShift(shift, compactPause = false, dayShifts = []) {
  const status = detectStatus(shift);
  const canEdit = Boolean(currentTeamData?.teamView && shift.planId);
  const editKey = canEdit ? teamShiftKey(shift) : "";
  if (canEdit) teamEditMap.set(editKey, shift);
  if (status) {
    const statusLabel = status;
    return `
      <div class="shift-row status-row ${statusClassName(status)} ${shift.changed ? "changed-shift" : ""}">
        <span class="time">Kein Dienst</span>
        <span class="department">${escapeHtml(statusLabel)}</span>
        ${renderShiftChangeNote(shift)}
        ${canEdit ? `<button class="mini-button secondary own-edit-btn" data-team-edit="${escapeHtml(editKey)}" data-edit-view="own" type="button">Bearbeiten</button>` : ""}
      </div>
    `;
  }

  return `
    <div class="shift-row ${departmentClass(shift.department)} ${shift.changed ? "changed-shift" : ""}">
      <span class="time">${escapeHtml(shift.start)}-${escapeHtml(shift.end)}</span>
      <span class="department">${escapeHtml(shift.department || "Abteilung pruefen")}</span>
      ${shift.changed ? '<span class="badge warn-badge">Geaendert</span>' : ""}
      ${compactPause ? '<span class="pause">Teilblock</span>' : renderPause(shift, dayShifts)}
      ${renderShiftChangeNote(shift)}
      ${canEdit ? `<button class="mini-button secondary own-edit-btn" data-team-edit="${escapeHtml(editKey)}" data-edit-view="own" type="button">Bearbeiten</button>` : ""}
    </div>
  `;
}

function renderPause(shift, dayShifts = []) {
  if (shift.break) return `<span class="pause">${escapeHtml(shift.break)}</span>`;
  if (dayHasBreak(dayShifts)) return '<span class="pause">im Tag</span>';
  if (needsBreakCheck(shift)) return '<span class="pause warn">Pause pruefen</span>';
  return '<span class="pause"></span>';
}

function renderPauseText(shift) {
  if (shift.break) return shift.break;
  if (needsBreakCheck(shift)) return "Pause pruefen";
  return "";
}

function dayHasBreak(shifts) {
  return (shifts || []).some(shift => Boolean(shift.break));
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
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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
    "Auto Dispo", "Lager", "Mopro", "Non Food", "Werbung", "Probearbeiten",
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
  if (/^\d{1,2}$/.test(text)) {
    const number = Number(text);
    if (number === 1 || number === 60) return "01:00";
    return `00:${String(number).padStart(2, "0")}`;
  }
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
    adminLink?.classList.add("hidden");
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
