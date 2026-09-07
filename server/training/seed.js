'use strict';

/**
 * The fixtures every trainee starts from.
 *
 * Invented food, invented customers, invented money. Nothing here is read from
 * the real database and nothing here is ever written back to it.
 *
 * The data is arranged to teach rather than to look full. In particular:
 *
 *   - The draft week has one dish that has NOT been reviewed for allergens, so
 *     the first attempt to publish is refused by name. That refusal is the
 *     single most important thing this app does and a trainee should meet it
 *     on purpose, in a sandbox, rather than by accident on a Saturday.
 *   - One dish description carries a deliberate misspelling, so the proofread
 *     chips have something to find the moment the box is opened.
 *   - There is one late request, one unpaid order and one order with allergy
 *     notes, because those are the three cards that need a decision.
 *   - Two e-transfers are unmatched, one of which is a few dollars short of
 *     the order it looks like — the case that has to be noticed rather than
 *     tapped through.
 *
 * Dates are computed from whatever today is, so the sandbox is never stale.
 */

const L = require('./lib');

/** Health Canada's list, with the words the kitchen actually writes. */
const ALLERGEN_TERMS = [
  ['peanut', 'peanuts'], ['peanut butter', 'peanuts'], ['satay', 'peanuts'],
  ['almond', 'tree nuts'], ['cashew', 'tree nuts'], ['walnut', 'tree nuts'],
  ['pecan', 'tree nuts'], ['pistachio', 'tree nuts'], ['hazelnut', 'tree nuts'],
  ['sesame', 'sesame seeds'], ['tahini', 'sesame seeds'],
  ['milk', 'milk'], ['butter', 'milk'], ['brown butter', 'milk'], ['cream', 'milk'],
  ['cheese', 'milk'], ['parmesan', 'milk'], ['yogurt', 'milk'], ['ghee', 'milk'],
  ['egg', 'eggs'], ['mayonnaise', 'eggs'], ['aioli', 'eggs'], ['meringue', 'eggs'],
  ['fish', 'fish'], ['salmon', 'fish'], ['haddock', 'fish'], ['anchovy', 'fish'],
  ['worcestershire', 'fish'], ['tuna', 'fish'],
  ['shrimp', 'crustaceans and molluscs'], ['prawn', 'crustaceans and molluscs'],
  ['crab', 'crustaceans and molluscs'], ['lobster', 'crustaceans and molluscs'],
  ['mussel', 'crustaceans and molluscs'], ['scallop', 'crustaceans and molluscs'],
  ['soy', 'soy'], ['soya', 'soy'], ['tofu', 'soy'], ['miso', 'soy'], ['edamame', 'soy'],
  ['wheat', 'wheat and triticale'], ['semolina', 'wheat and triticale'],
  ['mustard', 'mustard'], ['dijon', 'mustard'],
  ['wine', 'sulphites'], ['vinegar', 'sulphites'], ['dried apricot', 'sulphites'],
  ['flour', 'gluten'], ['bread', 'gluten'], ['pasta', 'gluten'], ['barley', 'gluten'],
  ['soy sauce', 'gluten'], ['panko', 'gluten'], ['couscous', 'gluten'], ['orzo', 'gluten'],
];

/* A blank item, so every editor has the same shape whether or not it is filled. */
const blankItem = () => ({
  name: '', description: '', photo: null, single_photo: null, halal: 0,
  allergens: [], dismissed: [], ack: 0, ack_of: null,
  full_on: 1, full_label: 'Full size', full_price: null, full_cap: null,
  single_on: 0, single_label: 'Meal for one', single_price: null, single_cap: null,
});

/** An item that has been properly reviewed: tags accepted, tick recorded. */
function reviewed(item) {
  const full = { ...blankItem(), ...item };
  full.ack = 1;
  full.ack_of = L.reviewedText(full);
  return full;
}

function build() {
  const today = L.today();
  const thisMonday = L.mondayOf(today);
  const nextMonday = L.addDays(thisMonday, 7);
  const d = (mon, offset) => L.addDays(mon, offset);

  /* --- Saved dishes ----------------------------------------------------- */
  const dishes = [
    ['main', 'Chicken and Leek Pie', 'Slow-cooked thigh, leeks softened in butter, all under our own pastry.', 1800, 1100, 14],
    ['main', 'Beef Bourguignon', 'Shoulder braised overnight in red wine with bacon, mushrooms and pearl onions.', 2100, 1300, 11],
    ['main', 'Butter Chicken', 'Marinated overnight, finished with cream and fenugreek. Served with basmati.', 1900, 1200, 22],
    ['main', 'Aloo Gobi', 'Potato and cauliflower, cumin and turmeric, finished with coriander.', 1600, 1000, 9],
    ['main', 'Beer-Battered Haddock', 'Hand-cut chips and mushy peas. The batter is made to order.', 2000, 1250, 7],
    ['main', 'Shepherd’s Pie', 'Lamb, rosemary, and a proper mash lid browned under the grill.', 1850, 1150, 12],
    ['main', 'Lasagne al Forno', 'Six hours of ragu, bechamel, and far too much parmesan.', 1900, 1200, 16],
    ['soup', 'Roasted Tomato and Basil', 'Tomatoes roasted until they collapse, blitzed with basil and a little cream.', 1200, 700, 18],
    ['soup', 'Carrot and Coriander', 'Sweet carrots, toasted coriander seed, a squeeze of lemon at the end.', 1200, 700, 13],
    ['soup', 'Chicken Noodle', 'Proper stock, pulled thigh meat, egg noodles.', 1300, 750, 20],
    ['salad', 'Fennel and Orange', 'Shaved fennel, orange segments, black olives, good oil.', 1100, 700, 6],
    ['salad', 'Caesar', 'Cos, our own dressing with anchovy and parmesan, sourdough croutons.', 1200, 750, 15],
    ['dessert', 'Sticky Toffee Pudding', 'Dates, dark sugar, and a jug of toffee sauce alongside.', 900, 600, 19],
    ['dessert', 'Lemon Posset', 'Three ingredients, set overnight, with an almond shortbread.', 800, 550, 8],
  ].map((row, i) => reviewed({
    id: i + 1,
    kind: row[0],
    name: row[1],
    description: row[2],
    full_price: row[3],
    single_on: 1,
    single_price: row[4],
    used_count: row[5],
    saved_at: L.addDays(today, -(i * 5 + 3)),
    allergens: L.detect(`${row[1]}\n${row[2]}`, ALLERGEN_TERMS.map((t) => ({ term: t[0], allergen: t[1] })))
      .map((x) => x.allergen),
  })).map((x) => { x.ack_of = L.reviewedText(x); return x; });

  /* --- The published week (this week) ----------------------------------- */
  const publishedDays = [
    [0, reviewed({
      dish_name: 'Butter Chicken',
      description: 'Marinated overnight, finished with cream and fenugreek. Served with basmati rice.',
      full_price: 1900, single_on: 1, single_price: 1200, full_cap: 24,
      allergens: ['milk'],
    })],
    [1, reviewed({
      dish_name: 'Lasagne al Forno',
      description: 'Six hours of ragu, bechamel, and far too much parmesan.',
      full_price: 1900, single_on: 1, single_price: 1200,
      allergens: ['milk', 'eggs', 'gluten'],
    })],
    [2, reviewed({
      dish_name: 'Beer-Battered Haddock',
      description: 'Hand-cut chips and mushy peas. The batter is made to order.',
      full_price: 2000, single_on: 1, single_price: 1250,
      allergens: ['fish', 'gluten'],
    })],
    [6, reviewed({
      dish_name: 'Shepherd’s Pie',
      description: 'Lamb, rosemary, and a proper mash lid browned under the grill.',
      full_price: 1850, single_on: 1, single_price: 1150,
      allergens: ['milk'],
    })],
  ];

  /* --- The draft week (next week) ---------------------------------------
   * Mon and Tue are done. Wed is filled in but UNREVIEWED, which is what
   * stops the first publish. Sunday is filled in with a typo in it, which is
   * what gives the proofreader something to find. */
  const draftDays = [
    [0, reviewed({
      dish_name: 'Chicken and Leek Pie',
      description: 'Slow-cooked thigh, leeks softened in butter, all under our own pastry.',
      full_price: 1800, single_on: 1, single_price: 1100,
      allergens: ['milk', 'gluten'],
    })],
    [1, reviewed({
      dish_name: 'Aloo Gobi',
      description: 'Potato and cauliflower, cumin and turmeric, finished with coriander.',
      full_price: 1600, single_on: 1, single_price: 1000,
      halal: 1,
      allergens: [],
    })],
    [2, {
      ...blankItem(),
      dish_name: 'Beef Bourguignon',
      description: 'Shoulder braised overnight in red wine with bacon, mushrooms and pearl onions.',
      full_price: 2100, single_on: 1, single_price: 1300,
      /* Left unreviewed on purpose. This is the dish the publish gate names. */
      allergens: [], dismissed: [], ack: 0, ack_of: null,
    }],
    [6, {
      ...blankItem(),
      dish_name: 'Roast Chicken Dinner',
      /* The misspelling is deliberate: it is what the proofread chips find. */
      description: 'With seasonal vegtables and a proper gravy. Yorkshire puddings availible on request.',
      full_price: 1950, single_on: 1, single_price: 1200,
      allergens: [], dismissed: [], ack: 0, ack_of: null,
    }],
  ];

  /* The acknowledgement is recorded against the text it was given for, and a
     service day keeps its name in dish_name rather than name — so it is
     computed here, off the finished row, rather than by the reviewed() helper
     above, which only ever sees `name`. Getting this wrong left every seeded
     day reading "edited after its allergen review" on a first load. */
  const dayRow = (id, weekId, mon, offset, item) => withAck({
    id,
    week_id: weekId,
    service_date: d(mon, offset),
    sort: offset,
    dish_name: item.dish_name || '',
    description: item.description || '',
    photo: item.photo || null,
    single_photo: item.single_photo || null,
    halal: item.halal || 0,
    allergens: item.allergens || [],
    dismissed: item.dismissed || [],
    ack: item.ack || 0,
    ack_of: item.ack_of || null,
    full_on: item.full_on == null ? 1 : item.full_on,
    full_label: item.full_label || 'Full size',
    full_price: item.full_price == null ? null : item.full_price,
    full_cap: item.full_cap == null ? null : item.full_cap,
    single_on: item.single_on || 0,
    single_label: item.single_label || 'Meal for one',
    single_price: item.single_price == null ? null : item.single_price,
    single_cap: item.single_cap == null ? null : item.single_cap,
    daily_cap: null,
    closed: 0,
    closed_note: '',
    pickup_start: null,
    pickup_end: null,
    delivery_on: null,
  });

  function withAck(row) {
    if (row.ack) row.ack_of = L.reviewedText(row);
    return row;
  }

  let dayId = 0;
  const serviceDays = [
    ...publishedDays.map(([offset, item]) => dayRow(++dayId, 1, thisMonday, offset, item)),
    ...draftDays.map(([offset, item]) => dayRow(++dayId, 2, nextMonday, offset, item)),
  ];

  const weeks = [
    {
      id: 1,
      slug: `week-${thisMonday}-a1f3`,
      title: L.fmtWeekRange(thisMonday),
      description: 'Comfort food while the weather turns. Everything cooked the morning of.',
      image: null,
      status: 'published',
      closed: 0,
      closed_note: '',
      week_start: thisMonday,
      auto_publish: 1,
      fb_post_id: '1122334455',
      fb_post_url: 'https://example.invalid/training/post/1122334455',
      fb_published_at: L.addDays(thisMonday, -2),
    },
    {
      id: 2,
      slug: `week-${nextMonday}-b7c2`,
      title: L.fmtWeekRange(nextMonday),
      description: '',
      image: null,
      status: 'draft',
      closed: 0,
      closed_note: '',
      week_start: nextMonday,
      auto_publish: 1,
      fb_post_id: null,
      fb_post_url: null,
      fb_published_at: null,
    },
  ];

  const weekItems = [
    {
      id: 1, week_id: 1, kind: 'soup', slot: 1,
      ...reviewed({
        name: 'Roasted Tomato and Basil',
        description: 'Tomatoes roasted until they collapse, blitzed with basil and a little cream.',
        full_price: 1200, single_on: 1, single_price: 700, allergens: ['milk'],
      }),
      weekdays: ['tue', 'wed', 'thu'],
    },
    {
      id: 2, week_id: 1, kind: 'dessert', slot: 1,
      ...reviewed({
        name: 'Sticky Toffee Pudding',
        description: 'Dates, dark sugar, and a jug of toffee sauce alongside.',
        full_price: 900, single_on: 1, single_price: 600, allergens: ['milk', 'eggs', 'gluten'],
      }),
      weekdays: ['tue', 'wed', 'thu'],
    },
    {
      id: 3, week_id: 2, kind: 'soup', slot: 1,
      ...reviewed({
        name: 'Carrot and Coriander',
        description: 'Sweet carrots, toasted coriander seed, a squeeze of lemon at the end.',
        full_price: 1200, single_on: 1, single_price: 700, allergens: [],
      }),
      weekdays: ['tue', 'wed', 'thu'],
    },
    {
      id: 4, week_id: 2, kind: 'meatless', slot: 1,
      ...reviewed({
        name: 'Aloo Gobi',
        description: 'Potato and cauliflower, cumin and turmeric, finished with coriander.',
        full_price: 1600, single_on: 1, single_price: 1000, allergens: [],
      }),
      weekdays: ['mon'],
    },
  ];

  /* --- Standing items (Other Options) ----------------------------------- */
  const standing = [
    {
      id: 1, subcategory: 'Mains', availability: 'every_service_day', weekdays: [], active: 1, sort: 1,
      ...reviewed({
        name: 'Butter Chicken',
        description: 'Our everyday one. Marinated overnight, cream and fenugreek, basmati alongside.',
        full_price: 1900, single_on: 1, single_price: 1200, allergens: ['milk'],
      }),
    },
    {
      id: 2, subcategory: 'Soups', availability: 'every_service_day', weekdays: [], active: 1, sort: 2,
      ...reviewed({
        name: 'Chicken Noodle',
        description: 'Proper stock, pulled thigh meat, egg noodles.',
        full_price: 1300, single_on: 1, single_price: 750, allergens: ['eggs'],
      }),
    },
    {
      id: 3, subcategory: 'Salads', availability: 'weekdays', weekdays: ['tue', 'thu'], active: 1, sort: 3,
      ...reviewed({
        name: 'Caesar',
        description: 'Cos, our own dressing with anchovy and parmesan, sourdough croutons.',
        full_price: 1200, single_on: 1, single_price: 750, allergens: ['milk', 'fish', 'gluten'],
      }),
    },
    {
      id: 4, subcategory: 'Desserts', availability: 'every_service_day', weekdays: [], active: 0, sort: 4,
      ...blankItem(),
      name: 'Lemon Posset',
      description: 'Three ingredients, set overnight, with an almond shortbread.',
      full_price: 800, single_on: 1, single_price: 550,
      /* Hidden AND unreviewed — the state a duplicated item lands in. */
      allergens: [], dismissed: [], ack: 0, ack_of: null,
    },
  ];

  /* --- Locations, zones, delivery areas ---------------------------------- */
  const locations = [
    { id: 1, name: 'The Kitchen Door', address: '114 Erb St W, Waterloo', notes: 'Side door, ring the bell.', active: 1, sort: 1 },
    { id: 2, name: 'Uptown Pickup', address: '8 Willis Way, Waterloo', notes: 'Parking behind the building.', active: 1, sort: 2 },
    { id: 3, name: 'Old Depot', address: '52 Bridgeport Rd, Waterloo', notes: '', active: 0, sort: 3 },
  ];

  const zones = [
    { id: 1, name: 'Near', fee: 400 },
    { id: 2, name: 'Far', fee: 900 },
  ];

  const fsas = [
    { code: 'N2L', zone_id: 1, uses: 34 },
    { code: 'N2J', zone_id: 1, uses: 21 },
    { code: 'N2K', zone_id: null, uses: 8 },
    { code: 'N2V', zone_id: 2, uses: 3 },
  ];

  /* --- Orders ------------------------------------------------------------
   * Enough shapes that every button on the card has a card to sit on. */
  const tomorrow = L.addDays(today, 1);
  const orders = [
    {
      id: 1, ref: 'DBD-4821', name: 'Priya Raman', phone: '519-555-0142',
      email: 'priya@example.invalid', service_date: today, method: 'pickup',
      status: 'confirmed', paid: 1, fulfilled: 0, payment_method: 'etransfer',
      location_id: 1, location_name: 'The Kitchen Door', pickup_window: '4–7 PM',
      subtotal: 3100, delivery_fee: 0, total: 3100,
      allergy_notes: '', placed_at: `${L.addDays(today, -2)} 18:42`,
      lines: [
        { item_name: 'Butter Chicken', variant_label: 'Full size', qty: 1, unit_price: 1900 },
        { item_name: 'Roasted Tomato and Basil', variant_label: 'Full size', qty: 1, unit_price: 1200 },
      ],
    },
    {
      id: 2, ref: 'DBD-4822', name: 'Marcus Hale', phone: '519-555-0198',
      email: 'marcus@example.invalid', service_date: today, method: 'delivery',
      status: 'confirmed', paid: 0, fulfilled: 0, payment_method: 'etransfer',
      location_id: null, location_name: '', pickup_window: '',
      addr_line: '77 Regina St N', addr_unit: 'Apt 4', postal_norm: 'N2J 3A5',
      addr_notes: 'Buzzer is broken, call on arrival.',
      subtotal: 3800, delivery_fee: 400, total: 4200,
      allergy_notes: 'Severe peanut allergy — please keep everything well away from it.',
      placed_at: `${L.addDays(today, -1)} 09:15`,
      lines: [
        { item_name: 'Butter Chicken', variant_label: 'Full size', qty: 2, unit_price: 1900 },
      ],
    },
    {
      id: 3, ref: 'DBD-4823', name: 'Jenna Okonkwo', phone: '519-555-0177',
      email: 'jenna@example.invalid', service_date: tomorrow, method: 'pickup',
      status: 'confirmed', paid: 0, fulfilled: 0, payment_method: 'cash',
      location_id: 2, location_name: 'Uptown Pickup', pickup_window: '4–7 PM',
      subtotal: 2500, delivery_fee: 0, total: 2500,
      allergy_notes: '', placed_at: `${today} 07:55`,
      lines: [
        { item_name: 'Lasagne al Forno', variant_label: 'Meal for one', qty: 1, unit_price: 1200 },
        { item_name: 'Sticky Toffee Pudding', variant_label: 'Full size', qty: 1, unit_price: 900 },
        { item_name: 'Carrot and Coriander', variant_label: 'Meal for one', qty: 1, unit_price: 700 },
      ],
    },
    {
      id: 4, ref: 'DBD-4824', name: 'Tom Beaudry', phone: '519-555-0110',
      email: 'tom@example.invalid', service_date: tomorrow, method: 'pickup',
      status: 'late_request', paid: 0, fulfilled: 0, payment_method: 'etransfer',
      location_id: 1, location_name: 'The Kitchen Door', pickup_window: '4–7 PM',
      subtotal: 1900, delivery_fee: 0, total: 1900,
      allergy_notes: '', placed_at: `${today} 23:10`,
      lines: [
        { item_name: 'Lasagne al Forno', variant_label: 'Full size', qty: 1, unit_price: 1900 },
      ],
    },
    {
      id: 5, ref: 'DBD-4819', name: 'Ana Silveira', phone: '519-555-0163',
      email: 'ana@example.invalid', service_date: L.addDays(today, -1), method: 'pickup',
      status: 'confirmed', paid: 1, fulfilled: 1, payment_method: 'etransfer',
      location_id: 1, location_name: 'The Kitchen Door', pickup_window: '4–7 PM',
      subtotal: 2600, delivery_fee: 0, total: 2600,
      allergy_notes: 'No dairy for one of the two meals if that is possible.',
      placed_at: `${L.addDays(today, -3)} 12:30`,
      lines: [
        { item_name: 'Beer-Battered Haddock', variant_label: 'Full size', qty: 1, unit_price: 2000 },
        { item_name: 'Lemon Posset', variant_label: 'Meal for one', qty: 1, unit_price: 600 },
      ],
    },
    {
      id: 6, ref: 'DBD-4825', name: 'Wes Nakamura', phone: '519-555-0121',
      email: 'wes@example.invalid', service_date: tomorrow, method: 'delivery',
      status: 'confirmed', paid: 0, fulfilled: 0, payment_method: 'etransfer',
      location_id: null, location_name: '', pickup_window: '',
      addr_line: '19 Marshall St', addr_unit: '', postal_norm: 'N2K 1L4',
      addr_notes: '', subtotal: 3050, delivery_fee: 600, total: 3650,
      allergy_notes: '', placed_at: `${today} 08:20`,
      lines: [
        { item_name: 'Beer-Battered Haddock', variant_label: 'Full size', qty: 1, unit_price: 2000 },
        { item_name: 'Chicken Noodle', variant_label: 'Meal for one', qty: 1, unit_price: 750 },
        { item_name: 'Lemon Posset', variant_label: 'Meal for one', qty: 1, unit_price: 300 },
      ],
    },
  ];

  /* --- Payments ----------------------------------------------------------
   * Two unclaimed: one that matches an order to the cent, and one that is
   * eight dollars short of the order it looks like. The second is the whole
   * reason this screen exists. */
  const payments = [
    {
      id: 1, amount: 2500, sender_name: 'JENNA OKONKWO', memo: 'DBD-4823',
      received_at: `${today}T11:04`, source: 'pasted', order_id: null,
      matched_by: null, set_paid: 0,
    },
    {
      id: 2, amount: 3050, sender_name: 'W NAKAMURA', memo: 'dinner thursday',
      received_at: `${today}T12:40`, source: 'mailbox', order_id: null,
      matched_by: null, set_paid: 0,
    },
    {
      id: 3, amount: 3100, sender_name: 'PRIYA RAMAN', memo: 'DBD-4821',
      received_at: `${L.addDays(today, -2)}T19:02`, source: 'pasted', order_id: 1,
      matched_by: 'auto', set_paid: 1,
    },
    {
      id: 4, amount: 2600, sender_name: 'A SILVEIRA', memo: '',
      received_at: `${L.addDays(today, -3)}T13:11`, source: 'pasted', order_id: 5,
      matched_by: 'owner', set_paid: 1,
    },
  ];

  /* --- Recipes ------------------------------------------------------------ */
  const recipes = [
    {
      id: 1, slug: 'chicken-stock', name: 'Chicken Stock', category: 'preparation',
      summary: 'The base for the soups and most of the braises.',
      yield_qty: 4, yield_unit: 'l', portions: null, dish_id: null, parent_id: null,
      tags: ['base', 'batch'],
      ingredients: [
        { qty: 2, unit: 'kg', text: 'chicken bones, roasted', group: '' },
        { qty: 1, unit: 'ea', text: 'onion, halved', group: '' },
        { qty: 2, unit: 'ea', text: 'carrot, rough cut', group: '' },
        { qty: 5, unit: 'l', text: 'cold water', group: '' },
      ],
      steps: [
        { text: 'Roast the bones at 220C until well coloured, about 40 minutes.' },
        { text: 'Cover with cold water, bring slowly to a bare simmer, and skim.' },
        { text: 'Four hours at a bare simmer. Strain, cool fast, refrigerate.' },
      ],
      notes: 'Never let it boil or it goes cloudy.',
    },
    {
      id: 2, slug: 'butter-chicken', name: 'Butter Chicken', category: 'dish',
      summary: 'The everyday one. Marinate the night before.',
      yield_qty: 12, yield_unit: 'portions', portions: 12, dish_id: 3, parent_id: null,
      tags: ['curry', 'popular'],
      ingredients: [
        { qty: 3, unit: 'kg', text: 'chicken thigh, boneless', group: 'Marinade' },
        { qty: 500, unit: 'g', text: 'yogurt', group: 'Marinade' },
        { qty: 200, unit: 'g', text: 'butter', group: 'Sauce' },
        { qty: 1, unit: 'l', text: 'passata', group: 'Sauce' },
        { qty: 400, unit: 'ml', text: 'cream', group: 'Sauce' },
        { qty: 1, unit: 'l', text: 'Chicken Stock', group: 'Sauce', sub_slug: 'chicken-stock' },
      ],
      steps: [
        { text: 'Marinate the thigh in the yogurt and spice overnight.' },
        { text: 'Colour the chicken hard, in batches, and set aside.' },
        { text: 'Build the sauce, return the chicken, finish with cream and fenugreek.' },
      ],
      notes: '',
    },
    {
      id: 3, slug: 'butter-chicken-mild', name: 'Butter Chicken (mild)', category: 'dish',
      summary: 'Half the chilli, for the families who ask.',
      yield_qty: 12, yield_unit: 'portions', portions: 12, dish_id: null, parent_id: 2,
      tags: ['curry'],
      ingredients: [
        { qty: null, unit: '', text: 'As the base recipe, with half the kashmiri chilli.', group: '' },
      ],
      steps: [{ text: 'Follow Butter Chicken. Taste before the cream goes in.' }],
      notes: '',
    },
    {
      id: 4, slug: 'shortcrust-pastry', name: 'Shortcrust Pastry', category: 'component',
      summary: 'For the pies. Rests overnight.',
      yield_qty: 1.2, yield_unit: 'kg', portions: null, dish_id: null, parent_id: null,
      tags: ['base', 'pastry'],
      ingredients: [
        { qty: 750, unit: 'g', text: 'plain flour', group: '' },
        { qty: 375, unit: 'g', text: 'butter, cold, cubed', group: '' },
        { qty: 2, unit: 'ea', text: 'egg yolk', group: '' },
      ],
      steps: [
        { text: 'Rub the butter into the flour until it looks like coarse sand.' },
        { text: 'Bring together with the yolks and a little cold water. Do not work it.' },
        { text: 'Rest overnight in the fridge.' },
      ],
      notes: '',
    },
  ];

  /* --- Graphics ----------------------------------------------------------
   * No files are drawn in training. Each set records whether the trainee has
   * generated it, which is all the screen needs to change its wording. */
  const graphics = {
    social: { generated_at: L.addDays(today, -12), source: 'generated' },
    card: { generated_at: null, source: 'shipped' },
    sticker: { generated_at: null, source: 'shipped', width_mm: 62, height_mm: 29, dpi: 203 },
  };

  return {
    seq: {
      week: 3, day: dayId + 1, weekItem: 5, dish: dishes.length + 1, standing: 5,
      order: 7, payment: 5, location: 4, recipe: 5, photo: 1,
    },
    settings: {
      business_name: 'Dinner by Derek',
      timezone: 'America/Toronto',
      cutoff_hour: 22, cutoff_minute: 0,
      late_cutoff_hour: 6, late_cutoff_minute: 0,
      payment_instructions: 'E-transfer to orders@example.invalid. Put your order reference in the message.',
      owner_contact: '519-555-0100',
      notify_email: 'orders@example.invalid',
      pickup_start: '16:00', pickup_end: '19:00',
      delivery_enabled: 1, delivery_fee: 600, delivery_min: 2500,
      delivery_window: 'Between 4 and 7 in the evening',
      auto_publish: 1, auto_publish_weekday: 'sat', auto_publish_time: '12:00',
      remind_missing_week: 1, remind_missing_week_days: 2,
      featured_daily_cap: 30,
      full_label: 'Full size', single_label: 'Meal for one',
    },
    weeks,
    serviceDays,
    weekItems,
    dishes,
    standing,
    orders,
    payments,
    locations,
    zones,
    fsas,
    recipes,
    allergenTerms: ALLERGEN_TERMS.map((t) => ({ term: t[0], allergen: t[1] })),
    removedTerms: [],
    graphics,
    facebook: null,          // no Page connected, so the trainee gets to connect one
    fbPending: null,
    /* Everything the sandbox "sent" instead of sending it. Shown on the Outbox
       screen, which is how a trainee sees that pressing Decline would really
       have emailed somebody. */
    outbox: [],
    /* Which walkthrough steps have been marked done. */
    progress: {},
  };
}

module.exports = { build, ALLERGEN_TERMS };
