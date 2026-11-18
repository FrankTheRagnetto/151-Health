/* ===========================================================================
 * giorni.js — il calendario dei giorni di The 151 Health.
 *
 * L'idea dell'utente: «on this day, this happened». Un mese
 * alla volta; ogni giorno porta un puntino per ogni zona che quel giorno ha
 * qualcosa; un tocco su un giorno mostra sotto cosa è successo.
 *
 * Il calendario NON sa niente di palestra, sonno o peso: ogni zona gli si
 * presenta da sola con `Health.area({...})` e gli dice, giorno per giorno,
 * cosa mostrare. Oggi c'è solo la palestra (app.js); sonno, sostanze e peso
 * arriveranno allo stesso modo, senza toccare questo file.
 *
 *   Health.area({
 *     id: 'sport', label: 'Sport', color: 'var(--sport)', sign: 'A',
 *     days: function () { return { '2026-10-06': [voce, …], … }; }
 *   });
 *   voce = { title, sub, value, tone: 'pr'|'up'|'live'|'', go: '#/…' }
 *   (facoltativo) cell: function (giorno, voci) → { cls, html }: il suo
 *   quadratino nella casella (vedi cellOf)
 *
 * Qui vivono anche le due cose che tutte le zone condividono: le PAGINE
 * (`Health.page('sonno', fn)`: la rotta #/sonno la disegna la zona) e il
 * PASSATO importato dal PC (`Health.load()` → `Health.storia`, vedi
 * tools/import-passato.py), che viaggia dentro l'APK in data/storia.json.
 *
 * Le date sono quelle del TELEFONO (ora locale), mai UTC: un allenamento
 * finito alle 00:30 appartiene al giorno in cui l'orologio di casa lo dice.
 * ========================================================================= */
(function () {
'use strict';

var GIORNI = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var MESI = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
            'August', 'September', 'October', 'November', 'December'];
var areas = [];
var shown = null;          // primo giorno del mese mostrato
var picked = null;         // 'AAAA-MM-GG' del giorno scelto
var picking = false;       // si sta scegliendo il mese (tocco sul titolo)
var pages = {};
var storia = { sleep: {}, sport: [], subs: {} };

function d2(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return d.getFullYear() + '-' + d2(d.getMonth() + 1) + '-' + d2(d.getDate()); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/** Tutte le voci di tutte le zone, per giorno: { 'AAAA-MM-GG': [{area, voce}] }. */
function collect() {
  var all = {};
  areas.forEach(function (a) {
    var days = {};
    try { days = a.days() || {}; } catch (e) { days = {}; }
    Object.keys(days).forEach(function (k) {
      (all[k] = all[k] || []);
      days[k].forEach(function (v) { all[k].push({ area: a, v: v }); });
    });
  });
  return all;
}

function view(app, go) {
  var today = new Date();
  if (!shown) shown = new Date(today.getFullYear(), today.getMonth(), 1);
  if (!picked) picked = ymd(today);
  var all = collect();

  var y = shown.getFullYear(), m = shown.getMonth();
  var first = new Date(y, m, 1);
  var lead = (first.getDay() + 6) % 7;                 // lunedì = 0
  var len = new Date(y, m + 1, 0).getDate();
  var todayK = ymd(today);

  var out = '<div class="cal-top">' +
    '<div><div class="kick">151 Health</div>' +
    '<button class="cal-title" data-pick><h1>' + MESI[m] + ' ' + y + '</h1></button></div>' +
    '<div class="cal-move">' +
      '<button class="calbtn" data-mv="-1" aria-label="previous month">‹</button>' +
      '<button class="calbtn today" data-mv="0">Today</button>' +
      '<button class="calbtn" data-mv="1" aria-label="next month">›</button>' +
    '</div></div>';

  if (picking) return pickView(app, go, all);

  out += '<div class="cal">';
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(function (g) { out += '<div class="cal-h">' + g + '</div>'; });
  for (var i = 0; i < lead; i++) out += '<div class="cal-x"></div>';
  for (var d = 1; d <= len; d++) {
    var k = y + '-' + d2(m + 1) + '-' + d2(d);
    out += '<button class="cal-d' + (k === picked ? ' sel' : '') + (k === todayK ? ' now' : '') +
      (k > todayK ? ' fut' : '') + '" data-day="' + k + '">' + '<span class="n">' + d + '</span>' +
      (k > todayK ? '<div class="r"><i></i><i></i></div><div class="r"><i></i><i></i></div>' : cellOf(k, all[k] || [])) +
      '</button>';
  }
  out += '</div>';

  // il giorno scelto: «quel giorno è successo questo» — QUATTRO riquadri, sempre
  // gli stessi, sempre nello stesso posto: in alto Sonno ·
  // Allenamento, in basso Peso · Sostanze. Non ce n'è un quinto.
  var pd = new Date(picked + 'T12:00:00');
  out += '<h2 class="cal-day">' + GIORNI[pd.getDay()] + ' ' + pd.getDate() + ' ' + MESI[pd.getMonth()] +
    (picked === todayK ? ' — today' : '') + '</h2><div class="tiles">';
  var dayItems = all[picked] || [];
  SLOTS.forEach(function (sl) {
    var a = byId(sl.id), its = dayItems.filter(function (it) { return it.area === a && !it.v.empty; })
      .map(function (it) { return it.v; });
    var t = !a ? { value: '—', sub: 'coming soon', off: true }
      : a.tile ? a.tile(picked, its) : tileOf(its);
    out += '<button class="tile' + (t.empty || t.off ? ' tile-empty' : '') + '" data-slot="' + sl.id + '"' +
      (t.off ? ' disabled' : '') + ' style="--c:' + (a ? a.color : sl.color) + '">' +
      '<span class="tl">' + sl.label + '</span>' +
      '<b class="tv' + (t.tone ? ' t-' + t.tone : '') + '">' + esc(t.value) + '</b>' +
      '<small>' + esc(t.sub || '') + '</small></button>';
  });
  out += '</div>';

  app.innerHTML = out;
  app.querySelectorAll('[data-day]').forEach(function (b) {
    b.onclick = function () { picked = b.dataset.day; view(app, go); };
  });
  app.querySelectorAll('[data-mv]').forEach(function (b) {
    b.onclick = function () {
      var mv = +b.dataset.mv;
      if (mv === 0) { shown = null; picked = null; }
      else shown = new Date(shown.getFullYear(), shown.getMonth() + mv, 1);
      view(app, go);
    };
  });
  app.querySelector('[data-pick]').onclick = function () { picking = true; view(app, go); };
  app.querySelectorAll('[data-slot]').forEach(function (b) {
    b.onclick = function () {
      var a = byId(b.dataset.slot);
      if (!a) return;
      var its = (all[picked] || []).filter(function (it) { return it.area === a && !it.v.empty; })
        .map(function (it) { return it.v; });
      if (a.open) return a.open(picked, its, go, function () { view(app, go); });
      openItems(its, go, b.querySelector('.tl').textContent);
    };
  });
}

/* --- i quattro riquadri del giorno ---------------------------------------- */
var SLOTS = [
  { id: 'sonno',    label: 'Sleep',       color: 'var(--sleep)' },
  { id: 'sport',    label: 'Workout',     color: 'var(--sport)' },
  { id: 'peso',     label: 'Weight',      color: 'var(--wt)' },
  { id: 'sostanze', label: 'Substances',  color: 'var(--sub)' }
];
function byId(id) { for (var i = 0; i < areas.length; i++) if (areas[i].id === id) return areas[i]; return null; }
/**
 * La casella: un quadrato con dentro i quattro riquadri in piccolo, nello
 * stesso posto di quelli grandi sotto («i 4 quadratini che
 * formano un quadrato»). Ogni zona disegna il suo
 * quadratino con `cell(giorno, voci) → { cls, html }`; niente = vuoto.
 */
function cellOf(k, items) {
  function one(id, empty) {
    var a = byId(id), c = null;
    if (a && a.cell) {
      var its = items.filter(function (it) { return it.area === a && !it.v.empty; }).map(function (it) { return it.v; });
      try { c = a.cell(k, its); } catch (e) { c = null; }
    }
    return c ? '<i class="' + c.cls + '" data-c="' + id + '">' + c.html + '</i>' : '<i' + (empty ? ' class="' + empty + '"' : '') + '></i>';
  }
  return '<div class="r">' + one('sonno') + one('sport') + '</div><div class="r">' + one('peso') + one('sostanze') + '</div>';
}
/** I quattro riquadri di un giorno come testo ({label, value, sub}): li usa anche il PDF di «Esporta tutto». */
function dayTiles(k, all) {
  var dayItems = all[k] || [];
  return SLOTS.map(function (sl) {
    var a = byId(sl.id), its = dayItems.filter(function (it) { return it.area === a && !it.v.empty; })
      .map(function (it) { return it.v; });
    var t = !a ? { value: '—', sub: '', empty: true } : a.tile ? a.tile(k, its) : tileOf(its);
    return { label: sl.label, value: t.value, sub: t.sub || '', empty: !!(t.empty || t.off) };
  });
}
/** Il riquadro di base: una voce → il suo valore; più voci → quante, coi nomi. */
function tileOf(its) {
  if (!its.length) return { value: '—', sub: 'nothing', empty: true };
  if (its.length === 1) return { value: its[0].value || '', sub: its[0].title + (its[0].sub ? ' · ' + its[0].sub : ''), tone: its[0].tone };
  return { value: String(its.length), sub: its.map(function (v) { return v.title; }).join(' · ') };
}
/** Tocco su un riquadro: una voce si apre; più voci → la finestrella per sceglierne una. */
function openItems(its, go, title) {
  if (!its.length) return;
  if (its.length === 1) { if (its[0].go) { Health.ret = '#/giorni'; go(its[0].go); } return; }
  var html = '<div class="kick">' + esc(title) + '</div><div class="daylist">' + its.map(function (v, n) {
    return '<button class="dline" data-n="' + n + '"><span class="tx"><b>' + esc(v.title) + '</b><small>' +
      esc(v.sub || '') + '</small></span><span class="vv' + (v.tone ? ' t-' + v.tone : '') + '">' + esc(v.value || '') + '</span></button>';
  }).join('') + '</div>';
  pop(html, function (box) {
    box.querySelectorAll('.dline').forEach(function (b) {
      b.onclick = function () { var v = its[+b.dataset.n]; popClose(); if (v.go) { Health.ret = '#/giorni'; go(v.go); } };
    });
  });
}

/* --- la finestrella (dal basso), una sola per tutta l'app ------------------
 * pop(html, wire): la apre con quel contenuto; un tocco fuori la chiude;
 * «indietro» del telefono la chiude prima di qualunque altra cosa (app.js). */
function pop(html, wire) {
  popClose();
  var el = document.createElement('div');
  el.id = 'pop';
  el.innerHTML = '<div class="pop-bg" data-popclose></div><div class="pop-box" role="dialog" aria-modal="true">' +
    '<div class="grip"></div>' + html + '</div>';
  document.body.appendChild(el);
  el.querySelector('[data-popclose]').onclick = popClose;
  if (wire) wire(el.querySelector('.pop-box'));
}
/**
 * Le domande dell'app (11/11: «mai una finestra grigia»). confirm/alert/prompt del browser sul telefono
 * aprono la finestra grigia di Android, fuori dallo stile e in un'altra lingua: qui la stessa domanda nella
 * finestrella dell'app. Annulla = tocco fuori, «Cancel» o il tasto indietro (popClose). Il lavoro parte solo da OK.
 */
function ask(msg, okLabel, onOk, danger) {
  pop('<p class="pop-msg" data-ask>' + esc(msg) + '</p><div class="row pop-act">' +
    '<button class="btn ghost" data-ask-no>Cancel</button>' +
    '<button class="btn ' + (danger ? 'danger' : 'primary') + '" data-ask-ok>' + esc(okLabel || 'OK') + '</button></div>', function (box) {
    box.querySelector('[data-ask-no]').onclick = popClose;
    box.querySelector('[data-ask-ok]').onclick = function () { popClose(); onOk(); };
  });
}
/** Un avviso: una frase e OK. */
function say(msg) {
  pop('<p class="pop-msg" data-ask>' + esc(msg) + '</p><div class="row pop-act">' +
    '<button class="btn primary" data-ask-ok>OK</button></div>', function (box) {
    box.querySelector('[data-ask-ok]').onclick = popClose;
  });
}
/** Un numero scritto a mano (la via secondaria della palestra): onOk(numero) solo se è un numero >= 0. */
function askNum(label, cur, onOk) {
  pop('<p class="pop-msg" data-ask>' + esc(label) + '</p>' +
    '<input class="pop-num" type="text" inputmode="decimal" value="' + esc(String(cur)) + '">' +
    '<div class="row pop-act"><button class="btn ghost" data-ask-no>Cancel</button>' +
    '<button class="btn primary" data-ask-ok>OK</button></div>', function (box) {
    var inp = box.querySelector('.pop-num');
    function ok() {
      var v = parseFloat(String(inp.value).replace(',', '.'));
      popClose();
      if (!isNaN(v) && v >= 0) onOk(v);
    }
    box.querySelector('[data-ask-no]').onclick = popClose;
    box.querySelector('[data-ask-ok]').onclick = ok;
    inp.onkeydown = function (e) { if (e.key === 'Enter') ok(); };
    inp.focus(); inp.select();
  });
}
/** Chiude la finestrella; vero se era aperta. */
function popClose() {
  var el = document.getElementById('pop');
  if (!el) return false;
  el.remove();
  return true;
}

/**
 * La scelta del mese: col passato dal 2022 sono 48 tocchi su «‹» per arrivare
 * in fondo. Un anno per riga, dodici mesi; acceso il mese che ha qualcosa.
 */
function pickView(app, go, all) {
  var now = new Date(), first = now.getFullYear();
  Object.keys(all).forEach(function (k) { var yy = +k.slice(0, 4); if (yy < first) first = yy; });
  var has = {};
  Object.keys(all).forEach(function (k) { has[k.slice(0, 7)] = true; });
  var out = '<div class="cal-top"><div><div class="kick">151 Health</div><h1>Pick the month</h1></div>' +
    '<div class="cal-move"><button class="calbtn today" data-close>Close</button></div></div>';
  for (var yy = now.getFullYear(); yy >= first; yy--) {
    out += '<h2>' + yy + '</h2><div class="mgrid">';
    for (var mm = 0; mm < 12; mm++) {
      var key = yy + '-' + d2(mm + 1);
      var fut = yy === now.getFullYear() && mm > now.getMonth();
      out += '<button class="mcell' + (has[key] ? ' has' : '') + (fut ? ' fut' : '') + '" data-ym="' + key + '">' +
        MESI[mm].slice(0, 3) + '</button>';
    }
    out += '</div>';
  }
  app.innerHTML = out;
  app.querySelector('[data-close]').onclick = function () { picking = false; view(app, go); };
  app.querySelectorAll('[data-ym]').forEach(function (b) {
    b.onclick = function () {
      var p = b.dataset.ym.split('-');
      shown = new Date(+p[0], +p[1] - 1, 1);
      picked = b.dataset.ym + '-01';
      picking = false; view(app, go); window.scrollTo(0, 0);
    };
  });
}

/**
 * Il passato: quello importato dal PC (data/storia.json, dentro l'APK) più quello
 * scaricato dal telefono con «Estrai dati orologio» (orologio.js, unisci: la notte
 * scaricata vince, gli allenamenti si uniscono). Manca l'uno o l'altro? Si va avanti
 * con quello che c'è: l'orologio è un ingrediente, mai le fondamenta.
 */
function load() {
  return fetch('data/storia.json').then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      // `caricata`: il file c'era davvero (sostanze.js adotta Daylio solo allora, mai da una storia vuota per sbaglio)
      if (d && d.v === 1) storia = { sleep: d.sleep || {}, sport: d.sport || [], subs: d.subs || {}, da: d.da, caricata: true };
    }).catch(function () {}).then(function () {
      window.Health.storia = storia;
      return tuttiCaricati();
    }).then(function () {
      // orologio.js viene DOPO app.js (che chiama load): senza aspettare, 5 volte su 8
      // storia.json arrivava prima di lui e l'unione saltava in silenzio (misurato, 16/10)
      var o = window.Health.orologio;
      if (!o) return null;
      // il database del telefono non risponde? l'app parte lo stesso, col passato e senza orologio
      return Promise.race([o.unisci(storia).catch(function () { return null; }),
                           new Promise(function (res) { setTimeout(res, ATTESA_OROLOGIO); })]);
    });
}
var ATTESA_OROLOGIO = 4000;
/** Quando tutti gli <script> della pagina sono eseguiti (DOMContentLoaded). */
function tuttiCaricati() {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise(function (res) { document.addEventListener('DOMContentLoaded', function () { res(); }); });
}

window.Health = {
  area: function (a) { areas.push(a); },
  /** Una pagina di una zona: #/<name>. `area` = la zona accesa in fondo (di base la pagina stessa). */
  page: function (name, fn, area) { fn.area = area || name; pages[name] = fn; },
  pages: pages,
  view: view,
  load: load,
  pop: pop,
  popClose: popClose,
  ask: ask,
  say: say,
  askNum: askNum,
  /** Il giorno scelto nel calendario (lo usa chi apre il calendario su un giorno). */
  pick: function (k) { picked = k; var d = new Date(k + 'T12:00:00'); shown = new Date(d.getFullYear(), d.getMonth(), 1); picking = false; },
  storia: storia,
  collect: collect,
  dayTiles: dayTiles,
  ymd: ymd,
  d2: d2,
  esc: esc,
  GIORNI: GIORNI,
  MESI: MESI,
  /** «indietro» dal calendario: chiude la scelta del mese, se è aperta. */
  back: function () { if (picking) { picking = false; return true; } return false; },
  ret: null            // dove riporta «indietro» da una pagina aperta dal calendario
};

})();
