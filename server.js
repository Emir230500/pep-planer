"use strict";

require("./neon-query-cache");

const http = require("http");
const originalCreateServer = http.createServer.bind(http);
const scheduledRevenueSlots = new Set();

function berlinDayHourMinute() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    day: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

function revenueSlot(day, hour, minute) {
  const allowed = (hour === 8 && [0, 15, 30, 45].includes(minute)) || (hour === 9 && minute === 0);
  return allowed ? `${day}-${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : "";
}

http.createServer = function guardedCreateServer(listener, ...args) {
  return originalCreateServer((req, res) => {
    try {
      const pathname = new URL(req.url || "/", "http://localhost").pathname;
      if (pathname === "/api/jobs/revenue-import") {
        const { day, hour, minute } = berlinDayHourMinute();
        const slot = revenueSlot(day, hour, minute);
        if (!slot || scheduledRevenueSlots.has(slot)) {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: true, skipped: true, reason: "scheduled-import-checkpoints-08-00-08-15-08-30-08-45-09-00" }));
          return;
        }
        scheduledRevenueSlots.add(slot);
        for (const saved of Array.from(scheduledRevenueSlots)) {
          if (!saved.startsWith(day)) scheduledRevenueSlots.delete(saved);
        }
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
