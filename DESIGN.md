# DESIGN — The 151 Health

Aspetto **«Notte blu»**.
Lo stile vive in un posto solo: `www/style.css` (variabili in `:root`).

- Fondo blu-nero `#0d1013`, schede `#151a20`, tasti `#1d242c`, bordi `#2a333d`,
  testo `#e9eef3` / `#8fa0b0`. Accento blu `#1b8bf9`.
- Ogni zona ha il suo colore, uguale nel calendario e nella barra in fondo:
  sport `#1b8bf9`,
  sonno `#8b7cf6`, sostanze `#2bc4b4`, peso `#f39a4a`. Nel calendario il sonno
  è una lineetta alta quanto il punteggio, le altre zone un puntino.
- Verdetto: verde `#35c46a` meglio, rosso `#e06060` peggio, oro `#f0b429`
  record. Sta sul NUMERO e sulla spunta, mai su uno sfondo grigio.
- Caratteri: Barlow Condensed (titoli, etichette, tasti, maiuscolo spaziato),
  Barlow (testo e numeri). Niente cifre a segmenti: la 1.1.0 grigia «orologio
  da palestra» è stata bocciata («tutta grigia e deprimente», 06/10).
- Bersagli da pollice: almeno 44 px (i «−/+» e la spunta 48-56 px). Niente emoji.
- Il giorno aperto: quattro riquadri 2 × 2, sempre gli stessi — Sonno ·
  Allenamento / Peso · Sostanze. Un riquadro con più cose apre
  la finestrella dal basso; Sostanze apre la sua finestrella con «Conferma».
- Barra in fondo: Giorni · Sport · Sonno · Impostazioni; dentro Sport, in alto,
  Palestra · Allenamenti · Record · Scheda. Durante l'allenamento spariscono tutte e due.
