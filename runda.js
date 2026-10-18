// Scorekort för en runda (#/runda/<id>): hål för hål med slag, poäng och puttar, plus de andra i bollen.
import { api, esc, fmt, nuNav, aktuell } from './lib.js?v=0.34.1';

const app = document.getElementById('app');
const RES = (h) => {
  if (h.slag == null) return { k: '', t: '' };
  const d = h.slag_tak - h.par;
  if (h.slag === 1) return { k: 'eagle', t: 'Hole in one' };
  return d <= -2 ? { k: 'eagle', t: 'Eagle' } : d === -1 ? { k: 'birdie', t: 'Birdie' } : d === 0 ? { k: 'par', t: 'Par' }
    : d === 1 ? { k: 'bogey', t: 'Bogey' } : d === 2 ? { k: 'dubbel', t: 'Dubbel' } : { k: 'trippel', t: d >= 5 ? 'Struket' : d === 4 ? 'Quad' : 'Trippel' };
};

export async function renderRunda(rid) {
  const myNav = nuNav();
  app.innerHTML = '<p class="muted center">Laddar scorekort …</p>';
  const [[r], hal] = await Promise.all([
    api(`v_runda?runda_id=eq.${rid}&select=runda_id,deltavling_id,tht_nr,artal,ordning,deltavling,person_id,fornamn,spel_hcp,boll_nr,antal_hal,slag,poang,puttar,hal_med_puttar,placering`),
    api(`v_score?runda_id=eq.${rid}&select=hal_nr,par,hcp_index,extraslag,slag,slag_tak,poang,puttar&order=hal_nr`),
  ]);
  if (!aktuell(myNav)) return;
  if (!r) { app.innerHTML = '<p class="err">Rundan finns inte.</p>'; return; }
  const [[d], boll, deltagare, minnen] = await Promise.all([
    api(`deltavling?id=eq.${r.deltavling_id}&select=datum,banversion_id,tee_id,tee(namn),banversion(bana(id,namn))`),
    r.boll_nr != null ? api(`v_runda?deltavling_id=eq.${r.deltavling_id}&boll_nr=eq.${r.boll_nr}&select=runda_id,person_id,fornamn,poang,slag`) : [],
    api(`v_runda?deltavling_id=eq.${r.deltavling_id}&select=runda_id`),
    api(`kommentar?runda_id=eq.${rid}&select=text&order=skapad,id`),
  ]);
  const langd = d?.banversion_id ? await api(`hal?banversion_id=eq.${d.banversion_id}&select=nr,hal_langd(langd,tee_id)`) : [];
  if (!aktuell(myNav)) return;
  const meter = Object.fromEntries(langd.map((h) => [h.nr, h.hal_langd.find((l) => l.tee_id === d.tee_id)?.langd ?? null]));
  const bana = d?.banversion?.bana;
  const sum = (hs, f) => hs.reduce((a, h) => a + (Number(f(h)) || 0), 0);
  const del = (fran, till) => hal.filter((h) => h.hal_nr >= fran && h.hal_nr <= till);
  const summa = (titel, hs) => `<tr class="sk-summa"><th class="l">${titel}</th><td>${sum(hs, (h) => h.par)}</td><td class="hide-sm"></td><td class="hide-sm">${sum(hs, (h) => meter[h.hal_nr]) || ''}</td><td><strong>${sum(hs, (h) => h.slag_tak)}</strong></td><td><strong>${sum(hs, (h) => h.poang)}</strong></td><td>${hs.some((h) => h.puttar != null) ? sum(hs, (h) => h.puttar) : '–'}</td></tr>`;
  const rad = (h) => {
    const res = RES(h);
    return `<tr><td class="l"><a class="namn" href="#/hal/${bana?.id}/${h.hal_nr}">${h.hal_nr}</a></td><td>${h.par}</td><td class="hide-sm">${h.hcp_index}</td><td class="hide-sm">${meter[h.hal_nr] ?? ''}</td>
      <td><span class="sk-slag res-${res.k}" title="${res.t}">${h.slag ?? '–'}</span></td><td>${h.poang ?? '–'}${h.extraslag ? `<span class="sk-extra" title="Extraslag på hålet">${'•'.repeat(Math.min(h.extraslag, 3))}</span>` : ''}</td><td>${h.puttar ?? '–'}</td></tr>`;
  };
  const motPar = sum(hal, (h) => h.slag_tak - h.par);
  const fordelning = hal.reduce((acc, h) => { const t = RES(h).t; if (t) acc[t] = (acc[t] ?? 0) + 1; return acc; }, {});
  const ORD = ['Hole in one', 'Eagle', 'Birdie', 'Par', 'Bogey', 'Dubbel', 'Trippel', 'Quad', 'Struket'];

  app.innerHTML = `
    <a class="back" href="#/spelare/${r.person_id}">‹ ${esc(r.fornamn)}</a>
    <h1>${esc(r.fornamn)} · ${r.artal} R${r.ordning}</h1>
    <p class="sub"><a class="namn" href="#/deltavling/${r.deltavling_id}">R${r.ordning}${r.deltavling ? ' · ' + esc(r.deltavling) : ''}</a>${bana ? ` · <a class="namn" href="#/bana/${bana.id}">${esc(bana.namn)}</a>` : ''}${d?.datum ? ` · ${esc(d.datum)}` : ''}${d?.tee?.namn ? ` · tee ${esc(d.tee.namn)}` : ''}</p>
    ${minnen.map((k) => `<p class="runda-kommentar">${esc(k.text)}</p>`).join('')}
    <div class="sp-nyckel">
      <div class="sp-tile"><div class="sp-v">${fmt(r.poang)}</div><div class="sp-t">Poäng</div><div class="sp-d">${r.antal_hal ? `mot hcp ${r.poang - 2 * r.antal_hal > 0 ? '+' : ''}${r.poang - 2 * r.antal_hal}` : ''}</div></div>
      <div class="sp-tile"><div class="sp-v">${fmt(r.slag)}</div><div class="sp-t">Slag</div><div class="sp-d">${motPar > 0 ? '+' : ''}${motPar} mot par · tak par + 5</div></div>
      <div class="sp-tile"><div class="sp-v">${r.hal_med_puttar ? fmt(r.puttar) : '–'}</div><div class="sp-t">Puttar</div><div class="sp-d">${r.hal_med_puttar ? `${fmt(r.puttar / r.hal_med_puttar, 2)} per hål` : 'ej ifyllt'}</div></div>
      <div class="sp-tile"><div class="sp-v">${r.placering ?? '–'}</div><div class="sp-t">Placering</div><div class="sp-d">av ${deltagare.length} i deltävlingen · spel-HCP ${r.spel_hcp ?? '–'}</div></div>
    </div>
    <div class="chips hal-ford">${ORD.filter((k) => fordelning[k]).map((k) => `<span class="chip">${k} <b>${fordelning[k]}</b></span>`).join('')}</div>

    <h2>Scorekort</h2>
    ${hal.length ? `<div class="tablewrap"><table class="scorekort-vy">
      <thead><tr><th class="l">Hål</th><th>Par</th><th class="hide-sm">Index</th><th class="hide-sm">Meter</th><th>Slag</th><th>Poäng</th><th>Puttar</th></tr></thead>
      <tbody>${del(1, 9).map(rad).join('')}${del(1, 9).length ? summa('Ut', del(1, 9)) : ''}${del(10, 18).map(rad).join('')}${del(10, 18).length ? summa('In', del(10, 18)) : ''}</tbody>
      <tfoot>${summa('Totalt', hal)}</tfoot>
    </table></div>
    <p class="hint">Ring = birdie eller bättre, ruta = bogey eller sämre. Prickar = extraslag på hålet. Summorna räknar slag med tak par + 5. Tryck på ett hålnummer för allas resultat på hålet.</p>` : '<p class="muted">Inga hål inmatade för rundan.</p>'}

    ${boll.length > 1 ? `<h2>I samma boll</h2>
    <div class="rounds">${boll.filter((b) => b.runda_id !== r.runda_id).map((b) => `<a class="round link-card" href="#/runda/${b.runda_id}"><div><div class="rn">${esc(b.fornamn)}</div><div class="meta">${fmt(b.poang)} p · ${fmt(b.slag)} slag</div></div><div class="win"><span class="arrow">›</span></div></a>`).join('')}</div>` : ''}
    <p class="hint"><a href="#/ar/${r.artal}">Hela resultatet för ${r.artal}</a></p>`;
}
