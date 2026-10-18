// Minimal Leaflet-attrapp för tester: registrerar kartor och markörer i window.__karta.
(function () {
  const reg = window.__karta = { kartor: [], markorer: [], popups: [], fit: [] };
  const lager = () => ({ addTo(m) { return this; } });
  function Karta(el) { this.el = typeof el === 'string' ? document.getElementById(el) : el; this.h = {}; this.z = 5; this.el.classList.add('leaflet-container'); this.el.dataset.mock = '1'; reg.kartor.push(this); }
  Karta.prototype = {
    setView(c, z) { this.c = c; this.z = z; return this; }, getZoom() { return this.z; },
    fitBounds(b, o) { reg.fit.push({ b, o }); return this; }, on(ev, f) { this.h[ev] = f; return this; },
    invalidateSize() {}, klick(lat, lng) { this.h.click?.({ latlng: { lat, lng } }); },
  };
  function Grupp(arr = []) { this.l = [...arr]; }
  Grupp.prototype = { addTo() { return this; }, getLayers() { return this.l; }, clearLayers() { this.l = []; }, addLayer(x) { this.l.push(x); }, getBounds() { return this.l.map((x) => x.ll); } };
  const markor = (ll, o) => ({ ll, o, addTo(g) { if (g instanceof Grupp) g.addLayer(this); reg.markorer.push(this); return this; }, bindPopup(h) { this.popup = h; reg.popups.push(h); return this; }, setLatLng(x) { this.ll = x; } });
  const Control = { extend(o) { const K = function () {}; K.prototype = { ...o, addTo(m) { const el = o.onAdd.call(this, m); (m.el || document.body).appendChild(el); reg.kontroller = (reg.kontroller || 0) + 1; return this; } }; return K; } };
  const DomUtil = { create(tag, cls) { const e = document.createElement(tag); e.className = cls; return e; } };
  const DomEvent = { on(el, ev, f) { el.addEventListener(ev, f); }, preventDefault(e) { e.preventDefault(); }, stopPropagation(e) { e.stopPropagation(); } };
  window.L = { Control, DomUtil, DomEvent, map: (el, o) => new Karta(el, o), tileLayer: () => lager(), featureGroup: (a) => new Grupp(a), circleMarker: markor, marker: markor, Browser: { mobile: false } };
})();
