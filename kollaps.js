// Alla rubriker (h2) på alla sidor går att fälla ihop. Läget sparas per sidtyp och rubrik i webbläsaren,
// så en ihopfälld "Deltävlingar" på årssidan gäller alla år.
const app = document.getElementById('app');
const NYCKEL = 'tht-kollaps';
let stangda;
try { stangda = new Set(JSON.parse(localStorage.getItem(NYCKEL) || '[]')); } catch { stangda = new Set(); }
const spara = () => { try { localStorage.setItem(NYCKEL, JSON.stringify([...stangda])); } catch { /* privat läge */ } };

// Sidtyp: första delen av adressen, för All-time även underfliken
const sidtyp = () => { const [a, b] = location.hash.replace(/^#\/?/, '').split('/'); return a === 'alltime' ? `alltime/${b || 'spelare'}` : (a || 'start'); };
const nyckel = (h) => `${sidtyp()}|${h.textContent.replace(/\s+/g, ' ').trim()}`;

// Det som hör till rubriken: syskonen efter den (eller efter rubrikraden) fram till nästa rubrik
function innehall(h) {
  const start = h.parentElement?.classList.contains('row-between') ? h.parentElement : h;
  const ut = [];
  for (let el = start.nextElementSibling; el; el = el.nextElementSibling) {
    if (/^H[12]$/.test(el.tagName) || el.querySelector?.('h1, h2') || el.classList.contains('row-between') && el.querySelector('h2')) break;
    ut.push(el);
  }
  return ut;
}

function satt(h, stang) {
  h.classList.toggle('stangd', stang);
  h.setAttribute('aria-expanded', String(!stang));
  innehall(h).forEach((el) => el.classList.toggle('kollapsad', stang));
}

function forbered() {
  app.querySelectorAll('h2:not(.fallbar)').forEach((h) => {
    h.classList.add('fallbar');
    h.setAttribute('role', 'button');
    h.setAttribute('tabindex', '0');
    h.title = 'Fäll ihop eller visa';
    satt(h, stangda.has(nyckel(h)));
  });
}

function vaxla(h) {
  const k = nyckel(h), stang = !h.classList.contains('stangd');
  stang ? stangda.add(k) : stangda.delete(k);
  spara();
  satt(h, stang);
  if (!stang) window.dispatchEvent(new Event('resize'));   // grafer och kartor ritas om i rätt storlek
}

app.addEventListener('click', (e) => {
  const h = e.target.closest('h2.fallbar');
  if (h && !e.target.closest('a, button')) vaxla(h);
});
app.addEventListener('keydown', (e) => {
  const h = e.target.closest?.('h2.fallbar');
  if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); vaxla(h); }
});
// Sidorna ritas asynkront – förbered nya rubriker när innehållet ändras
let vantar = false;
new MutationObserver(() => { if (!vantar) { vantar = true; requestAnimationFrame(() => { vantar = false; forbered(); }); } })
  .observe(app, { childList: true, subtree: true });
