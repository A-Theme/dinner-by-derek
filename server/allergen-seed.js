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
  ],
  eggs: [
    'egg', 'eggs', 'egg white', 'egg yolk', 'yolk', 'albumen', 'meringue',
    'mayonnaise', 'mayo', 'aioli', 'hollandaise', 'custard', 'frittata',
    'omelette', 'omelet', 'quiche', 'egg wash', 'lysozyme', 'ovalbumin',
    'caesar dressing',
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
    'pesto', 'frangipane', 'chestnut',
  ],
  'sesame seeds': [
    'sesame', 'sesame seed', 'sesame seeds', 'tahini', 'tahina', 'halva',
    'halvah', 'benne', 'gomashio', 'za\'atar', 'zaatar', 'hummus',
    'sesame oil',
  ],
  fish: [
    'fish', 'anchovy', 'anchovies', 'worcestershire', 'fish sauce', 'nam pla',
    'cod', 'haddock', 'halibut', 'salmon', 'tuna', 'trout', 'bass', 'sole',
    'tilapia', 'mackerel', 'sardine', 'sardines', 'herring', 'pickerel',
    'caviar', 'roe', 'bonito', 'dashi', 'surimi', 'caesar dressing',
  ],
  'crustaceans and molluscs': [
    'shrimp', 'prawn', 'prawns', 'crab', 'lobster', 'crayfish', 'crawfish',
    'langoustine', 'clam', 'clams', 'mussel', 'mussels', 'oyster', 'oysters',
    'scallop', 'scallops', 'squid', 'calamari', 'octopus', 'snail',
    'escargot', 'shellfish', 'seafood', 'oyster sauce',
  ],
  soy: [
    'soy', 'soya', 'soybean', 'soy sauce', 'soya sauce', 'tamari', 'shoyu',
    'tofu', 'edamame', 'miso', 'tempeh', 'natto', 'hoisin', 'ponzu',
    'textured vegetable protein', 'tvp', 'lecithin', 'soy lecithin',
    'teriyaki',
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
  ],
  gluten: [
    'gluten', 'wheat', 'triticale', 'barley', 'rye', 'oat', 'oats', 'malt',
    'malt extract', 'malt vinegar', 'brewer\'s yeast', 'beer', 'ale', 'stout',
    'flour', 'bread', 'breadcrumb', 'breadcrumbs', 'panko', 'breaded',
    'schnitzel', 'batter', 'pasta', 'noodle', 'noodles', 'roux', 'seitan',
    'couscous', 'orzo', 'semolina', 'durum', 'spelt', 'farro', 'bulgur',
    'soy sauce', 'pearl barley', 'cracker', 'crackers', 'pastry',
  ],
  mustard: [
    'mustard', 'dijon', 'dijon mustard', 'grainy mustard', 'mustard seed',
    'mustard powder', 'yellow mustard', 'honey mustard', 'mustard greens',
    'vinaigrette',
  ],
  sulphites: [
    'sulphite', 'sulphites', 'sulfite', 'sulfites', 'sulphur dioxide',
    'sulfur dioxide', 'wine', 'red wine', 'white wine', 'sherry', 'vinegar',
    'balsamic', 'balsamic vinegar', 'wine vinegar', 'dried apricot',
    'dried apricots', 'dried fruit', 'molasses', 'sodium bisulphite',
    'potassium metabisulphite', 'maraschino',
  ],
};
