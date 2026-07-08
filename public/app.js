const login = document.querySelector("#login");
const plans = document.querySelector("#plans");
const loginMsg = document.querySelector("#loginMsg");
const shiftList = document.querySelector("#shiftList");
const hello = document.querySelector("#hello");

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

function showShifts(data) {
  login.classList.add("hidden");
  plans.classList.remove("hidden");
  hello.textContent = data.name;

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
  const ownPlans = data.plans.map(plan => ({
    ...plan,
    shifts: plan.shifts.filter(shift => employeeKey(shift.name) === employeeKey(data.name))
  }));
  const ownWeeks = groupByPlans(ownPlans);
  if (!ownWeeks.some(week => week.isCurrent) && ownWeeks.length) {
    ownWeeks[0].isOpen = true;
  }
  const nextWorkDay = findNextWorkDay(ownWeeks);
  const otherPlans = data.plans.map(plan => ({
    ...plan,
    shifts: plan.shifts.filter(shift => employeeKey(shift.name) !== employeeKey(data.name))
  }));
  const teamWeeks = groupTeamByPlans(otherPlans);
  if (!teamWeeks.some(week => week.isCurrent) && teamWeeks.length) {
    teamWeeks[0].isOpen = false;
  }

  shiftList.innerHTML = `
    ${renderNextWorkDay(nextWorkDay)}
    <section class="own-plan-block">
      <h2>Mein Plan</h2>
      <nav class="week-nav">
        ${ownWeeks.map(week => `<button class="${week.isCurrent ? "active" : ""}" data-week-target="kw-${week.year}-${week.week}">KW ${week.week}</button>`).join("")}
      </nav>
      ${ownWeeks.map(week => renderWeek(week)).join("")}
    </section>
    <section class="team-plan-block">
      <h2>Teamplan</h2>
      <p class="hint">Alle anderen Mitarbeiter, sortiert nach KW, Tag und Abteilung.</p>
    </section>
    <nav class="week-nav">
      ${teamWeeks.map(week => `<button class="${week.isCurrent ? "active" : ""}" data-week-target="team-kw-${week.year}-${week.week}">KW ${week.week}</button>`).join("")}
    </nav>
    ${teamWeeks.map(week => renderTeamWeek(week)).join("")}
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
      button.closest(".week")?.classList.toggle("collapsed");
    });
  });
}

function groupByPlans(plans) {
  const grouped = new Map();
  for (const plan of plans) {
    const rangeDates = datesFromPlanRange(plan.range);
    if (!plan.shifts.length) {
      const date = rangeDates.start;
      if (!date) continue;
      const info = isoWeekInfo(date);
      const key = `${info.year}-${String(info.week).padStart(2, "0")}`;
      if (!grouped.has(key)) {
        grouped.set(key, { ...info, shifts: [], days: new Map(), isCurrent: isCurrentWeek(date), planTitle: plan.title, range: plan.range, displayStart: rangeDates.start, displayEnd: rangeDates.end });
      }
      continue;
    }
    for (const original of plan.shifts) {
      const shift = { ...original, planTitle: plan.title };
      const date = parseGermanDate(shift.date);
      if (!date) continue;
      const info = isoWeekInfo(date);
      const key = `${info.year}-${String(info.week).padStart(2, "0")}`;
      if (!grouped.has(key)) {
        grouped.set(key, { ...info, shifts: [], days: new Map(), isCurrent: isCurrentWeek(date), planTitle: plan.title, range: plan.range });
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

function groupTeamByPlans(plans) {
  const grouped = new Map();
  for (const plan of plans) {
    const rangeDates = datesFromPlanRange(plan.range);
    for (const original of plan.shifts) {
      const shift = { ...original, planTitle: plan.title };
      const date = parseGermanDate(shift.date);
      if (!date) continue;
      const info = isoWeekInfo(date);
      const key = `${info.year}-${String(info.week).padStart(2, "0")}`;
      if (!grouped.has(key)) {
        grouped.set(key, { ...info, shifts: [], days: new Map(), isCurrent: isCurrentWeek(date), planTitle: plan.title, range: plan.range });
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [];

  for (const week of weeks) {
    for (const [dateValue, dayShifts] of week.days.entries()) {
      const date = parseGermanDate(dateValue);
      if (!date || date < today) continue;
      const workShifts = dayShifts.filter(isWorkShift).sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
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
          <h2>${weekday(nextWorkDay.date)}, ${formatGermanDate(nextWorkDay.date)}</h2>
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
      return dayShifts.length ? renderDay(dateValue, dayShifts) : renderFreeDay(date);
    })
    .join("");

  return `
    <section id="kw-${week.year}-${week.week}" class="week ${week.isCurrent ? "current-week" : ""} ${isOpen ? "" : "collapsed"}">
      <button class="week-head" data-week-toggle type="button">
        <div>
          <h2>KW ${week.week} - ${formatShortDate(startDate)} bis ${formatGermanDate(endDate)}</h2>
          <p>${escapeHtml(week.shifts[0]?.planTitle || week.planTitle || "")}</p>
        </div>
        <span class="week-actions">
          ${week.isCurrent ? '<span class="badge">Aktuelle Woche</span>' : '<span class="badge subtle">Anzeigen</span>'}
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
    .map(([date, dayShifts]) => renderTeamDay(date, dayShifts))
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

function renderTeamDay(dateValue, dayShifts) {
  const date = parseGermanDate(dateValue);
  const sorted = dayShifts.slice().sort((a, b) => {
    const byDepartment = departmentLabel(a).localeCompare(departmentLabel(b), "de");
    if (byDepartment) return byDepartment;
    const byName = a.name.localeCompare(b.name, "de");
    if (byName) return byName;
    return timeToMinutes(a.start) - timeToMinutes(b.start);
  });
  const departments = groupTeamDayByDepartment(sorted);

  return `
    <article class="day team-day">
      <div class="day-title">
        <strong>${weekday(date)}, ${formatGermanDate(date)}</strong>
        <span class="badge subtle">${sorted.length} Eintraege</span>
      </div>
      ${departments.map(group => `
        <div class="department-group">
          <div class="department-head">${escapeHtml(group.department)}</div>
          <div class="team-shifts">
            ${group.shifts.map(renderTeamShift).join("")}
          </div>
        </div>
      `).join("")}
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
  return Array.from(groups.entries()).map(([department, groupShifts]) => ({ department, shifts: groupShifts }));
}

function departmentLabel(shift) {
  const status = detectStatus(shift);
  return status || shift.department || "Abteilung pruefen";
}

function departmentClass(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("marktaufsicht")) return "dept-marktaufsicht";
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

function renderTeamShift(shift) {
  const status = detectStatus(shift);
  const statusClass = status ? ` status-row status-${status.toLowerCase()}` : "";
  return `
    <div class="team-shift${statusClass} ${departmentClass(shift.department)}">
      <span class="team-name">${escapeHtml(shift.name)}</span>
      <span class="team-time">${status ? escapeHtml(status) : `${escapeHtml(shift.start)}-${escapeHtml(shift.end)}`}</span>
      <span class="team-department">${status ? "Kein Dienst" : escapeHtml(shift.department || "Abteilung pruefen")}</span>
      <span class="team-pause">${status ? "" : renderPauseText(shift)}</span>
    </div>
  `;
}

function renderFreeDay(date) {
  return `
    <article class="day free-day">
      <div class="day-title">
        <strong>${weekday(date)}, ${formatGermanDate(date)}</strong>
      </div>
      <div class="shift-row status-row">
        <span class="time">X</span>
        <span class="department">Keine Schicht</span>
      </div>
    </article>
  `;
}

function renderDay(dateValue, dayShifts) {
  const date = parseGermanDate(dateValue);
  const sorted = dayShifts.slice().sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const multiDepartment = new Set(sorted.map(shift => shift.department).filter(Boolean)).size > 1;
  const dayPause = dayPauseText(sorted);

  return `
    <article class="day">
      <div class="day-title">
        <strong>${weekday(date)}, ${formatGermanDate(date)}</strong>
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
  if (status) {
    const statusClass = status.toLowerCase();
    return `
      <div class="shift-row status-row status-${statusClass}">
        <span class="time">${escapeHtml(status)}</span>
        <span class="department">Kein Dienst</span>
      </div>
    `;
  }

  return `
    <div class="shift-row ${departmentClass(shift.department)}">
      <span class="time">${escapeHtml(shift.start)}-${escapeHtml(shift.end)}</span>
      <span class="department">${escapeHtml(shift.department || "Abteilung pruefen")}</span>
      ${compactPause ? '<span class="pause">Teilblock</span>' : renderPause(shift)}
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
  if (text.includes("urlaub")) return "Urlaub";
  if (text.includes("krank")) return "Krankheit";
  if (text.includes("abwesenheit")) return "Abwesenheit";
  if (text.includes("frei")) return "Frei";
  return "";
}

function employeeKey(name) {
  return String(name || "").trim().replace(/\s+/g, " ").replace(/\s+,/g, ",").toLowerCase();
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

function formatGermanDate(date) {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function formatShortDate(date) {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.`;
}

function weekday(date) {
  return ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][date.getDay()];
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 9999;
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
  loginMsg.textContent = "";
  loginMsg.classList.remove("error");
  try {
    await api("/api/employee/login", { method: "POST", body: { name: document.querySelector("#name").value, pin: document.querySelector("#pin").value } });
    await loadMine();
  } catch (error) {
    loginMsg.textContent = error.message;
    loginMsg.classList.add("error");
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
