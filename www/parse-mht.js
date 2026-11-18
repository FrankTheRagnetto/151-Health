/* ---------------------------------------------------------------------------
 * parse-mht.js — legge una "Scheda allenamento" EvolutionFit salvata dal
 * browser come .mht (vista "2 Posizioni") e ne ricava un piano strutturato.
 *
 * FONTE UNICA: questo stesso file è usato
 *   - dall'app nel browser (bottone "Cambia scheda")
 *   - da tools/build-plan.js sotto node, per generare plan.json
 * Se il parser cambia, cambia in un posto solo.
 *
 * Non dipende dal DOM: usa una mini-estrazione a regex, così gira identico
 * in node e nel browser. (DOMParser non esiste in node senza dipendenze.)
 *
 * ⚠ I .mht salvati da Chrome/Brave scrivono le immagini con
 *   `Content-Transfer-Encoding: binary`, cioè BYTE GREZZI dentro il file —
 *   non base64. Per questo l'ingresso è un ArrayBuffer e non una stringa:
 *   leggerlo come testo distruggerebbe i PNG. Il boundary e le intestazioni
 *   restano ASCII, quindi li cerchiamo su una stringa "un byte = un char"
 *   (latin1 fatta a mano, non TextDecoder: 'latin1' in TextDecoder è
 *   windows-1252 e NON conserva i byte 0x80–0x9F).
 * ------------------------------------------------------------------------- */
(function (root) {
  'use strict';

  // --- byte ↔ stringa (senza perdere un solo byte) -------------------------

  function toU8(input) {
    if (input instanceof Uint8Array) return input;
    if (typeof ArrayBuffer !== 'undefined' && input instanceof ArrayBuffer) return new Uint8Array(input);
    if (input && input.buffer) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    throw new Error('parseMht wants an ArrayBuffer (read the file with readAsArrayBuffer).');
  }

  /** byte → stringa in cui charCodeAt(i) === byte[i]. Nessuna codifica di mezzo. */
  function bytesToLatin1(u8) {
    var CH = 0x8000, out = '';
    for (var i = 0; i < u8.length; i += CH) {
      out += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CH, u8.length)));
    }
    return out;
  }

  function latin1ToBytes(s) {
    var u8 = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i) & 0xff;
    return u8;
  }

  function utf8Decode(u8) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u8);
    return Buffer.from(u8).toString('utf8');           // node senza TextDecoder
  }

  function b64ToBytes(b64) {
    var clean = b64.replace(/\s+/g, '');
    if (typeof atob === 'function') return latin1ToBytes(atob(clean));
    return new Uint8Array(Buffer.from(clean, 'base64'));
  }

  // --- utilità -------------------------------------------------------------

  function decodeEntities(s) {
    return String(s)
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); });
  }

  function stripTags(s) {
    return decodeEntities(String(s).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
  }

  /**
   * Divide un .mht nelle sue parti MIME.
   * Ingresso: ArrayBuffer / Uint8Array.
   * Uscita:  { html: string(UTF-8), images: { nome: {type, bytes:Uint8Array} } }
   */
  function splitMht(input) {
    var u8 = toU8(input);
    var bin = bytesToLatin1(u8);                 // un byte = un char: gli offset combaciano

    var bm = bin.match(/boundary="([^"]+)"/);
    if (!bm) throw new Error('Not a valid .mht file (the MIME boundary is missing).');
    var marker = '--' + bm[1];

    var out = { html: null, images: {} };
    var idx = bin.indexOf(marker);
    while (idx >= 0) {
      var start = idx + marker.length;
      var next = bin.indexOf(marker, start);
      var chunk = bin.slice(start, next < 0 ? bin.length : next);

      var ct = chunk.match(/Content-Type:\s*([^\r\n;]+)/i);
      var sep = chunk.indexOf('\r\n\r\n'), seplen = 4;
      if (sep < 0) { sep = chunk.indexOf('\n\n'); seplen = 2; }

      if (ct && sep >= 0) {
        var type = ct[1].trim().toLowerCase();
        var bodyFrom = start + sep + seplen;
        var bodyTo = next < 0 ? bin.length : next;
        // le righe finali prima del boundary sono CRLF di servizio, non contenuto
        while (bodyTo > bodyFrom && (bin.charCodeAt(bodyTo - 1) === 10 || bin.charCodeAt(bodyTo - 1) === 13)) bodyTo--;

        var enc = (chunk.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i) || [, 'binary'])[1].trim().toLowerCase();
        var bodyBytes;
        if (enc.indexOf('base64') >= 0) bodyBytes = b64ToBytes(bin.slice(bodyFrom, bodyTo));
        else bodyBytes = u8.subarray(bodyFrom, bodyTo);

        if (type === 'text/html' && !out.html) {
          out.html = utf8Decode(bodyBytes);
        } else if (type.indexOf('image/') === 0) {
          var loc = chunk.match(/Content-Location:\s*([^\r\n]+)/i);
          if (loc) {
            var fm = loc[1].match(/file=([^&\s]+)/);
            var name = fm ? decodeEntities(fm[1]) : loc[1].split('?')[0].split('/').pop();
            out.images[name] = { type: type, bytes: bodyBytes };
          }
        }
      }
      idx = next;
    }
    if (!out.html) throw new Error('The .mht file has no HTML part.');
    return out;
  }

  /** {type,bytes} → data:URL, per metterla in <img src> o salvarla. */
  function imageToDataUrl(img) {
    var b64;
    if (typeof btoa === 'function') b64 = btoa(bytesToLatin1(img.bytes));
    else b64 = Buffer.from(img.bytes).toString('base64');
    return 'data:' + img.type + ';base64,' + b64;
  }

  // --- lettura delle serie prescritte --------------------------------------

  /**
   * Da "5-5-5-3-3-3 FERMO 2 SECONDI" / "4 x 8" / "3 X 30 SECONDI (OBIETTIVO …)"
   * ricava quante serie sono e il bersaglio di ciascuna.
   * Ritorna { count, targets:[string], kind:'reps'|'time', goal, extra }
   */
  function parseSpec(spec) {
    var raw = String(spec || '').trim();
    var goal = '';
    // "(OBIETTIVO 5X8)" → messo da parte, non è la prescrizione di oggi
    var g = raw.match(/\(\s*obiettivo([^)]*)\)/i);
    if (g) { goal = g[1].trim(); raw = raw.replace(g[0], ' ').trim(); }

    var kind = /sec|min|'|"/i.test(raw) ? 'time' : 'reps';

    // forma A: "N x <bersaglio>"  →  N serie uguali
    var mA = raw.match(/^\s*(\d+)\s*[x×]\s*(.+)$/i);
    if (mA) {
      var n = parseInt(mA[1], 10);
      var rest = mA[2].trim();
      // "3 X 1 min. 1.15 min. 1.30 min." → tre bersagli diversi, uno per serie
      var multi = rest.match(/(\d+(?:[.,]\d+)?\s*(?:min|sec|s|")\.?)/gi);
      if (kind === 'time' && multi && multi.length === n) {
        return { count: n, targets: multi.map(function (t) { return t.trim(); }), kind: kind, goal: goal, extra: '' };
      }
      var t = [];
      for (var k = 0; k < n; k++) t.push(rest);
      return { count: n, targets: t, kind: kind, goal: goal, extra: '' };
    }

    // forma B: "10-10-8-8" oppure "5-5-5-3-3-3 FERMO 2 SECONDI"
    var mB = raw.match(/^\s*(\d+(?:\s*-\s*\d+)+)\s*(.*)$/);
    if (mB) {
      var reps = mB[1].split('-').map(function (x) { return x.trim(); });
      return { count: reps.length, targets: reps, kind: 'reps', goal: goal, extra: mB[2].trim() };
    }

    // non riconosciuto → una serie sola, bersaglio testuale
    return { count: 1, targets: [raw], kind: kind, goal: goal, extra: '' };
  }

  // --- lettura della testata ------------------------------------------------

  function parseHeader(html) {
    var head = { club: '', athlete: '', program: '', level: '', sessions: '', duration: '', expiry: '', instructor: '', logo: '' };
    var t = html.match(/class="testata"[\s\S]*?(?=class="riga(?:1pos|Tab|Mappa)")/);
    if (!t) return head;
    var block = t[0];

    // il logo del club, se c'è: stesso nome che splitMht dà alla sua immagine
    var lg = block.match(/<img[^>]*src="([^"]+)"/);
    if (lg) {
      var src = decodeEntities(lg[1]), fm = src.match(/file=([^&\s]+)/);
      head.logo = fm ? fm[1] : src.split('?')[0].split('/').pop();
    }

    // il nome del club è il primo div in maiuscolo della testata
    var cells = (block.match(/>[^<>]+</g) || [])
      .map(function (s) { return stripTags(s.slice(1, -1)); })
      .filter(function (s) { return s.length > 0; });

    if (cells.length) head.club = cells[0];

    function after(label) {
      for (var i = 0; i < cells.length; i++) {
        if (cells[i].toLowerCase().replace(/\s*:\s*$/, '') === label) return cells[i + 1] || '';
      }
      return '';
    }
    head.sessions = after('sedute');
    head.duration = after('durata');
    head.expiry = after('scadenza');
    head.instructor = after('istruttore');

    // atleta / programma / livello: le righe prima di "Sedute :"
    var stop = cells.findIndex(function (c) { return /^sedute\s*:?$/i.test(c); });
    var pre = cells.slice(1, stop < 0 ? cells.length : stop);
    head.athlete = pre[0] || '';
    head.program = pre[1] || '';
    head.level = pre[2] || pre[1] || '';
    return head;
  }

  // --- lettura degli esercizi ----------------------------------------------

  function parseMht(input) {
    var mht = splitMht(input);
    var html = mht.html;
    var plan = parseHeader(html);
    plan.days = [];
    plan.importedAt = new Date().toISOString();

    if (html.indexOf('cella2pos') < 0) {
      throw new Error('This is not the "2 Posizioni" view. On the website click "2 Posizioni" and then save the page.');
    }

    // ogni .riga1pos porta l'etichetta del giorno + un pugno di celle esercizio
    var rows = html.split(/<div class="riga1pos"/).slice(1);
    var currentDay = null;

    rows.forEach(function (row) {
      var lab = row.match(/class="seduta1pos"[^>]*>([\s\S]*?)<\/div>/);
      var label = lab ? stripTags(lab[1]) : '';
      if (label && (!currentDay || currentDay.label !== label)) {
        currentDay = { n: plan.days.length + 1, label: label, exercises: [] };
        plan.days.push(currentDay);
      }
      if (!currentDay) return;

      var cells = row.split(/<div class="cella2pos"/).slice(1);
      cells.forEach(function (cell) {
        var imgs = [];
        var re = /<img[^>]*file=([^&"\s]+)/g, m;
        while ((m = re.exec(cell)) !== null) imgs.push(decodeEntities(m[1]));

        // il blocco testo: quattro div consecutivi (titolo, nome, rec, serie)
        var divs = (cell.match(/<div[^>]*>([^<]*)<\/div>/g) || [])
          .map(function (d) { return stripTags(d); });
        var titleIdx = divs.findIndex(function (d) { return /^\d+\s*-\s*\S/.test(d); });
        if (titleIdx < 0) return;

        var title = divs[titleIdx];
        var mt = title.match(/^(\d+)\s*-\s*(.*)$/);
        var name = (divs[titleIdx + 1] || '').trim();
        var rest = (divs[titleIdx + 2] || '').replace(/^Rec\.\s*:\s*/i, '').trim();
        var spec = (divs[titleIdx + 3] || '').trim();
        var note = '';
        for (var j = titleIdx + 4; j < divs.length; j++) {
          if (divs[j]) { note = divs[j].trim(); break; }
        }
        if (!name) return;

        var s = parseSpec(spec);
        currentDay.exercises.push({
          i: mt ? parseInt(mt[1], 10) : currentDay.exercises.length + 1,
          muscle: mt ? mt[2].trim() : '',
          name: name,
          rest: rest,
          spec: spec,
          note: note,
          goal: s.goal,
          sets: s.count,
          targets: s.targets,
          kind: s.kind,
          imgA: imgs[0] || '',
          imgB: imgs[1] || ''
        });
      });
    });

    plan.days = plan.days.filter(function (d) { return d.exercises.length > 0; });
    plan.days.forEach(function (d, i) { d.n = i + 1; });
    if (!plan.days.length) throw new Error('I found no exercises in this file.');

    return { plan: plan, images: mht.images };
  }

  var api = {
    parseMht: parseMht, parseSpec: parseSpec, splitMht: splitMht,
    imageToDataUrl: imageToDataUrl
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SchedaParser = api;
})(typeof self !== 'undefined' ? self : this);
