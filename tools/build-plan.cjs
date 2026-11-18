/* ---------------------------------------------------------------------------
 * build-plan.cjs — genera plan.json + img/ partendo da un .mht "2 Posizioni".
 *
 * Usa lo STESSO parser che gira nel browser (parse-mht.js): nessuna seconda
 * implementazione che possa divergere.
 *
 *   node build-plan.cjs "/percorso/scheda (2 Posizioni).mht"
 *
 * Nota: .cjs perché usa require (CommonJS), qualunque "type" dica package.json.
 * Il parser viene caricato in una sandbox vm come se fosse un tag <script>,
 * esattamente come lo carica l'app.
 * ------------------------------------------------------------------------- */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HERE = require('path').join(__dirname, '..', 'www');   // l'app web vive in www/
const src = process.argv[2];
if (!src) {
  console.error('uso: node build-plan.cjs <file.mht>');
  process.exit(1);
}

// carica parse-mht.js come farebbe il browser
// La sandbox è nuda: le forniamo i globali che anche un browser ha.
const ctx = { self: {}, console, TextDecoder, Uint8Array, ArrayBuffer, Buffer };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(HERE, 'parse-mht.js'), 'utf8'), ctx);
const Parser = ctx.self.SchedaParser;

const buf = fs.readFileSync(src);                       // byte grezzi, mai come testo
const { plan, images } = Parser.parseMht(new Uint8Array(buf));

// immagini → img/
const imgDir = path.join(HERE, 'img');
fs.mkdirSync(imgDir, { recursive: true });
let n = 0;
for (const [name, img] of Object.entries(images)) {
  fs.writeFileSync(path.join(imgDir, name), Buffer.from(img.bytes));
  n++;
}

fs.writeFileSync(path.join(HERE, 'plan.json'), JSON.stringify(plan, null, 1));

console.log(`plan.json: ${plan.days.length} giorni, ` +
  `${plan.days.reduce((a, d) => a + d.exercises.length, 0)} esercizi, ${n} immagini`);
plan.days.forEach((d) => {
  console.log(`\n== ${d.label}`);
  d.exercises.forEach((e) => console.log(
    `  ${e.i} [${e.muscle}] ${e.name}\n` +
    `     rec ${e.rest} · "${e.spec}" -> ${e.sets} serie ${JSON.stringify(e.targets)} (${e.kind})` +
    `${e.goal ? ' · obiettivo:' + e.goal : ''}${e.note ? ' · nota:' + e.note : ''}` +
    ` · img ${e.imgA ? 'A' : '-'}${e.imgB ? 'B' : '-'}`));
});
