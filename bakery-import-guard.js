"use strict";

// No raw reports or interval ledger are retained. Existing totals are never
// incremented again by overlapping reports. Corrections need explicit review.
function guardQuarterRows(model, rows, resolveArticle) {
  const groups = new Map(), conflicts = [], kept = [];
  for (const row of rows) {
    const mapped = resolveArticle(row);
    if (!mapped) continue;
    const key = `${mapped.no}|${row.date}`;
    if (!groups.has(key)) groups.set(key, { no: mapped.no, date: row.date, item: mapped.item, entries: new Map(), conflict: false });
    const group = groups.get(key), sourceKey = `${row.no}|${row.slot}`;
    const previous = group.entries.get(sourceKey);
    if (previous && (+previous.row.qty !== +row.qty || +previous.row.revenue !== +row.revenue)) group.conflict = true;
    else group.entries.set(sourceKey, { row, qty: mapped.qty });
  }
  for (const group of groups.values()) {
    const previous = (group.item?.d || []).find(e => e[0] === group.date);
    const total = [...group.entries.values()].reduce((sum, x) => sum + x.qty, 0);
    const existing = previous ? Number(previous[1]) : null;
    if (group.conflict || (previous && Math.abs(existing - total) > 0.0001)) {
      conflicts.push({ article: group.no, date: group.date, reason: group.conflict ? "conflicting-intervals" : "overlapping-report", existing, incoming: total });
      continue;
    }
    if (!previous) kept.push(...[...group.entries.values()].map(x => x.row));
  }
  return { rows: kept, conflicts };
}

module.exports = { guardQuarterRows };
