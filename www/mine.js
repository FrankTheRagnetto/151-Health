/* ===========================================================================
 * mine.js — «My workouts» dentro Sport.
 *
 * l'utente compone i SUOI allenamenti da un catalogo di 873 esercizi con due foto
 * ciascuno (free-exercise-db, dominio pubblico: www/esercizi/, fatto da
 * tools/esercizi.py), li fa con la spunta come in palestra e la seduta fatta
 * finisce nel suo giorno (calendario, pagina del giorno, Sport › Workouts).
 * Scopo dell'utente: sedute più corte e più frequenti.
 *
 * Cosa NON fa: non inventa né propone allenamenti; nessuna durata prevista
 * sullo schermo; la Scheda della palestra (app.js) resta com'è — qui non si
 * tocca `scheda.v1`, si prendono in prestito solo i suoi attrezzi puri
 * (`Health.kit`: −/+, cronometro, spunta disegnata, schermo acceso).
 *
 * Il gesto è quello della palestra (app.js, `tapTick`): la spunta ha due
 * tocchi, il primo fa partire la serie (`t0`), il secondo la dà per fatta
 * (`t1`); un terzo la rimette com'era. Una serie per volta: farne partire
 * un'altra chiude quella che correva. Negli esercizi a secondi la spunta è il
 * cronometro. Fra una serie e l'altra il quadrante in basso CONTA il recupero.
 *
 * Il deposito, tutto in `health.mine.v1` (localStorage), mai gli altri:
 *   { v: 1,
 *     workouts: [{ id, name, made, items: [voce] }],
 *     sessions: [{ id, wid, name, startedAt, endedAt, items: [voce + sets] }],
 *     active:   la seduta in corso (stessa forma, serie con `done`) o null }
 *   voce = { ex (id del catalogo), name, img: [a, b], mus, eq, sets, reps, kg,
 *            load (con peso?), sec (a secondi?) }
 * La voce porta con sé nome e foto: una seduta fatta si legge anche se un
 * giorno il catalogo cambia. Un deposito illeggibile non si sovrascrive mai:
 * la sua copia va da parte (`health.mine.v1.broken`) prima della prima scrittura.
 *
 * Il catalogo (833 kB) si legge SOLO aprendo «Add exercise»: l'avvio dell'app
 * non lo tocca. Le foto hanno loading=lazy e la lista ne disegna 40 per volta.
 *
 * Pagine (#/mine/…): lista · w/<id> l'allenamento · add/<id> il catalogo ·
 * ex/<es>/<id> la scheda di un esercizio · run la seduta · s/<id> la seduta fatta.
 * ========================================================================= */
(function () {
'use strict';
var H = window.Health, esc = H.esc, d2 = H.d2;
var KEY = 'health.mine.v1';
var IMG = 'esercizi/img/';
var S = null, broken = null;

/* --- deposito -------------------------------------------------------------- */
function blank() { return { v: 1, workouts: [], sessions: [], active: null }; }
function load() {
  var raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
  S = blank(); broken = null;
  if (!raw) return;
  try {
    var o = JSON.parse(raw);
    if (!o || o.v !== 1 || !Array.isArray(o.workouts) || !Array.isArray(o.sessions)) throw new Error('form');
    S = o;
    if (S.active === undefined) S.active = null;
  } catch (e) { broken = raw; }
}
/** Scrive tutto; falso (e lo dice) se il telefono non ha più posto. */
function save() {
  try {
    if (broken != null) { localStorage.setItem(KEY + '.broken', broken); broken = null; }
    localStorage.setItem(KEY, JSON.stringify(S));
    return true;
  } catch (e) {
    H.say('Your workouts could not be saved: the phone storage is full. Export everything from Settings and free some space.');
    return false;
  }
}
load();

function K() { return H.kit; }
function wById(id) { for (var i = 0; i < S.workouts.length; i++) if (S.workouts[i].id === id) return S.workouts[i]; return null; }
function sById(id) { for (var i = 0; i < S.sessions.length; i++) if (S.sessions[i].id === id) return S.sessions[i]; return null; }
function go(h) { location.hash = h; }
function photo(n) { return IMG + encodeURIComponent(n || ''); }
function mode(it) { return { load: !!it.load, unit: it.sec ? 'sec' : 'rip' }; }
function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }

/* --- il catalogo, solo quando serve ------------------------------------------ */
var CAT = null, catP = null, MUS = [], EQ = [];
function catalog() {
  if (!catP) {
    catP = fetch('esercizi/catalogo.json').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      CAT = d.esercizi || [];
      var m = {}, q = {};
      CAT.forEach(function (x) {
        x._n = x.name.toLowerCase();
        x.primaryMuscles.forEach(function (y) { m[y] = 1; });
        q[x.equipment] = 1;
      });
      MUS = Object.keys(m).sort(); EQ = Object.keys(q).sort();
      return CAT;
    }, function (e) { catP = null; throw e; });
  }
  return catP;
}
function exById(id) { for (var i = 0; i < CAT.length; i++) if (CAT[i].id === id) return CAT[i]; return null; }

// quel che si cerca resta mentre vai e torni dalla scheda di un esercizio
var F = { q: '', mus: '', eq: '', n: 40 };
function found() {
  var words = F.q.toLowerCase().split(/\s+/).filter(Boolean);
  return CAT.filter(function (x) {
    if (F.mus && x.primaryMuscles.indexOf(F.mus) < 0) return false;
    if (F.eq && x.equipment !== F.eq) return false;
    for (var i = 0; i < words.length; i++) if (x._n.indexOf(words[i]) < 0) return false;
    return true;
  });
}

/** Una voce nuova dall'esercizio del catalogo: il modo si indovina, l'utente lo cambia. */
var NOLOAD = ['body only', 'none', 'foam roll', 'bands', 'exercise ball'];
function newItem(x) {
  var sec = x.category === 'stretching' || /\b(plank|hold|hang|stretch)\b/i.test(x.name);
  return { ex: x.id, name: x.name, img: x.img.slice(0, 2), mus: x.primaryMuscles[0] || '', eq: x.equipment,
           sets: 3, reps: sec ? 30 : 10, kg: 0, load: NOLOAD.indexOf(x.equipment) < 0, sec: sec };
}

/* --- il «− valore +» ---------------------------------------------------------- */
function stepper(attrs, field, txt) {
  return '<div class="stp" data-f="' + field + '">' +
    '<button class="mn" ' + attrs + ' data-f="' + field + '" data-d="-1" aria-label="minus">−</button>' +
    '<b class="val" ' + attrs + ' data-f="' + field + '" role="button" tabindex="0">' + K().lcdHTML(txt) + '</b>' +
    '<button class="pl" ' + attrs + ' data-f="' + field + '" data-d="1" aria-label="plus">+</button></div>';
}
function next(v, field, sec, dir) {
  if (field === 'kg') return Math.max(0, (+v || 0) + dir * 2.5);
  if (field === 'reps' && sec) return Math.max(0, K().nextSec(v, dir));
  return Math.max(field === 'sets' ? 1 : 0, (+v || 0) + dir);
}
function itemVal(it, f) {
  if (f === 'sets') return String(it.sets);
  if (f === 'kg') return K().num(it.kg);
  return it.sec ? K().secText(it.reps) : K().num(it.reps);
}
function planText(it) {
  var right = it.sec ? K().secText(it.reps) : it.reps + ' reps';
  // nella seduta `sets` è la lista delle serie: il numero pensato sta in `plan`
  var n = Array.isArray(it.sets) ? (it.plan || it.sets.length) : it.sets;
  return n + ' × ' + right + (it.load && it.kg > 0 ? ' · ' + K().num(it.kg) + ' kg' : '');
}

/* ============================== la lista ===================================== */
function viewList(app) {
  var out = '<div id="mw"><h1>My workouts</h1><p class="sub">Your own workouts, from 873 exercises. Tick the sets as in the gym.</p>';
  if (S.active) {
    out += '<div class="card live" data-mw-live><div class="live-d">' + esc(S.active.name) + '</div>' +
      '<p class="sub">in progress, started at ' + K().fmtTime(S.active.startedAt) + '</p>' +
      '<div class="row"><button class="btn primary" data-act="resume">Resume</button>' +
      '<button class="btn danger" data-act="discard">Discard</button></div></div>';
  }
  if (!S.workouts.length) {
    out += '<div class="empty">No workouts yet.<br>Make your first one.</div>';
  } else {
    out += '<div class="card daylist">' + S.workouts.map(function (w) {
      var last = lastOf(w.id);
      return '<button class="dline" data-act="open" data-w="' + esc(w.id) + '" style="--c:var(--sport)">' +
        '<span class="tx"><b>' + esc(w.name) + '</b><small>' + plural(w.items.length, 'exercise', 'exercises') +
        (last ? ' · last done ' + K().fmtShort(last.startedAt) : '') + '</small></span><span class="vv">›</span></button>';
    }).join('') + '</div>';
  }
  out += '<button class="btn primary big" data-act="new">+ New workout</button></div>';
  app.innerHTML = out;
  on(app, {
    resume: function () { go('#/mine/run'); },
    discard: function () {
      H.ask('Discard the workout in progress? It will not go into your days.', 'Discard', function () {
        S.active = null; save(); viewList(app);
      }, true);
    },
    open: function (b) { go('#/mine/w/' + b.dataset.w); },
    'new': function () {
      var n = S.workouts.length + 1, id = 'm' + Date.now();
      S.workouts.push({ id: id, name: 'Workout ' + n, made: new Date().toISOString(), items: [] });
      if (save()) go('#/mine/w/' + id);
    }
  });
}
function lastOf(wid) {
  for (var i = S.sessions.length - 1; i >= 0; i--) if (S.sessions[i].wid === wid) return S.sessions[i];
  return null;
}
/** Un clic dentro #mw → il gestore del suo data-act. Il contenitore rinasce a ogni disegno. */
function on(app, acts) {
  var root = app.querySelector('#mw');
  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || !root.contains(b) || b.disabled) return;
    var f = acts[b.dataset.act];
    if (f) f(b, e);
  });
}

/* ============================ un allenamento ================================= */
function viewWorkout(app, wid) {
  var w = wById(wid);
  if (!w) { go('#/mine'); return; }
  var out = '<div id="mw">' +
    '<label class="kick" for="mwname">Name</label>' +
    '<input id="mwname" class="find mw-name" type="text" maxlength="60" autocomplete="off" value="' + esc(w.name) + '">' +
    '<button class="btn primary big" data-act="start"' + (w.items.length ? '' : ' disabled') + '>Start</button>';
  if (!w.items.length) out += '<div class="empty">No exercises yet.<br>Add the first one.</div>';
  w.items.forEach(function (it, i) {
    var at = 'data-i="' + i + '"';
    out += '<div class="card mw-item" data-item="' + i + '">' +
      '<div class="mw-ihead"><img src="' + photo(it.img[0]) + '" alt="" loading="lazy" width="64" height="64">' +
        '<div class="tx"><b>' + (i + 1) + '. ' + esc(it.name) + '</b><small>' + esc(it.mus) + (it.eq ? ' · ' + esc(it.eq) : '') + '</small></div></div>' +
      '<div class="mw-k' + (it.load ? '' : ' two') + '">' +
        '<div>' + stepper(at, 'sets', itemVal(it, 'sets')) + '<small>sets</small></div>' +
        '<div>' + stepper(at, 'reps', itemVal(it, 'reps')) + '<small>' + (it.sec ? 'seconds' : 'reps') + '</small></div>' +
        (it.load ? '<div>' + stepper(at, 'kg', itemVal(it, 'kg')) + '<small>kg</small></div>' : '') +
      '</div>' +
      '<div class="seg mw-seg"><button data-act="mode" data-i="' + i + '" data-m="load:1"' + (it.load ? ' class="on"' : '') + '>with weight</button>' +
        '<button data-act="mode" data-i="' + i + '" data-m="load:0"' + (!it.load ? ' class="on"' : '') + '>bodyweight</button></div>' +
      '<div class="seg mw-seg"><button data-act="mode" data-i="' + i + '" data-m="sec:0"' + (!it.sec ? ' class="on"' : '') + '>reps</button>' +
        '<button data-act="mode" data-i="' + i + '" data-m="sec:1"' + (it.sec ? ' class="on"' : '') + '>seconds</button></div>' +
      '<div class="mw-tools">' +
        '<button class="lnk" data-act="up" data-i="' + i + '"' + (i ? '' : ' disabled') + ' aria-label="move up">↑ Up</button>' +
        '<button class="lnk" data-act="down" data-i="' + i + '"' + (i < w.items.length - 1 ? '' : ' disabled') + ' aria-label="move down">↓ Down</button>' +
        '<button class="lnk mw-del" data-act="remove" data-i="' + i + '">Remove</button>' +
      '</div></div>';
  });
  out += '<button class="btn" data-act="add">+ Add exercise</button>' +
    '<button class="btn danger" data-act="delete">Delete this workout</button>' +
    '<button class="btn ghost" data-act="back">Back</button></div>';
  app.innerHTML = out;

  var name = app.querySelector('#mwname');
  name.oninput = function () { w.name = name.value.trim() || w.name; save(); };
  name.onkeydown = function (e) { if (e.key === 'Enter') name.blur(); };
  name.onblur = function () { if (!name.value.trim()) name.value = w.name; };

  function redraw(keep) {
    // dopo «su/giù» la scheda spostata resta dove era sotto il pollice
    var before = keep != null && app.querySelector('[data-item="' + keep.from + '"]');
    var top = before ? before.getBoundingClientRect().top : null;
    viewWorkout(app, wid);
    var after = keep != null && app.querySelector('[data-item="' + keep.to + '"]');
    if (after && top != null) window.scrollBy(0, after.getBoundingClientRect().top - top);
  }
  function bump(b) {
    var it = w.items[+b.dataset.i], f = b.dataset.f;
    it[f] = Math.round(next(it[f], f, it.sec, +b.dataset.d) * 100) / 100;
    save();
    b.parentNode.querySelector('.val').innerHTML = K().lcdHTML(itemVal(it, f));
    if (navigator.vibrate) navigator.vibrate(8);
  }
  app.querySelectorAll('.stp button').forEach(function (b) { b.onclick = function () { bump(b); }; });
  app.querySelectorAll('.stp .val').forEach(function (v) {
    v.onclick = function () {
      var it = w.items[+v.dataset.i], f = v.dataset.f;
      var label = f === 'sets' ? 'Sets' : f === 'kg' ? 'Kg' : it.sec ? 'Seconds' : 'Reps';
      H.askNum(label + ', ' + it.name + ':', it[f], function (n) {
        it[f] = f === 'sets' ? Math.max(1, Math.round(n)) : Math.round(n * 100) / 100;
        save(); v.innerHTML = K().lcdHTML(itemVal(it, f));
      });
    };
  });
  on(app, {
    start: function () { start(w); },
    add: function () { go('#/mine/add/' + w.id); },
    back: function () { go('#/mine'); },
    mode: function (b) {
      var it = w.items[+b.dataset.i], m = b.dataset.m.split(':');
      it[m[0]] = m[1] === '1';
      if (m[0] === 'load' && !it.load) it.kg = 0;
      if (m[0] === 'sec') it.reps = it.sec ? 30 : 10;
      save(); redraw({ from: +b.dataset.i, to: +b.dataset.i });
    },
    up: function (b) { move(+b.dataset.i, -1); },
    down: function (b) { move(+b.dataset.i, 1); },
    remove: function (b) {
      var i = +b.dataset.i;
      H.ask('Remove ' + w.items[i].name + ' from this workout?', 'Remove', function () {
        w.items.splice(i, 1); save(); redraw(null);
      }, true);
    },
    'delete': function () {
      H.ask('Delete the workout "' + w.name + '"?\nThe sessions you already did stay in your days.', 'Delete', function () {
        S.workouts = S.workouts.filter(function (x) { return x !== w; });
        save(); go('#/mine'); K().toast('Workout deleted');
      }, true);
    }
  });
  function move(i, d) {
    var j = i + d;
    if (j < 0 || j >= w.items.length) return;
    var t = w.items[i]; w.items[i] = w.items[j]; w.items[j] = t;
    save(); redraw({ from: i, to: j });
  }
}

/* ============================== il catalogo ================================== */
function viewAdd(app, wid) {
  var w = wById(wid);
  if (!w) { go('#/mine'); return; }
  if (!CAT) {
    app.innerHTML = '<div id="mw"><h1>Add exercise</h1><p class="sub" data-mw-loading>Opening the exercises…</p></div>';
    var here = location.hash;
    catalog().then(function () { if (location.hash === here) viewAdd(app, wid); }, function () {
      if (location.hash === here) app.querySelector('[data-mw-loading]').textContent = 'The exercise list cannot be read on this phone.';
    });
    return;
  }
  var chips = function (list, cur, f, all) {
    return '<div class="mw-chips" data-row="' + f + '"><button class="mw-chip' + (cur ? '' : ' on') + '" data-act="filter" data-f="' + f + '" data-v="">' + all + '</button>' +
      list.map(function (v) {
        return '<button class="mw-chip' + (cur === v ? ' on' : '') + '" data-act="filter" data-f="' + f + '" data-v="' + esc(v) + '">' + esc(v) + '</button>';
      }).join('') + '</div>';
  };
  app.innerHTML = '<div id="mw"><div class="kick">' + esc(w.name) + ' · ' + plural(w.items.length, 'exercise', 'exercises') + '</div>' +
    '<h1>Add exercise</h1>' +
    '<input id="mwq" class="find" type="search" placeholder="Search by name" autocomplete="off" value="' + esc(F.q) + '">' +
    '<div class="kick mw-fk">Muscle</div>' + chips(MUS, F.mus, 'mus', 'All muscles') +
    '<div class="kick mw-fk">Equipment</div>' + chips(EQ, F.eq, 'eq', 'All equipment') +
    '<div id="mwlist"></div>' +
    '<button class="btn primary" data-act="done">Done</button></div>';
  var q = app.querySelector('#mwq');
  q.oninput = function () { F.q = q.value; F.n = 40; list(); };
  // le file dei filtri restano dove le avevi scorse
  app.querySelectorAll('.mw-chips .mw-chip.on').forEach(function (c) {
    if (c.offsetLeft > c.parentNode.clientWidth - 60) c.parentNode.scrollLeft = c.offsetLeft - 40;
  });
  function list() {
    var r = found(), box = app.querySelector('#mwlist');
    var inW = {};
    w.items.forEach(function (it) { inW[it.ex] = (inW[it.ex] || 0) + 1; });
    box.innerHTML = '<p class="sub mw-count" data-count="' + r.length + '">' + plural(r.length, 'exercise', 'exercises') + '</p>' +
      (r.length ? '<div class="card mw-list">' + r.slice(0, F.n).map(function (x) {
        return '<div class="mw-row' + (inW[x.id] ? ' in' : '') + '">' +
          '<button class="mw-open" data-act="see" data-ex="' + esc(x.id) + '">' +
            '<img src="' + photo(x.img[0]) + '" alt="" loading="lazy" width="64" height="64">' +
            '<span class="tx"><b>' + esc(x.name) + '</b><small>' + esc(x.primaryMuscles.join(', ')) + ' · ' + esc(x.equipment) + '</small></span></button>' +
          '<button class="mw-plus" data-act="quick" data-ex="' + esc(x.id) + '" aria-label="add ' + esc(x.name) + '">' +
            (inW[x.id] ? K().CHECK : '+') + '</button></div>';
      }).join('') + '</div>' : '<div class="empty">Nothing with these words and filters.</div>') +
      (r.length > F.n ? '<button class="btn ghost" data-act="more">Show more (' + (r.length - F.n) + ')</button>' : '');
  }
  list();
  on(app, {
    filter: function (b) {
      F[b.dataset.f] = b.dataset.v; F.n = 40;
      b.parentNode.querySelectorAll('.mw-chip').forEach(function (c) { c.classList.toggle('on', c === b); });
      list();
    },
    more: function () { F.n += 80; list(); },
    see: function (b) { go('#/mine/ex/' + b.dataset.ex + '/' + w.id); },
    quick: function (b) {
      var x = exById(b.dataset.ex);
      if (!x) return;
      w.items.push(newItem(x));
      if (save()) {
        K().toast('Added: ' + x.name);
        var row = b.parentNode; row.classList.add('in'); b.innerHTML = K().CHECK;
        app.querySelector('.kick').textContent = w.name + ' · ' + plural(w.items.length, 'exercise', 'exercises');
      }
    },
    done: function () { go('#/mine/w/' + w.id); }
  });
}

/* ============================ un esercizio ================================== */
function viewEx(app, exid, wid) {
  var w = wById(wid);
  if (!CAT) {
    app.innerHTML = '<div id="mw"><p class="sub">Opening the exercise…</p></div>';
    var here = location.hash;
    catalog().then(function () { if (location.hash === here) viewEx(app, exid, wid); }, function () {});
    return;
  }
  var x = exById(exid);
  if (!x) { go(w ? '#/mine/add/' + w.id : '#/mine'); return; }
  var n = w ? w.items.filter(function (it) { return it.ex === x.id; }).length : 0;
  var fact = function (k, v) { return v ? '<div><span>' + k + '</span><b>' + esc(v) + '</b></div>' : ''; };
  app.innerHTML = '<div id="mw"><h1>' + esc(x.name) + '</h1>' +
    '<div class="mw-big"><figure><img src="' + photo(x.img[0]) + '" alt="start position"><figcaption>A</figcaption></figure>' +
      '<figure><img src="' + photo(x.img[1]) + '" alt="end position"><figcaption>B</figcaption></figure></div>' +
    (w ? '<button class="btn primary big" data-act="add">' + (n ? 'Add again' : 'Add') + '</button>' +
      (n ? '<p class="sub" data-mw-in>Already in ' + esc(w.name) + (n > 1 ? ' (' + n + ' times)' : '') + '.</p>' : '') : '') +
    '<div class="card"><div class="facts mw-facts">' + fact('muscle', x.primaryMuscles.join(', ')) + fact('also', x.secondaryMuscles.join(', ')) +
      fact('equipment', x.equipment) + fact('level', x.level) + fact('type', x.category) + '</div></div>' +
    (x.instructions.length ? '<h2>How to do it</h2><ol class="card mw-how">' + x.instructions.map(function (s) {
      return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' : '') +
    '<button class="btn ghost" data-act="back">Back</button></div>';
  on(app, {
    add: function () {
      w.items.push(newItem(x));
      if (save()) { K().toast('Added: ' + x.name); go('#/mine/add/' + w.id); }
    },
    back: function () { go(w ? '#/mine/add/' + w.id : '#/mine'); }
  });
}

/* ============================== la seduta =================================== */
function start(w, sure) {
  if (!w.items.length) return;
  if (S.active && !sure) {
    H.ask('A workout is already in progress (' + S.active.name + '). Discard it and start a new one?', 'Start new', function () { start(w, true); }, true);
    return;
  }
  S.active = { id: 's' + Date.now(), wid: w.id, name: w.name, startedAt: new Date().toISOString(), endedAt: null,
    items: w.items.map(function (it) {
      var o = JSON.parse(JSON.stringify(it)), sets = [];
      for (var i = 0; i < Math.max(1, it.sets); i++) sets.push({ s: i + 1, kg: it.load ? it.kg : 0, reps: it.reps, done: false });
      o.plan = it.sets; o.sets = sets;
      return o;
    }) };
  if (save()) go('#/mine/run');
}

/** Le serie dell'ultima volta su quell'esercizio, nelle sedute di My workouts. */
function lastSets(ex) {
  for (var i = S.sessions.length - 1; i >= 0; i--) {
    var s = S.sessions[i];
    for (var j = 0; j < s.items.length; j++) if (s.items[j].ex === ex) return { at: s.startedAt, sets: s.items[j].sets, it: s.items[j] };
  }
  return null;
}
/** Verde sopra l'ultima volta, rosso sotto (come in palestra); niente record qui. */
function mark(st, prev) {
  if (!prev || !K().hasValue(st) || !K().hasValue(prev)) return '';
  var a = K().score(st), b = K().score(prev);
  return a > b + 1e-9 ? ' up' : a < b - 1e-9 ? ' down' : '';
}

var runT = null, clockT = null;
function running() {
  var A = S.active, r = null;
  if (!A) return null;
  A.items.forEach(function (it, k) { it.sets.forEach(function (s, i) { if (s.t0 && !s.done && !r) r = { k: k, i: i }; }); });
  return r;
}
function allDone() { return S.active.items.every(function (it) { return it.sets.every(function (s) { return s.done; }); }); }
function restSince() {
  var A = S.active;
  if (!A || running() || allDone()) return 0;
  var end = 0, st = 0;
  A.items.forEach(function (it) { it.sets.forEach(function (s) { if (s.done && s.t1 > end) end = s.t1; if (s.t0 > st) st = s.t0; }); });
  return end && st < end ? end : 0;
}

function tickBtn(k, i, st) {
  var run = st.t0 && !st.done;
  return '<button class="tick" data-k="' + k + '" data-i="' + i + '" aria-label="' +
    (st.done ? 'set done' : run ? 'finish the set' : 'start the set') + '">' + K().CHECK +
    '<span class="tt">' + (run ? K().clockOf(Date.now() - st.t0) : '') + '</span></button>';
}
function rowsHTML(k) {
  var it = S.active.items[k], m = mode(it), last = lastSets(it.ex), at = 'data-k="' + k + '"';
  return it.sets.map(function (st, i) {
    var a = at + ' data-i="' + i + '"';
    return '<div class="setrow' + (st.done ? ' ok' : st.t0 ? ' run' : '') + mark(st, last && last.sets[i]) + '" data-row="' + k + '|' + i + '">' +
      '<div class="sn">' + (i + 1) + '</div>' +
      (m.load ? stepper(a, 'kg', K().num(st.kg)) : '') +
      stepper(a, 'reps', it.sec ? K().secText(st.reps) : K().num(st.reps)) +
      tickBtn(k, i, st) + '</div>';
  }).join('');
}

function viewRun(app) {
  var A = S.active;
  if (!A) { go('#/mine'); return; }
  document.body.classList.add('workout-live');
  K().awake(true);
  var out = '<div id="mw"><h1>' + esc(A.name) + '</h1>' +
    '<p class="sub">My workout · started at ' + K().fmtTime(A.startedAt) + '</p>' +
    '<div class="prog"><i id="mwprog"></i></div>';
  A.items.forEach(function (it, k) {
    var m = mode(it), last = lastSets(it.ex), done = it.sets.filter(function (s) { return s.done; }).length;
    var full = done === it.sets.length && done;
    out += '<div class="ex' + (full ? ' done' : '') + '" data-ex="' + k + '">' +
      '<button class="ex-head" data-act="toggle" data-k="' + k + '">' +
        '<div class="ex-imgs"><img src="' + photo(it.img[0]) + '" alt=""><img src="' + photo(it.img[1]) + '" alt=""></div>' +
        '<div class="ex-txt"><div class="nm">' + esc(it.name) + '</div>' +
          '<div class="sp"><b class="mus">' + esc(it.mus) + '</b> · ' + esc(planText(it)) + '</div></div>' +
        '<div class="ex-tick' + (full ? ' full' : '') + '">' + (done ? done + '/' + it.sets.length : '') + '</div>' +
      '</button>' +
      '<div class="ex-body hide" id="mwbody' + k + '">' +
        '<div class="ex-big"><img src="' + photo(it.img[0]) + '" alt="" loading="lazy"><img src="' + photo(it.img[1]) + '" alt="" loading="lazy"></div>' +
        (last ? '<div class="lastline"><span>Last time · ' + K().fmtShort(last.at) + '</span>' +
          esc(last.sets.map(function (s) { return K().setText(s, mode(last.it)); }).join('   ')) + '</div>'
              : '<div class="lastline"><span>First time</span>values from your workout — adjust them and tick</div>') +
        '<div class="setgrid' + (m.load ? '' : ' noload') + (it.sec ? ' timed' : '') + '">' +
          '<div class="shead"><span></span>' + (m.load ? '<span>kg</span>' : '') + '<span>' + (it.sec ? 'sec' : 'reps') + '</span><span></span></div>' +
          '<div data-rows="' + k + '">' + rowsHTML(k) + '</div></div>' +
        '<div class="exfoot"><button class="lnk" data-act="addset" data-k="' + k + '">Add set</button></div>' +
      '</div></div>';
  });
  out += '</div>';
  app.innerHTML = out;
  wireRows(app);
  on(app, {
    toggle: function (b) {
      var body = document.getElementById('mwbody' + b.dataset.k), opening = body.classList.contains('hide');
      app.querySelectorAll('.ex-body').forEach(function (x) { x.classList.add('hide'); x.parentNode.classList.remove('open'); });
      if (opening) { body.classList.remove('hide'); body.parentNode.classList.add('open'); body.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    },
    addset: function (b) {
      var it = S.active.items[+b.dataset.k], l = it.sets[it.sets.length - 1] || { kg: 0, reps: 0 };
      it.sets.push({ s: it.sets.length + 1, kg: l.kg, reps: l.reps, done: false });
      save(); refresh(app, +b.dataset.k);
    }
  });
  // apri il primo esercizio non finito
  for (var k = 0; k < A.items.length; k++) {
    if (A.items[k].sets.some(function (s) { return !s.done; })) {
      var bd = document.getElementById('mwbody' + k);
      bd.classList.remove('hide'); bd.parentNode.classList.add('open');
      break;
    }
  }
  liveBar();
  progress();
  runTimer(app);
}
/** I tasti delle righe: si rifanno ogni volta che le righe di un esercizio si ridisegnano. */
function wireRows(app, box) {
  (box || app).querySelectorAll('.setrow .stp button').forEach(function (b) {
    b.onclick = function () { bumpSet(app, +b.dataset.k, +b.dataset.i, b.dataset.f, +b.dataset.d); };
  });
  (box || app).querySelectorAll('.setrow .stp .val').forEach(function (v) {
    v.onclick = function () {
      var k = +v.dataset.k, i = +v.dataset.i, f = v.dataset.f, it = S.active.items[k];
      H.askNum((f === 'kg' ? 'Kg' : it.sec ? 'Seconds' : 'Reps') + ', set ' + (i + 1) + ':', +it.sets[i][f] || 0, function (n) {
        it.sets[i][f] = Math.round(n * 100) / 100; save(); refresh(app, k);
      });
    };
  });
  (box || app).querySelectorAll('.setrow .tick').forEach(function (b) {
    b.onclick = function () { tapTick(app, +b.dataset.k, +b.dataset.i); };
  });
}
/** Ridisegna SOLO le righe dell'esercizio toccato: niente salti sotto il pollice. */
function refresh(app, k) {
  var box = app.querySelector('[data-rows="' + k + '"]');
  if (!box) return;
  box.innerHTML = rowsHTML(k);
  wireRows(app, box);
  var it = S.active.items[k], done = it.sets.filter(function (s) { return s.done; }).length;
  var ex = app.querySelector('.ex[data-ex="' + k + '"]'), full = done === it.sets.length && !!done;
  var t = ex.querySelector('.ex-tick');
  t.textContent = done ? done + '/' + it.sets.length : '';
  t.classList.toggle('full', full); ex.classList.toggle('done', full);
  progress();
}
function finish(k, i, now) {
  var it = S.active.items[k], st = it.sets[i];
  st.done = true; st.t1 = now;
  if (it.sec && st.t0) st.reps = Math.max(0, Math.round((now - st.t0) / 10) / 100);
}
function bumpSet(app, k, i, f, dir) {
  var it = S.active.items[k], st = it.sets[i];
  if (f === 'reps' && it.sec && st.t0 && !st.done) finish(k, i, Date.now());
  st[f] = Math.round(next(st[f], f, it.sec, dir) * 100) / 100;
  save(); refresh(app, k);
  if (navigator.vibrate) navigator.vibrate(8);
}
/** Ferma → parte. In corsa → fatta. Fatta → torna com'era. Come in palestra. */
function tapTick(app, k, i) {
  var st = S.active.items[k].sets[i], now = Date.now(), touched = [k];
  if (st.done) { st.done = false; delete st.t0; delete st.t1; }
  else if (st.t0) finish(k, i, now);
  else {
    var r = running();
    if (r) { finish(r.k, r.i, now); if (touched.indexOf(r.k) < 0) touched.push(r.k); }
    st.t0 = now; delete st.t1;
  }
  save();
  touched.forEach(function (x) { refresh(app, x); });
  paintClock();
  runTimer(app);
  if (navigator.vibrate) navigator.vibrate(st.done ? [14, 40, 14] : st.t0 ? [14] : 8);
}
function runTimer(app) {
  clearInterval(runT); runT = null;
  if (!running()) return;
  runT = setInterval(function () {
    var r = running(), row = r && app.querySelector('.setrow[data-row="' + r.k + '|' + r.i + '"]');
    if (!r || !document.getElementById('mw') || !S.active) { clearInterval(runT); runT = null; return; }
    if (!row) return;
    var it = S.active.items[r.k], ms = Date.now() - it.sets[r.i].t0;
    row.querySelector('.tick .tt').textContent = K().clockOf(ms);
    if (it.sec) row.querySelector('.stp[data-f="reps"] .val').innerHTML = K().lcdHTML(K().secText(Math.round(ms / 10) / 100));
  }, 100);
}
function progress() {
  var tot = 0, done = 0;
  S.active.items.forEach(function (it) { it.sets.forEach(function (s) { tot++; if (s.done) done++; }); });
  var bar = document.getElementById('mwprog');
  if (bar) bar.style.width = (tot ? done / tot * 100 : 0) + '%';
  var c = document.getElementById('mwCount');
  if (c) c.textContent = done + '/' + tot;
}
/** Il quadrante in basso: da quanto ti alleni, e durante il recupero quanto ne hai fatto. */
function liveBar() {
  var old = document.querySelector('.livebar');
  if (old) old.remove();
  var d = document.createElement('div');
  d.className = 'livebar mw-live';
  d.innerHTML = '<button class="clock lcd" id="mwClock" aria-label="time"><small>time</small><span class="dg">0:00</span></button>' +
    '<div class="count" id="mwCount">0/0</div><button class="btn primary" id="mwFinish" style="flex:1">Finish</button>';
  document.body.appendChild(d);
  d.querySelector('#mwFinish').onclick = finishRun;
  paintClock();
  clearInterval(clockT);
  clockT = setInterval(paintClock, 1000);
}
function paintClock() {
  var el = document.getElementById('mwClock');
  if (!el || !S.active) { clearInterval(clockT); return; }
  var txt, lbl, from = restSince(), p = K().d2 || d2;
  if (from) {
    var past = Math.max(0, Math.floor((Date.now() - from) / 1000));
    txt = Math.floor(past / 60) + ':' + p(past % 60); lbl = 'rest'; el.classList.add('rest');
  } else {
    var ms = Date.now() - new Date(S.active.startedAt).getTime(), m = Math.floor(ms / 60000);
    txt = Math.floor(m / 60) ? Math.floor(m / 60) + ':' + p(m % 60) + ':' + p(Math.floor(ms / 1000) % 60) : m + ':' + p(Math.floor(ms / 1000) % 60);
    lbl = 'time'; el.classList.remove('rest');
  }
  el.innerHTML = '<small>' + lbl + '</small>' + K().lcdHTML(txt);
}
function endLive() {
  clearInterval(clockT); clearInterval(runT); runT = null;
  document.body.classList.remove('workout-live');
  var lb = document.querySelector('.livebar'); if (lb) lb.remove();
}
function finishRun() {
  var A = S.active, r = running(), now = Date.now(), done = 0;
  A.items.forEach(function (it) { it.sets.forEach(function (s) { if (s.done) done++; }); });
  if (r) done++;                 // «Finish» vale anche come secondo tocco della serie che corre
  if (!done) {
    H.ask('You have not ticked any set. Close and discard anyway?', 'Discard', function () {
      if (S.active !== A) return;
      S.active = null; save(); endLive(); go('#/mine');
    }, true);
    return;
  }
  H.ask('Finish the workout?\n' + done + (done === 1 ? ' ticked set goes' : ' ticked sets go') + ' into your day.', 'Finish', function () {
    if (S.active !== A) return;
    if (r) finish(r.k, r.i, now);
    A.endedAt = new Date().toISOString();
    // nel giorno va SOLO quello che hai spuntato
    A.items = A.items.map(function (it) {
      it.sets = it.sets.filter(function (s) { return s.done; }).map(function (s, i) {
        var o = { s: i + 1, kg: s.kg, reps: s.reps };
        if (s.t0) o.t0 = s.t0;
        if (s.t1) o.t1 = s.t1;
        return o;
      });
      return it;
    }).filter(function (it) { return it.sets.length; });
    S.sessions.push(A);
    S.sessions.sort(function (a, b) { return a.startedAt.localeCompare(b.startedAt); });
    S.active = null;
    if (!save()) return;
    endLive();
    go('#/mine/s/' + A.id);
    setTimeout(function () { K().toast('Workout saved'); }, 250);
  });
}

/* ============================ la seduta fatta =============================== */
function viewDone(app, sid) {
  var s = sById(sid);
  if (!s) { go('#/allenamenti'); return; }
  var a = +new Date(s.startedAt), b = +new Date(s.endedAt || s.startedAt);
  var wt = H.watchFor ? H.watchFor(a, b) : null, tl = [], ends = [];
  s.items.forEach(function (it, k) { it.sets.forEach(function (x) { if (x.t1) { tl.push({ t0: x.t0, t1: x.t1, ex: k }); ends.push(x.t1); } }); });
  var out = '<div id="mw">' + (H.sessionNav ? H.sessionNav('#/mine/s/' + s.id) : '') +
    '<h1>' + esc(s.name) + '</h1><p class="sub">My workout · ' + K().fmtDate(s.startedAt) + ' · ' + K().fmtTime(s.startedAt) + ' → ' +
    K().fmtTime(s.endedAt || s.startedAt) + (b - a >= 60000 ? ' · ' + K().fmtDur(b - a) : '') + '</p>' +
    (wt ? H.watchCard(wt) : '') + '<div class="card tlcard" data-tl></div>';
  s.items.forEach(function (it) {
    out += '<div class="card"><div class="mw-ihead"><img src="' + photo(it.img[0]) + '" alt="" loading="lazy" width="64" height="64">' +
      '<div class="tx"><b>' + esc(it.name) + '</b><small>' + esc(it.mus) + '</small></div></div><div class="dtl">' +
      it.sets.map(function (x, i) {
        return '<div class="dtlrow"><span class="sn">' + (i + 1) + '</span><span class="lcd chip v-same">' + K().lcdHTML(K().setText(x, mode(it))) + '</span>' +
          (x.t1 ? '<span class="when">' + (x.t0 && x.t0 < x.t1 ? H.hm(x.t0) + '–' : '') + H.hm(x.t1) + '</span>' : '<span></span>') + '</div>';
      }).join('') + '</div></div>';
  });
  out += '<button class="btn danger" data-act="del">Delete this session</button><button class="btn ghost" data-act="back">Back</button></div>';
  app.innerHTML = out;
  if (H.wireNav) H.wireNav(app, go);
  if (H.timeline) H.timeline(app.querySelector('[data-tl]'), { from: a - 300000, to: b + 300000, session: [a, b], sets: tl,
    watch: wt ? [wt[0] * 1000, wt[1] * 1000] : null, watchAvg: wt ? wt[6] : 0 });
  on(app, {
    back: function () { go(H.ret || '#/allenamenti'); },
    del: function () {
      H.ask('Delete ' + s.name + ' of ' + K().fmtDate(s.startedAt) + '?', 'Delete', function () {
        S.sessions = S.sessions.filter(function (x) { return x !== s; });
        save(); go(H.ret || '#/allenamenti'); K().toast('Session deleted');
      }, true);
    }
  });
}

/* ======================= dentro Sport e nei giorni ========================== */
/** Le sedute per sport.js: fatte, e quella in corso. Stessa forma della palestra. */
function sedute() {
  var out = S.sessions.map(function (s) {
    var a = +new Date(s.startedAt), b = +new Date(s.endedAt || s.startedAt);
    var w = H.watchFor ? H.watchFor(a, b) : null, n = 0;
    s.items.forEach(function (it) { n += it.sets.length; });
    return { start: a, end: b, watch: w, kind: 'gym', title: s.name,
      sub: 'my workout · ' + K().fmtTime(s.startedAt) + ' · ' + plural(s.items.length, 'exercise', 'exercises') + ' · ' + plural(n, 'set', 'sets') +
        (w ? ' · ' + H.watchText(w) : ''),
      value: b - a >= 60000 ? K().fmtDur(b - a) : '', tone: '', go: '#/mine/s/' + s.id };
  });
  if (S.active) {
    var sa = +new Date(S.active.startedAt);
    out.push({ start: sa, end: sa, live: true, kind: 'gym', title: S.active.name,
      sub: 'my workout in progress, started at ' + K().fmtTime(S.active.startedAt), value: 'resume', tone: 'live', go: '#/mine/run' });
  }
  return out;
}

H.page('mine', function (app, go_, parts) {
  var p = parts[1];
  if (p !== 'run') endLive();
  if (p === 'w') viewWorkout(app, parts[2]);
  else if (p === 'add') viewAdd(app, parts[2]);
  else if (p === 'ex') viewEx(app, parts[2], parts[3]);
  else if (p === 'run') viewRun(app);
  else if (p === 's') viewDone(app, parts[2]);
  else viewList(app);
}, 'sport');
/** «Indietro» del telefono: un passo su, dentro My workouts (app.js, SchedaBack). */
H.pages.mine.back = function (parts) {
  var p = parts[1];
  if (p === 'w' || p === 'run') return '#/mine';
  if (p === 'add') return '#/mine/w/' + parts[2];
  if (p === 'ex') return parts[3] ? '#/mine/add/' + parts[3] : '#/mine';
  if (p === 's') return H.ret || '#/allenamenti';
  return '#/home';
};
/** La seduta fatta aperta dal calendario: «indietro» ci riporta (Health.ret resta). */
H.pages.mine.keepRet = function (parts) { return parts[1] === 's' && !!parts[2]; };

H.mine = {
  sedute: sedute,
  catalog: catalog,
  KEY: KEY,
  /** Quanto c'è in un deposito (per «Ricarica da un file»). */
  counts: function (o) { return o ? plural((o.workouts || []).length, 'own workout', 'own workouts') + ' (' + plural((o.sessions || []).length, 'session', 'sessions') + ')' : ''; }
};
})();
