/* ===========================================================================
 * sonno.js — il sonno, dall'orologio (Zepp), dal 2022.
 *
 * I dati arrivano già pronti dal PC (tools/import-passato.py → data/storia.json):
 *   sleep['AAAA-MM-GG'] = [inizio_s, fine_s, profondo, leggero, rem, sveglio,
 *                          punteggio, battito_riposo, [m0, m1, fase, …]]
 * La data è il giorno del RISVEGLIO: la notte fra domenica e lunedì 6 sta il 6.
 * Le fasi: minuti dalla mezzanotte del giorno PRIMA (25:06 = l'01:06 del
 * giorno), estremi compresi; 4 leggero, 5 profondo, 8 REM, 7 sveglio.
 *
 * Nel calendario: le ore dormite, verdi o rosse secondo il punteggio. La pagina
 * (#/sonno/AAAA-MM-GG, senza data = l'ultima notte): durata e punteggio
 * grandi, l'ipnogramma, le quattro fasi, le ultime 7 notti (un tocco le apre).
 * ========================================================================= */
(function () {
'use strict';
var H = window.Health, d2 = H.d2, esc = H.esc;

function hm(min) { return Math.floor(min / 60) + 'h' + d2(min % 60); }
function dur(min) { return min >= 60 ? hm(min) : min + ' min'; }
function clock(ts) { var d = new Date(ts * 1000); return d2(d.getHours()) + ':' + d2(d.getMinutes()); }
function nights() { return Object.keys(H.storia.sleep).sort(); }
function row(k) {
  var r = H.storia.sleep[k];
  return r && { start: r[0], end: r[1], deep: r[2], light: r[3], rem: r[4], awake: r[5],
                score: r[6], rhr: r[7], st: r[8] || [], total: r[2] + r[3] + r[4] };
}

H.area({
  id: 'sonno', label: 'Sleep', color: 'var(--sleep)', sign: 'S',
  // il quadratino: le ore dormite; verde da 80 di punteggio, rosso sotto 60 (scelta /apps, 13/10)
  cell: function (k) {
    var r = row(k);
    if (!r) return null;
    var h = Math.floor(r.total / 60), txt = h >= 10 ? h + 'h' : h + ':' + d2(r.total % 60);
    return { cls: 's' + (r.score >= 80 ? ' g' : r.score && r.score < 60 ? ' r' : ''), html: txt };
  },
  tile: function (k) {
    var r = row(k);
    if (!r) return { value: '—', sub: 'no data', empty: true };
    return { value: hm(r.total), sub: (r.score ? 'score ' + r.score + ' · ' : '') + clock(r.start) + ' → ' + clock(r.end) };
  },
  days: function () {
    var out = {};
    Object.keys(H.storia.sleep).forEach(function (k) {
      var r = row(k);
      out[k] = [{ title: 'Sleep', sub: clock(r.start) + ' → ' + clock(r.end) + ' · deep ' + dur(r.deep),
                  value: hm(r.total), go: '#/sonno/' + k }];
    });
    return out;
  }
});

/** L'ipnogramma: una riga per fase (sveglio in alto, profondo in basso). */
function hypno(r) {
  var Y = { 7: 0, 8: 22, 4: 44, 5: 66 };
  var C = { 7: 'var(--down)', 8: 'var(--sleep)', 4: 'rgba(139,124,246,.45)', 5: '#5b4bd1' };
  var st = r.st;
  if (!st.length) return '<p class="sub">No sleep stages for this night.</p>';
  var a = st[0], b = st[st.length - 2] + 1, span = Math.max(1, b - a), out = '';
  for (var i = 0; i < st.length; i += 3) {
    var m = st[i + 2]; if (Y[m] == null) continue;
    out += '<i style="left:' + ((st[i] - a) / span * 100).toFixed(2) + '%;width:' +
      Math.max(0.4, (st[i + 1] + 1 - st[i]) / span * 100).toFixed(2) + '%;top:' + Y[m] + 'px;background:' + C[m] + '"></i>';
  }
  var mid = Math.round((a + b) / 2), mm = mid % 1440;
  return '<div class="hyp">' + out + '</div><div class="hyp-t"><span>' + clock(r.start) + '</span>' +
    '<span>' + d2(Math.floor(mm / 60)) + ':' + d2(mm % 60) + '</span><span>' + clock(r.end) + '</span></div>';
}

H.page('sonno', function (app, go, parts) {
  var all = nights();
  if (!all.length) {
    app.innerHTML = '<h1>Sleep</h1><div class="empty">No nights yet.<br>' +
      'The watch\'s past comes with the history file.</div>';
    return;
  }
  var k = parts[1] && H.storia.sleep[parts[1]] ? parts[1] : all[all.length - 1];
  var r = row(k), i = all.indexOf(k);
  var dd = new Date(k + 'T12:00:00'), prev = new Date(dd); prev.setDate(dd.getDate() - 1);
  var out = '<div class="kick">Sleep · night from ' + H.GIORNI[prev.getDay()] + ' to ' + H.GIORNI[dd.getDay()] + ' ' +
    dd.getDate() + ' ' + H.MESI[dd.getMonth()] + (dd.getFullYear() !== new Date().getFullYear() ? ' ' + dd.getFullYear() : '') + '</div>' +
    '<div class="sl-top"><div class="big">' + Math.floor(r.total / 60) + '<small>h</small>' + d2(r.total % 60) + '</div>' +
    (r.score ? '<div class="sl-score"><span>score</span><b>' + r.score + '</b></div>' : '') + '</div>' +
    '<p class="sub">' + clock(r.start) + ' → ' + clock(r.end) + (r.rhr ? ' · resting heart rate ' + r.rhr : '') + '</p>' +
    '<div class="card">' + hypno(r) +
      '<div class="phases"><div><b>' + dur(r.deep) + '</b>deep</div><div><b>' + dur(r.light) + '</b>light</div>' +
      '<div><b>' + dur(r.rem) + '</b>REM</div><div><b class="v-down">' + dur(r.awake) + '</b>awake</div></div></div>' +
    '<div class="row sl-nav"><button class="btn small ghost" data-to="' + (all[i - 1] || '') + '"' + (i ? '' : ' disabled') + '>‹ previous night</button>' +
      '<button class="btn small ghost" data-to="' + (all[i + 1] || '') + '"' + (all[i + 1] ? '' : ' disabled') + '>next night ›</button></div>' +
    '<h2>Last 7 nights</h2><div class="card"><div class="bars">';
  all.slice(Math.max(0, i - 6), i + 1).forEach(function (n) {
    var x = row(n), nd = new Date(n + 'T12:00:00');
    out += '<button class="' + (n === k ? 'on' : '') + '" data-to="' + n + '"><i style="height:' +
      Math.round(8 + Math.max(0, Math.min(1, (x.total - 240) / 360)) * 62) + 'px"></i>' +
      H.GIORNI[nd.getDay()].charAt(0).toUpperCase() + ' ' + nd.getDate() + '<small>' + hm(x.total) + '</small></button>';
  });
  out += '</div></div><p class="sub">from the watch · ' + all.length + ' nights since ' +
    new Date(all[0] + 'T12:00:00').getFullYear() + '</p>';
  app.innerHTML = out;
  app.querySelectorAll('[data-to]').forEach(function (b) {
    b.onclick = function () { if (b.dataset.to) go('#/sonno/' + b.dataset.to); };
  });
});

})();
