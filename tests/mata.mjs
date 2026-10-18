import { chromium } from 'playwright';
const par=[3,4,4,4,5,3,4,4,5,5,3,5,3,5,4,3,4,4], idx=[7,11,3,5,9,17,1,13,15,16,18,12,4,10,2,8,14,6];
const hal=par.map((p,i)=>({id:2000+i,nr:i+1,par:p,hcp_index:idx[i]}));
const personer=[[1,'Jörgen','Nilsson'],[2,'Marcus','Bergsjö'],[3,'Robert','Lindström'],[4,'Pär','Lindström'],[5,'Johan','Watz'],[6,'Gustav','Ahlin'],[7,'Joacim','Olsson'],[8,'Martin','Källberg'],[9,'Henrik','Lundqvist'],[11,'David','von Mecklenburg']].map(([id,f,e])=>({id,fornamn:f,efternamn:e,aktiv:true}));
const delt={id:101,ordning:1,namn:'Testrundan',datum:new Date().toISOString().slice(0,10),tht_nr:29,banversion_id:74,tee_id:5,tht:{artal:2026,ort:'Test'},banversion:{bana:{namn:'Lindesberga GK'}}};
let runda=[{id:700,deltavling_id:101,person_id:3,spel_hcp:10,boll_nr:1}], score=[]; let nextId=701; const log=[];
const b = await chromium.launch(); const p = await b.newPage({ viewport:{width:390,height:844} });
p.on('pageerror', e=>console.log('ERR',e.message)); p.on('console', m=>console.log('C',m.type(),m.text())); p.on('dialog', d=>{ log.push('dialog '+d.message()); d.accept('12'); });
await p.route('**/*', async r => {
  const u=new URL(r.request().url()); if(!u.hostname.includes('supabase')) return r.continue();
  const m=r.request().method(); const path=u.pathname; const q=new URLSearchParams(u.search);
  const J=(b,s=200)=>r.fulfill({status:s,body:JSON.stringify(b),contentType:'application/json'});
  if(path.includes('/auth/')){ const body=JSON.parse(r.request().postData()); return body.password==='kod123'||body.refresh_token ? J({access_token: 'x.eyJhcHBfbWV0YWRhdGEiOnsicm9sbCI6ImFkbWluIn19.y',refresh_token:'rt',expires_at:Date.now()/1000+3600}) : J({error:'bad'},400); }
  const t=path.replace('/rest/v1/',''); if(m==='GET') console.log('REQ',t,u.search.slice(0,60));
  if(m==='GET'){
    if(t==='deltavling') return J([delt]);
    if(t==='person') return J(personer);
    if(t==='runda'){ let rs=runda.filter(x=>x.deltavling_id==101); if(q.get('boll_nr')) rs=rs.filter(x=>'eq.'+x.boll_nr===q.get('boll_nr')); if(q.get('person_id')) rs=rs.filter(x=>'eq.'+x.person_id===q.get('person_id')); return J(rs); }
    if(t==='hal') return J(hal);
    if(t==='hal_langd') return J(hal.map(h=>({hal_id:h.id,langd:300+h.nr})));
    if(t==='score') return J(score);
    if(t==='v_runda') return J(runda.map(x=>{const pts=score.filter(s=>s.runda_id===x.id).reduce((a,s)=>a+Math.max(0,par[s.hal_nr-1]+Math.floor(x.spel_hcp/18)+(idx[s.hal_nr-1]<=x.spel_hcp%18?1:0)+2-s.slag),0);return {fornamn:personer.find(p=>p.id===x.person_id).fornamn,boll_nr:x.boll_nr,antal_hal:score.filter(s=>s.runda_id===x.id&&s.slag).length,poang:pts,placering:1};}));
    return J([]);
  }
  const body=r.request().postData()?JSON.parse(r.request().postData()):null; log.push(m+' '+t+' '+JSON.stringify(body));
  if(t==='runda'&&m==='POST'){ body.forEach(x=>runda.push({...x,id:nextId++})); return J(body,201); }
  if(t.startsWith('score')&&m==='POST'){ score=score.filter(s=>!(s.runda_id===body.runda_id&&s.hal_nr===body.hal_nr)); score.push(body); return r.fulfill({status:201,body:''}); }
  if(t.startsWith('score')&&m==='DELETE'){ return r.fulfill({status:204,body:''}); }
  if(t.startsWith('runda')&&m==='PATCH'){ runda.forEach(x=>{ if(t.includes('eq.'+x.id)) x.spel_hcp=body.spel_hcp; }); return r.fulfill({status:204,body:''}); }
  return J({},400);
});
await p.goto('http://localhost:8765/#/mata'); await p.waitForTimeout(500);
await p.screenshot({path:'m1-login.png'});
await p.fill('#kod','fel'); await p.click('button[type=submit]'); await p.waitForTimeout(300); console.log('fel kod:', await p.textContent('#loginmsg'));
await p.fill('#kod','kod123'); await p.click('button[type=submit]'); await p.waitForTimeout(500);
await p.screenshot({path:'m2-delt.png'});
await p.click('.link-card'); await p.waitForTimeout(500); await p.waitForTimeout(1500); await p.screenshot({path:'dbg.png', fullPage:true}); console.log('TXT', (await p.textContent('#app')).slice(0,80)); console.log('DIRECT', await p.evaluate(async()=>{const m=await import('./mata.js?v=0.3.0'); try{ await m.renderMata(['101']); return document.querySelector('#app').textContent.slice(0,80);}catch(e){return 'E '+e.message+e.stack}})); console.log('NAV', await p.evaluate(async()=>{const l=await import('./lib.js?v=0.3.0'); return l.nuNav();})); console.log('h', await p.evaluate(()=>location.hash));
for (const [id,h] of [[9,'13'],[4,'17'],[6,'19'],[5,'18']]) { await p.check(`input[value="${id}"]`); await p.fill(`.hcp[data-for="${id}"]`, h); }
await p.click('#nyboll button[type=submit]'); await p.waitForTimeout(800);
console.log('hash', await p.evaluate(()=>location.hash));
const cards=p.locator('.pcard'); console.log('kort', await cards.count());
await p.screenshot({path:'m5-tom.png'});
await cards.nth(0).locator('.step[data-f=slag] .sval').click();
await cards.nth(0).locator('.step[data-f=puttar] .sbtn[data-d="-1"]').click();
await cards.nth(1).locator('.step[data-f=slag] .sbtn[data-d="1"]').click(); await cards.nth(1).locator('.step[data-f=slag] .sbtn[data-d="1"]').click();
await cards.nth(1).locator('.step[data-f=puttar] .sval').click();
await cards.nth(2).locator('.step[data-f=slag] .sbtn[data-d="-1"]').click();
await p.waitForTimeout(1200);
await p.screenshot({path:'m6-ifyllt.png'});
await p.goto('http://localhost:8765/#/mata/101'); await p.waitForTimeout(600);
await p.screenshot({path:'m7-bollar.png', fullPage:true});
await p.click('.who .chip >> text=Henrik'); await p.waitForTimeout(800);
console.log('enskild hash', await p.evaluate(()=>location.hash), 'kort', await p.locator('.pcard').count());
await p.screenshot({path:'m8-enskild.png'});
await p.click('.holenav .btn.primary'); await p.waitForTimeout(600); console.log('nästa', await p.evaluate(()=>location.hash));
await p.goto('http://localhost:8765/#/mata'); await p.waitForTimeout(600); await p.screenshot({path:'m9-val.png'});
console.log(log.join('\n'));
await b.close();
