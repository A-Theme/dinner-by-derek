'use strict';
/**
 * The base set: the preparations a kitchen builds everything else on.
 *
 * WHERE THIS COMES FROM, because it matters legally and the answer belongs in
 * the file rather than in someone's memory of a conversation. Every record
 * here is the common inheritance of the trade -- a roux is equal weights of
 * fat and flour, a mirepoix is two parts onion to one each of carrot and
 * celery, a vinaigrette is three to one. Ratios and classical structure are
 * facts about cooking and belong to nobody. They are written here in our own
 * words, from that common knowledge.
 *
 * Nothing in this file is transcribed, paraphrased or "reformatted" from a
 * published cookbook or textbook. Owning a cookbook licenses you to cook from
 * it forever; it does not license copying it into a database and serving it.
 * If a later release wants more recipes they get written the same way, or they
 * come from a public-domain source named in `source`. Do not paste.
 *
 * Quantities are metric first, because that is the working unit in a Canadian
 * kitchen. Yields are the classical batch scaled to something a single-oven
 * kitchen can actually hold -- the point of a base recipe is that it scales.
 *
 * Shape of a record:
 *   slug        stable key; re-seeding matches on this, so never renumber one
 *   category    preparation | component | dish
 *   yield       [qty, unit]
 *   parent      slug of the base this is a variation of
 *   ingredients [{ qty, unit, item, prep, optional, sub }]  sub = slug
 *   steps       string, or { text, minutes }
 */

module.exports = [
  /* --- Aromatic bases ---------------------------------------------------- */
  {
    slug: 'mirepoix',
    name: 'Mirepoix',
    category: 'preparation',
    summary: 'The standard aromatic base: two parts onion to one each of carrot and celery, by weight.',
    yield: [1000, 'g'],
    ingredients: [
      { qty: 500, unit: 'g', item: 'onion', prep: 'peeled, cut to size' },
      { qty: 250, unit: 'g', item: 'carrot', prep: 'peeled, cut to size' },
      { qty: 250, unit: 'g', item: 'celery', prep: 'cut to size' },
    ],
    steps: [
      'Cut all three to a size that suits the cooking time: large pieces for a long stock, smaller for a braise, fine dice for a sauce that will not be strained.',
      'Hold refrigerated and use within two days. Cut mirepoix oxidises, and a stock made from grey vegetables is a grey stock.',
    ],
    notes: 'White mirepoix swaps the carrot for leek and parsnip, and is used wherever colour would show: a fish fumet, a white stock, a veloute.',
  },
  {
    slug: 'bouquet-garni',
    name: 'Bouquet Garni',
    category: 'preparation',
    summary: 'Fresh herbs tied in a leek leaf so they can be lifted out whole.',
    yield: [1, 'ea'],
    ingredients: [
      { qty: 1, unit: '', item: 'leek', prep: 'green part, split and washed' },
      { qty: 2, unit: 'sprigs', item: 'thyme' },
      { qty: 1, unit: '', item: 'bay leaf' },
      { qty: 6, unit: 'stems', item: 'parsley', prep: 'stems only' },
    ],
    steps: [
      'Lay the herbs inside the split leek leaf and tie into a bundle with butcher twine.',
      'Leave one end of the twine long and tie it to the pot handle. A bundle you can pull out without hunting for it is a bundle that actually comes out on time.',
    ],
  },
  {
    slug: 'sachet-depices',
    name: 'Sachet d Epices',
    category: 'preparation',
    summary: 'Dry aromatics tied in cheesecloth, for anything that would otherwise have to be strained out.',
    yield: [1, 'ea'],
    ingredients: [
      { qty: 1, unit: '', item: 'bay leaf' },
      { qty: 0.5, unit: 'tsp', item: 'black peppercorns', prep: 'cracked' },
      { qty: 2, unit: 'sprigs', item: 'thyme' },
      { qty: 6, unit: 'stems', item: 'parsley', prep: 'stems only' },
      { qty: 1, unit: '', item: 'garlic clove', prep: 'crushed', optional: 1 },
    ],
    steps: [
      'Pile the aromatics on a square of cheesecloth, gather the corners and tie.',
      'Add it late rather than early. Anything aromatic simmered for six hours gave up what it had in the first one and spends the rest giving back bitterness.',
    ],
  },

  /* --- Stocks ------------------------------------------------------------ */
  {
    slug: 'white-chicken-stock',
    name: 'White Chicken Stock',
    category: 'preparation',
    summary: 'Unroasted bones started in cold water: the neutral base most sauces and soups are built on.',
    yield: [4000, 'ml'],
    ingredients: [
      { qty: 4, unit: 'kg', item: 'chicken bones', prep: 'rinsed, cut to fit' },
      { qty: 5, unit: 'L', item: 'cold water' },
      { qty: 500, unit: 'g', item: 'mirepoix', sub: 'mirepoix', prep: 'large cut' },
      { qty: 1, unit: '', item: 'sachet d epices', sub: 'sachet-depices' },
    ],
    steps: [
      { text: 'Cover the bones with cold water and bring slowly to a bare simmer. Cold is not fussiness: proteins that would seize into scum at a boil instead rise slowly and can be skimmed off.', minutes: 45 },
      { text: 'Skim as it comes up, and keep skimming. Never let it boil. A boiled stock emulsifies its own fat and goes cloudy, and nothing done later will clear it again.' },
      { text: 'Simmer, adding the mirepoix for the last hour and the sachet for the last half hour.', minutes: 240 },
      { text: 'Strain through a fine chinois without pressing the solids. Cool quickly in an ice bath to below 4 C, then refrigerate.', minutes: 60 },
    ],
    notes: 'Chicken bones give what they have in about four hours. Veal wants eight, fish twenty minutes. Only the time changes.',
  },
  {
    slug: 'brown-veal-stock',
    name: 'Brown Veal Stock',
    category: 'preparation',
    summary: 'Roasted bones and caramelised aromatics: the base for espagnole and everything downstream of it.',
    yield: [4000, 'ml'],
    ingredients: [
      { qty: 5, unit: 'kg', item: 'veal bones', prep: 'cut into 8 cm pieces' },
      { qty: 6, unit: 'L', item: 'cold water' },
      { qty: 750, unit: 'g', item: 'mirepoix', sub: 'mirepoix', prep: 'large cut' },
      { qty: 150, unit: 'g', item: 'tomato paste' },
      { qty: 1, unit: '', item: 'sachet d epices', sub: 'sachet-depices' },
    ],
    steps: [
      { text: 'Roast the bones at 220 C until deeply browned, turning once. Brown, not black: burnt bones make a bitter stock and no amount of reduction sweetens it.', minutes: 60 },
      { text: 'Add the mirepoix to the roasting pan and roast until it takes colour. Smear the tomato paste over the bones and roast a few minutes more to cook out its rawness.', minutes: 25 },
      { text: 'Transfer to the stockpot. Deglaze the roasting pan with water, scraping up everything stuck to it, and pour that in. That fond is most of the flavour you just made.' },
      { text: 'Cover with cold water, bring to a bare simmer, skim, and hold there. Add the sachet for the last hour.', minutes: 480 },
      { text: 'Strain, cool quickly, refrigerate. Lift the set fat off the top the next day.' },
    ],
  },
  {
    slug: 'fish-fumet',
    name: 'Fish Fumet',
    category: 'preparation',
    summary: 'Lean white fish bones sweated with white mirepoix and wine, simmered briefly.',
    yield: [2000, 'ml'],
    ingredients: [
      { qty: 2, unit: 'kg', item: 'lean white fish bones', prep: 'gills removed, well rinsed' },
      { qty: 500, unit: 'g', item: 'white mirepoix', prep: 'sliced thin' },
      { qty: 60, unit: 'g', item: 'butter' },
      { qty: 250, unit: 'ml', item: 'dry white wine' },
      { qty: 2, unit: 'L', item: 'cold water' },
      { qty: 1, unit: '', item: 'sachet d epices', sub: 'sachet-depices' },
    ],
    steps: [
      { text: 'Sweat the vegetables in the butter without colour, add the bones, and sweat until they turn opaque.', minutes: 10 },
      { text: 'Add the wine and reduce by half.', minutes: 5 },
      { text: 'Add cold water to cover and the sachet. Simmer gently and skim.', minutes: 20 },
      { text: 'Strain at once. Fish bones give up everything in twenty minutes and then start giving up glue and bitterness. This is the one stock where longer is plainly worse.' },
    ],
    notes: 'Oily fish make a fumet that tastes of the fish rather than of the dish. Use lean white bones.',
  },
  {
    slug: 'vegetable-stock',
    name: 'Vegetable Stock',
    category: 'preparation',
    summary: 'A clean, quick stock with no bones, and the default whenever a dish has to be vegetarian.',
    yield: [3000, 'ml'],
    ingredients: [
      { qty: 1, unit: 'kg', item: 'mirepoix', sub: 'mirepoix', prep: 'sliced thin' },
      { qty: 200, unit: 'g', item: 'leek', prep: 'split and washed' },
      { qty: 100, unit: 'g', item: 'mushroom trim', optional: 1 },
      { qty: 3.5, unit: 'L', item: 'cold water' },
      { qty: 1, unit: '', item: 'sachet d epices', sub: 'sachet-depices' },
    ],
    steps: [
      { text: 'Sweat the vegetables in a little oil without colour, to draw out their sweetness rather than brown it.', minutes: 10 },
      { text: 'Add cold water and the sachet, simmer gently, then strain.', minutes: 45 },
      { text: 'Keep the cabbage family and beets out of it. Brassicas turn sulphurous over a long simmer and beets turn the whole batch pink.' },
    ],
  },
  {
    slug: 'court-bouillon',
    name: 'Court Bouillon',
    category: 'preparation',
    summary: 'An acidulated aromatic liquid for poaching fish and shellfish, made to be used the same day.',
    yield: [2000, 'ml'],
    ingredients: [
      { qty: 2, unit: 'L', item: 'water' },
      { qty: 250, unit: 'ml', item: 'dry white wine' },
      { qty: 60, unit: 'ml', item: 'white wine vinegar' },
      { qty: 400, unit: 'g', item: 'mirepoix', sub: 'mirepoix', prep: 'sliced' },
      { qty: 1, unit: '', item: 'lemon', prep: 'sliced' },
      { qty: 20, unit: 'g', item: 'salt' },
      { qty: 1, unit: '', item: 'sachet d epices', sub: 'sachet-depices' },
    ],
    steps: [
      { text: 'Simmer everything together, then leave it off the heat to infuse.', minutes: 40 },
      { text: 'Strain and use for poaching. The acid firms the surface of the fish and keeps it white.' },
    ],
  },

  /* --- Roux -------------------------------------------------------------- */
  {
    slug: 'white-roux',
    name: 'White Roux',
    category: 'preparation',
    summary: 'Equal weights of butter and flour, cooked just long enough to lose the raw taste.',
    yield: [200, 'g'],
    ingredients: [
      { qty: 100, unit: 'g', item: 'butter', prep: 'clarified' },
      { qty: 100, unit: 'g', item: 'all-purpose flour' },
    ],
    steps: [
      { text: 'Melt the butter, stir in the flour, and cook over low heat until it looks like wet sand and smells faintly of biscuit. It should take no colour at all.', minutes: 5 },
      { text: 'Thickening rule of thumb, per litre of liquid: 60 g roux for a thin sauce, 120 g for a medium coating sauce, 180 g for a thick one.' },
    ],
    notes: 'Equal weights, not equal volumes. Flour and butter have very different densities and a cup-for-cup roux is a broken sauce.',
  },
  {
    slug: 'blond-roux',
    name: 'Blond Roux',
    category: 'preparation',
    parent: 'white-roux',
    summary: 'Cooked a few minutes further, to the colour of straw. The base of a veloute.',
    yield: [200, 'g'],
    ingredients: [
      { qty: 100, unit: 'g', item: 'butter', prep: 'clarified' },
      { qty: 100, unit: 'g', item: 'all-purpose flour' },
    ],
    steps: [
      { text: 'Make as for a white roux, then keep cooking gently until it turns pale gold and smells nutty.', minutes: 8 },
    ],
  },
  {
    slug: 'brown-roux',
    name: 'Brown Roux',
    category: 'preparation',
    parent: 'white-roux',
    summary: 'Cooked to a deep nut brown. More flavour, and noticeably less thickening power.',
    yield: [200, 'g'],
    ingredients: [
      { qty: 100, unit: 'g', item: 'clarified butter or rendered fat' },
      { qty: 100, unit: 'g', item: 'all-purpose flour' },
    ],
    steps: [
      { text: 'Cook slowly, stirring, until it reaches the colour of a hazelnut shell. Low and slow: a scorched roux is bitter and has to be thrown out.', minutes: 20 },
      { text: 'Allow roughly a third more than you would use of a white roux. Browning breaks down some of the starch, so the same weight thickens less.' },
    ],
  },

  /* --- Mother sauces ----------------------------------------------------- */
  {
    slug: 'bechamel',
    name: 'Bechamel',
    category: 'preparation',
    summary: 'Milk thickened with a white roux. The base for mornay and most gratins.',
    yield: [1000, 'ml'],
    ingredients: [
      { qty: 1, unit: 'L', item: 'whole milk' },
      { qty: 120, unit: 'g', item: 'white roux', sub: 'white-roux' },
      { qty: 0.5, unit: '', item: 'onion', prep: 'studded with a bay leaf and two cloves', optional: 1 },
      { qty: 1, unit: 'pinch', item: 'nutmeg', prep: 'freshly grated' },
      { qty: 1, unit: 'to taste', item: 'salt' },
    ],
    steps: [
      { text: 'Scald the milk with the studded onion if using, then take it off the heat to infuse.', minutes: 15 },
      { text: 'Whisk the hot milk into the roux a little at a time. One of the two must be hot and the other warm at most; equal temperatures are what make lumps.' },
      { text: 'Simmer gently, stirring, until it coats a spoon and the starch has cooked out. Season with salt and nutmeg, and strain.', minutes: 20 },
      { text: 'If it is holding, press cling film onto the surface or float a little melted butter on top so it does not skin.' },
    ],
  },
  {
    slug: 'veloute',
    name: 'Veloute',
    category: 'preparation',
    summary: 'A white stock thickened with a blond roux. Named for the texture, which is the whole point of it.',
    yield: [1000, 'ml'],
    ingredients: [
      { qty: 1, unit: 'L', item: 'white chicken stock', sub: 'white-chicken-stock' },
      { qty: 120, unit: 'g', item: 'blond roux', sub: 'blond-roux' },
      { qty: 1, unit: 'to taste', item: 'salt' },
    ],
    steps: [
      { text: 'Whisk the hot stock into the roux gradually.' },
      { text: 'Simmer gently and skim. A veloute wants a slow simmer and time rather than a hard boil, and it will throw scum for the first ten minutes.', minutes: 30 },
      { text: 'Strain through a fine chinois and season.' },
    ],
    notes: 'Fish veloute is the same sauce made with fumet, veal veloute the same with white veal stock. The method does not change.',
  },
  {
    slug: 'espagnole',
    name: 'Espagnole',
    category: 'preparation',
    summary: 'Brown stock, brown roux and tomato. Rarely served as it is; it exists to become demi-glace.',
    yield: [1000, 'ml'],
    ingredients: [
      { qty: 1.5, unit: 'L', item: 'brown veal stock', sub: 'brown-veal-stock' },
      { qty: 120, unit: 'g', item: 'brown roux', sub: 'brown-roux' },
      { qty: 300, unit: 'g', item: 'mirepoix', sub: 'mirepoix', prep: 'medium dice' },
      { qty: 100, unit: 'g', item: 'tomato paste' },
      { qty: 1, unit: '', item: 'sachet d epices', sub: 'sachet-depices' },
    ],
    steps: [
      { text: 'Brown the mirepoix in a little fat, add the tomato paste and cook it out until it darkens.', minutes: 15 },
      { text: 'Whisk the hot stock into the brown roux, add the vegetables and the sachet, and simmer gently, skimming often.', minutes: 90 },
      { text: 'Strain through a fine chinois. Expect to lose roughly a third of the volume to reduction and skimming.' },
    ],
  },
  {
    slug: 'tomato-sauce',
    name: 'Tomato Sauce',
    category: 'preparation',
    summary: 'The mother sauce version: tomato cooked down with aromatics until it thickens on its own.',
    yield: [1500, 'ml'],
    ingredients: [
      { qty: 2, unit: 'kg', item: 'tomatoes', prep: 'peeled, seeded, chopped, or good tinned' },
      { qty: 300, unit: 'g', item: 'mirepoix', sub: 'mirepoix', prep: 'fine dice' },
      { qty: 60, unit: 'ml', item: 'olive oil' },
      { qty: 3, unit: '', item: 'garlic cloves', prep: 'sliced' },
      { qty: 500, unit: 'ml', item: 'white chicken stock', sub: 'white-chicken-stock', optional: 1 },
      { qty: 1, unit: '', item: 'bouquet garni', sub: 'bouquet-garni' },
      { qty: 1, unit: 'to taste', item: 'salt' },
    ],
    steps: [
      { text: 'Sweat the mirepoix and garlic in the oil without colour.', minutes: 10 },
      { text: 'Add the tomatoes, stock and bouquet garni. Simmer, uncovered, until it thickens to a sauce.', minutes: 60 },
      { text: 'Pull the bouquet, then pass through a food mill or leave it rustic. Season at the end: it concentrates as it cooks and salting early overshoots.' },
      { text: 'If it tastes sharp, a small knob of butter stirred in at the end rounds it off better than sugar does.' },
    ],
  },
  {
    slug: 'hollandaise',
    name: 'Hollandaise',
    category: 'preparation',
    summary: 'A warm emulsion of egg yolk and butter, held together by the yolk and by your attention.',
    yield: [350, 'ml'],
    ingredients: [
      { qty: 3, unit: '', item: 'egg yolks' },
      { qty: 30, unit: 'ml', item: 'white wine vinegar reduction or water' },
      { qty: 250, unit: 'g', item: 'butter', prep: 'clarified, warm' },
      { qty: 1, unit: 'to taste', item: 'lemon juice' },
      { qty: 1, unit: 'to taste', item: 'salt' },
      { qty: 1, unit: 'pinch', item: 'cayenne' },
    ],
    steps: [
      { text: 'Whisk the yolks with the reduction over a bain-marie until they ribbon and roughly triple in volume. Off the heat every few seconds if the bowl runs hot: scrambled yolks do not come back.', minutes: 6 },
      { text: 'Off the heat, whisk in the warm clarified butter in a thin stream until the sauce is thick and glossy.' },
      { text: 'Season with lemon, salt and cayenne, and thin with a few drops of warm water if it is too tight.' },
      { text: 'Hold no lower than 30 C and no higher than 65 C, and no longer than about ninety minutes. That window is a food safety limit, not a texture preference.' },
    ],
    notes: 'If it breaks, whisk a fresh yolk with a spoonful of water in a clean bowl and beat the broken sauce into it a little at a time.',
  },

  /* --- Small sauces, by parent ------------------------------------------- */
  {
    slug: 'mornay',
    name: 'Mornay',
    category: 'preparation',
    parent: 'bechamel',
    summary: 'Bechamel finished with cheese. The gratin sauce.',
    yield: [1000, 'ml'],
    ingredients: [
      { qty: 1, unit: 'L', item: 'bechamel', sub: 'bechamel', prep: 'hot' },
      { qty: 100, unit: 'g', item: 'gruyere', prep: 'grated' },
      { qty: 50, unit: 'g', item: 'parmesan', prep: 'grated' },
      { qty: 2, unit: '', item: 'egg yolks', optional: 1 },
    ],
    steps: [
      { text: 'Stir the cheese into the hot bechamel off the heat until it melts. Off the heat matters: boiled cheese sauce goes stringy and weeps fat.' },
      { text: 'For a sauce that will be glazed under a salamander, temper in the yolks at the end.' },
    ],
  },
  {
    slug: 'supreme',
    name: 'Sauce Supreme',
    category: 'preparation',
    parent: 'veloute',
    summary: 'Chicken veloute enriched with cream and finished with butter.',
    yield: [1000, 'ml'],
    ingredients: [
      { qty: 1, unit: 'L', item: 'veloute', sub: 'veloute' },
      { qty: 250, unit: 'ml', item: 'heavy cream' },
      { qty: 60, unit: 'g', item: 'butter', prep: 'cold, cubed' },
      { qty: 1, unit: 'to taste', item: 'lemon juice' },
    ],
    steps: [
      { text: 'Reduce the veloute with the cream until it coats a spoon.', minutes: 15 },
      { text: 'Off the heat, swirl in the cold butter a few cubes at a time, then sharpen with lemon.' },
    ],
  },
  {
    slug: 'demi-glace',
    name: 'Demi-Glace',
    category: 'preparation',
    parent: 'espagnole',
    summary: 'Equal parts espagnole and brown stock, reduced by half. The base of most brown sauces.',
    yield: [1000, 'ml'],
    ingredients: [
      { qty: 1, unit: 'L', item: 'espagnole', sub: 'espagnole' },
      { qty: 1, unit: 'L', item: 'brown veal stock', sub: 'brown-veal-stock' },
    ],
    steps: [
      { text: 'Combine and reduce by half, skimming steadily. Skimming is most of the work and all of the difference between a glossy sauce and a greasy one.', minutes: 60 },
      { text: 'Strain through a fine chinois. It should coat a spoon and set to a soft jelly when cold.' },
    ],
  },
  {
    slug: 'bordelaise',
    name: 'Bordelaise',
    category: 'preparation',
    parent: 'demi-glace',
    summary: 'Demi-glace with a red wine and shallot reduction.',
    yield: [750, 'ml'],
    ingredients: [
      { qty: 500, unit: 'ml', item: 'dry red wine' },
      { qty: 100, unit: 'g', item: 'shallot', prep: 'minced' },
      { qty: 2, unit: 'sprigs', item: 'thyme' },
      { qty: 750, unit: 'ml', item: 'demi-glace', sub: 'demi-glace' },
      { qty: 60, unit: 'g', item: 'butter', prep: 'cold, cubed' },
    ],
    steps: [
      { text: 'Reduce the wine with the shallot and thyme until nearly dry.', minutes: 20 },
      { text: 'Add the demi-glace and simmer to bring it together.', minutes: 15 },
      { text: 'Strain, then finish off the heat with cold butter.' },
    ],
  },
  {
    slug: 'chasseur',
    name: 'Chasseur',
    category: 'preparation',
    parent: 'demi-glace',
    summary: 'Mushrooms, shallot, white wine and tomato in a demi-glace base.',
    yield: [750, 'ml'],
    ingredients: [
      { qty: 250, unit: 'g', item: 'button mushrooms', prep: 'sliced' },
      { qty: 60, unit: 'g', item: 'shallot', prep: 'minced' },
      { qty: 30, unit: 'g', item: 'butter' },
      { qty: 250, unit: 'ml', item: 'dry white wine' },
      { qty: 200, unit: 'g', item: 'tomato', prep: 'peeled, seeded, diced' },
      { qty: 600, unit: 'ml', item: 'demi-glace', sub: 'demi-glace' },
      { qty: 2, unit: 'tbsp', item: 'tarragon and parsley', prep: 'chopped' },
    ],
    steps: [
      { text: 'Saute the mushrooms in the butter until they colour, add the shallot and sweat.', minutes: 10 },
      { text: 'Deglaze with the wine and reduce by two thirds. Add the tomato and demi-glace and simmer.', minutes: 15 },
      { text: 'Finish with the chopped herbs off the heat, so they stay green.' },
    ],
  },
  {
    slug: 'bearnaise',
    name: 'Bearnaise',
    category: 'preparation',
    parent: 'hollandaise',
    summary: 'Hollandaise built on a tarragon and shallot reduction instead of plain acid.',
    yield: [350, 'ml'],
    ingredients: [
      { qty: 100, unit: 'ml', item: 'white wine vinegar' },
      { qty: 100, unit: 'ml', item: 'dry white wine' },
      { qty: 50, unit: 'g', item: 'shallot', prep: 'minced' },
      { qty: 2, unit: 'tbsp', item: 'tarragon stems', prep: 'chopped' },
      { qty: 3, unit: '', item: 'egg yolks' },
      { qty: 250, unit: 'g', item: 'butter', prep: 'clarified, warm' },
      { qty: 2, unit: 'tbsp', item: 'tarragon leaves', prep: 'chopped' },
    ],
    steps: [
      { text: 'Reduce the vinegar, wine, shallot and tarragon stems until about two tablespoons remain. Strain.', minutes: 15 },
      { text: 'Build as for hollandaise, using the reduction in place of the acid.' },
      { text: 'Fold the tarragon leaves in at the end.' },
    ],
  },

  /* --- Cold emulsions and dressings -------------------------------------- */
  {
    slug: 'mayonnaise',
    name: 'Mayonnaise',
    category: 'preparation',
    summary: 'A cold emulsion of yolk and oil. One yolk will carry about 250 ml of oil.',
    yield: [300, 'ml'],
    ingredients: [
      { qty: 1, unit: '', item: 'egg yolk', prep: 'room temperature' },
      { qty: 1, unit: 'tsp', item: 'dijon mustard' },
      { qty: 1, unit: 'tbsp', item: 'white wine vinegar or lemon juice' },
      { qty: 250, unit: 'ml', item: 'neutral oil' },
      { qty: 1, unit: 'to taste', item: 'salt' },
    ],
    steps: [
      { text: 'Whisk the yolk with the mustard and half the acid.' },
      { text: 'Add the oil drop by drop at first, whisking constantly, then in a thin stream once it takes. Rushing the first thirty seconds is the whole reason mayonnaise breaks.' },
      { text: 'Adjust with the remaining acid and salt. Loosen with a few drops of water if it is too stiff.' },
    ],
    notes: 'Raw yolk. For anything held or sold, use pasteurised egg.',
  },
  {
    slug: 'vinaigrette',
    name: 'Basic Vinaigrette',
    category: 'preparation',
    summary: 'Three parts oil to one part acid, held together with mustard.',
    yield: [400, 'ml'],
    ingredients: [
      { qty: 300, unit: 'ml', item: 'olive oil' },
      { qty: 100, unit: 'ml', item: 'red wine vinegar' },
      { qty: 1, unit: 'tbsp', item: 'dijon mustard' },
      { qty: 1, unit: 'tsp', item: 'shallot', prep: 'minced', optional: 1 },
      { qty: 1, unit: 'to taste', item: 'salt and pepper' },
    ],
    steps: [
      { text: 'Whisk the acid, mustard, shallot and salt together, then stream in the oil.' },
      { text: 'Three to one is the starting point, not a rule. A sharp vinegar wants four to one and a mild citrus wants two.' },
    ],
  },
  {
    slug: 'maitre-dhotel-butter',
    name: 'Maitre d Hotel Butter',
    category: 'preparation',
    summary: 'The default compound butter: parsley, lemon and salt. Rolled, chilled, sliced onto hot food.',
    yield: [250, 'g'],
    ingredients: [
      { qty: 250, unit: 'g', item: 'butter', prep: 'softened' },
      { qty: 4, unit: 'tbsp', item: 'parsley', prep: 'finely chopped' },
      { qty: 2, unit: 'tbsp', item: 'lemon juice' },
      { qty: 1, unit: 'to taste', item: 'salt and white pepper' },
    ],
    steps: [
      { text: 'Beat everything into the soft butter.' },
      { text: 'Roll into a cylinder in parchment and chill until firm. Slice into coins as needed; it freezes well for a month.' },
    ],
  },

  /* --- Doughs, batters and one brine ------------------------------------- */
  {
    slug: 'pate-brisee',
    name: 'Pate Brisee',
    category: 'preparation',
    summary: 'Short pastry on the three-two-one ratio: three parts flour, two fat, one water, by weight.',
    yield: [600, 'g'],
    ingredients: [
      { qty: 300, unit: 'g', item: 'all-purpose flour' },
      { qty: 200, unit: 'g', item: 'butter', prep: 'cold, cubed' },
      { qty: 100, unit: 'ml', item: 'ice water' },
      { qty: 1, unit: 'tsp', item: 'salt' },
    ],
    steps: [
      { text: 'Cut the cold butter into the flour and salt until the pieces are the size of peas. Visible butter is what makes it flaky, so stop early rather than late.' },
      { text: 'Add the water and bring it together with as little working as possible.' },
      { text: 'Flatten into a disc, wrap and rest in the fridge at least an hour before rolling.', minutes: 60 },
    ],
  },
  {
    slug: 'pate-a-choux',
    name: 'Pate a Choux',
    category: 'preparation',
    summary: 'A cooked paste that rises on its own steam. Gougeres, profiteroles, gnocchi parisienne.',
    yield: [700, 'g'],
    ingredients: [
      { qty: 250, unit: 'ml', item: 'water' },
      { qty: 125, unit: 'g', item: 'butter' },
      { qty: 1, unit: 'tsp', item: 'salt' },
      { qty: 150, unit: 'g', item: 'all-purpose flour' },
      { qty: 4, unit: '', item: 'eggs', prep: 'beaten' },
    ],
    steps: [
      { text: 'Bring the water, butter and salt to a full boil. Add the flour all at once and beat until it forms a ball and films the bottom of the pan.', minutes: 3 },
      { text: 'Cool for a few minutes, then beat in the eggs one at a time. Judge by texture, not count: it is ready when it falls from the spoon in a thick ribbon.' },
      { text: 'Pipe and bake hot, then drop the heat to dry the insides. Do not open the oven early.' },
    ],
  },
  {
    slug: 'crepe-batter',
    name: 'Crepe Batter',
    category: 'preparation',
    summary: 'A thin egg batter, rested so the flour hydrates and the gluten relaxes.',
    yield: [1000, 'ml'],
    ingredients: [
      { qty: 250, unit: 'g', item: 'all-purpose flour' },
      { qty: 4, unit: '', item: 'eggs' },
      { qty: 600, unit: 'ml', item: 'milk' },
      { qty: 60, unit: 'g', item: 'butter', prep: 'melted' },
      { qty: 1, unit: 'pinch', item: 'salt' },
    ],
    steps: [
      { text: 'Whisk to a smooth batter and strain out any lumps.' },
      { text: 'Rest at least an hour before cooking. Unrested batter makes rubbery crepes, and the rest is doing real work, not waiting.', minutes: 60 },
      { text: 'Cook thin in a hot buttered pan. The first one is a test and is meant to be sacrificed.' },
    ],
  },
  {
    slug: 'poultry-brine',
    name: 'Basic Poultry Brine',
    category: 'preparation',
    summary: 'A five percent salt brine for chicken and turkey.',
    yield: [4000, 'ml'],
    ingredients: [
      { qty: 4, unit: 'L', item: 'water' },
      { qty: 200, unit: 'g', item: 'salt' },
      { qty: 100, unit: 'g', item: 'sugar', optional: 1 },
      { qty: 1, unit: '', item: 'sachet d epices', sub: 'sachet-depices' },
    ],
    steps: [
      { text: 'Warm a litre of the water with the salt, sugar and aromatics until dissolved, then add the rest cold.' },
      { text: 'Chill the brine to below 4 C before the meat goes anywhere near it.' },
      { text: 'Brine bone-in pieces about an hour per 500 g, a whole bird eight to twelve hours. Over-brined poultry goes spongy and cannot be fixed.' },
      { text: 'Discard the brine after one use. It is raw poultry liquid, not stock.' },
    ],
  },
];
