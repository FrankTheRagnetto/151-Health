/* ===========================================================================
 * orologio.js — «Estrai dati orologio» nelle Impostazioni.
 *
 * Zepp sul telefono si apre solo quando lo sceglie l'utente (sincronizza l'orologio
 * col cloud e basta). Poi qui un bottone tira giù TUTTO quello che il cloud Zepp
 * tiene e lo conserva dentro Health, così com'è arrivato, per farci quello che
 * si vuole dopo (leggerlo nel calendario è la sessione 3).
 *
 * La pagina NON ha rete: chiede al pezzetto Android (Capacitor.Plugins.Zepp,
 * android/.../zepp/ZeppPlugin.java), che parla solo con Zepp e protegge
 * l'account (un login all'ora, fermo sui 429…). Qui si decide solo COSA chiedere
 * e DOVE metterlo.
 *
 * Il deposito: IndexedDB «health-orologio» (i dati sono ~10 MB: troppi per
 * localStorage).
 *   giorni  chiave AAAA-MM-GG → { r: [voci del riepilogo], m: [voci dei minuti] }
 *           le voci sono quelle di band_data così come le manda Zepp: summary
 *           (base64 di JSON: sonno con le fasi, passi…), data (3 byte al minuto),
 *           data_hr (1 byte al minuto = battito).
 *   cose    'allenamenti' → la lista intera, ogni voce con TUTTI i suoi campi
 *           'profilo'     → il profilo così com'è
 *           'meta'        → { inizio, finoA, ultima, … } — finoA è l'ultimo
 *                           giorno già al sicuro: un'estrazione interrotta
 *                           riparte da lì, non da capo.
 *
 *           'compatto'    → sonno e allenamenti già tradotti nel formato del
 *                           passato (tools/import-passato.py): lo legge ogni
 *                           apertura dell'app, 12 MB di grezzo no.
 *
 * Ogni giro riscarica gli ultimi RIPASSO giorni: l'orologio a volte consegna
 * al cloud un giorno passato più tardi.
 *
 * L'UNIONE COL PASSATO (sessione 3, 16/10): all'avvio Health.load() chiama
 * unisci(Health.storia): per ogni notte vince il dato scaricato (se ha davvero
 * dormito), gli allenamenti si uniscono per ora d'inizio, senza doppioni. Il
 * calendario, Sonno, Sport e il PDF leggono Health.storia e non sanno da dove
 * arriva. «Esporta tutto» porta con sé il grezzo (tutto() / rimetti()).
 * ========================================================================= */
(function () {
'use strict';
var H = window.Health;

var DB = 'health-orologio', FINESTRA = 90, RIPASSO = 3, PAGINE_MAX = 60;
var dbp = null;

function apri() {
  if (dbp) return dbp;
  dbp = new Promise(function (res, rej) {
    var r = indexedDB.open(DB, 1);
    r.onupgradeneeded = function () {
      r.result.createObjectStore('giorni');
      r.result.createObjectStore('cose');
    };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { dbp = null; rej(r.error); };
  });
  return dbp;
}
/** Una transazione intera: fatto() quando è DAVVERO scritta (oncomplete), non prima. */
function scrivi(store, fn) {
  return apri().then(function (db) {
    return new Promise(function (res, rej) {
      var t = db.transaction(store, 'readwrite');
      fn(t.objectStore(store));
      t.oncomplete = function () { res(); };
      t.onerror = function () { rej(t.error); };
      t.onabort = function () { rej(t.error || new Error('write cancelled')); };
    });
  });
}
function leggi(store, chiave) {
  return apri().then(function (db) {
    return new Promise(function (res, rej) {
      var q = db.transaction(store, 'readonly').objectStore(store).get(chiave);
      q.onsuccess = function () { res(q.result); };
      q.onerror = function () { rej(q.error); };
    });
  });
}
function chiavi(store) {
  return apri().then(function (db) {
    return new Promise(function (res, rej) {
      var os = db.transaction(store, 'readonly').objectStore(store);
      var q = os.getAllKeys ? os.getAllKeys() : null;
      if (q) {
        q.onsuccess = function () { res(q.result); };
        q.onerror = function () { rej(q.error); };
        return;
      }
      var out = [], c = os.openKeyCursor ? os.openKeyCursor() : os.openCursor();
      c.onsuccess = function () { var k = c.result; if (k) { out.push(k.key); k['continue'](); } else res(out); };
      c.onerror = function () { rej(c.error); };
    });
  });
}

/* --- dal grezzo di Zepp al formato del passato ---------------------------
 * Le stesse regole di tools/import-passato.py (e di ZEPP.md §4): una notte vale
 * se profondo+leggero+REM > 0; «Guida» (132) non è sport; sotto il minuto è
 * l'orologio acceso per sbaglio; i numeri arrotondati come round() di Python
 * (al pari), così il passato e lo scaricato dicono gli stessi numeri. */
var NON_SPORT = { 132: 1 };
function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
function intero(x) { return Math.trunc ? Math.trunc(num(x)) : (num(x) < 0 ? Math.ceil(num(x)) : Math.floor(num(x))); }
function rnd(x) {
  var v = num(x), f = Math.floor(v), d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
function b64json(t) {
  if (!t || typeof t !== 'string') return null;
  try {
    while (t.length % 4) t += '=';
    var bin = atob(t), u = '';
    for (var i = 0; i < bin.length; i++) u += '%' + ('0' + bin.charCodeAt(i).toString(16)).slice(-2);
    return JSON.parse(decodeURIComponent(u));
  } catch (e) { return null; }
}
/** Una notte: [inizio_s, fine_s, profondo, leggero, rem, sveglio, punteggio, battito, [m0, m1, fase, …]]. */
function notte(voci) {
  var row = null;
  (voci || []).forEach(function (v) {
    var x = b64json(v.summary), s = x && x.slp;
    if (!s) return;
    if (num(s.dp) + num(s.lt) + num(s.dt) <= 0) return;
    var st = [];
    (s.stage || []).forEach(function (f) { st.push(intero(f.start), intero(f.stop), intero(f.mode)); });
    row = [intero(s.st), intero(s.ed), intero(s.dp), intero(s.lt), intero(s.dt), intero(s.wk),
           intero(s.ss), intero(s.rhr), st];
  });
  return row;
}
/** Un allenamento: [inizio_s, fine_s, tipo, nome, metri, kcal, battito medio, battito max]; null se non è sport. */
function seduta(w) {
  var t = intero(w.type), a = intero(w.trackid), b = intero(w.end_time);
  if (NON_SPORT[t] || !a || b - a < 60) return null;
  var nomi = window.SPORT_TIPI || {};
  return [a, b, t, nomi[String(t)] || 'Sport ' + t, rnd(w.dis), rnd(w.calorie), rnd(w.avg_heart_rate), intero(w.max_heart_rate)];
}

function tutti(store) {
  return apri().then(function (db) {
    return new Promise(function (res, rej) {
      var os = db.transaction(store, 'readonly').objectStore(store), out = {};
      var c = os.openCursor();
      c.onsuccess = function () { var k = c.result; if (k) { out[k.key] = k.value; k['continue'](); } else res(out); };
      c.onerror = function () { rej(c.error); };
    });
  });
}

/** Dal grezzo al compatto, e lo mette da parte ('compatto'). */
function compatta() {
  return Promise.all([tutti('giorni'), leggi('cose', 'allenamenti')]).then(function (x) {
    var sleep = {}, sport = [];
    Object.keys(x[0]).forEach(function (k) { var r = notte(x[0][k].r); if (r) sleep[k] = r; });
    (x[1] || []).forEach(function (w) { var r = seduta(w); if (r) sport.push(r); });
    sport.sort(function (p, q) { return p[0] - q[0]; });
    var c = { v: 2, sleep: sleep, sport: sport, fatto: new Date().toISOString() };
    return scrivi('cose', function (s) { s.put(c, 'compatto'); }).then(function () { return c; });
  });
}

/**
 * Lo scaricato dentro il passato, sul posto (chi tiene Health.storia vede subito):
 * la notte scaricata vince, gli allenamenti si uniscono per inizio.
 */
function unisci(storia) {
  if (!window.indexedDB) return Promise.resolve(null);
  return leggi('cose', 'compatto').then(function (c) {
    if (c && c.v === 2) return c;     // v2 (20/10): i nomi degli sport in inglese
    return chiavi('giorni').then(function (k) { return k.length ? compatta() : null; });
  }).then(function (c) {
    if (!c) return null;
    var notti = 0, sedute = 0;
    Object.keys(c.sleep).forEach(function (k) { storia.sleep[k] = c.sleep[k]; notti++; });
    var per = {};
    storia.sport.forEach(function (w) { per[w[0]] = w; });
    c.sport.forEach(function (w) { if (!per[w[0]]) sedute++; per[w[0]] = w; });
    var lista = Object.keys(per).map(function (a) { return per[a]; }).sort(function (p, q) { return p[0] - q[0]; });
    storia.sport.length = 0;
    lista.forEach(function (w) { storia.sport.push(w); });
    return { notti: notti, sport: c.sport.length, nuovi: sedute };
  });
}

/** Il grezzo intero, per «Esporta tutto» (il compatto no: si rifà). */
function tutto() {
  return Promise.all([tutti('giorni'), tutti('cose')]).then(function (x) {
    var cose = {};
    ['allenamenti', 'profilo', 'meta'].forEach(function (k) { if (x[1][k] !== undefined) cose[k] = x[1][k]; });
    return { v: 1, giorni: x[0], cose: cose };
  });
}

/** Rimette un grezzo esportato al posto di quello che c'è, in UNA transazione, poi rifà il compatto. */
function rimetti(o) {
  if (!o || o.v !== 1 || typeof o.giorni !== 'object' || typeof o.cose !== 'object') return Promise.reject(errore('Invalid watch data.'));
  return apri().then(function (db) {
    return new Promise(function (res, rej) {
      var t = db.transaction(['giorni', 'cose'], 'readwrite'), g = t.objectStore('giorni'), c = t.objectStore('cose');
      g.clear(); c.clear();
      Object.keys(o.giorni).forEach(function (k) { if (/^\d{4}-\d\d-\d\d$/.test(k)) g.put(o.giorni[k], k); });
      ['allenamenti', 'profilo', 'meta'].forEach(function (k) { if (o.cose[k] !== undefined) c.put(o.cose[k], k); });
      t.oncomplete = function () { res(); };
      t.onerror = function () { rej(t.error); };
      t.onabort = function () { rej(t.error || new Error('write cancelled')); };
    });
  }).then(compatta);
}

/* --- date ---------------------------------------------------------------- */
function ymd(d) { return d.getFullYear() + '-' + H.d2(d.getMonth() + 1) + '-' + H.d2(d.getDate()); }
function piu(iso, n) {
  var d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/* --- il ponte ------------------------------------------------------------ */
function zepp() {
  var C = window.Capacitor;
  return (C && C.Plugins && C.Plugins.Zepp) || null;
}
/** Il testo di Zepp → JSON; risposta non capita = errore con parole semplici. */
function json(corpo) {
  try { return JSON.parse(corpo); } catch (e) { throw errore('Zepp answered something I do not understand.'); }
}
function errore(msg, code) { var e = new Error(msg); e.code = code || 'RISPOSTA'; return e; }
function scarica(cosa, da, a, primaDi) {
  var o = { cosa: cosa };
  if (da) { o.da = da; o.a = a; }
  if (primaDi) o.primaDi = String(primaDi);
  return zepp().scarica(o).then(function (r) { return json(r.corpo); });
}
function dati(risposta) {
  if (!risposta || (risposta.code !== undefined && risposta.code !== 1)) throw errore('Zepp said no (code ' + (risposta && risposta.code) + ').');
  return risposta.data;
}

/* --- il battito minuto per minuto --- */
/**
 * I battiti fra due istanti (ms), dal grezzo: `data_hr` di ogni giorno è 1 byte
 * al minuto, il minuto 0 è la mezzanotte di quel giorno nell'ora del telefono
 * (ZEPP.md §2.4); 0, 254 e 255 = nessuna misura. Si risolve con
 * { punti: [[ms, bpm], …], giorni: quanti giorni del tratto hanno i minuti,
 *   mancano: quanti no }. Mai un punto inventato: un minuto senza misura NON
 * c'è, e chi disegna lo fa vedere. Più voci nello stesso giorno: vince la
 * prima che ha una misura per quel minuto.
 */
function battito(da, a) {
  var chiaviG = [], d = new Date(da);
  d.setHours(0, 0, 0, 0);
  for (; d.getTime() <= a && chiaviG.length < 3; d.setDate(d.getDate() + 1)) chiaviG.push(ymd(d));
  return Promise.all(chiaviG.map(function (k) {
    return leggi('giorni', k).then(null, function () { return null; });
  })).then(function (vals) {
    var punti = [], giorni = 0;
    vals.forEach(function (g, j) {
      var byte = minutiHr(g && g.m);
      if (!byte) return;
      giorni++;
      var p = chiaviG[j].split('-');
      for (var i = 0; i < byte.length; i++) {
        var v = byte[i];
        if (!v || v >= 254) continue;
        var t = new Date(+p[0], +p[1] - 1, +p[2], 0, i).getTime();
        if (t >= da && t <= a) punti.push([t, v]);
      }
    });
    return { punti: punti, giorni: giorni, mancano: chiaviG.length - giorni };
  });
}
/** I 1440 battiti di un giorno da tutte le sue voci dei minuti, o null se non ce n'è. */
function minutiHr(voci) {
  var out = null;
  (voci || []).forEach(function (v) {
    if (!v || typeof v.data_hr !== 'string' || !v.data_hr) return;
    var b;
    try { b = atob(v.data_hr); } catch (e) { return; }
    if (!out) { out = []; for (var z = 0; z < 1440; z++) out.push(0); }
    for (var i = 0; i < b.length && i < 1440; i++) {
      var x = b.charCodeAt(i);
      if ((!out[i] || out[i] >= 254) && x && x < 254) out[i] = x;
    }
  });
  return out;
}

/* --- l'estrazione -------------------------------------------------------- */
var corre = false;

/**
 * Tutto il cloud dentro Health. passo(testo, fatto, totale) racconta dove siamo.
 * Si risolve con il riepilogo di cosa c'è adesso sul telefono.
 */
function estrai(passo) {
  if (corre) return Promise.reject(errore('Already downloading.', 'GIA'));
  corre = true;
  var meta, oggi = ymd(new Date());
  passo('The profile…', 0, 1);
  return leggi('cose', 'meta').then(function (m) {
    meta = m || {};
    return scarica('profilo');
  }).then(function (profilo) {
    if (!profilo || typeof profilo !== 'object') throw errore('The Zepp profile is empty.');
    return scrivi('cose', function (s) { s.put(profilo, 'profilo'); }).then(function () {
      // da dove partire: l'ultimo giorno al sicuro (meno il ripasso), o la nascita dell'account
      if (!meta.inizio) {
        var nato = Number(profilo.createTime);
        meta.inizio = nato > 1e9 ? ymd(new Date(nato * 1000)) : '2015-01-01';
      }
      var da = meta.finoA ? piu(meta.finoA, -RIPASSO + 1) : meta.inizio;
      if (da < meta.inizio) da = meta.inizio;
      var finestre = [];
      while (da <= oggi) {
        var a = piu(da, FINESTRA - 1);
        if (a > oggi) a = oggi;
        finestre.push([da, a]);
        da = piu(a, 1);
      }
      return finestre;
    });
  }).then(function (finestre) {
    var tot = finestre.length + 1, i = 0;
    function prossima() {
      if (i >= finestre.length) return null;
      var f = finestre[i];
      passo('Days from ' + f[0] + ' to ' + f[1], i + 1, tot);
      var riep;
      return scarica('riepilogo', f[0], f[1]).then(function (r) {
        riep = dati(r) || [];
        return scarica('minuti', f[0], f[1]);
      }).then(function (r) {
        var min = dati(r) || [], per = {};
        riep.forEach(function (v) { var k = v.date_time; if (k) (per[k] = per[k] || { r: [], m: [] }).r.push(v); });
        min.forEach(function (v) { var k = v.date_time; if (k) (per[k] = per[k] || { r: [], m: [] }).m.push(v); });
        return scrivi('giorni', function (s) {
          Object.keys(per).forEach(function (k) { if (/^\d{4}-\d\d-\d\d$/.test(k)) s.put(per[k], k); });
        });
      }).then(function () {
        // al sicuro fino a qui: un'interruzione da adesso riparte dalla finestra dopo
        meta.finoA = f[1];
        return scrivi('cose', function (s) { s.put(meta, 'meta'); });
      }).then(function () { i++; return prossima(); });
    }
    return Promise.resolve(prossima()).then(function () {
      passo('The workouts…', tot, tot);
      return allenamenti();
    });
  }).then(function (lista) {
    meta.ultima = new Date().toISOString();
    meta.allenamenti = lista.length;
    return scrivi('cose', function (s) { s.put(lista, 'allenamenti'); s.put(meta, 'meta'); });
  }).then(compatta).then(function () {
    return unisci(H.storia);      // il calendario vede subito i giorni nuovi, senza riaprire l'app
  }).then(riepilogo).then(function (r) { corre = false; return r; },
                          function (e) { corre = false; throw e; });
}

/** La lista intera, sfogliando all'indietro se Zepp la dà a pezzi (next ≠ -1). */
function allenamenti() {
  var tutti = [], visti = {}, pagine = 0;
  function pagina(primaDi) {
    return scarica('allenamenti', null, null, primaDi).then(function (r) {
      var d = dati(r) || {}, l = d.summary || [], nuovi = 0;
      l.forEach(function (w) { if (!visti[w.trackid]) { visti[w.trackid] = 1; tutti.push(w); nuovi++; } });
      pagine++;
      var nx = d.next;
      // fine: Zepp dice -1, o una pagina che non porta niente di nuovo (mai un giro infinito)
      if (nx === undefined || nx === null || !/^\d+$/.test(String(nx)) || !nuovi || pagine >= PAGINE_MAX) return tutti;
      return pagina(nx);
    });
  }
  return pagina(null);
}

/** Cosa c'è adesso sul telefono. */
function riepilogo() {
  return Promise.all([chiavi('giorni'), leggi('cose', 'meta'), leggi('cose', 'profilo')]).then(function (x) {
    var g = x[0].slice().sort(), m = x[1] || {};
    return { giorni: g.length, primo: g[0], ultimo: g[g.length - 1], allenamenti: m.allenamenti || 0,
             profilo: !!x[2], ultima: m.ultima || null };
  });
}

/* --- la sezione nelle Impostazioni -------------------------------------- */
function quando(iso) {
  var d = new Date(iso), oggi = ymd(new Date()), g = ymd(d);
  var ora = H.d2(d.getHours()) + ':' + H.d2(d.getMinutes());
  if (g === oggi) return 'today at ' + ora;
  if (g === piu(oggi, -1)) return 'yesterday at ' + ora;
  return d.getDate() + ' ' + H.MESI[d.getMonth()] + ' ' + d.getFullYear() + ' at ' + ora;
}
function giorno(iso) {
  var d = new Date(iso + 'T12:00:00');
  return d.getDate() + ' ' + H.MESI[d.getMonth()] + ' ' + d.getFullYear();
}
function sulTelefono(r) {
  if (!r.giorni && !r.allenamenti) {
    // prova sul telefono 03/11: con la storia caricata da un file il Sonno mostrava 750 notti e qui si leggeva «niente dall'orologio»
    var n = Object.keys((H.storia && H.storia.sleep) || {}).sort();
    if (n.length) return 'On this phone: ' + n.length + ' nights from the watch (from ' + giorno(n[0]) + ' to ' + giorno(n[n.length - 1]) +
      '), loaded from a file. Log in to Zepp to bring it up to date.';
    return 'There is nothing from the watch on this phone yet.';
  }
  return 'On this phone: ' + r.giorni + ' days' + (r.giorni ? ' (from ' + giorno(r.primo) + ' to ' + giorno(r.ultimo) + ')' : '') +
    ', ' + r.allenamenti + ' workouts' + (r.profilo ? ', the profile' : '') + '.' +
    (r.ultima ? ' Last extraction ' + quando(r.ultima) + '.' : ' The extraction is not finished yet: the button picks up where it stopped.');
}
function capisci(e) {
  var m = (e && e.message) || 'Something went wrong.';
  if (e && e.code === 'RETE') return 'No internet, or Zepp is not answering. Try again when you are online.';
  return m;
}

var sveglio = function (on) { if (window.SchedaNative && SchedaNative.keepAwake) SchedaNative.keepAwake(on); };

H.settings = H.settings || [];
H.settings.push(function (box) {
  box.className = 'orologio';
  var Z = zepp();
  if (!Z) {
    box.innerHTML = '<h2>Watch</h2><p class="sub">"Extract watch data" only works in the app on the phone.</p>';
    return;
  }
  var esc = H.esc;

  function disegna(msg, cattivo) {
    return Z.stato().then(function (st) {
      return riepilogo().then(function (r) { return [st, r]; }, function () { return [st, null]; });
    }).then(function (x) {
      var st = x[0], r = x[1], h = '<h2>Watch</h2>';
      if (!st.accesso || st.rifiutato) {
        h += '<p class="sub">First open Zepp and let it sync the watch. Then Health downloads from the Zepp cloud ' +
          'everything there is (sleep, minute-by-minute heart rate, steps, workouts, profile) and keeps it on the phone.</p>' +
          (st.rifiutato ? '<p class="oro-msg bad">Zepp did not accept the email and password: type them again.</p>' : '') +
          '<input type="email" class="find" data-email autocomplete="username" placeholder="Zepp account email" aria-label="Zepp account email" value="' + esc(st.email || '') + '">' +
          '<input type="password" class="find" data-pw autocomplete="current-password" placeholder="Zepp password" aria-label="Zepp password">' +
          '<p class="sub small">The password stays locked in the phone\'s keystore: it never leaves it, except towards Zepp.</p>' +
          '<button class="btn primary" data-salva>Save the login</button>';
      } else {
        h += '<p class="sub">Open Zepp, let it sync the watch, then come back here.</p>' +
          '<button class="btn primary big" data-estrai>Extract watch data</button>' +
          '<div class="oro-passo" data-passo hidden><div class="oro-barra"><i data-barra></i></div><span data-testo></span></div>';
      }
      if (msg) h += '<p class="oro-msg' + (cattivo ? ' bad' : ' good') + '" data-msg>' + esc(msg) + '</p>';
      if (r) h += '<p class="sub" data-sul>' + esc(sulTelefono(r)) + '</p>';
      if (st.accesso && !st.rifiutato) {
        // il tracciante (16/10): chi ha chiuso il token lo si vede qui, non si indovina
        var tr = [];
        if (st.ultimoLogin) tr.push('last Zepp login ' + quando(new Date(st.ultimoLogin).toISOString()));
        if (st.ultimoTokenRifiutato && st.ultimoTokenRifiutato >= (st.ultimoLogin || 0))
          tr.push('Zepp closed Health\'s access ' + quando(new Date(st.ultimoTokenRifiutato).toISOString()) +
                  (st.ultimoTokenRifiutatoSu ? ' (asking for ' + st.ultimoTokenRifiutatoSu + ')' : ''));
        if (tr.length) h += '<p class="sub small" data-traccia>' + esc(tr.join(' · ').replace(/^./, function (c) { return c.toUpperCase(); })) + '.</p>';
        h += '<p class="sub small">Connected as ' + esc(st.email) + '.</p>' +
          '<button class="btn small ghost" data-scollega>Disconnect Zepp</button>';
      }
      box.innerHTML = h;
      var sv = box.querySelector('[data-salva]');
      if (sv) sv.onclick = function () {
        var em = box.querySelector('[data-email]').value.trim(), pwEl = box.querySelector('[data-pw]'), pw = pwEl.value;
        if (!em || !pw) { disegna('Email and password are needed.', true); return; }
        sv.disabled = true;
        Z.salvaAccesso({ email: em, password: pw }).then(function () {
          pwEl.value = '';
          return disegna('Login saved. Now you can extract.');
        }, function (e) { pwEl.value = ''; return disegna(capisci(e), true); });
      };
      var ex = box.querySelector('[data-estrai]');
      if (ex) ex.onclick = function () {
        ex.disabled = true;
        ex.textContent = 'Downloading…';
        var pz = box.querySelector('[data-passo]'), barra = box.querySelector('[data-barra]'), txt = box.querySelector('[data-testo]');
        var vecchio = box.querySelector('[data-msg]');
        if (vecchio) vecchio.remove();
        pz.hidden = false;
        sveglio(true);
        estrai(function (t, fatto, tot) {
          barra.style.width = Math.round(100 * fatto / Math.max(1, tot)) + '%';
          txt.textContent = t + (tot > 1 ? ' (' + fatto + ' of ' + tot + ')' : '');
        }).then(function () {
          sveglio(false);
          return disegna('Done: watch data updated.');
        }, function (e) {
          sveglio(false);
          return disegna(capisci(e), true);
        });
      };
      var sc = box.querySelector('[data-scollega]');
      if (sc) sc.onclick = function () {
        H.ask('Disconnect Zepp? Email and password leave the keystore. Data already downloaded stays on the phone.', 'Disconnect', function () {
          Z.dimentica().then(function () { return disegna('Zepp disconnected. The data stays.'); });
        }, true);
      };
    }).catch(function (e) {
      box.innerHTML = '<h2>Watch</h2><p class="oro-msg bad">' + esc(capisci(e)) + '</p>';
    });
  }
  disegna();
});

H.orologio = { estrai: estrai, riepilogo: riepilogo, leggi: leggi, chiavi: chiavi,
               unisci: unisci, compatta: compatta, tutto: tutto, rimetti: rimetti,
               notte: notte, seduta: seduta, battito: battito };
})();
