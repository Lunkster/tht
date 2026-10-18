import { tolkaScorekort, kontrolleraHal } from '../banparse.js';
const par = [4,3,5,4,4,3,4,5,4, 4,4,3,5,4,4,3,5,4], idx=[7,17,1,11,3,15,9,5,13, 8,2,18,6,14,4,16,10,12];
const gul = par.map((p,i)=>p*90+i), rod = gul.map(v=>v-40);
const s = (a,b)=>a.slice(b[0],b[1]).reduce((x,y)=>x+y,0);
const fall = {
  'A med hålnr, tab': par.map((p,i)=>[i+1,p,idx[i],gul[i],rod[i]].join('\t')).join('\n'),
  'A utan hålnr + summarader': par.map((p,i)=>`${p} ${idx[i]} ${gul[i]}`).slice(0,9).join('\n')+`\nUt 36 ${s(gul,[0,9])}\n`+par.map((p,i)=>`${p} ${idx[i]} ${gul[i]}`).slice(9).join('\n')+`\nIn 36 ${s(gul,[9,18])}\nTot 72`,
  'B med etiketter och summor': [`Hål ${[...Array(9).keys()].map(i=>i+1).join(' ')} Ut ${[...Array(9).keys()].map(i=>i+10).join(' ')} In Tot`,
     `Par ${par.slice(0,9).join(' ')} ${s(par,[0,9])} ${par.slice(9).join(' ')} ${s(par,[9,18])} ${s(par,[0,18])}`,
     `Hcp ${idx.slice(0,9).join(' ')} ${idx.slice(9).join(' ')}`,
     `Röd ${rod.slice(0,9).join(' ')} ${s(rod,[0,9])} ${rod.slice(9).join(' ')} ${s(rod,[9,18])} ${s(rod,[0,18])}`,
     `Gul ${gul.join(' ')} ${s(gul,[0,18])}`].join('\n'),
  'B utan etiketter': [par.join('\t'), idx.join('\t'), gul.join('\t')].join('\n'),
};
let ok = true;
for (const [n, txt] of Object.entries(fall)) {
  const r = tolkaScorekort(txt, ['gul','röd']);
  const g = JSON.stringify(r.par)===JSON.stringify(par) && JSON.stringify(r.index)===JSON.stringify(idx) && JSON.stringify(r.langd[0])===JSON.stringify(gul);
  const rr = n.includes('utan hålnr')||n.includes('utan etiketter') ? true : JSON.stringify(r.langd[1])===JSON.stringify(rod);
  console.log(g && rr ? 'OK ' : 'FEL', n, '|', r.info.join(', '), r.varningar.join(' '));
  if (!(g&&rr)) { ok=false; console.log(JSON.stringify(r)); }
}
console.log(JSON.stringify(kontrolleraHal([{nr:1,par:4,index:7},{nr:2,par:3,index:7},{nr:3,par:null,index:5},{nr:4,par:7,index:1}])));
process.exit(ok?0:1);
