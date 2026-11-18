/* ---------------------------------------------------------------------------
 * run.mjs — la prova di The 151 Health, in un browser vero.
 *
 *     npm test                       (dalla radice del repo)
 *
 * Nata come la prova della Scheda (the151universe/tests/scheda/run.mjs, 08/10):
 * le sezioni 1-11 sono quelle, le sei leggi comprese; la 12 è il calendario.
 *
 * Si porta dietro tutto: accende da sé un server statico sulla radice del repo
 * su una porta effimera, apre Chromium, tocca i bottoni come farebbe un pollice
 * in palestra e alla fine spegne tutto. Nessun server da avviare a mano, niente
 * che viva in /tmp: la prova sta nel repo insieme al codice che prova. Esce
 * != 0 se un controllo fallisce O se il browser ha scritto anche un solo
 * errore in console.
 *
 * La scheda della palestra è FINTA: tests/make-fixtures.mjs la scrive a ogni
 * giro in tests/fixtures/ (ignorata da git) — due .mht, una in vista
 * "1 Posizione" (che l'app DEVE rifiutare) e una in "2 Posizioni" (l'unica che
 * porta le immagini), più plan.json e img/ come li farebbe tools/build-plan.cjs.
 * Il server delle prove (tests/serve.py) serve quel plan.json e quelle figure
 * come se fossero in www/: nell'app pubblica il piano non c'è, lo carica chi la usa.
 *
 * Chromium: quello di playwright-core (`npx playwright-core install chromium`),
 * oppure CHROME_PATH=/percorso/chrome. Java (sezione 17): JAVA_HOME o javac nel PATH.
 *
 * Gli schermi finiscono in tests/shots/ (ignorati da git).
 * ------------------------------------------------------------------------- */
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import net from 'net';
import { spawn, spawnSync } from 'child_process';
import os from 'os';
import { fileURLToPath } from 'url';
import { makeFixtures } from './make-fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');             // radice del repo 151-health
const FIX = makeFixtures(path.join(HERE, 'fixtures')).dir;   // la scheda finta, rifatta a ogni giro
const EXE = process.env.CHROME_PATH || undefined;             // undefined = il Chromium di playwright-core

// una porta che il kernel ci regala: due prove in parallelo non si pestano,
// e non si litiga con niente di già acceso sulla macchina
const PORT = await new Promise((res) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});
const srv = spawn('python3', [path.join(HERE, 'serve.py'), String(PORT), ROOT, FIX],
  { cwd: ROOT, stdio: 'ignore' });
const stopServer = () => { try { srv.kill('SIGKILL'); } catch (e) {} };
process.on('exit', stopServer);
process.on('SIGINT', () => { stopServer(); process.exit(130); });
for (let i = 0; i < 100; i++) {                    // aspetta che risponda DAVVERO
  try { await fetch(`http://127.0.0.1:${PORT}/`); break; }
  catch (e) { await new Promise((r) => setTimeout(r, 100)); }
}

const BASE = `http://127.0.0.1:${PORT}/www/index.html`;
const HOME = BASE + '#/home';                       // la pagina Oggi della palestra
const SHOT = path.join(HERE, 'shots');
fs.rmSync(SHOT, { recursive: true, force: true });
fs.mkdirSync(SHOT, { recursive: true });

const errors = [];
let step = 0;
const ok = (m) => console.log('  ok  ' + m);
const bad = (m) => { console.log('  NO  ' + m); errors.push(m); };
const check = (cond, m) => cond ? ok(m) : bad(m);

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });

// IL PASSATO FINTO. www/data/storia.json sono i dati VERI dell'utente (fuori da
// git, dentro l'APK): la prova non li legge mai. Ogni contesto del browser
// riceve al loro posto questa storia anonima, fatta qui sul momento.
const NOW_S = Math.floor(Date.now() / 1000);
const ROME = (iso) => Math.floor(new Date(iso + '+02:00').getTime() / 1000);   // ora di Roma (legale)
const STORIA = {
  v: 1,
  sleep: {
    // notte fra lunedì 14 e martedì 15 settembre 2026: 23:30 → 06:30
    '2026-09-15': [ROME('2026-09-14T23:30:00'), ROME('2026-09-15T06:30:00'), 80, 230, 100, 10, 81, 58,
                   [1410, 1499, 4, 1500, 1579, 5, 1580, 1589, 7, 1590, 1689, 8, 1690, 1829, 4]],
    '2026-09-16': [ROME('2026-09-16T00:10:00'), ROME('2026-09-16T06:00:00'), 60, 200, 80, 10, 66, 61, []],
  },
  sport: [
    [ROME('2026-09-10T18:00:00'), ROME('2026-09-10T18:45:00'), 6, 'Camminata', 3200, 180, 98, 120],
    // in palestra ADESSO: deve fondersi con l'allenamento della Scheda delle prove
    [NOW_S - 300, NOW_S + 3600, 16, 'Esercizi a corpo libero', 0, 400, 104, 140],
  ],
  subs: { '2024-01-10': ['caffeina'] },
};
const finta = (c) => c.route('**/data/storia.json', (r) => r.fulfill({ json: STORIA }));

// LE DOMANDE DELL'APP (11/11: «mai una finestra grigia»). Le finestre grigie del browser (confirm/alert/
// prompt) sono VIETATE: ognuna finisce in GRIGIE e la prova va rossa in fondo. Le domande dell'app (#pop
// [data-ask]) prendono OK da sole, come prima faceva d.accept(): il testo va in FINESTRE (sopravvive ai reload).
const GRIGIE = [], FINESTRE = [];
const finestrelle = async (pg) => {
  pg.on('dialog', (d) => { GRIGIE.push(d.type() + ': ' + d.message()); d.accept(); });
  await pg.exposeBinding('__finestra', (_s, m) => { FINESTRE.push(m); });
  await pg.addInitScript(() => {
    new MutationObserver(() => {
      const m = document.querySelector('#pop [data-ask]');
      if (!m || m.dataset.visto) return;
      m.dataset.visto = '1';
      if (window.__finestra) window.__finestra(m.textContent);
      if (!window.__senzaOk) document.querySelector('#pop [data-ask-ok]').click();
    }).observe(document, { childList: true, subtree: true });
  });
};

const ctx = await browser.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2 });
await finta(ctx);
const page = await ctx.newPage();

const consoleErrs = [];
page.on('console', (m) => { if (m.type() === 'error') { consoleErrs.push(m.text()); console.log('  [console] ' + m.text()); } });
page.on('pageerror', (e) => { consoleErrs.push('PAGEERROR: ' + e.message); console.log('  [pageerror] ' + (e.stack || e.message)); });
await finestrelle(page);

const shot = async (name) => page.screenshot({ path: `${SHOT}/${String(++step).padStart(2,'0')}-${name}.png`, fullPage: true });

// helper: apri l'esercizio idx e ritorna il suo box
const openEx = async (idx) => {
  await page.locator(`[data-toggle="${idx}"]`).click();
  await page.waitForTimeout(120);
};
// helper: leggi lo stato di un esercizio aperto
const readEx = (idx) => page.evaluate((i) => {
  const box = document.querySelectorAll('.ex')[i];
  const grid = box.querySelector('.setgrid');
  return {
    name: box.querySelector('.nm').textContent,
    noload: grid.classList.contains('noload'),
    heads: [...grid.querySelectorAll('.shead span')].map(s => s.textContent).filter(Boolean),
    rows: [...box.querySelectorAll('.setrow')].map(r => ({
      vals: [...r.querySelectorAll('.stp')].map(s => ({ f: s.dataset.f, v: s.querySelector('.val').textContent })),
      done: r.classList.contains('ok'),
      mark: r.classList.contains('rec') ? 'rec'
        : r.classList.contains('up') ? 'up'
        : r.classList.contains('down') ? 'down' : '',
    })),
    lastline: box.querySelector('.lastline') ? box.querySelector('.lastline').textContent : '',
  };
}, idx);

// ================================================== 1. avvio, niente emoji
console.log('\n1. Avvio, navigazione senza emoji');
await page.goto(HOME, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
check((await page.locator('.hdr .t').textContent()).includes('ALEX SAMPLE'), 'testata con il nome atleta');
check((await page.locator('.day.next').textContent()).includes('Giorno 1'), 'prossimo = Giorno 1');

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const navTxt = await page.locator('#nav').textContent();
check(!EMOJI.test(navTxt), 'la navigazione non ha emoji: "' + navTxt.replace(/\s+/g,' ').trim() + '"');
const bodyTxt0 = await page.locator('body').textContent();
check(!EMOJI.test(bodyTxt0), 'la schermata di casa non ha emoji');
await shot('home');

// ============================================ 2. modo per esercizio
console.log('\n2. Ogni esercizio ha il suo modo (carico / corpo libero / tempo)');
await page.locator('[data-day-go]').click();
await page.waitForSelector('.setgrid', { state: 'attached' });
check(await page.locator('.ex').count() === 7, '7 esercizi nel Giorno 1');
check(await page.locator('input').count() === 0, 'NESSUN campo da digitare in tutta la pagina');
check(await page.locator('.stp button').count() > 0, 'ci sono i bottoni meno/più');

await openEx(0);   // CRUNCH INVERSO ALLA SBARRA — a tempo, senza chili
const e0 = await readEx(0);
check(e0.noload && e0.heads.join(',') === 'sec',
  'esercizio a tempo: niente colonna chili, si misura in sec — colonne [' + e0.heads + ']');
check(e0.rows[0].vals.length === 1 && e0.rows[0].vals[0].v === '30 s',
  'il piano detta 30 s e sono già lì: ' + e0.rows[0].vals[0].v);

await openEx(1);   // BACK SQUAT — bilanciere, chili
const e1 = await readEx(1);
check(!e1.noload && e1.heads.join(',') === 'kg,reps',
  'BACK SQUAT ha chili e ripetizioni — colonne [' + e1.heads + ']');
check(e1.rows.length === 6 && e1.rows.map(r => r.vals[1].v).join('-') === '5-5-5-3-3-3',
  'le ripetizioni arrivano dal piano: ' + e1.rows.map(r => r.vals[1].v).join('-'));

await openEx(4);   // TRAZIONI PRESA INVERSA — corpo libero
const e4 = await readEx(4);
check(e4.noload && e4.heads.join(',') === 'reps',
  'TRAZIONI: nessuna colonna chili (corpo libero) — colonne [' + e4.heads + ']');
await shot('esercizi-modi');

// ============================================ 3. più / meno, contatori indipendenti
console.log('\n3. Più e meno: ogni contatore muove SOLO il suo numero');
await openEx(1);
const kgOf = (r) => page.locator('.ex').nth(1).locator('.setrow').nth(r).locator('.stp[data-f="kg"]');
const plusKg = kgOf(0).locator('.pl');
for (let i = 0; i < 24; i++) await plusKg.click();     // 24 × 2,5 = 60 kg
await page.waitForTimeout(120);
let s = await readEx(1);
check(s.rows[0].vals[0].v === '60', 'ventiquattro tocchi su «+» fanno 60 kg: ' + s.rows[0].vals[0].v);
check(s.rows.slice(1).every(r => r.vals[0].v === '0'),
  'alzare la 1ª NON tocca nessun\'altra serie: ' + s.rows.map(r => r.vals[0].v).join('-'));

await kgOf(0).locator('.mn').click();
await page.waitForTimeout(100);
s = await readEx(1);
check(s.rows[0].vals[0].v === '57.5', '«−» toglie 2,5 kg: ' + s.rows[0].vals[0].v);

// una scaletta a mano: ogni serie il suo peso, e nessuna si muove per le altre
for (let i = 0; i < 20; i++) await kgOf(1).locator('.pl').click();   // 50
for (let i = 0; i < 18; i++) await kgOf(2).locator('.pl').click();   // 45
await page.waitForTimeout(150);
s = await readEx(1);
check(s.rows.map(r => r.vals[0].v).join('-') === '57.5-50-45-0-0-0',
  'una scaletta resta esattamente com\'è stata scritta: ' + s.rows.map(r => r.vals[0].v).join('-'));

// e vale anche per le ripetizioni: il piano dice 5-5-5-3-3-3, ne cambio una sola
await page.locator('.ex').nth(1).locator('.setrow').nth(1).locator('.stp[data-f="reps"] .pl').click();
await page.waitForTimeout(120);
s = await readEx(1);
check(s.rows.map(r => r.vals[1].v).join('-') === '5-6-5-3-3-3',
  'una ripetizione in più sulla 2ª serie e basta: ' + s.rows.map(r => r.vals[1].v).join('-'));
await page.locator('.ex').nth(1).locator('.setrow').nth(1).locator('.stp[data-f="reps"] .mn').click();
await page.waitForTimeout(120);

// spuntare una serie non muove niente — due tocchi: parte, poi fatta
await page.locator('.ex').nth(1).locator('.setrow').nth(0).locator('.tick').click();
await page.waitForTimeout(120);
check(await page.locator('.ex').nth(1).locator('.setrow').nth(0).evaluate((r) => r.classList.contains('run') && !r.classList.contains('ok')),
  'primo tocco sulla spunta: la serie PARTE (in corsa), non è ancora fatta');
await page.locator('.ex').nth(1).locator('.setrow').nth(0).locator('.tick').click();
await page.waitForTimeout(120);
s = await readEx(1);
check(s.rows[0].done && s.rows.map(r => r.vals[0].v).join('-') === '57.5-50-45-0-0-0',
  'spuntare una serie non sposta nessun numero: ' + s.rows.map(r => r.vals[0].v).join('-'));

const prog0 = await page.locator('#progbar').evaluate(e => e.style.width);
check(prog0 !== '' && prog0 !== '0%' && prog0 !== '100%',
  'la barra conta solo le serie SPUNTATE, non quelle apparecchiate: ' + prog0);
await shot('steppers');

// ============================================ 3b. il cronometro delle serie a tempo
console.log('\n3b. Cronometro: misura precisa, poi «−»/«+» scattano al secondo tondo');

// il numero dei secondi come sta nel DEPOSITO, non come è scritto a schermo:
// la legge dello scatto è aritmetica, e si prova sull'aritmetica
const rawSec = () => page.evaluate(() => {
  const S = JSON.parse(localStorage.getItem('scheda.v1'));
  return S.active.sets[S.active.order[0]][0].reps;
});
// dopo una ricarica l'app APRE DA SÉ il primo esercizio non finito: un click
// alla cieca lo richiuderebbe. Si apre solo se è chiuso.
const ensureOpen = async (idx) => {
  const hidden = await page.locator('#body' + idx).evaluate((e) => e.classList.contains('hide'));
  if (hidden) await openEx(idx);
  await page.waitForTimeout(80);
};
const putSec = async (v) => {
  await page.evaluate((val) => {
    const S = JSON.parse(localStorage.getItem('scheda.v1'));
    S.active.sets[S.active.order[0]][0].reps = val;
    localStorage.setItem('scheda.v1', JSON.stringify(S));
    location.reload();
  }, v);
  await page.waitForSelector('.setgrid', { state: 'attached' });
  await ensureOpen(0);
};
const secRow = () => page.locator('.ex').nth(0).locator('.setrow').nth(0);

await ensureOpen(0);   // CRUNCH INVERSO ALLA SBARRA — a tempo
// dal 20/10 (scelta A) il cronometro È la spunta: niente tasto a parte
const nRighe = await page.locator('.ex').nth(0).locator('.setrow').count();
check(await page.locator('.crono, [data-crono]').count() === 0 && await page.locator('.ex').nth(0).locator('.tick').count() === nRighe,
  'nessun tasto «timer» a parte: ogni serie a tempo ha solo la sua spunta (' + nRighe + ' serie)');
const runOf = (n) => page.evaluate((i) => { const S = JSON.parse(localStorage.getItem('scheda.v1')); return S.active.sets[S.active.order[0]][i]; }, n);

// A. la spunta misura davvero: primo tocco parte, secondo ferma
await secRow().locator('.tick').click();
await page.waitForTimeout(400);
const ticking = await secRow().locator('.stp[data-f="reps"] .val').textContent();
check(await secRow().evaluate((r) => r.classList.contains('run')) && /^0:0\d$/.test(await secRow().locator('.tick .tt').textContent()),
  'partita: la spunta si accende e conta il tempo della serie: ' + await secRow().locator('.tick .tt').textContent());
check(ticking !== '30 s', 'mentre corre, il numero della serie scorre: ' + ticking);
await shot('crono-in-corsa');
await page.waitForTimeout(1200);
await secRow().locator('.tick').click();
await page.waitForTimeout(150);
const misurato = await rawSec();
const s0 = await runOf(0);
check(misurato > 1.2 && misurato < 3.2, 'secondo tocco: resta il tempo misurato fra i due tocchi: ' + misurato + ' s');
check(s0.done && Math.abs((s0.t1 - s0.t0) / 1000 - misurato) < 0.02, 'e la serie è fatta, con inizio e fine coerenti col tempo');
// una serie sola per volta: farne partire un'altra chiude quella che correva
await secRow().locator('.tick').click();              // terzo tocco: torna ferma
await page.waitForTimeout(120);
const s0b = await runOf(0);
check(!s0b.done && !s0b.t0 && !s0b.t1 && s0b.reps === misurato, 'terzo tocco: la serie torna ferma, gli orari tolti, il tempo misurato resta scritto');
await secRow().locator('.tick').click();
await page.waitForTimeout(300);
await page.locator('.ex').nth(0).locator('.setrow').nth(1).locator('.tick').click();
await page.waitForTimeout(150);
const [a0, a1] = [await runOf(0), await runOf(1)];
check(a0.done && a0.t1 && a1.t0 && !a1.done, 'partita la serie 2 mentre correva la 1: la 1 si chiude fatta, la 2 corre (una per volta)');
await page.locator('.ex').nth(0).locator('.setrow').nth(1).locator('.tick').click();
await page.locator('.ex').nth(0).locator('.setrow').nth(1).locator('.tick').click();
await secRow().locator('.tick').click();
await page.waitForTimeout(150);
check(!(await runOf(0)).done && !(await runOf(1)).done && !(await runOf(1)).t0, 'rimesse ferme tutte e due');

// B. la legge dello scatto, su un numero deciso da noi: 57,46
await putSec(57.46);
check(await secRow().locator('.stp[data-f="reps"] .val').textContent() === '57.46 s',
  'un tempo preciso si legge col centesimo: 57.46 s');
await secRow().locator('.stp[data-f="reps"] .mn').click();
await page.waitForTimeout(150);
check(await rawSec() === 57, '«−» su 57,46 scatta a 57 tondi: ' + await rawSec());
await secRow().locator('.stp[data-f="reps"] .mn').click();
await page.waitForTimeout(150);
check(await rawSec() === 56, 'da un numero tondo «−» vale UN secondo: ' + await rawSec());

await putSec(57.46);
await secRow().locator('.stp[data-f="reps"] .pl').click();
await page.waitForTimeout(150);
check(await rawSec() === 58, '«+» su 57,46 scatta a 58 tondi: ' + await rawSec());
await secRow().locator('.stp[data-f="reps"] .pl').click();
await page.waitForTimeout(150);
check(await rawSec() === 59, 'da un numero tondo «+» vale UN secondo: ' + await rawSec());

// C. oltre il minuto si legge come un orologio, centesimi compresi
await putSec(90.4);
check(await secRow().locator('.stp[data-f="reps"] .val').textContent() === '1:30.4',
  'oltre il minuto si legge 1:30.4 — ' + await secRow().locator('.stp[data-f="reps"] .val').textContent());

// D. con i chili accanto il cronometro ci sta comunque (plank zavorrato)
await page.locator('.ex').nth(0).locator('[data-cfg]').click();
await page.waitForTimeout(150);
await page.locator('.ex').nth(0).locator('.cfg [data-set="load:1"]').click();
await page.waitForTimeout(300);
const e0t = await readEx(0);
check(!e0t.noload && e0t.heads.join(',') === 'kg,sec' && await page.locator('.ex').nth(0).locator('.tick').count() === nRighe,
  'a tempo E con chili: colonne [' + e0t.heads + '], e la spunta-cronometro in ogni riga');
await shot('crono-con-chili');
await page.locator('.ex').nth(0).locator('.cfg [data-set="load:0"]').click();
await page.waitForTimeout(300);

// E. il recupero: "01.30" è un minuto e mezzo, non quattro minuti
// (per mesi valeva 240 s: il punto veniva letto come decimi e moltiplicato ×6×10).
// Si scrive come un orologio («rec. 1:30», nella testa dell'esercizio; il bottone
// in fondo è uscito il 20/10): la prova parte dal testo VERO del piano.
const recuperi = await page.evaluate(async () => {
  const plan = await (await fetch('plan.json')).json();
  const day = plan.days.find((d) => d.n === 1);
  return [...document.querySelectorAll('[data-rest]')].map((b, i) => ({
    gym: day.exercises[i].rest, sec: +b.dataset.rest, label: b.textContent.trim() }));
});
const attesi = { '01.0': 60, '01.30': 90, '02.0': 120, '02.30': 150, '03.0': 180 };
const mm = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
const sbagliati = recuperi.filter((r) => attesi[r.gym] === undefined || attesi[r.gym] !== r.sec
  || r.label !== 'rest ' + mm(r.sec));
check(recuperi.length > 0 && sbagliati.length === 0,
  'il recupero scritto dalla palestra vale i secondi giusti e si legge come un orologio: ' +
  JSON.stringify(recuperi.map((r) => r.gym + '=' + r.label)));

// E. il cronometro non ha portato nessun campo da digitare
check(await page.locator('input').count() === 0,
  'col cronometro NON è entrato nessun campo da digitare');
await putSec(30);   // rimesso come lo detta il piano, per le prove che seguono
await shot('crono');

// ============================================ 4. correggere il modo
console.log('\n4. Correggere a mano come si misura un esercizio');
await openEx(2);   // BRIDGE HIP DRIVE — indovinato con chili
let e2 = await readEx(2);
check(!e2.noload, 'BRIDGE parte con i chili (indovinato dal nome)');
await page.locator('.ex').nth(2).locator('[data-cfg]').click();
await page.waitForTimeout(150);
await page.locator('.ex').nth(2).locator('.cfg [data-set="load:0"]').click();
await page.waitForTimeout(300);
e2 = await readEx(2);
check(e2.noload && e2.heads.join(',') === 'reps',
  'dopo la correzione i chili spariscono: colonne [' + e2.heads + ']');
const modeSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('scheda.v1')).modes);
check(modeSaved && Object.keys(modeSaved).some(k => k.includes('BRIDGE') && modeSaved[k].load === false),
  'la correzione è scritta nel deposito e vale per sempre');
await shot('correzione-modo');

// ============================================ 5. primo allenamento
console.log('\n5. Primo allenamento completo');
await page.evaluate(() => {
  const S = JSON.parse(localStorage.getItem('scheda.v1'));
  Object.keys(S.active.sets).forEach((k, xi) => {
    S.active.sets[k].forEach((st, i) => {
      if (S.active.modes[k].load) st.kg = 20 + xi * 10;
      st.done = true;
    });
  });
  localStorage.setItem('scheda.v1', JSON.stringify(S));
  location.reload();
});
await page.waitForSelector('.setgrid', { state: 'attached' });
await page.waitForTimeout(300);
check(await page.locator('#progbar').evaluate(e => e.style.width) === '100%', 'barra al 100% con tutto spuntato');
await page.locator('#finishBtn').click();
await page.waitForTimeout(500);
check(page.url().includes('#/storico/'), 'a fine allenamento si apre il dettaglio');
const h1 = await page.evaluate(() => JSON.parse(localStorage.getItem('scheda.v1')).history);
check(h1.length === 1, '1 allenamento nello storico');
check(h1[0].sets['CRUNCH INVERSO ALLA SBARRA'].every(s => !s.kg),
  'l\'esercizio a tempo è salvato SENZA chili');
check(h1[0].sets['BACK SQUAT'].every(s => s.kg > 0), 'il back squat è salvato CON i chili');
check(await page.locator('.pill-pr').count() === 0, 'nessun record al primo allenamento (è la base)');
const detailTxt = await page.locator('#app').textContent();
check(!EMOJI.test(detailTxt), 'il dettaglio non ha emoji');
await shot('dettaglio-1');

// ============================================ 6. la memoria fra allenamenti
console.log('\n6. La settimana dopo: la scheda si ricorda al posto mio');
await page.evaluate(() => location.hash = '#/giorno/1');
await page.waitForTimeout(300);
await page.locator('[data-start]').click();
await page.waitForSelector('.setgrid', { state: 'attached' });
await openEx(1);
const again = await readEx(1);
check(again.rows.every(r => r.vals[0].v === '30'),
  'i CHILI dell\'ultima volta sono già lì: ' + again.rows.map(r => r.vals[0].v).join('-'));
check(again.rows.map(r => r.vals[1].v).join('-') === '5-5-5-3-3-3',
  'e anche le RIPETIZIONI: ' + again.rows.map(r => r.vals[1].v).join('-'));
check(/Last time/.test(again.lastline) && /30×5/.test(again.lastline),
  'una riga sola dice com\'è andata: "' + again.lastline.replace(/\s+/g,' ').trim() + '"');
check(await page.locator('.ex').nth(1).locator('.setrow.ok').count() === 0,
  'ma niente è spuntato: i valori sono una proposta, non un fatto');
await shot('memoria');

// alzo il peso → il colore cambia SUBITO, prima ancora di finire.
// Qui esce ORO e non verde, ed è giusto: c'è un solo allenamento alle spalle,
// quindi l'ultima volta E il record di sempre sono lo stesso numero — superarlo
// è per forza un record. Il verde si vedrà quando ci sarà un passato più lungo.
await page.locator('.ex').nth(1).locator('.setrow').nth(0).locator('.stp[data-f="kg"] .pl').click();
await page.waitForTimeout(150);
const live = await readEx(1);
check(live.rows[0].mark === 'rec',
  'alzando il peso la riga si accende all\'istante (oro: batte anche il record): ' + live.rows[0].mark);
await page.locator('.ex').nth(1).locator('.setrow').nth(0).locator('.stp[data-f="kg"] .mn').click();
await page.locator('.ex').nth(1).locator('.setrow').nth(0).locator('.stp[data-f="kg"] .mn').click();
await page.waitForTimeout(150);
check((await readEx(1)).rows[0].mark === 'down', 'abbassandolo diventa rossa');

// un centesimo di secondo NON è un progresso: il cronometro è preciso, ma il
// confronto si fa sui secondi tondi, se no ogni allenamento sarebbe tutto verde
await ensureOpen(0);
const secondiTondi = async (v) => {
  await page.evaluate((val) => {
    const S = JSON.parse(localStorage.getItem('scheda.v1'));
    S.active.sets[S.active.order[0]][0].reps = val;
    localStorage.setItem('scheda.v1', JSON.stringify(S));
    location.reload();
  }, v);
  await page.waitForSelector('.setgrid', { state: 'attached' });
  await ensureOpen(0);
  return (await readEx(0)).rows[0].mark;
};
const eraleStesso = await page.evaluate(() => {
  const S = JSON.parse(localStorage.getItem('scheda.v1'));
  return S.history[S.history.length - 1].sets[S.active.order[0]][0].reps;
});
check(await secondiTondi(eraleStesso + 0.46) === '',
  'un centesimo in più NON accende il verde (stesso secondo tondo)');
// la legge protetta qui è «un centesimo non è un progresso, un secondo sì» —
// non quale colore esce: col solo primo allenamento alle spalle, un secondo in
// più batte anche il record, quindi è oro e non verde.
check(await secondiTondi(eraleStesso + 1) !== '',
  'un secondo intero in più sì: la riga si accende');

// l'ORO dal vivo: prima esisteva solo dopo il salvataggio. Ora un tempo che
// batte il meglio di sempre accende l'oro MENTRE ti alleni.
check(await secondiTondi(eraleStesso + 500) === 'rec',
  'un tempo che batte il record accende l\'ORO durante l\'allenamento');

// e l'asticella si alza SUBITO: record battuto alla prima serie ⇒ dalla
// seconda l'oro si guadagna solo battendo il NUOVO record, non il vecchio.
// Contano solo le serie SPUNTATE (legge 2: finché non spunti è una proposta).
await page.evaluate(() => {
  const S = JSON.parse(localStorage.getItem('scheda.v1'));
  const k = S.active.order[0];
  S.active.sets[k][0].reps = 500; S.active.sets[k][0].done = true;  // record nuovo, incassato
  S.active.sets[k][1].reps = 400;                                   // batte il vecchio, NON il nuovo
  S.active.sets[k][2].reps = 900;                                   // batte anche il nuovo
  localStorage.setItem('scheda.v1', JSON.stringify(S));
  location.reload();
});
await page.waitForSelector('.setgrid', { state: 'attached' });
await ensureOpen(0);
const scala = (await readEx(0)).rows.map(r => r.mark);
check(scala[0] === 'rec', 'la serie che batte il record è oro: ' + scala[0]);
check(scala[1] !== 'rec',
  'la serie dopo NON è oro: batte il vecchio record ma non quello appena fatto (' + scala[1] + ')');
check(scala[2] === 'rec',
  'la terza torna oro perché batte anche il record nuovo: ' + scala[2]);
await shot('oro-dal-vivo');   // oro / verde / oro nella stessa schermata

// rimetto tutto com'era, se no il resto della prova parte da uno stato finto
await page.evaluate(() => {
  const S = JSON.parse(localStorage.getItem('scheda.v1'));
  const k = S.active.order[0];
  S.active.sets[k][0].done = false;
  [1, 2].forEach(i => { S.active.sets[k][i].reps = 30; });
  localStorage.setItem('scheda.v1', JSON.stringify(S));
  location.reload();
});
await page.waitForSelector('.setgrid', { state: 'attached' });
await secondiTondi(eraleStesso);

// ============================================ 7. oro / verde / rosso
console.log('\n7. Secondo allenamento: oro, verde e rosso');
await page.evaluate(() => {
  const S = JSON.parse(localStorage.getItem('scheda.v1'));
  Object.keys(S.active.sets).forEach((k, xi) => {
    S.active.sets[k].forEach((st, i) => {
      if (S.active.modes[k].load) st.kg = xi === 1 ? 25 : 30 + xi * 10;
      else st.reps = xi === 1 ? st.reps : st.reps + 2;
      st.done = true;
    });
  });
  localStorage.setItem('scheda.v1', JSON.stringify(S));
  location.reload();
});
await page.waitForSelector('.setgrid', { state: 'attached' });
await page.locator('#finishBtn').click();
await page.waitForTimeout(600);
const counts = await page.evaluate(() => ({
  pr: document.querySelectorAll('.pill-pr').length,
  up: document.querySelectorAll('.pill-up').length,
  down: document.querySelectorAll('.pill-down').length,
}));
check(counts.pr > 0, `oro presente (record battuti): ${counts.pr}`);
check(counts.up > 0, `verde presente (migliorati): ${counts.up}`);
check(counts.down > 0, `rosso presente (peggiorati): ${counts.down}`);
check(await page.evaluate(() => JSON.parse(localStorage.getItem('scheda.v1')).history.length) === 2,
  '2 allenamenti nello storico');
await shot('dettaglio-2');

// ============================================ 8. storico, record, foglio
console.log('\n8. Storico, record, foglio');
await page.evaluate(() => location.hash = '#/storico');
await page.waitForTimeout(300);
check(await page.locator('.hitem').count() === 2, 'storico elenca 2 allenamenti');
const tags = await page.locator('.hitem').first().textContent();
check(/record|meglio|peggio/.test(tags) && !EMOJI.test(tags),
  'il riepilogo usa parole, non simboli: "' + tags.replace(/\s+/g,' ').trim() + '"');
await shot('storico');

await page.evaluate(() => location.hash = '#/record');
await page.waitForTimeout(300);
check(await page.locator('.pr').count() === 7, '7 record personali');
const recTxt = await page.locator('#app').textContent();
check(/\d+ s|\d+:\d\d/.test(recTxt), 'il record dell\'esercizio a tempo è in secondi, non in chili');
await shot('record');

await page.locator('[data-sheet]').click();
await page.waitForTimeout(400);
check(await page.locator('#sheet.on').count() === 1, 'il foglio si apre');
const sheetTxt = await page.locator('#sheet').textContent();
check(sheetTxt.includes('Personal records'), 'il foglio ha i record IN CIMA');
check(sheetTxt.includes('Full history'), 'il foglio ha lo storico completo');
check(/\bPR\b/.test(sheetTxt), 'sulla carta il record è scritto "PR" (il colore non si stampa)');
check(!EMOJI.test(sheetTxt), 'il foglio non ha emoji');
await shot('foglio');
// il foglio si giudica sulla CARTA, non sullo schermo: `@media print` cambia
// margini, colori e colonne. Senza questa immagine si correggeva alla cieca.
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(200);
await shot('foglio-stampa');
await page.emulateMedia({ media: 'screen' });

// ============================================ 9. cambio scheda
console.log('\n9. Cambio scheda da file .mht');
await page.evaluate(() => { const s=document.getElementById('sheet'); if(s) s.classList.remove('on'); location.hash = '#/scheda'; });
await page.waitForTimeout(300);
// 21 slot nella scheda ma 20 esercizi DISTINTI: «DISTENSIONI PANCA PIANA 2
// MANUBRI» torna sia il Giorno 2 sia il Giorno 3, ed è giusto che compaia una
// volta sola — il modo appartiene all'esercizio, non al giorno.
const nModi = await page.locator('.moderow').count();
const nomiModi = await page.locator('.moderow .nm').allTextContents();
check(nModi === 20 && new Set(nomiModi).size === 20,
  'la pagina Scheda elenca i 20 esercizi distinti, senza doppioni: ' + nModi);
check(nomiModi.includes('DISTENSIONI PANCA PIANA 2 MANUBRI'),
  'l\'esercizio ripetuto in due giorni c\'è, una volta sola');

let daF = FINESTRE.length;
await page.locator('#mhtfile').setInputFiles(path.join(FIX, 'scheda-1-posizione.mht'));
await page.waitForTimeout(700);
let alertMsg = FINESTRE.slice(daF).join('\n');
check(/2 Posizioni/.test(alertMsg), 'la vista "1 Posizione" viene rifiutata con spiegazione');

daF = FINESTRE.length;
await page.locator('#mhtfile').setInputFiles(path.join(FIX, 'scheda-2-posizioni.mht'));
await page.waitForTimeout(1300);
const after = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('scheda.v1'));
  return { hist: s.history.length, days: s.plan.days.length, src: s.imgSource,
           ex: s.plan.days.reduce((a,d)=>a+d.exercises.length,0),
           modes: Object.keys(s.modes||{}).length };
});
check(after.hist === 2, 'dopo il cambio scheda lo storico è INTATTO: ' + after.hist + ' allenamenti');
check(after.days === 3 && after.ex === 21, 'nuova scheda letta: 3 giorni, 21 esercizi');
check(after.src === 'idb', 'immagini della nuova scheda in IndexedDB');
check(after.modes > 0, 'le correzioni su come si misura SOPRAVVIVONO al cambio scheda');

await page.evaluate(() => location.hash = '#/home');
await page.waitForTimeout(500);
check((await page.locator('.day.next').textContent()).includes('Giorno 2'),
  'il prossimo allenamento proposto è il Giorno 2 (ruota da solo)');
await shot('dopo-cambio-scheda');

// ============================================ 10. backup, offline
console.log('\n10. Backup, service worker, offline');
await page.evaluate(() => location.hash = '#/scheda');
await page.waitForTimeout(300);
const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await page.locator('[data-export]').click();
const d = await dl;
check(!!d, 'il backup .json si scarica: ' + (d ? d.suggestedFilename() : 'NIENTE'));
if (d) {
  const p = path.join(SHOT, d.suggestedFilename());
  await d.saveAs(p);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  check(j.history.length === 2 && j.plan && j.modes, 'il backup contiene storico + scheda + correzioni');
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const sw = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  if (!r) return { entries: 0, cache: [] };
  const keys = await caches.keys();
  const c = keys.length ? await caches.open(keys[0]) : null;
  return { cache: keys, entries: c ? (await c.keys()).length : 0 };
});
check(sw.entries > 40, 'service worker ha in cache guscio + figure: ' + JSON.stringify(sw));

// la versione si legge DAL sorgente, non si ricopia qui: scriverla in due posti
// significa che prima o poi i due posti non saranno d'accordo. Qui si prova che
// il browser sta servendo davvero la versione dichiarata in sw.js, e che di
// cache vecchie non ne resta nessuna.
const VER = (fs.readFileSync(path.join(ROOT, 'www/sw.js'), 'utf8')
  .match(/VERSION\s*=\s*'([^']+)'/) || [])[1];
check(!!VER && sw.cache.length === 1 && sw.cache[0] === VER,
  'in cache c\'è SOLO la versione dichiarata in sw.js (' + VER + '): ' + JSON.stringify(sw.cache));

await ctx.setOffline(true);
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
check(await page.evaluate(() => !!document.querySelector('.cal')), 'l\'app si apre SENZA RETE (sul calendario)');
await shot('offline');
await ctx.setOffline(false);

// ============================================ 12. il calendario dei giorni
console.log('\n12. Il calendario dei giorni («quel giorno è successo questo»)');
{
  // ora di Roma, come il telefono dell'utente: le date si leggono in ora LOCALE
  const cx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
                                        timezoneId: 'Europe/Rome' });
  await finta(cx);
  const cp = await cx.newPage();
  cp.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  cp.on('pageerror', (e) => consoleErrs.push('PAGEERROR: ' + e.message));
  await finestrelle(cp);

  // 1) il backup che la Scheda ha appena esportato (sezione 10) si ripristina
  //    in Health così com'è: è il passaggio dei dati dal telefono dell'utente
  await cp.goto(BASE + '#/scheda', { waitUntil: 'networkidle' });
  await cp.waitForTimeout(300);
  const bk = d ? path.join(SHOT, d.suggestedFilename()) : null;
  check(!!bk, 'c\'è un backup della Scheda da ripristinare');
  if (bk) {
    await cp.locator('#bkfile').setInputFiles(bk);
    await cp.waitForTimeout(500);
    const n = await cp.evaluate(() => JSON.parse(localStorage.getItem('scheda.v1')).history.length);
    check(n === 2, 'ripristinato il backup della Scheda: ' + n + ' allenamenti su 2');
  }

  // 2) un allenamento iniziato a mezzanotte e mezza ora di Roma (22:30 UTC del
  //    giorno prima) appartiene al giorno DOPO: se il calendario leggesse l'UTC
  //    finirebbe sul giorno sbagliato
  await cp.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('scheda.v1'));
    const w = JSON.parse(JSON.stringify(s.history[0]));
    w.id = 'notte'; w.n = 99; w.dayLabel = 'Giorno 3';
    w.startedAt = '2026-09-14T22:30:00.000Z'; w.endedAt = '2026-09-14T23:41:00.000Z';
    s.history.unshift(w); localStorage.setItem('scheda.v1', JSON.stringify(s));
  });

  // 3) si apre sul calendario
  await cp.goto(BASE, { waitUntil: 'networkidle' });
  await cp.waitForTimeout(400);
  check(cp.url().endsWith('#/giorni') && await cp.locator('.cal').count() === 1,
    'senza allenamento in corso l\'app si apre sul calendario: ' + cp.url().split('#')[1]);
  check(await cp.locator('.cal-h').count() === 7 && (await cp.locator('.cal-h').first().textContent()) === 'M',
    'la settimana parte dal lunedì');
  const MESI = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const now = new Date();
  check((await cp.locator('h1').textContent()) === MESI[now.getMonth()] + ' ' + now.getFullYear(),
    'si apre sul mese di oggi: ' + await cp.locator('h1').textContent());
  const q = await cp.evaluate(() => { const ws = [...document.querySelectorAll('.cal-d:not(.fut) .r i')].map((i) => Math.round(i.getBoundingClientRect().width));
    const sv = [...document.querySelectorAll('.cal-d svg')].map((s) => { const c = getComputedStyle(s), r = s.getBoundingClientRect();
      return Math.min(r.width - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight), r.height - parseFloat(c.paddingTop) - parseFloat(c.paddingBottom)); });
    return { min: Math.min(...ws), max: Math.max(...ws), svg: sv.length ? Math.min(...sv) : 99 }; });
  check(q.max - q.min <= 1, 'i quattro quadratini sono tutti larghi uguali: ' + q.min + '–' + q.max + ' px');
  check(q.svg >= 9, 'ogni disegnino dello sport si vede davvero (largo ' + q.svg + ' px)');
  // 11/11: il WebView 126 dà ai <button> «align-items: flex-start» di serie (il Chromium delle prove
  // no): le righe della casella si stringevano a 16 px e le ore di sonno uscivano tagliate («:4»). Qui la regola
  // vecchia entra PRIMA di style.css, al posto di quella del motore: i quadratini devono riempire la casella lo stesso.
  const vecchio = await cp.evaluate(() => { const s = document.createElement('style'); s.textContent = 'button{align-items:flex-start}';
    document.head.insertBefore(s, document.head.firstChild);
    const d = document.querySelector('.cal-d:not(.fut)'), cw = d.getBoundingClientRect().width;
    const rs = [...d.querySelectorAll('.r')].map((r) => Math.round(r.getBoundingClientRect().width / cw * 100));
    s.remove(); return rs; });
  check(Math.min(...vecchio) >= 85, 'col motore del WebView 126 le righe della casella la riempiono ancora: ' + vecchio.join('% · ') + '%');
  check(await cp.locator('.cal-d.now.sel [data-c="sport"] svg').count() === 2,
    'oggi ha DUE disegnini dello sport (i 2 allenamenti delle prove), nel quadratino dello sport');
  check(JSON.stringify(await cp.locator('.tile .tl').allTextContents()) === '["Sleep","Workout","Weight","Substances"]',
    'sotto il giorno: quattro riquadri, in alto Sonno · Allenamento, in basso Peso · Sostanze');
  const tSport = cp.locator('.tile[data-slot="sport"]');
  check((await tSport.locator('.tv').textContent()) === '2' && /Gym · Giorno 1/.test(await tSport.textContent()),
    'oggi, il riquadro Allenamento: 2 (le due palestre delle prove) — ' + (await tSport.textContent()).replace(/\s+/g, ' '));
  check(!EMOJI.test(await cp.locator('body').textContent()), 'il calendario non ha emoji');
  await cp.screenshot({ path: `${SHOT}/${String(++step).padStart(2,'0')}-giorni.png` });

  // 4) due allenamenti: il riquadro apre la finestrella per sceglierne uno; poi «indietro» riporta al calendario
  await tSport.click();
  await cp.waitForTimeout(250);
  check(await cp.locator('#pop .dline').count() === 2, 'due allenamenti nel giorno: la finestrella ne mostra 2');
  check(await cp.evaluate(() => window.SchedaBack()) === true && await cp.locator('#pop').count() === 0 && cp.url().endsWith('#/giorni'),
    '«indietro» chiude la finestrella e resta sul calendario');
  await tSport.click();
  await cp.waitForTimeout(250);
  await cp.locator('#pop .dline').first().click();
  await cp.waitForTimeout(300);
  check(/#\/storico\/.+/.test(cp.url()) && await cp.locator('#pop').count() === 0,
    'un tocco sull\'allenamento lo apre (e la finestrella sparisce): ' + cp.url().split('#')[1]);
  check(await cp.evaluate(() => window.SchedaBack()) === true && cp.url().endsWith('#/giorni'),
    'indietro da lì torna al calendario, non allo storico');
  await cp.waitForTimeout(200);
  check(await cp.locator('.cal-d.sel').count() === 1, 'il calendario ricorda il giorno scelto');

  // 5) il mese prima, l'allenamento di mezzanotte, un giorno vuoto
  let back = 0;
  const target = new Date(2026, 8, 1);
  while ((await cp.locator('h1').textContent()) !== 'September 2026' && back < 60) {
    const cur = await cp.locator('h1').textContent();
    const [mn, yr] = cur.split(' '); const curD = new Date(+yr, MESI.indexOf(mn), 1);
    await cp.locator(curD > target ? '[data-mv="-1"]' : '[data-mv="1"]').click(); back++;
    await cp.waitForTimeout(60);
  }
  check((await cp.locator('h1').textContent()) === 'September 2026', 'si scorre di mese in mese fino a settembre 2026');
  await cp.locator('[data-day="2026-09-15"]').click();
  await cp.waitForTimeout(150);
  check((await tSport.locator('.tv').textContent()) !== '—' && /Giorno 3/.test(await tSport.textContent()),
    'l\'allenamento delle 00:30 (ora di Roma) sta il 15 settembre, non il 14');
  check(await cp.locator('[data-day="2026-09-14"] [data-c]').count() === 0, 'il 14 settembre resta vuoto');
  await cp.locator('[data-day="2026-09-14"]').click();
  await cp.waitForTimeout(150);
  check(await cp.locator('.tile.tile-empty').count() === 4, 'un giorno vuoto: i quattro riquadri vuoti, sempre al loro posto');
  await cp.locator('[data-mv="0"]').click();
  await cp.waitForTimeout(150);
  check((await cp.locator('h1').textContent()) === MESI[now.getMonth()] + ' ' + now.getFullYear()
    && await cp.locator('.cal-d.now.sel').count() === 1, '«Oggi» riporta al mese e al giorno di oggi');

  // 6) la barra in fondo: Giorni e Palestra; dentro Palestra le quattro pagine
  check(JSON.stringify(await cp.locator('#nav .navbtn').allTextContents()) === '["Days","Sport","Sleep","Settings"]',
    'la barra in fondo ha Giorni, Sport, Sonno, Impostazioni (Sostanze non è più una sezione)');
  await cp.locator('#nav [data-area="sport"]').click();
  await cp.waitForTimeout(250);
  check(cp.url().endsWith('#/home') && await cp.locator('#subnav').isVisible()
    && JSON.stringify(await cp.locator('#subnav .subbtn').allTextContents()) === '["Gym","My workouts","Workouts","Records","Plan"]',
    'Sport apre la Palestra, con in alto Palestra · My workouts · Allenamenti · Record · Scheda');
  await cp.locator('#subnav [data-go="#/record"]').click();
  await cp.waitForTimeout(200);
  check(cp.url().endsWith('#/record') && await cp.locator('#nav [data-area="sport"].on').count() === 1,
    'dentro Sport la zona resta accesa in fondo');
  await cp.locator('#nav [data-area="giorni"]').click();
  await cp.waitForTimeout(200);
  check(!(await cp.locator('#subnav').isVisible()), 'nel calendario la barretta dello Sport sparisce');

  // 7) con un allenamento a metà l'app si apre dritta lì, e il calendario lo mostra
  await cp.goto(HOME, { waitUntil: 'networkidle' });
  await cp.locator('[data-day-go]').click();
  await cp.waitForSelector('.setgrid', { state: 'attached' });
  await cp.goto(BASE, { waitUntil: 'networkidle' });
  await cp.waitForTimeout(400);
  check(cp.url().endsWith('#/workout') && await cp.locator('.setgrid').count() > 0,
    'con un allenamento in corso l\'app si riapre DENTRO l\'allenamento');
  await cp.evaluate(() => { location.hash = '#/giorni'; });
  await cp.waitForTimeout(250);
  await tSport.click();
  await cp.waitForTimeout(250);
  check(/resume/i.test(await cp.locator('#pop .dline .vv.t-live').textContent()),
    'nel calendario l\'allenamento in corso è una voce «resume» (in inglese, 11/11)');
  await cx.close();
}

// ============================================ 13. sonno, sport dell'orologio, sostanze, notifica
console.log('\n13. Sonno, orologio, sostanze, notifica della sera');
{
  const cx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
                                        timezoneId: 'Europe/Rome' });
  await finta(cx);
  // il guscio Android finto, col plugin delle notifiche che registra cosa gli si chiede
  await cx.addInitScript(() => {
    window.__ln = { channels: [], scheduled: [], cancelled: 0, listeners: [] };
    window.Capacitor = { Plugins: { LocalNotifications: {
      createChannel: (c) => { window.__ln.channels.push(c); return Promise.resolve(); },
      checkPermissions: () => Promise.resolve({ display: 'granted' }),
      requestPermissions: () => Promise.resolve({ display: 'granted' }),
      cancel: () => { window.__ln.cancelled++; return Promise.resolve(); },
      schedule: (o) => { window.__ln.scheduled = o.notifications.map((n) => ({ ...n, at: n.schedule.at.toISOString() })); return Promise.resolve(); },
      addListener: (ev, fn) => { window.__ln.listeners.push(ev); window.__ln.fire = fn; },
    } } };
    window.SchedaNative = { keepAwake() {}, print() {}, saveFile() { return true; } };
  });
  const cp = await cx.newPage();
  cp.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  cp.on('pageerror', (e) => consoleErrs.push('PAGEERROR: ' + e.message));
  await finestrelle(cp);
  const T = await cp.evaluate(() => 0);   // pagina pronta
  const today = await cp.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });

  // --- il sonno
  await cp.goto(BASE + '#/giorni', { waitUntil: 'networkidle' });
  await cp.locator('[data-pick]').click();
  await cp.waitForTimeout(150);
  check(await cp.locator('.mcell[data-ym="2024-01"].has').count() === 1 && await cp.locator('.mcell[data-ym="2026-09"].has').count() === 1,
    'tocco sul mese: la scelta per anno, accesi i mesi che hanno qualcosa');
  check(await cp.evaluate(() => window.SchedaBack()) === true && await cp.locator('.cal').count() === 1,
    'indietro chiude la scelta del mese e resta nell\'app');
  await cp.locator('[data-pick]').click();
  await cp.locator('[data-ym="2026-09"]').click();
  await cp.waitForTimeout(150);
  check((await cp.locator('h1').textContent()) === 'September 2026', 'scelto settembre 2026, il calendario ci va dritto');
  check(await cp.locator('[data-day="2026-09-15"] [data-c="sonno"].g').textContent() === '6:50'
    && await cp.locator('[data-day="2026-09-16"] [data-c="sonno"]:not(.g):not(.r)').textContent() === '5:40',
    'nel quadratino le ore dormite: 6:50 verde (punteggio 81), 5:40 bianco (66)');
  check(await cp.locator('[data-day="2026-09-15"] [data-c="sonno"]').count() === 1 && await cp.locator('[data-day="2026-09-14"] [data-c="sonno"]').count() === 0,
    'la notte fra il 14 e il 15 sta il 15 (giorno del risveglio): ' + await cp.locator('[data-day="2026-09-15"] [data-c="sonno"]').textContent());
  await cp.locator('[data-day="2026-09-15"]').click();
  await cp.waitForTimeout(150);
  const sl = cp.locator('.tile[data-slot="sonno"]');
  check(/23:30 → 06:30/.test(await sl.textContent()) && /6h50/.test(await sl.textContent()),
    'nel giorno: «Sonno 23:30 → 06:30, 6h50» in ora di Roma (dormito = profondo + leggero + REM) — ' + (await sl.textContent()).replace(/\s+/g, ' '));
  await sl.click();
  await cp.waitForTimeout(250);
  check(cp.url().endsWith('#/sonno/2026-09-15'), 'un tocco apre la notte');
  const big = (await cp.locator('.big').textContent()).replace(/\s/g, '');
  check(big === '6h50' && (await cp.locator('.sl-score b').textContent()) === '81', 'la notte: 6h50 grande, punteggio 81');
  check(await cp.locator('.hyp i').count() === 5, 'l\'ipnogramma ha le 5 fasi della notte: ' + await cp.locator('.hyp i').count());
  check(/1h20.*3h50.*1h40.*10 min/.test((await cp.locator('.phases').textContent()).replace(/\s+/g, ' ')),
    'profondo 1h20 · leggero 3h50 · REM 1h40 · sveglio 10 min');
  check(/resting heart rate 58/.test(await cp.locator('.sub').first().textContent()), 'c\'è il battito a riposo');
  await cp.screenshot({ path: `${SHOT}/${String(++step).padStart(2,'0')}-sonno.png` });
  await cp.locator('[data-to="2026-09-16"]').first().click();
  await cp.waitForTimeout(200);
  check(cp.url().endsWith('#/sonno/2026-09-16') && /No sleep stages for this night/.test(await cp.locator('.card').first().textContent()),
    '«notte dopo» va al 16; senza fasi lo dice, non si rompe');
  check(await cp.evaluate(() => window.SchedaBack()) === true && cp.url().endsWith('#/giorni'), 'indietro dal sonno torna al calendario');

  // --- lo sport dell'orologio
  await cp.locator('[data-day="2026-09-10"]').click();
  await cp.waitForTimeout(150);
  const tWalk = cp.locator('.tile[data-slot="sport"]');
  check((await tWalk.locator('.tv').textContent()) === '45 min' && /Walking/.test(await tWalk.textContent()) && /3.2 km/.test(await tWalk.textContent()),
    'la camminata dell\'orologio sta nel suo giorno, coi km — ' + (await tWalk.textContent()).replace(/\s+/g, ' '));

  // --- ogni allenamento si apre (guasto visto dall'utente sulla 0.2.0: la camminata non apriva niente)
  await tWalk.click();                                   // una sola: si apre dritta, senza finestrella
  await cp.waitForTimeout(250);
  const walkTs = String(ROME('2026-09-10T18:00:00'));
  check(cp.url().endsWith('#/sport/' + walkTs), 'un tocco sulla camminata la apre: ' + cp.url().split('#')[1]);
  const facts = (await cp.locator('.facts').textContent()).replace(/\s+/g, ' ');
  check((await cp.locator('h1').textContent()) === 'Walking' && /45 min/.test(facts) && /3.2 km/.test(facts)
    && /14:04 \/km/.test(facts) && /avg heart rate ?98/.test(facts) && /max heart rate ?120/.test(facts) && /180 kcal/.test(facts),
    'la camminata: 45 min, 3,2 km, passo 14:04/km, battito 98 / 120, 180 kcal — ' + facts);
  check(await cp.evaluate(() => window.SchedaBack()) === true && cp.url().endsWith('#/giorni'),
    'indietro dalla camminata torna al calendario');

  // --- orologio + Scheda: si uniscono per giorno e ora
  await cp.goto(HOME, { waitUntil: 'networkidle' });
  await cp.locator('[data-day-go]').click();
  await cp.waitForSelector('.setgrid', { state: 'attached' });
  await cp.locator('.ex-body:not(.hide) .setrow').first().locator('.tick').click();   // parte
  await cp.locator('.ex-body:not(.hide) .setrow').first().locator('.tick').click();   // fatta
  await cp.waitForTimeout(150);
  await cp.locator('.livebar .btn').click();             // Termina
  await cp.waitForTimeout(400);
  await cp.evaluate(() => { location.hash = '#/giorni'; });
  await cp.waitForTimeout(300);
  await cp.locator('[data-mv="0"]').click();             // «Oggi»: il calendario ricordava il 10 settembre
  await cp.waitForTimeout(150);
  const pal = cp.locator('.tile[data-slot="sport"]');
  check(/Gym · /.test(await pal.textContent()) && /watch .*heart rate 104/.test(await pal.textContent()),
    'la palestra di oggi porta il battito dell\'orologio: ' + (await pal.textContent()).replace(/\s+/g, ' '));
  check(!/Free training/.test(await pal.textContent()) && (await pal.locator('.tv').textContent()) !== '2',
    'e la stessa ora dell\'orologio NON compare una seconda volta come sport');

  // --- Allenamenti: palestra e orologio in una lista, e si scorre fra le sedute
  await cp.locator('#nav [data-area="sport"]').click();
  await cp.waitForTimeout(200);
  await cp.locator('#subnav [data-go="#/allenamenti"]').click();
  await cp.waitForTimeout(250);
  const rows = await cp.locator('.dline .tx b').allTextContents();
  check(rows.length >= 2 && /^Gym · /.test(rows[0]) && rows.includes('Walking') && !rows.includes('Free training'),
    'Allenamenti: la palestra di oggi in cima, la camminata più giù, l\'orologio della palestra non doppio — ' + rows.join(' | '));
  await cp.locator('.dline', { hasText: 'Walking' }).click();
  await cp.waitForTimeout(250);
  check(cp.url().endsWith('#/sport/' + walkTs), 'dalla lista si apre la camminata');
  const before = await cp.locator('[data-sgo]').first().getAttribute('data-sgo');
  await cp.locator('[data-sgo]').last().click();                     // dopo ›
  await cp.waitForTimeout(300);
  check(/#\/storico\/.+/.test(cp.url()), '«dopo ›» dalla camminata va alla seduta seguente, quella di palestra: ' + cp.url().split('#')[1]);
  const wc = (await cp.locator('.wcard').textContent()).replace(/\s+/g, ' ');
  check(/Free training/.test(wc) && /avg heart rate ?104/.test(wc) && /400 kcal/.test(wc),
    'la palestra mostra anche l\'orologio della stessa ora: ' + wc.slice(0, 90));
  await cp.locator('[data-sgo]').first().click();                    // ‹ prima
  await cp.waitForTimeout(300);
  check(cp.url().endsWith('#/sport/' + walkTs), '«‹ prima» torna alla camminata');
  check(await cp.evaluate(() => window.SchedaBack()) === true && cp.url().endsWith('#/allenamenti'),
    'indietro da una seduta aperta dalla lista torna alla lista');
  check(!EMOJI.test(await cp.locator('body').textContent()), 'Allenamenti non ha emoji');
  await cp.evaluate(() => { location.hash = '#/giorni'; });
  await cp.waitForTimeout(250);

  // --- le sostanze: un riquadro del giorno, una finestrella, «Conferma»
  const tSub = cp.locator('.tile[data-slot="sostanze"]');
  check(/to log/.test(await tSub.textContent()) && await cp.locator('.cal-d.now [data-c="sostanze"]').count() === 0,
    'oggi non segnato: il riquadro dice «da segnare», il puntino no');
  const first = await cp.evaluate(() => window.__ln.scheduled.map((n) => n.at));
  const ch = await cp.evaluate(() => window.__ln.channels[0]);
  check(ch && ch.importance === 2 && ch.vibration === false, 'notifica LEGGERA: canale a bassa importanza, senza vibrazione');
  check(await cp.evaluate(() => window.__ln.scheduled.every((n) => n.isExactNotification === false)),
    'notifica NON esatta: senza, Android apre le impostazioni delle sveglie e il plugin resta appeso');
  // 21:30 a Roma, estate o inverno: il 25/10 l'ora legale finisce e 19:30Z diventa 20:30Z
  const roma = (iso) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  check(first.length === 7 && first.every((a) => roma(a) === '21:30'),
    'programmate 7 sere alle 21:30 ora di Roma: ' + first.map(roma).join(' '));
  await tSub.click();
  await cp.waitForTimeout(250);
  check(await cp.locator('#pop .sbt').count() === 0 && /No substances available/.test(await cp.locator('#pop').textContent()),
    'primo avvio: nessuna sostanza di partenza, la finestrella manda alle Impostazioni');
  await cp.evaluate(() => { const d = JSON.parse(localStorage.getItem('health.v1') || '{"v":1,"subs":{}}');
    d.avail = ['caffeina', 'creatina', 'nicotina', 'melatonina', 'thc', 'psilocibina']; localStorage.setItem('health.v1', JSON.stringify(d)); });
  await cp.reload({ waitUntil: 'networkidle' });
  await cp.waitForTimeout(300);
  await tSub.click();
  await cp.waitForTimeout(250);
  check(cp.url().endsWith('#/giorni') && await cp.locator('#pop .sbt').count() === 6 &&
    JSON.stringify(await cp.locator('#pop .sbt b').allTextContents()) === '["Caffeine","Creatine","Nicotine","Melatonin","THC / CBD","Psilocybin"]',
    'scelte sei sostanze: un tocco sul riquadro apre la finestrella del giorno con quelle');
  check(await cp.locator('#pop input, #pop select').count() === 0, 'nella finestrella niente da scrivere: solo spunte');
  await cp.locator('#pop [data-id="caffeina"]').click();
  await cp.locator('#pop [data-id="creatina"]').click();
  check(await cp.evaluate((k) => (JSON.parse(localStorage.getItem('health.v1') || '{}').subs || {})[k], today) === undefined,
    'spuntare non salva ancora: conta solo «Conferma»');
  await cp.locator('#pop [data-ok]').click();
  await cp.waitForTimeout(200);
  const st = await cp.evaluate((k) => JSON.parse(localStorage.getItem('health.v1')).subs[k], today);
  check(JSON.stringify(st) === '["caffeina","creatina"]' && await cp.locator('#pop').count() === 0,
    'Conferma: caffeina e creatina segnate oggi, la finestrella si chiude');
  check((await tSub.locator('.tv').textContent()) === '2' && /Caffeine · Creatine/.test(await tSub.textContent())
    && await cp.locator('.cal-d.now [data-c="sostanze"].ok').textContent() === '2',
    'il riquadro e il calendario lo mostrano subito: ' + (await tSub.textContent()).replace(/\s+/g, ' '));
  const after = await cp.evaluate(() => window.__ln.scheduled.map((n) => n.at));
  const romeNow = await cp.evaluate(() => new Date().getHours() * 60 + new Date().getMinutes());
  check(romeNow >= 21 * 60 + 30 ? after[0] === first[0] : !after.some((a) => a.slice(0, 10) === today) || after[0] > first[0],
    'oggi segnato: la notifica di stasera non parte più (prima: ' + first[0] + ', ora: ' + after[0] + ')');
  await tSub.click();
  await cp.locator('#pop [data-id="caffeina"]').click();
  await cp.locator('#pop [data-cancel]').click();
  check(JSON.stringify(await cp.evaluate((k) => JSON.parse(localStorage.getItem('health.v1')).subs[k], today)) === '["caffeina","creatina"]',
    '«Annulla» non cambia niente');
  await tSub.click();
  await cp.locator('#pop [data-id="caffeina"]').click();
  await cp.locator('#pop [data-ok]').click();
  await cp.waitForTimeout(150);
  check(JSON.stringify(await cp.evaluate((k) => JSON.parse(localStorage.getItem('health.v1')).subs[k], today)) === '["creatina"]',
    'tolta la spunta e confermato: resta la creatina');
  await cp.reload({ waitUntil: 'networkidle' });
  // 300 ms fissi a volte non bastavano (13/10), e nemmeno 3 s di attesa della scritta (16/10, due volte):
  // si aspetta il segnale dell'app — primo disegno fatto — poi la scritta
  await cp.waitForFunction(() => window.Health && Health.pronto === true, null, { timeout: 10000 });
  await tSub.filter({ hasText: 'Creatine' }).waitFor({ timeout: 3000 }).catch(() => {});
  check(/Creatine/.test(await tSub.textContent()), 'riaperta l\'app, è ancora lì');
  await cp.screenshot({ path: `${SHOT}/${String(++step).padStart(2,'0')}-giorno.png` });

  // ieri, dalla strada della notifica: «Conferma» senza spunte = segnato «niente»
  const yk = await cp.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
  await cp.goto(BASE + '#/sostanze/' + yk, { waitUntil: 'networkidle' });
  await cp.waitForTimeout(300);
  check(cp.url().endsWith('#/giorni') && await cp.locator('#pop .sbt').count() === 6 && /Confirm: nothing/i.test(await cp.locator('#pop [data-ok]').textContent()),
    '#/sostanze/<ieri> apre il calendario su ieri con la finestrella aperta');
  await cp.locator('#pop [data-ok]').click();
  await cp.waitForTimeout(150);
  check(JSON.stringify(await cp.evaluate((k) => JSON.parse(localStorage.getItem('health.v1')).subs[k], yk)) === '[]'
    && /nothing/.test(await tSub.textContent()), 'ieri: «Conferma» senza spunte lo segna come niente (diverso da non segnato)');

  // --- Daylio: dal 12/11 è già nel deposito, come segnato qui, senza «from Daylio» (il dettaglio nella 22)
  await cp.goto(BASE + '#/sostanze/2024-01-10', { waitUntil: 'networkidle' });
  await cp.waitForTimeout(300);
  check(!/Daylio/.test(await cp.locator('#pop').textContent()) && await cp.locator('#pop .sbt.on').count() === 1
    && JSON.stringify(await cp.evaluate(() => JSON.parse(localStorage.getItem('health.v1')).subs['2024-01-10'])) === '["caffeina"]',
    'il 10 gennaio 2024: la caffeina di Daylio è nel deposito, spuntata, e nessuna scritta «Daylio»');
  await cp.locator('#pop [data-id="thc"]').click();
  await cp.locator('#pop [data-ok]').click();
  await cp.waitForTimeout(150);
  check(JSON.stringify(await cp.evaluate(() => JSON.parse(localStorage.getItem('health.v1')).subs['2024-01-10'])) === '["caffeina","thc"]',
    'si cambia come ogni altro giorno, senza perdere un segno');

  // --- Impostazioni: il catalogo grande
  await cp.locator('#nav [data-area="impostazioni"]').click();
  await cp.waitForTimeout(250);
  check(cp.url().endsWith('#/impostazioni') && await cp.locator('.avail .arow').first().locator('b').textContent() === 'Caffeine',
    'Impostazioni: le sostanze a disposizione');
  check(await cp.locator('.find').count() === 0, 'il catalogo NON riempie le Impostazioni: c\'è solo il «+»');
  await cp.locator('[data-plus]').click();
  await cp.waitForTimeout(150);
  await cp.locator('#pop .find').fill('alc');
  await cp.waitForTimeout(150);
  const res = await cp.locator('.cat-res .arow b').allTextContents();
  check(res.includes('Alcohol') && !res.includes('Vitamin D') && await cp.locator('[data-new]').count() === 0,
    'cerco «alc»: c\'è l\'Alcol (e non la vitamina D, che ha «alc» in mezzo a una parola) — ' + res.join(', '));
  await cp.locator('[data-add="alcol"]').click();
  await cp.waitForTimeout(150);
  check(await cp.evaluate(() => JSON.parse(localStorage.getItem('health.v1')).avail.includes('alcol')), 'aggiunto: l\'alcol c\'è');
  check(await cp.locator('#pop .find').count() === 1 && await cp.locator('.avail .arow b', { hasText: 'Alcohol' }).count() >= 1,
    'la finestrella resta aperta e l\'alcol è già nella lista sotto');
  await cp.locator('#pop [data-popclose]').click({ position: { x: 10, y: 10 } });
  await cp.locator('[data-rm="thc"]').click();
  await cp.waitForTimeout(100);
  await cp.locator('[data-plus]').click();
  await cp.waitForTimeout(150);
  await cp.locator('#pop .find').fill('zzqq');
  await cp.waitForTimeout(100);
  check(/Not in the catalogue/.test(await cp.locator('.cat-res').textContent()), 'una che il catalogo non conosce: lo dice');
  await cp.locator('[data-new]').click();
  await cp.waitForTimeout(150);
  const av = await cp.evaluate(() => JSON.parse(localStorage.getItem('health.v1')));
  check(!av.avail.includes('thc') && av.avail.includes('x-zzqq') && av.custom['x-zzqq'] === 'zzqq',
    'tolto THC, aggiunta a mano «zzqq»: ' + av.avail.join(','));
  check(!EMOJI.test(await cp.locator('body').textContent()), 'le Impostazioni non hanno emoji');

  // regola 4: tolta dalle disponibili, resta dove era segnata; dove non lo era, sparisce
  await cp.goto(BASE + '#/sostanze/2024-01-10', { waitUntil: 'networkidle' });
  await cp.waitForTimeout(300);
  const old = await cp.locator('#pop .sbt b').allTextContents();
  check(old.includes('THC / CBD') && await cp.locator('#pop [data-id="thc"].on').count() === 1 && /no longer available/.test(await cp.locator('#pop [data-id="thc"]').textContent()),
    'il 10 gennaio 2024 il THC resta, spuntato: «non più a disposizione»');
  check(old.includes('Alcohol') && old.includes('zzqq'), 'e ci sono anche le nuove: Alcol e zzqq');
  await cp.locator('#pop [data-cancel]').click();
  await cp.locator('[data-mv="0"]').click();
  await cp.waitForTimeout(150);
  await tSub.click();
  await cp.waitForTimeout(200);
  const nowList = await cp.locator('#pop .sbt b').allTextContents();
  check(!nowList.includes('THC / CBD') && nowList.includes('Alcohol'), 'oggi, dove il THC non era segnato, sparisce: ' + nowList.join(', '));
  await cp.locator('#pop [data-cancel]').click();

  // --- la notifica, toccata, apre la finestrella di oggi
  await cp.evaluate(() => window.__ln.fire({ notification: { extra: { go: '#/sostanze' } } }));
  await cp.waitForTimeout(300);
  check(cp.url().endsWith('#/giorni') && await cp.locator('#pop .sbt').count() === 7, 'un tocco sulla notifica apre la finestrella di oggi');
  check(await cp.evaluate(() => window.SchedaBack()) === true && await cp.locator('#pop').count() === 0, '«indietro» la chiude');
  await cx.close();
}

// ============================================ 14. il peso dallo screenshot di Laica
console.log('\n14. Il peso: lo screenshot di Laica letto nel telefono');
{
  // LO SCREENSHOT FINTO. Quello vero dell'utente sta in private/ e la prova non lo
  // legge mai: qui si disegna sul momento una pagina «DATI PESATE» con lo
  // stesso aspetto di Laica (1080×2340, tre colonne) e numeri inventati.
  // Altezza finta 1,70 m: il bmi torna col peso. La pesata del 2 marzo ha un
  // bmi che NON torna: deve arrivare «da controllare», senza spunta.
  const FINTE = [
    { d: '18/05/2026', o: '07:41:09', kg: '70.4', fat: '18.25', water: '60.12', muscle: '44.31', bmr: '1702', bmi: '24.36' },
    { d: '03/05/2026', o: '19:02:55', kg: '71.0', fat: '18.6',  water: '59.87', muscle: '44.05', bmr: '1711', bmi: '24.57' },
    { d: '21/04/2026', o: '08:15:30', kg: '72.6', fat: '19.4',  water: '59.21', muscle: '43.72', bmr: '1730', bmi: '25.12' },
    { d: '02/03/2026', o: '22:48:17', kg: '73.1', fat: '19.73', water: '58.98', muscle: '43.5',  bmr: '1736', bmi: '29.95' },
    { d: '14/02/2026', o: '06:59:01', kg: '74.2', fat: '20.12', water: '58.6',  muscle: '43.18', bmr: '1749', bmi: '25.67' },
  ];
  const card = (p, i) => {
    const top = 215 + i * 369;
    const val = (x, y, v, u) => `<div style="position:absolute;left:${x}px;top:${top + y}px;font:bold 58px sans-serif;color:#1a8fd0">${v}<span style="font-size:22px"> ${u}</span></div>`;
    const lab = (x, y, t) => `<div style="position:absolute;left:${x}px;top:${top + y}px;font:bold 22px sans-serif;color:#3aa0dc">${t}</div>` +
      `<div style="position:absolute;left:${x}px;top:${top + y - 88}px;width:66px;height:66px;border:3px solid #3aa0dc;border-radius:8px"></div>`;
    return `<div style="position:absolute;left:30px;top:${top + 30}px;font:30px sans-serif;color:#0d2f66;line-height:37px">${p.d}<br>${p.o}</div>` +
      `<div style="position:absolute;left:30px;top:${top + 120}px;font:92px sans-serif;color:#0d2f66">${p.kg}</div>` +
      `<div style="position:absolute;left:34px;top:${top + 260}px;font:44px sans-serif;color:#0d2f66">kg</div>` +
      val(375, 18, p.fat, '%') + lab(283, 106, 'grasso corporeo') +
      val(375, 131, p.water, '%') + lab(283, 219, 'acqua') +
      val(375, 244, p.muscle, '%') + lab(283, 332, 'muscoli') +
      val(777, 18, p.bmr, 'Kcal') + lab(684, 106, 'bmr') +
      val(777, 131, p.bmi, '') + lab(684, 219, 'bmi') +
      `<div style="position:absolute;left:0;right:0;top:${top + 360}px;height:2px;background:#9aa7b4"></div>`;
  };
  const html = '<body style="margin:0;width:1080px;height:2340px;background:#fff;position:relative;overflow:hidden">' +
    '<div style="position:absolute;left:0;right:0;top:0;height:215px;background:#0a4f9a;color:#fff;font:16px sans-serif;text-align:center;line-height:300px">DATI PESATE</div>' +
    FINTE.map(card).join('') +
    '<div style="position:absolute;left:0;right:0;bottom:0;height:194px;background:#0a2a6a"></div></body>';
  const pc = await browser.newContext({ viewport: { width: 1080, height: 2340 }, deviceScaleFactor: 1 });
  const pp = await pc.newPage();
  await pp.setContent(html);
  const LAICA = await pp.screenshot({ type: 'jpeg', quality: 92 });
  await pp.setContent('<body style="margin:0;width:1080px;height:2340px;background:#123;color:#eee;font:40px sans-serif;padding:80px">Una foto qualunque, niente pesate.</body>');
  const ALTRO = await pp.screenshot({ type: 'png' });
  await pc.close();
  fs.writeFileSync(path.join(SHOT, 'laica-finta.jpg'), LAICA);

  const cx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Europe/Rome' });
  await finta(cx);
  const cp = await cx.newPage();
  cp.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  cp.on('pageerror', (e) => consoleErrs.push('PAGEERROR: ' + e.message));
  await finestrelle(cp);
  const peso = () => cp.evaluate(() => JSON.parse(localStorage.getItem('health.peso.v1') || 'null'));
  const leggi = async (buf, name, mime) => {
    await cp.locator('#pesofile').setInputFiles({ name, mimeType: mime, buffer: buf });
    await cp.locator('#pop h2', { hasNotText: 'Reading the screenshot' }).waitFor({ timeout: 90000 });
  };

  await cp.goto(BASE + '#/giorni', { waitUntil: 'networkidle' });
  const tile = cp.locator('.tile[data-slot="peso"]');
  check(!(await tile.isDisabled()) && /read a screenshot/.test(await tile.textContent()),
    'il riquadro Peso di oggi è acceso: «leggi uno screenshot»');
  const avvio = await cp.evaluate(() => [...document.scripts].some((s) => /tesseract/.test(s.src)));
  check(!avvio, 'il lettore NON si carica all\'avvio (l\'app resta leggera)');
  await tile.click();
  await cp.waitForTimeout(150);
  check(await cp.locator('#pop label[for="pesofile"]').count() === 1, 'la finestrella del giorno ha «Leggi uno screenshot di Laica»');

  const t0 = Date.now();
  await leggi(LAICA, 'Screenshot_Laica.jpg', 'image/jpeg');
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  check((await cp.locator('#pop h2').textContent()) === 'Check the numbers against Laica', 'letto in ' + secs + ' s: «Controlla i numeri con Laica»');
  check(await cp.locator('#pop .pbt').count() === 5, 'trovate tutte e 5 le pesate: ' + await cp.locator('#pop .pbt').count());
  const dub = cp.locator('#pop .pbt[data-t="2026-03-02T22:48:17"]');
  check(await dub.count() === 1 && !(await dub.getAttribute('class')).includes(' on') && /do not match/.test(await dub.textContent()),
    'il 2 marzo (bmi che non torna col peso) arriva senza spunta: «controlla con Laica»');
  check((await cp.locator('#pop [data-ok]').textContent()) === 'Save 4', 'pronte da salvare 4, non 5');
  await cp.screenshot({ path: `${SHOT}/${String(++step).padStart(2,'0')}-peso-conferma.png` });
  await cp.locator('#pop [data-ok]').click();
  await cp.waitForTimeout(250);
  const atteso = {};
  FINTE.filter((p) => p.d !== '02/03/2026').forEach((p) => {
    const [g, m, a] = p.d.split('/');
    atteso[a + '-' + m + '-' + g + 'T' + p.o] = { kg: +p.kg, fat: +p.fat, water: +p.water, muscle: +p.muscle, bmr: +p.bmr, bmi: +p.bmi };
  });
  const salvate = await peso();
  check(salvate && JSON.stringify(salvate.pesate, Object.keys(atteso).sort().concat(['kg', 'fat', 'water', 'muscle', 'bmr', 'bmi'])) ===
    JSON.stringify(atteso, Object.keys(atteso).sort().concat(['kg', 'fat', 'water', 'muscle', 'bmr', 'bmi'])) && Object.keys(salvate.pesate).length === 4,
    'salvate le 4 pesate, OGNI numero uguale allo screenshot (grasso, acqua, muscoli, bmr, bmi nell\'ordine giusto)');
  if (salvate && Object.keys(salvate.pesate).length) {
    const diff = Object.keys(atteso).filter((k) => JSON.stringify(salvate.pesate[k]) !== JSON.stringify(atteso[k]));
    if (diff.length) console.log('      letti: ' + JSON.stringify(salvate.pesate));
  }
  check((await cp.locator('h1').textContent()) === 'May 2026' && /70.4 kg/.test(await tile.textContent()),
    'il calendario va sul giorno dell\'ultima pesata: Peso «70,4 kg» — ' + (await tile.textContent()).replace(/\s+/g, ' '));
  check(/^\d\d\.\d$/.test(await cp.locator('[data-day="2026-05-18"] [data-c="peso"]').textContent()), 'il 18 maggio ha i suoi kg, col decimale: ' + await cp.locator('[data-day="2026-05-18"] [data-c="peso"]').textContent());

  // lo stesso screenshot una seconda volta: niente doppioni
  await tile.click();
  await cp.waitForTimeout(150);
  await leggi(LAICA, 'Screenshot_Laica.jpg', 'image/jpeg');
  check(await cp.locator('#pop .pbt.off').count() === 4 && /already saved/.test(await cp.locator('#pop .pbt.off').first().textContent()) &&
    (await cp.locator('#pop [data-ok]').isDisabled()),
    'riletto lo stesso screenshot: 4 «già salvata», niente da salvare');
  await cp.locator('#pop [data-cancel]').click();

  // un'immagine che non è Laica: lo dice e non salva niente
  await tile.click();
  await cp.waitForTimeout(150);
  await leggi(ALTRO, 'foto.png', 'image/png');
  check((await cp.locator('#pop h2').textContent()) === 'No weigh-ins found' && Object.keys((await peso()).pesate).length === 4,
    'una foto qualunque: «Nessuna pesata trovata», niente salvato');
  await cp.locator('#pop [data-cancel]').click();

  // togliere una pesata (sbagliata o di un altro) dal suo giorno
  await tile.click();
  await cp.waitForTimeout(150);
  await cp.locator('#pop [data-rm="2026-05-18T07:41:09"]').click();
  await cp.waitForTimeout(150);
  check(!(await peso()).pesate['2026-05-18T07:41:09'] && Object.keys((await peso()).pesate).length === 3, '«Togli» toglie solo quella pesata');
  await cp.locator('#pop [data-popclose]').click({ position: { x: 10, y: 10 } });
  check(!EMOJI.test(await cp.locator('body').textContent()), 'il peso non ha emoji');
  await cx.close();
}

// ============================================ 15. i tuoi dati: esporta, ricarica, PDF
console.log('\n15. I tuoi dati: Esporta tutto, Ricarica da un file, Tutto in PDF');
{
  const cx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Europe/Rome' });
  await finta(cx);
  await cx.addInitScript(() => {
    window.__saved = [];
    window.SchedaNative = { keepAwake() {}, print() { window.__printed = true; }, saveFile(n, t) { window.__saved.push([n, t]); return true; } };
  });
  const cp = await cx.newPage();
  cp.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  cp.on('pageerror', (e) => consoleErrs.push('PAGEERROR: ' + e.message));
  await finestrelle(cp);
  const dialogs = FINESTRE;
  // depositi anonimi, fatti qui
  // col segno «daylio»: un deposito che ha già adottato Daylio non riceve più niente dalla storia
  const SOST = { v: 1, subs: { '2026-03-04': ['caffeina'], '2026-03-05': [], '2026-03-06': ['alcol', 'creatina'], '2026-03-07': ['cocaina'], '2026-03-08': ['alcol', 'nicotina', 'thc'] }, avail: ['caffeina', 'alcol'], custom: {}, daylio: { fatto: '2026-03-01T00:00:00.000Z', giorni: 0 } };
  const PESO = { v: 1, pesate: { '2026-03-04T08:10:00': { kg: 70.4, fat: 18.2, water: 55.1, muscle: 40.3, bmr: 1650, bmi: 22.1 } } };
  await cp.goto(BASE + '#/impostazioni', { waitUntil: 'networkidle' });
  await cp.evaluate(([s, w]) => { localStorage.setItem('health.v1', JSON.stringify(s)); localStorage.setItem('health.peso.v1', JSON.stringify(w)); }, [SOST, PESO]);
  await cp.reload({ waitUntil: 'networkidle' });
  const dep = () => cp.evaluate(() => ['scheda.v1', 'health.v1', 'health.peso.v1'].map((k) => localStorage.getItem(k)));
  const prima = await dep();
  await cp.locator('[data-xall]').click();
  await cp.waitForFunction(() => window.__saved.length > 0);
  const saved = await cp.evaluate(() => window.__saved);
  const pk = saved.length === 1 ? JSON.parse(saved[0][1]) : {};
  check(saved.length === 1 && /^151-health-\d{8}\.json$/.test(saved[0][0]), 'Esporta tutto scrive UN file in Download: ' + (saved[0] || [''])[0]);
  check(JSON.stringify(pk.sostanze) === JSON.stringify(SOST) && JSON.stringify(pk.peso) === JSON.stringify(PESO) && pk.scheda && Array.isArray(pk.scheda.history),
    'nel file ci sono sostanze, pesate e palestra, identiche al telefono');
  // un file qualunque non tocca niente
  await cp.locator('#xfile').setInputFiles({ name: 'altro.json', mimeType: 'application/json', buffer: Buffer.from('{"v":1,"history":[]}') });
  await cp.waitForTimeout(200);
  check(dialogs.some((m) => /is not an "Export everything" file/.test(m)) && JSON.stringify(await dep()) === JSON.stringify(prima), 'un file che non è di 151 Health: rifiutato, niente cambia');
  // telefono vuoto → ricarica il file esportato → tutto torna
  await cp.evaluate(() => localStorage.clear());
  await cp.locator('#xfile').setInputFiles({ name: saved[0][0], mimeType: 'application/json', buffer: Buffer.from(saved[0][1]) });
  await cp.waitForLoadState('networkidle'); await cp.waitForTimeout(400);
  const dopo = await dep();
  check(dopo[1] === prima[1] && dopo[2] === prima[2] && JSON.parse(dopo[0]).history.length === JSON.parse(prima[0]).history.length,
    'telefono vuoto + «Ricarica da un file» = sostanze, pesate e palestra di nuovo al loro posto');
  check(dialogs.some((m) => /5 days of substances/.test(m) && /1 weigh-ins/.test(m)), 'prima di ricaricare dice cosa c\'è dentro');
  // il colore delle sostanze nel calendario: la peggiore vince, tre gialle fanno rosso
  await cp.goto(BASE + '#/giorni', { waitUntil: 'networkidle' });
  await cp.evaluate(() => Health.pick('2026-03-04'));
  await cp.goto(BASE + '#/impostazioni'); await cp.goto(BASE + '#/giorni'); await cp.waitForTimeout(200);
  const col = async (k) => cp.locator('[data-day="' + k + '"] [data-c="sostanze"]').getAttribute('class');
  check(/ok/.test(await col('2026-03-04')) && /zero/.test(await col('2026-03-05')) && /mid/.test(await col('2026-03-06'))
    && /bad/.test(await col('2026-03-07')) && /bad/.test(await col('2026-03-08')),
    'sostanze: caffeina verde, «0» col contorno, alcol+creatina giallo, cocaina rosso, tre gialle rosso');
  check(await cp.locator('[data-day="2026-03-04"] [data-c="peso"]').textContent() === '70.4', 'il peso nella casella col decimale: 70.4');
  await cp.goto(BASE + '#/impostazioni', { waitUntil: 'networkidle' });
  await cp.locator('[data-lvl="caffeina"]').click();
  await cp.waitForTimeout(100);
  check(await cp.locator('[data-lvl="caffeina"] i.lv-mid').count() === 1, 'un tocco sul pallino: la caffeina diventa gialla');
  await cp.goto(BASE + '#/giorni'); await cp.waitForTimeout(200);
  check(/mid/.test(await col('2026-03-04')), 'e il 4 marzo nel calendario diventa giallo');
  // un giorno col record: il disegnino oro si vede (il 13/10 «pr» si scontrava con le righe dei record e spariva)
  await cp.evaluate(() => { const s = Date.now() - 86400000; Health.palestra = () => [{ start: s, end: s + 3600000, title: 'Palestra · A', value: '1 rec', tone: 'pr', go: '#/x' }];
    Health.pick(Health.ymd(new Date())); location.hash = '#/sonno'; });
  await cp.waitForTimeout(100);
  await cp.evaluate(() => { location.hash = '#/giorni'; });
  await cp.waitForTimeout(250);
  const recW = await cp.evaluate(() => { const s = document.querySelector('.cal-d [data-c="sport"].rec svg'); if (!s) return 0;
    const c = getComputedStyle(s), r = s.getBoundingClientRect();   // il disegno vero = scatola meno i margini interni
    return Math.min(r.width - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight), r.height - parseFloat(c.paddingTop) - parseFloat(c.paddingBottom)); });
  check(recW >= 9, 'un allenamento col record: il disegnino oro si vede (largo ' + recW + ' px)');
  // il PDF da leggere
  await cp.goto(BASE + '#/impostazioni', { waitUntil: 'networkidle' });
  await cp.locator('[data-xpdf]').click();
  await cp.waitForTimeout(200);
  const foglio = await cp.locator('#sheet.on').textContent();
  check(/March 2026/.test(foglio) && /70[.,]4/.test(foglio) && /Substances/.test(foglio), 'Tutto in PDF: il foglio ha i mesi, le pesate e le sostanze');
  await cp.locator('#sheet #doPrint').click();
  check(await cp.evaluate(() => window.__printed === true), '«Salva come PDF» passa al telefono');
  await cp.screenshot({ path: `${SHOT}/${String(++step).padStart(2,'0')}-tutto-in-pdf.png` });
  await cx.close();
}

// ============================================ 11. nel telefono: recupero, schermo, indietro
console.log('\n11. Fra una serie e l\'altra (come nell\'APK)');
// il guscio Android finto: registra cosa gli chiede l'app
const apk = await ctx.newPage();
apk.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
apk.on('pageerror', (e) => consoleErrs.push('PAGEERROR: ' + e.message));
await finestrelle(apk);
await apk.addInitScript(() => {
  window.__awake = [];
  window.Capacitor = {};
  window.SchedaNative = { keepAwake: (on) => window.__awake.push(on), print() {}, saveFile() { return true; } };
});
await apk.goto(HOME, { waitUntil: 'networkidle' });
await apk.waitForTimeout(300);
await apk.locator('[data-day-go]').click();
await apk.waitForSelector('.setgrid', { state: 'attached' });
await apk.waitForTimeout(200);
check(JSON.stringify(await apk.evaluate(() => window.__awake)) === '[true]',
  'iniziato l\'allenamento, lo schermo resta acceso (il guscio riceve keepAwake(true))');

// il recupero CONTA IN AVANTI: parte alla spunta, niente bottone in fondo
check(await apk.locator('.exfoot [data-rest]').count() === 0, 'il bottone «Recupero» in fondo all\'esercizio non c\'è più');
const firstRow = apk.locator('.ex-body:not(.hide) .setrow').first();
const clock = () => apk.evaluate(() => { const c = document.getElementById('liveClock');
  return { rest: c.classList.contains('rest'), txt: c.textContent.replace(/\s+/g, '') }; });
const activeSet = () => apk.evaluate(() => { const a = JSON.parse(localStorage.getItem('scheda.v1')).active;
  return a.sets[a.order[0]][0]; });
const tTick = Date.now();
await firstRow.locator('.tick').click();          // parte
await firstRow.locator('.tick').click();          // fatta
await apk.waitForTimeout(250);
let clk = await clock();
check(clk.rest && /rest0:0[01]$/.test(clk.txt), 'fatta la serie (secondo tocco), il quadrante parte da 0:00 e dice «rest»: "' + clk.txt + '"');
const s1 = await activeSet();
check(s1.done && s1.t0 >= tTick && s1.t1 >= s1.t0 && s1.t1 <= Date.now(), 'la serie ha l\'ora d\'inizio (primo tocco) e di fine (secondo)');
await apk.waitForTimeout(2200);
clk = await clock();
check(clk.rest && /rest0:0[1-4]$/.test(clk.txt), 'due secondi dopo conta in avanti, non all\'indietro: "' + clk.txt + '"');
await apk.screenshot({ path: `${SHOT}/${String(++step).padStart(2,'0')}-recupero.png` });
await apk.locator('#liveClock').click();
await apk.waitForTimeout(150);
check((await clock()).rest, 'toccare il quadrante non lo spegne: il recupero si ferma solo quando parte la serie dopo');
await apk.reload({ waitUntil: 'networkidle' });
await apk.waitForTimeout(400);
clk = await clock();
check(clk.rest && /rest0:0[2-5]$/.test(clk.txt), 'riaperta la pagina, il recupero c\'è ancora e conta da dove era: "' + clk.txt + '"');
// parte la serie dopo: primo tocco sulla sua spunta → il recupero si ferma
const row2 = apk.locator('.ex.open .setrow').nth(1);
await row2.locator('.tick').click();
await apk.waitForTimeout(250);
check(!(await clock()).rest && await row2.evaluate((r) => r.classList.contains('run')), 'primo tocco sulla serie dopo: parte lei, il recupero si ferma');
await apk.reload({ waitUntil: 'networkidle' });
await apk.waitForTimeout(1300);
check(await apk.locator('.ex.open .setrow').nth(1).evaluate((r) => r.classList.contains('run'))
  && /^0:0[1-3]$/.test(await apk.locator('.ex.open .setrow').nth(1).locator('.tick .tt').textContent()) && !(await clock()).rest,
  'riaperta l\'app la serie corre ancora, col suo tempo: ' + await apk.locator('.ex.open .setrow').nth(1).locator('.tick .tt').textContent());
await apk.locator('.ex.open .setrow').nth(1).locator('.tick').click();
await apk.waitForTimeout(150);
const s2 = await apk.evaluate(() => { const a = JSON.parse(localStorage.getItem('scheda.v1')).active; return a.sets[a.order[0]][1]; });
check(s2.done && s2.t0 && s2.t1 > s2.t0, 'secondo tocco: fatta, con inizio e fine');
check((await clock()).rest, 'e il recupero riparte dalla sua fine');
await apk.locator('.ex.open .setrow').nth(1).locator('.tick').click();
await apk.locator('.ex.open .setrow').first().locator('.tick').click();          // tolte le spunte: niente recupero, niente orari
await apk.waitForTimeout(200);
const s1b = await activeSet();
check(!(await clock()).rest && !s1b.done && !s1b.t1 && !s1b.t0, 'togliere la spunta ferma il recupero e toglie gli orari');

// il tasto indietro del telefono: risale, non butta fuori
check(await apk.evaluate(() => window.SchedaBack()) === true && apk.url().endsWith('#/home'),
  'indietro durante l\'allenamento torna a Oggi (l\'allenamento resta in corso)');
await apk.waitForTimeout(200);
check(JSON.stringify(await apk.evaluate(() => window.__awake)) === '[true,false]',
  'fuori dall\'allenamento lo schermo torna a spegnersi da solo');
check(await apk.evaluate(() => window.SchedaBack()) === true && apk.url().endsWith('#/giorni'),
  'indietro da Oggi porta al calendario dei giorni');
await apk.waitForTimeout(150);
check(await apk.evaluate(() => window.SchedaBack()) === false,
  'indietro dal calendario lascia uscire dall\'app');
await apk.evaluate(() => { location.hash = '#/storico'; });
await apk.waitForTimeout(200);
check(await apk.evaluate(() => window.SchedaBack()) === true && apk.url().endsWith('#/home'),
  'indietro dallo Storico torna a Oggi');
await apk.close();

// ============================================ 16. i dati non escono da soli
console.log('\n16. Niente copia Google: i dati escono solo con «Esporta tutto»');
{
  const man = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  check(/android:allowBackup="false"/.test(man) && /android:fullBackupContent="false"/.test(man),
    'il manifest spegne il backup di Android (allowBackup e fullBackupContent a false)');
  const rp = path.join(ROOT, 'android/app/src/main/res/xml/data_extraction_rules.xml');
  const rules = fs.existsSync(rp) ? fs.readFileSync(rp, 'utf8') : '';
  const blocco = t => (rules.match(new RegExp('<' + t + '>([\\s\\S]*?)</' + t + '>')) || [])[1] || '';
  const tutto = b => ['root', 'file', 'database', 'sharedpref'].every(d => b.includes('<exclude domain="' + d + '"'));
  check(/dataExtractionRules="@xml\/data_extraction_rules"/.test(man) && tutto(blocco('cloud-backup')) && tutto(blocco('device-transfer')),
    'Android 12+: né cloud né passaggio a un altro telefono (tutti i domini esclusi)');
}

// ===================================== 17. il collegamento a Zepp (finto server)
console.log('\n17. «Estrai dati orologio»: il collegamento a Zepp, contro un finto server');
{
  // Il nucleo è Java puro (android/.../zepp/): si compila e si prova qui, col JDK,
  // contro il finto Zepp di tests/java/ZeppProva.java. Nessuna rete vera, nessun dato dell'utente.
  const JDK = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin') : '';   // '' = dal PATH
  const Z = path.join(ROOT, 'android/app/src/main/java/com/the151universe/health/zepp');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'health-zepp-'));
  try {
    const javac = spawnSync(path.join(JDK, 'javac'), ['-Xlint:-options', '--release', '11', '-d', tmp,
      ...['Rete', 'MiniJson', 'ZeppCloud'].map(n => path.join(Z, n + '.java')),
      path.join(HERE, 'java/ZeppProva.java')], { encoding: 'utf8' });
    check(javac.status === 0, 'il nucleo Zepp compila senza Android (Java puro)' + (javac.status ? ': ' + javac.stderr.slice(0, 400) : ''));
    if (javac.status === 0) {
      const run = spawnSync(path.join(JDK, 'java'), ['-cp', tmp, 'com.the151universe.health.zepp.ZeppProva'],
        { encoding: 'utf8', timeout: 60000 });
      const righe = (run.stdout || '').split('\n');
      for (const r of righe) {             // nell'ordine in cui la prova Java li ha stampati
        if (/^  · /.test(r)) console.log('  ' + r.trim());
        else if (/^  (ok|NO)  /.test(r)) check(r.startsWith('  ok  '), 'zepp: ' + r.slice(6));
      }
      check(run.status === 0 && righe.some(r => r.includes('TUTTO VERDE')),
        'la prova Java finisce in verde (exit ' + run.status + (run.signal ? ', ' + run.signal : '') + ')');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const man = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  check(/uses-permission android:name="android.permission.INTERNET"/.test(man) &&
    /android:networkSecurityConfig="@xml\/network_security_config"/.test(man),
    'il manifest ha INTERNET (solo per Zepp) e la sua regola di rete');
  const nsc = fs.readFileSync(path.join(ROOT, 'android/app/src/main/res/xml/network_security_config.xml'), 'utf8');
  check(/cleartextTrafficPermitted="false"/.test(nsc) && /<certificates src="system"/.test(nsc) && !/src="user"/.test(nsc),
    'niente http in chiaro, solo certificati di sistema');
  const main = fs.readFileSync(path.join(ROOT, 'android/app/src/main/java/com/the151universe/health/MainActivity.java'), 'utf8');
  const iSenza = main.indexOf('registerPlugin(SenzaRetePlugin.class)'), iSuper = main.indexOf('super.onCreate(savedInstanceState)');
  check(main.includes('registerPlugin(ZeppPlugin.class)') && iSenza > 0 && iSenza < iSuper,
    'MainActivity registra Zepp e il tappo sul modulo di rete di Capacitor, prima di avviare il ponte');
  check(/setWebViewClient\(new MuroPagina/.test(main) && /Rete\.paginaPuo\(/.test(main),
    'la WebView passa dal muro (MuroPagina → Rete.paginaPuo): la pagina resta senza rete');
  const tappo = fs.readFileSync(path.join(Z, 'SenzaRetePlugin.java'), 'utf8');
  check(/@CapacitorPlugin\(name = "CapacitorHttp"\)/.test(tappo) &&
    ['request', 'get', 'post', 'put', 'patch', 'delete'].every(m => new RegExp('public void ' + m + '\\(PluginCall call\\) \\{ no\\(call\\); \\}').test(tappo)),
    'il tappo prende il nome «CapacitorHttp» e dice no a tutti i suoi metodi');
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
  check(!(cfg.plugins && cfg.plugins.CapacitorHttp && cfg.plugins.CapacitorHttp.enabled) && !(cfg.server && cfg.server.url),
    'Capacitor non instrada la rete della pagina (CapacitorHttp spento, nessun server esterno)');
  const web = fs.readdirSync(path.join(ROOT, 'www')).filter(f => f.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(ROOT, 'www', f), 'utf8')).join('\n');
  check(!/huami\.com|zepp\.com/.test(web), 'nessun indirizzo Zepp nel codice della pagina: parla solo il pezzetto Android');
}

// ======================================== 18. «Estrai dati orologio» nella pagina
console.log('\n18. «Estrai dati orologio»: il bottone, il deposito, la ripresa');
{
  // Il plugin Zepp finto: dati anonimi fatti qui sul momento (nessun dato dell'utente).
  // L'account è «nato» 200 giorni fa; manca una settimana (come il buco vero di Zepp);
  // gli allenamenti arrivano in due pagine che si sovrappongono di uno.
  const FINTO_ZEPP = () => {
    const d2 = (n) => String(n).padStart(2, '0');
    const ymd = (d) => d.getFullYear() + '-' + d2(d.getMonth() + 1) + '-' + d2(d.getDate());
    const piu = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
    const oggi = ymd(new Date());
    const nato = new Date(oggi + 'T09:00:00'); nato.setDate(nato.getDate() - 200);
    const buco = [piu(oggi, -150), piu(oggi, -145)];
    const z = window.__z = { accesso: false, email: null, pw: null, rifiutato: false, calls: [], sveglio: [],
                             falliscaAl: null, dimenticato: 0, oggi, inizio: ymd(nato), buco };
    const no = (code, message) => Promise.reject(Object.assign(new Error(message), { code }));
    const giorni = (da, a, tipo) => {
      const out = [];
      for (let g = da; g <= a; g = piu(g, 1)) {
        if (g >= buco[0] && g <= buco[1]) continue;
        out.push(tipo === 'r'
          ? { uid: '1', date_time: g, source: 1, uuid: 'u-' + g, summary: btoa(JSON.stringify({
              slp: { st: Math.floor(new Date(piu(g, -1) + 'T23:30:00').getTime() / 1000), ed: Math.floor(new Date(g + 'T07:00:00').getTime() / 1000),
                     dp: 90, lt: 240, dt: 90, wk: 30, ss: 80, rhr: 55, stage: [{ start: 1410, stop: 1499, mode: 5 }, { start: 1500, stop: 1739, mode: 4 }] },
              stp: { ttl: 5000 } })) }
          : { uid: '1', date_time: g, summary: 'eyJ9', data: 'AAAA'.repeat(4), data_hr: '/////w==', uuid: 'u-' + g });
      }
      return out;
    };
    const G = 86400, T0 = Math.floor(new Date(piu(oggi, -10) + 'T08:00:00').getTime() / 1000);
    z.T0 = T0;
    const W = (id, extra) => Object.assign({ trackid: String(id), end_time: String(id + 1800), type: '1', run_time: '1800', dis: '5000.5',
      calorie: '300.0', avg_heart_rate: '140', max_heart_rate: '170', campo_raro_186: 'tenuto' }, extra || {});
    window.Capacitor = { Plugins: { Zepp: {
      stato: () => Promise.resolve({ accesso: z.accesso, email: z.email, rifiutato: z.rifiutato, tokenValido: false, minutiFermo: 0, minutiProssimoLogin: 0 }),
      salvaAccesso: (o) => { z.accesso = true; z.email = o.email; z.pw = o.password; z.rifiutato = false; return Promise.resolve(); },
      dimentica: () => { z.dimenticato++; z.accesso = false; z.pw = null; return Promise.resolve(); },
      scarica: (o) => {
        z.calls.push(o);
        if (z.falliscaAl && z.falliscaAl(o, z.calls)) return no('ATTESA', 'There was a Zepp login a short while ago: try again in 37 minutes.');
        if (o.cosa === 'profilo') return Promise.resolve({ corpo: JSON.stringify({ userId: '1', createTime: Math.floor(nato.getTime() / 1000), height: 180 }) });
        if (o.cosa === 'riepilogo' || o.cosa === 'minuti')
          return Promise.resolve({ corpo: JSON.stringify({ code: 1, message: 'success', data: giorni(o.da, o.a, o.cosa === 'riepilogo' ? 'r' : 'm') }) });
        if (o.cosa === 'allenamenti') {
          const corpo = !o.primaDi
            ? { code: 1, data: { next: T0 + 2 * G, summary: [W(T0 + 6 * G, { type: '132' }), W(T0 + 5 * G, { end_time: String(T0 + 5 * G + 30) }),
                                                            W(T0 + 4 * G), W(T0 + 3 * G), W(T0 + 2 * G)] } }
            : { code: 1, data: { next: -1, summary: [W(T0 + 2 * G), W(T0 + G), W(T0, { sport_title: 'à mano', type: '6' })] } };
          return Promise.resolve({ corpo: JSON.stringify(corpo) });
        }
        return no('DOMANDA', 'Richiesta sconosciuta.');
      },
    } } };
    z.salvati = [];
    window.SchedaNative = { keepAwake(on) { z.sveglio.push(on); }, print() {}, saveFile(n, t) { z.salvati.push([n, t]); return true; } };
  };

  // Il passato «dentro l'APK» per questa sezione: una notte che lo scaricato deve battere,
  // una che deve restare, un allenamento uguale a uno scaricato (niente doppioni), uno solo suo.
  // date e ore di Roma contate sul calendario (mai «n × 24 ore» né +02:00 fisso: il cambio d'ora le sposta)
  const romaYmd = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const giornoFa = (n) => { const d = new Date(romaYmd(new Date()) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const romaEpoch = (iso, hh) => {          // secondi di «iso alle hh:00» a Roma
    const t = Date.parse(iso + 'T' + String(hh).padStart(2, '0') + ':00:00Z');
    const vista = Date.parse(new Date(t).toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).replace(' ', 'T') + 'Z');
    return Math.floor((t - (vista - t)) / 1000);
  };
  const T0n = romaEpoch(giornoFa(10), 8);
  const STORIA18 = { v: 1,
    sleep: { [giornoFa(10)]: [T0n - 30000, T0n - 3600, 10, 10, 10, 0, 50, 60, []], [giornoFa(300)]: [T0n - 300 * 86400, T0n - 300 * 86400 + 25000, 100, 200, 100, 10, 77, 58, []] },
    sport: [[T0n + 86400, T0n + 86400 + 1800, 1, 'Corsa all\'aperto', 5000, 300, 140, 170], [T0n - 400 * 86400, T0n - 400 * 86400 + 3600, 6, 'Camminata', 3000, 200, 100, 120]],
    subs: {} };

  const nuovo = async () => {
    const cx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Europe/Rome' });
    await cx.route('**/data/storia.json', (r) => r.fulfill({ json: STORIA18 }));
    await cx.addInitScript(FINTO_ZEPP);
    const cp = await cx.newPage();
    cp.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
    cp.on('pageerror', (e) => consoleErrs.push('PAGEERROR: ' + e.message));
    await finestrelle(cp);
    await cp.goto(BASE + '#/impostazioni', { waitUntil: 'networkidle' });
    return { cx, cp };
  };
  const Z = (cp) => cp.evaluate(() => JSON.parse(JSON.stringify(window.__z)));
  const tuttoIdb = (cp) => cp.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('health-orologio');
    r.onsuccess = () => {
      const db = r.result, out = {}, t = db.transaction(['giorni', 'cose'], 'readonly');
      ['giorni', 'cose'].forEach((s) => {
        const o = out[s] = {};
        const c = t.objectStore(s).openCursor();
        c.onsuccess = () => { const k = c.result; if (k) { o[k.key] = k.value; k.continue(); } };
      });
      t.oncomplete = () => res(out);
    };
  }));
  const msg = (cp) => cp.locator('[data-msg]').textContent();
  const finito = (cp) => cp.waitForSelector('[data-msg]', { timeout: 15000 });

  // --- senza il guscio Android: lo dice, niente bottone
  {
    const cx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await finta(cx);
    const cp = await cx.newPage();
    cp.on('pageerror', (e) => consoleErrs.push('PAGEERROR: ' + e.message));
    await cp.goto(BASE + '#/impostazioni', { waitUntil: 'networkidle' });
    check(/only works in the app on the phone/.test(await cp.locator('section.orologio').textContent()) && await cp.locator('[data-estrai]').count() === 0,
      'nel browser (senza il guscio Android) la sezione Orologio dice che funziona solo sul telefono');
    await cx.close();
  }

  const { cx, cp } = await nuovo();
  const ordine = await cp.evaluate(() => [...document.querySelectorAll('#app section h2')].map((h) => h.textContent));
  check(ordine.indexOf('Watch') >= 0 && ordine.indexOf('Watch') < ordine.indexOf('Your data'),
    'Impostazioni: la sezione Orologio c\'è, prima di «I tuoi dati»');

  // --- l'accesso
  check(await cp.locator('[data-email]').count() === 1 && await cp.locator('[data-pw]').getAttribute('type') === 'password' && await cp.locator('[data-estrai]').count() === 0,
    'non collegato: email e password (campo nascosto), ancora nessun bottone');
  await cp.locator('[data-salva]').click();
  await finito(cp);
  check(/Email and password are needed/.test(await msg(cp)) && (await Z(cp)).accesso === false, 'Salva a vuoto: lo dice, e non salva niente');
  await cp.locator('[data-email]').fill('  anonimo@esempio.it ');
  await cp.locator('[data-pw]').fill('segreta-di-prova');
  await cp.locator('[data-salva]').click();
  await cp.waitForSelector('[data-estrai]');
  let z = await Z(cp);
  check(z.email === 'anonimo@esempio.it' && z.pw === 'segreta-di-prova' && /Login saved/.test(await msg(cp)),
    'Salva: email (senza spazi) e password vanno al pezzetto Android, «Accesso salvato»');
  check(await cp.locator('[data-pw]').count() === 0 && /Connected as anonimo@esempio\.it/.test(await cp.locator('section.orologio').textContent()),
    'dopo il salvataggio il campo password sparisce, si vede «Collegato come …»');
  await cp.screenshot({ path: `${SHOT}/18-orologio-collegato.png`, fullPage: true });

  // --- la prima estrazione: tutto, dalla nascita dell'account
  await cp.locator('[data-estrai]').click();
  await finito(cp);
  z = await Z(cp);
  const db1 = await tuttoIdb(cp);
  const r1 = z.calls.filter((c) => c.cosa === 'riepilogo'), m1 = z.calls.filter((c) => c.cosa === 'minuti');
  const nGiorni = 201 - 6;
  check(/Done/.test(await msg(cp)), 'il bottone finisce con «Fatto: dati dell\'orologio aggiornati»');
  check(z.calls[0].cosa === 'profilo' && r1.length === 3 && m1.length === 3 && r1[0].da === z.inizio && r1[2].a === z.oggi
    && r1.every((c, i) => !i || c.da > r1[i - 1].a) && r1.every((c) => (new Date(c.a) - new Date(c.da)) / 864e5 <= 89),
    'prima volta: profilo, poi dal giorno in cui è nato l\'account a oggi in finestre da 90 giorni, senza buchi né doppioni');
  check(Object.keys(db1.giorni).length === nGiorni && !db1.giorni[z.buco[0]],
    'nel telefono ' + nGiorni + ' giorni: tutti quelli che Zepp ha, non quelli che non ha');
  const g0 = db1.giorni[z.oggi];
  check(g0 && g0.r[0].summary && g0.r[0].uuid && g0.m[0].data && g0.m[0].data_hr,
    'ogni giorno com\'è arrivato: riepilogo (summary) e minuti (data + data_hr, il battito), nessun campo perso');
  const wk = db1.cose.allenamenti || [];
  check(wk.length === 7 && wk.every((w) => w.campo_raro_186 === 'tenuto') && wk.some((w) => w.sport_title === 'à mano')
    && z.calls.filter((c) => c.cosa === 'allenamenti').map((c) => c.primaDi || '').join() === ',' + (z.T0 + 2 * 86400),
    'allenamenti: due pagine sfogliate all\'indietro, il doppione tolto, tutti i campi tenuti');
  check(db1.cose.profilo && db1.cose.profilo.height === 180 && db1.cose.meta.finoA === z.oggi && db1.cose.meta.allenamenti === 7,
    'profilo salvato; il segno «al sicuro fino a» è oggi');
  check(new RegExp('On this phone: ' + nGiorni + ' days .*7 workouts, the profile\\. Last extraction today at').test(await cp.locator('[data-sul]').textContent()),
    'sotto il bottone: quanti giorni, da quando a quando, allenamenti, ultima estrazione');
  check(z.sveglio.join() === 'true,false', 'lo schermo resta acceso mentre scarica, poi torna libero');
  check(!JSON.stringify(db1).includes('segreta-di-prova') && !(await cp.evaluate(() => JSON.stringify(localStorage))).includes('segreta-di-prova'),
    'la password non è da nessuna parte nella pagina (né IndexedDB né localStorage)');
  await cp.screenshot({ path: `${SHOT}/18-orologio-fatto.png`, fullPage: true });

  // --- l'unione col passato: il calendario, Sonno e Sport leggono lo scaricato
  const unito = () => cp.evaluate(([a, b, t0]) => {
    const s = Health.storia;
    return { oggi: s.sleep[a] && s.sleep[a].slice(2, 8), dieci: s.sleep[b] && s.sleep[b][6], trecento: Object.keys(s.sleep).length,
             sport: s.sport.map((w) => w[0] - t0), nomi: s.sport.map((w) => w[3]), fila: s.sport.every((w, i) => !i || w[0] > s.sport[i - 1][0]) };
  }, [z.oggi, giornoFa(10), z.T0]);
  let u = await unito();
  check(JSON.stringify(u.oggi) === '[90,240,90,30,80,55]', 'stanotte scaricata è nel passato dell\'app: profondo, leggero, REM, sveglio, punteggio, battito');
  check(u.dieci === 80, 'una notte che c\'era già nel passato: vince quella scaricata (punteggio 80, non 50)');
  check(u.trecento === nGiorni + 1, 'le notti che lo scaricato non ha restano (' + (nGiorni + 1) + ' = ' + nGiorni + ' scaricate + 1 solo del passato)');
  check(JSON.stringify(u.sport) === JSON.stringify([-400 * 86400, 0, 86400, 2 * 86400, 3 * 86400, 4 * 86400]) && u.fila,
    'allenamenti uniti per ora d\'inizio: quello del passato resta, quello uguale non si raddoppia, «Guida» e la partenza da 30 s fuori');
  check(u.nomi[1] === 'Walking' && u.nomi[2] === 'Outdoor Running', 'il nome dello sport viene dal dizionario di Zepp, in inglese (6 Walking, 1 Outdoor Running)');
  await cp.goto(BASE + '#/giorni', { waitUntil: 'networkidle' });
  await cp.evaluate((k) => Health.pick(k), z.oggi);
  await cp.goto(BASE + '#/impostazioni'); await cp.goto(BASE + '#/giorni'); await cp.waitForTimeout(200);
  check(await cp.locator('[data-day="' + z.oggi + '"] [data-c="sonno"].g').textContent() === '7:00',
    'nel calendario, oggi: 7:00 di sonno in verde (punteggio 80) — subito, senza riaprire l\'app');
  await cp.goto(BASE + '#/sport/' + (z.T0 + 3 * 86400), { waitUntil: 'networkidle' });
  check(/Outdoor Running/.test(await cp.locator('#app').textContent()), 'Sport: una seduta scaricata si apre come le altre');
  await cp.screenshot({ path: `${SHOT}/18-sport-scaricato.png`, fullPage: true });
  await cp.reload({ waitUntil: 'networkidle' });
  await cp.waitForFunction(() => window.Health && Health.pronto === true, null, { timeout: 10000 });
  await cp.evaluate(() => { window.__z.accesso = true; window.__z.email = 'anonimo@esempio.it'; });
  u = await unito();
  check(JSON.stringify(u.oggi) === '[90,240,90,30,80,55]' && u.sport.length === 6 && (await Z(cp)).calls.length === 0,
    'riaperta l\'app: lo scaricato è ancora nel calendario, letto dal telefono, senza chiedere niente a Zepp');
  await cp.goto(BASE + '#/impostazioni', { waitUntil: 'networkidle' });
  await cp.waitForSelector('[data-estrai]');

  // --- la seconda: solo i giorni nuovi (e gli ultimi 3, che l'orologio a volte consegna tardi)
  await cp.evaluate(() => { window.__z.calls = []; });
  await cp.locator('[data-estrai]').click();
  await finito(cp);
  z = await Z(cp);
  const r2 = z.calls.filter((c) => c.cosa === 'riepilogo');
  check(r2.length === 1 && r2[0].da === (await cp.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 2); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })) && r2[0].a === z.oggi,
    'seconda volta: una finestra sola, dagli ultimi 3 giorni a oggi (non tutto da capo)');
  check(Object.keys((await tuttoIdb(cp)).giorni).length === nGiorni, 'e i giorni restano quelli, senza doppioni');

  // --- «Esporta tutto» porta con sé l'orologio, «Ricarica da un file» lo rimette
  const dialoghi = FINESTRE;
  await cp.locator('[data-xall]').click();
  await cp.waitForFunction(() => window.__z.salvati.length === 1);
  const [nomeF, testoF] = (await Z(cp)).salvati[0];
  const pacco = JSON.parse(testoF);
  check(pacco.app === '151-health' && pacco.v === 1 && Object.keys(pacco.orologio.giorni).length === nGiorni
      && pacco.orologio.cose.allenamenti.length === 7 && pacco.orologio.cose.profilo.height === 180 && !pacco.orologio.cose.compatto
      && pacco.orologio.giorni[z.oggi].m[0].data_hr,
    'Esporta tutto: nel file anche l\'orologio, grezzo e intero (' + nGiorni + ' giorni coi minuti, 7 allenamenti, profilo; il compatto no: si rifà)');
  check(!testoF.includes('segreta-di-prova'), 'e nel file non c\'è la password di Zepp');
  await cp.evaluate(() => new Promise((res) => { const r = indexedDB.deleteDatabase('health-orologio'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
  await cp.reload({ waitUntil: 'networkidle' });
  await cp.waitForFunction(() => window.Health && Health.pronto === true, null, { timeout: 10000 });
  check((await unito()).oggi === undefined, '(telefono senza orologio: stanotte non c\'è più)');
  await cp.goto(BASE + '#/impostazioni', { waitUntil: 'networkidle' });
  await cp.waitForSelector('#xfile', { state: 'attached' });   // la pagina si disegna dopo Health.load (che aspetta l'orologio)
  await cp.locator('#xfile').setInputFiles({ name: nomeF, mimeType: 'application/json', buffer: Buffer.from(testoF) });
  await cp.waitForFunction(() => location.hash === '#/giorni' && Health.storia && Object.keys(Health.storia.sleep).length > 100, null, { timeout: 15000 });
  await cp.waitForLoadState('networkidle');
  u = await unito();
  check(dialoghi.some((m) => new RegExp(nGiorni + ' days of watch data').test(m)) && JSON.stringify(u.oggi) === '[90,240,90,30,80,55]'
      && Object.keys((await tuttoIdb(cp)).giorni).length === nGiorni && u.sport.length === 6,
    'Ricarica da un file: lo dice prima («' + nGiorni + ' giorni dell\'orologio»), poi l\'orologio torna intero e il calendario lo mostra');
  await cp.evaluate(() => { window.__z.accesso = true; window.__z.email = 'anonimo@esempio.it'; });
  await cp.goto(BASE + '#/impostazioni', { waitUntil: 'networkidle' });
  await cp.waitForSelector('[data-scollega]');

  // --- scollega: l'accesso va via, i dati restano
  await cp.locator('[data-scollega]').click();
  await cp.waitForSelector('[data-email]');
  check((await Z(cp)).dimenticato === 1 && Object.keys((await tuttoIdb(cp)).giorni).length === nGiorni && /The data stays/.test(await msg(cp)),
    'Scollega Zepp: email e password via dalla cassaforte, i dati scaricati restano');
  await cx.close();

  // --- un'estrazione interrotta (Zepp dice «aspetta») riparte da dove si era fermata
  {
    const { cx, cp } = await nuovo();
    // il finto plugin rinasce a ogni ricarica: lo stato si mette nella pagina e si cambia solo il #
    await cp.evaluate(() => {
      const z = window.__z; z.accesso = true; z.email = 'anonimo@esempio.it';
      z.falliscaAl = (o, calls) => o.cosa === 'minuti' && calls.filter((c) => c.cosa === 'minuti').length === 2;
    });
    await cp.goto(BASE + '#/giorni', { waitUntil: 'networkidle' });
    await cp.goto(BASE + '#/impostazioni');
    await cp.waitForSelector('[data-estrai]');
    await cp.locator('[data-estrai]').click();
    await finito(cp);
    const za = await Z(cp), dba = await tuttoIdb(cp);
    const prima = za.calls.filter((c) => c.cosa === 'riepilogo')[0];
    check(/try again in 37 minutes/.test(await msg(cp)) && await cp.locator('[data-msg].bad').count() === 1,
      'Zepp dice «aspetta» a metà: il messaggio lo dice in chiaro, in rosso');
    check(dba.cose.meta.finoA === prima.a && !dba.cose.meta.ultima && /not finished yet/.test(await cp.locator('[data-sul]').textContent()),
      'la prima finestra è al sicuro (segno «fino a» = la sua fine), l\'estrazione risulta non finita');
    check(za.sveglio.join() === 'true,false', 'anche quando si ferma, lo schermo torna libero');
    await cp.evaluate(() => { window.__z.falliscaAl = null; window.__z.calls = []; });
    await cp.locator('[data-estrai]').click();
    await finito(cp);
    const zb = await Z(cp), dbb = await tuttoIdb(cp);
    const ripresa = zb.calls.filter((c) => c.cosa === 'riepilogo')[0];
    const atteso = await cp.evaluate((a) => { const d = new Date(a + 'T12:00:00'); d.setDate(d.getDate() - 2); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }, prima.a);
    check(ripresa.da === atteso && /Done/.test(await msg(cp)) && Object.keys(dbb.giorni).length === nGiorni,
      'ripremuto il bottone riparte da lì (meno 3 giorni), non da capo, e arriva in fondo: ' + nGiorni + ' giorni');
    await cx.close();
  }

  // --- password rifiutata da Zepp: si torna a chiederla
  {
    const { cx, cp } = await nuovo();
    await cp.evaluate(() => { const z = window.__z; z.accesso = true; z.email = 'anonimo@esempio.it'; z.rifiutato = true; });
    await cp.goto(BASE + '#/giorni', { waitUntil: 'networkidle' });
    await cp.goto(BASE + '#/impostazioni');
    await cp.waitForSelector('[data-pw]');
    check(/did not accept the email and password/.test(await cp.locator('section.orologio').textContent())
      && await cp.locator('[data-email]').inputValue() === 'anonimo@esempio.it' && await cp.locator('[data-estrai]').count() === 0,
      'password rifiutata: lo dice, l\'email è già scritta, si riscrive solo la password');
    await cx.close();
  }

  // --- il database del telefono che non risponde non deve fermare l'app
  {
    const cx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Rome' });
    await cx.route('**/data/storia.json', (r) => r.fulfill({ json: STORIA18 }));
    await cx.addInitScript(() => { indexedDB.open = () => ({}); });     // una richiesta che non risponde mai
    const cp = await cx.newPage();
    cp.on('pageerror', (e) => consoleErrs.push('PAGEERROR: ' + e.message));
    const t0 = Date.now();
    await cp.goto(BASE + '#/giorni');
    await cp.waitForFunction(() => window.Health && Health.pronto === true, null, { timeout: 10000 }).catch(() => {});
    const ms = Date.now() - t0;
    check(await cp.evaluate(() => Health.pronto === true) && await cp.locator('.cal').count() === 1 && ms < 8000,
      'database dell\'orologio bloccato: l\'app parte lo stesso col passato (in ' + Math.round(ms / 100) / 10 + ' s)');
    await cx.close();
  }

  // --- Designer 15/11: barra in basso opaca, bersagli di Settings non sotto misura
  {
    const css = fs.readFileSync(path.join(ROOT, 'www/style.css'), 'utf8');
    const blocco = (sel) => { const m = css.match(new RegExp(sel.replace(/[.#]/g, '\\$&').replace(/ /g, '\\s+') + '\\s*\\{([^}]*)\\}')); return m ? m[1] : ''; };
    const nav = blocco('#nav');
    check(/background:\s*var\(--resin\)/.test(nav) && !/rgba\([^)]*,\s*0?\.\d+\)/.test(nav), 'la barra in basso è opaca: il testo della pagina non si legge sotto le linguette');
    const lvl = blocco('.arow .lvl');
    const px = (k, b) => { const m = b.match(new RegExp('(?:^|;|\\s)' + k + ':\\s*(\\d+)px')); return m ? +m[1] : 0; };
    check(px('width', lvl) >= 48 && px('height', lvl) >= 48, 'Settings: il pallino del colore si tocca su 48×48 (era 40)');
    check(px('min-height', blocco('.prow .lnk')) >= 44 && px('min-height', blocco('.arow .lnk')) >= 44, 'Settings: Remove e Add alti almeno 44 (era 40)');
  }
  // --- il testo bianco non sta mai sul blu chiaro (3,4:1), solo su --accent-solid (≥4,5:1)
  {
    const css = fs.readFileSync(path.join(ROOT, 'www/style.css'), 'utf8');
    const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const solid = (css.match(/--accent-solid:\s*(#[0-9a-fA-F]{6})/) || [])[1];
    check(solid && 1.05 / (lum(solid) + 0.05) >= 4.5, 'il blu sotto il testo bianco si legge (' + solid + ', almeno 4,5:1)');
    const rotte = css.split('\n').filter((l) => /color:\s*#fff/.test(l) && /background:\s*var\(--(accent|sport|glow)\)/.test(l));
    check(rotte.length === 0, 'nessun testo bianco sul blu chiaro' + (rotte.length ? ': ' + rotte.map((l) => l.trim().slice(0, 40)).join(' | ') : ''));
  }
  // --- ogni .js della pagina gira anche su una WebView vecchia (69 = ES2019)
  {
    const acorn = await import('./vendor/acorn.mjs');
    const W = path.join(ROOT, 'www');
    const fl = fs.readdirSync(W).filter((f) => f.endsWith('.js'))
      .concat(fs.readdirSync(path.join(W, 'ocr')).filter((f) => f.endsWith('.js')).map((f) => 'ocr/' + f))
      // dal 15/11 anche il cuore del lettore del peso: tradotto per Chrome 69 con esbuild (tools/ocr-es2019.sh)
      .concat(fs.readdirSync(path.join(W, 'ocr/core')).filter((f) => f.endsWith('.js')).map((f) => 'ocr/core/' + f));
    const rotti = fl.filter((f) => { try { acorn.parse(fs.readFileSync(path.join(W, f), 'utf8'), { ecmaVersion: 2019, sourceType: 'script' }); return false; } catch (e) { return true; } });
    check(fl.includes('orologio.js') && rotti.length === 0,
      fl.length + ' file .js della pagina si leggono come ES2019 (WebView 69)' + (rotti.length ? ': NO ' + rotti.join(', ') : '') +
      ' (cuore del lettore del peso compreso)');
  }
}

// ------------------------------------------------------------------- esito
// ======================================== 19. l'orologio sopra la seduta
console.log('\n19. La linea del tempo: battito minuto per minuto sopra esercizi e serie');
{
  // TUTTO FINTO e fatto qui: una seduta di palestra il 20/09/2026 18:00 → 19:00
  // (ora di Roma), l'orologio acceso TARDI (18:20) e spento MOLTO DOPO (19:40),
  // e un giorno di minuti con un BUCO (18:30-18:39 nessuna misura).
  const R = (hm) => new Date('2026-09-20T' + hm + ':00+02:00').getTime();
  const STORIA19 = { v: 1, sleep: {}, subs: {},
    sport: [[R('18:20') / 1000, R('19:40') / 1000, 16, 'Esercizi a corpo libero', 0, 500, 127, 150]] };
  const hr = new Array(1440).fill(0);
  for (let i = 0; i < 30; i++) hr[18 * 60 + i] = 100 + i;          // 18:00 → 18:29: 100 … 129
  for (let i = 30; i < 40; i++) hr[18 * 60 + i] = 255;              // 18:30 → 18:39: nessuna misura
  for (let i = 40; i < 100; i++) hr[18 * 60 + i] = 130;             // 18:40 → 19:39: 130
  const dataHr = Buffer.from(hr).toString('base64');
  const SCHEDA = { v: 1, plan: null, active: null, imgSource: 'files', modes: {}, history: [
    { id: 'wT', n: 1, dayN: 1, dayLabel: 'Giorno prova', startedAt: new Date(R('18:00')).toISOString(),
      endedAt: new Date(R('19:00')).toISOString(), modes: { Panca: { load: true, unit: 'rip', step: 2.5 } },
      kinds: {}, order: ['Panca', 'Vecchio'],
      sets: { Panca: [{ s: 1, kg: 50, reps: 8, target: '8', t0: R('18:05'), t1: R('18:06') },
                      { s: 2, kg: 50, reps: 8, target: '8', t0: R('18:08'), t1: R('18:09') },
                      { s: 3, kg: 50, reps: 8, target: '8', t1: R('18:45') }],
              Vecchio: [{ s: 1, kg: 0, reps: 10, target: '10' }] } },
    { id: 'wU', n: 2, dayN: 1, dayLabel: 'Giorno prova', startedAt: new Date(R('18:00') + 86400000).toISOString(),
      endedAt: new Date(R('19:00') + 86400000).toISOString(), modes: {}, kinds: {}, order: ['Vecchio'],
      sets: { Vecchio: [{ s: 1, kg: 0, reps: 10, target: '10' }] } }] };
  const cx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Europe/Rome' });
  await cx.route('**/data/storia.json', (r) => r.fulfill({ json: STORIA19 }));
  await cx.addInitScript((sc) => { if (!localStorage.getItem('scheda.v1')) localStorage.setItem('scheda.v1', sc); }, JSON.stringify(SCHEDA));
  const cp = await cx.newPage();
  cp.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  cp.on('pageerror', (e) => consoleErrs.push('PAGEERROR: ' + e.message));
  await cp.goto(BASE + '#/giorni', { waitUntil: 'networkidle' });
  await cp.waitForFunction(() => window.Health && window.Health.pronto);
  await cp.evaluate((d) => new Promise((res, rej) => {
    const r = indexedDB.open('health-orologio', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('giorni'); r.result.createObjectStore('cose'); };
    r.onsuccess = () => { const t = r.result.transaction('giorni', 'readwrite');
      t.objectStore('giorni').put({ r: [], m: [{ date_time: '2026-09-20', data_hr: d }] }, '2026-09-20');
      t.oncomplete = () => { r.result.close(); res(); }; t.onerror = () => rej(t.error); };
  }), dataHr);
  await cp.evaluate(() => { location.hash = '#/storico/wT'; });
  await cp.waitForSelector('svg.tl', { timeout: 5000 }).catch(() => {});
  const tl = await cp.evaluate(() => {
    const svg = document.querySelector('svg.tl');
    if (!svg) return null;
    const pl = [...svg.querySelectorAll('.tl-hr')].map((p) => p.getAttribute('points').split(' ').map((xy) => xy.split(',').map(Number)));
    const box = (sel) => [...svg.querySelectorAll(sel)].map((r) => [+r.getAttribute('x'), +r.getAttribute('x') + +r.getAttribute('width')]);
    const cards = [...document.querySelectorAll('.card')].map((c) => c.className);
    return { pl, none: box('.tl-none'), wrec: box('.tl-wrec'), sets: box('.tl-set'),
      facts: [...document.querySelectorAll('.tlcard .facts div')].map((d) => d.textContent),
      when: [...document.querySelectorAll('.dtlrow .when')].map((w) => w.textContent),
      order: cards.indexOf(cards.find((c) => /tlcard/.test(c))) < cards.findIndex((c) => !/tlcard|wcard/.test(c)),
      warn: !!document.querySelector('[data-tl-warn]') };
  });
  // la scala: dalle 17:55 alle 19:05 su 304 unità a partire da x=30
  const X = (hm) => +(30 + 304 * (R(hm) - R('17:55')) / (70 * 60000)).toFixed(1);
  check(tl && tl.pl.length === 2, 'il battito è disegnato in DUE pezzi: il buco 18:30-18:39 non è unito da una linea' + (tl ? ' (' + tl.pl.length + ')' : ''));
  check(tl && tl.pl[0][0][0] === X('18:00') && tl.pl[0][0][1] > tl.pl[0][tl.pl[0].length - 1][1],
    'il minuto 18:00 del giorno cade alle 18:00 della seduta (ora del telefono), e il battito sale: x=' + (tl && tl.pl[0][0][0]) + ' atteso ' + X('18:00'));
  check(tl && tl.none.some((r) => r[0] <= X('18:31') && r[1] >= X('18:38')), 'il buco dell\'orologio si vede: grigio sopra 18:30-18:39');
  check(tl && tl.none.some((r) => r[0] <= X('17:56') && r[1] >= X('17:58')), 'prima che l\'orologio misurasse (17:55-17:59) è grigio anche lì');
  check(tl && tl.wrec.length === 1 && Math.abs(tl.wrec[0][0] - X('18:20')) < 0.2 && tl.wrec[0][1] <= 334.1,
    'l\'orologio acceso tardi (18:20) e spento dopo (19:40): la striscia parte alle 18:20 e si ferma al bordo, la seduta non si sposta');
  check(tl && tl.sets.length === 3, 'tre serie con l\'ora sotto il battito; quella senza orari (di prima) non compare: ' + (tl && tl.sets.length));
  check(tl && tl.facts.join('|').replace(/\s+/g, '') === 'avg121|max130|min100|minuteswithareading51of60',
    'i numeri della seduta vengono SOLO dai minuti misurati dentro la seduta: ' + (tl && tl.facts.join(' | ')));
  check(tl && /18:05–18:06/.test(tl.when[0]) && /106 bpm/.test(tl.when[0]) && /18:08–18:09/.test(tl.when[1]) && /rest 2:00/.test(tl.when[1]),
    'ogni serie ha la sua ora, il recupero prima di lei e il suo battito: ' + (tl && tl.when.slice(0, 2).join(' / ')));
  check(tl && tl.when.length === 3, 'la serie senza orari non si inventa un\'ora');
  check(tl && tl.order, 'la linea del tempo sta SOPRA gli esercizi');
  check(tl && !tl.warn, 'minuti e riassunto dell\'orologio combaciano: nessun avviso');
  const warn = await cp.evaluate((r) => new Promise((res) => {
    const d = document.createElement('div'); document.body.appendChild(d);
    window.Health.timeline(d, { from: r.a, to: r.b, session: [r.a, r.b], watch: [r.w0, r.w1], watchAvg: 170 }, () => { const w = !!d.querySelector('[data-tl-warn]'); d.remove(); res(w); });
  }), { a: R('17:55'), b: R('19:05'), w0: R('18:20'), w1: R('19:40') });
  check(warn, 'se i minuti non combaciano col riassunto dell\'orologio (170 contro 128), lo dice');
  await cp.screenshot({ path: `${SHOT}/${String(++step).padStart(2,'0')}-linea-del-tempo.png`, fullPage: true });
  await cp.evaluate(() => { location.hash = '#/storico/wU'; });
  await cp.waitForSelector('[data-tl-none]', { timeout: 5000 }).catch(() => {});
  check(await cp.locator('[data-tl-none]').count() === 1 && await cp.locator('svg.tl').count() === 0,
    'un giorno senza i minuti dell\'orologio: lo dice, niente disegno inventato');
  await cx.close();
}

// ======================================== 20. l'app parla inglese
console.log('\n20. App in English: no Italian words of our own on screen');
{
  // le parole della palestra (nomi degli esercizi, «Giorno 1» del piano) sono DATI e restano:
  // qui si guardano solo le pagine che scrive l'app
  const IT = /\b(Oggi|Sonno|Impostazioni|Allenament[oi]|Sostanze|Peso|nessun[ao]?|niente|segnare|della|delle|giorni|notte|battito|orologio|Esporta|Ricarica|Salva|Chiudi|Annulla|Conferma|scheda)\b/;
  const cx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Rome' });
  await finta(cx);
  const cp = await cx.newPage();
  cp.on('pageerror', (e) => consoleErrs.push('PAGEERROR: ' + e.message));
  for (const h of ['#/giorni', '#/sonno/2026-09-15', '#/sonno/2026-09-16', '#/impostazioni', '#/allenamenti', '#/sport/' + STORIA.sport[0][0]]) {
    await cp.goto(BASE + h, { waitUntil: 'networkidle' });
    await cp.waitForFunction(() => window.Health && Health.pronto === true, null, { timeout: 10000 });
    await cp.waitForTimeout(150);
    const txt = (await cp.locator('body').innerText()).replace(/Giorno \d+/g, '');
    const m = txt.match(IT);
    check(!m, h + ': in inglese' + (m ? ' — trovato «' + m[0] + '» in «' + txt.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, ' ') + '»' : ''));
  }
  await cx.close();
}

// ======================================== 21. l'ora dell'avviso della sera
console.log('\n21. Evening reminder: the time changes from Settings');
{
  const cx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Europe/Rome' });
  await finta(cx);
  await cx.addInitScript(() => {
    window.__ln = { scheduled: [], cancelled: 0 };
    window.Capacitor = { Plugins: { LocalNotifications: {
      createChannel: () => Promise.resolve(),
      checkPermissions: () => Promise.resolve({ display: 'granted' }),
      requestPermissions: () => Promise.resolve({ display: 'granted' }),
      cancel: () => { window.__ln.cancelled++; return Promise.resolve(); },
      // un plugin lento: tre tocchi di fila non devono finire con l'ora di un tocco vecchio
      schedule: (o) => new Promise((res) => setTimeout(() => {
        window.__ln.scheduled = o.notifications.map((n) => ({ ...n, at: n.schedule.at.toISOString() })); res();
      }, 40 + Math.random() * 60)),
      addListener: () => {},
    } } };
  });
  const cp = await cx.newPage();
  cp.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  cp.on('pageerror', (e) => consoleErrs.push('PAGEERROR: ' + e.message));
  await finestrelle(cp);
  const roma = (iso) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const sere = () => cp.evaluate(() => window.__ln.scheduled.map((n) => n.at));
  // aspetta che TUTTE le sere programmate siano a quell'ora di Roma (mai millisecondi fissi)
  const tutteAlle = async (hm) => {
    await cp.waitForFunction((hm) => { const s = window.__ln.scheduled; if (s.length !== 7) return false;
      const f = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
      return s.every((n) => f.format(new Date(n.at)) === hm); }, hm, { timeout: 5000 }).catch(() => {});
    return sere();
  };
  await cp.goto(BASE + '#/impostazioni', { waitUntil: 'networkidle' });
  await cp.waitForFunction(() => window.Health && Health.pronto === true, null, { timeout: 10000 });
  const sez = cp.locator('section', { has: cp.locator('h2', { hasText: 'Evening reminder' }) });
  check(await sez.count() === 1 && (await sez.locator('[data-sera-t]').textContent()) === '21:30',
    'Impostazioni: la riga «Evening reminder» c\'è e dice 21:30 di base');
  check(await sez.locator('input, select').count() === 0 && await sez.locator('button[data-sera]').count() === 4,
    'niente da scrivere né finestre: quattro tasti «−/+» (ore, minuti)');
  const tasti = await sez.locator('button[data-sera]').evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }));
  check(tasti.length === 4 && tasti.every((w) => w >= 44), 'bersagli grandi: ogni tasto almeno 44 px (' + tasti.map(Math.round).join(', ') + ')');
  let s0 = await tutteAlle('21:30');
  check(s0.length === 7 && s0.every((a) => roma(a) === '21:30'), 'prima del cambio: 7 sere alle 21:30 di Roma');

  if (await sez.locator('button[data-sera]').count() !== 4) bad('senza i tasti dell\'ora il resto della 21 non si può provare');
  else {
  const piu = (f) => sez.locator(`button[data-sera="${f}"][data-d="1"]`).click();
  const meno = (f) => sez.locator(`button[data-sera="${f}"][data-d="-1"]`).click();
  await piu('h'); await piu('m');
  let s1 = await tutteAlle('22:45');
  check((await sez.locator('[data-sera-t]').textContent()) === '22:45'
    && await cp.evaluate(() => JSON.parse(localStorage.getItem('health.v1')).sera) === '22:45',
    'ora +1, minuti +15: 22:45 a schermo e nel deposito (va in «Esporta tutto»)');
  check(s1.length === 7 && s1.every((a) => roma(a) === '22:45') && new Set(s1.map((a) => a.slice(0, 10))).size === 7,
    'le notifiche si rifanno: 7 sere diverse alle 22:45 di Roma — ' + s1.map(roma).join(' '));
  await meno('h'); await meno('h'); await meno('h');            // tre tocchi di fila, il plugin è lento
  let s2 = await tutteAlle('19:45');
  check(s2.length === 7 && s2.every((a) => roma(a) === '19:45'), 'tre tocchi di fila su «−»: vince l\'ultimo, 19:45 — ' + s2.map(roma).join(' '));
  for (let i = 0; i < 5; i++) await piu('h');                   // 19 → 00: il giro delle 24 ore
  await meno('m'); await meno('m'); await meno('m');             // 00:45 → 00:30 → 00:15 → 00:00
  await meno('m');                                               // → 23:45 del giorno prima
  check((await sez.locator('[data-sera-t]').textContent()) === '23:45', 'il giro delle 24 ore, avanti e indietro: 23:45');
  let s3 = await tutteAlle('23:45');
  check(s3.length === 7 && s3.every((a) => roma(a) === '23:45'), 'e le sere sono alle 23:45');
  await cp.screenshot({ path: `${SHOT}/${String(++step).padStart(2,'0')}-avviso-sera.png`, fullPage: true });
  // riaperta l'app, l'ora resta e le sere si riprogrammano con lei
  await cp.reload({ waitUntil: 'networkidle' });
  await cp.waitForFunction(() => window.Health && Health.pronto === true, null, { timeout: 10000 });
  let s4 = await tutteAlle('23:45');
  check((await sez.locator('[data-sera-t]').textContent()) === '23:45' && s4.length === 7 && s4.every((a) => roma(a) === '23:45'),
    'riaperta l\'app: ancora 23:45, e le 7 sere riprogrammate a quell\'ora');
  // un deposito con un\'ora rotta non rompe niente: si torna alle 21:30
  await cp.evaluate(() => { const d = JSON.parse(localStorage.getItem('health.v1')); d.sera = '27:99'; localStorage.setItem('health.v1', JSON.stringify(d)); });
  await cp.reload({ waitUntil: 'networkidle' });
  await cp.waitForFunction(() => window.Health && Health.pronto === true, null, { timeout: 10000 });
  let s5 = await tutteAlle('21:30');
  check((await sez.locator('[data-sera-t]').textContent()) === '21:30' && s5.every((a) => roma(a) === '21:30'),
    'un\'ora illeggibile nel deposito vale 21:30');
  }
  await cx.close();
}

// ======================================== 22. Daylio diventa dati dell'app
console.log('\n22. Daylio becomes the app\'s own data');
{
  // la storia «dentro l'APK» la decide la prova, giro per giro: {} = file che non c'è o non si legge
  let storiaOra = {};
  const STORIA_D = { ...STORIA, subs: { '2024-01-10': ['caffeina'], '2024-01-11': ['nicotina', 'thc'], '2024-01-12': ['caffeina'], '2024-01-13': ['nicotina'] } };
  // segnati a mano PRIMA dell'adozione: «niente» l'11, la creatina il 12, e un giorno recente
  const PRIMA = { v: 1, subs: { '2024-01-11': [], '2024-01-12': ['creatina'], '2026-03-04': ['alcol'] }, avail: ['caffeina', 'nicotina', 'alcol'], custom: {} };
  // senza service worker, come dentro l'APK: la sua cache servirebbe la storia del giro prima
  const cx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Europe/Rome', serviceWorkers: 'block' });
  await cx.route('**/data/storia.json', (r) => r.fulfill({ json: storiaOra }));
  await cx.addInitScript(() => {
    window.__saved = [];
    window.SchedaNative = { keepAwake() {}, print() {}, saveFile(n, t) { window.__saved.push([n, t]); return true; } };
  });
  const cp = await cx.newPage();
  cp.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  cp.on('pageerror', (e) => consoleErrs.push('PAGEERROR: ' + e.message));
  await finestrelle(cp);
  const pronta = () => cp.waitForFunction(() => window.Health && Health.pronto === true, null, { timeout: 10000 });
  const dep = () => cp.evaluate(() => JSON.parse(localStorage.getItem('health.v1')));
  await cp.goto(BASE + '#/giorni', { waitUntil: 'networkidle' });
  await cp.evaluate((p) => { localStorage.clear(); localStorage.setItem('health.v1', JSON.stringify(p)); }, PRIMA);
  await cp.reload({ waitUntil: 'networkidle' }); await pronta();
  let d = await dep();
  check(!d.daylio && JSON.stringify(d.subs) === JSON.stringify(PRIMA.subs),
    'storia assente o illeggibile: niente adottato, nessun segno messo (si riprova al prossimo avvio), il deposito com\'era');

  storiaOra = STORIA_D;
  await cp.reload({ waitUntil: 'networkidle' }); await pronta();
  d = await dep();
  check(JSON.stringify(d.subs['2024-01-10']) === '["caffeina"]' && JSON.stringify(d.subs['2024-01-13']) === '["nicotina"]'
    && d.daylio && d.daylio.giorni === 2,
    'primo avvio con la storia: i giorni Daylio entrano nel deposito health.v1 come voci normali (' + (d.daylio && d.daylio.giorni) + ' giorni)');
  check(JSON.stringify(d.subs['2024-01-11']) === '[]' && JSON.stringify(d.subs['2024-01-12']) === '["creatina"]' && JSON.stringify(d.subs['2026-03-04']) === '["alcol"]',
    'il segnato a mano vince: l\'11 resta «niente», il 12 resta creatina, il 4 marzo 2026 intatto');
  await cp.goto(BASE + '#/sostanze/2024-01-10', { waitUntil: 'networkidle' }); await pronta();
  await cp.waitForSelector('#pop .sbt');
  const tSub = cp.locator('.tile[data-slot="sostanze"]');
  check(!/Daylio/.test(await cp.locator('#pop').textContent()) && await cp.locator('#pop [data-id="caffeina"].on').count() === 1,
    'la finestrella del 10 gennaio 2024: caffeina spuntata, nessuna scritta «Daylio»');
  await cp.locator('#pop [data-cancel]').click();
  check(!/Daylio/.test(await tSub.textContent()) && /Caffeine/.test(await tSub.textContent()),
    'il riquadro non dice più «from Daylio»: ' + (await tSub.textContent()).replace(/\s+/g, ' '));
  // si cambia come ogni altro giorno
  await tSub.click(); await cp.locator('#pop [data-id="nicotina"]').click(); await cp.locator('#pop [data-ok]').click();
  await cp.waitForTimeout(150);
  check(JSON.stringify((await dep()).subs['2024-01-10']) === '["caffeina","nicotina"]', 'un giorno Daylio si modifica: aggiunta la nicotina');

  // un APK nuovo con un'altra storia: i giorni restano (sono dell'app), e l'adozione NON si rifà
  storiaOra = { ...STORIA, subs: { '2024-01-14': ['thc'] } };
  await cp.reload({ waitUntil: 'networkidle' }); await pronta();
  d = await dep();
  check(JSON.stringify(d.subs['2024-01-10']) === '["caffeina","nicotina"]' && JSON.stringify(d.subs['2024-01-13']) === '["nicotina"]' && !d.subs['2024-01-14'],
    'una volta sola: con un\'altra storia nell\'APK i giorni adottati restano e il 14 non entra');
  await cp.evaluate(() => Health.pick('2024-01-13'));
  await cp.goto(BASE + '#/impostazioni'); await cp.goto(BASE + '#/giorni'); await cp.waitForTimeout(200);
  const c13 = cp.locator('[data-day="2024-01-13"] [data-c="sostanze"]');
  check(await c13.count() === 1 && await c13.textContent() === '1',
    'e il calendario li mostra anche se la storia non li ha più');

  // Esporta tutto li porta, Ricarica li rimette su un telefono vuoto
  await cp.goto(BASE + '#/impostazioni', { waitUntil: 'networkidle' }); await pronta();
  await cp.locator('[data-xall]').click();
  await cp.waitForFunction(() => window.__saved.length > 0);
  const file = (await cp.evaluate(() => window.__saved))[0];
  const pk = JSON.parse(file[1]);
  check(JSON.stringify(pk.sostanze.subs['2024-01-13']) === '["nicotina"]' && pk.sostanze.daylio && pk.sostanze.daylio.giorni === 2,
    '«Esporta tutto» porta i giorni Daylio (e il segno)');
  await cp.evaluate(() => localStorage.clear());
  storiaOra = { ...STORIA, subs: {} };
  await cp.locator('#xfile').setInputFiles({ name: file[0], mimeType: 'application/json', buffer: Buffer.from(file[1]) });
  await cp.waitForFunction(() => localStorage.getItem('health.v1') !== null, null, { timeout: 5000 }).catch(() => {});
  await cp.waitForLoadState('networkidle'); await pronta();
  d = await dep();
  check(d && JSON.stringify(d.subs['2024-01-10']) === '["caffeina","nicotina"]' && JSON.stringify(d.subs['2024-01-13']) === '["nicotina"]',
    'telefono vuoto + «Ricarica da un file» (e una storia senza Daylio): i giorni Daylio tornano');
  await cx.close();
}

// ======================================== 24. My workouts
console.log('\n24. My workouts: catalogue, own workouts, the tick, the day');
{
  const SH = '/tmp/health-mine';
  fs.mkdirSync(SH, { recursive: true });
  let nShot = 0;
  const cx = await browser.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2, timezoneId: 'Europe/Rome', serviceWorkers: 'block' });
  await finta(cx);
  await cx.addInitScript(() => {
    window.__saved = []; window.__awake = [];
    window.SchedaNative = { keepAwake(on) { window.__awake.push(on); }, print() {}, saveFile(n, t) { window.__saved.push([n, t]); return true; } };
  });
  const cp = await cx.newPage();
  const catReq = [];
  cp.on('request', (r) => { if (r.url().includes('esercizi/catalogo.json')) catReq.push(r.url()); });
  cp.on('console', (m) => { if (m.type() === 'error') { consoleErrs.push(m.text()); console.log('  [console] ' + m.text()); } });
  cp.on('pageerror', (e) => { consoleErrs.push('PAGEERROR: ' + e.message); console.log('  [pageerror] ' + (e.stack || e.message)); });
  await finestrelle(cp);
  const pronta = () => cp.waitForFunction(() => window.Health && Health.pronto === true, null, { timeout: 10000 });
  const snap = (n) => cp.screenshot({ path: `${SH}/${String(++nShot).padStart(2, '0')}-${n}.png`, fullPage: false });
  const mine = () => cp.evaluate(() => JSON.parse(localStorage.getItem('health.mine.v1')));
  const NODUR = /\b\d+\s*(min|mins|minutes|h)\b|duration|estimated|~\s*\d/i;
  const nodur = async (where) => {
    const t = await cp.locator('#app').innerText();
    const m = t.match(NODUR);
    check(!m, where + ': nessuna durata prevista a schermo' + (m ? ' — trovato «' + m[0] + '»' : ''));
  };

  await cp.goto(BASE + '#/giorni', { waitUntil: 'networkidle' }); await pronta();
  await cp.evaluate(() => localStorage.clear());
  await cp.goto(BASE + '#/home'); await cp.reload({ waitUntil: 'networkidle' }); await pronta();
  check(catReq.length === 0, 'all\'avvio il catalogo NON si legge (caricamento pigro)');
  await cp.locator('#subnav [data-go="#/mine"]').click();
  await cp.waitForTimeout(150);
  check(cp.url().endsWith('#/mine') && /My workouts/i.test(await cp.locator('h1').textContent()) && await cp.locator('#nav [data-area="sport"].on').count() === 1,
    'Sport › My workouts si apre, la zona Sport resta accesa');
  check(catReq.length === 0 && await cp.locator('[data-act="new"]').count() === 1, 'la lista vuota ha «+ New workout» e ancora nessun catalogo letto');
  await snap('lista-vuota');

  // --- un allenamento nuovo
  await cp.locator('[data-act="new"]').click();
  await cp.waitForTimeout(150);
  check(/#\/mine\/w\/m\d+$/.test(cp.url()) && await cp.locator('[data-act="start"]').isDisabled(), 'nuovo allenamento: si apre, «Start» spento finché è vuoto');
  await cp.locator('#mwname').fill('Short push');
  check((await mine()).workouts[0].name === 'Short push', 'il nome si salva mentre lo scrivi');

  // --- il catalogo
  await cp.locator('[data-act="add"]').click();
  await cp.waitForSelector('.mw-row');
  const cnt = async () => +(await cp.locator('[data-count]').getAttribute('data-count'));
  check(await cnt() === 873 && catReq.length === 1, 'il catalogo si legge aprendo «Add exercise»: 873 esercizi, una richiesta (' + catReq.length + ')');
  const imgs = await cp.evaluate(() => [...document.querySelectorAll('.mw-row img')].map((i) => i.getAttribute('loading')));
  check(imgs.length === 40 && imgs.every((l) => l === 'lazy'), 'la lista disegna 40 righe con la foto piccola, loading=lazy (' + imgs.length + ')');
  await snap('catalogo');
  await cp.locator('#mwq').fill('bench press');
  await cp.waitForTimeout(100);
  const nBench = await cnt();
  const names = await cp.locator('.mw-open b').allTextContents();
  check(nBench > 5 && nBench < 100 && names.every((n) => /bench/i.test(n) && /press/i.test(n)), 'ricerca «bench press»: ' + nBench + ' esercizi, tutti col nome giusto');
  await cp.locator('[data-f="mus"][data-v="chest"]').click();
  await cp.waitForTimeout(100);
  const nChest = await cnt();
  await cp.locator('[data-f="eq"][data-v="dumbbell"]').click();
  await cp.waitForTimeout(100);
  const nDb = await cnt();
  const smalls = await cp.locator('.mw-open small').allTextContents();
  check(nChest < nBench && nDb > 0 && nDb < nChest && smalls.every((t) => /chest/.test(t) && /dumbbell/.test(t)),
    'filtri muscolo (petto: ' + nChest + ') e attrezzo (manubri: ' + nDb + ') restringono la lista');
  await snap('catalogo-filtrato');

  // --- la scheda dell'esercizio: due foto grandi, istruzioni, Add
  const firstName = await cp.locator('.mw-open b').first().textContent();
  await cp.locator('.mw-open').first().click();
  await cp.waitForSelector('.mw-big img');
  await cp.waitForFunction(() => [...document.querySelectorAll('.mw-big img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 5000 }).catch(() => {});
  const big = await cp.evaluate(() => [...document.querySelectorAll('.mw-big img')].map((i) => i.naturalWidth));
  check(big.length === 2 && big.every((w) => w > 200 && w <= 480) && await cp.locator('.mw-how li').count() > 0 && (await cp.locator('h1').textContent()) === firstName,
    'la scheda di «' + firstName + '»: due foto grandi (' + big.join(', ') + ' px, offline nel repo) e le istruzioni');
  await nodur('scheda dell\'esercizio');
  await snap('esercizio');
  await cp.locator('[data-act="add"]').click();
  await cp.waitForTimeout(150);
  check(/#\/mine\/add\//.test(cp.url()) && /1 exercise\b/.test(await cp.locator('.kick').first().textContent()) && await cnt() === nDb,
    '«Add» torna al catalogo con ricerca e filtri com\'erano, e l\'esercizio è dentro');
  await nodur('catalogo');
  // altri due col «+» della riga
  await cp.locator('[data-f="mus"][data-v=""]').click(); await cp.locator('[data-f="eq"][data-v=""]').click();
  await cp.locator('#mwq').fill('plank'); await cp.waitForTimeout(100);
  await cp.locator('.mw-row:has(b:text-is("Plank")) [data-act="quick"]').click();
  await cp.locator('#mwq').fill('barbell full squat'); await cp.waitForTimeout(100);
  await cp.locator('[data-act="quick"]').first().click();
  check(await cp.locator('.mw-row.in').count() === 1, 'il «+» della riga aggiunge e la riga resta segnata');
  await cp.locator('[data-act="done"]').click();
  await cp.waitForTimeout(150);
  const order = async () => (await mine()).workouts[0].items.map((i) => i.name);
  let o = await order();
  check(o.length === 3 && o[0] === firstName && o[1] === 'Plank', 'tre esercizi nell\'allenamento, in ordine: ' + o.join(' · '));

  // --- sposta, togli, −/+
  await cp.locator('[data-act="up"][data-i="2"]').click(); await cp.waitForTimeout(100);
  o = await order();
  check(o[1] !== 'Plank' && o[2] === 'Plank', 'su: il terzo sale al secondo posto: ' + o.join(' · '));
  await cp.locator('[data-act="down"][data-i="0"]').click(); await cp.waitForTimeout(100);
  await cp.locator('[data-act="up"][data-i="1"]').click(); await cp.waitForTimeout(100);
  o = await order();
  check(o[0] === firstName, 'giù e di nuovo su: torna dov\'era');
  await cp.locator('[data-act="remove"][data-i="2"]').click(); await cp.waitForTimeout(150);
  o = await order();
  check(o.length === 2 && o.indexOf('Plank') < 0, 'togli (con la domanda dell\'app): restano ' + o.join(' · '));
  const card0 = cp.locator('[data-item="0"]');
  await card0.locator('.stp[data-f="sets"] .pl').click();
  for (let i = 0; i < 4; i++) await card0.locator('.stp[data-f="kg"] .pl').click();
  await card0.locator('.stp[data-f="reps"] .mn').click(); await card0.locator('.stp[data-f="reps"] .mn').click();
  const it0 = (await mine()).workouts[0].items[0];
  check(it0.sets === 4 && it0.kg === 10 && it0.reps === 8 && (await card0.locator('.stp[data-f="kg"] .val').textContent()) === '10',
    '«−/+»: 4 serie × 8 ripetizioni, 10 kg (2,5 a scatto), senza scrivere numeri');
  check(await cp.locator('#app input:not(#mwname)').count() === 0, 'l\'unico campo da scrivere è il nome');
  await nodur('allenamento');
  await snap('allenamento');

  // --- la seduta: la spunta come in palestra
  await cp.locator('[data-act="start"]').click();
  await cp.waitForSelector('.setrow');
  check(cp.url().endsWith('#/mine/run') && await cp.evaluate(() => document.body.classList.contains('workout-live')) &&
    (await cp.evaluate(() => window.__awake)).slice(-1)[0] === true, 'Start: la seduta, barra in fondo nascosta, schermo acceso');
  const rows0 = cp.locator('.ex').nth(0).locator('.setrow');
  check(await rows0.count() === 4 && (await rows0.nth(0).locator('.stp[data-f="kg"] .val').textContent()) === '10' &&
    !/object/.test(await cp.locator('.ex .sp').first().textContent()),
    'le serie nascono dai numeri dell\'allenamento (4 × 8, 10 kg): ' + (await cp.locator('.ex .sp').first().textContent()));
  const tick = (ex, i) => cp.locator('.ex').nth(ex).locator('.setrow').nth(i).locator('.tick');
  await tick(0, 0).click(); await cp.waitForTimeout(1100);
  check(await rows0.nth(0).evaluate((r) => r.classList.contains('run')) && /0:0\d/.test(await tick(0, 0).textContent()),
    'primo tocco: la serie parte e la spunta conta');
  await tick(0, 0).click(); await cp.waitForTimeout(1100);
  let a = (await mine()).active;
  check(a.items[0].sets[0].done && a.items[0].sets[0].t0 < a.items[0].sets[0].t1 && /rest/.test(await cp.locator('#mwClock').textContent()),
    'secondo tocco: fatta, con inizio e fine; il quadrante conta il recupero');
  await snap('seduta-recupero');
  await tick(0, 1).click(); await cp.waitForTimeout(300);
  await cp.locator('.ex').nth(1).locator('.ex-head').click(); await cp.waitForTimeout(300);
  await tick(1, 0).click(); await cp.waitForTimeout(200);
  a = (await mine()).active;
  check(a.items[0].sets[1].done && a.items[1].sets[0].t0 && !a.items[1].sets[0].done, 'una serie per volta: far partire la successiva chiude quella che correva');
  await tick(1, 0).click(); await tick(1, 0).click(); await cp.waitForTimeout(150);
  a = (await mine()).active;
  check(!a.items[1].sets[0].done && !a.items[1].sets[0].t0, 'terzo tocco: la serie torna com\'era (orari tolti)');
  await tick(1, 0).click(); await cp.waitForTimeout(150); await tick(1, 0).click(); await cp.waitForTimeout(150);
  check(/3\/\d+/.test(await cp.locator('#mwCount').textContent()), 'tre serie spuntate: ' + await cp.locator('#mwCount').textContent());
  // indietro del telefono: la seduta resta, si riprende
  check(await cp.evaluate(() => SchedaBack()) && (await cp.waitForTimeout(150), cp.url().endsWith('#/mine')) &&
    await cp.locator('[data-mw-live]').count() === 1, 'indietro dalla seduta: My workouts, con la seduta in corso da riprendere');
  await nodur('lista con seduta in corso');
  await cp.locator('[data-act="resume"]').click(); await cp.waitForTimeout(200);
  check(cp.url().endsWith('#/mine/run') && (await mine()).active.items[1].sets[0].done, '«Resume»: la seduta è com\'era');
  await cp.locator('#mwFinish').click();
  await cp.waitForTimeout(500);
  const m1 = await mine();
  check(/#\/mine\/s\/s\d+$/.test(cp.url()) && m1.active === null && m1.sessions.length === 1 &&
    m1.sessions[0].items.map((i) => i.sets.length).join(',') === '2,1' && m1.sessions[0].items[0].sets[0].kg === 10,
    '«Finish»: nel giorno vanno solo le serie spuntate (2 + 1)');
  check(!(await cp.evaluate(() => document.body.classList.contains('workout-live'))) && await cp.locator('.livebar').count() === 0,
    'dopo Finish la barra della seduta sparisce');
  await snap('seduta-fatta');

  // --- nel giorno: calendario, riquadro, Sport › Workouts
  await cp.goto(BASE + '#/giorni'); await cp.waitForTimeout(200);
  const oggi = await cp.evaluate(() => Health.ymd(new Date()));
  check(await cp.locator('[data-day="' + oggi + '"] [data-c="sport"] svg.ic').count() >= 1, 'il calendario di oggi ha il disegnino dello sport');
  const tile = cp.locator('.tile[data-slot="sport"]');
  check(/Short push/.test(await tile.textContent()), 'il riquadro Workout di oggi: ' + (await tile.textContent()).replace(/\s+/g, ' '));
  await snap('calendario');
  await tile.click(); await cp.waitForTimeout(200);
  check(/#\/mine\/s\//.test(cp.url()) && (await cp.locator('h1').textContent()) === 'Short push', 'il riquadro apre la seduta');
  check(await cp.locator('.wcard').count() === 1, 'l\'orologio della stessa ora sta dentro la seduta');
  await cp.evaluate(() => SchedaBack()); await cp.waitForTimeout(150);
  check(cp.url().endsWith('#/giorni'), 'indietro dalla seduta aperta dal calendario: torna al calendario');
  await cp.goto(BASE + '#/allenamenti'); await cp.waitForTimeout(200);
  const lst = await cp.locator('#app').innerText();
  check(/Short push/.test(lst) && !/Free training/.test(lst), 'Sport › Workouts: la seduta c\'è, e l\'orologio non compare due volte');

  // --- Esporta tutto, PDF, Ricarica
  await cp.goto(BASE + '#/impostazioni'); await cp.waitForTimeout(200);
  await cp.locator('[data-xall]').click();
  await cp.waitForFunction(() => window.__saved.length > 0);
  const file = (await cp.evaluate(() => window.__saved)).slice(-1)[0];
  const pk = JSON.parse(file[1]);
  check(pk.mine && pk.mine.workouts.length === 1 && pk.mine.sessions.length === 1, '«Esporta tutto» porta My workouts (1 allenamento, 1 seduta)');
  await cp.locator('[data-xpdf]').click(); await cp.waitForTimeout(150);
  check(/Short push/.test(await cp.locator('#sheet').textContent()), 'il PDF «Everything» ha la seduta nel suo giorno');
  await cp.locator('#closeSheet').click();
  await cp.evaluate(() => localStorage.clear());
  await cp.locator('#xfile').setInputFiles({ name: file[0], mimeType: 'application/json', buffer: Buffer.from(file[1]) });
  await cp.waitForFunction(() => localStorage.getItem('health.mine.v1') !== null, null, { timeout: 5000 }).catch(() => {});
  await cp.waitForLoadState('networkidle'); await pronta();
  check(JSON.stringify(await mine()) === JSON.stringify(pk.mine), 'telefono vuoto + «Ricarica da un file»: My workouts torna identico');
  // un file di prima di My workouts non cancella quelli del telefono
  const vecchio = { ...pk }; delete vecchio.mine;
  await cp.goto(BASE + '#/impostazioni'); await cp.waitForTimeout(150);
  await cp.locator('#xfile').setInputFiles({ name: 'vecchio.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(vecchio)) });
  await cp.waitForTimeout(400); await cp.waitForLoadState('networkidle'); await pronta();
  check(JSON.stringify(await mine()) === JSON.stringify(pk.mine) && FINESTRE.some((f) => /no own workouts in the file/.test(f)),
    'un file senza My workouts lo dice, e quelli del telefono restano');

  // --- un deposito illeggibile non si sovrascrive
  await cp.evaluate(() => localStorage.setItem('health.mine.v1', '{rotto'));
  await cp.goto(BASE + '#/mine'); await cp.reload({ waitUntil: 'networkidle' }); await pronta();
  await cp.locator('[data-act="new"]').click(); await cp.waitForTimeout(150);
  check(await cp.evaluate(() => localStorage.getItem('health.mine.v1.broken')) === '{rotto' && (await mine()).workouts.length === 1,
    'deposito illeggibile: la copia va da parte prima della prima scrittura');
  // il catalogo sul disco: tutti con due foto che esistono
  const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'www/esercizi/catalogo.json'), 'utf8')).esercizi;
  const manca = C.filter((x) => x.img.length !== 2 || x.img.some((n) => !fs.existsSync(path.join(ROOT, 'www/esercizi/img', n))));
  check(C.length === 873 && manca.length === 0 && fs.existsSync(path.join(ROOT, 'www/esercizi/LICENSE')),
    'catalogo sul disco: 873 esercizi, due foto ciascuno, LICENSE presente' + (manca.length ? ': mancano ' + manca.length : ''));
  await cx.close();
}

// ======================================== 25. nessun piano: lo stato vuoto
console.log('\n25. No plan bundled: a clear empty state that loads your own .mht');
{
  // l'app pubblica non porta nessun piano: www/plan.json non esiste (qui il server lo nega)
  check(!fs.existsSync(path.join(ROOT, 'www', 'plan.json')) && !fs.existsSync(path.join(ROOT, 'www', 'img')),
    'nel repo nessun piano di serie: né www/plan.json né www/img/');
  const cx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await finta(cx);
  await cx.route('**/www/plan.json', (r) => r.fulfill({ status: 404, body: '' }));
  const cp = await cx.newPage();
  const errVuoto = [];
  // l'unico errore atteso è il 404 del piano che non c'è
  cp.on('console', (m) => { if (m.type() === 'error' && !/plan\.json/.test((m.location() || {}).url || '')) errVuoto.push(m.text()); });
  cp.on('pageerror', (e) => errVuoto.push('PAGEERROR: ' + e.message));
  await finestrelle(cp);
  await cp.goto(HOME, { waitUntil: 'networkidle' });
  await cp.waitForFunction(() => window.Health && Health.pronto === true, null, { timeout: 10000 });
  await cp.waitForTimeout(150);
  const vuoto = cp.locator('.empty.noplan');
  check(await vuoto.count() === 1 && /No workout plan yet/.test(await vuoto.textContent())
    && /Load your plan \(\.mht\)/.test(await vuoto.locator('.filelabel').textContent()),
    'senza piano: «No workout plan yet» e il tasto «Load your plan (.mht)»');
  check(await cp.locator('.hdr img').count() === 0, 'senza piano nessun logo (e nessuna immagine che manca)');
  await cp.screenshot({ path: `${SHOT}/${String(++step).padStart(2, '0')}-senza-piano.png` });
  await cp.locator('#mhtfile').setInputFiles(path.join(FIX, 'scheda-2-posizioni.mht'));
  await cp.waitForTimeout(1300);
  await cp.waitForLoadState('networkidle');
  check((await cp.locator('.hdr .t').textContent()).includes('ALEX SAMPLE') && await cp.locator('.day.next').count() === 1,
    'dallo stato vuoto si carica la scheda e si arriva alla casa della palestra');
  const logo = await cp.waitForFunction(() => { const i = document.querySelector('.hdr img'); return i && i.complete && i.naturalWidth > 0; },
    null, { timeout: 5000 }).then(() => true, () => false);
  check(logo, 'il logo del club arriva dalla scheda caricata (IndexedDB)');
  check(errVuoto.length === 0, 'nessun errore in console senza piano' + (errVuoto.length ? ': ' + errVuoto.join(' | ') : ''));
  await cx.close();
}

// le finestre grigie: nessuna nella prova, e nessuna chiamata nel codice dell'app
check(GRIGIE.length === 0, 'nessuna finestra grigia del browser in tutta la prova' + (GRIGIE.length ? ': ' + GRIGIE.join(' | ') : ''));
{
  const chiamate = fs.readdirSync(path.join(ROOT, 'www')).filter((f) => f.endsWith('.js')).flatMap((f) =>
    fs.readFileSync(path.join(ROOT, 'www', f), 'utf8').split('\n').map((r, i) => [f + ':' + (i + 1), r.replace(/\/\/.*$/, '')])
      .filter(([, r]) => /(^|[^.\w])(confirm|alert|prompt)\s*\(/.test(r)).map(([w]) => w));
  check(chiamate.length === 0, 'nel codice nessun confirm/alert/prompt del browser' + (chiamate.length ? ': ' + chiamate.join(', ') : ''));
}

console.log('\n--- console del browser ---');
if (consoleErrs.length) consoleErrs.forEach(e => console.log('  ! ' + e));
else console.log('  nessun errore');
console.log('\n=== ' + (errors.length ? errors.length + ' CONTROLLI FALLITI' : 'TUTTI I CONTROLLI PASSATI') + ' ===');
await browser.close();
process.exit(errors.length || consoleErrs.length ? 1 : 0);
