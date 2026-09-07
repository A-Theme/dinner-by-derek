'use strict';

/**
 * The guided walkthrough.
 *
 * A numbered path through the dashboard in the order the work actually happens
 * — build the week, get it reviewed, publish it, then take the orders — rather
 * than in the order the navigation happens to list the screens.
 *
 * Each step names an element by its data-coach attribute. training.js finds
 * that element, opens any <details> it is buried in, scrolls to it and rings
 * it. A step whose target is missing still shows its text, so a walkthrough is
 * never a blank panel: the trainee reads the instruction and finds the control
 * themselves, which is the fallback the real screen gives them anyway.
 *
 * Steps are keyed by section so a trainee can drop into any screen and pick up
 * the tour from there.
 */

const SECTION_ORDER = [
  'today', 'week', 'dishes', 'recipes', 'other',
  'orders', 'payments', 'locations', 'graphics', 'settings', 'history',
];

const STEPS = {
  today: [
    {
      target: 'primary',
      title: 'Start here every day',
      body: 'This one button always shows the next thing that needs doing. Right now there is a draft week waiting to be finished, so that is what it offers.',
    },
    {
      target: 'tiles',
      title: 'The three numbers that matter',
      body: 'Orders today, orders tomorrow, and late requests. Each one is a link — tapping a count opens the list behind it, because the question after "3 orders" is always "which three".',
    },
    {
      target: 'totals',
      title: 'What the kitchen has to cook',
      body: 'Totals for the next service day, added up across every order, split by size. This is the number you shop against.',
    },
    {
      target: 'sheets',
      title: 'Paper for the kitchen',
      body: 'The kitchen sheet is the cook list. The pickup sheet is who is coming and when. Both are built to print on one page.',
    },
  ],

  week: [
    {
      target: 'paste',
      title: 'The fastest way in',
      body: 'Paste the post you wrote for Facebook and the app reads it into the week. Try it — the box is already filled with a sample post. Nothing is written until you check the preview on the next screen.',
    },
    {
      target: 'duplicate',
      title: 'Or copy last week',
      body: 'Copies the previous week forward seven days as a new draft. Every allergen review is cleared on purpose, because last week\'s tick was about last week\'s menu.',
    },
    {
      target: 'weekstart',
      title: 'Which week this is',
      body: 'Moving the start date slides the seven boxes below. Days you have already filled in are kept where they are.',
    },
    {
      target: 'days',
      title: 'One box per day',
      body: 'Open Wednesday. Type a name and a description, set the sizes and prices, and add a photo. This is where most of the week gets built.',
    },
    {
      target: 'suggestions',
      title: 'Allergen suggestions',
      body: 'As you type, the app reads the name and description and suggests allergens. It never applies one on its own — you accept (✓) or dismiss (✕) each chip yourself.',
    },
    {
      target: 'ack',
      title: 'The review tick',
      body: 'This is the most important control in the app. Nothing publishes until it is ticked, and editing the name or the description unticks it again — because a review is about the words that are there now.',
    },
    {
      target: 'usedish',
      title: 'Reuse something you cook often',
      body: 'Pick a day, pick a saved dish, and it lands there with its description, prices and tags. The review box still comes back unticked.',
    },
    {
      target: 'weekitems',
      title: 'Soup, salad and dessert',
      body: 'These sit on the week rather than on one day, and they carry the days they are available on. Meatless Monday works the same way.',
    },
    {
      target: 'daydetails',
      title: 'When a single day is different',
      body: 'Pickup times and delivery can be overridden for one day. Leave a box empty and it uses the usual window.',
    },
    {
      target: 'closed',
      title: 'Shutting the kitchen',
      body: 'Closing a week keeps it published but tells customers the kitchen is shut. Nothing is deleted — reopen it and the dishes are as you left them.',
    },
    {
      target: 'publish',
      title: 'Now try to publish',
      body: 'Press it. It will be refused, and it will name the dish that is not reviewed. That refusal is the app doing its job — go and finish that dish, then come back.',
    },
    {
      target: 'autopublish',
      title: 'Or let it go by itself',
      body: 'A finished week can publish on schedule. A scheduled publish never skips the review: if anything is outstanding at that moment nothing goes out and you get an email.',
    },
  ],

  dishes: [
    {
      target: 'kinds',
      title: 'Your repertoire',
      body: 'Everything worth cooking again, kept by name rather than by date, so the list is the length of what you cook.',
    },
    {
      target: 'sort',
      title: 'Sort it',
      body: 'Cooked most often is the useful one when you are stuck for a Wednesday.',
    },
    {
      target: 'notice',
      title: 'What a saved dish does not carry',
      body: 'Description, prices, photo and tags all come back. The allergen tick never does — read this notice, it is the reason.',
    },
    {
      target: 'remove',
      title: 'Removing one',
      body: 'Takes it off this list only. Menus that already used it are untouched.',
    },
  ],

  recipes: [
    {
      target: 'filters',
      title: 'The kitchen\'s own documents',
      body: 'Preparations, components and dishes. Customers never see any of this — it is what the cook works from.',
    },
    {
      target: 'new',
      title: 'Write one',
      body: 'Ingredients and method are plain text boxes, a line each. The parser reads what it can and keeps the rest exactly as typed.',
    },
    {
      target: 'scale',
      title: 'Scale it',
      body: 'Open a recipe and multiply it for the number you are cooking. The original is never changed.',
    },
    {
      target: 'link',
      title: 'Tie it to a dish',
      body: 'Linking a recipe to a saved dish puts a link on the Saved Dishes list, so the cook can get from the menu to the method in one tap.',
    },
  ],

  other: [
    {
      target: 'live',
      title: 'These skip the publish step',
      body: 'Standing items are on the menu week after week. Saving one changes what customers see immediately — there is no draft.',
    },
    {
      target: 'editor',
      title: 'Add one',
      body: 'Same editor as a day\'s dish, with a section and the days it is available on. Fill it in and add it.',
    },
    {
      target: 'availability',
      title: 'Every day, or some days',
      body: 'Every service day, or a set of weekdays you pick.',
    },
    {
      target: 'rowactions',
      title: 'Hide, show, duplicate',
      body: 'Hiding takes it off the menu now and keeps every order that already includes it exactly as it was. A duplicate always arrives hidden and unreviewed.',
    },
  ],

  orders: [
    {
      target: 'filters',
      title: 'Finding an order',
      body: 'By day, pickup or delivery, location, or a name or phone number. The downloads underneath use whatever you have set here.',
    },
    {
      target: 'downloads',
      title: 'Paper and spreadsheets',
      body: 'A CSV of the filtered list, and three print sheets: what to cook, who is collecting, and the delivery run in order.',
    },
    {
      target: 'late',
      title: 'A late request',
      body: 'This one came in after the cutoff. Confirming or declining it emails the customer either way — in training the email goes to the Outbox instead.',
    },
    {
      target: 'flags',
      title: 'Paid and handed over',
      body: 'Two toggles you will use every service day. Both can be undone.',
    },
    {
      target: 'allergy',
      title: 'Read the allergy notes',
      body: 'They are printed on the kitchen sheet too. This is the line that matters most on the whole screen.',
    },
  ],

  payments: [
    {
      target: 'paste',
      title: 'Money arrives as an email',
      body: 'The app never talks to a bank. You paste the notification your bank sent and it reads the amount, the sender and the reference out of it.',
    },
    {
      target: 'unmatched',
      title: 'Money with no order',
      body: 'A transfer whose reference and amount both match is settled on the spot. Anything less certain waits here for you to look at.',
    },
    {
      target: 'short',
      title: 'The one to look at twice',
      body: 'This transfer is short of the order it looks like — the customer forgot the delivery fee. The screen says so rather than quietly settling it.',
    },
    {
      target: 'awaiting',
      title: 'Who still owes',
      body: 'Orders that said e-transfer and have not paid. This is the chase list.',
    },
    {
      target: 'unlink',
      title: 'Undoing a match',
      body: 'Unlinking puts the order back exactly as it was — including whether you had marked it paid by hand.',
    },
  ],

  locations: [
    {
      target: 'locations',
      title: 'Where people collect',
      body: 'Add, rename, or stop offering a location. Stopping one takes it off checkout and leaves every order that used it alone.',
    },
    {
      target: 'window',
      title: 'The pickup window',
      body: 'One window for every service day, overridable per day in This Week. Type something that is not a time and the save is refused whole rather than corrected quietly.',
    },
    {
      target: 'delivery',
      title: 'Delivery and its fee',
      body: 'The fee, the minimum order, and the wording customers read. Changing the fee never changes an order already placed.',
    },
    {
      target: 'fsa',
      title: 'Where you deliver',
      body: 'The first three characters of a postal code. Add one and it works immediately. A zone\'s fee beats the flat fee above.',
    },
  ],

  graphics: [
    {
      target: 'social',
      title: 'Drawn from your own settings',
      body: 'Everything here is generated from the logo files and what is in Settings. Generating replaces the previous set.',
    },
    {
      target: 'sticker',
      title: 'Sizes matter',
      body: 'Label stock comes in whatever the roll is, and resampling a 1-bit image to fit is what ruins it. Set the size and the printer\'s dpi and it is drawn at that size.',
    },
  ],

  settings: [
    {
      target: 'basics',
      title: 'The basics',
      body: 'Business name, timezone, when orders close, and where new orders are emailed. A timezone the system does not know is refused and everything else still saves.',
    },
    {
      target: 'publishing',
      title: 'The publishing schedule',
      body: 'The day and time a finished week goes out by itself, and a reminder if no week has been built by then.',
    },
    {
      target: 'capacity',
      title: 'How many to cook',
      body: 'The ceiling for a day\'s featured dish, counting both sizes together. A single day can override it.',
    },
    {
      target: 'facebook',
      title: 'Connecting Facebook',
      body: 'Connect a Page and the week can be posted in one tap. Groups cannot be posted to by any app since 2024 — for those, Copy post text is the answer.',
    },
    {
      target: 'terms',
      title: 'The words behind the suggestions',
      body: 'Add a word the kitchen uses and it will suggest its allergen from then on. Suggestions are still never applied on their own.',
    },
    {
      target: 'backup',
      title: 'Backup and restore',
      body: 'Download everything, or replace everything from a file. Restore asks you to type RESTORE because it is the one button here that cannot be undone.',
    },
  ],

  history: [
    {
      target: 'history',
      title: 'What was cooked, and when',
      body: 'Every service day ever written down, grouped by the week its date falls in. Nothing here can be edited — it is a record, and a record you can change is not one.',
    },
  ],
};

/** The steps for a section, or an empty list. Payments is filtered by the caller. */
const stepsFor = (key) => STEPS[key] || [];

/** How far through the whole tour a section sits, for the "Section N of M" line. */
function position(key, enabledKeys) {
  const order = SECTION_ORDER.filter((k) => enabledKeys.includes(k));
  const i = order.indexOf(key);
  return i === -1 ? null : { index: i + 1, total: order.length, next: order[i + 1] || null };
}

module.exports = { STEPS, SECTION_ORDER, stepsFor, position };
