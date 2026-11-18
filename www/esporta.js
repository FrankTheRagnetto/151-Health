/* ===========================================================================
 * esporta.js — «I tuoi dati» nelle Impostazioni: tutto fuori dal telefono,
 * senza cloud («così se pubblicherò al mondo questa app, non
 * dipenderà da cloud o robe strane»).
 *
 *   Esporta tutto       → un file in Download che l'app sa ricaricare:
 *                         { app: '151-health', v: 1, fatto, scheda, sostanze, peso,
 *                           orologio }
 *                         = i tre depositi così come sono (scheda.v1, health.v1,
 *                         health.peso.v1) + dal 16/10/2026 il grezzo dell'orologio
 *                         (orologio.js, tutto(): giorni, allenamenti, profilo) —
 *                         il cloud Zepp perde dati (il buco 2024-2026), il file no.
 *                         Chiave in più, stesso v:1: un file vecchio resta valido.
 *   Ricarica da un file → rimette i tre depositi (e l'orologio, se il file lo ha;
 *                         se non lo ha, l'orologio sul telefono resta com'è) e
 *                         riapre l'app.
 *   Tutto in PDF        → un foglio da leggere, giorno per giorno coi quattro
 *                         riquadri (Health.dayTiles), poi «Salva come PDF».
 *
 * Dal 12/11/2026 c'è anche «My workouts» (health.mine.v1, mine.js), chiave `mine`,
 * stesso v:1. Un file di prima non ha `mine`: allora quello sul telefono resta com'è
 * (come l'orologio). Le sue sedute stanno nei giorni, quindi anche nel PDF.
 *
 * Le figure degli esercizi (IndexedDB) restano fuori, come nel backup della
 * palestra: tornano ricaricando la scheda.
 * ========================================================================= */
(function () {
'use strict';
var H = window.Health;
var KEYS = { scheda: 'scheda.v1', sostanze: 'health.v1', peso: 'health.peso.v1', mine: 'health.mine.v1' };

function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function stamp(d) { return d.getFullYear() + H.d2(d.getMonth() + 1) + H.d2(d.getDate()); }
var toastT;
function toast(s) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = s; el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(function () { el.classList.remove('show'); }, 2600);
}

/** Quante cose ci sono in un pacco: lo dice la conferma prima di ricaricare. */
function counts(p) {
  var s = p.sostanze && p.sostanze.subs ? Object.keys(p.sostanze.subs).length : 0;
  var w = p.peso && p.peso.pesate ? Object.keys(p.peso.pesate).length : 0;
  var g = p.scheda && Array.isArray(p.scheda.history) ? p.scheda.history.length : 0;
  var o = p.orologio && p.orologio.giorni ? Object.keys(p.orologio.giorni).length : 0;
  var m = 'mine' in p ? (p.mine ? ', ' + H.mine.counts(p.mine) : ', no own workouts') : ' (no own workouts in the file: the phone\'s stay as they are)';
  return g + ' gym workouts, ' + s + ' days of substances, ' + w + ' weigh-ins' + m +
    (p.orologio ? ', ' + o + ' days of watch data' : ' (no watch data: the phone\'s stays as it is)');
}

function pack() {
  return { app: '151-health', v: 1, fatto: new Date().toISOString(),
    scheda: read(KEYS.scheda), sostanze: read(KEYS.sostanze), peso: read(KEYS.peso), mine: read(KEYS.mine) };
}
/** Il pacco intero, orologio compreso (se c'è qualcosa da portare). */
function packTutto() {
  var p = pack(), O = H.orologio;
  if (!O || !window.indexedDB) return Promise.resolve(p);
  return O.tutto().then(function (o) {
    if (Object.keys(o.giorni).length || o.cose.allenamenti) p.orologio = o;
    return p;
  }, function () { return p; });
}

function exportAll() {
  packTutto().then(salva, function () { toast('Export FAILED'); });
}
function salva(p) {
  var name = '151-health-' + stamp(new Date()) + '.json', text = JSON.stringify(p);
  var ok;
  if (window.SchedaNative) ok = SchedaNative.saveFile(name, text);
  else {
    var u = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = u; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 1000);
    ok = true;
  }
  toast(ok ? 'Saved in Download: ' + name : 'Export FAILED');
}

function importAll(file) {
  if (!file) return;
  var fr = new FileReader();
  fr.onload = function () {
    var p;
    try { p = JSON.parse(fr.result); } catch (e) { H.say('This file cannot be read.'); return; }
    if (!p || p.app !== '151-health' || p.v !== 1) {
      H.say('This is not an "Export everything" file from 151 Health.'); return;
    }
    H.ask('Reload this file?\n' + counts(p) + '.\n\nWhat is on the phone now gets replaced.', 'Reload', function () { rimetti(p); });
  };
  fr.readAsText(file);
}
/** Dopo il sì: rimette il file sul telefono. */
function rimetti(p) {
    // l'orologio PRIMA: se non si scrive, niente è cambiato e lo si dice
    var O = H.orologio, prima = p.orologio && O ? O.rimetti(p.orologio) : Promise.resolve();
    prima.then(function () {
      Object.keys(KEYS).forEach(function (k) {
        if (k === 'mine' && !('mine' in p)) return;     // file di prima di My workouts: il telefono tiene i suoi
        if (p[k] == null) localStorage.removeItem(KEYS[k]);
        else localStorage.setItem(KEYS[k], JSON.stringify(p[k]));
      });
      location.hash = '#/giorni';
      location.reload();
    }, function () { H.say('The watch data in this file cannot be put back: nothing was changed.'); });
}

/** Il foglio da leggere: un mese dopo l'altro, dal più recente; solo i giorni con qualcosa. */
function openPdf() {
  var all = H.collect(), days = Object.keys(all).filter(function (k) { return /^\d{4}-\d\d-\d\d$/.test(k); });
  days.sort().reverse();
  var esc = H.esc, doc = '<div class="sheet-doc"><h1>151 Health</h1>' +
    '<p class="meta">All data as of ' + new Date().toLocaleDateString('en-GB') + ' · ' + days.length + ' days</p>';
  var month = '';
  days.forEach(function (k) {
    var tiles = H.dayTiles(k, all).filter(function (t) { return !t.empty; });
    if (!tiles.length) return;
    var d = new Date(k + 'T12:00:00'), m = H.MESI[d.getMonth()] + ' ' + d.getFullYear();
    if (m !== month) { if (month) doc += '</table>'; month = m; doc += '<h2>' + m + '</h2><table class="xp">'; }
    doc += '<tr><th>' + H.GIORNI[d.getDay()].slice(0, 3) + ' ' + d.getDate() + '</th><td>' +
      tiles.map(function (t) {
        return '<b>' + esc(t.label) + '</b> ' + esc(t.value) + (t.sub ? ' <span>' + esc(t.sub) + '</span>' : '');
      }).join('<br>') + '</td></tr>';
  });
  if (month) doc += '</table>';
  doc += '</div>';
  var sheet = document.getElementById('sheet');
  if (!sheet) { sheet = document.createElement('div'); sheet.id = 'sheet'; }
  sheet.innerHTML = '<div class="close noprint" style="margin-bottom:14px">' +
    '<button class="btn primary small" id="doPrint">Save as PDF</button> ' +
    '<button class="btn small ghost" id="closeSheet">Close</button></div>' + doc;
  if (!sheet.parentNode) document.body.appendChild(sheet);
  sheet.classList.add('on');
  sheet.querySelector('#doPrint').onclick = function () {
    if (window.SchedaNative) SchedaNative.print(); else window.print();
  };
  sheet.querySelector('#closeSheet').onclick = function () { sheet.classList.remove('on'); };
}

H.settings = H.settings || [];
H.settings.push(function (box) {
  box.innerHTML = '<h2>Your data</h2>' +
    '<p class="sub">Gym, your own workouts, substances, weigh-ins and watch data live only on this phone. Save them now and then.</p>' +
    '<button class="btn" data-xall>Export everything</button>' +
    '<button class="btn" data-xpdf>Everything as a PDF, to read</button>' +
    '<label class="filelabel" for="xfile">Reload from a file</label>' +
    '<input type="file" id="xfile" accept=".json,application/json">';
  box.querySelector('[data-xall]').onclick = exportAll;
  box.querySelector('[data-xpdf]').onclick = openPdf;
  box.querySelector('#xfile').onchange = function (ev) { importAll(ev.target.files[0]); };
});

H.esporta = { pack: pack, packTutto: packTutto, counts: counts };
})();
