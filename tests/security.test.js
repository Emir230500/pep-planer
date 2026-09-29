"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { createSessions, createLoginLimiter, allowCron } = require("../security");
test("sessions expire, reject tampering and old process tokens, and revoke on logout", () => {
  let now = 1000;
  const s = createSessions("test-secret", { now: () => now, ttl: 100 });
  const token = s.issue({ role: "employee", name: "Test" });
  assert.equal(s.verify(token).name, "Test");
  assert.equal(s.verify(token + "x"), null);
  assert.equal(createSessions("test-secret", { now: () => now }).verify(token), null);
  s.revoke(token); assert.equal(s.verify(token), null);
  const next = s.issue({ role: "admin" }); now = 1100;
  assert.equal(s.verify(next), null);
});
test("login limit cannot be bypassed with forged forwarding headers; expires", () => {
  let now = 0;
  const allow = createLoginLimiter({ now: () => now, accountLimit: 2, addressLimit: 3, windowMs: 100 });
  const req = { socket: { remoteAddress: "test-address" }, headers: {} };
  assert.equal(allow(req, "a"), true); assert.equal(allow(req, "a"), true);
  assert.equal(allow(req, "a"), false); assert.equal(allow(req, "b"), true);
  req.headers["x-forwarded-for"] = "forged";
  assert.equal(allow(req, "c"), false);
  now = 100; assert.equal(allow(req, "a"), true);
});
test("cron requires configured secret and POST", () => {
  const res = { writeHead(status) { this.status = status; }, end() {} };
  assert.equal(allowCron({ method: "GET", headers: { "x-cron-secret": "secret" } }, res, "secret"), false);
  assert.equal(res.status, 405);
  assert.equal(allowCron({ method: "POST", headers: {} }, res, ""), false);
  assert.equal(res.status, 403);
  assert.equal(allowCron({ method: "POST", headers: { "x-cron-secret": "secret" } }, res, "secret"), true);
});
