const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_SECRET = process.env.SESSION_SECRET || "bitte-aendern-" + crypto.randomBytes(16).toString("hex");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const PUBLIC_DIR = path.join(__dirname, "public");
const DATABASE_URL = process.env.DATABASE_URL || "";
const BUILD_VERSION = "push-benachrichtigung-20260709";
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BGl8Kj0c9KZ2Ek7WKG3QjvWKiY2NWp6A-uSc2Iz4OlDGA51abixHEPKVl638OR_5W8Y1A96txs-ZCXlzTsDuBzE";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "mW6Xe15oKonHIx5-6jn8oVxkkOtxw4rmOOfTDCDcK6s";
const PUSH_CONTACT = process.env.PUSH_CONTACT || "mailto:admin@example.com";
let pgPool = null;
let webPush = null;

try {
  webPush = require("web-push");
  webPush.setVapidDetails(PUSH_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch {
  webPush = null;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function defaultDb() {
  return { employees: {}, plans: [], publishedPlanIds: [], pushSubscriptions: [] };
}

function normalizeDb(db) {
  const clean = db && typeof db === "object" ? db : defaultDb();
  clean.employees = clean.employees && typeof clean.employees === "object" ? clean.employees : {};
  clean.plans = Array.isArray(clean.plans) ? clean.plans : [];
  clean.publishedPlanIds = Array.isArray(clean.publishedPlanIds) ? clean.publishedPlanIds : [];
  clean.pushSubscriptions = Array.isArray(clean.pushSubscriptions) ? clean.pushSubscriptions : [];
  return clean;
}

function initialDb() {
  if (!fs.existsSync(DB_FILE)) return defaultDb();
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return defaultDb();
  }
}

async function getPgPool() {
  if (!DATABASE_URL) return null;
  if (!pgPool) {
    const { Pool } = require("pg");
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
    });
  }
  return pgPool;
}

async function ensureDb() {
  const pool = await getPgPool();
  if (pool) {
    await pool.query("CREATE TABLE IF NOT EXISTS app_store (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())");
    await pool.query("CREATE TABLE IF NOT EXISTS app_backups (id bigserial PRIMARY KEY, value jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())");
    await pool.query("INSERT INTO app_store (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING", ["db", JSON.stringify(initialDb())]);
    return;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb(), null, 2));
  }
}

async function readDb() {
  await ensureDb();
  const pool = await getPgPool();
  if (pool) {
    const result = await pool.query("SELECT value FROM app_store WHERE key = $1", ["db"]);
    return normalizeDb(result.rows[0]?.value || defaultDb());
  }
  return normalizeDb(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
}

async function writeDb(db) {
  const pool = await getPgPool();
  if (pool) {
    await ensureDb();
    await pool.query("INSERT INTO app_backups (value) SELECT value FROM app_store WHERE key = $1", ["db"]);
    await pool.query("UPDATE app_store SET value = $2::jsonb, updated_at = now() WHERE key = $1", ["db", JSON.stringify(db)]);
    await pool.query("DELETE FROM app_backups WHERE id NOT IN (SELECT id FROM app_backups ORDER BY created_at DESC LIMIT 30)");
    return;
  }

  backupDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function backupDb() {
  if (!fs.existsSync(DB_FILE)) return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, `db-${stamp}.json`));
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(name => name.startsWith("db-") && name.endsWith(".json"))
    .sort();
  while (backups.length > 30) {
    fs.unlinkSync(path.join(BACKUP_DIR, backups.shift()));
  }
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 8_000_000) {
        req.destroy();
        reject(new Error("Die Datei ist zu gross."));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Ungueltige Daten."));
      }
    });
    req.on("error", reject);
  });
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").replace(/\s+,/g, ",");
}

function employeeKey(name) {
  return normalizeName(name).toLowerCase();
}

function canSeeTeamPlan(name) {
  return [
    "Demircan, Emirkan",
    "BrÃ¶ckling, Angelina",
    "Konxheli, Dafina",
    "Konxhelli, Blerina",
    "Hammer, Pascal",
    "Rode, Joanna"
  ].map(employeeKey).includes(employeeKey(name));
}

function parseGermanDate(value) {
  const match = String(value || "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function formatGermanDate(date) {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function planRange(shifts) {
  const dates = shifts.map(shift => parseGermanDate(shift.date)).filter(Boolean).sort((a, b) => a - b);
  if (!dates.length) return "";
  return `${formatGermanDate(dates[0])} bis ${formatGermanDate(dates[dates.length - 1])}`;
}

function hashPin(pin, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(pin), salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPin(pin, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const test = hashPin(pin, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(test));
}

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function createCookie(payload) {
  const raw = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${raw}.${sign(raw)}`;
}

function readCookie(req) {
  const found = String(req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith("plan_session="));
  if (!found) return null;
  const token = found.split("=").slice(1).join("=");
  const [raw, sig] = token.split(".");
  if (!raw || sig !== sign(raw)) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function setSession(res, payload) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("set-cookie", `plan_session=${createCookie(payload)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`);
}

function clearSession(res) {
  res.setHeader("set-cookie", "plan_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function requireAdmin(req, res) {
  const session = readCookie(req);
  if (session?.role === "admin") return true;
  json(res, 401, { error: "Nicht angemeldet." });
  return false;
}

function requireEmployee(req, res) {
  const session = readCookie(req);
  if (session?.role === "employee" && session.name) return session.name;
  json(res, 401, { error: "Nicht angemeldet." });
  return "";
}

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function isTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function timeToMinutesSafe(value) {
  return isTime(value) ? timeToMinutes(value) : 0;
}

function minutesToBreak(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function shiftDurationMinutes(shift) {
  if (!isTime(shift.start) || !isTime(shift.end)) return 0;
  const start = timeToMinutes(shift.start);
  const end = timeToMinutes(shift.end);
  return end >= start ? end - start : end + 1440 - start;
}

function totalDurationMinutes(shifts) {
  return shifts.reduce((sum, shift) => sum + shiftDurationMinutes(shift), 0);
}

function cleanedDisplayShifts(shifts) {
  const groups = new Map();
  for (const shift of shifts || []) {
    const key = `${employeeKey(shift.name)}|${shift.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(shift);
  }
  return Array.from(groups.values()).flatMap(group => removeSummaryRanges(propagateDailyBreak(group)));
}

function propagateDailyBreak(shifts) {
  const dayBreak = shifts.find(shift => !isStatusShift(shift) && shift.break)?.break || "";
  if (!dayBreak) return shifts;
  return shifts.map(shift => isStatusShift(shift) || shift.break ? shift : { ...shift, break: dayBreak });
}

function removeSummaryRanges(shifts) {
  return shifts.filter((shift, index) => {
    if (isStatusShift(shift)) return true;
    if (!isTime(shift.start) || !isTime(shift.end)) return false;
    const start = timeToMinutes(shift.start);
    const end = timeToMinutes(shift.end);
    const inside = shifts.filter((other, otherIndex) => {
      if (otherIndex === index || isStatusShift(other)) return false;
      if (!isTime(other.start) || !isTime(other.end)) return false;
      const otherStart = timeToMinutes(other.start);
      const otherEnd = timeToMinutes(other.end);
      return otherStart >= start && otherEnd <= end;
    });
    if (inside.length < 2) return true;
    const minStart = Math.min(...inside.map(other => timeToMinutes(other.start)));
    const maxEnd = Math.max(...inside.map(other => timeToMinutes(other.end)));
    return !(minStart === start && maxEnd === end);
  });
}

function legalBreakMinutes(minutes) {
  if (minutes > 540) return 45;
  if (minutes > 360) return 30;
  return 0;
}

function needsBreakCheck(shift) {
  return shiftDurationMinutes(shift) > 360;
}

function isBreakTimeValue(value) {
  return /^00:(15|30|45)$/.test(String(value || ""));
}

function isStatusShift(shift) {
  return /\b(frei|urlaub|krank|krankheit|abwesenheit|sonderurlaub)\b/i.test(`${shift.department || ""} ${shift.start || ""} ${shift.end || ""}`);
}

function cleanShift(shift) {
  return {
    name: normalizeName(shift.name),
    date: String(shift.date || "").trim(),
    start: String(shift.start || "").trim(),
    end: String(shift.end || "").trim(),
    department: String(shift.department || "").trim(),
    break: String(shift.break || "").trim()
  };
}

function applyDailyBreaks(shifts) {
  return shifts;
}

function isSuspiciousName(name) {
  const value = normalizeName(name);
  return /[-,]\s*$/.test(value) || value.length < 5 || !value.includes(",");
}

function shiftIssues(shifts) {
  const issues = [];
  const dailyBreaks = new Map();
  for (const shift of shifts) {
    if (isStatusShift(shift)) continue;
    const key = `${employeeKey(shift.name)}|${shift.date}`;
    const current = dailyBreaks.get(key) || { hasBreak: false, totalMinutes: 0, label: `${shift.name || "Unbekannt"} ${shift.date || ""}`.trim(), row: 0 };
    current.hasBreak = current.hasBreak || Boolean(shift.break);
    current.totalMinutes += shiftDurationMinutes(shift);
    current.row = current.row || shifts.indexOf(shift) + 1;
    dailyBreaks.set(key, current);
  }
  shifts.forEach((shift, index) => {
    const label = `${shift.name || "Unbekannt"} ${shift.date || ""}`.trim();
    if (isSuspiciousName(shift.name)) issues.push({ type: "name", row: index + 1, message: `Name pruefen: ${label}` });
    if (isStatusShift(shift)) return;
    if (!shift.department || shift.department === "PEP") issues.push({ type: "department", row: index + 1, message: `Abteilung fehlt: ${label}` });
    if (!isTime(shift.start) || !isTime(shift.end)) issues.push({ type: "time", row: index + 1, message: `Zeit pruefen: ${label}` });
    if (isBreakTimeValue(shift.start) || isBreakTimeValue(shift.end)) issues.push({ type: "time", row: index + 1, message: `Pause als Dienst erkannt: ${label}` });
  });
  return issues;
}

function validateUploadedShifts(shifts) {
  const workShifts = shifts.filter(shift => !isStatusShift(shift));
  const unknown = workShifts.filter(shift => !shift.department || shift.department === "PEP");
  const badTimes = workShifts.filter(shift => !isTime(shift.start) || !isTime(shift.end));
  const badNames = shifts.filter(shift => isSuspiciousName(shift.name));
  if (badNames.length) return `${badNames.length} Mitarbeiter-Namen wirken abgeschnitten. Import wurde nicht gespeichert. Beispiel: ${badNames[0].name}`;
  if (badTimes.length) return `${badTimes.length} Schichten haben ungueltige Zeiten. Import wurde nicht gespeichert. Beispiel: ${badTimes[0].name} ${badTimes[0].date} ${badTimes[0].start}-${badTimes[0].end}`;
  if (unknown.length) return `${unknown.length} Schichten haben keine sicher erkannte Abteilung. Import wurde nicht gespeichert.`;
  return "";
}

function publishedIds(db) {
  const ids = Array.isArray(db.publishedPlanIds) ? db.publishedPlanIds.slice() : [];
  if (db.publishedPlanId && !ids.includes(db.publishedPlanId)) ids.push(db.publishedPlanId);
  return ids.filter(id => db.plans.some(plan => plan.id === id));
}

function setPublishedIds(db, ids) {
  db.publishedPlanIds = Array.from(new Set(ids)).filter(id => db.plans.some(plan => plan.id === id));
  db.publishedPlanId = db.publishedPlanIds[0] || "";
}

function employeePublic(db) {
  return Object.values(db.employees || {})
    .map(emp => ({ name: emp.name, initialPin: emp.initialPin || "" }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function missingEmployeesForPlan(db, plan) {
  const planNames = new Set((plan.shifts || []).map(shift => employeeKey(shift.name)));
  const seenNames = new Set((plan.seenEmployees || []).map(employeeKey));
  return employeePublic(db)
    .filter(employee => !planNames.has(employeeKey(employee.name)) && !seenNames.has(employeeKey(employee.name)))
    .map(employee => employee.name);
}

function publicPlan(plan, extra = {}) {
  const shifts = cleanedDisplayShifts(plan.shifts || []);
  const issues = shiftIssues(shifts);
  return {
    id: plan.id,
    title: plan.title,
    uploadedAt: plan.uploadedAt,
    publishedAt: plan.publishedAt || "",
    range: plan.range || planRange(shifts),
    shiftCount: shifts.length,
    issueCount: issues.length,
    ...extra
  };
}

function validPushSubscription(subscription) {
  return subscription
    && typeof subscription.endpoint === "string"
    && subscription.keys
    && typeof subscription.keys.p256dh === "string"
    && typeof subscription.keys.auth === "string";
}

async function sendPlanPush(db, plan) {
  if (!webPush || !Array.isArray(db.pushSubscriptions) || !db.pushSubscriptions.length) {
    return { sent: 0, removed: 0 };
  }

  const payload = JSON.stringify({
    title: "Neuer Arbeitsplan online",
    body: `${plan.title || "Ein neuer Plan"} wurde veroeffentlicht.`,
    url: "/"
  });

  let sent = 0;
  let removed = 0;
  const alive = [];
  for (const saved of db.pushSubscriptions) {
    try {
      await webPush.sendNotification(saved.subscription || saved, payload);
      sent += 1;
      alive.push(saved);
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        removed += 1;
      } else {
        alive.push(saved);
      }
    }
  }
  db.pushSubscriptions = alive;
  return { sent, removed };
}

async function handleApi(req, res, pathname) {
  try {
    if (pathname === "/api/admin/login" && req.method === "POST") {
      const body = await readBody(req);
      if (String(body.password || "") !== ADMIN_PASSWORD) return json(res, 403, { error: "Falsches Passwort." });
      setSession(res, { role: "admin" });
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/employee/login" && req.method === "POST") {
      const body = await readBody(req);
      const db = await readDb();
      const name = normalizeName(body.name);
      const employee = db.employees[employeeKey(name)];
      if (!employee || !verifyPin(body.pin, employee.pinHash)) return json(res, 403, { error: "Name oder PIN stimmt nicht." });
      setSession(res, { role: "employee", name: employee.name });
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/logout" && req.method === "POST") {
      clearSession(res);
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/push/public-key" && req.method === "GET") {
      const name = requireEmployee(req, res);
      if (!name) return;
      return json(res, 200, { enabled: Boolean(webPush), publicKey: VAPID_PUBLIC_KEY });
    }

    if (pathname === "/api/push/subscribe" && req.method === "POST") {
      const name = requireEmployee(req, res);
      if (!name) return;
      if (!webPush) return json(res, 503, { error: "Push ist auf diesem Server noch nicht aktiv." });
      const body = await readBody(req);
      const subscription = body.subscription || body;
      if (!validPushSubscription(subscription)) return json(res, 400, { error: "Push-Abo konnte nicht gespeichert werden." });
      const db = await readDb();
      db.pushSubscriptions = (db.pushSubscriptions || []).filter(item => (item.subscription || item).endpoint !== subscription.endpoint);
      db.pushSubscriptions.push({ name, subscription, createdAt: new Date().toISOString() });
      await writeDb(db);
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/admin/overview" && req.method === "GET") {
      if (!requireAdmin(req, res)) return;
      const db = await readDb();
      const ids = publishedIds(db);
      const publishedPlans = db.plans.filter(plan => ids.includes(plan.id));
      return json(res, 200, {
        buildVersion: BUILD_VERSION,
        publishedPlanIds: ids,
        publishedPlanId: ids[0] || "",
        activePlan: publishedPlans[0] ? publicPlan(publishedPlans[0]) : null,
        publishedPlans: publishedPlans.map(plan => publicPlan(plan)),
        plans: db.plans.map(plan => publicPlan(plan, { isPublished: ids.includes(plan.id) })),
        employees: employeePublic(db)
      });
    }

    if (pathname === "/api/admin/employees" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const name = normalizeName(body.name);
      if (!name || !name.includes(",")) return json(res, 400, { error: "Bitte Name als Nachname, Vorname eingeben." });
      const pin = String(body.pin || generatePin()).trim();
      if (!/^\d{4,8}$/.test(pin)) return json(res, 400, { error: "PIN muss 4 bis 8 Zahlen haben." });
      const db = await readDb();
      const key = employeeKey(name);
      if (db.employees[key]) return json(res, 400, { error: "Mitarbeiter existiert bereits." });
      db.employees[key] = { name, pinHash: hashPin(pin), initialPin: pin };
      await writeDb(db);
      return json(res, 200, { ok: true, employee: { name, initialPin: pin } });
    }

    if (pathname.match(/^\/api\/admin\/employees\/[^/]+\/pin$/) && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const name = decodeURIComponent(pathname.split("/")[4]);
      const pin = String(body.pin || "").trim();
      if (!/^\d{4,8}$/.test(pin)) return json(res, 400, { error: "PIN muss 4 bis 8 Zahlen haben." });
      const db = await readDb();
      const employee = db.employees[employeeKey(name)];
      if (!employee) return json(res, 404, { error: "Mitarbeiter nicht gefunden." });
      employee.pinHash = hashPin(pin);
      employee.initialPin = pin;
      await writeDb(db);
      return json(res, 200, { ok: true, employee: { name: employee.name, initialPin: pin } });
    }

    if (pathname === "/api/admin/pep-browser-text" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      return json(res, 400, { error: "PEP direkt aus offenem Browser lesen funktioniert nur lokal am PC. Online bitte PEP-Text einfuegen oder Datei/PDF hochladen." });
    }

    if (pathname === "/api/admin/open-pep-browser" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      return json(res, 400, { error: "PEP-Browser oeffnen funktioniert nur lokal am PC. Online bitte PEP direkt im Browser oeffnen und kopieren." });
    }

    if (pathname === "/api/admin/upload" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const shifts = applyDailyBreaks((body.shifts || []).map(cleanShift).filter(shift => shift.name && shift.date && ((shift.start && shift.end) || isStatusShift(shift))));
      if (!shifts.length) return json(res, 400, { error: "Keine gueltigen Schichten gefunden." });
      const validationError = validateUploadedShifts(shifts);
      if (validationError) return json(res, 400, { error: validationError });

      const db = await readDb();
      const newPins = [];
      for (const shift of shifts) {
        const key = employeeKey(shift.name);
        if (!db.employees[key]) {
          const pin = generatePin();
          db.employees[key] = { name: shift.name, pinHash: hashPin(pin), initialPin: pin };
          newPins.push({ name: shift.name, pin });
        }
      }

      const plan = {
        id: crypto.randomUUID(),
        title: String(body.title || "Wochenplan").trim(),
        uploadedAt: new Date().toISOString(),
        publishedAt: "",
        range: planRange(shifts),
        issues: shiftIssues(shifts),
        seenEmployees: Array.from(new Set((body.seenEmployees || []).map(normalizeName).filter(Boolean))),
        shifts
      };
      db.plans.unshift(plan);
      await writeDb(db);
      return json(res, 200, { ok: true, plan: publicPlan(plan), newPins });
    }

    if (pathname.match(/^\/api\/admin\/plans\/[^/]+\/publish$/) && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const id = decodeURIComponent(pathname.split("/")[4]);
      const db = await readDb();
      const plan = db.plans.find(item => item.id === id);
      if (!plan) return json(res, 404, { error: "Plan nicht gefunden." });
      const ids = publishedIds(db);
      if (!ids.includes(id)) ids.unshift(id);
      setPublishedIds(db, ids);
      plan.publishedAt = new Date().toISOString();
      const push = await sendPlanPush(db, plan);
      await writeDb(db);
      return json(res, 200, { ok: true, plan: publicPlan(plan, { isPublished: true }), push });
    }

    if (pathname.match(/^\/api\/admin\/plans\/[^/]+\/unpublish$/) && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const id = decodeURIComponent(pathname.split("/")[4]);
      const db = await readDb();
      setPublishedIds(db, publishedIds(db).filter(item => item !== id));
      await writeDb(db);
      return json(res, 200, { ok: true });
    }

    if (pathname.match(/^\/api\/admin\/plans\/[^/]+$/) && req.method === "GET") {
      if (!requireAdmin(req, res)) return;
      const id = decodeURIComponent(pathname.split("/").pop());
      const db = await readDb();
      const plan = db.plans.find(item => item.id === id);
      if (!plan) return json(res, 404, { error: "Plan nicht gefunden." });
      const displayShifts = cleanedDisplayShifts(plan.shifts || []);
      const issues = shiftIssues(displayShifts);
      return json(res, 200, {
        plan: publicPlan(plan, { isPublished: publishedIds(db).includes(plan.id) }),
        shifts: displayShifts,
        issues,
        missingEmployees: missingEmployeesForPlan(db, plan)
      });
    }

    if (pathname.startsWith("/api/admin/plans/") && req.method === "DELETE") {
      if (!requireAdmin(req, res)) return;
      const id = decodeURIComponent(pathname.split("/").pop());
      const db = await readDb();
      db.plans = db.plans.filter(plan => plan.id !== id);
      setPublishedIds(db, publishedIds(db).filter(item => item !== id));
      await writeDb(db);
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/me/shifts" && req.method === "GET") {
      const name = requireEmployee(req, res);
      if (!name) return;
      const db = await readDb();
      const ids = publishedIds(db);
      const teamView = canSeeTeamPlan(name);
      const plans = db.plans
        .filter(plan => ids.includes(plan.id))
        .map(plan => ({
          id: plan.id,
          title: plan.title,
          uploadedAt: plan.uploadedAt,
          publishedAt: plan.publishedAt || "",
          range: plan.range || planRange(cleanedDisplayShifts(plan.shifts || [])),
          shifts: teamView ? cleanedDisplayShifts(plan.shifts || []) : cleanedDisplayShifts(plan.shifts || []).filter(shift => employeeKey(shift.name) === employeeKey(name))
        }))
        .sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
      return json(res, 200, { name, teamView, plans });
    }

    json(res, 404, { error: "Nicht gefunden." });
  } catch (error) {
    json(res, 500, { error: error.message || "Fehler." });
  }
}

function serveStatic(req, res, pathname) {
  const file = pathname === "/" ? "index.html" : pathname.slice(1);
  const safe = path.normalize(file).replace(/^(\.\.[/\\])+/, "");
  const full = path.join(PUBLIC_DIR, safe);
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return res.end("Nicht gefunden");
  }
  res.writeHead(200, { "content-type": MIME[path.extname(full)] || "application/octet-stream" });
  fs.createReadStream(full).pipe(res);
}

ensureDb().catch(error => {
  console.error(error);
  process.exit(1);
});

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url.pathname);
  serveStatic(req, res, url.pathname);
}).listen(PORT, () => {
  console.log(`Arbeitsplan-App laeuft auf http://localhost:${PORT}`);
});










