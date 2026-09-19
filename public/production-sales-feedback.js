"use strict";
(function(){
  const baseRender=typeof render==="function"?render:null;
  if(!baseRender)return;
  render=function(){
    baseRender();
    if(!current)return;
    const sales=current.sales||[],hasSales=sales.length>0;
    if(!hasSales)return;
    const sm=new Map(sales.map(s=>[String(s.article_no),s]));
    const items=new Map((current.payload?.items||[]).map(x=>[String(x.no),x]));
    document.querySelectorAll('.item').forEach(el=>{
      const no=el.querySelector('[data-input]')?.dataset.input;
      if(!no)return;
      const item=items.get(String(no)),meta=el.querySelector('.meta');
      if(!item||!meta)return;
      const oldPill=[...meta.querySelectorAll('.pill')].find(x=>/^Verkauft\s/i.test(x.textContent||''));
      if(oldPill){const next=oldPill.nextElementSibling;if(next&&/Plan/i.test(next.textContent||''))next.remove();oldPill.remove()}
      meta.querySelectorAll('.sales-feedback').forEach(x=>x.remove());
      const sale=sm.get(String(no)),sold=sale?Math.round(Number(sale.sold_qty)||0):0,planned=Math.round(Number(item.total)||0),delta=sold-planned;
      const pill=document.createElement('span');pill.className='pill sales-feedback';pill.textContent=`Verkauft ${sold}`;
      const info=document.createElement('span');info.className='sales-feedback';
      if(delta>0){pill.style.cssText='background:#eaf7ef;color:#176a38';info.style.color='#176a38';info.textContent=`+${delta} über Plan`}
      else if(delta<0){pill.style.cssText='background:#fdecec;color:#b42318';info.style.color='#b42318';info.textContent=`${delta} unter Plan`}
      else{pill.style.cssText='background:#f1f2f4;color:#414146';info.style.color='#606064';info.textContent='Plan getroffen'}
      meta.appendChild(pill);meta.appendChild(info);
    });
  };
})();
