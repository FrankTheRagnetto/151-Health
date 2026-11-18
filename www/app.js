/* ===========================================================================
 * Scheda — diario di allenamento offline.
 *
 * Tutto vive nel telefono: localStorage per il piano e lo storico,
 * IndexedDB solo per le immagini di una scheda caricata a mano.
 * Nessun server, nessun account, nessuna rete dopo la prima apertura.
 *
 * DUE IDEE PORTANTI, tutto il resto discende da qui.
 *
 * 1. NON SI SCRIVONO NUMERI. Ogni valore si muove con «−» e «+». Il peso va
 *    a scatti (2,5 kg di serie, cambiabile per esercizio), le ripetizioni di
 *    una, i secondi di uno. Il numero resta toccabile per chi vuole
 *    digitarlo, ma non è la strada maestra: in palestra si usa il pollice.
 *
 *    (Dal 20/10, scelta A, il cronometro È la spunta: primo tocco
 *    parte, secondo tocco ferma e dà la serie per fatta — vedi `tapTick`. Il
 *    resto di questo paragrafo vale uguale.)
 *    Gli esercizi a tempo hanno anche un CRONOMETRO nella riga della serie —
 *    stesso bersaglio, stessa altezza, stesso bordo dei bottoni che ci stanno
 *    accanto, perché non è un attrezzo a parte: è il modo di riempire quel
 *    numero. Avvia, fai l'esercizio, ferma: resta il tempo PRECISO al
 *    centesimo (57,46 s), perché se qualcuno ti cronometra quel dato è vero e
 *    non va arrotondato via.
 *    Poi però il primo «−» o «+» SCATTA AL SECONDO TONDO — 57,46 con «−» fa
 *    57, con «+» fa 58 — e da lì in poi si muove di un secondo alla volta.
 *    Motivo: cronometrandosi da soli i due secondi per arrivare all'attrezzo e
 *    i due per tornare stanno dentro la misura, e li si toglie a mano. La
 *    regola non ha bisogno di ricordarsi niente (nessun flag, nessuno stato):
 *    un numero con la virgola si arrotonda, un numero tondo si sposta di uno.
 *    Tutta la legge sta in `nextSec`.
 *
 * 2. LA SCHEDA SI RICORDA AL POSTO TUO. Quando apri un allenamento le serie
 *    sono GIÀ COMPILATE con quello che hai fatto l'ultima volta su quello
 *    stesso esercizio (ripetizioni comprese; se non l'hai mai fatto, le
 *    ripetizioni le detta il piano). Tu non ricopi niente: guardi, decidi
 *    cosa alzare, tocchi «+» dove serve e spunti la serie.
 *
 *    La memoria sta TUTTA qui, all'apertura. Dopo, OGNI CONTATORE È SOLO SUO:
 *    un «+» muove un numero e uno solo. Fino al 25/09 il gesto si propagava
 *    alle serie seguenti; sembrava un risparmio di tocchi ma era solo roba da
 *    disfare, perché le serie non sono uguali fra loro. Se rimetti mano a
 *    questo punto, rileggi quella storia prima: è già stata provata e tolta.
 *
 * Da qui viene anche la terza: OGNI ESERCIZIO HA IL SUO MODO. Gli stacchi
 * hanno il carico, le trazioni no, il plank si misura in secondi. La colonna
 * dei chili non compare dove i chili non esistono. Il modo è indovinato dal
 * nome, ed è SEMPRE correggibile a mano: la correzione vale per sempre e
 * segue l'esercizio anche quando cambia la scheda.
 *
 * FRA UNA SERIE E L'ALTRA (06/10, rifatto il 20/10) il telefono sta sulla
 * panca, quindi: spuntare una serie fa partire il quadrante in basso, che CONTA
 * il recupero fatto finora (niente conto alla rovescia, niente bottone: l'utente
 * 20/10) e si ferma quando parte la serie dopo; lo schermo resta acceso finché sei
 * nell'allenamento (`awake`), e il tasto «indietro» del telefono risale a
 * Oggi invece di chiudere l'app (`SchedaBack`, lo chiama il guscio Android).
 *
 * DENTRO THE 151 HEALTH (08/10): questo file è la pagina PALESTRA dell'app
 * della salute. Le leggi qui sopra restano intatte. Health aggiunge solo:
 * la rotta `#/giorni` (il calendario, `giorni.js`, a cui la palestra porta i
 * suoi allenamenti con `Health.palestra`, via sport.js), la barra in fondo a
 * due livelli (Giorni · Sport · Sonno · Sostanze, e dentro Sport: Palestra ·
 * Allenamenti · Record · Scheda) e
 * l'aspetto «Notte blu» (style.css). Il deposito `scheda.v1` è lo stesso
 * della Scheda: un backup della Scheda si ripristina qui così com'è.
 *
 * Mappa del file — otto sezioni, in quest'ordine:
 *   1. deposito — localStorage / IndexedDB, backup
 *   2. il modo di un esercizio — carico sì/no, ripetizioni o secondi, scatto
 *   3. misure — punteggio di una serie, record, confronti colorati
 *   4. utilità varie — testo, tempo, scorciatoie del DOM
 *   5. viste — casa, giorno, allenamento (steppers + cronometro), storico,
 *      record, scheda
 *   6. importazione / esportazione — .mht in entrata, backup .json nei due versi
 *   7. il foglio (stampa / PDF)
 *   8. avvio — rotte, service worker, primo disegno
 * ========================================================================= */
(function () {
'use strict';

// --------------------------------------------------------------------------
// 1. DEPOSITO
// --------------------------------------------------------------------------

var KEY = 'scheda.v1';
var S = null;                       // stato in memoria, specchio del deposito

/**
 * UNA SERIE, la cosa più piccola che esista qui dentro:
 *   { s: 1, kg: 60, reps: 5, target: "8", done: true }
 *
 * ⚠ `reps` TIENE ANCHE I SECONDI. In un esercizio a tempo dentro `reps` c'è il
 * tempo, e `mode.unit` è l'unica cosa che dice come leggerlo. Il nome è brutto
 * ma NON si cambia a cuor leggero: sta scritto così in ogni allenamento già
 * salvato nel telefono dell'utente e in ogni backup .json esportato, e rinominarlo
 * vorrebbe dire riscrivere il passato. Se un giorno si fa, si fa con una
 * migrazione vera e alzando `v`. Nel frattempo: quando leggi `reps`, chiediti
 * sempre `mode.unit`.
 *
 * Col cronometro `reps` può avere i CENTESIMI (57,46). Tutto regge tranne i
 * confronti, che infatti `score` arrotonda al secondo tondo apposta.
 */
function blank() {
  return { v: 1, plan: null, history: [], active: null, imgSource: 'files', modes: {} };
}

function load() {
  try {
    var raw = localStorage.getItem(KEY);
    S = raw ? JSON.parse(raw) : blank();
  } catch (e) { S = blank(); }
  if (!S || S.v !== 1) S = blank();
  if (!Array.isArray(S.history)) S.history = [];
  if (!S.modes || typeof S.modes !== 'object') S.modes = {};   // schede vecchie
  S.history.sort(function (a, b) { return (a.startedAt || '').localeCompare(b.startedAt || ''); });
  return S;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch (e) {
    toast('Storage full: export a backup and free some space.');
  }
}

/* --- IndexedDB: solo le immagini di una scheda caricata a mano ----------- */
var IDB = (function () {
  var DB = 'scheda-img', STORE = 'img', dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(mode) { return open().then(function (db) { return db.transaction(STORE, mode).objectStore(STORE); }); }
  return {
    get: function (k) {
      return tx('readonly').then(function (st) {
        return new Promise(function (res) { var r = st.get(k); r.onsuccess = function () { res(r.result || null); }; r.onerror = function () { res(null); }; });
      }).catch(function () { return null; });
    },
    putAll: function (obj) {
      return open().then(function (db) {
        return new Promise(function (res, rej) {
          var t = db.transaction(STORE, 'readwrite'), st = t.objectStore(STORE);
          st.clear();
          Object.keys(obj).forEach(function (k) { st.put(obj[k], k); });
          t.oncomplete = res; t.onerror = function () { rej(t.error); };
        });
      });
    },
    clear: function () { return tx('readwrite').then(function (st) { st.clear(); }).catch(function () {}); }
  };
})();

var imgCache = {};
function imgSrc(name, el) {
  if (!name) { el.removeAttribute('src'); return; }
  if (S.imgSource === 'files') { el.src = 'img/' + encodeURIComponent(name); return; }
  if (imgCache[name]) { el.src = imgCache[name]; return; }
  IDB.get(name).then(function (d) {
    if (d) { imgCache[name] = d; el.src = d; }
    else el.src = 'img/' + encodeURIComponent(name);   // ripiego
  });
}

// --------------------------------------------------------------------------
// 2. IL MODO DI UN ESERCIZIO
// --------------------------------------------------------------------------

/** Chiave stabile di un esercizio: sopravvive al cambio di scheda. */
function exKey(name) {
  return String(name || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/*
 * Indovinare il modo dal nome è comodo, non sacro: sbaglia di sicuro su
 * qualche esercizio, e per quello esiste il pannello «Come si misura».
 * Il carico vince sul corpo libero perché il caso ambiguo tipico è
 * «TRAZIONI ALLA PULL-DOWN», che di trazioni ha solo il nome: è una macchina
 * e i chili ci sono eccome.
 */
var CON_CARICO  = /BILANCIER|MANUBRI|CAVO|PULL-?DOWN|LAT MACHINE|MACCHIN|PRESSA|SQUAT|STACC|PANCA PIANA|PANCA INCLINAT|CURL|LENTO|VOLARE|FRENCH|ESTENSION|HIP|BRIDGE/;
var SENZA_CARICO = /TRAZION|\bDIP\b|PARALLELE|PIEGAMENT|PLANK|CRUNCH|SIT-?UP|HYPEREXT|IPEREXT|STRETCH|SOSPENSION|PANCA ROMANA|SBARRA|ADDOMINAL/;

/** Il modo di partenza, dedotto da nome e specifica della scheda. */
function guessMode(name, kind) {
  var n = exKey(name);
  if (kind === 'time') return { load: false, unit: 'sec', step: 2.5 };
  var load = CON_CARICO.test(n) ? true : (SENZA_CARICO.test(n) ? false : true);
  return { load: load, unit: 'rip', step: 2.5 };
}

/**
 * Il modo di ripiego, quando un allenamento salvato non porta il suo.
 * Sta scritto UNA volta: quattro copie a mano erano quattro posti dove
 * sbagliare il giorno in cui cambia lo scatto di serie.
 */
function baseMode() { return { load: true, unit: 'rip', step: 2.5 }; }

/** Il modo in vigore adesso: la correzione dell'utente batte l'indovinello. */
function modeFor(name, kind) {
  var k = exKey(name);
  var g = guessMode(name, kind);
  var m = S.modes[k];
  if (!m) return g;
  return {
    load: typeof m.load === 'boolean' ? m.load : g.load,
    unit: m.unit === 'sec' || m.unit === 'rip' ? m.unit : g.unit,
    step: +m.step > 0 ? +m.step : g.step
  };
}

function setMode(name, kind, patch) {
  var k = exKey(name);
  var m = modeFor(name, kind);
  Object.keys(patch).forEach(function (f) { m[f] = patch[f]; });
  S.modes[k] = m;
  save();
}

/** Di quanto si muove il «+» di una colonna. */
function stepOf(mode, field) {
  if (field === 'kg') return mode.step;
  return 1;
}

/**
 * Il prossimo valore in secondi, dato il verso.
 *
 * Il cronometro lascia un tempo preciso al centesimo (57,46). Il primo tocco su
 * «−» o «+» lo porta al secondo tondo nel verso che hai chiesto — 57 oppure 58 —
 * e da lì ogni tocco vale un secondo esatto. Così un tempo misurato da altri
 * resta intatto finché non lo tocchi, e un tempo misurato da te si aggiusta a
 * secondi tondi togliendo o aggiungendo i secondi di andata e ritorno.
 *
 * Non c'è niente da ricordarsi: la virgola È lo stato. Funzione pura, provabile.
 */
function nextSec(v, dir) {
  var f = Math.round((+v || 0) * 100) / 100;
  if (Math.abs(f - Math.round(f)) > 1e-9) return dir < 0 ? Math.floor(f) : Math.ceil(f);
  return f + dir;
}

/** L'etichetta della colonna di destra. */
function unitLabel(mode) { return mode.unit === 'sec' ? 'sec' : 'reps'; }

/**
 * I MINUTI COME LI SCRIVE LA PALESTRA. Il punto non separa i decimi, separa i
 * secondi: "01.30" è un minuto e mezzo (90), non un minuto e tre decimi.
 * "01.0" è un minuto tondo (60). Una cifra sola vale decine: "01.3" = 90.
 *
 * Un posto solo, perché questa notazione compare in DUE campi diversi della
 * stessa scheda — il recupero ("01.30") e l'obiettivo a tempo ("1.15 min.") — e
 * per un po' sono stati letti da due funzioni diverse che NON erano d'accordo:
 * il recupero di 01.30 valeva 240 secondi invece di 90.
 */
function minSec(txt) {
  var t = String(txt == null ? '' : txt);
  var m = t.match(/(\d+)[.,](\d{1,2})/);
  if (m) return (+m[1]) * 60 + (+(m[2].length === 1 ? m[2] + '0' : m[2]));
  var one = t.match(/\d+/);
  return one ? (+one[0]) * 60 : 0;
}

/**
 * Il numero dentro un obiettivo scritto a parole dalla palestra:
 *   "8" → 8 · "30 secondi" → 30 · "1 min." → 60 · "1.15 min." → 75
 */
function targetNum(target, unit) {
  var t = String(target == null ? '' : target);
  if (unit === 'sec' && /min/i.test(t)) return minSec(t);
  var n = t.match(/\d+([.,]\d+)?/);
  return n ? +n[0].replace(',', '.') : 0;
}

/** Numero → testo breve: niente ",0" inutili. */
function num(n) {
  var v = Math.round((+n || 0) * 100) / 100;
  return String(v);   // in inglese il punto (20/10)
}

/**
 * Secondi → "45 s" · "57,46 s" · "1:30" · "1:30,4".
 * I centesimi si scrivono solo se ci sono: un tempo cronometrato non va
 * arrotondato via, ma un 30 tondo non deve diventare "30,00".
 */
function secText(s) {
  var v = Math.round((+s || 0) * 100) / 100;
  if (v < 60) return num(v) + ' s';
  var m = Math.floor(v / 60), r = Math.round((v - m * 60) * 100) / 100;
  return m + ':' + (r < 10 ? '0' : '') + num(r);
}

/**
 * Un numero con la sua unità piccola a parte: «57,46 s» → cifre «57,46» +
 * unità « s». Il testo resta IDENTICO (textContent = «57,46 s»): cambia solo
 * come si vede, mai cosa dice. (Fino alla 1.1.0 qui c'era il display a
 * segmenti, bocciato il 06/10: il nome della funzione è rimasto.)
 */
function lcdHTML(txt) {
  var t = String(txt), m = t.match(/^(.*?)(\s[a-z]+)$/);
  var n = m ? m[1] : t, u = m ? m[2] : '';
  return '<span class="dg">' + esc(n) + '</span>' + (u ? '<small>' + esc(u) + '</small>' : '');
}

// --------------------------------------------------------------------------
// 3. MISURE
// --------------------------------------------------------------------------

/**
 * Punteggio confrontabile di una serie.
 *  - con carico  → massimale stimato (Epley: kg × (1 + rip/30)), e vale anche
 *    per un esercizio a tempo zavorrato: lì al posto delle ripetizioni ci vanno
 *    i secondi
 *  - a corpo libero → il numero stesso (ripetizioni o secondi)
 * Serve solo per dire "meglio" o "peggio": non è un valore da esibire.
 *
 * I SECONDI SI CONFRONTANO TONDI. Dal cronometro arriva un tempo al centesimo,
 * e senza questo arrotondamento 57,46 contro 57,45 sarebbe "meglio" e un
 * centesimo varrebbe un record d'oro: l'oro smetterebbe di voler dire qualcosa.
 * Il numero preciso resta scritto e visibile, ma il progresso si misura in
 * secondi interi — che è l'unità in cui si ragiona in palestra. Sulle
 * ripetizioni l'arrotondamento non fa niente: sono già intere.
 */
function score(set) {
  var kg = +set.kg || 0, r = Math.round(+set.reps || 0);
  if (!r && !kg) return 0;
  if (kg > 0 && r > 0) return kg * (1 + r / 30);
  if (kg > 0) return kg;
  return r;
}

function hasValue(set) { return set && (Number(set.kg) > 0 || Number(set.reps) > 0); }

/** Come si scrive una serie: "60×5", "5 rip", "45 s", "10×1:30". */
function setText(set, mode) {
  if (!hasValue(set)) return '—';
  mode = mode || baseMode();
  var kg = +set.kg || 0, r = +set.reps || 0;
  var right = mode.unit === 'sec' ? secText(r) : num(r) + (mode.load ? '' : ' reps');
  if (mode.load && kg > 0) return num(kg) + '×' + right;
  if (mode.load && kg <= 0) return right;
  return right;
}

/**
 * Passa in rassegna tutto lo storico e assegna a ogni serie un esito:
 *   'pr'   record personale a quella data (batte tutto ciò che c'era prima)
 *   'up'   meglio della stessa serie dell'allenamento precedente
 *   'down' peggio
 *   'same' pari, oppure non c'era un termine di paragone
 * Ritorna { marks: {idAllenamento: {esercizio: [esito…]}}, records: […] }
 *
 * Nota: il primo allenamento di un esercizio è la base di partenza, non un
 * record — altrimenti sarebbe tutto oro il primo giorno e l'oro non direbbe più niente.
 */
function analyze(history) {
  var marks = {}, best = {}, bestInfo = {}, prev = {};

  history.forEach(function (w) {
    marks[w.id] = {};
    Object.keys(w.sets || {}).forEach(function (k) {
      var sets = w.sets[k] || [];
      var mode = wMode(w, k);
      var scores = sets.map(score);
      var filled = scores.filter(function (n) { return n > 0; });
      var topNow = filled.length ? Math.max.apply(null, filled) : 0;
      // l'oro spetta a UNA serie sola: la migliore di oggi. Se tutte le serie
      // sono uguali e battono il vecchio record, oro alla prima — altrimenti
      // si accende tutto e l'oro smette di voler dire qualcosa.
      var topIdx = topNow > 0 ? scores.indexOf(topNow) : -1;
      var beforeBest = best[k];                       // com'era PRIMA di oggi
      var prevSets = prev[k];

      marks[w.id][k] = sets.map(function (st, i) {
        var sc = scores[i];
        if (!sc) return { mark: 'none' };
        var ref = null;
        if (prevSets) {
          if (prevSets[i] && score(prevSets[i]) > 0) ref = score(prevSets[i]);
          else {
            var ps = prevSets.map(score).filter(function (n) { return n > 0; });
            if (ps.length) ref = Math.max.apply(null, ps);
          }
        }
        var mark = 'same';
        if (ref != null) mark = sc > ref + 1e-9 ? 'up' : (sc < ref - 1e-9 ? 'down' : 'same');
        // oro: batte il meglio di sempre E è LA serie migliore di oggi
        if (beforeBest != null && sc > beforeBest + 1e-9 && i === topIdx) mark = 'pr';
        return { mark: mark, score: sc, ref: ref };
      });

      if (topNow > 0) {
        if (best[k] == null || topNow > best[k]) {
          best[k] = topNow;
          var bi = scores.indexOf(topNow);
          bestInfo[k] = { set: sets[bi], mode: mode, at: w.startedAt, n: w.n, id: w.id };
        }
        prev[k] = sets;
      }
    });
  });

  var records = Object.keys(bestInfo).map(function (k) {
    return { name: k, best: best[k], info: bestInfo[k] };
  }).sort(function (a, b) { return a.name.localeCompare(b.name); });

  return { marks: marks, records: records, best: best };
}

/**
 * Il modo con cui una serie fu REGISTRATA quel giorno.
 * Si legge dall'allenamento, non dalle impostazioni di oggi: se fra un mese
 * correggo un esercizio, lo storico non deve cambiare faccia a posteriori.
 */
function wMode(w, k) {
  if (w.modes && w.modes[k]) return w.modes[k];
  var kind = (w.kinds && w.kinds[k]) || 'reps';      // allenamenti di prima
  return guessMode(k, kind);
}

/**
 * Le serie piene dell'ultima volta su quell'esercizio, più il giorno in cui è
 * successo: il termine di paragone per il verde e il rosso. Serviva in tre
 * punti, scritto uguale tre volte. Se non c'è un passato, `sets` è vuoto e
 * `at` è null — nessuno deve controllare due cose.
 */
function lastSets(exk, beforeId) {
  var lt = lastTime(exk, beforeId);
  return { sets: lt ? lt.sets.filter(hasValue) : [], at: lt ? lt.w.startedAt : null };
}

/** L'ultima volta che hai fatto quell'esercizio, prima dell'allenamento dato. */
function lastTime(exk, beforeId) {
  for (var i = S.history.length - 1; i >= 0; i--) {
    var w = S.history[i];
    if (beforeId && w.id === beforeId) continue;
    var sets = w.sets && w.sets[exk];
    if (sets && sets.some(hasValue)) return { w: w, sets: sets };
  }
  return null;
}

// --------------------------------------------------------------------------
// 4. UTILITÀ VARIE — testo, tempo, scorciatoie del DOM
// --------------------------------------------------------------------------

var GIORNI = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MESI = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function d2(n) { return (n < 10 ? '0' : '') + n; }
function fmtDate(iso) { var d = new Date(iso); return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + ' ' + d.getFullYear(); }
function fmtShort(iso) { var d = new Date(iso); return d.getDate() + ' ' + MESI[d.getMonth()]; }
function fmtTime(iso) { var d = new Date(iso); return d2(d.getHours()) + ':' + d2(d.getMinutes()); }
/** « · 52 min», oppure niente: «0 min» sembra un guasto e non dice nulla
 *  (stessa regola del foglio da stampare). */
function durText(w) {
  var ms = new Date(w.endedAt) - new Date(w.startedAt);
  return ms >= 60000 ? ' · ' + fmtDur(ms) : '';
}
function mmss(sec) { return Math.floor(sec / 60) + ':' + d2(sec % 60); }
function fmtDur(ms) {
  var m = Math.max(0, Math.round(ms / 60000));
  return m >= 60 ? Math.floor(m / 60) + 'h ' + d2(m % 60) : m + ' min';
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

var toastT = null;
function toast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(function () { el.classList.remove('show'); }, 2100);
}

function h(html) { var d = document.createElement('div'); d.innerHTML = html; return d; }
// già lì (es. la scheda caricata dallo stato vuoto di #/home): hashchange non scatta, si ridisegna a mano
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

// --------------------------------------------------------------------------
// 5. VISTE — casa, giorno, allenamento, storico, record, scheda
// --------------------------------------------------------------------------

var app = document.getElementById('app');

function header() {
  var p = S.plan || {};
  return '<div class="hdr">' +
    (p.logo ? '<img data-img="' + esc(p.logo) + '" alt="" onerror="this.style.visibility=\'hidden\'">' : '') +
    '<div><div class="t">' + esc(p.athlete || 'Plan') + '</div>' +
    '<div class="s">' + esc(p.level || p.program || '') + '</div></div></div>';
}

function nextDayN() {
  if (!S.plan || !S.plan.days.length) return 1;
  var n = S.plan.days.length;
  for (var i = S.history.length - 1; i >= 0; i--) {
    var d = S.history[i].dayN;
    if (d) return (d % n) + 1;
  }
  return 1;
}

/* --- casa ---------------------------------------------------------------- */
function viewHome() {
  if (!S.plan) return viewNoPlan();
  var nd = nextDayN();
  var day = S.plan.days.find(function (d) { return d.n === nd; }) || S.plan.days[0];
  var p = S.plan;

  var out = header();

  if (S.active) {
    out += '<div class="card live">' +
      '<div class="live-d">' + esc(S.active.dayLabel) + ' in progress</div>' +
      '<p class="sub">Started at ' + fmtTime(S.active.startedAt) + '. Everything you ticked is saved.</p>' +
      '<button class="btn primary" data-act="resume">Resume</button>' +
      '<button class="btn danger" data-act="discard">Discard</button></div>';
  }

  out += '<h2>Next workout</h2>' +
    '<button class="day next" data-day="' + day.n + '">' +
      '<div class="n lcd">' + lcdHTML(day.n) + '</div>' +
      '<div class="txt"><b>' + esc(day.label) + '</b>' +
      '<small>' + day.exercises.length + ' exercises · ' +
        day.exercises.reduce(function (a, e) { return a + e.sets; }, 0) + ' sets</small></div>' +
      '<div class="badge">Today</div></button>';

  // con un allenamento a metà il tasto chiaro è «Riprendi»: due tasti pieni
  // uno sopra l'altro e il pollice non sa più quale sia quello giusto
  out += '<button class="btn ' + (S.active ? '' : 'primary ') + 'big" data-day-go="' + day.n + '">Start workout</button>';

  out += '<h2>Or pick one</h2>';
  p.days.forEach(function (d) {
    if (d.n === day.n) return;
    out += '<button class="day" data-day="' + d.n + '">' +
      '<div class="n lcd">' + lcdHTML(d.n) + '</div>' +
      '<div class="txt"><b>' + esc(d.label) + '</b><small>' +
      d.exercises.map(function (e) { return e.muscle; })
        .filter(function (m, i, a) { return m && a.indexOf(m) === i; }).join(' · ') +
      '</small></div></button>';
  });

  var tot = S.history.length;
  var ult = tot ? new Date(S.history[tot - 1].startedAt) : null;
  out += '<h2>So far</h2><div class="tally">' +
    '<div><div class="lcd">' + lcdHTML(tot) + '</div><span>workouts</span></div>' +
    '<div><div class="lcd">' + lcdHTML(analyze(S.history).records.length) + '</div><span>exercises</span></div>' +
    '<div><div class="lcd">' + (ult ? lcdHTML(d2(ult.getDate()) + '.' + d2(ult.getMonth() + 1)) : lcdHTML('--')) + '</div><span>last time</span></div>' +
    '</div>';

  if (p.expiry) out += '<p class="sub">Plan by ' + esc(p.instructor || '—') + ' · expires ' + esc(p.expiry) + '</p>';

  app.innerHTML = out;
  hydrateImgs();
  app.querySelectorAll('[data-day]').forEach(function (b) {
    b.onclick = function () { go('#/giorno/' + b.dataset.day); };
  });
  var start = app.querySelector('[data-day-go]');
  if (start) start.onclick = function () { startWorkout(+start.dataset.dayGo); };
  var r = app.querySelector('[data-act="resume"]'); if (r) r.onclick = function () { go('#/workout'); };
  var dz = app.querySelector('[data-act="discard"]'); if (dz) dz.onclick = function () {
    Health.ask('Discard the workout in progress? It will not go into your history.', 'Discard', function () { S.active = null; save(); render(); }, true);
  };
}

function viewNoPlan() {
  app.innerHTML = '<div class="empty noplan">' +
    '<h2>No workout plan yet</h2>' +
    '<p class="sub">Load your plan: on the gym\'s website open it, press <b>2 Posizioni</b>, ' +
    'save the page as <b>.mht</b> and pick that file here. It stays on this phone.</p>' +
    '<label class="filelabel" for="mhtfile">Load your plan (.mht)</label>' +
    '<input type="file" id="mhtfile" accept=".mht,.mhtml,message/rfc822,multipart/related">' +
    '</div>';
  document.getElementById('mhtfile').onchange = function (ev) { importMht(ev.target.files[0]); };
}

/* --- anteprima di un giorno ---------------------------------------------- */
function viewDay(n) {
  var day = S.plan.days.find(function (d) { return d.n === +n; });
  if (!day) return go('#/home');

  var out = '<h1>' + esc(day.label) + '</h1><p class="sub">' + day.exercises.length + ' exercises</p>';
  day.exercises.forEach(function (e) {
    var k = exKey(e.name), lt = lastTime(k, null), mode = modeFor(e.name, e.kind);
    out += '<div class="ex"><div class="ex-head">' +
      '<div class="ex-imgs"><img data-img="' + esc(e.imgA) + '" alt=""><img data-img="' + esc(e.imgB) + '" alt=""></div>' +
      '<div class="ex-txt"><div class="nm">' + esc(e.name) + '</div>' +
      '<div class="sp"><b class="mus">' + esc(e.muscle) + '</b> · ' + esc(e.spec) + ' · rest ' + mmss(minSec(e.rest)) +
      (lt ? '<br><span class="prev">last: ' + esc(lt.sets.filter(hasValue).map(function (s) { return setText(s, mode); }).join('  ')) + '</span>' : '') +
      '</div></div></div></div>';
  });
  out += '<button class="btn primary big" data-start="' + day.n + '">Start workout</button>' +
         '<button class="btn ghost" data-back>Back</button>';
  app.innerHTML = out;
  hydrateImgs();
  app.querySelector('[data-start]').onclick = function () { startWorkout(day.n); };
  app.querySelector('[data-back]').onclick = function () { go('#/home'); };
}

function hydrateImgs() {
  app.querySelectorAll('img[data-img]').forEach(function (im) { imgSrc(im.dataset.img, im); });
}

/* --- allenamento in corso ------------------------------------------------ */

/**
 * Apparecchiare le serie PRIMA di cominciare: questo è il cuore dell'attrezzo.
 * Ogni serie nasce già piena, con l'ordine di precedenza:
 *   1. quello che hai fatto l'ultima volta su QUELLA serie
 *   2. se l'ultima volta avevi fatto meno serie, l'ultima che avevi fatto
 *   3. se non l'hai mai fatto: ripetizioni dal piano, carico a zero
 * Così alla seconda volta non trovi mai una riga vuota da riempire a memoria.
 */
function seedSets(e) {
  var k = exKey(e.name);
  var mode = modeFor(e.name, e.kind);
  var prev = lastSets(k, null).sets;

  return e.targets.map(function (t, i) {
    var src = prev[i] || prev[prev.length - 1] || null;
    var reps = src && +src.reps > 0 ? +src.reps : targetNum(t, mode.unit);
    var kg = mode.load && src && +src.kg > 0 ? +src.kg : 0;
    return { s: i + 1, kg: kg, reps: reps, target: t, done: false };
  });
}

function startWorkout(dayN, sure) {
  if (S.active && !sure) {
    Health.ask('A workout is already in progress. Discard it and start a new one?', 'Start new', function () { startWorkout(dayN, true); }, true);
    return;
  }
  var day = S.plan.days.find(function (d) { return d.n === dayN; });
  S.active = {
    id: 'w' + Date.now(),
    n: S.history.length + 1,
    dayN: day.n, dayLabel: day.label,
    startedAt: new Date().toISOString(), endedAt: null,
    sets: {}, modes: {}, kinds: {}, order: []
  };
  day.exercises.forEach(function (e) {
    var k = exKey(e.name);
    S.active.sets[k] = seedSets(e);
    S.active.modes[k] = modeFor(e.name, e.kind);
    S.active.kinds[k] = e.kind;
    S.active.order.push(k);
  });
  save();
  go('#/workout');
}

// La spunta: disegnata, non un carattere. Sta sempre nel tasto e il CSS la
// mostra solo sulla serie fatta, così ridisegnare la riga non tocca il tasto.
var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11" fill="none" ' +
  'stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// LA SERIE IN CORSO. La spunta ha due tocchi: il primo
// fa partire la serie (`t0`), il secondo la dà per fatta (`t1`, `done`). Una
// serie sola per volta: farne partire un'altra chiude come fatta quella che
// correva. Negli esercizi a tempo la spunta È il cronometro (legge 5: il
// cronometro sta nella riga, uno solo per volta): il tempo fra i due tocchi,
// al centesimo, diventa il valore della serie.
// Non c'è uno stato in memoria: la serie in corso è quella con `t0` e senza
// `done`, salvata con le altre — esci dalla pagina o riapri l'app e sta ancora
// correndo. `runT` è solo il ridisegno; `runBar`/`runPrev` si leggono una volta.
var runT = null, runKey = '', runBar = null, runPrev = null;
/**
 * Come si scrive il numero di una cella. Lo chiedono in due: `stepper` quando
 * disegna la riga da zero e `refreshEx` quando la riscrive dopo un tocco. Se i
 * due non dicono la stessa cosa, il numero cambia faccia sotto il pollice.
 */
function valText(field, st, mode) {
  if (field === 'kg') return num(st.kg);
  return mode.unit === 'sec' ? secText(st.reps) : num(st.reps);
}

/** Una colonna «− valore +». Il valore è toccabile per chi vuole digitarlo. */
function stepper(k, i, field, st, mode) {
  var big = valText(field, st, mode);
  return '<div class="stp" data-f="' + field + '">' +
    '<button class="mn" data-k="' + esc(k) + '" data-i="' + i + '" data-f="' + field + '" data-d="-1" aria-label="minus">−</button>' +
    '<b class="val" data-k="' + esc(k) + '" data-i="' + i + '" data-f="' + field + '" role="button" tabindex="0">' + lcdHTML(big) + '</b>' +
    '<button class="pl" data-k="' + esc(k) + '" data-i="' + i + '" data-f="' + field + '" data-d="1" aria-label="plus">+</button>' +
    '</div>';
}

/**
 * L'asticella dell'oro per la serie `i`, mentre ti alleni: il meglio di sempre
 * su quell'esercizio (`histBest`, da `analyze`) ALZATO da quello che hai già
 * spuntato oggi prima di questa serie.
 *
 * È la richiesta dell'utente del 26/09: «se batto il record a metà allenamento,
 * quello diventa il record anche per le serie dopo». Tre serie da 30 s con 35 s
 * di record: la prima è oro da 35 in su; se fai 60, la seconda e la terza sono
 * oro solo oltre 60.
 *
 * Contano SOLO le serie spuntate — legge 2: finché non spunti è una proposta,
 * e una proposta non può alzare l'asticella.
 */
function liveBar(k, i, histBest) {
  var bar = histBest == null ? null : histBest;
  var sets = (S.active && S.active.sets[k]) || [];
  for (var j = 0; j < i && j < sets.length; j++) {
    if (!sets[j].done) continue;
    var sc = score(sets[j]);
    if (sc > 0 && (bar == null || sc > bar)) bar = sc;
  }
  return bar;
}

/**
 * Il colore di una riga mentre ti alleni:
 *   oro   (' rec')  sopra l'asticella del record — vedi `liveBar`
 *   verde (' up')   sopra la stessa serie dell'ultima volta
 *   rosso (' down') sotto
 *
 * La classe si chiama `rec` e NON `pr`: `.pr` è già la riga della lista record
 * (style.css), stessa specificità e dichiarata dopo, quindi le ruberebbe il
 * `display:flex` sfasciando la griglia. È la stessa trappola della pastiglia
 * oro, già pagata una volta.
 *
 * ⚠ Dal vivo l'oro può accendersi su PIÙ serie (batti, rialzi l'asticella,
 * ribatti); nello storico `analyze` ne dora UNA sola, la migliore del giorno.
 * Non è un disallineamento da curare: dal vivo l'oro dice «adesso stai facendo
 * il tuo record», nello storico dice «quel giorno è stato il tuo record». Se
 * un giorno devono coincidere, lo decide l'utente — non è una pulizia di passaggio.
 */
function liveMark(set, prevSet, bar) {
  if (!hasValue(set)) return '';
  var a = score(set);
  if (bar != null && a > bar + 1e-9) return ' rec';
  if (!prevSet || !hasValue(prevSet)) return '';
  var b = score(prevSet);
  if (a > b + 1e-9) return ' up';
  if (a < b - 1e-9) return ' down';
  return '';
}

function viewWorkout() {
  if (!S.active) return go('#/home');
  document.body.classList.add('workout-live');
  awake(true);
  var w = S.active;
  var day = S.plan.days.find(function (d) { return d.n === w.dayN; }) || { exercises: [] };
  // il meglio di sempre per ogni esercizio: si legge UNA volta per disegno,
  // non una per riga (analyze ripassa tutto lo storico).
  var histBest = analyze(S.history).best;

  var out = '<h1>' + esc(w.dayLabel) + '</h1>' +
    '<p class="sub">Workout no. ' + w.n + ' · started at ' + fmtTime(w.startedAt) + '</p>' +
    '<div class="prog"><i id="progbar"></i></div>';

  day.exercises.forEach(function (e, idx) {
    var k = exKey(e.name);
    var sets = w.sets[k] || [];
    var mode = w.modes[k] || modeFor(e.name, e.kind);
    var done = sets.filter(function (s) { return s.done; }).length;
    var prev = lastSets(k, w.id);

    out += '<div class="ex' + (done === sets.length && done ? ' done' : '') + '" data-ex="' + esc(k) + '">' +
      '<button class="ex-head" data-toggle="' + idx + '">' +
        '<div class="ex-imgs"><img data-img="' + esc(e.imgA) + '" alt=""><img data-img="' + esc(e.imgB) + '" alt=""></div>' +
        '<div class="ex-txt"><div class="nm">' + esc(e.name) + '</div>' +
          '<div class="sp"><b class="mus">' + esc(e.muscle) + '</b> · ' + esc(e.spec) + ' · <span data-rest="' + minSec(e.rest) + '">rest ' + mmss(minSec(e.rest)) + '</span></div></div>' +
        '<div class="ex-tick' + (done === sets.length && done ? ' full' : '') + '">' +
          (done ? done + '/' + sets.length : '') + '</div>' +
      '</button>' +
      '<div class="ex-body hide" id="body' + idx + '">' +
        '<div class="ex-big"><img data-img="' + esc(e.imgA) + '" alt=""><img data-img="' + esc(e.imgB) + '" alt=""></div>';

    if (e.note || e.goal) {
      out += '<div class="note">' +
        // «70%75%80%» arriva dalla palestra senza spazi: si stacca un carico dall'altro
        (e.note ? esc(e.note).replace(/%(?=\d)/g, '% · ') : '') +
        (e.note && e.goal ? '<br>' : '') +
        (e.goal ? '<b>Goal:</b> ' + esc(e.goal) : '') + '</div>';
    }

    // una riga sola per dire com'è andata l'ultima volta: niente colonne
    if (prev.sets.length) {
      out += '<div class="lastline"><span>Last time · ' + fmtShort(prev.at) + '</span>' +
        esc(prev.sets.map(function (s) { return setText(s, mode); }).join('   ')) + '</div>';
    } else {
      out += '<div class="lastline"><span>First time</span>values from the plan — adjust them and tick</div>';
    }

    var timed = mode.unit === 'sec';
    out += '<div class="setgrid' + (mode.load ? '' : ' noload') + (timed ? ' timed' : '') + '">' +
      '<div class="shead"><span></span>' + (mode.load ? '<span>kg</span>' : '') +
      '<span>' + unitLabel(mode) + '</span>' +
      '<span></span></div>';

    sets.forEach(function (st, i) {
      var mk = liveMark(st, prev.sets[i], liveBar(k, i, histBest[k]));
      out += '<div class="setrow' + (st.done ? ' ok' : st.t0 ? ' run' : '') + mk + '" data-row="' + esc(k) + '|' + i + '">' +
        '<div class="sn">' + (i + 1) + '</div>' +
        (mode.load ? stepper(k, i, 'kg', st, mode) : '') +
        stepper(k, i, 'reps', st, mode) +
        tickBtn(k, i, st) +
        '</div>';
    });

    out += '</div>' +
      '<div class="exfoot">' +
        '<button class="lnk" data-addset="' + esc(k) + '">Add set</button>' +
        '<button class="lnk" data-cfg="' + idx + '">How it is measured</button>' +
      '</div>' +
      '<div class="cfg hide" id="cfg' + idx + '" data-ex="' + esc(k) + '">' +
        '<div class="cfgrow"><span>Load</span>' +
          '<div class="seg"><button data-set="load:1"' + (mode.load ? ' class="on"' : '') + '>with weight</button>' +
          '<button data-set="load:0"' + (!mode.load ? ' class="on"' : '') + '>bodyweight</button></div></div>' +
        '<div class="cfgrow"><span>Measured in</span>' +
          '<div class="seg"><button data-set="unit:rip"' + (mode.unit === 'rip' ? ' class="on"' : '') + '>reps</button>' +
          '<button data-set="unit:sec"' + (mode.unit === 'sec' ? ' class="on"' : '') + '>seconds</button></div></div>' +
        (mode.load ? '<div class="cfgrow"><span>Weight step</span>' +
          '<div class="seg">' + [1, 2.5, 5].map(function (s) {
            return '<button data-set="step:' + s + '"' + (mode.step === s ? ' class="on"' : '') + '>' + num(s) + ' kg</button>';
          }).join('') + '</div></div>' : '') +
        '<p class="cfgnote">Applies to this exercise from now on, even if you change plan.</p>' +
      '</div>' +
      '</div></div>';
  });

  app.innerHTML = out;
  hydrateImgs();
  wireWorkout(day);

  // apri il primo esercizio non finito
  var firstOpen = day.exercises.findIndex(function (e) {
    var s = w.sets[exKey(e.name)] || []; return s.some(function (x) { return !x.done; });
  });
  if (firstOpen >= 0) {
    var bd = document.getElementById('body' + firstOpen);
    if (bd) { bd.classList.remove('hide'); bd.parentNode.classList.add('open'); }
  }

  drawLiveBar();
  updateProgress();
  runTimer();
}

function wireWorkout(day) {
  var w = S.active;

  // apri/chiudi esercizio
  app.querySelectorAll('[data-toggle]').forEach(function (b) {
    b.onclick = function () {
      var body = document.getElementById('body' + b.dataset.toggle);
      var opening = body.classList.contains('hide');
      app.querySelectorAll('.ex-body').forEach(function (x) { x.classList.add('hide'); x.parentNode.classList.remove('open'); });
      if (opening) { body.classList.remove('hide'); body.parentNode.classList.add('open'); body.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    };
  });

  // «−» e «+»
  app.querySelectorAll('.stp button').forEach(function (b) {
    b.onclick = function () { bump(b.dataset.k, +b.dataset.i, b.dataset.f, +b.dataset.d); };
  });

  // il numero è toccabile: per chi proprio vuole digitarlo
  app.querySelectorAll('.stp .val').forEach(function (v) {
    v.onclick = function () { typeIn(v); };
  });

  // spunta della serie: primo tocco parte, secondo tocco fatta
  app.querySelectorAll('.tick').forEach(function (b) {
    b.onclick = function () { tapTick(b.dataset.k, +b.dataset.i); };
  });

  app.querySelectorAll('[data-addset]').forEach(function (b) {
    b.onclick = function () {
      var k = b.dataset.addset, arr = w.sets[k];
      var last = arr[arr.length - 1] || { kg: 0, reps: 0, target: '' };
      arr.push({ s: arr.length + 1, kg: last.kg, reps: last.reps, target: last.target, done: false });
      save(); viewWorkout();
    };
  });

  app.querySelectorAll('[data-cfg]').forEach(function (b) {
    b.onclick = function () {
      var el = document.getElementById('cfg' + b.dataset.cfg);
      el.classList.toggle('hide');
    };
  });

  // correzione del modo: ha effetto subito e per sempre
  app.querySelectorAll('.cfg [data-set]').forEach(function (b) {
    b.onclick = function () {
      var k = b.closest('.cfg').dataset.ex;
      var e = day.exercises.find(function (x) { return exKey(x.name) === k; });
      var bits = b.dataset.set.split(':');
      var patch = {};
      if (bits[0] === 'load') patch.load = bits[1] === '1';
      if (bits[0] === 'unit') patch.unit = bits[1];
      if (bits[0] === 'step') patch.step = +bits[1];
      setMode(e.name, e.kind, patch);
      w.modes[k] = modeFor(e.name, e.kind);
      // se il carico sparisce, i chili registrati non hanno più senso
      if (patch.load === false) w.sets[k].forEach(function (s) { s.kg = 0; });
      save(); viewWorkout();
      var idx = day.exercises.indexOf(e);
      var body = document.getElementById('body' + idx);
      if (body) { body.classList.remove('hide'); body.parentNode.classList.add('open'); }
      var cfg = document.getElementById('cfg' + idx);
      if (cfg) cfg.classList.remove('hide');
    };
  });
}

/**
 * Ogni contatore è SOLO suo.
 *
 * Fino al 25/09 il gesto si propagava in avanti: alzare i chili di una serie li
 * alzava anche in quelle dopo. Sembrava un risparmio di tocchi, ma nella pratica
 * è solo fastidio — «every counter should be independent from one another, right?
 * Right now, increasing one is still like changing the others, which is very
 * annoying». Le serie non sono uguali fra loro: una scaletta 8-8-6-5 la si scrive
 * serie per serie, e ogni correzione altrove è una cosa da disfare.
 *
 * La memoria resta, ma sta dove serve davvero: all'APERTURA dell'esercizio, dove
 * `seedSets` riempie ogni serie con quello che hai fatto l'ultima volta. Da lì in
 * poi il «+» muove un numero e uno solo.
 */
function setValue(k, i, field, v) {
  S.active.sets[k][i][field] = Math.max(0, Math.round(v * 100) / 100);
  save();
  refreshEx(k);
}

/** Muovere un valore di uno scatto. Non scende mai sotto zero. */
function bump(k, i, field, dir) {
  var w = S.active;
  var mode = w.modes[k] || baseMode();
  var st = w.sets[k][i];
  // toccare «−» o «+» sui secondi di una serie a tempo che corre vale "ho finito":
  // prima si incassa il tempo, poi lo si aggiusta. Mai due verità nello stesso numero.
  // (I chili si cambiano anche mentre corre: non sono misurati dal tempo.)
  if (field === 'reps' && mode.unit === 'sec' && st.t0 && !st.done) finishSet(k, i, Date.now());
  var v = field === 'reps' && mode.unit === 'sec'
    ? nextSec(st[field], dir)
    : (+st[field] || 0) + dir * stepOf(mode, field);
  setValue(k, i, field, v);
  if (navigator.vibrate) navigator.vibrate(8);
}

/** La serie in corso, { k, i }, o null: quella partita (`t0`) e non ancora fatta. */
function runningSet() {
  var w = S.active, r = null;
  if (!w) return null;
  Object.keys(w.sets).forEach(function (k) {
    w.sets[k].forEach(function (s, i) { if (s.t0 && !s.done && !r) r = { k: k, i: i }; });
  });
  return r;
}

/** Il tasto della spunta: vuoto, in corsa (il tempo della serie) o fatto (il segno). */
function tickBtn(k, i, st) {
  var run = st.t0 && !st.done;
  return '<button class="tick" data-k="' + esc(k) + '" data-i="' + i + '" aria-label="' +
    (st.done ? 'set done' : run ? 'finish the set' : 'start the set') + '">' + CHECK +
    '<span class="tt">' + (run ? clockOf(Date.now() - st.t0) : '') + '</span></button>';
}
function clockOf(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + d2(s % 60); }

/** La serie è fatta: la fine (`t1`) e, se è a tempo, il tempo preciso fra i due tocchi. */
function finishSet(k, i, now) {
  var st = S.active.sets[k][i], mode = S.active.modes[k] || baseMode();
  st.done = true;
  st.t1 = now;
  if (mode.unit === 'sec' && st.t0) st.reps = Math.max(0, Math.round((now - st.t0) / 10) / 100);
}

/**
 * Un tocco sulla spunta. Ferma → parte. In corsa → fatta. Fatta → torna
 * ferma (la correzione: gli orari si tolgono, la serie torna una proposta).
 */
function tapTick(k, i) {
  var st = S.active.sets[k][i], now = Date.now(), touched = [k];
  if (st.done) {
    st.done = false; delete st.t0; delete st.t1;
  } else if (st.t0) {
    finishSet(k, i, now);
  } else {
    var r = runningSet();
    if (r) { finishSet(r.k, r.i, now); if (touched.indexOf(r.k) < 0) touched.push(r.k); }
    st.t0 = now; delete st.t1;
  }
  save();
  touched.forEach(refreshEx);
  updateProgress();
  paintClock();
  runTimer();
  if (navigator.vibrate) navigator.vibrate(st.done ? [14, 40, 14] : st.t0 ? [14] : 8);
}

/** Il ridisegno della serie in corsa: acceso solo se una serie corre. */
function runTimer() {
  clearInterval(runT); runT = null; runKey = '';
  var r = runningSet();
  if (!r) return;
  runT = setInterval(paintRun, 100);
  paintRun();
}

/**
 * Il tempo che scorre nella spunta — e, a tempo, nella cella dei secondi, col
 * colore che sale: rosso sotto l'ultima volta, verde sopra, oro oltre il
 * record. Tocca UNA riga, niente altro.
 */
function paintRun() {
  var r = runningSet();
  if (!r) { clearInterval(runT); runT = null; return; }
  var row = app.querySelector('.setrow[data-row="' + cssEsc(r.k + '|' + r.i) + '"]');
  if (!row) return;                       // fuori dalla pagina: la serie corre lo stesso
  var st = S.active.sets[r.k][r.i], ms = Date.now() - st.t0;
  var tt = row.querySelector('.tick .tt');
  if (tt) tt.textContent = clockOf(ms);
  var mode = S.active.modes[r.k] || baseMode();
  if (mode.unit !== 'sec') return;
  if (runKey !== r.k + '|' + r.i) {
    // asticella e paragone si leggono UNA volta per serie, non 10 al secondo
    runKey = r.k + '|' + r.i;
    runBar = liveBar(r.k, r.i, analyze(S.history).best[r.k]);
    runPrev = lastSets(r.k, S.active.id).sets[r.i] || null;
  }
  var sec = Math.round(ms / 10) / 100;
  var cell = row.querySelector('.stp[data-f="reps"] .val');
  if (cell) cell.innerHTML = lcdHTML(secText(sec));
  row.className = 'setrow run' + liveMark({ kg: st.kg, reps: sec }, runPrev, runBar);
}

/** Digitare il numero a mano: la via secondaria, per chi la vuole. */
function typeIn(el) {
  var k = el.dataset.k, i = +el.dataset.i, f = el.dataset.f;
  var w = S.active, st = w.sets[k][i];
  var mode = w.modes[k] || baseMode();
  var what = f === 'kg' ? 'Kg' : (mode.unit === 'sec' ? 'Seconds' : 'Reps');
  var cur = +st[f] || 0;
  Health.askNum(what + ', set ' + (i + 1) + ':', cur, function (v) { setValue(k, i, f, v); });
}

/**
 * Ridisegnare SOLO l'esercizio toccato.
 * Rifare tutta la pagina a ogni «+» chiuderebbe l'esercizio aperto e farebbe
 * saltare lo scorrimento: in palestra, col telefono sulla panca, è la cosa
 * più fastidiosa che ci sia.
 */
function refreshEx(k) {
  var w = S.active;
  var box = app.querySelector('.ex[data-ex="' + cssEsc(k) + '"]');
  if (!box) return viewWorkout();
  var sets = w.sets[k] || [];
  var mode = w.modes[k] || baseMode();
  var prev = lastSets(k, w.id).sets;
  var hb = analyze(S.history).best[k];

  box.querySelectorAll('.setrow').forEach(function (row, i) {
    var st = sets[i];
    if (!st) return;
    var running = !!(st.t0 && !st.done);
    row.className = 'setrow' + (st.done ? ' ok' : running ? ' run' : '') + liveMark(st, prev[i], liveBar(k, i, hb));
    row.querySelectorAll('.stp').forEach(function (stp) {
      var f = stp.dataset.f;
      // la serie a tempo in corsa è padrona della sua cella: non la si sovrascrive
      if (running && f === 'reps' && mode.unit === 'sec') return;
      stp.querySelector('.val').innerHTML = lcdHTML(valText(f, st, mode));
    });
    var tk = row.querySelector('.tick');
    if (tk) tk.outerHTML = tickBtn(k, i, st);
  });
  box.querySelectorAll('.tick').forEach(function (b) {
    b.onclick = function () { tapTick(b.dataset.k, +b.dataset.i); };
  });

  var done = sets.filter(function (s) { return s.done; }).length;
  var tick = box.querySelector('.ex-tick');
  tick.textContent = done ? done + '/' + sets.length : '';
  tick.classList.toggle('full', done === sets.length && !!done);
  box.classList.toggle('done', done === sets.length && !!done);
}

/** I nomi degli esercizi contengono spazi e trattini: vanno citati. */
function cssEsc(s) {
  if (window.CSS && CSS.escape) return CSS.escape(s);
  return String(s).replace(/["\\]/g, '\\$&');
}

function allDone() {
  return Object.keys(S.active.sets).every(function (k) {
    return S.active.sets[k].every(function (s) { return s.done; });
  });
}

function updateProgress() {
  if (!S.active) return;
  var tot = 0, done = 0;
  Object.keys(S.active.sets).forEach(function (k) {
    S.active.sets[k].forEach(function (s) { tot++; if (s.done) done++; });
  });
  var bar = document.getElementById('progbar');
  if (bar) bar.style.width = (tot ? (done / tot * 100) : 0) + '%';
  var lbl = document.getElementById('liveCount');
  if (lbl) lbl.textContent = done + '/' + tot;
}

/**
 * La barra in fondo durante l'allenamento: il quadrante grande dell'orologio.
 * Di solito dice da quanto ti stai allenando; durante il RECUPERO si accende
 * (come la luce dell'orologio) e CONTA IN AVANTI il recupero fatto finora
 * (niente conto alla rovescia). Toccarlo non fa niente.
 */
function drawLiveBar() {
  var old = document.querySelector('.livebar');
  if (old) old.remove();
  if (!S.active) return;
  var bar = h('<div class="livebar">' +
    '<button class="clock lcd" id="liveClock" aria-label="time"><small>time</small><span class="dg" data-g="8:88">0:00</span></button>' +
    '<div class="count" id="liveCount">0/0</div>' +
    '<button class="btn primary" id="finishBtn" style="flex:1">Finish</button>' +
    '</div>').firstChild;
  document.body.appendChild(bar);
  document.getElementById('finishBtn').onclick = finishWorkout;
  paintClock();
  tickClock();
}

var clockT = null;
function tickClock() {
  clearInterval(clockT);
  clockT = setInterval(paintClock, 1000);
}

function paintClock() {
  var el = document.getElementById('liveClock');
  if (!el || !S.active) { clearInterval(clockT); return; }
  var txt, lbl, from = restSince();
  if (from) {
    var past = Math.max(0, Math.floor((Date.now() - from) / 1000));
    txt = Math.floor(past / 60) + ':' + d2(past % 60); lbl = 'rest';
    el.classList.add('rest');
  } else {
    var ms = Date.now() - new Date(S.active.startedAt).getTime();
    var m = Math.floor(ms / 60000);
    txt = Math.floor(m / 60) ? Math.floor(m / 60) + ':' + d2(m % 60) + ':' + d2(Math.floor(ms / 1000) % 60)
                             : m + ':' + d2(Math.floor(ms / 1000) % 60);
    lbl = 'time';
    el.classList.remove('rest');
  }
  el.innerHTML = '<small>' + lbl + '</small>' + lcdHTML(txt);
}

/**
 * Da quando corre il recupero (ms), o 0. Non è uno stato a parte: si legge
 * dalle serie, così una pagina riaperta lo ritrova uguale. Corre dalla fine
 * dell'ultima serie fatta (`t1`) finché non parte una serie dopo (il primo
 * tocco della sua spunta). Dopo l'ultima serie in assoluto non corre:
 * lì si termina.
 */
function restSince() {
  var w = S.active;
  if (!w || runningSet() || allDone()) return 0;
  var end = 0, start = 0;
  Object.keys(w.sets).forEach(function (k) {
    w.sets[k].forEach(function (s) {
      if (s.done && s.t1 > end) end = s.t1;
      if (s.t0 > start) start = s.t0;
    });
  });
  return end && start < end ? end : 0;
}

function finishWorkout() {
  var w = S.active;
  var done = 0, r = runningSet(), now = Date.now();
  Object.keys(w.sets).forEach(function (k) { w.sets[k].forEach(function (s) { if (s.done) done++; }); });
  // una serie partita e non chiusa: «Termina» vale anche come suo secondo tocco
  // (la fine è l'istante del tocco su «Termina», non quello della conferma)
  if (r) done++;
  if (!done) {
    Health.ask('You have not ticked any set. Close and discard anyway?', 'Discard', function () {
      if (S.active !== w) return;                  // nel frattempo è cambiato tutto: non si tocca niente
      S.active = null; save();
      clearInterval(clockT);
      document.body.classList.remove('workout-live');
      var lb = document.querySelector('.livebar'); if (lb) lb.remove();
      go('#/home');
    }, true);
    return;
  }
  Health.ask('Finish the workout?\n' + done + (done === 1 ? ' ticked set goes' : ' ticked sets go') + ' into your history.', 'Finish', function () {
    if (S.active === w) closeWorkout(w, r, now);   // la finestrella non ferma l'app come la finestra grigia: si ricontrolla
  });
}

/** Chiude l'allenamento dopo il sì: lo storico prende solo le serie spuntate. */
function closeWorkout(w, r, now) {
  if (r) finishSet(r.k, r.i, now);
  clearInterval(runT); runT = null;

  w.endedAt = new Date().toISOString();
  // nello storico ci va SOLO quello che hai spuntato: le serie apparecchiate
  // e mai confermate non sono accadute.
  Object.keys(w.sets).forEach(function (k) {
    w.sets[k] = w.sets[k].filter(function (s) { return s.done; })
                         .map(function (s, i) {
                           var o = { s: i + 1, kg: s.kg, reps: s.reps, target: s.target };
                           if (s.t0) o.t0 = s.t0;     // orari della serie (dal 20/10): campi in più,
                           if (s.t1) o.t1 = s.t1;     // un backup vecchio resta valido così com'è
                           return o; });
    if (!w.sets[k].length) { delete w.sets[k]; delete w.modes[k]; delete w.kinds[k]; }
  });
  w.order = (w.order || []).filter(function (k) { return w.sets[k]; });
  S.history.push(w);
  S.history.sort(function (a, b) { return a.startedAt.localeCompare(b.startedAt); });
  S.history.forEach(function (x, i) { x.n = i + 1; });
  S.active = null;
  save();
  clearInterval(clockT);
  document.body.classList.remove('workout-live');
  var bar = document.querySelector('.livebar'); if (bar) bar.remove();
  go('#/storico/' + w.id);
  setTimeout(function () { toast('Workout saved'); }, 250);
}

/* --- storico ------------------------------------------------------------- */
function viewHistory() {
  if (!S.history.length) {
    app.innerHTML = '<h1>History</h1><div class="empty">' +
      'No workouts yet.<br>The first one you finish shows up here.</div>';
    return;
  }
  var st = analyze(S.history);
  var out = '<h1>History</h1><p class="sub">' + S.history.length + ' workouts · since ' +
    fmtShort(S.history[0].startedAt) + '</p>';

  S.history.slice().reverse().forEach(function (w) {
    var m = st.marks[w.id] || {};
    var up = 0, down = 0, pr = 0;
    Object.keys(m).forEach(function (k) {
      m[k].forEach(function (x) { if (x.mark === 'up') up++; else if (x.mark === 'down') down++; else if (x.mark === 'pr') pr++; });
    });
    out += '<button class="hitem" data-w="' + esc(w.id) + '">' +
      '<div class="num lcd">' + lcdHTML(w.n) + '</div>' +
      '<div class="meta"><b>' + esc(w.dayLabel) + '</b>' +
      '<small>' + fmtDate(w.startedAt) + ' · ' + fmtTime(w.startedAt) + durText(w) + '</small></div>' +
      '<div class="tags">' +
        (pr ? '<span class="v-pr">' + pr + ' record</span>' : '') +
        (up ? '<span class="v-up">' + up + ' better</span>' : '') +
        (down ? '<span class="v-down">' + down + ' worse</span>' : '') +
      '</div></button>';
  });
  app.innerHTML = out;
  app.querySelectorAll('[data-w]').forEach(function (b) {
    b.onclick = function () { go('#/storico/' + b.dataset.w); };
  });
}

function viewWorkoutDetail(id) {
  var w = S.history.find(function (x) { return x.id === id; });
  if (!w) return go('#/storico');
  var st = analyze(S.history);
  var m = st.marks[w.id] || {};

  var out = '<h1>' + esc(w.dayLabel) + ' · no. ' + w.n + '</h1>' +
    '<p class="sub">' + fmtDate(w.startedAt) + ' · ' + fmtTime(w.startedAt) + ' → ' +
    (w.endedAt ? fmtTime(w.endedAt) : '?') + durText(w) + '</p>';

  // l'orologio sopra la seduta: la linea del tempo, poi gli esercizi
  var t0w = +new Date(w.startedAt), t1w = +new Date(w.endedAt || w.startedAt);
  var tlSets = [], ends = [];
  (w.order || Object.keys(w.sets)).forEach(function (k, ei) {
    (w.sets[k] || []).forEach(function (s) { if (s.t1) { tlSets.push({ t0: s.t0, t1: s.t1, ex: ei }); ends.push(s.t1); } });
  });
  ends.sort(function (x, y) { return x - y; });
  out += '<div class="card tlcard" data-tl></div>';

  (w.order || Object.keys(w.sets)).forEach(function (k) {
    var sets = w.sets[k];
    if (!sets || !sets.length) return;
    var mode = wMode(w, k);
    var mk = m[k] || [];
    out += '<div class="card"><div class="exname">' + esc(k) + '</div><div class="dtl">';
    sets.forEach(function (s, i) {
      var mark = (mk[i] && mk[i].mark) || 'same';
      var cls = mark === 'pr' ? 'v-pr' : mark === 'up' ? 'v-up' : mark === 'down' ? 'v-down' : 'v-same';
      out += '<div class="dtlrow"><span class="sn">' + (i + 1) + '</span>' +
        '<span class="lcd chip ' + cls + '">' + lcdHTML(setText(s, mode)) + '</span>' +
        (mark === 'pr' ? '<span class="pill pill-pr">record</span>' :
         mark === 'up' ? '<span class="pill pill-up">better</span>' :
         mark === 'down' ? '<span class="pill pill-down">worse</span>' : '<span class="pill"></span>') +
        setWhen(s, ends) +
        '</div>';
    });
    out += '</div></div>';
  });

  out += '<button class="btn" data-sheet>Sheet to print or save as PDF</button>' +
    '<button class="btn danger" data-del>Delete this workout</button>' +
    '<button class="btn ghost" data-back>Back</button>';

  // lo stesso allenamento visto dall'orologio, e la seduta prima / dopo (sport.js)
  var wt = Health.watchFor ? Health.watchFor(+new Date(w.startedAt), +new Date(w.endedAt || w.startedAt)) : null;
  out = out.replace('<h1>', (Health.sessionNav ? Health.sessionNav('#/storico/' + w.id) : '') + '<h1>');
  if (wt) out = out.replace('</p>', '</p>' + Health.watchCard(wt));

  app.innerHTML = out;
  if (Health.wireNav) Health.wireNav(app, go);
  if (Health.timeline) Health.timeline(app.querySelector('[data-tl]'), {
    from: t0w - 300000, to: t1w + 300000, session: [t0w, t1w], sets: tlSets,
    watch: wt ? [wt[0] * 1000, wt[1] * 1000] : null, watchAvg: wt ? wt[6] : 0
  }, function (pts) {
    // il battito di ogni serie, accanto alla sua ora
    if (!pts.length) return;
    app.querySelectorAll('[data-shr]').forEach(function (el) {
      var bpm = Health.setHr(pts, { t0: +el.dataset.t0 || 0, t1: +el.dataset.shr });
      if (bpm) el.textContent = bpm + ' bpm';
    });
  });
  app.querySelector('[data-sheet]').onclick = function () { openSheet(w.id); };
  app.querySelector('[data-back]').onclick = function () { go(Health.ret || '#/allenamenti'); };
  app.querySelector('[data-del]').onclick = function () {
    Health.ask('Delete workout no. ' + w.n + ' of ' + fmtDate(w.startedAt) + '?\nRecords will be recalculated.', 'Delete', function () {
      S.history = S.history.filter(function (x) { return x.id !== id; });
      S.history.forEach(function (x, i) { x.n = i + 1; });
      save(); go('#/storico'); toast('Workout deleted');
    }, true);
  };
}

/**
 * L'ora di una serie nello storico (dal 20/10): «18:12» (fine) o «18:10–18:12»
 * (inizio e fine), il recupero prima di lei se si sa da quando era finita la
 * serie precedente, e un posto per il battito (lo riempie la linea del tempo).
 * Le serie di prima del 20/10 non hanno orari: niente, non si indovina.
 */
function setWhen(s, ends) {
  if (!s.t1) return '';
  var prev = 0;
  if (s.t0) ends.forEach(function (e) { if (e <= s.t0 && e > prev) prev = e; });
  return '<span class="when">' + (s.t0 && s.t0 < s.t1 ? fmtTime(new Date(s.t0).toISOString()) + '–' : '') +
    fmtTime(new Date(s.t1).toISOString()) +
    (prev ? ' · rest ' + mmss(Math.round((s.t0 - prev) / 1000)) : '') +
    ' <b data-shr="' + s.t1 + '" data-t0="' + (s.t0 || '') + '"></b></span>';
}

/* --- record -------------------------------------------------------------- */
function viewRecords() {
  var st = analyze(S.history);
  if (!st.records.length) {
    app.innerHTML = '<h1>Record</h1><div class="empty">' +
      'No records yet.<br>Records come from the gym workouts<br>you finish here, set by set.</div>';
    return;
  }
  var out = '<h1>Personal records</h1><p class="sub">Your best set ever, exercise by exercise</p><div class="card">';
  st.records.forEach(function (r) {
    out += '<div class="pr"><div class="nm">' + esc(r.name) + '</div>' +
      '<div class="val lcd">' + lcdHTML(setText(r.info.set, r.info.mode)) + '</div>' +
      '<div class="when">' + fmtShort(r.info.at) + '<br>no. ' + r.info.n + '</div></div>';
  });
  out += '</div><button class="btn" data-sheet>Full sheet to print or save as PDF</button>';
  app.innerHTML = out;
  app.querySelector('[data-sheet]').onclick = function () { openSheet(null); };
}

/* --- scheda / impostazioni ----------------------------------------------- */
function viewSettings() {
  var p = S.plan || {};
  var out = '<h1>Plan</h1>';

  if (S.plan) {
    out += '<div class="card">' +
      '<div style="font-weight:700">' + esc(p.level || p.program || '—') + '</div>' +
      '<p class="sub" style="margin:6px 0 0">' +
      esc(p.club || '') + (p.instructor ? ' · ' + esc(p.instructor) : '') + '<br>' +
      p.days.length + ' days · ' + p.days.reduce(function (a, d) { return a + d.exercises.length; }, 0) + ' exercises' +
      (p.expiry ? '<br>Expires ' + esc(p.expiry) : '') +
      (p.importedAt ? '<br>Loaded on ' + fmtDate(p.importedAt) : '') +
      '</p></div>';
  }

  // come si misura ogni esercizio, tutto in un posto solo
  if (S.plan) {
    out += '<h2>How it is measured</h2><div class="card"><div class="modelist">';
    var seen = {};
    p.days.forEach(function (d) {
      d.exercises.forEach(function (e) {
        var k = exKey(e.name);
        if (seen[k]) return;
        seen[k] = 1;
        var m = modeFor(e.name, e.kind);
        out += '<div class="moderow"><span class="nm">' + esc(e.name) + '</span>' +
          '<span class="how">' + (m.load ? 'kg + ' : '') +
          (m.unit === 'sec' ? 'seconds' : 'reps') +
          (m.load ? ' · ' + num(m.step) + ' kg' : '') + '</span></div>';
      });
    });
    out += '</div><p class="sub" style="margin:10px 0 0">You can change it during the workout, ' +
      'under each exercise, in <b>How it is measured</b>.</p></div>';
  }

  out += '<h2>Change plan</h2><div class="card flat">' +
    '<p class="sub" style="margin-top:0">On the gym\'s website open the plan, press <b>2 Posizioni</b>, ' +
    'then save the page as <b>.mht</b> and load it here. History and records <b>stay</b>: ' +
    'exercises are matched by name.</p>' +
    '<label class="filelabel" for="mhtfile">Load .mht file</label>' +
    '<input type="file" id="mhtfile" accept=".mht,.mhtml,message/rfc822,multipart/related">' +
    '</div>';

  out += '<h2>Data</h2>' +
    '<button class="btn" data-export>Export backup (.json)</button>' +
    '<label class="filelabel" for="bkfile">Restore backup</label>' +
    '<input type="file" id="bkfile" accept=".json,application/json">' +
    '<button class="btn" data-sheet>Full sheet to print or save as PDF</button>' +
    '<button class="btn danger" data-wipe>Delete everything</button>';

  out += '<p class="sub" style="margin-top:22px">Your data lives only on this phone. ' +
    'A backup now and then does no harm.</p>';

  app.innerHTML = out;

  document.getElementById('mhtfile').onchange = function (ev) { importMht(ev.target.files[0]); };
  document.getElementById('bkfile').onchange = function (ev) { importBackup(ev.target.files[0]); };
  app.querySelector('[data-export]').onclick = exportBackup;
  app.querySelector('[data-sheet]').onclick = function () { openSheet(null); };
  app.querySelector('[data-wipe]').onclick = function () {
    Health.ask('Delete plan, history and records? This cannot be undone.', 'Delete', function () {
      Health.ask('Really sure? Export a backup first.', 'Delete everything', function () {
        localStorage.removeItem(KEY); IDB.clear(); S = blank();
        bootPlan().then(function () { go('#/home'); toast('Everything deleted'); });
      }, true);
    }, true);
  };
}

// --------------------------------------------------------------------------
// 6. IMPORTAZIONE / ESPORTAZIONE — .mht in entrata, backup .json nei due versi
// --------------------------------------------------------------------------

function importMht(file) {
  if (!file) return;
  var fr = new FileReader();
  fr.onload = function () {
    var res;
    try {
      res = self.SchedaParser.parseMht(fr.result);
    } catch (e) {
      Health.say('I cannot read this file.\n\n' + e.message); return;
    }
    var p = res.plan;
    if (p.logo && !res.images[p.logo]) p.logo = '';
    var nEx = p.days.reduce(function (a, d) { return a + d.exercises.length; }, 0);
    var known = analyze(S.history).records.map(function (r) { return r.name; });
    var kept = 0;
    p.days.forEach(function (d) { d.exercises.forEach(function (e) { if (known.indexOf(exKey(e.name)) >= 0) kept++; }); });

    Health.ask('New plan:\n' + (p.level || p.program) + '\n' +
        p.days.length + ' days, ' + nEx + ' exercises\n' +
        (p.expiry ? 'Expires ' + p.expiry + '\n' : '') + '\n' +
        kept + ' exercises already have a history and keep it.\n' +
        S.history.length + ' past workouts stay untouched.\n\nReplace the plan?', 'Replace', function () { usePlan(res, p, nEx); });
  };
  fr.onerror = function () { Health.say('I could not read the file.'); };
  fr.readAsArrayBuffer(file);          // byte grezzi: le immagini nel .mht non sono base64
}

/** La scheda nuova, dopo il sì: le figure in IndexedDB, poi il piano. */
function usePlan(res, p, nEx) {
    var imgs = {};
    Object.keys(res.images).forEach(function (k) { imgs[k] = self.SchedaParser.imageToDataUrl(res.images[k]); });
    IDB.putAll(imgs).then(function () {
      imgCache = {};
      S.plan = p; S.imgSource = 'idb'; S.active = null;
      save(); go('#/home');
      toast('Plan updated: ' + nEx + ' exercises');
    }).catch(function (e) {
      // niente IndexedDB? la scheda entra lo stesso, le figure resteranno le vecchie
      S.plan = p; S.active = null; save(); go('#/home');
      toast('Plan updated (images not saved)');
    });
}

/** L'unica cosa che esce da questo telefono: il backup, a mano, chiesto da te. */
function download(name, text) {
  // dentro l'APK un <a download> non scarica niente: scrive il guscio (Download)
  if (window.SchedaNative) return SchedaNative.saveFile(name, text);
  var b = new Blob([text], { type: 'application/json' });
  var u = URL.createObjectURL(b);
  var a = document.createElement('a');
  a.href = u; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 1000);
  return true;
}

function exportBackup() {
  var d = new Date();
  var ok = download('scheda-backup-' + d.getFullYear() + d2(d.getMonth() + 1) + d2(d.getDate()) + '.json',
    JSON.stringify(S, null, 1));
  toast(ok ? 'Backup downloaded' : 'Backup NOT saved');
}

function importBackup(file) {
  if (!file) return;
  var fr = new FileReader();
  fr.onload = function () {
    try {
      var o = JSON.parse(fr.result);
      if (!o || o.v !== 1 || !Array.isArray(o.history)) throw new Error('unknown format');
    } catch (e) { Health.say('Invalid backup: ' + e.message); return; }
    Health.ask('Restore the backup?\n' + o.history.length + ' workouts.\nWhat is here now gets replaced.', 'Restore', function () {
      S = o; if (!S.modes) S.modes = {};
      save(); go('#/home'); toast('Backup restored');
    });
  };
  fr.readAsText(file);
}

// --------------------------------------------------------------------------
// 7. IL FOGLIO (stampa / PDF)
//
// Sulla carta il colore non esiste: quindi ogni esito porta anche una parola.
// --------------------------------------------------------------------------

function openSheet(workoutId) {
  var st = analyze(S.history);
  var p = S.plan || {};
  var w = workoutId ? S.history.find(function (x) { return x.id === workoutId; }) : null;

  var doc = '<div class="sheet-doc">';
  doc += '<h1>' + esc(p.athlete || 'Workout plan') + '</h1>' +
    '<p class="meta">' + esc(p.level || p.program || '') +
    (p.club ? ' · ' + esc(p.club) : '') + (p.instructor ? ' · ' + esc(p.instructor) : '') + '</p>' +
    '<p class="meta">Sheet made on ' + fmtDate(new Date().toISOString()) + ' · ' +
    S.history.length + ' workouts recorded</p>';

  // --- record in cima, come chiesto
  if (st.records.length) {
    doc += '<h2>Personal records</h2><table><thead><tr>' +
      '<th>Exercise</th><th>Best</th><th>When</th></tr></thead><tbody>';
    st.records.forEach(function (r) {
      doc += '<tr><td>' + esc(r.name) + '</td>' +
        '<td class="n s-pr">' + esc(setText(r.info.set, r.info.mode)) + '</td>' +
        '<td class="n">' + fmtShort(r.info.at) + ' (n.' + r.info.n + ')</td></tr>';
    });
    doc += '</tbody></table>';
  }

  // --- l'allenamento appena chiuso, in dettaglio
  if (w) doc += sheetWorkout(w, st, 'Workout no. ' + w.n);

  // --- tutto lo storico
  doc += '<h2>Full history</h2>';
  if (!S.history.length) doc += '<p class="meta">No workouts.</p>';
  S.history.slice().reverse().forEach(function (x) {
    if (w && x.id === w.id) return;
    doc += sheetWorkout(x, st, null);
  });

  doc += '<p class="legend"><b>PR</b> personal record at that date · ' +
    '<b style="color:#147a3d">+</b> better than the time before · ' +
    '<b style="color:#b02626">−</b> worse. ' +
    'The comparison uses the estimated one-rep max (Epley) when there is a load, ' +
    'reps or seconds when there is not.</p>';
  doc += '</div>';

  // ATTENZIONE: niente h() qui. h() restituisce un div CONTENITORE, quindi il
  // foglio nascerebbe già con un parentNode (il contenitore usa-e-getta) e non
  // finirebbe mai nel body: i bottoni non esisterebbero e openSheet morirebbe.
  var sheet = document.getElementById('sheet');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'sheet';
  }
  sheet.innerHTML = '<div class="close noprint" style="margin-bottom:14px">' +
    '<button class="btn primary small" id="doPrint">Save as PDF</button> ' +
    '<button class="btn small ghost" id="closeSheet">Close</button></div>' + doc;
  if (!sheet.parentNode) document.body.appendChild(sheet);
  sheet.classList.add('on');
  sheet.querySelector('#doPrint').onclick = function () {
    // dentro l'APK window.print() non fa niente: stampa il guscio
    if (window.SchedaNative) SchedaNative.print(); else window.print();
  };
  sheet.querySelector('#closeSheet').onclick = function () { sheet.classList.remove('on'); };
}

function sheetWorkout(w, st, title) {
  var m = st.marks[w.id] || {};
  // la riga sotto il titolo si compone di pezzi VERI: una durata di 0 minuti
  // non si scrive, perché «0 min» sembra un guasto e non dice niente.
  var dur = new Date(w.endedAt) - new Date(w.startedAt);
  var righe = [fmtDate(w.startedAt), fmtTime(w.startedAt)];
  if (dur >= 60000) righe.push(fmtDur(dur));
  if (title) righe.push(esc(w.dayLabel));

  var out = '<h2>' + esc(title || (w.dayLabel + ' — no. ' + w.n)) + '</h2>' +
    '<p class="meta">' + righe.join(' · ') + '</p>' +
    '<table><thead><tr><th>Exercise</th><th>Sets</th></tr></thead><tbody>';

  (w.order || Object.keys(w.sets)).forEach(function (k) {
    var sets = w.sets[k];
    if (!sets || !sets.length) return;
    var mode = wMode(w, k);
    var mk = m[k] || [];
    var cells = sets.map(function (s, i) {
      var mark = (mk[i] && mk[i].mark) || 'same';
      var cls = mark === 'pr' ? 's-pr' : mark === 'up' ? 's-up' : mark === 'down' ? 's-down' : '';
      var tag = mark === 'pr' ? ' PR' : mark === 'up' ? ' +' : mark === 'down' ? ' −' : '';
      return '<span class="' + cls + '">' + esc(setText(s, mode)) + tag + '</span>';
      // ⚠ Lo spazio fra una serie e l'altra è NORMALE, non `&nbsp;`. Uno spazio
      // unificatore è l'unica cosa che c'è fra due riquadri e vieta l'a-capo:
      // con sei serie la cella non poteva andare a capo e sbordava fuori dal
      // foglio. L'aria fra le serie la mette il CSS (`margin-left`), non il testo.
    }).join(' ');
    out += '<tr><td>' + esc(k) + '</td><td class="n serie">' + cells + '</td></tr>';
  });

  return out + '</tbody></table>';
}

// --------------------------------------------------------------------------
// 8. AVVIO — rotte, service worker, primo disegno
// --------------------------------------------------------------------------

function render() {
  var hash = location.hash || '#/giorni';
  var parts = hash.replace(/^#\//, '').split('/');
  var page = parts[0] || 'giorni';
  Health.popClose();                             // cambi pagina: la finestrella non ti segue
  // «indietro» torna al calendario solo dalla seduta aperta dal calendario
  var pg = Health.pages[page];
  if (!((page === 'storico' || page === 'sport') && parts[1]) && !(pg && pg.keepRet && pg.keepRet(parts)) && page !== 'giorni') Health.ret = null;

  if (page !== 'workout') {
    awake(false);
    clearInterval(runT); runT = null;   // la serie in corso continua: è scritta nei dati
    document.body.classList.remove('workout-live');
    var lb = document.querySelector('.livebar');
    if (lb) lb.remove();
  }

  if (page === 'giorni') { Health.view(app, go); markNav('#/giorni'); window.scrollTo(0, 0); return; }
  // le altre zone di Health (sonno, sostanze, …) disegnano da sé la loro pagina
  if (Health.pages[page]) { Health.pages[page](app, go, parts); markNav('#/' + page); window.scrollTo(0, 0); return; }

  if (!S.plan && page !== 'scheda') { viewNoPlan(); markNav('#/home'); return; }

  if (page === 'home') viewHome();
  else if (page === 'giorno') viewDay(parts[1]);
  else if (page === 'workout') viewWorkout();
  else if (page === 'storico') parts[1] ? viewWorkoutDetail(parts[1]) : viewHistory();
  else if (page === 'record') viewRecords();
  else if (page === 'scheda') viewSettings();
  else viewHome();

  markNav('#/' + page);
  window.scrollTo(0, 0);
}

/**
 * Lo schermo resta acceso durante l'allenamento. Il telefono sta sulla panca
 * fra una serie e l'altra: se si spegne, per vedere il recupero o la serie
 * dopo devi sbloccarlo con le mani sudate. Fuori dall'allenamento torna a
 * spegnersi come sempre.
 * Nell'APK lo fa il guscio (SchedaNative.keepAwake); nel browser il Wake Lock,
 * che il browser stesso rilascia quando l'app va in secondo piano: al ritorno
 * lo si richiede (`visibilitychange`).
 */
var wakeOn = false, wakeLock = null;
function awake(on) {
  if (on === wakeOn) return;
  wakeOn = on;
  if (window.SchedaNative && SchedaNative.keepAwake) { SchedaNative.keepAwake(on); return; }
  if (on) askLock();
  else if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
}
function askLock() {
  if (!navigator.wakeLock || wakeLock || document.visibilityState !== 'visible') return;
  navigator.wakeLock.request('screen').then(function (l) {
    if (!wakeOn) { l.release().catch(function () {}); return; }   // uscito nel frattempo
    wakeLock = l;
    l.addEventListener('release', function () { if (wakeLock === l) wakeLock = null; });
  }).catch(function () {});
}
document.addEventListener('visibilitychange', function () {
  if (wakeOn && !window.SchedaNative) askLock();
});

/**
 * Il tasto «indietro» del telefono, nell'APK. Il guscio chiede qui prima di
 * fare qualunque cosa: vero = gestito, falso = esci dall'app (che resta viva
 * in secondo piano, e un allenamento in corso è comunque già salvato).
 * Prima chiude quello che è aperto sopra (il foglio), poi risale di un passo:
 * una seduta → Allenamenti (o il calendario, se l'hai aperta da lì: `Health.ret`);
 * una pagina dello Sport → Palestra → Giorni → fuori; Sonno e Sostanze → Giorni.
 */
window.SchedaBack = function () {
  if (Health.popClose()) return true;            // la finestrella (giorni.js) si chiude per prima
  var sheet = document.getElementById('sheet');
  if (sheet && sheet.classList.contains('on')) { sheet.classList.remove('on'); return true; }
  var parts = (location.hash || '#/giorni').replace(/^#\//, '').split('/');
  var page = parts[0] || 'giorni';
  if ((page === 'storico' || page === 'sport') && parts[1]) { go(Health.ret || '#/allenamenti'); return true; }
  if (page === 'giorni') { if (Health.back()) { render(); return true; } return false; }
  // una pagina che sa dove sta il suo passo indietro (My workouts, mine.js)
  if (Health.pages[page] && Health.pages[page].back) { go(Health.pages[page].back(parts)); return true; }
  if (page === 'home' || (Health.pages[page] && Health.pages[page].area !== 'sport')) { go('#/giorni'); return true; }
  go('#/home'); return true;
};

function markNav(h) {
  var pg = h.replace(/^#\//, '');
  // le pagine della Scheda stanno nello Sport; le pagine di Health dicono la loro zona
  var area = pg === 'giorni' ? 'giorni' : Health.pages[pg] ? Health.pages[pg].area : 'sport';
  document.querySelectorAll('#nav .navbtn').forEach(function (b) {
    b.classList.toggle('on', b.dataset.area === area);
  });
  document.body.classList.toggle('in-sport', area === 'sport');
  document.querySelectorAll('#subnav .subbtn').forEach(function (b) {
    b.classList.toggle('on', b.dataset.go === h);
  });
}

function bootPlan() {
  if (S.plan) return Promise.resolve();
  return fetch('plan.json').then(function (r) { return r.json(); }).then(function (p) {
    S.plan = p; S.imgSource = 'files'; save();
  }).catch(function () { /* nessun piano di serie: si carica a mano */ });
}

/**
 * La palestra dentro lo SPORT di Health (sport.js): la palestra è uno sport
 * come gli altri. Qui si dice solo COSA è successo in palestra;
 * dove si vede (calendario, Allenamenti, scorrere fra le sedute) lo decide
 * sport.js, uguale per palestra e orologio.
 *   { start, end (ms), title, sub, value, tone, go }
 * Ogni allenamento finito ha la sua voce (giorno = ora LOCALE di inizio),
 * quello in corso pure. A destra i record se ci sono, se no quanto è durato.
 * L'orologio della stessa ora si unisce qui (sport.js `watchFor`).
 */
Health.palestra = function () {
  var out = [], st = analyze(S.history);
  S.history.forEach(function (w) {
    var m = st.marks[w.id] || {}, pr = 0, nEx = 0;
    Object.keys(m).forEach(function (k) {
      if (m[k].some(function (x) { return x.mark !== 'none'; })) nEx++;
      m[k].forEach(function (x) { if (x.mark === 'pr') pr++; });
    });
    var a = +new Date(w.startedAt), b = +new Date(w.endedAt || w.startedAt);
    var watch = Health.watchFor ? Health.watchFor(a, b) : null;
    out.push({
      start: a, end: b, watch: watch,
      title: 'Gym · ' + w.dayLabel,
      sub: fmtTime(w.startedAt) + durText(w) + ' · ' + nEx + (nEx === 1 ? ' exercise' : ' exercises') +
        (watch ? ' · ' + Health.watchText(watch) : ''),
      value: pr ? pr + ' rec' : (b - a >= 60000 ? fmtDur(b - a) : ''),
      tone: pr ? 'pr' : '',
      go: '#/storico/' + w.id
    });
  });
  if (S.active) {
    var sa = +new Date(S.active.startedAt);
    out.push({ start: sa, end: sa, live: true,
      title: 'Gym · ' + S.active.dayLabel, sub: 'in progress, started at ' + fmtTime(S.active.startedAt),
      value: 'resume', tone: 'live', go: '#/workout' });
  }
  return out;
};

/**
 * Gli attrezzi PURI della palestra, in prestito a «My workouts» (mine.js): gli stessi −/+, la stessa
 * spunta disegnata, lo stesso cronometro e lo schermo acceso. Solo funzioni che non toccano `scheda.v1`.
 */
Health.kit = {
  CHECK: CHECK, lcdHTML: lcdHTML, num: num, secText: secText, nextSec: nextSec, clockOf: clockOf,
  setText: setText, score: score, hasValue: hasValue, fmtTime: fmtTime, fmtDate: fmtDate, fmtShort: fmtShort,
  fmtDur: fmtDur, toast: toast, awake: awake, d2: d2
};

load();
document.querySelectorAll('#nav .navbtn, #subnav .subbtn').forEach(function (b) {
  b.onclick = function () { go(b.dataset.go); };
});
// si apre sul calendario; con un allenamento a metà, dritto lì
if (!location.hash) history.replaceState(null, '', S.active ? '#/workout' : '#/giorni');
window.addEventListener('hashchange', render);
Promise.all([bootPlan(), Health.load()]).then(function () {
  try { if (Health.adotta) Health.adotta(); } catch (e) {}   // Daylio dentro il deposito delle sostanze, una volta sola (sostanze.js)
  render();
  if (Health.evening) Health.evening();      // la notifica della sera (sostanze.js)
  // il primo disegno è fatto (passato + orologio dentro): le prove aspettano questo, non dei millisecondi
  Health.pronto = true;
});

/* Il guscio offline, e il modo di uscirne quando arriva codice nuovo.
 *
 * Il service worker vecchio serve dalla cache PRIMA di guardare la rete: alla
 * prima apertura dopo un aggiornamento vedresti ancora l'app vecchia, e solo
 * chiudendo e riaprendo arriverebbe quella nuova. In palestra nessuno lo fa, e
 * infatti il 25/09 l'utente ha aperto la scheda nuova e ha visto quella vecchia.
 *
 * Quindi: si chiede subito alla rete se c'è un sw.js diverso (`updateViaCache:
 * 'none'` impedisce che pure LUI venga letto dalla cache), e quando il nuovo
 * prende il comando si ricarica la pagina da soli. Una volta sola: `ricaricato`
 * evita il ciclo infinito se qualcosa va storto. Se non c'era nessun service
 * worker al comando (prima installazione in assoluto) NON si ricarica: lì il
 * cambio di controllo è normale e non c'è niente di vecchio da buttare. */
// Dentro l'APK (Capacitor) i file sono già nel telefono: il service worker non
// serve a niente e lì non si registra nemmeno. Si salta.
if ('serviceWorker' in navigator && !window.Capacitor) {
  window.addEventListener('load', function () {
    var cerano = !!navigator.serviceWorker.controller;
    var ricaricato = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!cerano || ricaricato) return;
      ricaricato = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(function (reg) { reg.update(); })
      .catch(function () {});
  });
}

})();
