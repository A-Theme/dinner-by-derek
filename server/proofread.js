'use strict';
const { db } = require('./db');

/**
 * SUGGESTION ONLY. Nothing in this file ever rewrites what the owner typed.
 * It returns a list of spans with a proposed replacement; the dashboard draws
 * them under the field; the owner taps one to apply it or dismisses it. A
 * description saves exactly as typed whether the list is empty or twenty long,
 * and nothing anywhere records whether he looked.
 *
 * That is the bargain allergens.js makes, for the same reason: the words on
 * the menu are his. A checker that silently "corrects" a dish name is one that
 * turns Cacio e Pepe into Cacao e Pepe on a Tuesday and tells nobody.
 *
 * Deterministic, offline, inspectable: word lists and regular expressions held
 * in this file, plus the vocabulary already in the database. No model, no
 * network call, no scoring. The same paragraph always yields the same list.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS ALONGSIDE THE BROWSER'S OWN SPELL CHECKER
 *
 * Every field the owner writes in is also marked `spellcheck="true"` with
 * `lang="en-CA"`, so the phone underlines misspellings in red using a
 * dictionary it maintains and he can add to. That is the better tool for the
 * long tail of English and this file does not try to replace it.
 *
 * It covers the four things a red squiggle cannot:
 *
 *   1. Real words in the wrong place. "Sever with crusty bread" and "for
 *      desert" are both spelled correctly, so no browser marks either, and
 *      both are embarrassing on a published menu.
 *   2. Grammar and doubled words. "the the", "could of", "your welcome".
 *   3. Spacing and punctuation. Two spaces, a space before a comma, a missing
 *      space after a full stop — invisible in a four-row box on a phone,
 *      obvious set in the menu's display face.
 *   4. Words he has written before. The dish library, the recipes and the
 *      allergen dictionary are a vocabulary nobody else has: gochujang,
 *      labneh, tourtière. A phone underlines all three; this file knows them,
 *      and uses them the other way round to catch "gochjang".
 *
 * Pasted text is checked too, which the squiggle usually skips.
 */

/* --- What counts as a word ------------------------------------------------
 * Apostrophes and hyphens are inside a word, not between two: "brewer's",
 * "sous-vide", "slow-roasted". Splitting on them would hand the checker
 * "brewer" and "s" and then offer a correction for the "s".
 *
 * The curly apostrophe is folded to the straight one for lookups only. The
 * offsets always point into the text the owner actually typed, so an accepted
 * fix replaces the right characters. allergens.js flattens the same way and
 * for the same reason: a phone keyboard and a web form produce different
 * characters for the same mark.
 */
const WORD_RE = /[A-Za-z][A-Za-z'‘’ʼ-]*/g;
const flatten = (s) => String(s == null ? '' : s).toLowerCase().replace(/[‘’ʼ]/g, "'");

/* --- 1. Misspellings ------------------------------------------------------
 * wrong -> right, and every entry is a spelling that is never correct, so a
 * chip from this list is never a matter of taste. Words with two real
 * spellings live in HOUSE_STYLE; words that are correct but missing an accent
 * live in ACCENTS; real words in the wrong place need their neighbours to
 * decide and live in GRAMMAR.
 *
 * Two halves. The kitchen vocabulary is the half that earns its keep here:
 * "vinagrette" and "proscuitto" are exactly the words a menu writer gets wrong
 * and a general dictionary is worst at.
 *
 * Three kinds of entry have been taken back out, because none of them met the
 * bar and every one of them argued with a word that was already right:
 *
 *   A word that is also a word. "allot" was mapped to "a lot", so "Allot
 *   twenty minutes for the dough to rest" was offered a correction that is not
 *   English.
 *
 *   A variant a dictionary lists. "hummous", "hommus", "kimchee", "flakey" and
 *   "bolognaise" are all spellings you can look up. A transliteration out of a
 *   script that is not Latin has no single right answer to be wrong about.
 *
 *   A spelling somebody chose. "chowda" is a voice, not a slip.
 *
 * And one entry mapped a word to itself: "bruschetta" sat in here pointing at
 * "bruschetta", so five correct dish names in the library were told they
 * looked like typos and offered themselves back.
 */
const MISSPELLINGS = {
  /* Kitchen and menu */
  vinagrette: 'vinaigrette', vinegarette: 'vinaigrette', vinaigrete: 'vinaigrette',
  vinaigarette: 'vinaigrette', viniagrette: 'vinaigrette', vinagarette: 'vinaigrette',
  proscuitto: 'prosciutto', prosciuto: 'prosciutto', proscuito: 'prosciutto',
  brocolli: 'broccoli', brocoli: 'broccoli', broccolli: 'broccoli',
  tomatoe: 'tomato', tomatos: 'tomatoes', potatoe: 'potato', potatos: 'potatoes',
  avacado: 'avocado', avocodo: 'avocado', avacodo: 'avocado', advacado: 'avocado',
  bruchetta: 'bruschetta', brushetta: 'bruschetta',
  ceasar: 'Caesar', caeser: 'Caesar', casear: 'Caesar', ceaser: 'Caesar',
  chipolte: 'chipotle', chipoltle: 'chipotle', chiplote: 'chipotle',
  guacomole: 'guacamole', guacamoli: 'guacamole', guacmole: 'guacamole',
  mozarella: 'mozzarella', motzarella: 'mozzarella', mozzarela: 'mozzarella',
  parmesean: 'Parmesan', parmasean: 'Parmesan', parmisan: 'Parmesan',
  gnochi: 'gnocchi', gnocci: 'gnocchi', gnoche: 'gnocchi',
  lasagnia: 'lasagna', lasgna: 'lasagna', lasagnea: 'lasagna',
  spagetti: 'spaghetti', spaghetii: 'spaghetti', speghetti: 'spaghetti',
  fettucine: 'fettuccine', fettucini: 'fettuccine', fetuccine: 'fettuccine',
  rissoto: 'risotto', risoto: 'risotto', rissotto: 'risotto',
  tirimisu: 'tiramisu', tiramasu: 'tiramisu', tiramissu: 'tiramisu',
  bernaise: 'bearnaise', holandaise: 'hollandaise',
  hollandaisse: 'hollandaise', bolagnese: 'bolognese',
  bolonaise: 'bolognese', bolegnese: 'bolognese',
  chorrizo: 'chorizo', chourizo: 'chorizo', chorico: 'chorizo',
  cilentro: 'cilantro', cilanto: 'cilantro', corriander: 'coriander',
  cinamon: 'cinnamon', cinnimon: 'cinnamon', cummin: 'cumin', tumeric: 'turmeric',
  tarragan: 'tarragon', rosemarry: 'rosemary', parsely: 'parsley',
  parsly: 'parsley', basel: 'basil', oregeno: 'oregano', oragano: 'oregano',
  cardamon: 'cardamom', paprikka: 'paprika', peppercini: 'pepperoncini',
  pepperocini: 'pepperoncini', jalepeno: 'jalapeño', jalpeno: 'jalapeño',
  halapeno: 'jalapeño', jalepano: 'jalapeño',
  garlick: 'garlic', gralic: 'garlic', galric: 'garlic',
  onoin: 'onion', onien: 'onion', mushrom: 'mushroom', mushroon: 'mushroom',
  zuchini: 'zucchini', zucchinni: 'zucchini', zuccini: 'zucchini',
  cauliflour: 'cauliflower', califlower: 'cauliflower', caulifower: 'cauliflower',
  asparagas: 'asparagus', asperagus: 'asparagus', arugala: 'arugula',
  radiccio: 'radicchio', endieve: 'endive', letuce: 'lettuce', lettuse: 'lettuce',
  cucumbre: 'cucumber', cucumer: 'cucumber',
  chikpeas: 'chickpeas', chickpeaz: 'chickpeas', lentles: 'lentils',
  lentiles: 'lentils',
  chiken: 'chicken', chickn: 'chicken', chikken: 'chicken', chikcen: 'chicken',
  beaf: 'beef', porck: 'pork', salomon: 'salmon', sammon: 'salmon',
  shirmp: 'shrimp', shimp: 'shrimp', scollops: 'scallops',
  hadock: 'haddock', haddok: 'haddock', mackeral: 'mackerel',
  brisquet: 'brisket', tenderlion: 'tenderloin', sirlion: 'sirloin',
  meatbals: 'meatballs', saussage: 'sausage', sausge: 'sausage',
  sasuage: 'sausage', suasage: 'sausage', bacn: 'bacon', pastramy: 'pastrami',
  shwarma: 'shawarma', schwarma: 'shawarma',
  gochjang: 'gochujang', gochuchang: 'gochujang', gouchujang: 'gochujang',
  srirachia: 'sriracha', siracha: 'sriracha', sriacha: 'sriracha',
  tzaziki: 'tzatziki', tzatzki: 'tzatziki', tatziki: 'tzatziki',
  falafal: 'falafel', fallafel: 'falafel',
  tahinni: 'tahini', harrisa: 'harissa', chimmichurri: 'chimichurri',
  chimichuri: 'chimichurri', misso: 'miso',
  teryaki: 'teriyaki', teriyakki: 'teriyaki', wasabe: 'wasabi',
  tempora: 'tempura', ramin: 'ramen',
  poutin: 'poutine', poutene: 'poutine', peirogi: 'pierogi',
  cabage: 'cabbage', casarole: 'casserole', casserol: 'casserole',
  cassarole: 'casserole', marinera: 'marinara', alfreado: 'Alfredo',
  carbonarra: 'carbonara', carbonera: 'carbonara', pestoe: 'pesto',
  ailoi: 'aioli', aoili: 'aioli', aoli: 'aioli',
  mayonaise: 'mayonnaise', mayonaisse: 'mayonnaise', mayonnase: 'mayonnaise',
  ketsup: 'ketchup', mustart: 'mustard',
  worcestshire: 'Worcestershire', worchestershire: 'Worcestershire',
  wostershire: 'Worcestershire', worcestersire: 'Worcestershire',
  balsalmic: 'balsamic', balsmic: 'balsamic',
  carmelized: 'caramelized', carmalized: 'caramelized', caramalized: 'caramelized',
  carmelised: 'caramelised', carmelize: 'caramelize',
  marinaded: 'marinated', marintated: 'marinated',
  braized: 'braised', braissed: 'braised', brasied: 'braised',
  roased: 'roasted', rosted: 'roasted', roatsed: 'roasted',
  grilld: 'grilled', grillled: 'grilled', poched: 'poached',
  simmerd: 'simmered', seasonned: 'seasoned', seasoing: 'seasoning',
  shreded: 'shredded', shreadded: 'shredded', pulld: 'pulled',
  crispey: 'crispy', creemy: 'creamy',
  delicous: 'delicious', delisious: 'delicious', delicius: 'delicious',
  scrumptous: 'scrumptious',
  homade: 'homemade', homeade: 'homemade', fresly: 'freshly', freshy: 'freshly',
  vegtable: 'vegetable', vegatable: 'vegetable', vegetible: 'vegetable',
  vegtables: 'vegetables', vegatables: 'vegetables', vegitable: 'vegetable',
  vegitarian: 'vegetarian', vegeterian: 'vegetarian', vegatarian: 'vegetarian',
  glutten: 'gluten', gluetn: 'gluten', dairry: 'dairy',
  allergin: 'allergen', alergen: 'allergen', alergy: 'allergy',
  alergies: 'allergies', allergys: 'allergies', allerigies: 'allergies',
  peanunt: 'peanut', penaut: 'peanut', walnutt: 'walnut',
  yougurt: 'yogurt', yougart: 'yogurt',
  choclate: 'chocolate', chocolat: 'chocolate', chocalate: 'chocolate',
  chocolotte: 'chocolate', carmel: 'caramel', carmal: 'caramel',
  vanila: 'vanilla', vanilaa: 'vanilla', rasberry: 'raspberry',
  rasperry: 'raspberry', strawbery: 'strawberry', bluberry: 'blueberry',
  blueberrys: 'blueberries', cherrys: 'cherries', bannana: 'banana',
  banna: 'banana', pineaple: 'pineapple',
  cookey: 'cookie', biscut: 'biscuit', bisquit: 'biscuit',
  muffen: 'muffin', crossaint: 'croissant', croissaint: 'croissant',
  sourdogh: 'sourdough', sourdoug: 'sourdough', baguete: 'baguette',
  bagette: 'baguette', ciabata: 'ciabatta', focacia: 'focaccia',
  foccacia: 'focaccia', tortila: 'tortilla', tortillia: 'tortilla',
  quesadila: 'quesadilla', enchalada: 'enchilada', burritto: 'burrito',
  empenada: 'empanada',
  gazpatcho: 'gazpacho', minestroni: 'minestrone',
  chowdar: 'chowder', bisqu: 'bisque', bouillion: 'bouillon',
  stroganof: 'stroganoff', goulish: 'goulash', goulasch: 'goulash',
  jambalya: 'jambalaya', paela: 'paella', paellia: 'paella',
  currys: 'curries', basmatti: 'basmati', couscus: 'couscous',
  orzoo: 'orzo', quinioa: 'quinoa',
  portins: 'portions', serveings: 'servings', reheeat: 'reheat',
  reaheat: 'reheat', refridgerate: 'refrigerate', refridgerator: 'refrigerator',
  freezor: 'freezer', microwve: 'microwave', tempreture: 'temperature',
  temprature: 'temperature', temperture: 'temperature',
  minuts: 'minutes', minuites: 'minutes',
  seperate: 'separate', seperated: 'separated', seperately: 'separately',

  /* Ordinary English */
  teh: 'the', hte: 'the', adn: 'and', nad: 'and',
  thier: 'their', thnaks: 'thanks', taht: 'that', yuo: 'you', jsut: 'just',
  wiht: 'with', whcih: 'which', becuase: 'because', becasue: 'because',
  beacuse: 'because', becuse: 'because',
  recieve: 'receive', recieved: 'received', recieving: 'receiving',
  beleive: 'believe', beleived: 'believed', acheive: 'achieve',
  definately: 'definitely', definatly: 'definitely', definetly: 'definitely',
  seperation: 'separation', occured: 'occurred', occuring: 'occurring',
  occassion: 'occasion', occassionally: 'occasionally', ocasionally: 'occasionally',
  neccessary: 'necessary', necesary: 'necessary', neccesary: 'necessary',
  accomodate: 'accommodate', accomodation: 'accommodation',
  accomodating: 'accommodating', acommodate: 'accommodate',
  reccomend: 'recommend', recomend: 'recommend', reccommend: 'recommend',
  recomended: 'recommended', reccomended: 'recommended',
  availabe: 'available', availible: 'available', avalable: 'available',
  avaliable: 'available', availble: 'available', avaialbe: 'available',
  untill: 'until', alot: 'a lot',
  tommorow: 'tomorrow', tommorrow: 'tomorrow', tomorow: 'tomorrow',
  yesteday: 'yesterday', wendsday: 'Wednesday', wensday: 'Wednesday',
  wedensday: 'Wednesday', thursady: 'Thursday', thurday: 'Thursday',
  saterday: 'Saturday', saturaday: 'Saturday', febuary: 'February',
  januray: 'January', calender: 'calendar',
  adress: 'address', adresses: 'addresses', apartement: 'apartment',
  buisness: 'business', bussiness: 'business', busines: 'business',
  goverment: 'government', enviroment: 'environment', enviornment: 'environment',
  restraunt: 'restaurant', resturant: 'restaurant', restarant: 'restaurant',
  restaraunt: 'restaurant', restuarant: 'restaurant',
  kitchin: 'kitchen', kithcen: 'kitchen',
  delievery: 'delivery', delivary: 'delivery', deliverd: 'delivered',
  delievered: 'delivered',
  freind: 'friend', freinds: 'friends', familys: 'families',
  peices: 'pieces', peice: 'piece', wieght: 'weight', heigth: 'height',
  lenght: 'length', strenght: 'strength',
  publically: 'publicly', succesful: 'successful', successfull: 'successful',
  sucessful: 'successful', truely: 'truly', arguement: 'argument',
  intrest: 'interest', intresting: 'interesting', diffrent: 'different',
  diferent: 'different', differnt: 'different', diffrence: 'difference',
  probaly: 'probably', probablly: 'probably', suprise: 'surprise',
  suprised: 'surprised', surprize: 'surprise', excellant: 'excellent',
  excelent: 'excellent', favourate: 'favourite', favorate: 'favourite',
  greatful: 'grateful', gratefull: 'grateful', apreciate: 'appreciate',
  wether: 'whether', wheather: 'whether', allways: 'always', alway: 'always',
  atleast: 'at least', infront: 'in front', incase: 'in case',
  aswell: 'as well', ontop: 'on top', inbetween: 'in between',
  noone: 'no one', irregardless: 'regardless',
  emial: 'email', mesage: 'message', mesages: 'messages',
  numer: 'number', nubmer: 'number', phne: 'phone',
  quanity: 'quantity', quantitiy: 'quantity', amout: 'amount',
  managment: 'management', paymnet: 'payment', paymemt: 'payment',
  payement: 'payment', recipt: 'receipt', reciept: 'receipt',
  refered: 'referred', prefered: 'preferred', transfered: 'transferred',
  ordre: 'order', odrer: 'order', costumer: 'customer', costumers: 'customers',
  custmer: 'customer', serivce: 'service', servcie: 'service', sevice: 'service',
  schedual: 'schedule', maintainance: 'maintenance', maintenence: 'maintenance',
};

/* --- 2. Accents -----------------------------------------------------------
 * Correctly spelled, missing their mark. Kept apart from MISSPELLINGS so the
 * chip can say so — "sauteed" is not a typo, it is a keyboard without an
 * option key, and the owner may well want it left plain in a dish name.
 *
 * He does. Across four thousand rows of dish names, recipes and method steps
 * this kitchen has written "creme", "puree", "veloute", "sauteed", "crepes",
 * "gruyere", "jalapeno" and "tourtiere", and has never once typed the mark —
 * and this list was the single largest source of chips on the site, forty-three
 * of them, every one arguing with a settled habit.
 *
 * So the offer defers to the kitchen now: a plain spelling this kitchen has
 * already written is a spelling here, and the accent is not raised against it.
 * The chip is still there for a word he has only ever written accented, which
 * is the case it was for. See plainByHabit() below.
 *
 * Two entries came out altogether, because deferring was not enough to make
 * them right:
 *
 *   "pate", which a word list cannot decide. "Pate Brisee" and "pate sucree"
 *   are pâte, the dough; a terrine is pâté. Both are in the recipe book, and
 *   the chip offered pâté for all of them — a fix worse than what was typed.
 *
 *   "creole", which in English is Creole. Créole is the French word, and
 *   "Creole Gumbo" is the dish.
 */
const ACCENTS = {
  creme: 'crème', brulee: 'brûlée', souffle: 'soufflé', saute: 'sauté',
  sautee: 'sauté', sauteed: 'sautéed', sauteing: 'sautéing', flambe: 'flambé',
  puree: 'purée', pureed: 'puréed', purees: 'purées', entree: 'entrée',
  entrees: 'entrées', consomme: 'consommé', veloute: 'velouté',
  jalapeno: 'jalapeño', jalapenos: 'jalapeños', tourtiere: 'tourtière',
  nicoise: 'niçoise', crepe: 'crêpe', crepes: 'crêpes',
  mache: 'mâche', gruyere: 'gruyère', bearnaise: 'béarnaise',
};

/* --- 3. House style -------------------------------------------------------
 * Both spellings are correct English. This is a Canadian kitchen, so the
 * Canadian one is offered — worded as a preference, never as an error.
 *
 * Canadian, though, not British, and the two part company on more than -our
 * and -re. "fulfill", "skillful", "enrollment" and "installment" keep the
 * doubled l here and have come out of this list, which was offering the
 * British form and calling it Canadian. "donut" went with them: it is what the
 * sign over every Canadian counter says.
 */
const HOUSE_STYLE = {
  color: 'colour', colors: 'colours', colored: 'coloured', coloring: 'colouring',
  flavor: 'flavour', flavors: 'flavours', flavored: 'flavoured',
  flavorful: 'flavourful', flavoring: 'flavouring',
  savory: 'savoury', savor: 'savour', savored: 'savoured',
  favorite: 'favourite', favorites: 'favourites', favor: 'favour',
  neighbor: 'neighbour', neighbors: 'neighbours', neighborhood: 'neighbourhood',
  labor: 'labour', honor: 'honour', humor: 'humour', harbor: 'harbour',
  center: 'centre', centers: 'centres', centered: 'centred',
  fiber: 'fibre', liter: 'litre', liters: 'litres', meter: 'metre',
  theater: 'theatre', caliber: 'calibre',
  gray: 'grey', yoghurt: 'yogurt',
  mold: 'mould', molded: 'moulded', smolder: 'smoulder',
};

const NAME_OF = {
  ',': 'comma', '.': 'full stop', ';': 'semicolon', ':': 'colon',
  '!': 'exclamation mark', '?': 'question mark',
};

/** "its" -> "it's" while keeping whatever case was typed. */
const keepCase = (found, lower) => (found[0] === found[0].toUpperCase()
  ? lower[0].toUpperCase() + lower.slice(1) : lower);

/* --- 4. Grammar and usage -------------------------------------------------
 * Patterns, not single words, because these are real words in the wrong place
 * and only the neighbours say so.
 *
 * Every rule here is one that is essentially always wrong in menu prose. The
 * tempting ones that are not — its/it's in the general case, affect/effect,
 * fewer/less — are deliberately absent. A checker that cries wolf on correct
 * writing is one whose chips get ignored, including the chips that were right,
 * and the ones that matter here sit next to an allergen review.
 */
/**
 * Doublings that are a name, not a slip.
 *
 * The first row is the English ones, and "had had" is the only one of those
 * that turns up in a recipe note. The rest is why this list is now worth
 * having a name: a repeated word is how a great many dishes are spelled, and
 * the rule was flagging every one of them in the library — Peri Peri Chicken,
 * Gado Gado, and "agar agar" three times over in the ingredient lines, each
 * one offered a fix that would have cut the name in half.
 */
const REDUPLICATED = new Set([
  'had', 'that', 'no', 'so', 'very', 'ha',
  'agar', 'peri', 'piri', 'gado', 'mahi', 'bang', 'dan', 'pil', 'chow',
  'shabu', 'lomi', 'cha', 'beri',
]);

const GRAMMAR = [
  {
    /* A doubled word. The span covers both copies so accepting it leaves one. */
    re: /\b([A-Za-z]+)(\s+)\1\b/gi,
    skip: (m) => REDUPLICATED.has(m[1].toLowerCase()),
    fix: (m) => m[1],
    kind: 'grammar',
    label: () => 'doubled word',
    why: (m) => `"${m[1]}" is written twice.`,
  },
  {
    re: /\b(could|should|would|must|might) of\b/gi,
    fix: (m) => `${m[1]} have`,
    kind: 'grammar',
    label: () => 'of / have',
    why: (m) => `"${m[1]} of" is always "${m[1]} have".`,
  },
  {
    /* "in" and "on" came out. A kitchen writes "your in-season vegetables"
       and "your on-hand stock", and the word boundary reads the first half of
       a hyphenated compound as the whole word. */
    re: /\byour\b(?=\s+(?:welcome|going|getting|looking|coming|the|a|not)\b)/gi,
    fix: (m) => keepCase(m[0], "you're"),
    kind: 'grammar',
    label: () => 'your / you’re',
    why: () => 'This one is "you are", so it takes the apostrophe.',
  },
  {
    /* Case-insensitive, because the sentence start is exactly where this one
       happens: "Its a family recipe" is the sentence somebody writes.

       "time" and "all" came out, because after those two the possessive is the
       likelier reading and not the rarer one: "give it its time in the pan",
       "its all-butter pastry". */
    re: /\bits\b(?=\s+(?:a|an|the|been|going|worth|not)\b)/gi,
    fix: (m) => keepCase(m[0], "it's"),
    kind: 'grammar',
    label: () => 'its / it’s',
    why: () => '"It is" takes the apostrophe; "its" without one means belonging to it.',
  },
  {
    re: /\bit's\b(?=\s+own\b)/gi,
    fix: (m) => keepCase(m[0], 'its'),
    kind: 'grammar',
    label: () => 'it’s / its',
    why: () => 'Belonging to it — no apostrophe.',
  },
  {
    re: /\bthere\b(?=\s+own\b)/gi,
    fix: (m) => keepCase(m[0], 'their'),
    kind: 'grammar',
    label: () => 'there / their',
    why: () => 'Belonging to them is "their".',
  },
  {
    re: /\b(better|more|less|other|rather)\s+then\b/gi,
    fix: (m) => `${m[1]} than`,
    kind: 'grammar',
    label: () => 'then / than',
    why: () => 'Comparing takes "than"; "then" is about time.',
  },
  {
    /* Only the words that never follow "to" as a destination. "hot", "cold",
       "thin", "thick" and "sweet" have all come out, because in this kitchen a
       "to" in front of them is a preposition or an infinitive nearly every
       time: "transfer to cold water", "add to hot stock", "a spoon of the
       cooking water to thin the sauce", "cook it down to thick jam", "fold
       through to sweet potato mash". Five correct sentences, five wrong
       chips. */
    re: /\bto\b(?=\s+(?:much|many|late|early|salty)\b)/gi,
    fix: (m) => keepCase(m[0], 'too'),
    kind: 'grammar',
    label: () => 'to / too',
    why: () => 'Excess takes "too", with two o’s.',
  },
  {
    /* Missing apostrophes. One rule, because they are one mistake: a phone
       keyboard that did not offer the contraction. */
    re: /\b(dont|doesnt|didnt|isnt|arent|wasnt|werent|hasnt|havent|hadnt|couldnt|wouldnt|shouldnt|wont|cant|thats|theres|wheres|whats|lets|youre|theyre|weve|youve|ive|id|im)\b/g,
    /* "wont", "cant", "lets", "id" and "im" are all real words or
       abbreviations. Only offered when the next word makes the contraction the
       only sensible reading. */
    skip: (m) => {
      const rest = m.input.slice(m.index + m[0].length);
      /* "lets" needs its own list, and it is very nearly the opposite of the
         other one. The verb takes an object, and its objects are exactly the
         words that argue FOR the contraction everywhere else: "keep the
         liquid, it is what lets you loosen them later", "a loose coat is what
         lets it puff away from the crumb". Both of those are in the recipe
         book and both were being told to write "let's". Only a bare verb after
         it makes the contraction the reading. */
      if (m[1] === 'lets') {
        return !/^\s+(?:get|go|have|make|start|take|see|do|eat|try|talk|wait|call|say|keep)\b/i.test(rest);
      }
      if (!['wont', 'cant', 'id', 'im'].includes(m[1])) return false;
      return !/^\s+(?:be|get|go|have|make|start|take|know|see|do|eat|try|talk|wait|the|a|an|it|you|we|us|sorry|going|coming|happy|afraid|not)\b/i
        .test(rest);
    },
    fix: (m) => {
      const APOS = {
        dont: "don't", doesnt: "doesn't", didnt: "didn't", isnt: "isn't",
        arent: "aren't", wasnt: "wasn't", werent: "weren't", hasnt: "hasn't",
        havent: "haven't", hadnt: "hadn't", couldnt: "couldn't",
        wouldnt: "wouldn't", shouldnt: "shouldn't", wont: "won't",
        cant: "can't", thats: "that's", theres: "there's", wheres: "where's",
        whats: "what's", lets: "let's", youre: "you're", theyre: "they're",
        weve: "we've", youve: "you've", ive: "I've", id: "I'd", im: "I'm",
      };
      return keepCase(m[0], APOS[m[1]]);
    },
    kind: 'grammar',
    label: () => 'missing apostrophe',
    why: (m) => `"${m[1]}" is missing its apostrophe.`,
  },
  {
    /* Real words in the wrong place, where a neighbour decides it. */
    re: /\bsever\b(?=\s+(?:with|hot|cold|warm|over|alongside|chilled|immediately|family))/gi,
    fix: (m) => keepCase(m[0], 'serve'),
    kind: 'spelling',
    label: () => 'sever / serve',
    why: () => '"Sever" means to cut off — almost certainly "serve".',
  },
  {
    /* Only where a neighbour settles it. "for desert" and "our deserts" are
       always pudding; "a desert" and "the desert" are ordinary English, and an
       earlier draft of this rule flagged both. A supper club mentioning the
       Sahara is rare — a checker that argues with a correct sentence is how
       the whole panel stops being read, which is not. */
    re: /\b(?:for|our)\s+deserts?\b|\bdeserts?(?=\s*[:—-])|\bdesert\s+(?:menu|options|selection)\b/gi,
    fix: (m) => m[0].replace(/desert/i, (d) => (d[0] === 'D' ? 'Dessert' : 'dessert')),
    kind: 'spelling',
    label: () => 'desert / dessert',
    why: () => 'One "s" is the Sahara; pudding takes two.',
  },
  {
    re: /\bdiary\b(?=[\s-]+(?:free|allergy|allergies|products?|intolerant))/gi,
    fix: (m) => keepCase(m[0], 'dairy'),
    kind: 'spelling',
    label: () => 'diary / dairy',
    why: () => 'A diary is the book; milk is "dairy". This one goes on an allergen list.',
  },
  {
    re: /\bloose\b(?=\s+(?:weight|track|it\b))/gi,
    fix: (m) => keepCase(m[0], 'lose'),
    kind: 'grammar',
    label: () => 'loose / lose',
    why: () => '"Loose" is the opposite of tight.',
  },
  {
    re: /\bpiece of mind\b/gi,
    fix: (m) => keepCase(m[0], 'peace of mind'),
    kind: 'grammar',
    label: () => 'peace of mind',
    why: () => 'The calm one is "peace".',
  },
  {
    re: /\bfor all intensive purposes\b/gi,
    fix: (m) => keepCase(m[0], 'for all intents and purposes'),
    kind: 'grammar',
    label: () => 'intents and purposes',
    why: () => 'The phrase is "intents and purposes".',
  },
];

/* --- 5. Spacing and punctuation ------------------------------------------
 * The invisible ones. A phone keyboard produces every single one of these and
 * none of them shows up in a four-row box; they all show up set in the menu's
 * display face at 24px.
 */
const TYPOGRAPHY = [
  {
    re: /(?<=\S)[ \t]{2,}(?=\S)/g,
    fix: () => ' ',
    kind: 'spacing',
    label: () => 'double space',
    why: () => 'Two spaces in a row.',
  },
  {
    /* The lookbehind is not part of what this matches — it is what stops the
       scan being quadratic.
     *
     * A global `[ \t]+` is retried at every position of a run of spaces, and at
     * each one it consumes the rest of the run before discovering there is no
     * punctuation after it, so the work grows with the square of the run. It is
     * measurable on text a person can produce: 2,000 spaces cost 3ms, 4,000
     * cost 13ms, 8,000 cost 53ms and 16,000 cost 209ms, on the one thread that
     * also serves the customer menu. MAX_TEXT caps the damage at a third of a
     * second, and this is the endpoint a keystroke calls.
     *
     * Anchoring to the START of a run costs nothing in matches. Where a run IS
     * followed by punctuation the first position already matched the whole of
     * it and lastIndex moved past, so no later position was ever tried; where
     * it is not, every one of those positions was wasted work. */
    re: /(?<![ \t])[ \t]+([,;:!?])/g,
    fix: (m) => m[1],
    kind: 'spacing',
    label: (m) => `space before "${m[1]}"`,
    why: (m) => `A space before the ${NAME_OF[m[1]] || 'punctuation'}.`,
  },
  {
    /* Punctuation with nothing after it. The lookbehind and lookahead — two
       letters either side, and no letter-dot pair before — are what keep
       "$12.50", "dinnerbyderek.ca" and "e.g." out of it. */
    re: /(?<![A-Za-z]\.)(?<=[a-z]{2})([.,;!?])(?=[A-Za-z]{2})/g,
    skip: (m, text) => /\b(?:e\.g|i\.e|etc|www|com|net|org|ca)\b/i
      .test(text.slice(Math.max(0, m.index - 5), m.index + 5)),
    fix: (m) => `${m[1]} `,
    kind: 'spacing',
    label: (m) => `no space after "${m[1]}"`,
    why: (m) => `Nothing after the ${NAME_OF[m[1]] || 'punctuation'}.`,
  },
  /* Three rules used to sit here — a run of four dots folded to an ellipsis,
     and "!!" and "??" folded to a single mark. All three are gone. How many
     exclamation marks a supper club puts on "Back by popular demand!!" is the
     owner's business and not a mistake, and the bar this file sets itself is
     that a chip is never a matter of taste. Folding "...." to "…" also quietly
     swapped in a character he does not type anywhere else. */
  {
    /* A lower-case "i" standing on its own is always the pronoun. */
    re: /(?<![\w'’])i(?![\w'’])/g,
    fix: () => 'I',
    kind: 'grammar',
    label: () => 'lower-case "i"',
    why: () => 'The pronoun is a capital I.',
  },
];

/* --- 6. Sentence starts ---------------------------------------------------
 * Only after a full stop, question mark or exclamation mark — never at the
 * start of a line. The ingredients box is a list of lines ("salt (optional)"),
 * and a checker that wants every line capitalised there is a checker that
 * shows twelve chips on a correct recipe.
 */
const ABBREVIATIONS = new Set([
  'approx', 'etc', 'vs', 'no', 'dr', 'mr', 'mrs', 'ms', 'st', 'ave', 'rd',
  'min', 'max', 'oz', 'lb', 'lbs', 'tbsp', 'tsp', 'pkg', 'qty', 'temp',
  /* The rest of a recipe's shorthand. "Refrigerate 2 hrs. then bake" and
     "Rest 40 mins. then carve" were both being asked to capitalise "then",
     which is the same wrong chip as capitalising after "1 tbsp." — the list
     was simply short. Times, weights, measures, months, weekdays. */
  'mins', 'hr', 'hrs', 'sec', 'secs', 'ml', 'cl', 'dl', 'kg', 'gm', 'gal',
  'qt', 'pt', 'doz', 'ea', 'pc', 'pcs', 'deg', 'tbs', 'dsp', 'fl', 'in', 'ft',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct',
  'nov', 'dec', 'mon', 'tue', 'tues', 'wed', 'weds', 'thu', 'thur', 'thurs',
  'fri', 'sat', 'sun', 'dept', 'apt', 'blvd', 'jr', 'sr', 'prof',
]);

function sentenceStarts(text, findings) {
  /* The bound on the first group is the same guard as the one on the
   * space-before-punctuation rule above, arrived at from the other side.
   *
   * `[A-Za-z]*` unanchored and global is retried at every character of a run of
   * letters, and at each one it swallows the rest of the run before finding no
   * full stop behind it — so a single long word costs the square of its length.
   * One 20,000-letter token measured 280ms here, which is most of what
   * MAX_TEXT allows a request to cost.
   *
   * A ceiling rather than a lookbehind, and the difference matters. Anchoring
   * to a word start would refuse the empty match this relies on: after a
   * finding, lastIndex lands inside the word it just consumed, and the next
   * sentence's "!" is then preceded by a letter — so "Wow! there! hello" would
   * find the first and lose the second. The bound keeps every match and only
   * caps the work. Forty is far past the longest entry in ABBREVIATIONS, which
   * is the only thing the group is read for, so a word too long to be bounded
   * is a word too long to be an abbreviation either way. */
  const re = /([A-Za-z]{0,40})([.!?])["'’)]?\s+([a-z][a-z']{2,})/g;
  let m;
  while ((m = re.exec(text))) {
    /* Not every full stop ends a sentence. "10 p.m. the night before" and
       "1 tbsp. salt" are both correct, and both used to be told to capitalise
       the word after them. A single letter before the dot is always part of an
       abbreviation — p.m., e.g., i.e. — and the rest are named. */
    const before = m[1].toLowerCase();
    if (m[2] === '.' && (before.length <= 1 || ABBREVIATIONS.has(before))) continue;
    const word = m[3];
    const at = m.index + m[0].length - word.length;
    findings.push({
      start: at,
      end: at + word.length,
      found: word,
      suggestion: word[0].toUpperCase() + word.slice(1),
      kind: 'style',
      label: 'sentence start',
      message: 'A new sentence starting in lower case.',
    });
  }
}

/* --- 7. The owner's own vocabulary ---------------------------------------
 * The layer no shipped dictionary can have: every word this kitchen has
 * already written down. Dish names and descriptions, the week's items, recipe
 * names, summaries, notes, ingredient lines and method steps, and the allergen
 * dictionary he maintains by hand.
 *
 * Used in both directions.
 *
 *   Known:   "gochujang" is in the dish library, so it is a word here even
 *            though every phone underlines it.
 *   Unknown: "gochjang" is nowhere, and is one keystroke from a word written
 *            eleven times, so it is offered as a correction.
 *
 * The bar for offering is deliberately high, because the failure it avoids is
 * worse than a miss: a chef writing "burrata" for the first time and being
 * told he meant "burrito" learns to ignore the whole panel, allergen chips
 * included. So the neighbour must be a word he has used at least twice, there
 * must be exactly one such neighbour, and the typed word must be five letters
 * or more — shorter words have too many neighbours to choose between.
 */
let vocabCache = null;

/**
 * Two lists, not one, and the difference is the whole reliability of the
 * near-miss check.
 *
 *   `known` is everything: names, descriptions, method steps, notes. Its only
 *   job is to answer "has this kitchen written this word?", so that an unusual
 *   but correct word is never questioned.
 *
 *   `terms` is the distinctive half — the words in dish and recipe NAMES, in
 *   ingredient lines, and in the allergen dictionary. Only these are ever
 *   offered as a correction.
 *
 * Splitting them is what stops "shaved Parmesan" being read as a typo for
 * "shared". "shared" is ordinary English that turns up in a description
 * somewhere, so as a candidate it is noise; as a known word it is fine. A dish
 * name is where the words worth correcting live.
 */
function vocabulary() {
  if (vocabCache) return vocabCache;
  const known = new Map();
  const terms = new Map();
  const add = (into, s, weight = 1) => {
    for (const w of String(s || '').matchAll(WORD_RE)) {
      const word = flatten(w[0]).replace(/^[-']+|[-']+$/g, '');
      if (word.length < 3) continue;
      known.set(word, (known.get(word) || 0) + weight);
      if (into === terms) terms.set(word, (terms.get(word) || 0) + weight);
    }
  };
  const name = (s, w) => add(terms, s, w);
  const prose = (s, w) => add(known, s, w);

  /* Every source is optional. A fresh database has no recipes and an older one
     may not have run a migration yet; a missing table must cost a shorter word
     list, not a 500 on the field the owner is typing into. */
  const rows = (sql) => { try { return db.prepare(sql).all(); } catch (e) { return []; } };

  for (const r of rows('SELECT name, description, used_count FROM saved_dishes')) {
    name(r.name, 1 + Math.min(Number(r.used_count) || 0, 4));
    prose(r.description, 1);
  }
  for (const r of rows('SELECT name, description FROM week_items')) { name(r.name, 2); prose(r.description, 1); }
  for (const r of rows('SELECT name, description FROM standing_items')) { name(r.name, 2); prose(r.description, 1); }
  for (const r of rows('SELECT name, summary, notes FROM recipes')) {
    name(r.name, 2); prose(r.summary, 1); prose(r.notes, 1);
  }
  for (const r of rows('SELECT item, prep FROM recipe_ingredients')) { name(r.item, 2); prose(r.prep, 1); }
  for (const r of rows('SELECT text FROM recipe_steps')) prose(r.text, 1);
  for (const r of rows('SELECT term FROM allergen_terms')) name(r.term, 3);

  vocabCache = { known, terms };
  return vocabCache;
}

/** Dropped whenever a write lands on anything the list is built from. */
function forgetVocabulary() { vocabCache = null; }

/**
 * Words ordinary enough that a near miss against the kitchen's vocabulary
 * would be a false alarm. Short on purpose: this is not a dictionary, it is a
 * guard rail in front of one, and its only job is to stop "pear" being read as
 * a typo for "peas".
 */
const COMMON = new Set(`
about above across after again against all almost alone along already also
although always among another anyone anything are around away back because
been before begin behind being below beside best better between beyond both
bring but buy call came cannot come could day days deep does done down during
each early eat eight either else end enough even ever every everyone
everything few find first five for four free from front full get give goes
going gone good got great had half hand has have her here hers him his hold
home hour house how however include inside instead into its itself just keep
kept know known last late later least leave left less let life light like
little live long look lot love low made make makes making many may maybe mean
might mine more morning most much must near need never new next nice night
nine none nor not nothing now number off often old once one only open order
other our out over own part people perhaps place please plus put quite rather
ready real really right room run said same saw say says second see seem seen
send set seven several should show side simple since single six size small
some someone something soon still stop such sure take taken than that the
their them then there these they thing think third this those though three
through time today together too took top toward turn twelve two under until
upon use used using usually very want was way week well were what when where
whether which while who whole why will with within without word work would
year yes yet you young your
amount available bake baked baking bit boil bowl box bread break brown butter
cook cooked cooking cool cover cream cup cut dinner dish dishes drain dry edge
egg eggs extra family favourite feed finish fire fish flour fold food fresh
fry gently glass gluten green grill heat high hours ice inch ingredients juice
kitchen knife large layer leaf lemon lid lightly line liquid list local lunch
main meal meat medium menu milk minute minutes mix mixture month mushroom nut
nuts oil onion oven pan pepper piece pieces pinch plate pot potato pour
prepare pull recipe reduce rest rice rich roast salad salt sauce season
seasoning serve served serves serving simmer slice sliced slow smooth soft
soup sour spice spices spoon stand stir stock stove sugar sweet table taste
tender thick thin tomato tray vegetables warm wash water weeks whisk white
wine winter wooden
`.trim().split(/\s+/));

/**
 * Every stem this word could be an inflection of.
 *
 * Without this the near-miss layer reads "crusty" as a typo for "crust" and
 * "roasted" as a typo for "toasted": both are ordinary English, neither is in
 * COMMON, and both sit one letter from a word the kitchen writes constantly.
 * Two wrong chips on a correct sentence, which is exactly the failure the bar
 * above is set to avoid.
 *
 * The same trick allergens.js plays with formsOf(), pointing the other way.
 * Over-generous on purpose — a stem that is not really a word costs a missed
 * suggestion, and a missed suggestion costs nothing.
 */
function stemsOf(w) {
  const out = [];
  const drop = (n) => w.slice(0, w.length - n);
  if (w.length > 4 && w.endsWith('ies')) out.push(`${drop(3)}y`);
  if (w.length > 4 && w.endsWith('ied')) out.push(`${drop(3)}y`);
  if (w.length > 4 && w.endsWith('es')) out.push(drop(2), drop(1));
  if (w.length > 3 && w.endsWith('s')) out.push(drop(1));
  if (w.length > 4 && w.endsWith('ed')) out.push(drop(2), drop(1));
  if (w.length > 5 && w.endsWith('ing')) out.push(drop(3), `${drop(3)}e`);
  if (w.length > 4 && (w.endsWith('y') || w.endsWith('r'))) out.push(drop(1), `${drop(1)}e`);
  if (w.length > 5 && w.endsWith('ly')) out.push(drop(2));
  if (w.length > 5 && w.endsWith('er')) out.push(drop(2), drop(1));
  if (w.length > 6 && w.endsWith('est')) out.push(drop(3), drop(2));
  /* A doubled consonant before the ending: shredded -> shred, simmering ->
     simmer. */
  const dbl = /^(.*?([b-df-hj-np-tv-z]))\2(?:ed|ing|er|y)$/.exec(w);
  if (dbl) out.push(dbl[1]);
  return out;
}

/** In COMMON, in the kitchen's vocabulary, or an inflection of something in either. */
function knownWord(word) {
  const { known } = vocabulary();
  if (COMMON.has(word) || known.has(word)) return true;
  return stemsOf(word).some((s) => s.length >= 3 && (COMMON.has(s) || known.has(s)));
}

/**
 * Has this kitchen settled on the plain spelling?
 *
 * The same question knownWord() asks, pointed at the accent list, and COMMON
 * is deliberately not consulted: this is about what HE writes, not about what
 * is English. "creme" is in eight recipe names, so creme is how this kitchen
 * spells it and the chip has nothing to offer; a kitchen that had only ever
 * written "crème" would still get the chip, which is the case the list is for.
 *
 * An accented word never reaches the vocabulary as one word — WORD_RE stops at
 * the mark and "crème" is stored as "cr" and "me" — so a hit here really does
 * mean he typed it plain, not that he typed it at all.
 *
 * Stems as well as the word itself, because he writes "puree" in the dish
 * library and "purees" in a method step, and the habit is the same habit.
 */
function plainByHabit(word) {
  const { known } = vocabulary();
  if (known.has(word)) return true;
  return stemsOf(word).some((st) => st.length >= 3 && known.has(st));
}

/** True when the two words are one insertion, deletion, substitution or swap apart. */
function oneEditApart(a, b) {
  if (a === b) return false;
  const la = a.length; const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;

  if (la === lb) {
    let diff = -1;
    for (let i = 0; i < la; i++) {
      if (a[i] === b[i]) continue;
      if (diff >= 0) {
        /* Two neighbouring letters swapped is one slip of two fingers, and it
           is the commonest typo there is: "chikcen". */
        return diff === i - 1 && a[diff] === b[i] && a[i] === b[diff]
          && a.slice(i + 1) === b.slice(i + 1);
      }
      diff = i;
    }
    return diff >= 0;
  }

  const short = la < lb ? a : b;
  const long = la < lb ? b : a;
  let i = 0; let j = 0; let slack = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i++; j++; continue; }
    if (++slack > 1) return false;
    j++;
  }
  return true;
}

function nearestKnown(word) {
  let hit = null;
  for (const [candidate, count] of vocabulary().terms) {
    if (count < 3 || candidate.length < 5) continue;
    if (!oneEditApart(word, candidate)) continue;
    /* The same word, in the other number or tense, is not a correction of
       itself. "crumbs" is in the allergen dictionary three times over, and
       "crumb" is one letter from it and in no list of its own — so a correct
       singular was being offered its own plural, on every field it appeared
       in. "onion" and "onions", "biscuit" and "biscuits" all sat one keystroke
       apart the same way.
       knownWord() already runs the typed word through stemsOf() before we get
       here; this is the other direction, which nothing was checking. */
    if (sameWord(word, candidate)) continue;
    if (hit) return null;          // two plausible words is a guess, not a fix
    hit = candidate;
  }
  return hit;
}

/** One is an inflection of the other, so there is nothing between them to fix. */
function sameWord(a, b) {
  return stemsOf(a).includes(b) || stemsOf(b).includes(a);
}

/* --- Running the whole thing ---------------------------------------------- */

/** Keeps the shape of what was typed: ALL CAPS, Capitalised, or plain. */
function matchCase(original, replacement) {
  if (original.length > 1 && original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

/**
 * Capped before any of this runs. These are regular expressions over a string
 * that arrives from the network, and the fields they serve hold a paragraph.
 */
const MAX_TEXT = 20000;

/**
 * Every problem found in `text`, as spans into that exact string.
 *
 * Sorted by position with overlaps dropped, because the panel applies a fix by
 * splicing the span: two findings over the same characters would leave the
 * second one pointing at text that has moved.
 */
function check(text, opts = {}) {
  const src = String(text == null ? '' : text).slice(0, MAX_TEXT);
  if (!src.trim()) return [];
  const useVocabulary = opts.vocabulary !== false;
  const findings = [];

  for (const m of src.matchAll(WORD_RE)) {
    const found = m[0];
    const word = flatten(found).replace(/^[-']+|[-']+$/g, '');
    if (!word) continue;

    /** One finding over `text` at `at`, which is a whole word or half of one. */
    const push = (at, text, to, kind, label, message) => findings.push({
      start: at,
      end: at + text.length,
      found: text,
      suggestion: matchCase(text, to),
      kind,
      label,
      message,
    });

    /* A hyphenated compound is looked at part by part as well as whole.
     * "Slow-braized" is one word to the matcher and none of the three lists
     * holds it, so the misspelling in the second half went straight past —
     * and menu writing here is mostly hyphens: slow-roasted, pan-fried,
     * hand-cut, beer-battered. The offset of each part is tracked so that
     * accepting the chip replaces "braized" and leaves "Slow-" alone. */
    const parts = [];
    if (word.includes('-')) {
      let at = m.index;
      for (const piece of found.split('-')) {
        if (piece) parts.push([at, piece, flatten(piece).replace(/^'+|'+$/g, '')]);
        at += piece.length + 1;
      }
    } else {
      parts.push([m.index, found, word]);
    }

    let matched = false;
    for (const [at, text, lower] of parts) {
      if (!lower) continue;
      if (Object.prototype.hasOwnProperty.call(MISSPELLINGS, lower)) {
        push(at, text, MISSPELLINGS[lower], 'spelling', 'spelling', `"${text}" looks like a typo.`);
        matched = true;
      } else if (Object.prototype.hasOwnProperty.call(ACCENTS, lower)) {
        /* Matched either way, so a word the kitchen spells plain is settled
           here and does not fall through to the near-miss layer to be
           second-guessed by a different rule. */
        if (!useVocabulary || !plainByHabit(lower)) {
          push(at, text, ACCENTS[lower], 'style', 'accent',
            `Spelled right — "${ACCENTS[lower]}" is the accented form.`);
        }
        matched = true;
      } else if (Object.prototype.hasOwnProperty.call(HOUSE_STYLE, lower)) {
        push(at, text, HOUSE_STYLE[lower], 'style', 'Canadian spelling',
          `Both are correct — "${HOUSE_STYLE[lower]}" is the Canadian one.`);
        matched = true;
      }
    }
    if (matched) continue;

    /* The near-miss check stays on whole words only. A hyphenated compound is
       two words the kitchen may never have written side by side, and guessing
       at half of one is how this layer starts being wrong. */
    if (!useVocabulary || word.length < 5) continue;
    if (word.includes("'") || word.includes('-')) continue;
    if (knownWord(word)) continue;
    const near = nearestKnown(word);
    if (near) {
      push(m.index, found, near, 'spelling', 'did you mean',
        `You have written "${near}" before, and this is one letter away.`);
    }
  }

  for (const rule of [...GRAMMAR, ...TYPOGRAPHY]) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(src))) {
      if (m[0].length === 0) { rule.re.lastIndex++; continue; }
      if (rule.skip && rule.skip(m, src)) continue;
      const suggestion = rule.fix(m);
      if (suggestion === m[0]) continue;
      findings.push({
        start: m.index,
        end: m.index + m[0].length,
        found: m[0],
        suggestion,
        kind: rule.kind,
        label: rule.label(m),
        message: rule.why(m),
      });
    }
  }

  sentenceStarts(src, findings);

  /* Sorted, then de-overlapped. Earlier wins; among findings that start in the
     same place the longer span wins, so "could of" beats anything found inside
     it. */
  findings.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const kept = [];
  let reach = 0;
  for (const f of findings) {
    if (f.start < reach) continue;
    kept.push(f);
    reach = f.end;
  }
  return kept;
}

/** The sentence the panel puts above the chips. */
function summarize(findings) {
  if (!findings.length) return '';
  const n = findings.length;
  return `${n} thing${n === 1 ? '' : 's'} to look at — nothing changes until you tap one`;
}

module.exports = {
  check,
  summarize,
  vocabulary,
  forgetVocabulary,
  oneEditApart,
  MISSPELLINGS,
  ACCENTS,
  HOUSE_STYLE,
  MAX_TEXT,
};
