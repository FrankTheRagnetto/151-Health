/* ===========================================================================
 * sostanze-catalogo.js — il catalogo grande delle sostanze.
 *
 * droghe, alcol, integratori,
 * farmaci da banco. Dalle Impostazioni si cerca qui e si sceglie quali avere
 * a disposizione nella finestrella del giorno. Quello che manca si aggiunge a
 * mano (sostanze.js, `custom`): il catalogo non deve essere perfetto, deve
 * coprire il comune.
 *
 * L'`id` è per SEMPRE: sta scritto nei giorni già segnati sul telefono di
 * l'utente. Si può cambiare il nome (`label`), mai l'id. Le prime sei sono quelle
 * della 0.2.0 e restano con gli id di allora (`thc` = «THC / CBD»).
 * `alias`: altre parole con cui la si cerca (senza accenti, minuscole), in
 * italiano e in inglese: dal 20/10 l'app è in inglese, ma si cerca in tutte e due.
 * ========================================================================= */
(function () {
'use strict';
var C = [
  // le prime sei, con gli id della 0.2.0
  ['caffeina',     'Caffeine',            'Stimulants',  'caffe coffee espresso energy drink caffeine caffeina'],
  ['creatina',     'Creatine',            'Supplements', 'creatine creatina'],
  ['nicotina',     'Nicotine',            'Stimulants',  'sigaretta tabacco fumo svapo snus iqos nicotine cigarette tobacco vape nicotina'],
  ['melatonina',   'Melatonin',           'Sleep',       'melatonin melatonina'],
  ['thc',          'THC / CBD',           'Cannabis',    'cannabis marijuana erba canna hashish fumo weed'],
  ['psilocibina',  'Psilocybin',          'Psychedelics','funghi magic mushrooms psilocybin shrooms psilocibina'],
  // stimolanti
  ['te',           'Tea / theine',        'Stimulants',  'te tea teina matcha theine'],
  ['preworkout',   'Pre-workout',         'Stimulants',  'pre workout'],
  ['modafinil',    'Modafinil',           'Stimulants',  ''],
  // alcol
  ['alcol',        'Alcohol',             'Alcohol',     'alcool birra vino superalcolici drink cocktail spritz alcohol beer wine alcol'],
  // cannabis
  ['cbd',          'CBD only',            'Cannabis',    'cannabidiolo cannabis light solo cbd'],
  // integratori
  ['multivitaminico','Multivitamin',        'Supplements', 'vitamine multivitamin multivitaminico'],
  ['vitd',         'Vitamin D',           'Supplements', 'vitamina d3 colecalciferolo vitamin'],
  ['vitb12',       'Vitamin B12',         'Supplements', 'b12 cobalamina vitamin vitamina'],
  ['vitc',         'Vitamin C',           'Supplements', 'acido ascorbico vitamin ascorbic vitamina'],
  ['omega3',       'Omega 3',             'Supplements', 'olio di pesce fish oil'],
  ['magnesio',     'Magnesium',           'Supplements', 'magnesium magnesio'],
  ['zinco',        'Zinc',                'Supplements', 'zinc zinco'],
  ['ferro',        'Iron',                'Supplements', 'iron ferro'],
  ['proteine',     'Protein powder',      'Supplements', 'whey protein proteine protein powder'],
  ['collagene',    'Collagen',            'Supplements', 'collagen collagene'],
  ['elettroliti',  'Electrolytes / salts', 'Supplements', 'sali minerali elettroliti electrolytes salts'],
  ['ashwagandha',  'Ashwagandha',         'Supplements', 'adattogeni'],
  ['beta-alanina', 'Beta-alanine',        'Supplements', 'beta alanina beta alanine'],
  ['probiotici',   'Probiotics',          'Supplements', 'fermenti lattici probiotics probiotici'],
  // sonno e farmaci da banco
  ['antistaminico','Antihistamine',       'Medicines',   'allergia cetirizina antihistamine allergy antistaminico'],
  ['ibuprofene',   'Ibuprofen',           'Medicines',   'moment brufen antidolorifico antinfiammatorio ibuprofen painkiller ibuprofene'],
  ['paracetamolo', 'Paracetamol',         'Medicines',   'tachipirina antidolorifico paracetamol acetaminophen painkiller paracetamolo'],
  ['sonnifero',    'Sleeping pill',       'Sleep',       'zolpidem ipnotico sleeping pill sonnifero'],
  ['benzodiazepine','Benzodiazepines',     'Medicines',   'xanax lorazepam diazepam valium ansiolitico benzodiazepines'],
  ['antidepressivo','Antidepressant',      'Medicines',   'ssri sertralina antidepressant antidepressivo'],
  // psichedelici e altre droghe
  ['lsd',          'LSD',                 'Psychedelics','acido'],
  ['mdma',         'MDMA',                'Other drugs', 'ecstasy molly'],
  ['ketamina',     'Ketamine',            'Other drugs', 'keta ketamine ketamina'],
  ['cocaina',      'Cocaine',             'Other drugs', 'coca cocaine coke cocaina'],
  ['anfetamine',   'Amphetamines',        'Other drugs', 'speed amphetamines anfetamine'],
  ['dmt',          'DMT',                 'Psychedelics','ayahuasca'],
  ['mescalina',    'Mescaline',           'Psychedelics','peyote mescaline mescalina'],
  ['oppioidi',     'Opioids',             'Other drugs', 'oppio codeina morfina opioids opium oppioidi'],
  ['ghb',          'GHB',                 'Other drugs', ''],
  ['poppers',      'Poppers',             'Other drugs', ''],
  ['protossido',   'Nitrous oxide',       'Other drugs', 'gas esilarante palloncini nitrous oxide laughing gas protossido azoto'],
  ['kratom',       'Kratom',              'Other drugs', '']
];
window.Health.CATALOGO = C.map(function (r) { return { id: r[0], label: r[1], cat: r[2], alias: r[3] }; });
})();
