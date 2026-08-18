const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const SESSION_SECRET_FILE = path.join(DATA_DIR, ".session-secret");
const DATABASE_URL = process.env.DATABASE_URL || "";
const SESSION_SECRET = process.env.SESSION_SECRET || readOrCreateSessionSecret();
const PUBLIC_DIR = path.join(__dirname, "public");
const BUILD_VERSION = "backshop-kpi-automation-20260818-v1";
const CRON_SECRET = process.env.CRON_SECRET || "";
const DEFAULT_GMX_EMAIL = process.env.GMX_EMAIL || "edemircan@gmx.net";
const REVENUE_REPORT_SENDER = String(process.env.REVENUE_REPORT_SENDER || "NoReplyBerichtsexport@edeka.de").trim().toLowerCase();
const REVENUE_REPORT_PREFIX = String(process.env.REVENUE_REPORT_PREFIX || "Umsatz_8453700_").trim().toLowerCase();
const REVENUE_IMPORT_INTERVAL_MS = 2 * 60 * 1000;
// Keep the original key pair as a compatibility fallback so existing devices
// continue receiving push messages until Render environment values are set.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BGl8Kj0c9KZ2Ek7WKG3QjvWKiY2NWp6A-uSc2Iz4OlDGA51abixHEPKVl638OR_5W8Y1A96txs-ZCXlzTsDuBzE";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "mW6Xe15oKonHIx5-6jn8oVxkkOtxw4rmOOfTDCDcK6s";
const PUSH_CONTACT = process.env.PUSH_CONTACT || "mailto:admin@example.com";
let pgPool = null;
let webPush = null;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && PUSH_CONTACT) {
  try {
    webPush = require("web-push");
    webPush.setVapidDetails(PUSH_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch {
    webPush = null;
  }
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
  return {
    employees: {}, plans: [], publishedPlanIds: [], pushSubscriptions: [], pepCorrections: [],
    revenueEntries: [], produceRevenueEntries: [], produceArticleEntries: [], backshopRevenueEntries: [], backshopArticleEntries: [],
    revenueSettings: {}, revenueImport: { processedMessageIds: [] }
  };
}

function readOrCreateSessionSecret() {
  if (DATABASE_URL) {
    return crypto.createHash("sha256").update(`pep-planer-session:${DATABASE_URL}`).digest("hex");
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(SESSION_SECRET_FILE)) {
      const existing = fs.readFileSync(SESSION_SECRET_FILE, "utf8").trim();
      if (existing.length >= 32) return existing;
    }
    const secret = crypto.randomBytes(32).toString("base64url");
    fs.writeFileSync(SESSION_SECRET_FILE, secret, { mode: 0o600 });
    return secret;
  } catch {
    return crypto.randomBytes(32).toString("base64url");
  }
}

function normalizeDb(db) {
  const clean = db && typeof db === "object" ? db : defaultDb();
  clean.employees = clean.employees && typeof clean.employees === "object" ? clean.employees : {};
  clean.plans = Array.isArray(clean.plans) ? clean.plans : [];
  clean.publishedPlanIds = Array.isArray(clean.publishedPlanIds) ? clean.publishedPlanIds : [];
  clean.pushSubscriptions = Array.isArray(clean.pushSubscriptions) ? clean.pushSubscriptions : [];
  clean.pepCorrections = Array.isArray(clean.pepCorrections) ? clean.pepCorrections : [];
  clean.revenueEntries = Array.isArray(clean.revenueEntries) ? clean.revenueEntries : [];
  clean.produceRevenueEntries = Array.isArray(clean.produceRevenueEntries) ? clean.produceRevenueEntries : [];
  clean.produceArticleEntries = Array.isArray(clean.produceArticleEntries) ? clean.produceArticleEntries : [];
  clean.backshopRevenueEntries = Array.isArray(clean.backshopRevenueEntries) ? clean.backshopRevenueEntries : [];
  clean.backshopArticleEntries = Array.isArray(clean.backshopArticleEntries) ? clean.backshopArticleEntries : [];
  clean.revenueSettings = clean.revenueSettings && typeof clean.revenueSettings === "object" ? clean.revenueSettings : {};
  clean.revenueImport = clean.revenueImport && typeof clean.revenueImport === "object" ? clean.revenueImport : {};
  clean.revenueImport.processedMessageIds = Array.isArray(clean.revenueImport.processedMessageIds) ? clean.revenueImport.processedMessageIds : [];
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
  cleanupPepCorrections(db);
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
  return normalizeName(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function looseEmployeeKey(name) {
  return normalizeName(name)
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .replace(/[^a-z0-9,\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameInputVariants(name) {
  const value = normalizeName(name);
  const variants = [value];
  if (value.includes(",")) {
    const [last, first] = value.split(",").map(part => part.trim());
    if (last && first) variants.push(`${first} ${last}`);
  } else {
    const parts = value.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      const last = parts.slice(1).join(" ");
      const first = parts[0];
      variants.push(`${last}, ${first}`);
    }
  }
  return Array.from(new Set(variants.filter(Boolean)));
}

function employeeKeyVariants(name) {
  return new Set(nameInputVariants(name).flatMap(variant => [employeeKey(variant), looseEmployeeKey(variant)]));
}

function employeeNameMatches(first, second) {
  const targetKeys = employeeKeyVariants(second);
  return nameInputVariants(first).some(variant =>
    targetKeys.has(employeeKey(variant)) || targetKeys.has(looseEmployeeKey(variant))
  );
}

function employeeMatchesKeySet(name, targetKeys) {
  if (!targetKeys) return true;
  return Array.from(employeeKeyVariants(name)).some(key => targetKeys.has(key));
}

function employeeKeysForNames(names) {
  const keys = new Set();
  for (const name of names || []) {
    for (const key of employeeKeyVariants(name)) keys.add(key);
  }
  return keys;
}

function findEmployeeByName(db, name) {
  const direct = db.employees?.[employeeKey(name)];
  if (direct) return direct;
  return Object.values(db.employees || {}).find(employee => employeeNameMatches(employee.name, name));
}

function ensureEmployeeRecord(db, name, newPins = null) {
  const cleanName = normalizeName(name);
  if (!cleanName || isSuspiciousName(cleanName)) return false;
  db.employees = db.employees && typeof db.employees === "object" ? db.employees : {};
  if (findEmployeeByName(db, cleanName)) return false;
  const pin = generatePin();
  db.employees[employeeKey(cleanName)] = { name: cleanName, pinHash: hashPin(pin), initialPin: pin };
  if (Array.isArray(newPins)) newPins.push({ name: cleanName, pin });
  return true;
}

function ensureEmployeesFromPlans(db) {
  let changed = false;
  for (const plan of db.plans || []) {
    for (const shift of plan.shifts || []) {
      if (ensureEmployeeRecord(db, shift.name)) changed = true;
    }
    for (const name of plan.seenEmployees || []) {
      if (ensureEmployeeRecord(db, name)) changed = true;
    }
  }
  return changed;
}

function allKnownEmployeeNames(db) {
  const names = new Set();
  for (const employee of Object.values(db.employees || {})) {
    const name = normalizeName(employee.name);
    if (name) names.add(name);
  }
  for (const plan of db.plans || []) {
    for (const shift of plan.shifts || []) {
      const name = normalizeName(shift.name);
      if (name && !isSuspiciousName(name)) names.add(name);
    }
    for (const nameValue of plan.seenEmployees || []) {
      const name = normalizeName(nameValue);
      if (name && !isSuspiciousName(name)) names.add(name);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, "de"));
}

function resolveKnownEmployeeName(db, value) {
  const clean = normalizeName(value);
  if (!clean) return "";
  const found = findEmployeeByName(db, clean);
  if (found?.name) return found.name;
  if (!isSuspiciousName(clean)) return clean;

  const target = looseEmployeeKey(clean).replace(/,/g, "").trim();
  if (!target) return clean;
  const matches = allKnownEmployeeNames(db).filter(name => {
    const loose = looseEmployeeKey(name);
    const last = loose.split(",")[0].trim();
    return last === target || loose.replace(/,/g, " ").split(/\s+/).includes(target);
  });
  return matches.length === 1 ? matches[0] : clean;
}

function initialsFromName(name) {
  const value = normalizeName(name).normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const parts = value.includes(",")
    ? value.split(",").map(part => part.trim())
    : value.split(/\s+/).filter(Boolean).reverse();
  const last = parts[0] || "";
  const first = parts[1] || "";
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "AD";
}

function canSeeTeamPlan(name) {
  return teamLeadershipNames().some(leader => employeeNameMatches(leader, name));
}

function canSeeRevenue(name) {
  return canSeeTeamPlan(name);
}

function canSeePrivateRevenueInsights(name) {
  return employeeNameMatches("Demircan, Emirkan", name);
}

function canManagePlans(name) {
  return employeeNameMatches("Demircan, Emirkan", name);
}

function teamLeadershipNames() {
  return [
    "Demircan, Emirkan",
    "Brockling, Angelina",
    "Konxheli, Dafina",
    "Konxhelli, Blerina",
    "Hammer, Pascal",
    "Rode, Joanna"
  ];
}

function parseGermanDate(value) {
  const match = String(value || "").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function formatGermanDate(date) {
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function weekdayShort(date) {
  if (!date) return "";
  return ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][date.getDay()] || "";
}

function weekdayLong(date) {
  if (!date) return "";
  return ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][date.getDay()] || "";
}

function planRange(shifts) {
  const dates = shifts.map(shift => parseGermanDate(shift.date)).filter(Boolean).sort((a, b) => a - b);
  if (!dates.length) return "";
  return `${formatGermanDate(dates[0])} bis ${formatGermanDate(dates[dates.length - 1])}`;
}

function datesFromRangeText(range) {
  const matches = Array.from(String(range || "").matchAll(/(\d{1,2}\.\d{1,2}\.\d{4})/g))
    .map(match => parseGermanDate(match[1]))
    .filter(Boolean);
  if (!matches.length) return [];
  const start = matches[0];
  const end = matches[1] || matches[0];
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(formatGermanDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function datesFromPlan(plan) {
  const rangeDates = datesFromRangeText(plan?.range || "");
  if (rangeDates.length) return rangeDates;
  return Array.from(new Set((plan?.shifts || []).map(shift => shift.date).filter(Boolean)))
    .sort((a, b) => parseGermanDate(a) - parseGermanDate(b));
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

function readCookie(req, cookieName = "plan_session") {
  const found = String(req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`));
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
  const cookieName = payload?.role === "admin" ? "plan_admin_session" : "plan_employee_session";
  res.setHeader("set-cookie", `${cookieName}=${createCookie(payload)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`);
}

function clearSession(res) {
  res.setHeader("set-cookie", [
    "plan_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
    "plan_employee_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
    "plan_admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
  ]);
}

function requireAdmin(req, res) {
  const adminSession = readCookie(req, "plan_admin_session") || readCookie(req);
  if (adminSession?.role === "admin") return true;
  const employeeSession = readCookie(req, "plan_employee_session") || readCookie(req);
  if (employeeSession?.role === "employee" && canManagePlans(employeeSession.name)) return true;
  json(res, 401, { error: "Nicht angemeldet." });
  return false;
}

function requireEmployee(req, res) {
  const session = readCookie(req, "plan_employee_session") || readCookie(req);
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

function breakToMinutes(value) {
  if (!isTime(value)) return 0;
  return timeToMinutes(value);
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
  return Array.from(groups.values()).flatMap(group => removeSummaryRanges(group));
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
  return /\b(frei|urlaub|krank|krankheit|abwesenheit|sonderurlaub|seminar)\b/i.test(`${shift.department || ""} ${shift.start || ""} ${shift.end || ""}`);
}

function isProbearbeitenShift(shift) {
  return /probearbeit/i.test(String(shift?.department || ""));
}

function cleanShift(shift) {
  return {
    name: normalizeName(shift.name),
    date: String(shift.date || "").trim(),
    start: normalizeTimeValue(shift.start),
    end: normalizeTimeValue(shift.end),
    department: String(shift.department || "").trim(),
    break: String(shift.break || "").trim()
  };
}

function applyDailyBreaks(shifts) {
  const groups = new Map();
  for (const shift of shifts || []) {
    if (isStatusShift(shift)) continue;
    const key = `${employeeKey(shift.name)}|${shift.date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(shift);
  }

  for (const dayShifts of groups.values()) {
    const sorted = dayShifts
      .filter(shift => isTime(shift.start) && isTime(shift.end))
      .sort((a, b) => timeToMinutesSafe(a.start) - timeToMinutesSafe(b.start));
    if (!sorted.length) continue;

    const legalMinutes = legalBreakMinutes(totalDurationMinutes(sorted));
    const existingMinutes = Math.max(0, ...sorted.map(shift => breakToMinutes(shift.break)));
    const breakMinutes = Math.max(legalMinutes, existingMinutes);
    if (!breakMinutes) continue;

    const target = sorted.find(shift => breakToMinutes(shift.break)) || sorted[0];
    for (const shift of sorted) {
      shift.break = shift === target ? minutesToBreak(breakMinutes) : "";
    }
  }
  return shifts;
}

function ensureLegalBreaksInPlans(db) {
  let changed = false;
  for (const plan of db.plans || []) {
    const before = JSON.stringify((plan.shifts || []).map(shift => shift.break || ""));
    plan.shifts = applyDailyBreaks(plan.shifts || []);
    const after = JSON.stringify((plan.shifts || []).map(shift => shift.break || ""));
    if (before !== after) {
      plan.updatedAt = plan.updatedAt || new Date().toISOString();
      changed = true;
    }
  }
  return changed;
}

function applyLegalBreakForManualDay(shifts, name, date) {
  const dayShifts = (shifts || [])
    .filter(shift => employeeKey(shift.name) === employeeKey(name) && String(shift.date || "") === String(date || ""))
    .filter(shift => !isStatusShift(shift))
    .sort((a, b) => timeToMinutesSafe(a.start) - timeToMinutesSafe(b.start));
  if (!dayShifts.length) return;

  const legalMinutes = legalBreakMinutes(totalDurationMinutes(dayShifts));
  if (!legalMinutes) return;

  const existingMinutes = Math.max(0, ...dayShifts.map(shift => breakToMinutes(shift.break)));
  const breakMinutes = Math.max(legalMinutes, existingMinutes);
  const target = dayShifts.find(shift => breakToMinutes(shift.break)) || dayShifts[0];

  for (const shift of dayShifts) {
    shift.break = shift === target ? minutesToBreak(breakMinutes) : "";
  }
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
  if (badNames.length) return `${badNames.length} Mitarbeiter-Name wirkt abgeschnitten. Bitte aus der Mitarbeiterliste den kompletten Namen waehlen, z. B. Nachname, Vorname. Beispiel: ${badNames[0].name || "Name fehlt"}`;
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

function rangeKeyFromRange(range) {
  const matches = Array.from(String(range || "").matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g)).map(match => formatGermanDate(parseGermanDate(match[0])));
  return matches.length ? matches.join("|") : "";
}

function isoWeekKey(date) {
  if (!date) return "";
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = current.getDay() || 7;
  current.setDate(current.getDate() + 4 - day);
  const yearStart = new Date(current.getFullYear(), 0, 1);
  const week = Math.ceil((((current - yearStart) / 86400000) + 1) / 7);
  return `${current.getFullYear()}-${String(week).padStart(2, "0")}`;
}

function weekKeyFromRange(range) {
  const firstDate = String(range || "").match(/(\d{1,2}\.\d{1,2}\.\d{4})/)?.[1];
  return isoWeekKey(parseGermanDate(firstDate));
}

function rangeKeyFromShifts(shifts) {
  return rangeKeyFromRange(planRange(shifts));
}

function matchingPlans(db, rangeKey, excludeId = "") {
  if (!rangeKey) return [];
  return (db.plans || []).filter(plan => {
    if (plan.id === excludeId) return false;
    const planRangeText = plan.range || planRange(plan.shifts || []);
    return rangeKeyFromRange(planRangeText) === rangeKey;
  });
}

function latestPublishedMatchingPlan(db, rangeKey) {
  const ids = publishedIds(db);
  return matchingPlans(db, rangeKey)
    .filter(plan => ids.includes(plan.id))
    .sort((a, b) => new Date(b.publishedAt || b.uploadedAt || 0) - new Date(a.publishedAt || a.uploadedAt || 0))[0] || null;
}

function latestMatchingPlan(db, rangeKey) {
  return matchingPlans(db, rangeKey)
    .sort((a, b) => new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0))[0] || null;
}

function nextPlanVersion(db, rangeKey) {
  const versions = matchingPlans(db, rangeKey).map(plan => Number(plan.version || 1)).filter(Number.isFinite);
  return Math.max(0, ...versions) + 1;
}

function daySignatureItems(shifts) {
  return (shifts || [])
    .map(shift => cleanShift(shift))
    .map(shift => ({
      name: shift.name,
      date: shift.date,
      start: shift.start,
      end: shift.end,
      department: shift.department,
      break: shift.break
    }))
    .sort((a, b) => timeToMinutesSafe(a.start) - timeToMinutesSafe(b.start) || a.department.localeCompare(b.department, "de"));
}

function daySignature(shifts) {
  return daySignatureItems(shifts).map(shift => `${shift.start}-${shift.end}|${shift.department}|${shift.break}`).join(" / ");
}

function changeGroupKey(shift) {
  return `${employeeKey(shift.name)}|${shift.date}`;
}

function comparePlans(basePlan, newShifts) {
  if (!basePlan) return [];
  const before = cleanedDisplayShifts(basePlan.shifts || []);
  const after = cleanedDisplayShifts(newShifts || []);
  const beforeMap = new Map();
  const afterMap = new Map();
  for (const shift of before) {
    const key = changeGroupKey(shift);
    if (!beforeMap.has(key)) beforeMap.set(key, []);
    beforeMap.get(key).push(shift);
  }
  for (const shift of after) {
    const key = changeGroupKey(shift);
    if (!afterMap.has(key)) afterMap.set(key, []);
    afterMap.get(key).push(shift);
  }

  const keys = Array.from(new Set([...beforeMap.keys(), ...afterMap.keys()])).sort();
  return keys.flatMap(key => {
    const oldItems = beforeMap.get(key) || [];
    const newItems = afterMap.get(key) || [];
    const sample = newItems[0] || oldItems[0] || {};
    const oldText = daySignature(oldItems);
    const newText = daySignature(newItems);
    if (oldText === newText) return [];
    const type = oldItems.length && newItems.length ? "changed" : oldItems.length ? "removed" : "added";
    return [{
      type,
      name: sample.name || "",
      date: sample.date || "",
      before: oldText || "Keine Schicht",
      after: newText || "Keine Schicht"
    }];
  });
}

function changesForEmployee(plan, name) {
  const key = employeeKey(name);
  return (plan.changes || []).filter(change => employeeKey(change.name) === key);
}

function correctionKey(planId, change) {
  return `${planId}|${employeeKey(change.name)}|${change.date}|${change.type}|${change.before}|${change.after}`;
}

function changeFromShifts(before, after, source = "Import", editorName = "") {
  return {
    type: before && after ? "changed" : before ? "removed" : "added",
    source,
    editorName: normalizeName(editorName),
    editorInitials: editorName ? initialsFromName(editorName) : "",
    createdAt: new Date().toISOString(),
    name: (after || before)?.name || "",
    date: (after || before)?.date || "",
    before: before ? daySignature([before]) : "Keine Schicht",
    after: after ? daySignature([after]) : "Keine Schicht"
  };
}

function sameChange(left, right) {
  return employeeKey(left?.name) === employeeKey(right?.name)
    && String(left?.date || "") === String(right?.date || "")
    && String(left?.type || "") === String(right?.type || "")
    && String(left?.before || "") === String(right?.before || "")
    && String(left?.after || "") === String(right?.after || "")
    && String(left?.createdAt || "") === String(right?.createdAt || "");
}

function createPepCorrections(db, plan) {
  const existing = new Set((db.pepCorrections || []).map(item => item.key).filter(Boolean));
  const createdAt = new Date().toISOString();
  const corrections = (plan.changes || []).map(change => {
    const key = correctionKey(plan.id, change);
    return {
      id: crypto.randomUUID(),
      key,
      planId: plan.id,
      planTitle: plan.title,
      range: plan.range,
      type: change.type,
      name: change.name,
      date: change.date,
      before: change.before,
      after: change.after,
      source: change.source || "Import",
      editorName: change.editorName || "",
      editorInitials: change.editorInitials || "",
      createdAt,
      done: false,
      doneAt: ""
    };
  }).filter(item => !existing.has(item.key));
  db.pepCorrections = [...corrections, ...(db.pepCorrections || [])];
  return corrections;
}

function createManualPepCorrection(db, plan, change) {
  const key = correctionKey(plan.id, change);
  const existing = (db.pepCorrections || []).some(item => item.key === key);
  if (existing) return null;
  const correction = {
    id: crypto.randomUUID(),
    key,
    planId: plan.id,
    planTitle: plan.title,
    range: plan.range,
    type: change.type,
    source: "Haendisch",
    name: change.name,
    date: change.date,
    before: change.before,
    after: change.after,
    editorName: change.editorName || "",
    editorInitials: change.editorInitials || "",
    createdAt: new Date().toISOString(),
    done: false,
    doneAt: ""
  };
  db.pepCorrections = [correction, ...(db.pepCorrections || [])];
  return correction;
}

function cleanupPepCorrections(db) {
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  db.pepCorrections = (db.pepCorrections || []).filter(item => {
    if (!item.done) return true;
    const doneAt = new Date(item.doneAt || 0).getTime();
    return !Number.isFinite(doneAt) || doneAt >= cutoff;
  });
}

function publicPepCorrections(db) {
  cleanupPepCorrections(db);
  return (db.pepCorrections || []).slice().sort((a, b) => {
    if (Boolean(a.done) !== Boolean(b.done)) return a.done ? 1 : -1;
    const byDate = parseGermanDate(a.date) - parseGermanDate(b.date);
    if (byDate) return byDate;
    return a.name.localeCompare(b.name, "de");
  });
}

function publicPlan(plan, extra = {}) {
  const shifts = cleanedDisplayShifts(plan.shifts || []);
  const issues = shiftIssues(shifts);
  return {
    id: plan.id,
    title: plan.title,
    uploadedAt: plan.uploadedAt,
    publishedAt: plan.publishedAt || "",
    updatedAt: plan.updatedAt || plan.uploadedAt,
    version: Number(plan.version || 1),
    basePlanId: plan.basePlanId || "",
    changeCount: Array.isArray(plan.changes) ? plan.changes.length : 0,
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

function validNotifyMode(mode) {
  return ["all", "affected", "leadership", "selected_leadership", "affected_leadership", "none"].includes(mode);
}

function sanitizePushMessage(value) {
  return normalizeName(value).slice(0, 180);
}

function departmentFromSignature(value) {
  return String(value || "")
    .split("/")
    .map(part => part.split("|")[1] || "")
    .map(part => part.trim())
    .filter(Boolean);
}

function changedDepartmentText(plan, targetNames = null) {
  const targetKeys = Array.isArray(targetNames) && targetNames.length
    ? employeeKeysForNames(targetNames)
    : null;
  const departments = [];
  for (const change of plan.changes || []) {
    if (!employeeMatchesKeySet(change.name, targetKeys)) continue;
    departments.push(...departmentFromSignature(change.after));
    departments.push(...departmentFromSignature(change.before));
  }
  return Array.from(new Set(departments))
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
}

function compactShiftSignature(value) {
  const text = String(value || "").trim();
  if (!text || text === "Keine Schicht") return "Keine Schicht";
  return text
    .replace(/\|/g, " ")
    .replace(/\s*\/\s*/g, " + ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);
}

function firstShiftFromSignature(value) {
  const part = String(value || "").split("/")[0] || "";
  const [timeRange = "", department = "", pause = ""] = part.split("|").map(item => item.trim());
  const [start = "", end = ""] = timeRange.split("-").map(item => item.trim());
  return { start, end, department, pause };
}

function formatProbePushBody(change) {
  if (!change || change.type !== "added") return "";
  const shift = firstShiftFromSignature(change.after);
  if (!isProbearbeitenShift(shift)) return "";
  const date = parseGermanDate(change.date);
  const day = weekdayLong(date);
  const pause = shift.pause ? ` ${shift.pause}` : "";
  return `${day ? `${day}, ` : ""}${change.date}: ${change.name}: ${shift.start} Uhr - ${shift.end} Uhr ${shift.department}${pause}`;
}

function relevantPushChange(plan, targetNames = null) {
  const targetKeys = Array.isArray(targetNames) && targetNames.length
    ? employeeKeysForNames(targetNames)
    : null;
  return (plan.changes || []).find(change => employeeMatchesKeySet(change.name, targetKeys)) || (plan.changes || [])[0] || null;
}

function defaultPushBody(plan, targetNames = null) {
  const change = relevantPushChange(plan, targetNames);
  if (!change) return `${plan.title || "Ein neuer Plan"} wurde veroeffentlicht.`;
  const probeBody = formatProbePushBody(change);
  if (probeBody) return probeBody;
  const date = parseGermanDate(change.date);
  const day = weekdayShort(date);
  const editor = change.editorInitials ? ` (${change.editorInitials})` : "";
  return `${day ? `${day} ` : ""}${change.date}: ${change.name}${editor} - Alt: ${compactShiftSignature(change.before)} | Neu: ${compactShiftSignature(change.after)}`;
}

function pushTargetKeys(plan, mode, targetNames = null) {
  const sourceNames = Array.isArray(targetNames) && targetNames.length
    ? targetNames
    : (plan.changes || []).map(change => change.name);
  const changedNames = employeeKeysForNames(sourceNames);
  if (mode === "affected_leadership") {
    return new Set([...changedNames, ...employeeKeysForNames(teamLeadershipNames())]);
  }
  if (mode === "leadership") return employeeKeysForNames(teamLeadershipNames());
  if (mode === "affected" || (mode === "auto" && changedNames.size)) return changedNames;
  return null;
}

async function sendPlanPush(db, plan, mode = "auto", targetNames = null, options = {}) {
  if (!webPush) return { sent: 0, removed: 0, failed: 0, skipped: true, mode, reason: "Push ist bei Render nicht eingerichtet." };
  if (!Array.isArray(db.pushSubscriptions) || !db.pushSubscriptions.length) {
    return { sent: 0, removed: 0, failed: 0, skipped: true, mode, reason: "Keine Geraete haben Push aktiviert." };
  }
  const targetKeys = pushTargetKeys(plan, mode, targetNames);
  const subscriptions = targetKeys
    ? db.pushSubscriptions.filter(saved => employeeMatchesKeySet(saved.name, targetKeys))
    : db.pushSubscriptions;
  const hasChanges = Array.isArray(plan.changes) && plan.changes.length > 0;
  const customMessage = sanitizePushMessage(options.message || options.pushMessage || "");
  const appendMessage = sanitizePushMessage(options.appendMessage || options.pushAppendMessage || "");
  const customTitle = sanitizePushMessage(options.title || "");
  const defaultBody = hasChanges
    ? defaultPushBody(plan, targetNames)
    : `${plan.title || "Ein neuer Plan"} wurde veroeffentlicht.`;
  const body = customMessage || (appendMessage ? `${defaultBody} - ${appendMessage}` : defaultBody);

  const payload = JSON.stringify({
    title: customTitle || (customMessage ? "Arbeitsplan Info" : hasChanges ? "Planaenderung" : "Neuer Arbeitsplan online"),
    body,
    url: "/"
  });

  let sent = 0;
  let removed = 0;
  let failed = 0;
  const targetEndpoints = new Set(subscriptions.map(saved => (saved.subscription || saved).endpoint).filter(Boolean));
  const alive = db.pushSubscriptions.filter(saved => !targetEndpoints.has((saved.subscription || saved).endpoint));
  for (const saved of subscriptions) {
    try {
      await webPush.sendNotification(saved.subscription || saved, payload);
      sent += 1;
      alive.push(saved);
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        removed += 1;
      } else {
        failed += 1;
        alive.push(saved);
      }
    }
  }
  db.pushSubscriptions = alive;
  const reason = !sent && failed
    ? "Der Push-Dienst hat den Versand abgelehnt. VAPID-Schluessel und erneute Push-Aktivierung pruefen."
    : (!sent && subscriptions.length === 0 ? "Fuer diese Empfaengerauswahl ist kein Push-Geraet angemeldet." : "");
  return { sent, removed, failed, mode, reason, affected: targetKeys ? Array.from(targetKeys) : [] };
}

async function safeSendPlanPush(db, plan, mode = "auto", targetNames = null, options = {}) {
  try {
    return await sendPlanPush(db, plan, mode, targetNames, options);
  } catch (error) {
    return { sent: 0, removed: 0, failed: 1, skipped: true, mode, reason: "Push-Versand ist fehlgeschlagen.", error: error.message || "Push fehlgeschlagen" };
  }
}

function shouldNotifyOnPublish(db, plan) {
  if (!plan) return false;
  if (plan.uploadMode === "correction") return Array.isArray(plan.changes) && plan.changes.length > 0;
  const ids = publishedIds(db).filter(id => id !== plan.id);
  const rangeKey = rangeKeyFromRange(plan.range || planRange(plan.shifts || []));
  const alreadyPublishedSameWeek = matchingPlans(db, rangeKey, plan.id).some(item => ids.includes(item.id));
  return !alreadyPublishedSameWeek;
}

function defaultPublishNotifyMode(db, plan) {
  if (!shouldNotifyOnPublish(db, plan)) return "none";
  if (plan.uploadMode === "correction" && Array.isArray(plan.changes) && plan.changes.length) return "affected";
  return "all";
}

function publishNotifyMode(db, plan, requestedMode) {
  if (validNotifyMode(requestedMode)) return requestedMode;
  return defaultPublishNotifyMode(db, plan);
}

async function editPlanShift(db, planId, before, after, notifyMode = "affected", pushMessage = "", editorName = "", notifyNames = [], pushAppendMessage = "") {
  const addShift = !before && Boolean(after);
  const cleanBefore = addShift ? null : cleanShift(before || {});
  const deleteShift = !after;
  const cleanAfter = deleteShift ? null : cleanShift(after || {});
  if (cleanAfter) cleanAfter.name = resolveKnownEmployeeName(db, cleanAfter.name);
  if (cleanAfter && !cleanAfter.name) return { error: "Bitte Mitarbeiter auswaehlen.", status: 400 };
  if (!deleteShift) {
    const validationError = validateUploadedShifts([cleanAfter]);
    const allowedProbeName = isProbearbeitenShift(cleanAfter) && normalizeName(cleanAfter.name).length >= 3 && !isTime(cleanAfter.name);
    if (validationError && !(allowedProbeName && validationError.includes("Mitarbeiter-Name"))) {
      return { error: validationError, status: 400 };
    }
  }

  const plan = db.plans.find(item => item.id === planId);
  if (!plan) return { error: "Plan nicht gefunden.", status: 404 };

  plan.shifts = Array.isArray(plan.shifts) ? plan.shifts : [];
  const index = addShift ? -1 : plan.shifts.findIndex(shift =>
    employeeKey(shift.name) === employeeKey(cleanBefore.name) &&
    String(shift.date || "") === cleanBefore.date &&
    String(shift.start || "") === cleanBefore.start &&
    String(shift.end || "") === cleanBefore.end &&
    String(shift.department || "") === cleanBefore.department
  );
  if (!addShift && index < 0) return { error: "Schicht wurde im gespeicherten Plan nicht gefunden.", status: 404 };

  const oldShift = addShift ? null : cleanShift(plan.shifts[index]);
  if (addShift) {
    plan.shifts.push(cleanAfter);
  } else if (deleteShift) {
    plan.shifts.splice(index, 1);
  } else {
    plan.shifts[index] = cleanAfter;
  }
  if (cleanBefore) applyLegalBreakForManualDay(plan.shifts, cleanBefore.name, cleanBefore.date);
  if (cleanAfter) applyLegalBreakForManualDay(plan.shifts, cleanAfter.name, cleanAfter.date);
  plan.updatedAt = new Date().toISOString();
  plan.range = planRange(plan.shifts || []);
  const change = changeFromShifts(oldShift, cleanAfter, "Haendisch", editorName);
  plan.changes = [change, ...(plan.changes || [])];
  const correction = createManualPepCorrection(db, plan, change);
  const mode = validNotifyMode(notifyMode) ? notifyMode : "affected";
  let push = { sent: 0, removed: 0, skipped: true, mode };
  if (publishedIds(db).includes(plan.id) && mode !== "none") {
    if (mode === "selected_leadership") {
      const selectedNames = selectedLeadershipNames(notifyNames);
      push = selectedNames.length
        ? await safeSendPlanPush(db, plan, "affected", selectedNames, { pushMessage, pushAppendMessage })
        : { sent: 0, removed: 0, skipped: true, mode };
    } else {
      push = await safeSendPlanPush(db, plan, mode, [change.name], { pushMessage, pushAppendMessage });
    }
  }
  return { plan, correction, push };
}

function sickNotifyMode(mode) {
  return ["leadership", "selected_leadership", "none"].includes(mode) ? mode : "leadership";
}

function selectedLeadershipNames(names) {
  return (Array.isArray(names) ? names : [])
    .map(normalizeName)
    .filter(name => teamLeadershipNames().some(leader => employeeNameMatches(leader, name)));
}

function sickPushBody(name, dates, editorName = "") {
  const sortedDates = (dates || [])
    .map(value => ({ value, date: parseGermanDate(value) }))
    .filter(item => item.date)
    .sort((a, b) => a.date - b.date);
  const editor = editorName ? ` (${initialsFromName(editorName)})` : "";
  if (!sortedDates.length) return `${name}${editor} krank gemeldet.`;
  if (sortedDates.length === 1) {
    const item = sortedDates[0];
    return `Krankmeldung: ${name}${editor} ${weekdayShort(item.date)} ${item.value}`;
  }
  const first = sortedDates[0];
  const last = sortedDates[sortedDates.length - 1];
  return `Krankmeldung: ${name}${editor} ${weekdayShort(first.date)} ${first.value} bis ${weekdayShort(last.date)} ${last.value}`;
}

function sickPushMessageMatchesEmployee(message, name) {
  const haystack = looseEmployeeKey(message).replace(/,/g, " ");
  const parts = looseEmployeeKey(name).replace(/,/g, " ").split(/\s+/).filter(part => part.length > 1);
  return Boolean(parts.length && parts.every(part => haystack.includes(part)));
}

async function markEmployeeSick(db, planId, name, date, wholeWeek = false, notifyMode = "leadership", notifyNames = [], pushMessage = "", editorName = "") {
  const plan = db.plans.find(item => item.id === planId);
  if (!plan) return { error: "Plan nicht gefunden.", status: 404 };

  const cleanName = normalizeName(name);
  if (!cleanName) return { error: "Bitte Mitarbeiter auswaehlen.", status: 400 };

  const requestedDates = Array.isArray(date) ? date : [String(date || "").trim()];
  const targetDates = wholeWeek ? datesFromPlan(plan) : requestedDates;
  const validDates = targetDates.filter(Boolean);
  if (!validDates.length) return { error: "Bitte Datum auswaehlen.", status: 400 };

  plan.shifts = Array.isArray(plan.shifts) ? plan.shifts : [];
  const changes = [];

  for (const dateValue of validDates) {
    const beforeItems = plan.shifts
      .filter(shift => employeeKey(shift.name) === employeeKey(cleanName) && String(shift.date || "") === dateValue)
      .map(cleanShift);
    const sickShift = cleanShift({
      name: cleanName,
      date: dateValue,
      start: "00:00",
      end: "00:00",
      department: "Krankheit",
      break: ""
    });
    const beforeText = beforeItems.length ? daySignature(beforeItems) : "Keine Schicht";
    const afterText = daySignature([sickShift]) || "Keine Schicht";
    if (beforeText === afterText) continue;

    plan.shifts = plan.shifts.filter(shift =>
      !(employeeKey(shift.name) === employeeKey(cleanName) && String(shift.date || "") === dateValue)
    );
    plan.shifts.push(sickShift);
    changes.push({
      type: beforeItems.length ? "changed" : "added",
      source: "Haendisch",
      editorName: normalizeName(editorName),
      editorInitials: editorName ? initialsFromName(editorName) : "",
      createdAt: new Date().toISOString(),
      name: cleanName,
      date: dateValue,
      before: beforeText,
      after: afterText
    });
  }

  if (!changes.length) return { error: "Keine Aenderung: Mitarbeiter ist fuer diese Auswahl bereits krank eingetragen.", status: 400 };

  plan.updatedAt = new Date().toISOString();
  plan.range = planRange(plan.shifts || []);
  plan.changes = [...changes, ...(plan.changes || [])];
  const corrections = changes.map(change => createManualPepCorrection(db, plan, change)).filter(Boolean);

  const mode = sickNotifyMode(notifyMode);
  const standardNotificationText = sickPushBody(cleanName, validDates, editorName);
  const requestedNotificationText = sanitizePushMessage(pushMessage);
  // A sick route must never emit a stale normal plan-change message. Custom
  // text remains possible, but only when it clearly belongs to this employee.
  const notificationText = requestedNotificationText && sickPushMessageMatchesEmployee(requestedNotificationText, cleanName)
    ? requestedNotificationText
    : standardNotificationText;
  let push = { sent: 0, removed: 0, skipped: true, mode };
  if (publishedIds(db).includes(plan.id) && mode !== "none") {
    if (mode === "selected_leadership") {
      const selectedNames = selectedLeadershipNames(notifyNames);
      push = selectedNames.length
        ? await sendPlanPush(db, plan, "affected", selectedNames, { title: "Krankmeldung", pushMessage: notificationText })
        : { sent: 0, removed: 0, skipped: true, mode };
    } else {
      push = await sendPlanPush(db, plan, "leadership", null, { title: "Krankmeldung", pushMessage: notificationText });
    }
  }

  return { plan, corrections, push };
}

function revenueSecretKey() {
  return crypto.createHash("sha256").update(`pep-revenue:${SESSION_SECRET}`).digest();
}

function encryptRevenueSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", revenueSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(item => item.toString("base64url")).join(".");
}

function decryptRevenueSecret(value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 3) return "";
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", revenueSecretKey(), Buffer.from(parts[0], "base64url"));
    decipher.setAuthTag(Buffer.from(parts[1], "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(parts[2], "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

function revenueCredentials(db) {
  const settings = db.revenueSettings || {};
  return {
    email: String(settings.email || DEFAULT_GMX_EMAIL).trim(),
    password: process.env.GMX_APP_PASSWORD || decryptRevenueSecret(settings.passwordEncrypted),
    marketCode: String(settings.marketCode || "802163").trim()
  };
}

function publicRevenueState(db) {
  const credentials = revenueCredentials(db);
  const settings = db.revenueSettings || {};
  const state = db.revenueImport || {};
  // Older app versions could store an Obst-&-Gemüse market report in the
  // Gesamtmarkt collection. Exclude those exact duplicates so an Obst value
  // can never appear as the total-market value or produce a false 100% share.
  const produceEntryKeys = new Set((db.produceRevenueEntries || []).map(item =>
    `${item.date}|${item.marketCode}|${Math.round((Number(item.revenue) || 0) * 100)}`
  ));
  const departmentEntryKeys = new Set([
    ...produceEntryKeys,
    ...(db.backshopRevenueEntries || []).map(item => `${item.date}|${item.marketCode}|${Math.round((Number(item.revenue) || 0) * 100)}`)
  ]);
  const allEntries = (db.revenueEntries || []).filter(item => !departmentEntryKeys.has(
    `${item.date}|${item.marketCode}|${Math.round((Number(item.revenue) || 0) * 100)}`
  ));
  const entries = allEntries
    .filter(item => String(item.marketCode) === String(credentials.marketCode))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 400);
  const latestDate = entries[0]?.date || allEntries.map(item => item.date).sort().pop() || "";
  const comparison = allEntries
    .filter(item => item.date === latestDate)
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
  return {
    settings: {
      email: credentials.email,
      marketCode: credentials.marketCode,
      configured: Boolean(credentials.email && credentials.password)
    },
    importStatus: {
      lastRunAt: state.lastRunAt || "",
      lastSuccessAt: state.lastSuccessAt || "",
      lastError: state.lastError || "",
      lastResult: state.lastResult || ""
    },
    entries,
    comparison,
    latestDate,
    produce: publicDepartmentRevenueState(db, "produce"),
    backshop: publicDepartmentRevenueState(db, "backshop")
  };
}

function leadershipRevenueState(db) {
  const revenue = publicRevenueState(db);
  return {
    entries: revenue.entries,
    comparison: revenue.comparison,
    latestDate: revenue.latestDate,
    lastSuccessAt: revenue.importStatus.lastSuccessAt || "",
    produce: revenue.produce,
    backshop: revenue.backshop
  };
}

function publicDepartmentRevenueState(db, department = "produce") {
  const marketCode = revenueCredentials(db).marketCode;
  const revenueCollection = department === "backshop" ? db.backshopRevenueEntries : db.produceRevenueEntries;
  const articleCollection = department === "backshop" ? db.backshopArticleEntries : db.produceArticleEntries;
  const allEntries = (revenueCollection || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const allArticleEntries = (articleCollection || [])
    .filter(item => String(item.marketCode) === String(marketCode))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const articlesByDate = new Map(allArticleEntries.map(item => [String(item.date), item]));
  const entries = allEntries.filter(item => String(item.marketCode) === String(marketCode)).slice(0, 400).map(item => {
    const detail = articlesByDate.get(String(item.date));
    if (!detail) return item;
    return {
      ...item,
      revenue: detail.revenue ?? item.revenue,
      priorYearRevenue: detail.priorYearRevenue ?? item.priorYearRevenue,
      priorYearDeviationPercent: percentageDeviation(detail.revenue ?? item.revenue, detail.priorYearRevenue ?? item.priorYearRevenue),
      grossMarginPercent: detail.grossMarginPercent ?? item.grossMarginPercent,
      netMarginPercent: detail.netMarginPercent ?? item.netMarginPercent,
      writeOffsGross: detail.writeOffsGross ?? item.writeOffsGross,
      priorYearWriteOffsGross: detail.priorYearWriteOffsGross ?? item.priorYearWriteOffsGross
    };
  });
  const latestDate = entries[0]?.date || allEntries[0]?.date || "";
  const latestDateValue = latestDate ? new Date(`${latestDate}T12:00:00`).getTime() : 0;
  const historyStart = latestDateValue ? new Date(latestDateValue - 40 * 86400000).toISOString().slice(0, 10) : "";
  const comparisonEntries = allEntries.filter(item => !historyStart || String(item.date) >= historyStart);
  const articleEntries = allArticleEntries.filter(item => !historyStart || String(item.date) >= historyStart);
  return { entries, comparisonEntries, articleEntries, latestDate };
}

function excelDateText(value) {
  const match = String(value || "").match(/AJ:\s*(\d{1,2}\.\d{1,2}\.\d{4})/i)
    || String(value || "").match(/(\d{1,2}\.\d{1,2}\.\d{4})/);
  if (!match) return "";
  const [day, month, year] = match[1].split(".");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function revenueNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

const MARKET_CODES_BY_NUMBER = {
  "03": "801514", "04": "801820", "06": "802170", "14": "802163", "15": "802276",
  "16": "802162", "17": "801482", "18": "802323", "21": "801484", "23": "802325",
  "26": "801470", "27": "802324", "35": "802322", "40": "802161", "41": "407092",
  "55": "801393", "74": "802171", "79": "407091"
};

function marketCodeFromName(name) {
  const number = String(name || "").trim().match(/^(\d{1,2})\b/)?.[1]?.padStart(2, "0") || "";
  return MARKET_CODES_BY_NUMBER[number] || (number ? `markt-${number}` : "");
}

function percentageDeviation(current, previous) {
  if (current == null || previous == null || previous === 0) return null;
  return Math.round(((current / previous) - 1) * 10000) / 100;
}

function normalizedReportText(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function reportFilterText(filterRows) {
  return (filterRows || []).flat().map(value => String(value || "")).join(" ");
}

function isProduceReport(filterRows) {
  const text = normalizedReportText(reportFilterText(filterRows));
  return text.includes("abteilung obst gemuse blume");
}

function reportDepartment(filterRows) {
  const text = normalizedReportText(reportFilterText(filterRows));
  if (text.includes("abteilung obst gemuse blume")) return "produce";
  if (text.includes("backshop") || text.includes("back shop") || text.includes("backwaren")) return "backshop";
  return "market";
}

function filteredMarketName(filterRows) {
  const value = (filterRows || []).flat().map(item => String(item || "")).find(item => /Markt\s*:/i.test(item)) || "";
  const match = value.match(/Markt\s*:\s*(.+?)(?:\s+Abteilung\s*:|$)/i);
  return String(match?.[1] || "").trim();
}

function parseRevenueReport(buffer, marketCode = "802163") {
  const XLSX = require("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const dataSheet = workbook.Sheets.Tabelle || workbook.Sheets[workbook.SheetNames[0]];
  const filterSheet = workbook.Sheets.Filter;
  if (!dataSheet) throw new Error("Im Excel-Anhang wurde keine Umsatz-Tabelle gefunden.");
  const rows = XLSX.utils.sheet_to_json(dataSheet, { header: 1, raw: true, defval: null });
  const filterRows = filterSheet ? XLSX.utils.sheet_to_json(filterSheet, { header: 1, raw: false, defval: "" }) : [];
  const date = filterRows.flat().map(excelDateText).find(Boolean) || "";
  if (!date) throw new Error("Das Umsatzdatum konnte aus dem Bericht nicht gelesen werden.");
  const header = rows.find(row => String(row?.[0] || "").trim() === "Markt") || [];
  const compactLayout = String(header[1] || "").trim() === "Umsatz";
  const markets = rows.map(row => {
    if (compactLayout) {
      const marketName = String(row?.[0] || "").trim();
      if (!/^\d{1,2}\s+EDEKA/i.test(marketName)) return null;
      const revenue = revenueNumber(row[1]);
      const priorYearRevenue = revenueNumber(row[2]);
      const customers = revenueNumber(row[5]);
      const priorYearCustomers = revenueNumber(row[6]);
      const writeOffsGross = revenueNumber(row[11]);
      return {
        date,
        marketCode: marketCodeFromName(marketName),
        marketName,
        revenue,
        priorYearRevenue,
        priorYearDeviationPercent: percentageDeviation(revenue, priorYearRevenue),
        revenueSharePercent: revenueNumber(row[3]),
        quantity: revenueNumber(row[4]),
        customers,
        priorYearCustomers,
        customerDeviationPercent: percentageDeviation(customers, priorYearCustomers),
        averageBasket: revenueNumber(row[7]),
        priorYearAverageBasket: revenueNumber(row[8]),
        grossMarginPercent: revenueNumber(row[9]),
        netMarginPercent: revenueNumber(row[10]),
        writeOffsGross,
        priorYearWriteOffsGross: revenueNumber(row[12]),
        writeOffSharePercent: revenue && writeOffsGross != null ? Math.round(writeOffsGross / revenue * 10000) / 100 : null,
        revaluationSharePercent: null,
        privateBrandSharePercent: null,
        appSharePercent: null,
        promotionSharePercent: null
      };
    }
    if (!/^\d{6}$/.test(String(row?.[0] ?? "").trim()) || !row?.[1]) return null;
    return {
      date,
      marketCode: String(row[0]).trim(),
      marketName: String(row[1] || ""),
      revenue: revenueNumber(row[2]),
      priorYearRevenue: revenueNumber(row[3]),
      priorYearDeviationPercent: revenueNumber(row[4]),
      customerDeviationPercent: revenueNumber(row[5]),
      grossMarginPercent: revenueNumber(row[6]),
      netMarginPercent: revenueNumber(row[7]),
      writeOffsGross: revenueNumber(row[8]),
      writeOffSharePercent: revenueNumber(row[9]),
      revaluationSharePercent: revenueNumber(row[10]),
      privateBrandSharePercent: revenueNumber(row[11]),
      appSharePercent: revenueNumber(row[12]),
      promotionSharePercent: revenueNumber(row[13])
    };
  }).filter(Boolean);
  const primary = markets.find(item => item.marketCode === String(marketCode))
    || markets.find(item => /14\s+EDEKA.*Schlo/i.test(item.marketName));
  if (!primary) throw new Error(`Markt ${marketCode} wurde im Umsatzbericht nicht gefunden.`);
  const department = reportDepartment(filterRows);
  return { type: department === "market" ? "market" : `${department}-markets`, date, primary, markets };
}

function parseDepartmentArticleReport(buffer, marketCode = "802163") {
  const XLSX = require("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const dataSheet = workbook.Sheets.Tabelle || workbook.Sheets[workbook.SheetNames[0]];
  const filterSheet = workbook.Sheets.Filter;
  if (!dataSheet) throw new Error("Im Excel-Anhang wurde keine Umsatz-Tabelle gefunden.");
  const rows = XLSX.utils.sheet_to_json(dataSheet, { header: 1, raw: true, defval: null });
  const filterRows = filterSheet ? XLSX.utils.sheet_to_json(filterSheet, { header: 1, raw: false, defval: "" }) : [];
  const department = reportDepartment(filterRows);
  if (department === "market") throw new Error("Der Artikelbericht enthält keine unterstützte Abteilung.");
  const date = filterRows.flat().map(excelDateText).find(Boolean) || "";
  if (!date) throw new Error("Das Umsatzdatum konnte aus dem Bericht nicht gelesen werden.");
  const headerIndex = rows.findIndex(row => String(row?.[0] || "").trim() === "Artikel" && String(row?.[3] || "").trim() === "Umsatz");
  if (headerIndex < 0) throw new Error("Die Artikelüberschriften wurden nicht gefunden.");
  const totalRow = rows.slice(headerIndex + 1).find(row => String(row?.[0] || "").trim() === "Gesamtergebnis") || [];
  const marketName = filteredMarketName(filterRows);
  const detectedMarketCode = marketCodeFromName(marketName) || String(marketCode);
  const articles = rows.slice(headerIndex + 1).map(row => {
    const articleNo = String(row?.[0] || "").trim();
    const articleName = String(row?.[1] || "").trim();
    if (!articleNo || !articleName || articleNo === "Gesamtergebnis") return null;
    return {
      articleNo,
      articleName,
      gtin: String(row?.[2] || "").trim(),
      revenue: revenueNumber(row?.[3]),
      priorYearRevenue: revenueNumber(row?.[4]),
      revenueSharePercent: revenueNumber(row?.[5]),
      quantity: String(row?.[6] || "").trim(),
      grossMarginPercent: revenueNumber(row?.[7]),
      netMarginPercent: revenueNumber(row?.[8]),
      writeOffsGross: revenueNumber(row?.[9]),
      priorYearWriteOffsGross: revenueNumber(row?.[10])
    };
  }).filter(Boolean);
  return {
    type: `${department}-articles`,
    date,
    marketCode: detectedMarketCode,
    marketName,
    revenue: revenueNumber(totalRow?.[3]),
    priorYearRevenue: revenueNumber(totalRow?.[4]),
    grossMarginPercent: revenueNumber(totalRow?.[7]),
    netMarginPercent: revenueNumber(totalRow?.[8]),
    writeOffsGross: revenueNumber(totalRow?.[9]),
    priorYearWriteOffsGross: revenueNumber(totalRow?.[10]),
    articles
  };
}

function parseRevenueAttachment(buffer, marketCode = "802163") {
  const XLSX = require("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const dataSheet = workbook.Sheets.Tabelle || workbook.Sheets[workbook.SheetNames[0]];
  if (!dataSheet) throw new Error("Im Excel-Anhang wurde keine Umsatz-Tabelle gefunden.");
  const rows = XLSX.utils.sheet_to_json(dataSheet, { header: 1, raw: true, defval: null });
  const hasArticleHeader = rows.some(row => String(row?.[0] || "").trim() === "Artikel" && String(row?.[3] || "").trim() === "Umsatz");
  return hasArticleHeader ? parseDepartmentArticleReport(buffer, marketCode) : parseRevenueReport(buffer, marketCode);
}

function parseRevenueWorkbook(buffer, marketCode = "802163") {
  return parseRevenueReport(buffer, marketCode).primary;
}

function saveRevenueEntry(db, entry, source = {}) {
  const saved = {
    ...entry,
    sourceMessageId: String(source.messageId || ""),
    sourceSubject: String(source.subject || ""),
    importedAt: new Date().toISOString()
  };
  const index = (db.revenueEntries || []).findIndex(item => item.date === saved.date && String(item.marketCode) === String(saved.marketCode));
  if (index >= 0) db.revenueEntries[index] = saved;
  else db.revenueEntries.push(saved);
  db.revenueEntries = db.revenueEntries.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-8000);
  return saved;
}

function saveProduceRevenueEntry(db, entry, source = {}) {
  const saved = {
    ...entry,
    sourceMessageId: String(source.messageId || ""),
    sourceSubject: String(source.subject || ""),
    importedAt: new Date().toISOString()
  };
  const index = (db.produceRevenueEntries || []).findIndex(item => item.date === saved.date && String(item.marketCode) === String(saved.marketCode));
  if (index >= 0) db.produceRevenueEntries[index] = saved;
  else db.produceRevenueEntries.push(saved);
  db.produceRevenueEntries = db.produceRevenueEntries.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-8000);
  // Clean up a legacy misclassification from releases that did not yet
  // distinguish the department report from the total-market report.
  const savedRevenueCents = Math.round((Number(saved.revenue) || 0) * 100);
  db.revenueEntries = (db.revenueEntries || []).filter(item => !(
    item.date === saved.date
    && String(item.marketCode) === String(saved.marketCode)
    && Math.round((Number(item.revenue) || 0) * 100) === savedRevenueCents
  ));
  return saved;
}

function saveProduceArticleEntry(db, report, source = {}) {
  const saved = {
    ...report,
    sourceMessageId: String(source.messageId || ""),
    sourceSubject: String(source.subject || ""),
    importedAt: new Date().toISOString()
  };
  delete saved.type;
  const index = (db.produceArticleEntries || []).findIndex(item => item.date === saved.date && String(item.marketCode) === String(saved.marketCode));
  if (index >= 0) db.produceArticleEntries[index] = saved;
  else db.produceArticleEntries.push(saved);
  db.produceArticleEntries = db.produceArticleEntries.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-500);
  return saved;
}

function saveBackshopRevenueEntry(db, entry, source = {}) {
  const saved = { ...entry, sourceMessageId: String(source.messageId || ""), sourceSubject: String(source.subject || ""), importedAt: new Date().toISOString() };
  const index = (db.backshopRevenueEntries || []).findIndex(item => item.date === saved.date && String(item.marketCode) === String(saved.marketCode));
  if (index >= 0) db.backshopRevenueEntries[index] = saved;
  else db.backshopRevenueEntries.push(saved);
  db.backshopRevenueEntries = db.backshopRevenueEntries.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-8000);
  return saved;
}

function saveBackshopArticleEntry(db, report, source = {}) {
  const saved = { ...report, sourceMessageId: String(source.messageId || ""), sourceSubject: String(source.subject || ""), importedAt: new Date().toISOString() };
  delete saved.type;
  const index = (db.backshopArticleEntries || []).findIndex(item => item.date === saved.date && String(item.marketCode) === String(saved.marketCode));
  if (index >= 0) db.backshopArticleEntries[index] = saved;
  else db.backshopArticleEntries.push(saved);
  db.backshopArticleEntries = db.backshopArticleEntries.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-500);
  return saved;
}

async function testGmxConnection(db) {
  const { ImapFlow } = require("imapflow");
  const credentials = revenueCredentials(db);
  if (!credentials.email || !credentials.password) throw new Error("Bitte zuerst GMX-Adresse und Anwendungspasswort speichern.");
  const client = new ImapFlow({
    host: "imap.gmx.net", port: 993, secure: true,
    auth: { user: credentials.email, pass: credentials.password },
    logger: false
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    lock.release();
    return { ok: true };
  } finally {
    if (client.usable) await client.logout().catch(() => {});
  }
}

async function importRevenueFromGmx(db) {
  const { ImapFlow } = require("imapflow");
  const { simpleParser } = require("mailparser");
  const credentials = revenueCredentials(db);
  if (!credentials.email || !credentials.password) throw new Error("GMX ist noch nicht eingerichtet.");
  const state = db.revenueImport || (db.revenueImport = { processedMessageIds: [] });
  state.lastRunAt = new Date().toISOString();
  state.lastError = "";
  const processed = new Set(state.processedMessageIds || []);
  const forceSchemaRescan = Number(state.reportSchemaVersion || 0) < 4;
  const client = new ImapFlow({
    host: "imap.gmx.net", port: 993, secure: true,
    auth: { user: credentials.email, pass: credentials.password }, logger: false
  });
  let imported = 0;
  let latest = null;
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - 21 * 86400000);
      const uids = await client.search({ since }, { uid: true });
      for (const uid of uids.slice(-60).reverse()) {
        const message = await client.fetchOne(uid, { envelope: true, source: true }, { uid: true });
        if (!message?.source) continue;
        const parsed = await simpleParser(message.source);
        const senderMatches = (parsed.from?.value || []).some(sender => String(sender.address || "").trim().toLowerCase() === REVENUE_REPORT_SENDER);
        const subjectMatches = String(parsed.subject || message.envelope?.subject || "").trim().toLowerCase().startsWith(REVENUE_REPORT_PREFIX);
        if (!senderMatches || !subjectMatches) continue;
        const messageId = String(parsed.messageId || `${message.envelope?.date?.toISOString?.() || ""}-${uid}`);
        if (processed.has(messageId) && !forceSchemaRescan) continue;
        const attachments = (parsed.attachments || []).filter(item => {
          const filename = String(item.filename || "").trim().toLowerCase();
          return filename.startsWith(REVENUE_REPORT_PREFIX) && /\.xlsx$/i.test(filename);
        });
        if (!attachments.length) continue;
        let importedFromMessage = 0;
        for (const attachment of attachments) {
          try {
            const report = parseRevenueAttachment(attachment.content, credentials.marketCode);
            const source = { messageId, subject: parsed.subject || message.envelope?.subject || "" };
            if (report.type === "produce-articles") {
              saveProduceArticleEntry(db, report, source);
            } else if (report.type === "backshop-articles") {
              saveBackshopArticleEntry(db, report, source);
            } else {
              for (const entry of report.markets) {
                const saved = report.type === "produce-markets"
                  ? saveProduceRevenueEntry(db, entry, source)
                  : report.type === "backshop-markets"
                    ? saveBackshopRevenueEntry(db, entry, source)
                  : saveRevenueEntry(db, entry, source);
                if (report.type === "market" && entry.marketCode === report.primary.marketCode) latest = saved;
              }
            }
            imported += 1;
            importedFromMessage += 1;
          } catch (error) {
            if (/Markt|Umsatzdatum|Umsatz-Tabelle|Artikelbericht|Artikelüberschriften/.test(error.message || "")) continue;
            throw error;
          }
        }
        if (importedFromMessage) {
          processed.add(messageId);
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
        }
      }
    } finally {
      lock.release();
    }
    state.processedMessageIds = Array.from(processed).slice(-200);
    state.reportSchemaVersion = 4;
    state.lastSuccessAt = new Date().toISOString();
    state.lastResult = imported ? `${imported} Umsatzbericht(e) importiert.` : "Keine neue passende Umsatzmail gefunden.";
    return { ok: true, imported, entry: latest, message: state.lastResult };
  } catch (error) {
    state.lastError = error.message || "GMX-Import fehlgeschlagen.";
    throw error;
  } finally {
    if (client.usable) await client.logout().catch(() => {});
  }
}

let revenueAutoImportPromise = null;

function berlinDay(value = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function berlinHour(value = new Date()) {
  return Number(new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(new Date(value)));
}

function revenueAutoImportDue(db) {
  const credentials = revenueCredentials(db);
  if (!credentials.email || !credentials.password || berlinHour() < 8) return false;
  const state = db.revenueImport || {};
  // A parser upgrade must re-read recent messages immediately, even when the
  // regular 15-minute check ran just before a new deployment.
  if (Number(state.reportSchemaVersion || 0) < 4) return true;
  const lastRun = state.lastRunAt ? new Date(state.lastRunAt).getTime() : 0;
  // Both daily exports may arrive a few minutes apart. Keep checking after the
  // first successful import so the second mail is not postponed until tomorrow.
  return !lastRun || Date.now() - lastRun >= REVENUE_IMPORT_INTERVAL_MS;
}

async function ensureAutomaticRevenueImport() {
  if (revenueAutoImportPromise) return revenueAutoImportPromise;
  revenueAutoImportPromise = (async () => {
    const db = await readDb();
    if (!revenueAutoImportDue(db)) return;
    try {
      await importRevenueFromGmx(db);
    } catch {
      // The exact error is stored for the admin dashboard; employee pages keep working.
    }
    await writeDb(db);
  })().finally(() => {
    revenueAutoImportPromise = null;
  });
  return revenueAutoImportPromise;
}

async function handleApi(req, res, pathname, requestUrl) {
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
      const employeeSyncChanged = ensureEmployeesFromPlans(db);
      const breakSyncChanged = ensureLegalBreaksInPlans(db);
      const loginDataChanged = employeeSyncChanged || breakSyncChanged;
      if (loginDataChanged) await writeDb(db);
      const name = normalizeName(body.name);
      const employee = findEmployeeByName(db, name);
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
      await ensureAutomaticRevenueImport();
      const db = await readDb();
      cleanupPepCorrections(db);
      const employeeSyncChanged = ensureEmployeesFromPlans(db);
      const breakSyncChanged = ensureLegalBreaksInPlans(db);
      const overviewDataChanged = employeeSyncChanged || breakSyncChanged;
      if (overviewDataChanged) await writeDb(db);
      const ids = publishedIds(db);
      const publishedPlans = db.plans.filter(plan => ids.includes(plan.id));
      return json(res, 200, {
        buildVersion: BUILD_VERSION,
        publishedPlanIds: ids,
        publishedPlanId: ids[0] || "",
        activePlan: publishedPlans[0] ? publicPlan(publishedPlans[0]) : null,
        publishedPlans: publishedPlans.map(plan => publicPlan(plan)),
        plans: db.plans.map(plan => publicPlan(plan, { isPublished: ids.includes(plan.id), recommendedNotifyMode: defaultPublishNotifyMode(db, plan) })),
        employees: employeePublic(db),
        pushStatus: { enabled: Boolean(webPush), subscriptions: Array.isArray(db.pushSubscriptions) ? db.pushSubscriptions.length : 0 },
        pepCorrections: publicPepCorrections(db),
        revenue: publicRevenueState(db)
      });
    }

    if (pathname === "/api/admin/revenue/settings" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const marketCode = String(body.marketCode || "802163").trim();
      if (!email.endsWith("@gmx.net")) return json(res, 400, { error: "Bitte eine gueltige GMX-Adresse eingeben." });
      if (!/^\d{6}$/.test(marketCode)) return json(res, 400, { error: "Die Marktnummer muss sechsstellig sein." });
      const db = await readDb();
      db.revenueSettings.email = email;
      db.revenueSettings.marketCode = marketCode;
      if (String(body.appPassword || "").trim()) {
        db.revenueSettings.passwordEncrypted = encryptRevenueSecret(String(body.appPassword).trim());
      }
      if (!revenueCredentials(db).password) {
        return json(res, 400, { error: "Bitte das GMX-Passwort eingeben. Es wird nur einmal fuer die automatische Abholung benoetigt." });
      }
      try {
        await testGmxConnection(db);
        const result = await importRevenueFromGmx(db);
        await writeDb(db);
        return json(res, 200, {
          ok: true,
          message: `GMX ist eingerichtet. ${result.message}`,
          revenue: publicRevenueState(db)
        });
      } catch (error) {
        db.revenueImport.lastRunAt = new Date().toISOString();
        db.revenueImport.lastError = error.message || "GMX-Einrichtung fehlgeschlagen.";
        await writeDb(db);
        return json(res, 400, { error: `GMX konnte nicht eingerichtet werden: ${db.revenueImport.lastError}` });
      }
    }

    if (pathname === "/api/admin/revenue/upload" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const base64 = String(body.fileBase64 || "").replace(/^data:[^;]+;base64,/, "");
      if (!base64) return json(res, 400, { error: "Bitte eine Umsatz-Exceldatei auswaehlen." });
      const db = await readDb();
      const credentials = revenueCredentials(db);
      const report = parseRevenueAttachment(Buffer.from(base64, "base64"), credentials.marketCode);
      let saved = null;
      const source = { subject: `Manueller Import: ${String(body.filename || "Umsatzdatei")}` };
      let message = "";
      if (report.type === "produce-articles") {
        saved = saveProduceArticleEntry(db, report, source);
        message = `${report.articles.length} Obst-Artikel für ${report.date} wurden übernommen.`;
      } else if (report.type === "backshop-articles") {
        saved = saveBackshopArticleEntry(db, report, source);
        message = `${report.articles.length} Backshop-Artikel für ${report.date} wurden übernommen.`;
      } else {
        for (const entry of report.markets) {
          const current = report.type === "produce-markets"
            ? saveProduceRevenueEntry(db, entry, source)
            : report.type === "backshop-markets"
              ? saveBackshopRevenueEntry(db, entry, source)
              : saveRevenueEntry(db, entry, source);
          if (entry.marketCode === report.primary.marketCode) saved = current;
        }
        message = `${report.markets.length} ${report.type === "produce-markets" ? "Obst-Märkte" : report.type === "backshop-markets" ? "Backshop-Märkte" : "Märkte"} für ${report.date} wurden übernommen.`;
      }
      db.revenueImport.lastRunAt = new Date().toISOString();
      db.revenueImport.lastSuccessAt = new Date().toISOString();
      db.revenueImport.lastError = "";
      db.revenueImport.lastResult = message;
      await writeDb(db);
      return json(res, 200, { ok: true, entry: saved, message: db.revenueImport.lastResult, revenue: publicRevenueState(db) });
    }

    if (pathname === "/api/admin/revenue/test" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const db = await readDb();
      await testGmxConnection(db);
      db.revenueImport.lastRunAt = new Date().toISOString();
      db.revenueImport.lastSuccessAt = new Date().toISOString();
      db.revenueImport.lastError = "";
      db.revenueImport.lastResult = "GMX-Verbindung erfolgreich getestet.";
      await writeDb(db);
      return json(res, 200, { ok: true, message: db.revenueImport.lastResult, revenue: publicRevenueState(db) });
    }

    if (pathname === "/api/admin/revenue/import" && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const db = await readDb();
      try {
        const result = await importRevenueFromGmx(db);
        await writeDb(db);
        return json(res, 200, { ...result, revenue: publicRevenueState(db) });
      } catch (error) {
        await writeDb(db);
        return json(res, 500, { error: error.message || "GMX-Import fehlgeschlagen." });
      }
    }

    if (pathname === "/api/jobs/revenue-import" && (req.method === "GET" || req.method === "POST")) {
      const suppliedSecret = requestUrl?.searchParams.get("key") || req.headers["x-cron-secret"] || "";
      const suppliedHash = crypto.createHash("sha256").update(String(suppliedSecret)).digest();
      const expectedHash = crypto.createHash("sha256").update(String(CRON_SECRET)).digest();
      if (!CRON_SECRET || !crypto.timingSafeEqual(suppliedHash, expectedHash)) {
        return json(res, 403, { error: "Nicht erlaubt." });
      }
      const db = await readDb();
      try {
        const result = await importRevenueFromGmx(db);
        await writeDb(db);
        return json(res, 200, result);
      } catch (error) {
        await writeDb(db);
        return json(res, 500, { error: error.message || "GMX-Import fehlgeschlagen." });
      }
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
      if (ensureEmployeesFromPlans(db)) await writeDb(db);
      const employee = findEmployeeByName(db, name);
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
      const rangeKey = rangeKeyFromShifts(shifts);
      const uploadMode = body.uploadMode === "correction" ? "correction" : "normal";
      const basePlan = uploadMode === "correction"
        ? latestPublishedMatchingPlan(db, rangeKey) || latestMatchingPlan(db, rangeKey)
        : null;
      const changes = uploadMode === "correction" ? comparePlans(basePlan, shifts) : [];
      const version = uploadMode === "correction" ? nextPlanVersion(db, rangeKey) : 1;
      const newPins = [];
      for (const shift of shifts) {
        ensureEmployeeRecord(db, shift.name, newPins);
      }
      for (const name of body.seenEmployees || []) {
        ensureEmployeeRecord(db, name, newPins);
      }

      const plan = {
        id: crypto.randomUUID(),
        title: String(body.title || "Wochenplan").trim(),
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        publishedAt: "",
        version,
        uploadMode,
        basePlanId: basePlan?.id || "",
        changes,
        range: planRange(shifts),
        issues: shiftIssues(shifts),
        seenEmployees: Array.from(new Set((body.seenEmployees || []).map(normalizeName).filter(Boolean))),
        shifts
      };
      db.plans.unshift(plan);
      const pepCorrections = uploadMode === "correction" ? createPepCorrections(db, plan) : [];
      await writeDb(db);
      return json(res, 200, { ok: true, plan: publicPlan(plan), newPins, changes, pepCorrections });
    }

    if (pathname.match(/^\/api\/admin\/pep-corrections\/[^/]+\/done$/) && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const id = decodeURIComponent(pathname.split("/")[4]);
      const body = await readBody(req);
      const db = await readDb();
      const item = (db.pepCorrections || []).find(correction => correction.id === id);
      if (!item) return json(res, 404, { error: "Korrektur nicht gefunden." });
      item.done = body.done !== false;
      item.doneAt = item.done ? new Date().toISOString() : "";
      cleanupPepCorrections(db);
      await writeDb(db);
      return json(res, 200, { ok: true, pepCorrections: publicPepCorrections(db) });
    }

    if (pathname.match(/^\/api\/admin\/plans\/[^/]+\/shifts\/edit$/) && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const id = decodeURIComponent(pathname.split("/")[4]);
      const body = await readBody(req);
      const db = await readDb();
      const result = await editPlanShift(db, id, body.before, body.after, body.notifyMode, body.pushMessage, process.env.ADMIN_NAME || "Demircan, Emirkan", body.notifyNames, body.pushAppendMessage);
      if (result.error) return json(res, result.status || 400, { error: result.error });
      await writeDb(db);
      return json(res, 200, { ok: true, plan: publicPlan(result.plan, { isPublished: publishedIds(db).includes(result.plan.id) }), correction: result.correction, push: result.push });
    }

    if (pathname.match(/^\/api\/admin\/plans\/[^/]+\/sick$/) && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const id = decodeURIComponent(pathname.split("/")[4]);
      const body = await readBody(req);
      const db = await readDb();
      const result = await markEmployeeSick(
        db,
        id,
        body.name,
        body.date,
        Boolean(body.wholeWeek),
        body.notifyMode,
        body.notifyNames,
        body.pushMessage,
        process.env.ADMIN_NAME || "Demircan, Emirkan"
      );
      if (result.error) return json(res, result.status || 400, { error: result.error });
      await writeDb(db);
      return json(res, 200, { ok: true, plan: publicPlan(result.plan, { isPublished: publishedIds(db).includes(result.plan.id) }), corrections: result.corrections, push: result.push });
    }

    if (pathname.match(/^\/api\/admin\/plans\/[^/]+\/changes\/delete$/) && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const id = decodeURIComponent(pathname.split("/")[4]);
      const body = await readBody(req);
      const db = await readDb();
      const plan = db.plans.find(item => item.id === id);
      if (!plan) return json(res, 404, { error: "Plan nicht gefunden." });
      const change = body.change || {};
      const beforeCount = (plan.changes || []).length;
      plan.changes = (plan.changes || []).filter(item => !sameChange(item, change));
      if (plan.changes.length === beforeCount) return json(res, 404, { error: "Aenderung wurde nicht gefunden." });
      const key = correctionKey(plan.id, change);
      db.pepCorrections = (db.pepCorrections || []).filter(item => item.key !== key);
      await writeDb(db);
      return json(res, 200, { ok: true, plan: publicPlan(plan, { isPublished: publishedIds(db).includes(plan.id) }), pepCorrections: publicPepCorrections(db) });
    }

    if (pathname.match(/^\/api\/me\/plans\/[^/]+\/shifts\/edit$/) && req.method === "POST") {
      const editorName = requireEmployee(req, res);
      if (!editorName) return;
      if (!canSeeTeamPlan(editorName)) return json(res, 403, { error: "Du darfst den Teamplan nicht bearbeiten." });
      const id = decodeURIComponent(pathname.split("/")[4]);
      const body = await readBody(req);
      const db = await readDb();
      const result = await editPlanShift(db, id, body.before, body.after, body.notifyMode, body.pushMessage, editorName, body.notifyNames, body.pushAppendMessage);
      if (result.error) return json(res, result.status || 400, { error: result.error });
      await writeDb(db);
      return json(res, 200, { ok: true, plan: publicPlan(result.plan, { isPublished: publishedIds(db).includes(result.plan.id) }), correction: result.correction, push: result.push });
    }

    if (pathname.match(/^\/api\/me\/plans\/[^/]+\/sick$/) && req.method === "POST") {
      const editorName = requireEmployee(req, res);
      if (!editorName) return;
      if (!canSeeTeamPlan(editorName)) return json(res, 403, { error: "Du darfst den Teamplan nicht bearbeiten." });
      const id = decodeURIComponent(pathname.split("/")[4]);
      const body = await readBody(req);
      const db = await readDb();
      const result = await markEmployeeSick(db, id, body.name, body.date, Boolean(body.wholeWeek), body.notifyMode, body.notifyNames, body.pushMessage, editorName);
      if (result.error) return json(res, result.status || 400, { error: result.error });
      await writeDb(db);
      return json(res, 200, { ok: true, plan: publicPlan(result.plan, { isPublished: publishedIds(db).includes(result.plan.id) }), corrections: result.corrections, push: result.push });
    }

    if (pathname.match(/^\/api\/admin\/plans\/[^/]+\/publish$/) && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const id = decodeURIComponent(pathname.split("/")[4]);
      const body = await readBody(req);
      const db = await readDb();
      const plan = db.plans.find(item => item.id === id);
      if (!plan) return json(res, 404, { error: "Plan nicht gefunden." });
      const ids = publishedIds(db);
      if (!ids.includes(id)) ids.unshift(id);
      const requestedMode = String(body.notifyMode || "");
      const selectedNames = (Array.isArray(body.notifyNames) ? body.notifyNames : [])
        .map(name => resolveKnownEmployeeName(db, name))
        .filter(Boolean);
      if (requestedMode === "selected_people" && !selectedNames.length) {
        return json(res, 400, { error: "Bitte mindestens eine Person fuer die Benachrichtigung auswaehlen." });
      }
      const notifyMode = requestedMode === "selected_people" ? requestedMode : publishNotifyMode(db, plan, requestedMode);
      setPublishedIds(db, ids);
      plan.publishedAt = new Date().toISOString();
      const push = notifyMode === "none"
        ? { sent: 0, removed: 0, skipped: true, mode: notifyMode }
        : notifyMode === "selected_people"
          ? await safeSendPlanPush(db, plan, "affected", selectedNames, { pushMessage: body.pushMessage })
          : await safeSendPlanPush(db, plan, notifyMode, null, { pushMessage: body.pushMessage });
      if (notifyMode === "selected_people") push.mode = notifyMode;
      await writeDb(db);
      return json(res, 200, { ok: true, plan: publicPlan(plan, { isPublished: true }), push });
    }

    if (pathname.match(/^\/api\/admin\/plans\/[^/]+\/notify$/) && req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const id = decodeURIComponent(pathname.split("/")[4]);
      const body = await readBody(req);
      const db = await readDb();
      const plan = db.plans.find(item => item.id === id);
      if (!plan) return json(res, 404, { error: "Plan nicht gefunden." });
      if (!publishedIds(db).includes(id)) return json(res, 400, { error: "Nur veroeffentlichte Plaene koennen erneut benachrichtigt werden." });
      const requestedMode = String(body.notifyMode || "");
      const notifyMode = ["all", "affected", "leadership", "affected_leadership", "selected_people", "none"].includes(requestedMode)
        ? requestedMode
        : "all";
      const selectedNames = (Array.isArray(body.notifyNames) ? body.notifyNames : [])
        .map(name => resolveKnownEmployeeName(db, name))
        .filter(Boolean);
      if (notifyMode === "selected_people" && !selectedNames.length) {
        return json(res, 400, { error: "Bitte mindestens eine Person fuer die Benachrichtigung auswaehlen." });
      }
      const push = notifyMode === "none"
        ? { sent: 0, removed: 0, skipped: true, mode: notifyMode }
        : notifyMode === "selected_people"
          ? await safeSendPlanPush(db, plan, "affected", selectedNames, { pushMessage: body.pushMessage })
          : await safeSendPlanPush(db, plan, notifyMode, null, { pushMessage: body.pushMessage });
      if (notifyMode === "selected_people") push.mode = notifyMode;
      await writeDb(db);
      return json(res, 200, { ok: true, push });
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
      if (ensureLegalBreaksInPlans(db)) await writeDb(db);
      const plan = db.plans.find(item => item.id === id);
      if (!plan) return json(res, 404, { error: "Plan nicht gefunden." });
      const displayShifts = cleanedDisplayShifts(plan.shifts || []);
      const issues = shiftIssues(displayShifts);
      return json(res, 200, {
        plan: publicPlan(plan, { isPublished: publishedIds(db).includes(plan.id) }),
        shifts: displayShifts,
        issues,
        missingEmployees: missingEmployeesForPlan(db, plan),
        changes: plan.changes || []
      });
    }

    if (pathname.startsWith("/api/admin/plans/") && req.method === "DELETE") {
      if (!requireAdmin(req, res)) return;
      const id = decodeURIComponent(pathname.split("/").pop());
      const db = await readDb();
      db.plans = db.plans.filter(plan => plan.id !== id);
      db.pepCorrections = (db.pepCorrections || []).filter(item => item.planId !== id);
      setPublishedIds(db, publishedIds(db).filter(item => item !== id));
      await writeDb(db);
      return json(res, 200, { ok: true });
    }

    if (pathname === "/api/me/revenue" && req.method === "GET") {
      const name = requireEmployee(req, res);
      if (!name) return;
      if (!canSeeRevenue(name)) return json(res, 403, { error: "Die KPIs sind nur fuer die Team-Marktleitung freigegeben." });
      await ensureAutomaticRevenueImport();
      const db = await readDb();
      return json(res, 200, { name, canSeePrivateInsights: canSeePrivateRevenueInsights(name), revenue: leadershipRevenueState(db) });
    }

    if (pathname === "/api/me/shifts" && req.method === "GET") {
      const name = requireEmployee(req, res);
      if (!name) return;
      await ensureAutomaticRevenueImport();
      const db = await readDb();
      if (ensureLegalBreaksInPlans(db)) await writeDb(db);
      const ids = publishedIds(db);
      const teamView = canSeeTeamPlan(name);
      const canManage = canManagePlans(name);
      const plans = db.plans
        .filter(plan => ids.includes(plan.id))
        .map(plan => ({
          id: plan.id,
          title: plan.title,
          uploadedAt: plan.uploadedAt,
          publishedAt: plan.publishedAt || "",
          updatedAt: plan.updatedAt || plan.uploadedAt,
          version: Number(plan.version || 1),
          changeCount: changesForEmployee(plan, name).length,
          changes: teamView ? (plan.changes || []) : changesForEmployee(plan, name),
          range: plan.range || planRange(cleanedDisplayShifts(plan.shifts || [])),
          shifts: teamView ? cleanedDisplayShifts(plan.shifts || []) : cleanedDisplayShifts(plan.shifts || []).filter(shift => employeeKey(shift.name) === employeeKey(name))
        }))
        .sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
      return json(res, 200, {
        name,
        teamView,
        canManage,
        canSeeRevenue: canSeeRevenue(name),
        employees: teamView ? allKnownEmployeeNames(db) : [],
        plans
      });
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

async function startServer() {
  await ensureDb();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    // A normal uptime-bot request is enough to wake Render and start the
    // daily GMX revenue check after 08:00 without exposing mail credentials.
    if (url.pathname === "/" || url.pathname === "/health") {
      ensureAutomaticRevenueImport().catch(() => {});
    }
    if (url.pathname === "/health") return json(res, 200, { ok: true, buildVersion: BUILD_VERSION });
    if (url.pathname.startsWith("/api/")) return handleApi(req, res, url.pathname, url);
    serveStatic(req, res, url.pathname);
  }).listen(PORT, () => {
    console.log(`Arbeitsplan-App laeuft auf http://localhost:${PORT}`);
    ensureAutomaticRevenueImport().catch(() => {});
  });
  const revenueTimer = setInterval(() => {
    ensureAutomaticRevenueImport().catch(() => {});
  }, REVENUE_IMPORT_INTERVAL_MS);
  revenueTimer.unref();
  return server;
}

if (require.main === module) {
  startServer().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { parseRevenueWorkbook, parseRevenueReport, saveRevenueEntry, startServer };










