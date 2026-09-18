"use strict";
(function(){
  let reloading=false,lastReload=0;
  const oldRender=typeof render==="function"?render:null;
  if(oldRender){
    render=function(){
      oldRender();
      document.querySelectorAll('.item-meta').forEach(el=>{el.innerHTML=el.innerHTML.replace(/>Tag\s+(\d+)</g,'>Gesamt heute $1<')});
    };
  }
  async function refreshKeep(i,force=false){
    if(reloading||!current||current.plan_date!==todayIso)return;
    if(!force&&Date.now()-lastReload<8000)return;
    reloading=true;
    try{
      const r=await api(`/api/bakery/plan?date=${encodeURIComponent(todayIso)}&t=${Date.now()}`);
      current=r.plan;currentInterval=i;lastReload=Date.now();render();
    }catch(e){console.warn('Produktionsplan aktualisieren',e.message)}finally{reloading=false}
  }
  document.querySelectorAll('#intervalTabs button').forEach(b=>{
    b.onclick=async()=>{const i=Number(b.dataset.i);currentInterval=i;render();await refreshKeep(i,true)};
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshKeep(currentInterval,true)});
  window.addEventListener('pageshow',()=>refreshKeep(currentInterval,true));
  setTimeout(()=>refreshKeep(currentInterval,true),1200);

  const DBN='pep-backprognose-beta',STORE='datasets',KEY='market14-v2';
  const STOP=new Set('g gg b o bo harry preb prebake preback pb bake off bio e fs cl herzstucke herz schaefers schafers jude juede bakerm panobake deh h s ef afs ary europ filly csm topkauf brink edeka gut gunstig ca bv va kg g st stk gramm geschn geschnitten vorgeschnitten vorg'.split(' '));
  const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim();
  const core=v=>norm(v).replace(/nougatcr/g,'nougat').replace(/schokoladengla/g,'schokoladenglasur').replace(/crodots/g,'crodot').split(' ').filter(t=>t&&!STOP.has(t)&&!/^\d+(?:g|kg|st)?$/.test(t)).join(' ');
  function brand(v){let s=norm(v);if(s.includes('jude'))return'juede';if(s.includes('harry'))return'harry';if(s.includes('schafers'))return'schaefers';if(s.includes('panobake'))return'panobake';if(s.includes('e fs'))return'efs';if(s.includes('herz'))return'herz';if(s.includes('g g'))return'gg';if(s.includes('bio e'))return'bioe';return''}
  function brandOk(a,b){a=brand(a);b=brand(b);if(['juede','harry','schaefers','panobake','efs','herz','bioe'].includes(a))return a===b;if(a==='gg')return b==='gg'||b==='';return true}
  function weightKg(v){let m=[...String(v||'').matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/gi)].at(-1);if(!m)return 0;let x=Number(m[1].replace(',','.'));return m[2].toLowerCase()==='kg'?x:x/1000}
  function qtyFor(it,r){let q=Math.max(0,Number(r.qty)||0),k=weightKg(it.name),frac=Math.abs(q-Math.round(q))>.0001;return frac&&k&&/(brot|baguette|ciabatta|kruste|kassler|paderborner|laib)/.test(norm(it.name))?q/k:q}
  function openDb(){return new Promise((ok,no)=>{let r=indexedDB.open(DBN,1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)}})}
  async function cacheData(){try{let db=await openDb(),v=await new Promise((ok,no)=>{let tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(KEY);r.onsuccess=()=>ok(r.result||null);r.onerror=()=>no(r.error)});db.close();return v}catch{return null}}
  const r2=x=>Math.round((Number(x)||0)*100)/100;
  function buildModel(data,cat){
    let by=new Map,maps={},M={version:2,sourceMinDate:null,sourceMaxDate:null,g:{},items:{}};
    for(const it of cat){let k=core(it.name);if(!by.has(k))by.set(k,[]);by.get(k).push(it)}
    function find(name){let c=core(name);if(c.includes('berliner')&&!/\b(?:4|6|8|12)\s*st\b/.test(norm(name)))return cat.find(x=>x.name==='Berliner Auswahl');if(c.includes('donut')&&!c.includes('crodot')&&!/\b(?:4|6|8|12)\s*st\b/.test(norm(name)))return cat.find(x=>x.name==='Donut Auswahl');if(c.includes('laugenkranz'))return cat.find(x=>x.name==='Laugenkranz Auswahl');return(by.get(c)||[]).find(x=>brandOk(x.name,name))||null}
    function seen(d){if(!/^\d{4}-\d{2}-\d{2}$/.test(d||''))return false;M.sourceMinDate=!M.sourceMinDate||d<M.sourceMinDate?d:M.sourceMinDate;M.sourceMaxDate=!M.sourceMaxDate||d>M.sourceMaxDate?d:M.sourceMaxDate;return true}
    function touch(it){if(!M.items[it.no])M.items[it.no]={n:it.name,d:[],s:{}};if(!maps[it.no])maps[it.no]=new Map;return M.items[it.no]}
    function day(it,d){let m=maps[it.no],x=m.get(d);if(!x){x={d,q:0,qr:0,dq:0,dr:0,w:0,a:0};m.set(d,x)}return x}
    for(const r of data.quarterRows||[]){if(!seen(r.date))continue;let it=find(r.name);if(!it)continue;let x=touch(it),d=day(it,r.date),q=qtyFor(it,r),m=String(r.slot||'').match(/(\d{1,2}):(\d{2})/),si=m?Math.floor((+m[1]*60 + +m[2])/15):-1;d.q+=q;d.qr+=Math.max(0,Number(r.revenue)||0);if(si>=0&&si<96){let w=String(new Date(r.date+'T12:00:00Z').getUTCDay()),sa=x.s[w]||(x.s[w]=Array(96).fill(0)),ga=M.g[w]||(M.g[w]=Array(96).fill(0));sa[si]+=q;ga[si]+=q}}
    for(const r of data.dailyRows||[]){if(!seen(r.date))continue;let it=find(r.name);if(!it)continue;touch(it);let d=day(it,r.date);d.dq+=qtyFor(it,r);d.dr+=Math.max(0,Number(r.revenue)||0);d.w+=Math.abs(Number(r.writeoff)||0);d.a+=Math.max(0,Number(r.actionQty)||0)}
    for(const it of cat){let x=M.items[it.no];if(!x)continue;let v=[...(maps[it.no]?.values()||[])].sort((a,b)=>a.d.localeCompare(b.d)).slice(-400);x.d=v.map(z=>[z.d,r2(z.q>0?z.q:z.dq),r2(z.dr>0?z.dr:z.qr),r2(z.w),r2(z.a)]);for(const k of Object.keys(x.s))x.s[k]=x.s[k].map(r2)}for(const k of Object.keys(M.g))M.g[k]=M.g[k].map(r2);return M
  }
  async function seed(){
    try{
      if(!current?.payload?.items?.length)return;
      let data=await cacheData();if(!data||(data.quarterRows||[]).length<1000)return;
      let s=await api('/api/bakery/model-status');
      let M=buildModel(data,current.payload.items);
      if(s.sourceMinDate&&M.sourceMinDate>=s.sourceMinDate&&M.sourceMaxDate<=s.sourceMaxDate)return;
      let text=JSON.stringify(M);if(text.length>3300000){for(const x of Object.values(M.items))x.d=(x.d||[]).slice(-300);text=JSON.stringify(M)}if(text.length>3300000)return;
      let r=await api('/api/bakery/history-seed',{method:'POST',headers:{'content-type':'application/json'},body:text});
      if(r.seeded){await refreshKeep(currentInterval,true);if(typeof toast==='function')toast('Jahreshistorie aktiviert')}
    }catch(e){if(![401,403].includes(e.status||0))console.warn('Jahreshistorie',e.message)}
  }
  setTimeout(seed,2200);
})();
