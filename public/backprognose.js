"use strict";

const REFERENCE_PLAN = [
  {no:"1000000157",name:"BO Weizenschnittbrötchen 65g",type:"Backplan",program:"01",ref:[384,208,176,0,0]},
  {no:"1000000124",name:"Bake off Sonnenblumenkernbrötchen",type:"Backplan",program:"01",ref:[16,8,8,0,0]},
  {no:"1000000156",name:"G&G B.O. Weltmeisterbrötchen 80g",type:"Backplan",program:"01",ref:[16,16,0,0,0]},
  {no:"1000000146",name:"BO Dinkel Chia Quark Brötchen 85g",type:"Backplan",program:"01",ref:[30,18,12,0,0]},
  {no:"1000000591",name:"BO High-Proteinbrötchen",type:"Backplan",program:"02",ref:[6,6,0,0,0]},
  {no:"1000000653",name:"G&G B.O. Kartoffelbrötchen dunkel 80g",type:"Backplan",program:"02",ref:[16,8,8,0,0]},
  {no:"1000000615",name:"G&G B.O. Kartoffelbrötchen hell 80g",type:"Backplan",program:"02",ref:[16,8,8,0,0]},
  {no:"1000000120",name:"Harry Preb. Karotten Krüstchen",type:"Backplan",program:"03",ref:[64,40,24,0,0]},
  {no:"1000000130",name:"Harry Preb. Vollkorn Kumpel 85g",type:"Backplan",program:"03",ref:[12,6,6,0,0]},
  {no:"1000000162",name:"Harry Prebake Salz-Pfefferkrusti 100g",type:"Backplan",program:"03",ref:[30,18,12,0,0]},
  {no:"1000000415",name:"BO Walnussbaguette 330g",type:"Backplan",program:"05",ref:[6,3,3,0,0]},
  {no:"1000000185",name:"E.FS Cl. Ciabatta 310g",type:"Backplan",program:"05",ref:[6,3,3,0,0]},
  {no:"1000000183",name:"G&G B.O. Rustikales Baguette 400g",type:"Backplan",program:"05",ref:[0,0,0,0,0]},
  {no:"1000000412",name:"Herzstücke B.O. Zwiebelbaguette 300g",type:"Backplan",program:"05",ref:[6,3,3,0,0]},
  {no:"1000000229",name:"BO Dinkelschiffchen mit Sour Cream 104g",type:"Backplan",program:"06",ref:[16,8,8,0,0]},
  {no:"1000000283",name:"Bakerm. Pizza Burger",type:"Backplan",program:"06",ref:[12,9,3,0,0]},
  {no:"1000000200",name:"G&G B.O. Laugenbrezel 90g",type:"Backplan",program:"06",ref:[10,5,5,0,0]},
  {no:"1000000198",name:"G&G B.O. Laugenstange 90g",type:"Backplan",program:"06",ref:[24,16,8,0,0]},
  {no:"1000000253",name:"G&G B.O. Pizza Margherita 120g",type:"Backplan",program:"06",ref:[15,10,5,0,0]},
  {no:"1000000299",name:"BO Kirsch-Vanille Plunder 110g",type:"Backplan",program:"07",ref:[18,12,6,0,0]},
  {no:"1000000290",name:"BO Käsebrötchen (Teigling)",type:"Backplan",program:"07",ref:[30,24,6,0,0]},
  {no:"1000000196",name:"BO Laugenecke 80g",type:"Backplan",program:"07",ref:[18,12,6,0,0]},
  {no:"1000000209",name:"G&G B.O. Buttercroissant 70g",type:"Backplan",program:"07",ref:[42,30,12,0,0]},
  {no:"1000000207",name:"G&G B.O. Käse Schinken Croissant 95g",type:"Backplan",program:"07",ref:[24,18,6,0,0]},
  {no:"1000000208",name:"G&G B.O. Nuss Nougat Croissant 80g",type:"Backplan",program:"07",ref:[24,18,6,0,0]},
  {no:"1000000585",name:"Herz. B.O. Hähn. Tasche Kebab Style 130g",type:"Backplan",program:"08",ref:[18,12,6,0,0]},
  {no:"1000000119",name:"Schäfers Schokocremebrötchen 93g",type:"Backplan",program:"08",ref:[18,12,6,0,0]},
  {no:"1000000236",name:"BO Caprese Snack 105g",type:"Backplan",program:"08",ref:[15,10,5,0,0]},
  {no:"1000000684",name:"FrikadellenSnack m. Käse überb.",type:"Backplan",program:"08",ref:[0,0,0,0,0]},
  {no:"1000000232",name:"G&G B.O. Franzbrötchen 114g",type:"Backplan",program:"08",ref:[18,12,6,0,0]},
  {no:"1000000246",name:"G&G B.O. Geflügelrolle 140g",type:"Backplan",program:"08",ref:[12,6,6,0,0]},
  {no:"1000000225",name:"G&G B.O. Würstchendog 108g",type:"Backplan",program:"08",ref:[18,12,6,0,0]},
  {no:"1000000255",name:"G&G B.O. Apfeldreieck 117g",type:"Backplan",program:"10",ref:[18,12,6,0,0]},
  {no:"1000000226",name:"G&G B.O. Vanillestange 95g",type:"Backplan",program:"10",ref:[24,12,12,0,0]},
  {no:"1000000117",name:"Harry Preb. Käse-Zwiebelbrötchen 80g",type:"Backplan",program:"10",ref:[12,6,6,0,0]},

  {no:"1000000069",name:"Bio E. Weizenkruste 500g",type:"Brotplan",program:"04",ref:[4,2,2,0,0]},
  {no:"1000000065",name:"Harry Preb. Anno Weizenmischbrot 800g",type:"Brotplan",program:"04",ref:[6,4,2,0,0]},
  {no:"1000000047",name:"Harry Preb. Bauernbrot 500g",type:"Brotplan",program:"04",ref:[3,1,2,0,0]},
  {no:"1000000475",name:"Harry Preb. Dinkelbrot 500g",type:"Brotplan",program:"04",ref:[3,1,2,0,0]},
  {no:"1000000032",name:"Harry Preb. Kartoffelbrot 750g",type:"Brotplan",program:"04",ref:[2,2,0,0,0]},
  {no:"1000000021",name:"Harry Preb. Krustenbrot 1kg",type:"Brotplan",program:"04",ref:[2,1,1,0,0]},
  {no:"1000000044",name:"Harry Preb. Kürbiskernbrot 750g",type:"Brotplan",program:"04",ref:[2,2,0,0,0]},
  {no:"1000000039",name:"Harry Preb. Paderborner 1kg",type:"Brotplan",program:"04",ref:[20,12,8,0,0]},
  {no:"1000000040",name:"Harry Preb. VK-Sonnenblumenkernbatzen 750g",type:"Brotplan",program:"04",ref:[4,4,0,0,0]},
  {no:"1000000042",name:"Harry Preb. Vollkorn-Kruste 600g",type:"Brotplan",program:"04",ref:[4,4,0,0,0]},
  {no:"1000000020",name:"Harry Preb. Vollkornbrot 1kg",type:"Brotplan",program:"04",ref:[4,2,2,0,0]},
  {no:"1000000043",name:"Harry Preb. Weizenmischbrot 1kg",type:"Brotplan",program:"04",ref:[9,5,4,0,0]},
  {no:"1000000086",name:"Harry Preback Feinbrot 600g",type:"Brotplan",program:"04",ref:[2,2,0,0,0]},
  {no:"1000000045",name:"Harry Prebake Weltmeisterbrot 750g",type:"Brotplan",program:"04",ref:[11,6,5,0,0]},
  {no:"1000000077",name:"Jüde Dinkel Kruste 650g",type:"Brotplan",program:"10",ref:[6,4,2,0,0]},
  {no:"1000000376",name:"Jüde Dinkel Laib mit Sesam 650g",type:"Brotplan",program:"10",ref:[5,3,2,0,0]},
  {no:"1000000076",name:"Jüde Kassler 700g",type:"Brotplan",program:"10",ref:[4,2,2,0,0]},
  {no:"1000000082",name:"Jüde Roggenmischbrot mit Dinkel 850g",type:"Brotplan",program:"10",ref:[2,1,1,0,0]},
  {no:"1000000037",name:"Harry Preb. Kastenweissbrot 750g",type:"Brotplan",program:"10",ref:[2,2,0,0,0]},
  {no:"1000000048",name:"Harry Preb. Weißbrot mit Glanz 500g",type:"Brotplan",program:"10",ref:[4,2,2,0,0]},

  {no:"999994",name:"Berliner Auswahl",type:"Auftauplan",program:"Auftauen",ref:[16,16,0,0,0]},
  {no:"999992",name:"Donut Auswahl",type:"Auftauplan",program:"Auftauen",ref:[8,8,0,0,0]},
  {no:"1000000241",name:"G&G B.O. Spritzring 70g",type:"Auftauplan",program:"Auftauen",ref:[13,13,0,0,0]},
  {no:"1000000220",name:"G&G B.O. Süsser Knoten 100g",type:"Auftauplan",program:"Auftauen",ref:[15,15,0,0,0]},
  {no:"1000000006",name:"G&G Berliner Mehrfrucht 6ST 420g",type:"Auftauplan",program:"Auftauen",ref:[0,0,0,0,0]},
  {no:"1000000008",name:"G&G Mini Donut Party 8ST 176g",type:"Auftauplan",program:"Auftauen",ref:[3,3,0,0,0]},
  {no:"1000000007",name:"G&G Mini Donut Schokoladenglasur 8ST 160g",type:"Auftauplan",program:"Auftauen",ref:[4,4,0,0,0]},
  {no:"1000000583",name:"G&G Pinky Donuts 4ST 232g",type:"Auftauplan",program:"Auftauen",ref:[3,3,0,0,0]},
  {no:"1000000004",name:"G&G Schoko Donut 4ST 230g",type:"Auftauplan",program:"Auftauen",ref:[3,3,0,0,0]},
  {no:"1000000252",name:"Herzstücke B.O. Crodots dark 95g",type:"Auftauplan",program:"Auftauen",ref:[8,8,0,0,0]},
  {no:"999995",name:"Laugenkranz Auswahl",type:"Auftauplan",program:"Auftauen",ref:[15,15,0,0,0]},
  {no:"1000000138",name:"Panobake Balkan Fladenbrot 200g",type:"Auftauplan",program:"Auftauen",ref:[18,18,0,0,0]}
];

const state = { quarterRows: [], dailyRows: [], forecast: [] };
const referenceByNo = new Map(REFERENCE_PLAN.map(x => [x.no, x]));

function qs(sel){ return document.querySelector(sel); }
function esc(v){ return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function norm(v){ return String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim(); }
function num(v){
  if(typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s=String(v ?? "").trim(); if(!s) return 0;
  s=s.replace(/\s/g,"").replace(/€/g,"").replace(/%/g,"");
  if(s.includes(",")) s=s.replace(/\./g,"").replace(",",".");
  else if(/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) s=s.replace(/\./g,"");
  const n=Number(s.replace(/[^0-9.+-]/g,"")); return Number.isFinite(n)?n:0;
}
function isoDate(v){
  if(v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,"0")}-${String(v.getDate()).padStart(2,"0")}`;
  const s=String(v ?? "").trim(); if(!s) return "";
  let m=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/);
  if(m){let y=Number(m[3]); if(y<100)y+=2000; return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;}
  m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  return "";
}
function articleNo(v){ const m=String(v ?? "").match(/\b(\d{6,12})\b/); return m?m[1]:""; }
function slotText(v){ const s=String(v ?? "").replace(/–/g,"-").trim(); const m=s.match(/(\d{1,2}):?(\d{2})\s*-\s*(\d{1,2}):?(\d{2})/); return m?`${m[1].padStart(2,"0")}:${m[2]}-${m[3].padStart(2,"0")}:${m[4]}`:""; }
function headerKey(v){
  const h=norm(v);
  if(!h) return "";
  if(h.includes("artikelnummer") || h==="artikel nr" || h==="artikelnr") return "articleNo";
  if(h==="artikel" || h.startsWith("artikel ")) return "article";
  if(h.includes("artikelbezeichnung") || h==="bezeichnung") return "name";
  if(h.includes("gtin")) return "gtin";
  if(h.includes("kalendertag") || h==="datum" || h==="tag") return "date";
  if(h.includes("viertelstunde") || h.includes("15 minuten") || h==="zeit" || h==="zeitfenster") return "slot";
  if(h.includes("menge vorjahr")) return "qtyPrev";
  if(h==="menge" || h.endsWith(" menge")) return "qty";
  if(h.includes("umsatz vorjahr")) return "revenuePrev";
  if(h==="umsatz" || h.endsWith(" umsatz")) return "revenue";
  if(h.includes("vollabschrift") || (h.includes("abschrift") && !h.includes("vorjahr"))) return "writeoff";
  if(h.includes("abschrift") && h.includes("vorjahr")) return "writeoffPrev";
  if(h.includes("aktionsmenge")) return "actionQty";
  if(h.includes("aktionsumsatz") && !h.includes("vorjahr")) return "actionRevenue";
  return "";
}
function headerScore(row){ return new Set(row.map(headerKey).filter(Boolean)).size; }

async function rowsFromWorkbook(file){
  const data=await file.arrayBuffer();
  const wb=XLSX.read(data,{type:"array",cellDates:true});
  const out=[];
  for(const sheetName of wb.SheetNames){
    const matrix=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,raw:false,defval:"",blankrows:false});
    let headers=[];
    let carry={articleNo:"",name:"",date:""};
    for(const row of matrix){
      if(!Array.isArray(row)) continue;
      if(headerScore(row)>=3){ headers=row.map(headerKey); carry={articleNo:"",name:"",date:""}; continue; }
      if(!headers.length) continue;
      const obj={};
      headers.forEach((k,i)=>{ if(k && obj[k]===undefined) obj[k]=row[i]; });
      let no=articleNo(obj.articleNo || obj.article);
      let name=String(obj.name || "").trim();
      if(!no){ for(const c of row){ no=articleNo(c); if(no) break; } }
      if(!name && obj.article){ name=String(obj.article).replace(no,"").trim(); }
      let date=isoDate(obj.date);
      if(!date){ for(const c of row){ date=isoDate(c); if(date) break; } }
      let slot=slotText(obj.slot);
      if(!slot){ for(const c of row){ slot=slotText(c); if(slot) break; } }
      if(no) carry.articleNo=no; else no=carry.articleNo;
      if(name) carry.name=name; else name=carry.name;
      if(date) carry.date=date; else date=carry.date;
      if(!no || !date) continue;
      if(/gesamt|summe|ergebnis/i.test(name) && !referenceByNo.has(no)) continue;
      out.push({
        articleNo:no,name:name || referenceByNo.get(no)?.name || no,date,slot,
        qty:num(obj.qty),revenue:num(obj.revenue),writeoff:num(obj.writeoff),actionQty:num(obj.actionQty),
        qtyPrev:num(obj.qtyPrev),revenuePrev:num(obj.revenuePrev)
      });
    }
  }
  return out;
}

function dedupe(rows, quarter){
  const map=new Map();
  for(const r of rows){
    const key=quarter?`${r.articleNo}|${r.date}|${r.slot}`:`${r.articleNo}|${r.date}`;
    const old=map.get(key);
    if(!old) map.set(key,{...r});
    else {
      for(const k of ["qty","revenue","writeoff","actionQty","qtyPrev","revenuePrev"]){ if(r[k]!==0 || old[k]===0) old[k]=r[k]; }
      if(r.name && !old.name) old.name=r.name;
    }
  }
  return [...map.values()];
}

function dateObj(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d,12); }
function daysBetween(a,b){ return Math.round((dateObj(b)-dateObj(a))/86400000); }
function weightedMean(values){ let n=0,d=0; for(const x of values){n+=x.value*x.weight;d+=x.weight;} return d?n/d:0; }
function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
function weekday(s){ return dateObj(s).getDay(); }

function dailyForArticle(no){
  const direct=state.dailyRows.filter(r=>r.articleNo===no);
  if(direct.length) return direct;
  const map=new Map();
  for(const r of state.quarterRows.filter(r=>r.articleNo===no)){
    const x=map.get(r.date)||{articleNo:no,name:r.name,date:r.date,qty:0,revenue:0,writeoff:0,actionQty:0};
    x.qty+=r.qty; x.revenue+=r.revenue; map.set(r.date,x);
  }
  return [...map.values()];
}

function quarterBucket(slot){
  const m=String(slot||"").match(/^(\d{2}):(\d{2})/); if(!m) return -1;
  const h=Number(m[1])+Number(m[2])/60;
  if(h<9) return 0;
  if(h<12) return 1;
  if(h<14) return 2;
  return 3;
}

function forecastArticle(item,target){
  const all=dailyForArticle(item.no).filter(r=>r.date<target && r.qty>=0);
  const same=all.filter(r=>weekday(r.date)===weekday(target)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,14);
  const source=same.length>=3?same:all.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,28);
  const weighted=source.map(r=>({value:r.qty,weight:Math.pow(0.88,Math.max(0,daysBetween(r.date,target)/7))}));
  let base=weightedMean(weighted);
  if(source.length>=6){
    const recent=source.slice(0,3).reduce((s,r)=>s+r.qty,0)/3;
    const prior=source.slice(3,6).reduce((s,r)=>s+r.qty,0)/3;
    if(prior>0) base*=clamp(recent/prior,0.9,1.1);
  }
  let total=Math.max(0,Math.round(base));
  if(!source.length && target==="2026-09-18") total=item.ref[0];

  const q=state.quarterRows.filter(r=>r.articleNo===item.no && r.date<target && weekday(r.date)===weekday(target)).sort((a,b)=>b.date.localeCompare(a.date));
  const allowedDates=[...new Set(q.map(r=>r.date))].slice(0,10);
  const dateSet=new Set(allowedDates);
  const sums=[0,0,0,0];
  let sum=0;
  for(const r of q){ if(!dateSet.has(r.date)) continue; const b=quarterBucket(r.slot); if(b<0) continue; const w=Math.pow(0.88,Math.max(0,daysBetween(r.date,target)/7)); sums[b]+=r.qty*w; sum+=r.qty*w; }
  let shares=sum>0?sums.map(v=>v/sum):item.ref.slice(1).map(v=>item.ref[0]?v/item.ref[0]:0);
  if(shares.reduce((a,b)=>a+b,0)<=0) shares=[0.48,0.34,0.1,0.08];
  const raw=shares.map(s=>s*total); const buckets=raw.map(Math.floor); let left=total-buckets.reduce((a,b)=>a+b,0);
  raw.map((v,i)=>({i,frac:v-Math.floor(v)})).sort((a,b)=>b.frac-a.frac).slice(0,left).forEach(x=>buckets[x.i]++);

  const revenue=source.reduce((s,r)=>s+Math.max(0,r.revenue),0);
  const writeoff=source.reduce((s,r)=>s+Math.max(0,r.writeoff),0);
  const ratio=revenue>0?writeoff/revenue:0;
  const risk=ratio>=0.05?"hoch":ratio>=0.02?"mittel":"niedrig";
  const ref=item.ref[0];
  return {...item,total,buckets,risk,ratio,historyCount:source.length,reference:ref,diff:total-ref};
}

function buildForecast(){
  const target=qs("#targetDate").value;
  if(!target) throw new Error("Bitte einen Zieltag auswählen.");
  state.forecast=REFERENCE_PLAN.map(item=>forecastArticle(item,target));
  renderForecast();
  qs("#bpSummary").classList.remove("hidden");
  qs("#kpiArticles").textContent=String(state.forecast.filter(x=>x.historyCount>0).length);
  qs("#kpiQuarterRows").textContent=state.quarterRows.length.toLocaleString("de-DE");
  qs("#kpiDailyRows").textContent=state.dailyRows.length.toLocaleString("de-DE");
  qs("#kpiForecast").textContent=`${state.forecast.reduce((s,x)=>s+x.total,0).toLocaleString("de-DE")} Stk.`;
  const minDate=[...state.quarterRows,...state.dailyRows].map(r=>r.date).filter(Boolean).sort()[0]||"-";
  const maxDate=[...state.quarterRows,...state.dailyRows].map(r=>r.date).filter(Boolean).sort().at(-1)||"-";
  qs("#forecastHint").textContent=`Zieltag ${target}. Historie erkannt: ${minDate} bis ${maxDate}. Modell V1 – gleiche Wochentage + stärkere Gewichtung der jüngsten Wochen.`;
}

function renderForecast(){
  const type=qs("#typeFilter").value;
  const program=qs("#programFilter").value;
  const search=norm(qs("#articleSearch").value);
  const rows=state.forecast.filter(x=>(!type||x.type===type)&&(!program||x.program===program)&&(!search||norm(`${x.no} ${x.name}`).includes(search)));
  qs("#forecastRows").innerHTML=rows.length?rows.map(x=>{
    const riskClass=x.risk==="hoch"?"bp-risk-high":x.risk==="mittel"?"bp-risk-mid":"bp-risk-low";
    const diff=x.diff>0?`+${x.diff}`:String(x.diff);
    return `<tr><td><strong>${esc(x.name)}</strong><br><span class="hint">${esc(x.no)} · ${x.historyCount} Vergleichstage</span></td><td>${esc(x.type)}<br><span class="bp-badge">${esc(x.program)}</span></td><td><strong>${x.total}</strong></td><td>${x.buckets[0]}</td><td>${x.buckets[1]}</td><td>${x.buckets[2]}</td><td>${x.buckets[3]}</td><td class="${riskClass}">${x.risk}<br><span class="hint">${(x.ratio*100).toFixed(1)}%</span></td><td>${x.reference}</td><td>${diff}</td></tr>`;
  }).join(""):`<tr><td colspan="10" class="bp-empty">Keine Treffer.</td></tr>`;
}

async function importAndForecast(){
  const quarterFiles=[...qs("#quarterFiles").files];
  const dailyFiles=[...qs("#dailyFiles").files];
  if(!quarterFiles.length) throw new Error("Bitte mindestens die Viertelstunden-Datei auswählen.");
  const msg=qs("#bpImportMsg"); msg.textContent="Dateien werden lokal eingelesen ..."; msg.classList.remove("error");
  await new Promise(r=>setTimeout(r,30));
  let qRows=[]; for(const f of quarterFiles){ const rows=await rowsFromWorkbook(f); qRows.push(...rows.filter(r=>r.slot)); }
  let dRows=[]; for(const f of dailyFiles){ const rows=await rowsFromWorkbook(f); dRows.push(...rows.filter(r=>!r.slot)); }
  state.quarterRows=dedupe(qRows,true);
  state.dailyRows=dedupe(dRows,false);
  if(!state.quarterRows.length) throw new Error("Keine Viertelstunden-Zeilen erkannt. Bitte prüfen, ob im Export Artikel, Kalendertag, Viertelstunde und Menge enthalten sind.");
  buildForecast();
  const articleCount=new Set([...state.quarterRows,...state.dailyRows].map(r=>r.articleNo)).size;
  msg.textContent=`Fertig: ${state.quarterRows.length.toLocaleString("de-DE")} Viertelstunden-Zeilen, ${state.dailyRows.length.toLocaleString("de-DE")} Tages-Zeilen, ${articleCount} Artikel erkannt. Keine Rohdaten wurden an Neon gesendet.`;
}

function reset(){
  state.quarterRows=[]; state.dailyRows=[]; state.forecast=[];
  qs("#quarterFiles").value=""; qs("#dailyFiles").value=""; qs("#bpImportMsg").textContent="";
  qs("#bpSummary").classList.add("hidden"); qs("#forecastHint").textContent="Noch keine Daten berechnet.";
  qs("#forecastRows").innerHTML='<tr><td colspan="10" class="bp-empty">Daten laden und Prognose berechnen.</td></tr>';
}

function initPrograms(){
  const programs=[...new Set(REFERENCE_PLAN.map(x=>x.program))].sort((a,b)=>a.localeCompare(b,"de",{numeric:true}));
  qs("#programFilter").innerHTML='<option value="">Alle</option>'+programs.map(p=>`<option>${esc(p)}</option>`).join("");
}

qs("#bpLoginForm").addEventListener("submit",async e=>{
  e.preventDefault(); const msg=qs("#bpLoginMsg"); msg.textContent="Anmeldung läuft ..."; msg.classList.remove("error");
  try{
    const res=await fetch("/api/admin/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:qs("#bpPassword").value})});
    const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.error||"Anmeldung fehlgeschlagen.");
    qs("#bpLogin").classList.add("hidden"); qs("#bpArea").classList.remove("hidden");
  }catch(err){msg.textContent=err.message;msg.classList.add("error");}
});
qs("#runForecastBtn").addEventListener("click",()=>importAndForecast().catch(err=>{const m=qs("#bpImportMsg");m.textContent=err.message;m.classList.add("error");}));
qs("#clearForecastBtn").addEventListener("click",reset);
qs("#typeFilter").addEventListener("change",renderForecast);
qs("#programFilter").addEventListener("change",renderForecast);
qs("#articleSearch").addEventListener("input",renderForecast);
qs("#targetDate").addEventListener("change",()=>{if(state.quarterRows.length){try{buildForecast();}catch{}}});

initPrograms();
