'use strict';
/**
 * Seed for the editable allergen term dictionary.
 *
 * Allergen keys follow the Health Canada priority allergen list (the ten
 * priority allergens plus added sulphites), with gluten carried as a separate
 * tag because Health Canada regulates gluten sources — barley, oats, rye,
 * triticale, wheat — as their own declarable category alongside wheat.
 * Reference: Health Canada / CFIA, "Food allergen labelling" and "Priority
 * allergens", canada.ca and inspection.canada.ca (consulted August 2026).
 *
 * These are SUGGESTION TERMS ONLY. Nothing here ever reaches a customer
 * without the owner accepting the chip and ticking the acknowledgement.
 * The owner edits this list in Settings; it is seeded, not hardcoded.
 *
 * Terms are matched case-insensitively on word boundaries. Multi-word terms
 * are matched as phrases. Keep terms singular where the matcher's plural rule
 * (+s/+es) covers the plural.
 */

module.exports = {
  milk: [
    'milk', 'butter', 'buttermilk', 'cream', 'creamy', 'half and half', 'ghee',
    'cheese', 'parmesan', 'parmigiano', 'cheddar', 'mozzarella', 'feta',
    'ricotta', 'gouda', 'brie', 'gruyere', 'asiago', 'provolone', 'havarti',
    'yogurt', 'yoghurt', 'sour cream', 'creme fraiche', 'mascarpone',
    'custard', 'ice cream', 'whey', 'casein', 'caseinate', 'lactose',
    'condensed milk', 'evaporated milk', 'milk powder', 'bechamel',
    'alfredo', 'au gratin', 'gratin', 'queso', 'paneer', 'kefir', 'curd',
    // Closed compounds. The matcher tolerates a plural and a past participle
    // but cannot see a word fused to the next one, so "cheesecake" read as
    // nothing at all — no milk, no anything — while "cheese cake" read fine.
    'cheesecake', 'cheeseburger', 'cheesesteak', 'milkshake', 'buttercream',
    'shortbread', 'scalloped',
    // Dishes that are dairy by construction rather than by name.
    'bisque', 'gelato', 'panna cotta', 'creme brulee', 'burrata', 'halloumi',
    'tzatziki', 'waffle', 'pancake', 'crepe', 'croissant', 'brioche',
    // Read off the saved dish list: these are on the menu and raised nothing.
    // Chocolate is the big one — 23 saved dishes, 20 of which the dictionary
    // had no comment on at all.
    'chocolate', 'milk chocolate', 'cordon bleu', 'cordon swiss', 'spanakopita',
    'braciole', 'poutine', 'alfredo', 'stroganoff',
  ],
  eggs: [
    'egg', 'eggs', 'egg white', 'egg yolk', 'yolk', 'albumen', 'meringue',
    'mayonnaise', 'mayo', 'aioli', 'hollandaise', 'custard', 'frittata',
    'omelette', 'omelet', 'quiche', 'egg wash', 'lysozyme', 'ovalbumin',
    'caesar dressing', 'caesar salad', 'waffle', 'pancake', 'crepe',
    'brioche', 'challah', 'tempura', 'egg noodle', 'pavlova',
    // Bound with egg by construction, and all of them on the saved list.
    'meatloaf', 'meatball', 'meatballs', 'cake', 'cupcake',
  ],
  peanuts: [
    'peanut', 'peanuts', 'peanut butter', 'groundnut', 'goober',
    'arachis oil', 'satay', 'peanut oil',
  ],
  'tree nuts': [
    'almond', 'almonds', 'toasted almonds', 'marzipan', 'brazil nut',
    'cashew', 'cashews', 'hazelnut', 'filbert', 'macadamia', 'pecan',
    'pecans', 'pine nut', 'pignoli', 'pistachio', 'pistachios', 'walnut',
    'walnuts', 'nut', 'nuts', 'nutmeal', 'praline', 'nougat', 'gianduja',
    'pesto', 'frangipane', 'chestnut', 'almondmilk', 'cashewmilk',
    'baklava', 'hazelnut spread',
    // Fused, so the word-boundary rule cannot see the nut inside them.
    'nutloaf', 'nut loaf', 'nutbread', 'nut bread',
  ],
  'sesame seeds': [
    'sesame', 'sesame seed', 'sesame seeds', 'tahini', 'tahina', 'halva',
    'halvah', 'benne', 'gomashio', 'za\'atar', 'zaatar', 'hummus',
    'sesame oil', 'baba ganoush', 'baba ghanoush',
  ],
  fish: [
    'fish', 'anchovy', 'anchovies', 'worcestershire', 'fish sauce', 'nam pla',
    'cod', 'haddock', 'halibut', 'salmon', 'tuna', 'trout', 'bass', 'sole',
    'tilapia', 'mackerel', 'sardine', 'sardines', 'herring', 'pickerel',
    'caviar', 'roe', 'bonito', 'dashi', 'surimi', 'caesar dressing',
    'caesar salad', 'puttanesca',
    // Fused, so the word-boundary rule cannot see the fish inside them.
    'fishcake', 'fishcakes', 'fish cake', 'fish cakes',
  ],
  'crustaceans and molluscs': [
    'shrimp', 'prawn', 'prawns', 'crab', 'lobster', 'crayfish', 'crawfish',
    'langoustine', 'clam', 'clams', 'mussel', 'mussels', 'oyster', 'oysters',
    'scallop', 'scallops', 'squid', 'calamari', 'octopus', 'snail',
    'escargot', 'shellfish', 'seafood', 'oyster sauce',
    'crabcake', 'crabcakes', 'crab cake', 'crab cakes',
  ],
  soy: [
    'soy', 'soya', 'soybean', 'soy sauce', 'soya sauce', 'tamari', 'shoyu',
    'tofu', 'edamame', 'miso', 'tempeh', 'natto', 'hoisin', 'ponzu',
    'textured vegetable protein', 'tvp', 'lecithin', 'soy lecithin',
    'teriyaki',
    // Soy lecithin is the standard emulsifier in eating chocolate, and the bar
    // rarely says so on a menu.
    'chocolate', 'milk chocolate',
  ],
  'wheat and triticale': [
    'wheat', 'triticale', 'flour', 'all purpose flour', 'all-purpose flour',
    'bread', 'breadcrumb', 'breadcrumbs', 'bread crumbs', 'panko', 'breaded',
    'schnitzel', 'batter', 'pasta', 'noodle', 'noodles', 'spaghetti',
    'linguine', 'penne', 'macaroni', 'lasagna', 'lasagne', 'gnocchi',
    'couscous', 'orzo', 'roux', 'dumpling', 'dumplings', 'pastry',
    'puff pastry', 'phyllo', 'filo', 'pie crust', 'tortilla', 'pita',
    'bun', 'buns', 'roll', 'rolls', 'crouton', 'croutons', 'semolina',
    'durum', 'spelt', 'farro', 'kamut', 'bulgur', 'seitan', 'cracker',
    'crackers', 'biscuit', 'pierogi', 'perogy', 'spaetzle',
    // The pasta shapes and bakery words the list had not reached, plus the
    // closed compounds the matcher cannot split.
    'fettuccine', 'tagliatelle', 'rigatoni', 'ravioli', 'tortellini',
    'fusilli', 'farfalle', 'rotini', 'vermicelli', 'udon', 'ramen',
    'sourdough', 'flatbread', 'shortbread', 'baguette', 'ciabatta',
    'focaccia', 'naan', 'scone', 'crumpet', 'pretzel', 'wonton',
    'strudel', 'baklava', 'tempura', 'waffle', 'pancake', 'crepe',
    'croissant', 'brioche', 'challah', 'gravy',
    // Named off the saved dish list rather than guessed at: each of these is on
    // the menu and each raised nothing. Breadcrumbs bind a meatloaf and a
    // meatball, a pot pie and a turnover are pastry, a burrito is a flour
    // tortilla where a taco is corn, and a cordon bleu is breaded.
    'meatloaf', 'meatball', 'meatballs', 'cake', 'cupcake', 'pot pie',
    'turnover', 'burrito', 'cordon bleu', 'cordon swiss', 'braciole',
    'cobbler', 'crumble', 'stuffing', 'wellington', 'burger', 'cheeseburger',
    'spanakopita', 'poutine', 'alfredo', 'stroganoff',
  ],
  gluten: [
    'gluten', 'wheat', 'triticale', 'barley', 'rye', 'oat', 'oats', 'malt',
    'malt extract', 'malt vinegar', 'brewer\'s yeast', 'beer', 'ale', 'stout',
    'flour', 'bread', 'breadcrumb', 'breadcrumbs', 'panko', 'breaded',
    'schnitzel', 'batter', 'pasta', 'noodle', 'noodles', 'roux', 'seitan',
    'couscous', 'orzo', 'semolina', 'durum', 'spelt', 'farro', 'bulgur',
    'soy sauce', 'pearl barley', 'cracker', 'crackers', 'pastry',
    'oatmeal', 'oatcake', 'porridge', 'granola', 'muesli', 'lager',
    'sourdough', 'flatbread', 'shortbread', 'baguette',
    'ciabatta', 'focaccia', 'naan', 'scone', 'crumpet', 'pretzel',
    'wonton', 'strudel', 'baklava', 'tempura', 'waffle', 'pancake',
    'crepe', 'croissant', 'brioche', 'challah', 'gravy', 'fettuccine',
    'tagliatelle', 'rigatoni', 'ravioli', 'tortellini', 'fusilli',
    'farfalle', 'rotini', 'vermicelli', 'udon', 'ramen',
    'meatloaf', 'meatball', 'meatballs', 'cake', 'cupcake', 'pot pie',
    'turnover', 'burrito', 'cordon bleu', 'cordon swiss', 'braciole',
    'cobbler', 'crumble', 'stuffing', 'wellington', 'burger', 'cheeseburger',
    'spanakopita', 'poutine', 'alfredo', 'stroganoff',
  ],
  mustard: [
    'mustard', 'dijon', 'dijon mustard', 'grainy mustard', 'mustard seed',
    'mustard powder', 'yellow mustard', 'honey mustard', 'mustard greens',
    'vinaigrette',
    // Rouladen is spread with mustard before it is rolled. Mustard is a
    // priority allergen and the dish name is the only place it is ever said.
    'rouladen',
  ],
  sulphites: [
    'sulphite', 'sulphites', 'sulfite', 'sulfites', 'sulphur dioxide',
    'sulfur dioxide', 'wine', 'red wine', 'white wine', 'sherry', 'vinegar',
    'balsamic', 'balsamic vinegar', 'wine vinegar', 'dried apricot',
    'dried apricots', 'dried fruit', 'molasses', 'sodium bisulphite',
    'potassium metabisulphite', 'maraschino',
  ],
};
