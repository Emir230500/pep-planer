"use strict";
(function(){
  const baseRender=typeof render==="function"?render:null;
  if(!baseRender)return;
  const style=document.createElement('style');
  style.textContent='.skip-day{border:0;background:transparent;color:#6e6e73;font:inherit;font-size:12px;font-weight:750;padding:3px 2px;cursor:pointer}.day-skipped{background:#fafafa!important}.day-skipped .item-name{color:#777!important}.day-skipped .donebtn{background:#f1f2f4!important;color:#555!important;border-color:#ddd!important}.unmapped-sale{background:#fff4dc!important;color:#8a5a00!important}';
  document.head.appendChild(style);
  const plannedIndexes=item=>(item?.buckets||[]).map((v,i)=>Number(v)>0?i:-1).filter(i=>i>=0);
  const recordsFor=no=>(current?.actuals||[]).filter(a=>String(a.article_no)===String(no));
  const skipped=(no,item)=>{const idx=plannedIndexes(item),m=new Map(recordsFor(no).map(a=>[Number(a.interval_index),Number(a.actual_qty)]));return idx.length>0&&idx.every(i=>m.has(i)&&m.get(i)===0)};
  const hasAnyActual=no=>recordsFor(no).length>0;
  async function markNotBaked(no,item,btn){
    if(!isToday()||hasAnyActual(no))return;
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
      if(typeof showToast==='function')showToast('Für heute als nicht gebacken markiert');
    }catch(e){if(typeof showToast==='function')showToast(e.message)}finally{btn.disabled=false}
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
      const daySkipped=skipped(no,item);
      el.classList.toggle('day-skipped',daySkipped);
      const doneBtn=el.querySelector('.donebtn');
      if(daySkipped&&doneBtn)doneBtn.textContent='Nicht gebacken';
      const oldPill=[...meta.querySelectorAll('.pill')].find(x=>/^Verkauft\s/i.test(x.textContent||''));
      if(oldPill){const next=oldPill.nextElementSibling;if(next&&/Plan/i.test(next.textContent||''))next.remove();oldPill.remove()}
      meta.querySelectorAll('.sales-feedback,.skip-feedback').forEach(x=>x.remove());
      if(daySkipped){const p=document.createElement('span');p.className='pill skip-feedback';p.textContent='Heute nicht gebacken';meta.appendChild(p)}
      if(hasSales){
        const sale=sm.get(String(no));
        if(!sale){
          const pill=document.createElement('span');pill.className='pill sales-feedback unmapped-sale';pill.textContent='Abverkauf nicht zugeordnet';meta.appendChild(pill);
        }else{
          const sold=Math.round(Number(sale.sold_qty)||0),planned=Math.round(Number(item.total)||0),delta=sold-planned;
          const pill=document.createElement('span');pill.className='pill sales-feedback';pill.textContent=`Verkauft ${sold}`;
          if(daySkipped){pill.style.cssText='background:#f1f2f4;color:#414146';meta.appendChild(pill)}
          else{
            const info=document.createElement('span');info.className='sales-feedback';
            if(delta>0){pill.style.cssText='background:#f1f2f4;color:#414146';info.style.color='#606064';info.textContent=`+${delta} über Plan`}
            else if(delta<0){pill.style.cssText='background:#fdecec;color:#b42318';info.style.color='#b42318';info.textContent=`${delta} unter Plan`}
            else{pill.style.cssText='background:#eaf7ef;color:#176a38';info.style.color='#176a38';info.textContent='Plan getroffen'}
            meta.appendChild(pill);meta.appendChild(info);
          }
        }
      }
      if(isToday()&&!daySkipped&&!hasAnyActual(no)&&action){
        const b=document.createElement('button');b.type='button';b.className='skip-day';b.textContent='Heute nicht gebacken';b.onclick=()=>markNotBaked(no,item,b);meta.appendChild(b);
      }
    });
  };
})();
