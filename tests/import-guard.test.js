"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { guardQuarterRows } = require("../bakery-import-guard");
const row = (qty = 10, slot = "08:00:00", date = "2026-09-23") => ({ no: "10000001", date, slot, qty, revenue: qty * 2 });
const resolve = item => r => ({ no: r.no, item, qty: r.qty });
test("repeated identical interval inside one report counted once", () => {
  const result = guardQuarterRows({}, [row(), row()], resolve(null));
  assert.equal(result.rows.length, 1); assert.equal(result.conflicts.length, 0);
});
test("previously imported totals never incremented by an overlapping report", () => {
  const item = { d: [["2026-09-23", 10, 20, 0, 0]] };
  const result = guardQuarterRows({}, [row()], resolve(item));
  assert.equal(result.rows.length, 0); assert.equal(result.conflicts.length, 0);
  const correction = guardQuarterRows({}, [row(12)], resolve(item));
  assert.equal(correction.rows.length, 0); assert.equal(correction.conflicts.length, 1);
  assert.equal(item.d[0][1], 10);
});
test("conflicting overlaps quarantined while new days are still imported", () => {
  const item = { d: [["2026-09-23", 10, 20, 0, 0]] };
  const result = guardQuarterRows({}, [row(12), row(7, "08:00:00", "2026-09-24")], resolve(item));
  assert.equal(result.conflicts.length, 1); assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].date, "2026-09-24");
});
test("conflicting duplicate interval does not pick an arbitrary value", () => {
  const result = guardQuarterRows({}, [row(10), row(20)], resolve(null));
  assert.equal(result.rows.length, 0); assert.equal(result.conflicts[0].reason, "conflicting-intervals");
});
