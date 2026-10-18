// Nytt i appen: punktlistan per dag från Obsidian-anteckningen THT-nyheter
// (görs om till nyheter.json med skript/nyheter.py när anteckningen uppdateras).
import { esc } from './lib.js?v=0.31.0';

const app = document.getElementById('app');
// **fet** → <strong>, versionen i slutet dämpas
const formatera = (t) => esc(t)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\s*\((v\d+\.\d+\.\d+(?:,\s*v\d+\.\d+\.\d+)*)\)\s*$/, ' <span class="ny-ver">($1)</span>');

export async function renderNyheter() {
  app.innerHTML = '<p class="muted center">Laddar …</p>';
  const r = await fetch('nyheter.json?v=0.31.0', { cache: 'no-cache' });
  if (!r.ok) throw new Error('Kunde inte läsa nyheterna');
  const dagar = await r.json();
  app.innerHTML = `
    <h1>Nytt i appen</h1>
    <p class="sub">Vad som har tillkommit och ändrats, dag för dag.</p>
    ${dagar.map((d) => `
      <section class="ny-dag">
        <h2>${esc(d.datum)}</h2>
        <ul class="ny-lista">${d.punkter.map((p) => `<li>${formatera(p)}</li>`).join('')}</ul>
      </section>`).join('')}`;
}
