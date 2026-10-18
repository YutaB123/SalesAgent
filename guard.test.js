const test = require('node:test');
const assert = require('node:assert/strict');
const { cardProblem, wordNumbers } = require('./guard');

// What the card is allowed to be grounded in: customer statements and the handset catalog.
const SOURCE = [
  'Customer: I want a phone under $600 and can spend up to $500.',
  'T-Mobile handset catalog: Google Pixel 10a full retail snapshot $499.99. Motorola moto g stylus (2026) full retail snapshot $309.99.',
  'Checked 2026-10-17. Verify the current price before quoting.',
].join(' ');
const ok = (card) => assert.equal(cardProblem({ ask: '', points: [], ...card }, SOURCE), null);
const bad = (card, pattern) => assert.match(cardProblem({ ask: '', points: [], ...card }, SOURCE) || '', pattern);

test('reads numbers written in words', () => {
  assert.deepEqual(wordNumbers('sixty five, a hundred and fifty, four hundred, two lines'), [65, 150, 400, 2]);
});

test('allows numbers from the handset catalog and what the customer said', () => {
  ok({ agree: 'The Pixel 10a is listed at $499.99 in this dated snapshot.', points: ['The moto g stylus snapshot is $309.99'] });
  ok({ agree: 'Your budget is five hundred dollars.', points: [] });
});

test('allows plain arithmetic on real handset prices', () => {
  ok({ agree: 'That is $100 less than the $600 budget you gave me.', points: [] });
});

test('rejects an invented phone price, discount or saving', () => {
  bad({ agree: 'This phone is only $79.' }, /number not from the call or product data: 79/);
  bad({ agree: 'I can take $40 off for you.' }, /40/);
  bad({ agree: 'I can knock forty dollars off.' }, /40/);
  bad({ agree: 'That is $2,500 a year.' }, /2500/);
  bad({ agree: 'The phone costs $49.' }, /49/);
});

test('multiplying a budget needs an explicit quantity, not an invented annual quote',()=>{
  bad({agree:'That is $2,500 a year.'},/2500/);
  ok({agree:'Five phones at your $500 budget would total $2,500.'});
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
