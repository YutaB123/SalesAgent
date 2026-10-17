// Tests for the live coaching instructions, the card defaults and the catalog facts the model receives.
// (These used to test knowledge/coaching.js, which the server no longer uses; the same guarantees now cover the real code.)
const test = require('node:test');
const assert = require('node:assert/strict');
const { systemPrompt } = require('../prompt');
const { CARDS } = require('../cards');
const catalogFacts = require('../catalogFacts');
const { snapshot } = require('./comparison');

const cardTypes = CARDS.map(c => ({ id: c.id, title: c.title, meaning: c.meaning, kind: c.kind }));

test('opening guidance exists and no card default makes a fictional offer claim', () => {
  assert(CARDS.find(c => c.id === 'discovery').ask);
  const defaults = JSON.stringify(CARDS.map(c => [c.agree, c.points, c.ask]));
  assert(!/\$\d|pink plus|credit of|payoff/i.test(defaults), 'card defaults must not contain prices or invented offers');
  assert(CARDS.find(c => c.id === 'hard-no').stop === true);
});

test('every customer line is guaranteed a card type to land on', () => {
  for (const id of ['discovery', 'shared', 'interested', 'unclear', 'answer']) assert(CARDS.find(c => c.id === id), `missing card type ${id}`);
  assert(/EVERY customer line gets a card/.test(systemPrompt(cardTypes, 'SHEET')));
});

test('the model is given the supplied catalog, not a fixed price sheet', () => {
  const prompt = systemPrompt(cardTypes, 'CATALOG-MARKER-123 Updated official plan');
  assert(prompt.includes('CATALOG-MARKER-123 Updated official plan'));
  assert(!/Fictional demo plan|Pink Plus|\$150/.test(prompt));
});

test('the honesty rules are present: higher prices reported as plainly as lower, no invented offers, no total-bill savings', () => {
  const prompt = systemPrompt(cardTypes, 'SHEET');
  assert(prompt.includes('HIGHER'));
  assert(/Never invent a switching credit/.test(prompt));
  assert(/Never claim total-bill savings/.test(prompt));
  assert(/VERIFIED COMPARISON/.test(prompt));
});

test('the catalog sheet is compact and carries the official sources and verification rules', async () => {
  const sheet = await catalogFacts.catalogSheet();
  assert(sheet.length < 12000, 'sheet should stay far smaller than the raw catalog');
  assert(sheet.includes('Essentials 2.0') && sheet.includes('https://www.t-mobile.com/cell-phone-plans'));
  assert(/SPECIALIZED PLANS/.test(sheet), 'specialized plans must be flagged as needing eligibility');
  assert(/ADVERTISED offer/.test(sheet), 'other carriers must be marked as advertised offers');
  assert(snapshot.plans.length >= 20);
});

test('comparison facts: no block for unrelated talk, and no price difference until the customer gave a like-for-like bill', async () => {
  assert.equal(await catalogFacts.planFacts('I need to ask my wife first.', []), '');
  const vague = await catalogFacts.planFacts('Verizon is cheaper for my two lines.', []);
  assert(/not enough to compare yet/.test(vague));
  assert(/Do NOT state any price difference/.test(vague));
});

test('comparison facts: with a complete bill the difference is computed by code and the direction is stated', async () => {
  const facts = await catalogFacts.planFacts("I'm on Verizon and I pay $90 a month for two lines, before taxes and fees, plan only.", []);
  assert(/STATUS: usable/.test(facts), facts);
  assert(/HIGHER than the customer's stated service charge/.test(facts), 'T-Mobile Essentials 2.0 is $100 for 2 lines, so it is $10 higher than $90');
});
