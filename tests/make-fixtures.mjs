/* ---------------------------------------------------------------------------
 * make-fixtures.mjs — the SYNTHETIC gym plan used by the tests.
 *
 *     node tests/make-fixtures.mjs [out-dir]      (default: tests/fixtures)
 *
 * Writes, all invented on the spot (no real person, gym or link):
 *   scheda-2-posizioni.mht   a plan saved as .mht, "2 Posizioni" view, with
 *                            binary PNG parts, exactly the shape that
 *                            www/parse-mht.js reads (and its quirks: a day
 *                            label only on the first row, "&nbsp;" rows that
 *                            continue it, notes, "(OBIETTIVO …)", a lower-case
 *                            "-b.png", a club logo in the header)
 *   scheda-1-posizione.mht   the same plan in the "1 Posizione" view, which
 *                            the app must refuse
 *   plan.json + img/         what tools/build-plan.cjs would make from the
 *                            first file (same parser, run here in a vm)
 *
 * The images are placeholder PNGs drawn here: a coloured block per exercise,
 * one pose for A and another for B.
 * ------------------------------------------------------------------------- */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

export const HEADER = {
  club: 'DEMO FITNESS CLUB',
  athlete: 'ALEX SAMPLE',
  program: 'PREPARAZIONE ATLETICA',
  level: 'PREPARAZIONE ATLETICA&nbsp;-&nbsp;AVANZATO',
  sessions: '3',
  duration: '8 settimane',
  expiry: 'Lunedì 1 Marzo 2027',
  instructor: 'Sam Example',
};

// [muscle, name, rest, spec, note, image stem]
export const DAYS = [
  ['Giorno 1', [
    ['Addominali', 'CRUNCH INVERSO ALLA SBARRA', '01.0', '3 x 30 secondi', '', 'ABS-HANGING-RAISE'],
    ['Full Body', 'BACK SQUAT', '02.30', '5-5-5-3-3-3 FERMO 2 SECONDI', '70%75%80%85%85%85%', 'LEGS-BACK-SQUAT'],
    ['Glutei', 'BRIDGE ALLA HIP DRIVE A CARICO LIBERO', '02.0', '4 x 8', '', 'GLUTES-HIP-BRIDGE'],
    ['Dorsali', 'HYPEREXTENSION', '01.30', '3 x 15', '', 'BACK-HYPEREXTENSION'],
    ['Dorsali', 'TRAZIONI PRESA INVERSA ALLA SBARRA', '02.0', '5 X 4 (OBIETTIVO 5X8)', '', 'BACK-CHINUP'],
    ['Bicipiti', 'CURL IN PIEDI BILANCIERE', '02.0', '8-8-6-6', '', 'BICEPS-BARBELL-CURL'],
    ['Bicipiti', 'CURL SEDUTO 2 MANUBRI', '01.30', '10-10-8-8', 'PANCA 60 GRADI', 'BICEPS-SEATED-CURL'],
  ]],
  ['Giorno 2', [
    ['Stretching', 'STRETCHING DORSO IN SOSPENSIONE', '01.0', '3 X 30 SECONDI (OBIETTIVO 3 X 1 MINUTO)', '', 'STRETCH-DEAD-HANG'],
    ['Addominali', 'PLANK SU RIALZO CON FITBALL', '01.0', '3 X 1 min. 1.15 min. 1.30 min.', 'GHD', 'ABS-BALL-PLANK'],
    ['Pettorali', 'DISTENSIONI PANCA INCLINATA BILANCIERE', '02.30', '8-8-6-6-4', '', 'CHEST-INCLINE-PRESS'],
    ['Pettorali', 'DISTENSIONI PANCA PIANA 2 MANUBRI', '02.0', '8-8-6-6', '', 'CHEST-DUMBBELL-PRESS'],
    ['Pettorali', 'DIP ALLE PARALLELE', '02.0', '4 X 5 (OBIETTIVO 4X8)', '', 'CHEST-DIPS'],
    ['Spalle', 'LENTO SEDUTO 2 MANUBRI', '02.0', '10-10-8-8', '', 'SHOULDERS-SEATED-PRESS'],
    ['Spalle', 'VOLARE SEDUTO 2 MANUBRI', '02.0', '10-10-8-8', '', 'SHOULDERS-LATERAL-RAISE', 'b'],
  ]],
  ['Giorno 3', [
    ['Addominali', 'SIT-UP PANCA ROMANA', '01.0', '3 X 30 SECONDI', 'GHD', 'ABS-ROMAN-CHAIR'],
    ['Dorsali', 'STACCHI DA TERRA BILANCIERE', '03.0', '5-5-5-3-3-3 FERMO 2 SECONDI', 'TRAP BAR 70%75%80%85%85%85%', 'BACK-DEADLIFT'],
    ['Dorsali', 'TRAZIONI PRESA NEUTRA ALLA SBARRA', '02.0', '5 X 4 (OBIETTIVO 5X8)', '', 'BACK-NEUTRAL-PULLUP'],
    ['Dorsali', 'TRAZIONI ALLA PULL-DOWN A CARICO LIBERO', '02.0', '10-10-8-8', '', 'BACK-PULLDOWN'],
    ['Pettorali', 'DISTENSIONI PANCA PIANA 2 MANUBRI', '02.0', '10-8-8-6-6', '', 'CHEST-DUMBBELL-PRESS'],
    ['Tricipiti', 'FRENCH PRESS PANCA PIANA 2 MANUBRI', '01.30', '3 X 10', '', 'TRICEPS-FRENCH-PRESS'],
    ['Tricipiti', 'ESTENSIONI AL CAVO ALTO', '01.30', '3 X 10', '', 'TRICEPS-PUSHDOWN'],
  ]],
];

const SITE = 'https://gym.example.invalid';
const imgUrl = (file) => `${SITE}/api/img?cat=esercizio&file=${file}&exp=0&sig=0`;
const LOGO = 'club-logo.png';
const LOGO_URL = `${SITE}/loghi/${LOGO}`;

// --- placeholder PNGs ------------------------------------------------------

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A 120×90 RGB PNG: white ground, a block in `rgb`, placed by `pose` (0 or 1). */
export function png(rgb, pose) {
  const W = 120, H = 90;
  const raw = Buffer.alloc((W * 3 + 1) * H, 255);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const inBlock = pose === 0
        ? x > 50 && x < 70 && y > 10 && y < 80          // standing: tall and thin
        : x > 20 && x < 100 && y > 50 && y < 70;        // lying: long and low
      if (!inBlock) continue;
      const o = y * (W * 3 + 1) + 1 + x * 3;
      raw[o] = rgb[0]; raw[o + 1] = rgb[1]; raw[o + 2] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const colour = (i) => [40 + (i * 53) % 180, 80 + (i * 97) % 150, 120 + (i * 31) % 120];

// --- the .mht --------------------------------------------------------------

function cell(ex, n, twoPos) {
  const [muscle, name, rest, spec, note, stem, bCase] = ex;
  const a = `${stem}-A.png`, b = `${stem}-${bCase || 'B'}.png`;
  const pic = (f, w) => `
                            <div style="width:${w};height:2.9cm;background-color:white;float:left;margin-top:5px;">
                                <img src="${imgUrl(f).replace(/&/g, '&amp;')}" style="max-height:100%;max-width:100%;">
                            </div>`;
  return `
                    <div class="${twoPos ? 'cella2pos' : 'cella1pos'}" style="">
                        <div style="clear:both;">${twoPos ? pic(a, '33.3%') + pic(b, '33.3%') : pic(b, '50%')}
                            <div style="width:${twoPos ? '33.3%' : '50%'};height:2.9cm;float:left;">
                                <div style="width:100%;overflow:hidden;font-weight:bold;">${n} - ${muscle}</div>
                                <div style="width:100%;height:1.3cm;overflow:hidden;line-height:.4cm">${name}</div>
                                <div style="width:100%;overflow:hidden;">Rec. : ${rest}</div>
                                <div style="width:100%;height:1.5cm;overflow:hidden;font-weight:bold;font-size:14px;line-height:.3cm;">${spec}</div>
                            </div>
                        </div>
                        <div style="width:98%;height:.6cm;padding-left:.1cm;padding-right:.1cm;overflow:hidden;font-size:8px;line-height:.2cm;">${note}</div>
                    </div>
`;
}

function html(twoPos) {
  const H = HEADER;
  let rows = '';
  for (const [label, exs] of DAYS) {
    // two exercises per row; the day label only on the first row of the day
    for (let i = 0; i < exs.length; i += 2) {
      rows += `
            <div class="riga1pos">
                <div class="seduta1pos" style="font-weight:bold;background-color:#DDDDFF">
                    ${i === 0 ? label : '&nbsp;'}
                </div>
                <div>
${exs.slice(i, i + 2).map((e, k) => cell(e, i + k + 1, twoPos)).join('')}
                </div>
            </div>
`;
    }
  }
  return `<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title></title>
</head>
<body>
    <h3 style="width:100%;text-align:center;" class="titleMail">Scheda allenamento</h3>
    <div id="printContent">
    <div class="page">
        <div class="subpage">
            <div class="testata">
                <div style="width:100%">
                    <div style="height:.7cm;text-transform:uppercase;font-weight:bold;margin-left:.2cm;font-size:16px;overflow:hidden;">${H.club}</div>
                </div>
                <div style="width:5.27cm;height:3.3cm;float:left;text-align:left">
                    <img src="${LOGO_URL}" style="max-height:3.1cm;max-width:4.8cm;margin-left:.2cm;object-fit:contain;">
                </div>
                <div style="width:13.5cm;height:3.3cm;overflow:hidden;float:left;">
                    <table border="0" style="width:100%;border-collapse:collapse;border-spacing:0;">
                        <tbody><tr>
                            <td colspan="4" style="text-transform:uppercase;font-weight:bold;font-size:15px;">${H.athlete}</td>
                        </tr>
                        <tr>
                            <td colspan="4">${H.program}</td>
                        </tr>
                        <tr>
                            <td colspan="4">${H.level}</td>
                        </tr>
                        <tr>
                            <td style="text-align:left;">Sedute : </td>
                            <td style="font-weight:bold;">${H.sessions}</td>
                            <td style="text-align:left;width:2cm;">Durata : </td>
                            <td style="font-weight:bold;">${H.duration}</td>
                        </tr>
                        <tr>
                            <td style="text-align:left;">Scadenza : </td>
                            <td style="font-weight:bold;">${H.expiry}</td>
                            <td style="text-align:left;"><span class="istruttorePT">Istruttore : </span> </td>
                            <td style="font-weight:bold;"><span class="istruttorePT">${H.instructor} </span></td>
                        </tr>
                    </tbody></table>
                </div>
            </div>
${rows}
        </div>
    </div>
    </div>
</body></html>
`;
}

/** Every image of the plan: { file name: PNG bytes }, logo included. */
function images(twoPos) {
  const out = {}; let i = 0;
  for (const [, exs] of DAYS) for (const e of exs) {
    const [, , , , , stem, bCase] = e;
    const c = colour(i++);
    if (twoPos) out[`${stem}-A.png`] = png(c, 0);
    out[`${stem}-${bCase || 'B'}.png`] = png(c, 1);
  }
  out[LOGO] = png([27, 139, 249], 0);
  return out;
}

function mht(twoPos) {
  const B = '----MultipartBoundary--synthetic0000000000000000----';
  const page = `${SITE}/workout.html?c=0&t=demo`;
  const head = (lines) => Buffer.from(lines.join('\r\n') + '\r\n\r\n', 'latin1');
  const parts = [head([
    'From: <Saved by Blink>', `Snapshot-Content-Location: ${page}`, 'Subject: ',
    'Date: Mon, 01 Feb 2027 09:00:00 GMT', 'MIME-Version: 1.0',
    'Content-Type: multipart/related;', '\ttype="text/html";', `\tboundary="${B}"`, ''])];
  const part = (type, loc, body) => {
    parts.push(Buffer.from(`--${B}\r\n`, 'latin1'));
    parts.push(head([`Content-Type: ${type}`, 'Content-Transfer-Encoding: binary', `Content-Location: ${loc}`]));
    parts.push(body, Buffer.from('\r\n', 'latin1'));
  };
  part('text/html', page, Buffer.from(html(twoPos), 'utf8'));
  for (const [name, bytes] of Object.entries(images(twoPos))) {
    part('image/png', name === LOGO ? LOGO_URL : imgUrl(name), bytes);
  }
  parts.push(Buffer.from(`--${B}--\r\n`, 'latin1'));
  return Buffer.concat(parts);
}

/** Writes the fixtures into `dir` and returns their paths. */
export function makeFixtures(dir = path.join(HERE, 'fixtures')) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
  const two = path.join(dir, 'scheda-2-posizioni.mht'), one = path.join(dir, 'scheda-1-posizione.mht');
  fs.writeFileSync(two, mht(true));
  fs.writeFileSync(one, mht(false));

  // plan.json + img/ through the app's own parser, as tools/build-plan.cjs does
  const ctx = { self: {}, console, TextDecoder, Uint8Array, ArrayBuffer, Buffer };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'www', 'parse-mht.js'), 'utf8'), ctx);
  const { plan, images: imgs } = ctx.self.SchedaParser.parseMht(new Uint8Array(fs.readFileSync(two)));
  plan.importedAt = '2027-02-01T09:00:00.000Z';
  for (const [name, img] of Object.entries(imgs)) fs.writeFileSync(path.join(dir, 'img', name), Buffer.from(img.bytes));
  fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan, null, 1));
  return { dir, two, one, plan: path.join(dir, 'plan.json'), img: path.join(dir, 'img') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const f = makeFixtures(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  const p = JSON.parse(fs.readFileSync(f.plan, 'utf8'));
  console.log(`fixtures in ${f.dir}: ${p.days.length} days, ` +
    `${p.days.reduce((a, d) => a + d.exercises.length, 0)} exercises, ${fs.readdirSync(f.img).length} images`);
}
