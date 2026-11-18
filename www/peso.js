/* ===========================================================================
 * peso.js — il peso della bilancia, letto da uno screenshot di Laica.
 *
 * Decisioni di progetto:
 *  - (08/10) il peso arriva da uno screenshot dell'app della bilancia
 *    («Laica Home Wellness», pagina «DATI PESATE»), letto SUL TELEFONO, senza
 *    nessun servizio esterno; l'utente conferma i numeri prima di salvarli.
 *  - (12/10) dopo l'indagine su Laica (nessun collegamento ufficiale, niente
 *    Health Connect, nessun file da esportare): il lettore di screenshot.
 *
 * Come legge (provato sullo screenshot vero, 12/10: 5 pesate su 5 giuste):
 * la pagina di Laica ha tre colonne fisse. Ogni colonna si ritaglia, si
 * ingrandisce, si fa bianco e nero, e la legge Tesseract (www/ocr/, copiato
 * da tesseract.js 7.0.0 + dati «eng» 4.0.0_best_int, scompattati; gira tutto nel telefono):
 *   sinistra  → data, ora, kg          (STRISCE.L)
 *   centro    → grasso, acqua, muscoli (in quest'ordine dall'alto)
 *   destra    → bmr, bmi
 * Ogni pesata comincia dalla sua data: senza data (tagliata in cima) non
 * c'è; con un numero mancante si mostra «non letta tutta» e non si salva.
 * Se Laica cambia l'aspetto della pagina il lettore non trova le date e lo
 * DICE: non salva mai qualcosa di letto a metà.
 *
 * Il controllo in più: peso e bmi danno l'altezza (kg / bmi = altezza²).
 * È la stessa in tutte le pesate di una persona: una che non torna si mostra
 * «controlla» e parte senza spunta.
 *
 * Il deposito è suo: localStorage 'health.peso.v1' = { v: 1,
 *   pesate: { 'AAAA-MM-GGTHH:MM:SS': { kg, fat, water, muscle, bmr, bmi } } }
 * La chiave è data e ora di Laica: rileggere lo stesso screenshot non
 * raddoppia niente («già salvata»). Oggi vive solo sul telefono (come le
 * sostanze): la copia di sicurezza è «Esporta tutto» (esporta.js), niente cloud.
 * ========================================================================= */
(function () {
'use strict';
var H = window.Health, esc = H.esc;
var KEY = 'health.peso.v1';
// [inizio, fine] in frazioni della larghezza, quanto si ingrandisce, come legge Tesseract
// (destra da 0.705: le icone di bmr e bmi, lette, diventano cifre in più — «1730» → «11730»).
// Modo 4 = una colonna con testo di grandezze diverse: serve a sinistra, dove col 6 il kg
// grande a volte sparisce; al centro e a destra il 4 perde i numeri e il 6 li prende tutti.
var STRISCE = { L: [0.01, 0.25, 2, '4'], M: [0.335, 0.60, 2, '6'], R: [0.705, 0.99, 2, '6'] };
var NOMI = [['fat', 'fat', '%'], ['water', 'water', '%'], ['muscle', 'muscle', '%'], ['bmr', 'bmr', ' kcal'], ['bmi', 'bmi', '']];
var LIMITI = { kg: [20, 300], fat: [1, 75], water: [20, 85], muscle: [10, 80], bmr: [500, 5000], bmi: [8, 80] };

var D = load();
function load() {
  var o = null;
  try { o = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!o || o.v !== 1 || !o.pesate || typeof o.pesate !== 'object') o = { v: 1, pesate: {} };
  return o;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(D)); return true; } catch (e) { return false; }
}
function today() { return H.ymd(new Date()); }
function num(v) { return String(v); }   // in inglese il punto (20/10)
function dayName(k) {
  var d = new Date(k + 'T12:00:00');
  return (k === today() ? 'Today, ' : '') + H.GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + H.MESI[d.getMonth()] +
    (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
}
/** Le pesate di quel giorno, la più recente prima. */
function ofDay(k) {
  return Object.keys(D.pesate).filter(function (t) { return t.slice(0, 10) === k; }).sort().reverse()
    .map(function (t) { return { t: t, v: D.pesate[t] }; });
}

/* --- nel calendario: il puntino e il riquadro ----------------------------- */
H.area({
  id: 'peso', label: 'Weight', color: 'var(--wt)', sign: 'kg',
  days: function () {
    var out = {};
    Object.keys(D.pesate).forEach(function (t) {
      var k = t.slice(0, 10);
      (out[k] = out[k] || []).push({ title: 'Weight', value: num(D.pesate[t].kg) + ' kg' });
    });
    return out;
  },
  tile: function (k) {
    var p = ofDay(k)[0];
    if (!p) return { value: '—', sub: k <= today() ? 'read a screenshot' : '', empty: true };
    return { value: num(p.v.kg) + ' kg', sub: 'fat ' + num(p.v.fat) + '% · bmi ' + num(p.v.bmi) };
  },
  // il quadratino: i kg col decimale, il decimale in piccolo; da 100 in su senza
  cell: function (k) {
    var p = ofDay(k)[0];
    if (!p || !p.v.kg) return null;
    var kg = +p.v.kg;
    var s = kg.toFixed(1).split('.');
    // il decimale più piccolo: così ci sta in un quadratino uguale agli altri tre
    return { cls: 'w', html: kg >= 100 ? String(Math.round(kg)) : s[0] + '<small>.' + s[1] + '</small>' };
  },
  open: function (k, its, go, redraw) { if (k <= today()) day(k, redraw); }
});

/* --- la finestrella di un giorno ------------------------------------------- */
function valori(v) {
  return '<div class="pvals">' + NOMI.map(function (n) {
    return '<span><small>' + n[1] + '</small><b>' + esc(num(v[n[0]])) + esc(n[2]) + '</b></span>';
  }).join('') + '</div>';
}
function day(k, redraw) {
  function draw(box) {
    var list = ofDay(k);
    var html = '<div class="kick">Weight</div><h2 class="pop-t">' + esc(dayName(k)) + '</h2>';
    if (!list.length) html += '<p class="sub">No weigh-ins on this day.</p>';
    list.forEach(function (p) {
      html += '<div class="card pcard"><div class="prow"><span class="pt">at ' + esc(p.t.slice(11, 16)) + '</span>' +
        '<b class="pkg">' + esc(num(p.v.kg)) + ' kg</b><button class="lnk" data-rm="' + esc(p.t) + '">Remove</button></div>' +
        valori(p.v) + '</div>';
    });
    html += pickButton() +
      '<p class="sub phelp">In Laica open «Dati pesate», take a screenshot and pick it here: every weigh-in you can see comes in.</p>';
    box.innerHTML = '<div class="grip"></div>' + html;
    box.querySelectorAll('[data-rm]').forEach(function (b) {
      b.onclick = function () {
        var t = b.dataset.rm;
        // la domanda prende il posto della finestrella del giorno: dopo il sì il giorno si riapre
        H.ask('Remove the weigh-in at ' + t.slice(11, 16) + '?', 'Remove', function () {
          delete D.pesate[t]; save();
          if (redraw) redraw();
          day(k, redraw);
        }, true);
      };
    });
    wirePick(box, redraw);
  }
  H.pop('', draw);
}

function pickButton() {
  return '<label class="filelabel" for="pesofile">Read a Laica screenshot</label>' +
    '<input type="file" id="pesofile" accept="image/*">';
}
function wirePick(box, redraw) {
  var inp = box.querySelector('#pesofile');
  inp.onchange = function () { var f = inp.files && inp.files[0]; if (f) read(f, redraw); };
}

/* --- leggere lo screenshot ------------------------------------------------- */
function read(file, redraw) {
  H.pop('<div class="kick">Weight</div><h2 class="pop-t">Reading the screenshot…</h2>' +
    '<p class="sub">A few seconds: everything stays on the phone.</p>');
  leggi(file).then(function (found) { confirmView(found, redraw); }, function (err) {
    H.pop('<div class="kick">Weight</div><h2 class="pop-t">The reader did not start</h2>' +
      '<p class="sub">' + esc(String(err && err.message || err)) + '</p>' +
      '<div class="row pop-act"><button class="btn ghost" data-popclose2>Close</button></div>', function (box) {
      box.querySelector('[data-popclose2]').onclick = H.popClose;
    });
  });
}

var engineJs = null;
/** Carica tesseract.min.js solo la prima volta che serve (l'avvio dell'app resta leggero). */
function engine() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (engineJs) return engineJs;
  engineJs = new Promise(function (ok, ko) {
    var s = document.createElement('script');
    s.src = 'ocr/tesseract.min.js';
    s.onload = function () { window.Tesseract ? ok(window.Tesseract) : ko(new Error('reader missing (ocr/tesseract.min.js)')); };
    s.onerror = function () { engineJs = null; ko(new Error('reader missing (ocr/tesseract.min.js)')); };
    document.head.appendChild(s);
  });
  return engineJs;
}
/** Il telefono sa fare SIMD in WebAssembly? (gli stessi byte di wasm-feature-detect) Sì → il motore veloce. */
function simd() {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
      10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch (e) { return false; }
}
function abs(p) { return new URL(p, location.href).href; }

function picture(file) {
  return new Promise(function (ok, ko) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); ok(img); };
    img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('this file is not an image')); };
    img.src = url;
  });
}
/** Una striscia verticale dell'immagine, ingrandita e in bianco e nero (il testo azzurro diventa nero). */
function strip(img, a, b, s) {
  var x0 = Math.round(a * img.width), x1 = Math.round(b * img.width);
  var c = document.createElement('canvas');
  c.width = Math.round((x1 - x0) * s); c.height = Math.round(img.height * s);
  var g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, x0, 0, x1 - x0, img.height, 0, 0, c.width, c.height);
  var im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  for (var i = 0; i < d.length; i += 4) {
    var v = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2] < 190 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  g.putImageData(im, 0, 0);
  return c;
}

/** Il file → { list: [pesata…], trovate: n }. Ogni pesata: { t, v, stato, perche }. */
function leggi(file) {
  var T, w, img;
  return engine().then(function (t) { T = t; return picture(file); }).then(function (i) {
    img = i;
    return T.createWorker('eng', 1, {
      workerPath: abs('ocr/worker.min.js'),
      corePath: abs('ocr/core/' + (simd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js')),
      // i dati NON compressi: il pacchetto Android toglie da solo il «.gz» ai file (visto nell'APK
      // 0.5.0, 12/10), e il lettore chiederebbe un file che non c'è più
      langPath: abs('ocr/lang'), gzip: false, cacheMethod: 'none'
    });
  }).then(function (wk) {
    w = wk;
    var cols = {}, chain = Promise.resolve();
    Object.keys(STRISCE).forEach(function (k) {
      chain = chain.then(function () {
        var st = STRISCE[k];
        // dpi dichiarati: senza, Tesseract li stima e lo scrive come errore in console
        return w.setParameters({ tessedit_pageseg_mode: st[3], user_defined_dpi: '300' }).then(function () {
          return w.recognize(strip(img, st[0], st[1], st[2]), {}, { blocks: true }).then(function (r) {
            cols[k] = words(r.data, st[2]);
          });
        });
      });
    });
    return chain.then(function () { return cols; });
  }).then(function (cols) {
    w.terminate();
    return judge(parse(cols, img.height));
  }, function (err) { if (w) w.terminate(); throw err; });
}
function words(data, s) {
  var out = [];
  (data.blocks || []).forEach(function (b) { b.paragraphs.forEach(function (p) { p.lines.forEach(function (l) {
    l.words.forEach(function (x) { out.push({ t: x.text.trim(), y: x.bbox.y0 / s, h: (x.bbox.y1 - x.bbox.y0) / s }); });
  }); }); });
  return out;
}
/** «20.9.» «57,74%» → 20.9 / 57.74; non è un numero → null. */
function clean(t) {
  var m = /^(\d{1,4}(?:[.,]\d{1,2})?)[.%]*$/.exec(t);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}
var R_DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/, R_ORA = /^(\d{2}):(\d{2}):(\d{2})$/;

/** Le parole delle tre colonne → le pesate, ognuna a partire dalla sua data. */
function parse(cols, height) {
  var dates = cols.L.filter(function (x) { return R_DATA.test(x.t); }).sort(function (a, b) { return a.y - b.y; });
  return dates.map(function (dt, i) {
    var pitch = (dates[i + 1] ? dates[i + 1].y : (dates[i - 1] ? dt.y + (dt.y - dates[i - 1].y) : height)) - dt.y;
    var top = dt.y - 0.15 * pitch, bot = dt.y + 0.85 * pitch;
    function inside(x) { return x.y >= top && x.y < bot; }
    function nums(list) {
      var n = list.filter(inside).map(function (x) { return { v: clean(x.t), y: x.y, h: x.h }; })
        .filter(function (x) { return x.v !== null; });
      // i numeri veri sono alti uguali; un'etichetta fusa col numero lo fa sembrare più alto,
      // quindi si misura sulla mediana (non sul più alto) e si scartano solo i piccoli
      var hs = n.map(function (x) { return x.h; }).sort(function (a, b) { return a - b; });
      var mid = hs.length ? hs[Math.floor(hs.length / 2)] : 0;
      return n.filter(function (x) { return x.h >= 0.6 * mid; }).sort(function (a, b) { return a.y - b.y; });
    }
    var d = R_DATA.exec(dt.t), ora = null;
    cols.L.filter(inside).forEach(function (x) { if (!ora && R_ORA.test(x.t)) ora = x.t; });
    var kg = cols.L.filter(inside).filter(function (x) { return /^\d{2,3}[.,]\d{1,2}$/.test(x.t); })
      .sort(function (a, b) { return b.h - a.h; })[0];
    if (kg) kg = { v: clean(kg.t) };
    var mid = nums(cols.M), right = nums(cols.R);
    var v = { kg: kg ? kg.v : null };
    v.fat = mid[0] ? mid[0].v : null; v.water = mid[1] ? mid[1].v : null; v.muscle = mid[2] ? mid[2].v : null;
    v.bmr = right[0] ? right[0].v : null; v.bmi = right[1] ? right[1].v : null;
    return { t: d[3] + '-' + d[2] + '-' + d[1] + 'T' + (ora || '??:??:??'), ora: !!ora, v: v };
  });
}
/** Ogni pesata: nuova / già salvata / da controllare / non letta tutta. */
function judge(list) {
  var heights = [];
  list.forEach(function (p) {
    var miss = !p.ora || Object.keys(LIMITI).some(function (k) { return p.v[k] === null; });
    var day = new Date(p.t.slice(0, 10) + 'T12:00:00');
    var badDate = isNaN(day) || H.ymd(day) !== p.t.slice(0, 10) || p.t.slice(0, 10) > today();
    if (miss || badDate) { p.stato = 'incompleta'; p.perche = badDate ? 'date not read' : 'not fully read'; return; }
    var out = Object.keys(LIMITI).filter(function (k) { return p.v[k] < LIMITI[k][0] || p.v[k] > LIMITI[k][1]; });
    if (out.length) { p.stato = 'dubbio'; p.perche = 'check ' + out.join(', '); return; }
    p.alt = Math.sqrt(p.v.kg / p.v.bmi);
    heights.push(p.alt);
    p.stato = 'nuova';
  });
  heights.sort(function (a, b) { return a - b; });
  var med = heights.length ? heights[Math.floor(heights.length / 2)] : 0;
  list.forEach(function (p) {
    if (p.stato === 'nuova' && heights.length >= 2 && Math.abs(p.alt - med) / med > 0.02) {
      p.stato = 'dubbio'; p.perche = 'weight and bmi do not match: check with Laica';
    }
    var old = D.pesate[p.t];
    if (p.stato === 'nuova' && old) {
      p.stato = 'gia';
      p.perche = Object.keys(LIMITI).every(function (k) { return old[k] === p.v[k]; }) ? 'already saved' : 'already saved, with different numbers: the earlier one stays';
    }
  });
  return { list: list.sort(function (a, b) { return a.t < b.t ? 1 : -1; }) };
}

/* --- la conferma: l'utente guarda i numeri, poi salva --------------------------- */
function confirmView(found, redraw) {
  var list = found.list;
  var sel = {};
  list.forEach(function (p) { if (p.stato === 'nuova') sel[p.t] = true; });
  function draw(box) {
    var n = Object.keys(sel).length;
    var html = '<div class="kick">Weight · from the screenshot</div>';
    if (!list.length) {
      html += '<h2 class="pop-t">No weigh-ins found</h2><p class="sub">It needs a screenshot of Laica\'s «Dati pesate» page.</p>' +
        '<div class="row pop-act"><button class="btn ghost" data-cancel>Close</button></div>';
    } else {
      html += '<h2 class="pop-t">Check the numbers against Laica</h2><div class="plist">';
      list.forEach(function (p) {
        var can = p.stato === 'nuova' || p.stato === 'dubbio', on = !!sel[p.t];
        var d = p.t.slice(0, 10);
        html += '<button class="sbt pbt' + (on ? ' on' : '') + (can ? '' : ' off') + '" data-t="' + esc(p.t) + '"' +
          (can ? '' : ' disabled') + ' aria-pressed="' + on + '">' +
          '<span class="c">' + (on ? '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '') + '</span>' +
          '<span class="pt">' + esc(dayName(d)) + (p.ora ? ' · ' + esc(p.t.slice(11, 16)) : '') + '</span>' +
          '<b class="pkg">' + (p.v.kg !== null ? esc(num(p.v.kg)) + ' kg' : '—') + '</b>' +
          (p.stato === 'incompleta' ? '' : valori(p.v)) +
          (p.perche ? '<small class="pwhy' + (p.stato === 'dubbio' ? ' warn' : '') + '">' + esc(p.perche) + '</small>' : '') +
          '</button>';
      });
      html += '</div><div class="row pop-act"><button class="btn ghost" data-cancel>Cancel</button>' +
        '<button class="btn primary" data-ok' + (n ? '' : ' disabled') + '>' + (n ? 'Save ' + n : 'Nothing new') + '</button></div>';
    }
    box.innerHTML = '<div class="grip"></div>' + html;
    box.querySelector('[data-cancel]').onclick = H.popClose;
    box.querySelectorAll('[data-t]').forEach(function (b) {
      b.onclick = function () { if (sel[b.dataset.t]) delete sel[b.dataset.t]; else sel[b.dataset.t] = true; draw(box); };
    });
    var okb = box.querySelector('[data-ok]');
    if (okb) okb.onclick = function () {
      var keys = Object.keys(sel).sort();
      keys.forEach(function (t) {
        var p = list.filter(function (x) { return x.t === t; })[0], v = {};
        Object.keys(LIMITI).forEach(function (k) { v[k] = p.v[k]; });
        D.pesate[t] = v;
      });
      if (!save()) { H.say('Phone storage full: weigh-ins NOT saved.'); return; }
      H.popClose();
      if (keys.length) H.pick(keys[keys.length - 1].slice(0, 10));
      if (redraw) redraw();
    };
  }
  H.pop('', draw);
}

})();
