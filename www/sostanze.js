/* ===========================================================================
 * sostanze.js — cosa ho preso quel giorno, a spunta.
 *
 * Decisioni di progetto:
 *  - (08/10) per giorno si spuntano quelle prese, NIENTE quantità, NIENTE ore.
 *    Segnare costa un tocco: senza dati di ogni giorno gli schemi di dopo non
 *    hanno senso.
 *  - (08/10, sera) Sostanze NON è una sezione: è il riquadro in basso a destra
 *    del giorno (giorni.js). Un tocco apre la FINESTRELLA di quel giorno: le
 *    sostanze a disposizione, si spuntano e si tolgono, poi «Conferma».
 *    «Conferma» senza spunte = «segnato: niente» (diverso da «non segnato»).
 *  - Le sostanze a disposizione si scelgono nelle Impostazioni da un catalogo
 *    grande (sostanze-catalogo.js), cercando; quello che manca si aggiunge.
 *  - Una sostanza tolta dalle disponibili RESTA nei giorni in cui era segnata
 *    (nel riquadro, e nella finestrella di quel giorno, ancora spuntata); dove
 *    non era segnata sparisce. Così togliere non riscrive mai il passato.
 *
 * Il deposito è suo, separato da quello della palestra: localStorage
 * 'health.v1' = { v: 1,
 *   subs:   { 'AAAA-MM-GG': ['caffeina', …] },   lista vuota = «niente»
 *   avail:  ['caffeina', …],                      a disposizione, in ordine
 *   custom: { 'x-…': 'Nome' },                    aggiunte a mano
 *   lvl:    { 'id': 'ok'|'mid'|'bad' },           colori cambiati da te
 *   sera:   'HH:MM',                              l'ora dell'avviso (dal 12/11)
 *   daylio: { fatto, giorni } }                   il segno: Daylio già adottato
 * Senza `avail` la lista parte vuota; senza `sera`
 * vale 21:30: chiavi in più, stesso v:1, nessun dato da riscrivere.
 *
 * IL PASSATO DI DAYLIO: arriva con la
 * storia (Health.storia.subs, dentro l'APK) e al primo avvio ENTRA NEL DEPOSITO
 * come se l'avessi segnato qui (`adotta`): si cambia, va in «Esporta tutto».
 * Una volta sola (segno `daylio`); un giorno già segnato a mano non si tocca
 * (vince il tuo). Da lì in poi l'app legge solo il deposito: la storia non
 * conta più per le sostanze.
 *
 * Sono i dati più delicati di tutto il sistema (alcune sostanze sono illegali
 * in Italia): escono dal telefono solo con «Esporta tutto» (esporta.js), in
 * un file che tieni tu. Nessun cloud.
 *
 * LA NOTIFICA DELLA SERA («cosa hai preso oggi?»): leggera = canale a bassa
 * importanza, niente suono, niente finestra sopra le altre app. Si
 * programmano le prossime 7 sere all'ora scelta in Impostazioni (di base 21:30,
 * `D.sera`); la sera di oggi si salta se oggi è già segnato. Si riprogramma a
 * ogni apertura, a ogni conferma e a ogni cambio d'ora. Solo
 * nell'APK (plugin LocalNotifications); nel browser non esiste e non serve.
 * ⚠ `isExactNotification: false` SEMPRE: di base il plugin vuole l'allarme
 * «esatto», e senza quel permesso apre le impostazioni «Sveglie e promemoria»
 * di Android e resta appeso (schedule non risponde mai — visto sull'emulatore
 * Android 15, 08/10). Il permesso è tolto anche dal manifest.
 * ========================================================================= */
(function () {
'use strict';
var H = window.Health, esc = H.esc;
var KEY = 'health.v1';
var START = [];                       // si parte senza: le sceglie chi usa l'app, dalle Impostazioni
var CAT = {}; H.CATALOGO.forEach(function (c) { CAT[c.id] = c; });

/* Buona, così così, cattiva: il colore del numero nel calendario. Il punto di partenza è il danno noto della sostanza,
 * non un giudizio: verde = integratori, caffeina, farmaci da banco o di cura;
 * giallo = alcol, nicotina, cannabis, psichedelici, sedativi; rosso = le droghe
 * col danno più alto (cocaina, anfetamine, MDMA, ketamina, oppioidi, GHB, gas).
 * Ognuno cambia il colore di ogni sostanza nelle Impostazioni (`D.lvl`);
 * quelle aggiunte a mano partono gialle. Il giorno prende il colore della
 * peggiore; tre gialle insieme fanno rosso. */
var LIVELLI = ['ok', 'mid', 'bad'], NOMI_LVL = { ok: 'green', mid: 'yellow', bad: 'red' };
var GIALLE = 'alcol nicotina thc psilocibina modafinil sonnifero benzodiazepine lsd dmt mescalina kratom poppers'.split(' ');
var ROSSE = 'mdma ketamina cocaina anfetamine oppioidi ghb protossido'.split(' ');
function lvlOf(id) {
  if (D.lvl[id]) return D.lvl[id];
  if (ROSSE.indexOf(id) !== -1) return 'bad';
  if (GIALLE.indexOf(id) !== -1 || !CAT[id]) return 'mid';
  return 'ok';
}
function dayLevel(ids) {
  var n = { ok: 0, mid: 0, bad: 0 };
  ids.forEach(function (id) { n[lvlOf(id)]++; });
  return n.bad || n.mid >= 3 ? 'bad' : n.mid ? 'mid' : 'ok';
}
// la spunta disegnata, non un carattere (niente simboli che il telefono può trasformare in emoji)
var TICK = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var SERA = { h: 21, m: 30 };          // l'avviso di base

var D = load();
function load() {
  var o = null;
  try { o = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!o || o.v !== 1 || !o.subs) o = { v: 1, subs: {} };
  if (!Array.isArray(o.avail)) o.avail = START.slice();
  if (!o.custom || typeof o.custom !== 'object') o.custom = {};
  if (!o.lvl || typeof o.lvl !== 'object') o.lvl = {};
  return o;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(D)); }
  catch (e) { /* memoria piena: la palestra lo dice già col suo avviso */ }
}
function labelOf(id) { return (CAT[id] && CAT[id].label) || D.custom[id] || id; }
function today() { return H.ymd(new Date()); }

/** Cosa c'è segnato quel giorno: { ids } oppure null. Solo il deposito: Daylio ci è già dentro (adotta). */
function dayOf(k) {
  return Object.prototype.hasOwnProperty.call(D.subs, k) ? { ids: D.subs[k] } : null;
}
/**
 * Daylio diventa dati dell'app. La chiama app.js dopo Health.load, prima del primo disegno.
 * Solo se la storia è arrivata davvero (`caricata`): senza, nessun segno, e ci si riprova al prossimo avvio.
 * Mai un giorno perso: si AGGIUNGONO i giorni che il deposito non ha; uno segnato a mano (anche «niente») resta suo.
 * Torna quanti giorni sono entrati.
 */
function adotta() {
  var s = H.storia;
  if (D.daylio || !s || !s.caricata) return 0;
  var n = 0, subs = s.subs || {};
  Object.keys(subs).forEach(function (k) {
    var ids = subs[k];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !Array.isArray(ids) || !ids.length) return;
    if (Object.prototype.hasOwnProperty.call(D.subs, k)) return;     // segnato a mano: vince lui
    D.subs[k] = ids.filter(function (id) { return typeof id === 'string'; });
    n++;
  });
  D.daylio = { fatto: new Date().toISOString(), giorni: n };
  save();               // non si scrive (memoria piena)? il segno resta solo in memoria: si rifà al prossimo avvio, senza doppioni
  return n;
}
H.adotta = adotta;
function lastBefore(id, k) {
  var best = null;
  Object.keys(D.subs).forEach(function (x) {
    if (x >= k) return;
    var d = dayOf(x);
    if (d && d.ids.indexOf(id) !== -1 && (!best || x > best)) best = x;
  });
  return best;
}
function short(k) {
  var d = new Date(k + 'T12:00:00');
  return d.getDate() + ' ' + H.MESI[d.getMonth()].slice(0, 3) + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
}

/* --- nel calendario: il puntino e il riquadro ----------------------------- */
H.area({
  id: 'sostanze', label: 'Substances', color: 'var(--sub)', sign: '+',
  days: function () {
    var out = {};
    Object.keys(D.subs).forEach(function (k) {
      var d = dayOf(k);
      if (d) out[k] = [{ title: 'Sostanze', value: String(d.ids.length) }];
    });
    return out;
  },
  tile: function (k) {
    var d = dayOf(k);
    if (!d) return { value: '—', sub: k <= today() ? 'to log' : '', empty: true };
    if (!d.ids.length) return { value: '0', sub: 'nothing' };
    return { value: String(d.ids.length), tone: 'u-' + dayLevel(d.ids), sub: d.ids.map(labelOf).join(' · ') };
  },
  cell: function (k) {
    var d = dayOf(k);
    if (!d) return null;
    if (!d.ids.length) return { cls: 'u zero', html: '0' };
    return { cls: 'u ' + dayLevel(d.ids), html: String(d.ids.length) };
  },
  open: function (k, its, go, redraw) { if (k <= today()) day(k, redraw, go); }
});

/* --- la finestrella di un giorno ------------------------------------------- */
function day(k, redraw, go) {
  var cur = dayOf(k), sel = cur ? cur.ids.slice() : [];
  // a disposizione + quelle segnate quel giorno che non lo sono più (regola 4)
  var list = D.avail.slice();
  sel.forEach(function (id) { if (list.indexOf(id) === -1) list.push(id); });
  var dd = new Date(k + 'T12:00:00');
  var name = (k === today() ? 'Today, ' : '') + H.GIORNI[dd.getDay()] + ' ' + dd.getDate() + ' ' + H.MESI[dd.getMonth()] +
    (dd.getFullYear() !== new Date().getFullYear() ? ' ' + dd.getFullYear() : '');
  function draw(box) {
    var html = '<div class="kick">Substances · one tap to tick</div><h2 class="pop-t">' + esc(name) + '</h2>' +
      (list.length ? '<div class="subs">' : '<p class="sub">No substances available: pick them in Settings.</p>');
    list.forEach(function (id) {
      var on = sel.indexOf(id) !== -1, last = lastBefore(id, k), gone = D.avail.indexOf(id) === -1;
      html += '<button class="sbt' + (on ? ' on' : '') + '" data-id="' + esc(id) + '" aria-pressed="' + on + '">' +
        '<span class="c">' + (on ? TICK : '') + '</span><b>' + esc(labelOf(id)) + '</b>' +
        '<small>' + (gone ? 'no longer available' : last ? 'last: ' + short(last) : '—') + '</small></button>';
    });
    if (list.length) html += '</div>';
    html += '<div class="row pop-act"><button class="btn ghost" data-cancel>Cancel</button>' +
      '<button class="btn primary" data-ok>Confirm' + (sel.length ? '' : ': nothing') + '</button></div>' +
      '<button class="lnk pop-set" data-set>Choose the available ones</button>';
    box.innerHTML = '<div class="grip"></div>' + html;
    box.querySelectorAll('[data-id]').forEach(function (b) {
      b.onclick = function () {
        var i = sel.indexOf(b.dataset.id);
        if (i === -1) sel.push(b.dataset.id); else sel.splice(i, 1);
        draw(box);
      };
    });
    box.querySelector('[data-cancel]').onclick = H.popClose;
    box.querySelector('[data-ok]').onclick = function () {
      D.subs[k] = list.filter(function (id) { return sel.indexOf(id) !== -1; });
      save(); evening(); H.popClose();
      if (redraw) redraw();
    };
    box.querySelector('[data-set]').onclick = function () { H.popClose(); go('#/impostazioni'); };
  }
  H.pop('', draw);
}

/* --- #/sostanze[/AAAA-MM-GG]: la strada della notifica --------------------
 * Non è più una pagina: apre il calendario su quel giorno con la sua
 * finestrella già aperta. */
H.page('sostanze', function (app, go, parts) {
  var k = /^\d{4}-\d{2}-\d{2}$/.test(parts[1] || '') && parts[1] <= today() ? parts[1] : today();
  history.replaceState(null, '', '#/giorni');
  H.pick(k);
  var redraw = function () { H.view(app, go); };
  redraw();
  day(k, redraw, go);
}, 'giorni');

/* --- Impostazioni › Sostanze a disposizione -------------------------------- */
/** Una parola del nome o degli alias COMINCIA con quello che hai scritto («alc» → Alcol, non vitamina D per «colecALCiferolo»). */
function starts(text, q) { return norm(text).split(/[^a-z0-9]+/).some(function (w) { return w && w.indexOf(q) === 0; }) || norm(text).indexOf(q) === 0; }
function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
var query = '';
H.settings = H.settings || [];
H.settings.push(function (box, go) {
  function draw() {
    var html = '<h2>Available substances</h2><p class="sub">These are the ones you see in the day\'s window. ' +
      'Removing one keeps it on the days you logged it. The dot is its colour in the calendar ' +
      '(green, yellow, red): tap it to change it. The day takes the colour of the worst one; three yellows make red.</p><div class="card avail">';
    if (!D.avail.length) html += '<p class="sub">None.</p>';
    D.avail.forEach(function (id) {
      html += '<div class="arow"><button class="lvl" data-lvl="' + esc(id) + '" aria-label="colour: ' + NOMI_LVL[lvlOf(id)] + '">' +
        '<i class="lv-' + lvlOf(id) + '"></i></button><b>' + esc(labelOf(id)) + '</b><button class="lnk" data-rm="' + esc(id) + '">Remove</button></div>';
    });
    html += '</div><button class="btn ghost plus" data-plus>+ Add a substance</button>';
    box.innerHTML = html;
    box.querySelectorAll('[data-rm]').forEach(function (b) {
      b.onclick = function () { D.avail = D.avail.filter(function (x) { return x !== b.dataset.rm; }); save(); draw(); };
    });
    box.querySelector('[data-plus]').onclick = add;
    box.querySelectorAll('[data-lvl]').forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.lvl;
        D.lvl[id] = LIVELLI[(LIVELLI.indexOf(lvlOf(id)) + 1) % 3]; save(); draw();
      };
    });
  }
  /** Il «+»: il catalogo in una finestrella, si cerca e si aggiunge; resta aperta per aggiungerne altre. */
  function add() {
    query = '';
    H.pop('<div class="kick">Add</div><input type="search" class="find" placeholder="Search: alcohol, vitamin, …" aria-label="search a substance">' +
      '<div class="cat-res"></div>', function (pb) {
      var inp = pb.querySelector('.find');
      inp.oninput = function () { query = inp.value; results(pb); };
      results(pb);
    });
  }
  function results(pb) {
    var q = norm(query.trim()), out = '', last = '', exact = false, found = false;
    var all = H.CATALOGO.concat(Object.keys(D.custom).map(function (id) { return { id: id, label: D.custom[id], cat: 'Added by you', alias: '' }; }));
    all.forEach(function (c) {
      if (q && !starts(c.label + ' ' + c.alias, q)) return;
      found = true;
      if (norm(c.label) === q) exact = true;
      if (D.avail.indexOf(c.id) !== -1) return;
      if (c.cat !== last) { out += (last ? '</div>' : '') + '<div class="kick catk">' + esc(c.cat) + '</div><div class="card avail">'; last = c.cat; }
      out += '<div class="arow"><b>' + esc(c.label) + '</b><button class="lnk add" data-add="' + esc(c.id) + '">Add</button></div>';
    });
    if (last) out += '</div>';
    // si aggiunge a mano solo quello che il catalogo non conosce
    if (q && !exact && !found) out += '<p class="sub">Not in the catalogue.</p><button class="btn ghost" data-new>Add "' + esc(query.trim()) + '"</button>';
    if (!out) out = '<p class="sub">All of them are already available.</p>';
    var res = pb.querySelector('.cat-res');
    res.innerHTML = out;
    res.querySelectorAll('[data-add]').forEach(function (b) {
      b.onclick = function () { D.avail.push(b.dataset.add); save(); draw(); results(pb); };
    });
    var nw = res.querySelector('[data-new]');
    if (nw) nw.onclick = function () {
      var label = query.trim().slice(0, 40), id = 'x-' + norm(label).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (id === 'x-') return;
      D.custom[id] = label;
      if (D.avail.indexOf(id) === -1) D.avail.push(id);
      query = ''; save(); draw(); H.popClose();
    };
  }
  draw();
});

/* --- la notifica della sera ---------------------------------------------- */
function plugin() {
  var C = window.Capacitor;
  if (!C) return null;
  return (C.Plugins && C.Plugins.LocalNotifications) || null;
}
var ready = null;
function prepare(LN) {
  if (ready) return ready;
  ready = LN.createChannel({ id: 'sera', name: 'Evening', description: 'What did you take today?',
                             importance: 2, visibility: 0, vibration: false })
    .catch(function () {})
    .then(function () { return LN.checkPermissions(); })
    .then(function (p) { return p.display === 'granted' ? p : LN.requestPermissions(); })
    .then(function (p) { return p.display === 'granted'; })
    .catch(function () { return false; });
  return ready;
}
/** L'ora dell'avviso: { h, m } da `D.sera` ('HH:MM'); illeggibile o assente = 21:30. */
function seraOf() {
  var m = /^(\d{1,2}):(\d{2})$/.exec(typeof D.sera === 'string' ? D.sera : '');
  if (!m || +m[1] > 23 || +m[2] > 59) return { h: SERA.h, m: SERA.m };
  return { h: +m[1], m: +m[2] };
}
function hhmm(t) { return H.d2(t.h) + ':' + H.d2(t.m); }
/* Le riprogrammazioni in fila: tre tocchi veloci su «+» non devono incrociarsi
 * (cancella A, cancella B, programma B, programma A = l'ora vecchia). L'ultima vince. */
var giro = Promise.resolve();
function evening() {
  var LN = plugin();
  if (!LN) return giro;
  // un plugin che non risponde non deve fermare la fila per sempre: 10 s e si passa alla prossima
  giro = giro.then(function () {
    return Promise.race([programma(LN), new Promise(function (res) { setTimeout(res, 10000); })]);
  }).catch(function () {});
  return giro;
}
function programma(LN) {
  return prepare(LN).then(function (ok) {
    if (!ok) return;
    var ids = [], list = [], now = new Date(), t = seraOf();
    for (var i = 0; i < 8; i++) ids.push({ id: 151000 + i });
    return LN.cancel({ notifications: ids }).catch(function () {}).then(function () {
      for (var j = 0; j < 8; j++) {
        var at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + j, t.h, t.m, 0);
        if (at <= now) continue;
        if (j === 0 && dayOf(H.ymd(now))) continue;      // oggi già segnato: stasera niente
        list.push({ id: 151000 + j, channelId: 'sera', title: '151 Health', body: 'What did you take today?',
                    schedule: { at: at, allowWhileIdle: true }, isExactNotification: false, extra: { go: '#/sostanze/' + H.ymd(at) } });
        if (list.length >= 7) break;
      }
      return list.length ? LN.schedule({ notifications: list }) : null;
    });
  });
}
H.evening = evening;

/* --- Impostazioni › Evening reminder --------------------
 * L'ora si cambia coi tasti «−/+» (come i chili in palestra): niente da
 * scrivere, niente finestre. Ore di 1 in 1, minuti di 15 in 15, in giro sulle
 * 24 ore. Ogni tocco salva e riprogramma le sere. */
H.settings.push(function (box) {
  function draw() {
    var t = seraOf();
    box.className = 'sera';
    box.innerHTML = '<h2>Evening reminder</h2><p class="sub">Every evening the phone asks what you took today ' +
      '(not if today is already logged).</p><div class="card avail"><div class="arow"><b>Time</b>' +
      '<span class="sera-t" data-sera-t>' + hhmm(t) + '</span></div>' +
      '<div class="sera-k">' +
      '<div><div class="stp"><button data-sera="h" data-d="-1" aria-label="one hour earlier">−</button><b class="val">' + H.d2(t.h) + '</b>' +
      '<button data-sera="h" data-d="1" aria-label="one hour later">+</button></div><small>hour</small></div>' +
      '<div><div class="stp"><button data-sera="m" data-d="-1" aria-label="15 minutes earlier">−</button><b class="val">' + H.d2(t.m) + '</b>' +
      '<button data-sera="m" data-d="1" aria-label="15 minutes later">+</button></div><small>minutes</small></div>' +
      '</div></div>';
    box.querySelectorAll('[data-sera]').forEach(function (b) {
      b.onclick = function () {
        var c = seraOf(), tot = c.h * 60 + c.m, d = +b.dataset.d;
        if (b.dataset.sera === 'h') tot += 60 * d;
        else tot = (Math.floor(tot / 15) + d) * 15 + (d < 0 && tot % 15 ? 15 : 0);   // si aggancia al quarto d'ora
        tot = ((tot % 1440) + 1440) % 1440;
        D.sera = hhmm({ h: Math.floor(tot / 60), m: tot % 60 });
        save(); draw(); evening();
      };
    });
  }
  draw();
});
(function wire() {
  var LN = plugin();
  if (!LN) return;
  LN.addListener('localNotificationActionPerformed', function (a) {
    var g = a && a.notification && a.notification.extra && a.notification.extra.go;
    location.hash = g || '#/sostanze';
  });
})();

})();
