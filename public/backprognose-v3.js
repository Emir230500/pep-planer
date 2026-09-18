"use strict";

// Backprognose Beta V3 – quality patch on top of V2.
// Keeps all raw sales local in the browser, improves legacy/new SKU matching
// and combines quarter-hour sales with daily action/writeoff information.

function bp3Canonical(value){
  let x = norm(value);
  x = x.replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2");
  x = x.replace(/\bnougatcr\b/g, "nougat");
  x = x.replace(/\bschokoladengla\b/g, "schokoladenglasur");
  x = x.replace(/\bcrodots\b/g, "crodot");
  x = x.replace(/sonnenblumenk(?:ern|er)?\s*batzen/g, "sonnenblumenkernbatzen");
  return x;
}

bp2Core = function(value){
  const stop = new Set([...BP2_STOP, "gbv", "gva"]);
  return bp3Canonical(value)
    .split(" ")
    .filter(Boolean)
    .filter(token => !stop.has(token))
    .filter(token => !/^\d+$/.test(token))
    .map(token => token === "croissants" ? "croissant" : (token === "donuts" ? "donut" : token))
    .join(" ");
};

bp2Daily = function(item){
  // Quarter-hour export is the primary source for sold quantities because it is
  // complete across the full history. Daily files enrich those rows with
  // promotions and writeoffs. This also prevents a short-lived/new article ID
  // from hiding older history for the same product family.
  const quarter = bp2Aggregate(item, state.quarterRows);
  const daily = bp2Aggregate(item, state.dailyRows);
  const merged = new Map(quarter.map(row => [row.date, {...row}]));

  for(const row of daily){
    const current = merged.get(row.date);
    if(current){
      current.writeoff = row.writeoff;
      current.actionQty = row.actionQty;
      if(!current.revenue) current.revenue = row.revenue;
      if(!current.qty) current.qty = row.qty;
    } else {
      merged.set(row.date, {...row});
    }
  }
  return [...merged.values()].sort((a,b) => a.date.localeCompare(b.date));
};

// Show model generation in the UI so test screenshots are unambiguous.
window.addEventListener("load", () => {
  const status = document.querySelector(".bp-status");
  if(status) status.textContent = "V3: Produktfamilien über alte/neue Artikelnummern hinweg, Viertelstunden-Abverkauf als Mengenbasis, Tagesdateien für Aktionen und Abschriften, robuste Freitags-/Wochentags-Historie und aktuelle Wochenentwicklung. Rohdaten bleiben lokal im Browser.";
});
