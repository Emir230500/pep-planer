"use strict";

// Backprognose Beta V2: robust article-family matching, weighted bread quantities,
// safer local-only cache and an efficiency-oriented production recommendation.
const BP_DB_NAME = "pep-backprognose-beta";
const BP_STORE = "datasets";
const BP_KEY = "market14-v2";

const bp2BaseHeaderKey = headerKey;
headerKey = function(v){
  const h = norm(v);
  if(h.includes("menge aktion") || h.includes("aktionsmenge")) return "actionQty";
  if(h.includes("vollabschrift") || (h.includes("abschrift") && !h.includes("vorjahr"))) return "writeoff";
  return bp2BaseHeaderKey(v);
};

function bp2Headers(row){
  const keys = row.map(headerKey);
  for(let i=0;i<keys.length;i++){
    if(keys[i]) continue;
    const prev = keys[i-1] || "";
    const next = keys[i+1] || "";
    if((prev === "article" || prev === "articleNo") && (next === "gtin" || !next)) keys[i] = "name";
  }
  return keys;
}

rowsFromWorkbook = async function(file){
  const data=await file.arrayBuffer();
  const wb=XLSX.read(data,{type:"array",cellDates:true});
  const out=[];
  for(const sheetName of wb.SheetNames){
    const matrix=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,raw:false,defval:"",blankrows:false});
    let headers=[];
    let carry={articleNo:"",name:"",date:""};
    for(const row of matrix){
      if(!Array.isArray(row)) continue;
      if(headerScore(row)>=3){ headers=bp2Headers(row); carry={articleNo:"",name:"",date:""}; continue; }
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
      if(/gesamt|summe|ergebnis/i.test(name)) continue;
      out.push({
        articleNo:no,name,date,slot,
        qty:num(obj.qty),revenue:num(obj.revenue),writeoff:num(obj.writeoff),actionQty:num(obj.actionQty),
        qtyPrev:num(obj.qtyPrev),revenuePrev:num(obj.revenuePrev)
      });
    }
  }
  return out;
};

const BP2_STOP = new Set("g gg b o bo harry preb prebake preback pb bake off bio e fs cl herzstucke herz schaefers schafers jude juede bakerm panobake deh h s ef afs ary europ filly csm topkauf brink edeka gut gunstig ca bv va kg g st stk gramm geschn geschnitten vorgeschnitten vorg".split(" "));
function bp2Core(value){
  return norm(value).split(" ").filter(Boolean).filter(t=>!BP2_STOP.has(t)).filter(t=>!/^\d+(?:g|kg|st)?$/.test(t)).map(t=>t==="croissants"?"croissant":t==="donuts"?"donut":t).join(" ");
}
function bp2Brand(value){
  const s=norm(value);
  if(s.includes("jude")) return "juede";
  if(s.includes("harry")) return "harry";
  if(s.includes("schafers")) return "schaefers";
  if(s.includes("panobake")) return "panobake";
  if(s.includes("e fs")) return "efs";
  if(s.includes("herz")) return "herz";
  if(s.includes("g g")) return "gg";
  if(s.includes("bio e")) return "bioe";
  return "";
}
function bp2BrandCompatible(itemName,rowName){
  const a=bp2Brand(itemName), b=bp2Brand(rowName);
  if(["juede","harry","schaefers","panobake","efs","herz","bioe"].includes(a)) return a===b;
  if(a==="gg") return b==="gg" || b==="";
  return true;
}
function bp2LoosePack(name){ return /\b(?:4|6|8|12)\s*st\b/i.test(norm(name)); }
function bp2Matches(item,row){
  const name=String(row?.name||"");
  if(!name) return false;
  if(item.name==="Berliner Auswahl") return bp2Core(name).includes("berliner") && !bp2LoosePack(name);
  if(item.name==="Donut Auswahl") return bp2Core(name).includes("donut") && !bp2LoosePack(name) && !bp2Core(name).includes("crodot");
  if(item.name==="Laugenkranz Auswahl") return bp2Core(name).includes("laugenkranz");
  return bp2Core(item.name)===bp2Core(name) && bp2BrandCompatible(item.name,name);
}
function bp2WeightKg(name){
  const matches=[...String(name||"").matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/gi)];
  if(!matches.length) return 0;
  const m=matches[matches.length-1];
  const n=Number(String(m[1]).replace(",","."));
  return m[2].toLowerCase()==="kg"?n:n/1000;
}
function bp2Qty(item,row){
  const q=Math.max(0,num(row.qty));
  if(!q) return 0;
  const fractional=Math.abs(q-Math.round(q))>0.0001;
  if(!fractional) return q;
  const kg=bp2WeightKg(item.name);
  const bakeryWeight=/brot|baguette|ciabatta|kruste|kassler|paderborner|laib/i.test(norm(item.name));
  return fractional && kg>0 && bakeryWeight ? q/kg : q;
}
function bp2Aggregate(item,rows){
  const map=new Map();
  for(const r of rows){
    if(!bp2Matches(item,r)) continue;
    const x=map.get(r.date)||{articleNo:item.no,name:item.name,date:r.date,qty:0,revenue:0,writeoff:0,actionQty:0};
    x.qty+=bp2Qty(item,r);
    x.revenue+=Math.max(0,num(r.revenue));
    x.writeoff+=Math.abs(num(r.writeoff));
    x.actionQty+=Math.max(0,num(r.actionQty));
    map.set(r.date,x);
  }
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function bp2Daily(item){
  const d=bp2Aggregate(item,state.dailyRows);
  if(d.length) return d;
  return bp2Aggregate(item,state.quarterRows);
}
function bp2Median(values){
  const a=values.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length) return 0;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function bp2AddDays(iso,days){ const d=dateObj(iso); d.setDate(d.getDate()+days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function bp2WeekStart(iso){ const d=dateObj(iso); const shift=(d.getDay()+6)%7; d.setDate(d.getDate()-shift); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function bp2Momentum(item,target,daily){
  const byDate=new Map(daily.map(r=>[r.date,r]));
  const start=bp2WeekStart(target);
  const targetDow=weekday(target);
  const current=[];
  for(let i=0;i<Math.max(0,targetDow-1);i++){ const r=byDate.get(bp2AddDays(start,i)); if(r) current.push(r.qty); }
  if(current.length<2) return 1;
  const hist=[];
  for(let w=1;w<=4;w++){
    for(let i=0;i<Math.max(0,targetDow-1);i++){
      const r=byDate.get(bp2AddDays(start,i-7*w)); if(r) hist.push(r.qty);
    }
  }
  if(hist.length<4 || bp2Median(hist)<=0) return 1;
  const ratio=(current.reduce((a,b)=>a+b,0)/current.length)/(hist.reduce((a,b)=>a+b,0)/hist.length);
  return 1+0.25*(clamp(ratio,0.8,1.25)-1);
}
function bp2Seasonal(item,target){
  const year=Number(target.slice(0,4))-1, month=target.slice(5,7), wd=weekday(target);
  const q=bp2Aggregate(item,state.quarterRows).filter(r=>r.date.startsWith(`${year}-${month}-`) && weekday(r.date)===wd);
  return q.length>=2?bp2Median(q.map(r=>r.qty)):null;
}
function bp2Gcd(a,b){ while(b){const t=a%b;a=b;b=t;}return Math.abs(a); }
function bp2Batch(item){
  if(item.type!=="Backplan") return 1;
  const vals=item.ref.slice(1).filter(v=>v>0).map(v=>Math.round(v));
  if(vals.length>=2){ let g=vals[0]; for(const v of vals.slice(1)) g=bp2Gcd(g,v); return clamp(g,1,8); }
  if(item.ref[0]>=12) return 3;
  if(item.ref[0]>=6) return 2;
  return 1;
}
function bp2RoundUp(v,step){ if(v<=0) return 0; return Math.ceil(v/step)*step; }
function bp2QuarterBuckets(item,target){
  const rows=state.quarterRows.filter(r=>r.date<target && weekday(r.date)===weekday(target) && bp2Matches(item,r));
  const dates=[...new Set(rows.map(r=>r.date))].sort().reverse().slice(0,8);
  const allowed=new Set(dates), sums=[0,0,0,0]; let sum=0;
  for(const r of rows){
    if(!allowed.has(r.date)) continue;
    const b=quarterBucket(r.slot); if(b<0) continue;
    const w=Math.pow(0.86,Math.max(0,daysBetween(r.date,target)/7));
    const q=bp2Qty(item,r)*w; sums[b]+=q; sum+=q;
  }
  if(sum<=0) return null;
  return sums.map(v=>v/sum);
}
function bp2Allocate(total,shares){
  const raw=shares.map(s=>s*total), out=raw.map(Math.floor); let left=total-out.reduce((a,b)=>a+b,0);
  raw.map((v,i)=>({i,f:v-Math.floor(v)})).sort((a,b)=>b.f-a.f).slice(0,left).forEach(x=>out[x.i]++);
  return out;
}

forecastArticle = function(item,target){
  const all=bp2Daily(item).filter(r=>r.date<target && r.qty>=0);
  const same=all.filter(r=>weekday(r.date)===weekday(target)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
  const source=same.length>=3?same:all.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,24);
  let sales=0;
  if(source.length){
    const recent=source.slice(0,Math.min(6,source.length));
    const med=bp2Median(recent.map(r=>r.qty));
    const weighted=weightedMean(source.map((r,i)=>({value:r.qty,weight:Math.pow(0.84,i)})));
    sales=0.65*med+0.35*weighted;
    sales*=bp2Momentum(item,target,all);
    const seasonal=bp2Seasonal(item,target);
    if(seasonal!==null) sales=0.9*sales+0.1*seasonal;
  }
  const revenue=source.reduce((s,r)=>s+r.revenue,0);
  const writeoff=source.reduce((s,r)=>s+r.writeoff,0);
  const ratio=revenue+writeoff>0?writeoff/(revenue+writeoff):0;
  const buffer=clamp(0.06-0.4*ratio,0.01,0.06);
  const batch=bp2Batch(item);
  let total=source.length?bp2RoundUp(sales*(1+buffer),batch):0;
  if(!source.length && target==="2026-09-18") total=item.ref[0];

  let buckets;
  if(item.type==="Auftauplan") buckets=[total,0,0,0];
  else {
    let shares=bp2QuarterBuckets(item,target);
    if(!shares || shares.reduce((a,b)=>a+b,0)<=0){
      shares=item.ref[0]>0?item.ref.slice(1).map(v=>v/item.ref[0]):[0.45,0.35,0.12,0.08];
      const s=shares.reduce((a,b)=>a+b,0); if(s>0) shares=shares.map(v=>v/s); else shares=[0.45,0.35,0.12,0.08];
    }
    buckets=bp2Allocate(total,shares);
  }
  const risk=ratio>=0.08?"hoch":ratio>=0.035?"mittel":"niedrig";
  return {...item,total,buckets,risk,ratio,historyCount:source.length,reference:item.ref[0],diff:total-item.ref[0],salesForecast:sales,buffer,batch};
};

function bp2PotentiallyRelevant(row){
  const c=bp2Core(row.name);
  if(!c) return false;
  if(c.includes("berliner") || c.includes("donut") || c.includes("laugenkranz")) return true;
  return REFERENCE_PLAN.some(item=>bp2Core(item.name)===c);
}
function bp2OpenDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(BP_DB_NAME,1);
    req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(BP_STORE)) req.result.createObjectStore(BP_STORE); };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
async function bp2SaveDataset(){
  const db=await bp2OpenDb();
  const payload={savedAt:new Date().toISOString(),quarterRows:state.quarterRows.filter(bp2PotentiallyRelevant),dailyRows:state.dailyRows.filter(bp2PotentiallyRelevant)};
  await new Promise((resolve,reject)=>{ const tx=db.transaction(BP_STORE,"readwrite"); tx.objectStore(BP_STORE).put(payload,BP_KEY); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); });
  db.close();
}
async function bp2LoadDataset(){
  const db=await bp2OpenDb();
  const value=await new Promise((resolve,reject)=>{ const tx=db.transaction(BP_STORE,"readonly"); const req=tx.objectStore(BP_STORE).get(BP_KEY); req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error); });
  db.close(); return value;
}

importAndForecast = async function(){
  const quarterFiles=[...qs("#quarterFiles").files];
  const dailyFiles=[...qs("#dailyFiles").files];
  if(!quarterFiles.length) throw new Error("Bitte mindestens die Viertelstunden-Datei auswählen.");
  const msg=qs("#bpImportMsg"); msg.textContent="Dateien werden lokal eingelesen ..."; msg.classList.remove("error");
  await new Promise(r=>setTimeout(r,30));
  let qRows=[]; for(const f of quarterFiles){ const rows=await rowsFromWorkbook(f); qRows.push(...rows.filter(r=>r.slot)); }
  let dRows=[]; for(const f of dailyFiles){ const rows=await rowsFromWorkbook(f); dRows.push(...rows.filter(r=>!r.slot)); }
  state.quarterRows=dedupe(qRows,true);
  state.dailyRows=dedupe(dRows,false);
  if(!state.quarterRows.length) throw new Error("Keine Viertelstunden-Zeilen erkannt. Bitte Artikel, Kalendertag, Viertelstunde und Menge prüfen.");
  buildForecast();
  const matched=REFERENCE_PLAN.filter(item=>bp2Daily(item).length).length;
  msg.textContent=`Fertig: ${state.quarterRows.length.toLocaleString("de-DE")} Viertelstunden-Zeilen, ${state.dailyRows.length.toLocaleString("de-DE")} Tages-Zeilen. ${matched}/${REFERENCE_PLAN.length} Produktionsartikel historisch zugeordnet. Rohdaten bleiben lokal und gehen nicht an Neon.`;
  try{ await bp2SaveDataset(); msg.textContent += " Relevante Daten wurden nur in diesem Browser gespeichert."; }catch(error){ console.warn("Backprognose V2 Browser-Cache:",error); }
};

window.addEventListener("load",async()=>{
  try{
    const cached=await bp2LoadDataset();
    if(!cached?.quarterRows?.length) return;
    state.quarterRows=cached.quarterRows;
    state.dailyRows=cached.dailyRows||[];
    buildForecast();
    const when=cached.savedAt?new Date(cached.savedAt).toLocaleString("de-DE"):"";
    qs("#bpImportMsg").textContent=`Backprognose V2: lokale Daten geladen${when?` (${when})`:""}. Artikel werden über Produktfamilien statt fremde Artikelnummern zugeordnet.`;
  }catch(error){ console.warn("Backprognose V2 Browser-Cache konnte nicht geladen werden:",error); }
});
