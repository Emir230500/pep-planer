"use strict";

const BP_DB_NAME = "pep-backprognose-beta";
const BP_STORE = "datasets";
const BP_KEY = "market14-v1";

function bpOpenDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(BP_DB_NAME,1);
    req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(BP_STORE)) req.result.createObjectStore(BP_STORE); };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function bpSaveDataset(){
  const db=await bpOpenDb();
  const allowed=new Set(REFERENCE_PLAN.map(x=>x.no));
  const payload={
    savedAt:new Date().toISOString(),
    quarterRows:state.quarterRows.filter(r=>allowed.has(r.articleNo)),
    dailyRows:state.dailyRows.filter(r=>allowed.has(r.articleNo))
  };
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(BP_STORE,"readwrite");
    tx.objectStore(BP_STORE).put(payload,BP_KEY);
    tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error);
  });
  db.close();
}

async function bpLoadDataset(){
  const db=await bpOpenDb();
  const value=await new Promise((resolve,reject)=>{
    const tx=db.transaction(BP_STORE,"readonly");
    const req=tx.objectStore(BP_STORE).get(BP_KEY);
    req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error);
  });
  db.close();
  return value;
}

const bpOriginalImport = importAndForecast;
importAndForecast = async function(){
  await bpOriginalImport();
  const allowed=new Set(REFERENCE_PLAN.map(x=>x.no));
  state.quarterRows=state.quarterRows.filter(r=>allowed.has(r.articleNo));
  state.dailyRows=state.dailyRows.filter(r=>allowed.has(r.articleNo));
  buildForecast();
  try{
    await bpSaveDataset();
    const msg=qs("#bpImportMsg");
    msg.textContent += " Relevante Backshop-Daten wurden zusätzlich nur in diesem Browser gespeichert, damit du sie beim nächsten Öffnen nicht erneut laden musst.";
  }catch(error){
    console.warn("Backprognose Browser-Cache konnte nicht gespeichert werden:",error);
  }
};

window.addEventListener("load",async()=>{
  try{
    const cached=await bpLoadDataset();
    if(!cached?.quarterRows?.length) return;
    state.quarterRows=cached.quarterRows;
    state.dailyRows=cached.dailyRows||[];
    buildForecast();
    const when=cached.savedAt?new Date(cached.savedAt).toLocaleString("de-DE"):"";
    qs("#bpImportMsg").textContent=`Gespeicherte Backshop-Daten aus diesem Browser geladen${when?` (${when})`:""}. Du kannst direkt einen Zieltag wählen oder neuere Dateien importieren.`;
  }catch(error){
    console.warn("Backprognose Browser-Cache konnte nicht geladen werden:",error);
  }
});
