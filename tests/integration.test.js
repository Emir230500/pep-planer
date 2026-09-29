"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto"), vm = require("vm");

test("HTTP login, PIN change, logout and replay use the same revocable sessions", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pep-security-test-"));
  const saved = { ...process.env };
  Object.assign(process.env, { DATA_DIR: dir, DATABASE_URL: "", PORT: "0", ADMIN_PASSWORD: "test-admin-only", SESSION_SECRET: "test-session-secret", GMX_APP_PASSWORD: "", VAPID_PRIVATE_KEY: "", VAPID_PUBLIC_KEY: "" });
  const salt = "test-only-salt", hash = crypto.pbkdf2Sync("123456", salt, 120000, 32, "sha256").toString("hex");
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({ employees: { "test, person": { name: "Test, Person", pinHash: `${salt}:${hash}` } }, plans: [] }));
  const core = require("../server-core");
  const server = await core.startServer();
  await new Promise(resolve => server.listening ? resolve() : server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body, cookie = "") => fetch(base + url, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
  const cookie = response => response.headers.get("set-cookie").split(";")[0];
  try {
    const login = await post("/api/employee/login", { name: "Test, Person", pin: "123456" }); assert.equal(login.status, 200);
    const user = cookie(login);
    assert.equal((await fetch(base + "/api/me/shifts", { headers: { cookie: user } })).status, 200);
    const admin = cookie(await post("/api/admin/login", { password: "test-admin-only" }));
    const changed = await post("/api/admin/employees/" + encodeURIComponent("Test, Person") + "/pin", { pin: "654321" }, admin); assert.equal(changed.status, 200);
    assert.equal((await fetch(base + "/api/me/shifts", { headers: { cookie: user } })).status, 401);
    const renewed = cookie(await post("/api/employee/login", { name: "Test, Person", pin: "654321" }));
    assert.equal((await post("/api/logout", {}, renewed)).status, 200);
    assert.equal((await fetch(base + "/api/me/shifts", { headers: { cookie: renewed } })).status, 401);
    assert.equal((await fetch(base + "/api/admin/overview")).status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
    process.env = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("assembled bakery code guards imports and cron before any database call", () => {
  const root = path.resolve(__dirname, ".."), X = require("xlsx");
  let handler, databaseCalls = 0;
  const http = { createServer(listener) { handler = listener; return {}; } };
  const mockRequire = name => {
    if (name === "http") return http;
    if (name === "./neon-query-cache") return {};
    if (name === "./server-core") return { startServer: () => Promise.resolve(), authenticatedSession: async () => null };
    if (name === "pg") return { Pool: class { query() { databaseCalls++; throw Error("Database must not be used"); } } };
    return name.startsWith("./") ? require(path.join(root, name)) : require(name);
  };
  const context = { require: mockRequire, __dirname: root, Buffer, URL, console: { log() {}, error() {} }, process: { env: { CRON_SECRET: "test-only" }, exit() {} }, setTimeout: () => ({ unref() {} }), setInterval: () => ({ unref() {} }) };
  vm.createContext(context);
  const source = Array.from({ length: 12 }, (_, i) => fs.readFileSync(path.join(root, `server-v2.part${i + 1}`), "utf8")).join("");
  vm.runInContext(source + "\nglobalThis.testing={catalog,mergeRows,blankModel,parse};", context);
  const { catalog, mergeRows, blankModel, parse } = context.testing;
  const item = catalog().find(x => x.type === "Backplan"), model = blankModel();
  const row = { no: item.no, name: item.name, date: "2026-09-23", slot: "08:00:00", qty: 10, revenue: 20, writeoff: 0, action: 0 };
  mergeRows(model, [row], []); assert.equal(model.items[item.no].d[0][1], 10);
  mergeRows(model, [row], []); assert.equal(model.items[item.no].d[0][1], 10);
  mergeRows(model, [{ ...row, qty: 12 }], []); assert.equal(model.items[item.no].d[0][1], 10); assert.equal(model.importWarnings.length, 1);
  mergeRows(model, [{ ...row, date: "2026-09-24" }], []); assert.equal(model.items[item.no].d.length, 2);
  const workbook = X.utils.book_new();
  X.utils.book_append_sheet(workbook, X.utils.aoa_to_sheet([["Datum", "Artikelnummer", "Artikelbezeichnung", "Viertelstunde", "Menge", "Umsatz"], ["23.09.2026", item.no, item.name, "08:00", 10, 20]]), "Report");
  const parsed = parse(X.write(workbook, { type: "buffer", bookType: "xlsx" })); assert.equal(parsed.Q.length, 1); assert.equal(parsed.Q[0].qty, 10);
  http.createServer(() => {});
  const response = { setHeader() {}, writeHead(status) { this.status = status; }, end() {} };
  return handler({ url: "/api/bakery/auto", method: "POST", headers: {} }, response).then(() => { assert.equal(response.status, 403); assert.equal(databaseCalls, 0); });
});
