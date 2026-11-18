/* ===========================================================================
 * sport.js — lo SPORT di The 151 Health: la palestra e ogni allenamento
 * dell'orologio, in una sezione sola.
 *
 * La palestra non è una sezione a parte, è uno sport. Quindi
 * c'è UNA lista di sedute (`sessions`), e tutto il resto la legge:
 *   - il calendario (una zona sola, «Sport»);
 *   - la pagina Allenamenti (#/allenamenti), dalla più nuova;
 *   - lo scorrere fra le sedute («‹ prima» / «dopo ›»), da qualunque seduta,
 *     palestra o orologio, come si scorre fra le notti del sonno.
 *
 * Due fonti:
 *   la palestra   app.js → `Health.palestra()` (la Scheda: esercizi, record)
 *   l'orologio    storia.sport = [[inizio_s, fine_s, tipo, "nome", metri,
 *                 kcal, battito_medio, battito_max], …] (Zepp, dal 2022)
 *
 * L'orologio NON sa gli esercizi (in palestra registra «Esercizi a corpo
 * libero»), la Scheda non sa il battito: si UNISCONO PER GIORNO E ORA, mai
 * per esercizio. `watchFor(inizio, fine)` dà la registrazione dell'orologio
 * che si sovrappone di più a quell'allenamento della Scheda (10 minuti di
 * tolleranza per lato); quella registrazione vive dentro la seduta di
 * palestra e NON compare una seconda volta.
 *
 * Una seduta dell'orologio si apre su #/sport/<inizio_s> (l'inizio in secondi
 * è unico: due allenamenti non partono nello stesso secondo); una di
 * palestra sulla pagina della Scheda (#/storico/<id>), che riceve da qui
 * l'orologio (`watchCard`) e lo scorrere (`sessionNav`).
 * ========================================================================= */
(function () {
'use strict';
var H = window.Health, d2 = H.d2, esc = H.esc;
var TOL = 600;                       // secondi di tolleranza per lato

function clock(ts) { var d = new Date(ts * 1000); return d2(d.getHours()) + ':' + d2(d.getMinutes()); }
function mins(a, b) { return Math.max(0, Math.round((b - a) / 60)); }
function durTxt(m) { return m >= 60 ? Math.floor(m / 60) + 'h ' + d2(m % 60) : m + ' min'; }
/** Il nome dello sport: dal codice (sport-tipi.js, inglese dal 20/10), così anche i nomi
 *  italiani già salvati nel passato si leggono in inglese; il nome salvato è il ripiego. */
function sname(w) { var t = window.SPORT_TIPI; return (t && t[String(w[2])]) || w[3]; }
function km(m) { return (m / 1000).toFixed(1) + ' km'; }
function day(ts) { var d = new Date(ts * 1000); return H.GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + H.MESI[d.getMonth()] + ' ' + d.getFullYear(); }

/** La registrazione dell'orologio che appartiene a un allenamento della Scheda (ms → riga o null). */
H.watchFor = function (startMs, endMs) {
  var a = Math.floor(startMs / 1000) - TOL, b = Math.floor((endMs || startMs) / 1000) + TOL, best = null, ov = 0;
  H.storia.sport.forEach(function (w) {
    var o = Math.min(b, w[1]) - Math.max(a, w[0]);
    if (o > ov) { ov = o; best = w; }
  });
  return best;
};
/** Il pezzetto di testo dell'orologio per la voce di palestra: «orologio 71 min · battito 105». */
H.watchText = function (w) {
  return 'watch ' + durTxt(mins(w[0], w[1])) + (w[6] ? ' · heart rate ' + w[6] : '');
};

/** I numeri dell'orologio in una scheda: li usa la seduta dell'orologio e quella di palestra. */
function facts(w) {
  var m = mins(w[0], w[1]), f = [['duration', durTxt(m)]];
  if (w[4] >= 100) f.push(['distance', km(w[4])]);
  if (w[4] >= 500 && m > 0) {
    var p = (w[1] - w[0]) / (w[4] / 1000);
    f.push(['pace', Math.floor(p / 60) + ':' + d2(Math.round(p % 60)) + ' /km']);
  }
  if (w[6]) f.push(['avg heart rate', String(w[6])]);
  if (w[7]) f.push(['max heart rate', String(w[7])]);
  if (w[5]) f.push(['calories', w[5] + ' kcal']);
  return '<div class="facts">' + f.map(function (x) {
    return '<div><span>' + x[0] + '</span><b>' + esc(x[1]) + '</b></div>';
  }).join('') + '</div>';
}
H.watchCard = function (w) {
  return '<div class="card wcard"><div class="kick">From the watch · ' + esc(sname(w)) + ' · ' + clock(w[0]) + ' → ' + clock(w[1]) + '</div>' + facts(w) + '</div>';
};

/* --- la linea del tempo: l'orologio sopra la seduta ---------
 * Il battito minuto per minuto (`H.orologio.battito`, il grezzo dell'orologio)
 * disegnato sull'ora VERA della seduta, e sotto le serie (`t0`/`t1`, segnate
 * dall'app). L'allineamento non dipende da quando l'utente accende o spegne
 * l'allenamento sull'orologio: il battito di tutto il giorno c'è comunque, e
 * la registrazione dell'orologio è solo una striscia in alto, tagliata ai bordi.
 * Mai un dato inventato: due misure lontane più di GAP minuti non si uniscono,
 * e i minuti senza misura sono grigi.
 */
var GAP = 3;
function hm(ms) { var d = new Date(ms); return d2(d.getHours()) + ':' + d2(d.getMinutes()); }

/** Il disegno, puro: punti [[ms,bpm]], o = { from, to, session:[a,b]|null, watch:[a,b]|null, sets:[{t0,t1,ex}] }. */
function timelineSVG(pts, o) {
  var W = 340, PL = 30, PR = 6, TOP = 12, CH = 104, SY = TOP + CH + 6, SH = 12, HT = SY + SH + 16;
  var a = o.from, b = o.to, span = Math.max(60000, b - a);
  var X = function (t) { return +(PL + (W - PL - PR) * (Math.min(b, Math.max(a, t)) - a) / span).toFixed(1); };
  var vs = pts.map(function (p) { return p[1]; });
  var lo = vs.length ? Math.floor((Math.min.apply(null, vs) - 5) / 10) * 10 : 60;
  var hi = vs.length ? Math.ceil((Math.max.apply(null, vs) + 5) / 10) * 10 : 160;
  if (hi - lo < 30) hi = lo + 30;
  var Y = function (v) { return +(TOP + CH - CH * (v - lo) / (hi - lo)).toFixed(1); };
  var g = [];
  // le righe del battito
  var step = hi - lo > 80 ? 40 : 20;
  for (var v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    g.push('<line class="tl-grid" x1="' + PL + '" x2="' + (W - PR) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/>' +
           '<text class="tl-y" x="' + (PL - 4) + '" y="' + (Y(v) + 3) + '">' + v + '</text>');
  }
  // i minuti senza misura: grigi (anche ai bordi)
  var prev = a - 60000;
  pts.concat([[b + 60000, 0]]).forEach(function (p) {
    if (p[0] - prev > GAP * 60000) {
      var x1 = X(prev + 60000), x2 = X(p[0] - 60000);
      if (x2 - x1 > 0.5) g.push('<rect class="tl-none" x="' + x1 + '" y="' + TOP + '" width="' + (x2 - x1).toFixed(1) + '" height="' + CH + '"/>');
    }
    prev = p[0];
  });
  // la registrazione dell'orologio, in alto
  if (o.watch && o.watch[1] > a && o.watch[0] < b) {
    g.push('<rect class="tl-wrec" x="' + X(o.watch[0]) + '" y="2" width="' + Math.max(1, X(o.watch[1]) - X(o.watch[0])).toFixed(1) + '" height="5"/>');
  }
  // inizio e fine della seduta
  if (o.session) [o.session[0], o.session[1]].forEach(function (s) {
    if (s >= a && s <= b) g.push('<line class="tl-edge" x1="' + X(s) + '" x2="' + X(s) + '" y1="' + TOP + '" y2="' + (SY + SH) + '"/>');
  });
  // il battito: pezzi di linea, mai sopra un buco
  var seg = [], last = null;
  pts.forEach(function (p) {
    if (!last || p[0] - last[0] > GAP * 60000) { if (seg.length) g.push(piece(seg)); seg = []; }
    seg.push(X(p[0]) + ',' + Y(p[1])); last = p;
  });
  if (seg.length) g.push(piece(seg));
  function piece(sg) {
    return sg.length > 1 ? '<polyline class="tl-hr" points="' + sg.join(' ') + '"/>'
      : '<circle class="tl-dot" cx="' + sg[0].split(',')[0] + '" cy="' + sg[0].split(',')[1] + '" r="1.6"/>';
  }
  // le serie: un blocco se si sa l'inizio, una tacca se si sa solo la fine
  (o.sets || []).forEach(function (s) {
    if (!s.t1 || s.t1 < a || s.t1 > b) return;
    var c = 'tl-set e' + (s.ex % 2);
    if (s.t0 && s.t0 < s.t1) g.push('<rect class="' + c + '" x="' + X(s.t0) + '" y="' + SY + '" width="' + Math.max(2, X(s.t1) - X(s.t0)).toFixed(1) + '" height="' + SH + '"/>');
    else g.push('<rect class="' + c + '" x="' + (X(s.t1) - 1) + '" y="' + SY + '" width="2" height="' + SH + '"/>');
  });
  // le ore, sotto
  var every = span > 3 * 3600000 ? 3600000 : span > 80 * 60000 ? 30 * 60000 : 15 * 60000;
  for (var h0 = Math.ceil(a / every) * every; h0 <= b; h0 += every) {
    g.push('<text class="tl-x" x="' + X(h0) + '" y="' + (HT - 3) + '">' + hm(h0) + '</text>');
  }
  return '<svg class="tl" viewBox="0 0 ' + W + ' ' + HT + '" role="img" aria-label="heart rate minute by minute">' + g.join('') + '</svg>';
}

/** I numeri del battito dentro [a, b]: media, massimo, minimo, minuti coperti. */
function hrStats(pts, a, b) {
  var in_ = pts.filter(function (p) { return p[0] >= a && p[0] <= b; }).map(function (p) { return p[1]; });
  if (!in_.length) return null;
  var sum = in_.reduce(function (x, y) { return x + y; }, 0);
  return { avg: Math.round(sum / in_.length), max: Math.max.apply(null, in_), min: Math.min.apply(null, in_),
           n: in_.length, of: Math.max(1, Math.round((b - a) / 60000)) };
}
/** Il battito di UNA serie: il massimo fra inizio e fine (o il minuto della fine, se l'inizio non si sa). */
function setHr(pts, s) {
  var a = s.t0 && s.t0 < s.t1 ? s.t0 - 30000 : s.t1 - 90000, b = s.t1 + 30000, best = 0;
  pts.forEach(function (p) { if (p[0] >= a && p[0] <= b && p[1] > best) best = p[1]; });
  return best || null;
}

/**
 * Riempie `box` con la linea del tempo. Il battito si legge dal telefono
 * (asincrono): prima c'è il riquadro vuoto, poi il disegno. `onPts(pts)` serve
 * a chi vuole i battiti anche altrove (le serie della palestra).
 */
H.timeline = function (box, o, onPts) {
  var R = H.orologio && H.orologio.battito;
  if (!box) return;
  if (!R) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="kick">Heart rate, minute by minute</div><p class="sub small">reading the watch…</p>';
  R(o.from, o.to).then(function (r) {
    if (!r || !r.punti.length) {
      box.innerHTML = '<div class="kick">Heart rate, minute by minute</div><p class="sub small" data-tl-none>' +
        (r && r.giorni ? 'The watch did not measure your heart rate during this time.' :
         'This phone has no minute-by-minute watch data for this day: get it with "Extract watch data" in Settings.') + '</p>';
      if (onPts) onPts([]);
      return;
    }
    var pts = r.punti, sa = o.session ? o.session[0] : o.from, sb = o.session ? o.session[1] : o.to;
    var st = hrStats(pts, sa, sb), f = [];
    if (st) f.push(['avg', st.avg], ['max', st.max], ['min', st.min], ['minutes with a reading', st.n + ' of ' + st.of]);
    var warn = '';
    // controllo dell'allineamento: i minuti contro il riassunto dell'orologio stesso
    if (o.watch && o.watchAvg) {
      var ws = hrStats(pts, o.watch[0], o.watch[1]);
      if (ws && ws.n >= 5 && Math.abs(ws.avg - o.watchAvg) > 15)
        warn = '<p class="oro-msg bad" data-tl-warn>The minute readings average ' + ws.avg + ' during the watch recording, the watch itself says ' +
          o.watchAvg + ': the times may not line up.</p>';
    }
    box.innerHTML = '<div class="kick">Heart rate, minute by minute</div>' + timelineSVG(pts, o) +
      '<div class="tl-key">' +
        '<span><i class="k-hr"></i>heart rate</span><span><i class="k-none"></i>no reading</span>' +
        (o.watch ? '<span><i class="k-wrec"></i>watch workout</span>' : '') +
        ((o.sets || []).length ? '<span><i class="k-set"></i>sets</span>' : '') + '</div>' +
      (f.length ? '<div class="facts">' + f.map(function (x) { return '<div><span>' + x[0] + '</span><b>' + esc(String(x[1])) + '</b></div>'; }).join('') + '</div>' : '') +
      warn;
    if (onPts) onPts(pts);
  }, function () {
    box.innerHTML = '<div class="kick">Heart rate, minute by minute</div><p class="sub small">The watch data cannot be read right now.</p>';
    if (onPts) onPts([]);
  });
};
H.timelineSVG = timelineSVG;
H.setHr = setHr;
H.hm = hm;

/**
 * Tutte le sedute, dalla più vecchia: { start (ms), title, sub, value, tone, go }.
 * Si rifà a ogni richiesta (sono pochi millesimi): niente copie da tenere in pari.
 */
/* Che sport è, per il disegnino nella casella: dal tipo dell'orologio (Zepp). */
var KIND = { 16: 'gym', 24: 'gym', 52: 'gym', 21: 'gym', 130: 'gym', 149: 'gym',
             1: 'run', 7: 'run', 8: 'run', 6: 'walk', 22: 'walk',
             9: 'bike', 10: 'bike', 143: 'bike', 14: 'swim', 15: 'swim', 157: 'swim' };
var ICON = {
  gym:  '<path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"/>',
  run:  '<circle class="f" cx="15" cy="4.2" r="2.2"/><path d="M8.5 9.2l3.5-1.8 3.2 2.2 1.6 3 3 1M12 7.4l-1.8 5.6 3.6 3-1 5.2M10.2 13l-3 4H3.6"/>',
  walk: '<circle class="f" cx="13" cy="4.2" r="2.2"/><path d="M11.5 8l-1.5 6 3 3 1 4.5M10 14l-2 7M11.5 8l3.5 3.5 3 1M11.5 8L8 10.5V14"/>',
  bike: '<circle cx="5.5" cy="16.5" r="3.8"/><circle cx="18.5" cy="16.5" r="3.8"/><path d="M5.5 16.5l4-7.5h6M12 9l-2.5 7.5M15.5 9l3 7.5M14 6h3"/>',
  swim: '<circle class="f" cx="17" cy="6.5" r="2.2"/><path d="M2.5 18c2 0 2-1.3 4-1.3s2 1.3 4 1.3 2-1.3 4-1.3 2 1.3 4 1.3 2-1.3 3-1.3M5 13.5l4.5-4 3.5 3 3-2"/>',
  other:'<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'
};
function icon(kind, pr) {
  return '<svg class="ic' + (pr ? ' rec' : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICON[kind] || ICON.other) + '</svg>';
}

function sessions() {
  var pal = (H.palestra ? H.palestra() : []).map(function (p) { p.kind = 'gym'; return p; });
  // «My workouts» (mine.js): le sedute dell'utente stanno con la palestra, e prendono l'orologio come lei
  if (H.mine) pal = pal.concat(H.mine.sedute());
  var used = pal.map(function (p) { return p.watch; }).filter(Boolean);
  var out = pal.slice();
  H.storia.sport.forEach(function (w) {
    if (used.indexOf(w) !== -1) return;
    out.push({
      start: w[0] * 1000, end: w[1] * 1000, title: sname(w),
      sub: [clock(w[0]), w[4] >= 100 ? km(w[4]) : '', w[6] ? 'heart rate ' + w[6] : ''].filter(Boolean).join(' · '),
      value: durTxt(mins(w[0], w[1])), go: '#/sport/' + w[0], kind: KIND[w[2]] || 'other'
    });
  });
  return out.sort(function (a, b) { return a.start - b.start; });
}
H.sessions = sessions;

/** «‹ seduta prima · seduta dopo ›» attorno alla seduta che si apre con `go`. */
H.sessionNav = function (cur) {
  var all = sessions().filter(function (s) { return !s.live; });
  var i = -1;
  all.forEach(function (s, j) { if (s.go === cur) i = j; });
  var p = i > 0 ? all[i - 1] : null, n = i >= 0 && i < all.length - 1 ? all[i + 1] : null;
  return '<div class="row snav">' +
    '<button class="btn small ghost" data-sgo="' + (p ? p.go : '') + '"' + (p ? '' : ' disabled') + '>‹ previous</button>' +
    '<button class="btn small ghost" data-sgo="' + (n ? n.go : '') + '"' + (n ? '' : ' disabled') + '>next ›</button></div>';
};
/** Scorrere resta «dentro» la stessa strada: se eri venuto dal calendario, indietro ci riporta. */
H.wireNav = function (app, go) {
  app.querySelectorAll('[data-sgo]').forEach(function (b) {
    b.onclick = function () { if (b.dataset.sgo) { var r = H.ret; go(b.dataset.sgo); H.ret = r; } };
  });
};

H.area({
  id: 'sport', label: 'Sport', color: 'var(--sport)', sign: 'A',
  // il quadratino: un disegnino per allenamento, al massimo due (le camminate
  // per ultime, prima i più lunghi); oro se quel giorno c'è un record
  cell: function (k, its) {
    if (!its.length) return null;
    var list = its.slice().sort(function (a, b) {
      return ((a.kind === 'walk') - (b.kind === 'walk')) || ((b.end - b.start) - (a.end - a.start));
    }).slice(0, 2);
    var pr = its.some(function (s) { return s.tone === 'pr'; });
    return { cls: 'a' + (pr ? ' rec' : '') + (list.length > 1 ? ' two' : ''),
             html: list.map(function (s) { return icon(s.kind, s.tone === 'pr'); }).join('') };
  },
  days: function () {
    var out = {};
    sessions().forEach(function (s) {
      var k = H.ymd(new Date(s.start));
      (out[k] = out[k] || []).push(s);
    });
    return out;
  }
});

/* --- una seduta dell'orologio -------------------------------------------- */
H.page('sport', function (app, go, parts) {
  var t = +parts[1], w = null;
  H.storia.sport.forEach(function (x) { if (x[0] === t) w = x; });
  if (!w) { go('#/allenamenti'); return; }
  app.innerHTML = H.sessionNav('#/sport/' + w[0]) +
    '<h1>' + esc(sname(w)) + '</h1><p class="sub">' + day(w[0]) + ' · ' + clock(w[0]) + ' → ' + clock(w[1]) + '</p>' +
    '<div class="card">' + facts(w) + '</div>' +
    '<div class="card tlcard" data-tl></div>' +
    '<p class="sub">from the watch</p>';
  H.wireNav(app, go);
  H.timeline(app.querySelector('[data-tl]'), { from: w[0] * 1000 - 300000, to: w[1] * 1000 + 300000,
    session: [w[0] * 1000, w[1] * 1000], watch: null });
}, 'sport');

/* --- tutte le sedute, dalla più nuova ------------------------------------ */
var shown = 40;
H.page('allenamenti', function (app, go) {
  var all = sessions().slice().reverse(), last = '', out = '<h1>Workouts</h1>';
  if (!all.length) {
    app.innerHTML = out + '<div class="empty">No workouts yet.</div>';
    return;
  }
  out += '<p class="sub">' + all.length + ' sessions · gym and watch</p>';
  all.slice(0, shown).forEach(function (s, i) {
    var d = new Date(s.start), m = H.MESI[d.getMonth()] + ' ' + d.getFullYear();
    if (m !== last) { out += (last ? '</div>' : '') + '<h2>' + m + '</h2><div class="card daylist">'; last = m; }
    out += '<button class="dline" data-i="' + i + '" style="--c:var(--sport)">' +
      '<span class="ic">' + d.getDate() + '</span>' +
      '<span class="tx"><b>' + esc(s.title) + '</b><small>' + esc(s.sub || '') + '</small></span>' +
      '<span class="vv' + (s.tone ? ' t-' + s.tone : '') + '">' + esc(s.value || '') + '</span></button>';
  });
  out += '</div>';
  if (all.length > shown) out += '<button class="btn ghost" data-more>Show more</button>';
  app.innerHTML = out;
  app.querySelectorAll('.dline').forEach(function (b) {
    b.onclick = function () { go(all[+b.dataset.i].go); };
  });
  var more = app.querySelector('[data-more]');
  if (more) more.onclick = function () { var y = window.scrollY; shown += 80; H.pages.allenamenti(app, go); window.scrollTo(0, y); };
}, 'sport');

})();
