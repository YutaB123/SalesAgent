const test = require('node:test');
const assert = require('node:assert/strict');
const { cardProblem, wordNumbers } = require('./guard');

// What the card is allowed to be grounded in: the customer's words, the catalog, and the computed comparison.
const SOURCE = [
  'Customer: I pay 85 a month for two lines. I owe four hundred on my phone. Verizon is 90 a line.',
  'Essentials 2.0: 1 line $65, 2 lines $100, 3 lines $120. Experience More 2.0: 1 line $90, 2 lines $150.',
  'Verified comparison: the T-Mobile standard price is $10 per month HIGHER. Verified 2026-10-17 (0 days ago).',
].join(' ');
const ok = (card) => assert.equal(cardProblem({ ask: '', points: [], ...card }, SOURCE), null);
const bad = (card, pattern) => assert.match(cardProblem({ ask: '', points: [], ...card }, SOURCE) || '', pattern);

test('reads numbers written in words', () => {
  assert.deepEqual(wordNumbers('sixty five, a hundred and fifty, four hundred, two lines'), [65, 150, 400, 2]);
});

test('allows numbers from the catalog and from what the customer said', () => {
  ok({ agree: 'Essentials 2.0 is $100 for 2 lines.', points: ['Experience More 2.0 is $150 for 2 lines'] });
  ok({ agree: 'Eighty-five for two lines, got it.', points: ['You owe four hundred on the phone'] });
});

test('allows plain arithmetic on real numbers (a sum, a difference, a per-line multiple)', () => {
  ok({ agree: 'That is $5 less than your $90.', points: [] });          // 90 - 85
  ok({ agree: 'Three lines is $195 at $65 a line.', points: [] });      // 65 * 3
});

test('rejects an invented price, discount or saving', () => {
  bad({ agree: 'Essentials is only $79 a line.' }, /number not from the call or plan data: 79/);
  bad({ agree: 'I can take $40 off for you.' }, /40/);
  bad({ agree: 'I can knock forty dollars off.' }, /40/);
  bad({ agree: 'That is $2,500 a year.' }, /2500/);
  bad({ agree: 'Their plan is $49 a line.' }, /49/);
});

test('rejects promises nobody authorised', () => {
  bad({ agree: 'The price is guaranteed to stay low.' }, /promise/);
  bad({ agree: 'We are the cheapest.' }, /promise/);
  bad({ agree: 'You will save a lot.' }, /promise/);
  bad({ points: ['It only takes a minute.'] }, /promise/);
});

test('small counts such as lines, months and years never need a source', () => {
  ok({ agree: 'Three lines for 12 months.', points: ['2 lines', '5 years'] });
});
