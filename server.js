"use strict";

require("./neon-query-cache");

const http = require("http");
const originalCreateServer = http.createServer.bind(http);
let scheduledRevenueDay = "";

function berlinDayAndHour() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    day: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour)
  };
}

http.createServer = function guardedCreateServer(listener, ...args) {
  return originalCreateServer((req, res) => {
    try {
      const pathname = new URL(req.url || "/", "http://localhost").pathname;
      if (pathname === "/api/jobs/revenue-import") {
        const { day, hour } = berlinDayAndHour();
        if (hour !== 8 || scheduledRevenueDay === day) {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: true, skipped: true, reason: "scheduled-import-only-once-between-08-and-09" }));
          return;
        }
        scheduledRevenueDay = day;
      }
    } catch {
      // Fall through to the normal app handler.
    }
    return listener(req, res);
  }, ...args);
};

const { startServer } = require("./server-core");

startServer().catch(error => {
  console.error(error);
  process.exit(1);
});
