"use strict";
const crypto = require("crypto");

function constantEqual(a, b) {
  const hash = value => crypto.createHash("sha256").update(String(value)).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}

// Process-bound sessions keep revocation off the database. A restart intentionally
// signs every user out, so an in-memory revocation can never be lost on restart.
function createSessions(secret, { now = Date.now, ttl = 7 * 86400000 } = {}) {
  let boot = crypto.randomBytes(24).toString("hex");
  const revoked = new Map();
  const sign = value => crypto.createHmac("sha256", secret).update(value).digest("hex");
  function prune() {
    for (const [id, expires] of revoked) if (expires <= now()) revoked.delete(id);
  }
  function issue(payload) {
    const raw = Buffer.from(JSON.stringify({ ...payload, boot, sid: crypto.randomBytes(24).toString("hex"), iat: now(), exp: now() + ttl })).toString("base64url");
    return `${raw}.${sign(raw)}`;
  }
  function verify(token) {
    if (typeof token !== "string" || token.length > 4096) return null;
    const parts = token.split(".");
    if (parts.length !== 2 || !constantEqual(parts[1], sign(parts[0]))) return null;
    try {
      const p = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
      prune();
      if (p.boot !== boot || typeof p.sid !== "string" || !Number.isFinite(p.iat) || !Number.isFinite(p.exp) || p.iat > now() || p.exp <= now() || p.exp - p.iat > ttl || revoked.has(p.sid)) return null;
      return p;
    } catch { return null; }
  }
  function revoke(token) {
    const p = verify(token);
    if (!p) return;
    if (revoked.size >= 20000) { boot = crypto.randomBytes(24).toString("hex"); revoked.clear(); }
    else revoked.set(p.sid, p.exp);
  }
  return { issue, verify, revoke, version: value => sign(`credential:${value}`) };
}

function cookieValue(req, name) {
  const entry = String(req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith(name + "="));
  return entry ? entry.slice(name.length + 1) : "";
}

function createLoginLimiter({ now = Date.now, windowMs = 15 * 60000, accountLimit = 10, addressLimit = 200, capacity = 10000 } = {}) {
  const attempts = new Map();
  const keyHash = value => crypto.createHash("sha256").update(value).digest("hex");
  return function allow(req, account) {
    for (const [key, state] of attempts) if (state.until <= now()) attempts.delete(key);
    // Trust only the socket by default; never trust a client-supplied forwarding header.
    const address = req.socket?.remoteAddress || "unknown";
    const keys = [["a:" + keyHash(account), accountLimit], ["i:" + keyHash(address), addressLimit]];
    if (attempts.size + keys.filter(([key]) => !attempts.has(key)).length > capacity) return false;
    if (keys.some(([key, limit]) => (attempts.get(key)?.count || 0) >= limit)) return false;
    for (const [key] of keys) {
      const state = attempts.get(key) || { count: 0, until: now() + windowMs };
      state.count++; attempts.set(key, state);
    }
    return true;
  };
}

function allowCron(req, res, secret) {
  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json", allow: "POST", "cache-control": "no-store" });
    res.end(JSON.stringify({ error: "POST erforderlich." })); return false;
  }
  if (!secret || !constantEqual(req.headers["x-cron-secret"] || "", secret)) {
    res.writeHead(403, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ error: "Nicht erlaubt." })); return false;
  }
  return true;
}

module.exports = { constantEqual, createSessions, cookieValue, createLoginLimiter, allowCron };

function securityHeaders(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  if (process.env.RENDER === "true" || req.socket?.encrypted) res.setHeader("Strict-Transport-Security", "max-age=31536000");
  if (String(req.url || "").startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
}
module.exports.securityHeaders = securityHeaders;
