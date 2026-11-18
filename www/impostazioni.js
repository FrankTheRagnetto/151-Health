/* ===========================================================================
 * impostazioni.js — #/impostazioni, una pagina sola per le scelte dell'utente.
 *
 * Ogni zona che ha qualcosa da far scegliere si iscrive con
 * `Health.settings.push(function (box, go) { … })` e disegna la sua parte
 * dentro `box`. Oggi: le sostanze a disposizione (sostanze.js). Le
 * impostazioni della palestra restano nella sua pagina Scheda.
 * ========================================================================= */
(function () {
'use strict';
var H = window.Health;
H.settings = H.settings || [];
H.page('impostazioni', function (app, go) {
  app.innerHTML = '<h1>Settings</h1>';
  H.settings.forEach(function (fn) {
    var box = document.createElement('section');
    app.appendChild(box);
    fn(box, go);
  });
});
})();
