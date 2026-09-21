"use strict";
(function(){
  const baseRender=typeof render==="function"?render:null;
  if(!baseRender)return;
  const style=document.createElement('style');
  style.textContent='.skip-day{width:auto!important;min-width:0!important;min-height:28px!important;height:auto!important;border:1px solid #d8d8de!important;background:#fff!important;color:#55555b!important;font:inherit!important;font-size:11px!important;line-height:1.1!important;font-weight:800!important;padding:4px 8px!important;border-radius:8px!important;box-shadow:none!important;margin:0!important;cursor:pointer}.skip-day:active{background:#f1f2f4!important}.unmapped-sale{background:#fff4dc!important;color:#8a5a00!important}.outside-plan-card .program-title{display:flex;align-items:center;gap:7px}.outside-plan-tag{display:inline-flex;align-items:center;border-radius:999px;background:#fff4dc;color:#8a5a00;padding:3px 7px;font-size:11px;font-weight:800}.outside-plan-card .item{grid-template-columns:1fr!important}.outside-plan-card .action{display:none!important}';
  document.head.appendChild(style);
  const plannedIndexes=item=>(item?.buckets||[]).map((v,i)=>Number(v)>0?i:-1).filter(i=>i>=0);
  const recordsFor=no=>(current?.actuals||[]).filter(a=>String(a.article_no)===String(no));
  const skipped=(no,item)=>{const idx=plannedIndexes(item),m=new Map(recordsFor(no).map(a=>[Number(a.interval_index),Number(a.actual_qty)]));return idx.length>0&&idx.every(i=>m.has(i)&&m.get(i)===0)};
  const hasPositiveActual=no=>recordsFor(no).some(a=>Number(a.actual_qty)>0);
  async function markNotBaked(no,item,btn){
    if(!isToday()||hasPositiveActual(no))return;
    if(!confirm(`${item.name}\n\nDiesen Artikel heute komplett als „nicht gebacken“ markieren?`))return;
    btn.disabled=true;
    try{
      const list=current.actuals||(current.actuals=[]);
      for(const i of plannedIndexes(item)){
        const r=await api('/api/bakery/actual',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date:current.plan_date,articleNo:String(no),intervalIndex:i,actualQty:0})});
        const rec={article_no:String(no),interval_index:i,planned_qty:r.plannedQty,actual_qty:0,done_at:new Date().toISOString()},at=list.findIndex(a=>String(a.article_no)===String(no)&&Number(a.interval_index)===i);
        if(at>=0)list[at]=rec;else list.push(rec);
      }
      render();
      if(typeof showToast==='function')showToast('Entfernt · nicht gebacken gespeichert');
    }catch(e){if(typeof showToast==='function')showToast(e.message)}finally{btn.disabled=false}
  }
  function appendOutsidePlan(){
    const rows=Array.isArray(current?.outsidePlan)?current.outsidePlan:[];
    if(currentType!=='Backplan'||currentInterval!==0||!rows.length)return;
    const host=document.querySelector('#programs');if(!host)return;
    const sec=document.createElement('section');sec.className='cardp program readonly outside-plan-card';
    const total=rows.reduce((s,r)=>s+Math.max(0,Math.round(Number(r.sold_qty)||0)),0);
    sec.innerHTML=`<div class="program-head"><div><div class="program-title">Außerhalb Plan <span class="outside-plan-tag">automatisch erkannt</span></div><small>${rows.length} Artikel · kein Mitarbeitereintrag nötig</small></div><div class="program-total">${total} verkauft</div></div>`;
    for(const r of rows){
      const sold=Math.max(0,Math.round(Number(r.sold_qty)||0)),wo=Math.max(0,Number(r.writeoff_qty)||0),item=document.createElement('div');item.className='item';
      const writeoff=isToday()&&wo===0?'Abschrift folgt morgen':`Abschrift ${Number.isInteger(wo)?wo:wo.toFixed(2).replace('.',',')}`;
      item.innerHTML=`<div><div class="item-name">${esc(r.article_name||r.article_no)}</div><div class="meta"><span class="pill">Außerhalb Plan</span><span class="pill">Verkauft ${sold}</span><span>${writeoff}</span></div></div>`;
      sec.appendChild(item);
    }
    host.appendChild(sec);
  }
  render=function(){
    baseRender();
    if(!current)return;
    const sales=current.sales||[],hasSales=sales.length>0,sm=new Map(sales.map(s=>[String(s.article_no),s]));
    const items=new Map((current.payload?.items||[]).map(x=>[String(x.no),x]));
    document.querySelectorAll('.item').forEach(el=>{
      const no=el.querySelector('[data-input]')?.dataset.input;
      if(!no)return;
      const item=items.get(String(no)),meta=el.querySelector('.meta'),action=el.querySelector('.action');
      if(!item||!meta)return;
      if(skipped(no,item)){el.style.display='none';return}
      el.style.display='';
      const oldPill=[...meta.querySelectorAll('.pill')].find(x=>/^Verkauft\s/i.test(x.textContent||''));
      if(oldPill){const next=oldPill.nextElementSibling;if(next&&/Plan/i.test(next.textContent||''))next.remove();oldPill.remove()}
      meta.querySelectorAll('.sales-feedback,.skip-feedback,.skip-day').forEach(x=>x.remove());
      if(hasSales){
        const sale=sm.get(String(no));
        if(!sale){
          const pill=document.createElement('span');pill.className='pill sales-feedback unmapped-sale';pill.textContent='Abverkauf nicht zugeordnet';meta.appendChild(pill);
        }else{
          const sold=Math.round(Number(sale.sold_qty)||0),planned=Math.round(Number(item.total)||0),delta=sold-planned;
          const pill=document.createElement('span');pill.className='pill sales-feedback';pill.textContent=`Verkauft ${sold}`;
          const info=document.createElement('span');info.className='sales-feedback';
          if(delta>0){pill.style.cssText='background:#f1f2f4;color:#414146';info.style.color='#606064';info.textContent=`+${delta} über Plan`}
          else if(delta<0){pill.style.cssText='background:#fdecec;color:#b42318';info.style.color='#b42318';info.textContent=`${delta} unter Plan`}
          else{pill.style.cssText='background:#eaf7ef;color:#176a38';info.style.color='#176a38';info.textContent='Plan getroffen'}
          meta.appendChild(pill);meta.appendChild(info);
        }
      }
      if(isToday()&&!hasPositiveActual(no)&&action){
        const b=document.createElement('button');b.type='button';b.className='skip-day';b.textContent='Nicht gebacken';b.onclick=()=>markNotBaked(no,item,b);meta.appendChild(b);
      }
    });
    document.querySelectorAll('.program').forEach(sec=>{const rows=[...sec.querySelectorAll('.item')];sec.style.display=rows.length&&rows.every(x=>x.style.display==='none')?'none':''});
    appendOutsidePlan();
  };
})();
