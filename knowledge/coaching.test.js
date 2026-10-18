// Contract checks for handset-only live coaching and its T-Mobile device facts.
const test = require('node:test');
const assert = require('node:assert/strict');
const { systemPrompt } = require('../prompt');
const { CARDS } = require('../cards');
const catalogFacts = require('../catalogFacts');
const mockPhones = require('../tmobile_sales_agent_mock_data.json').phones;

const cardTypes = CARDS.map(c => ({ id: c.id, title: c.title, meaning: c.meaning, kind: c.kind }));

test('phone discovery and stop-contact cards are available without invented prices', () => {
  assert(CARDS.find(c => c.id === 'opening').ask);
  const defaults = JSON.stringify(CARDS.map(c => [c.agree, c.points, c.ask]));
  assert(!/\$\s*\d|free phone|guaranteed discount/i.test(defaults));
  assert.equal(CARDS.find(c => c.id === 'hard-no').stop, true);
});

test('the prompt coaches handset sales and rejects network-plan pitches', () => {
  const prompt = systemPrompt(cardTypes, 'CATALOG-MARKER-123 handset facts');
  assert(prompt.includes('CATALOG-MARKER-123 handset facts'));
  assert(/phones, not wireless service plans/.test(prompt));
  assert(/Never invent handset specifications/.test(prompt));
});

test('catalog facts contain the complete JSON handset mock catalog', async () => {
  const sheet = await catalogFacts.catalogSheet();
  assert(sheet.length < 12000);
  for (const phone of mockPhones) assert(sheet.includes(`${phone.brand} ${phone.model}`));
  assert(/illustrative mock data, not live T-Mobile inventory or quotes/.test(sheet));
  assert(sheet.includes('256 GB storage'));
  assert(/mock payment \$/.test(sheet));
  assert(!/AT&T|Verizon|carrier plan catalog|Essentials 2\.0/i.test(sheet));
  const status = await catalogFacts.status();
  assert.equal(status.count, mockPhones.length);
  assert.equal(status.mockData, true);
});

test('device facts steer the answer to the named handset', async () => {
  const facts = await catalogFacts.productFacts('Tell me about the Google Pixel 10a');
  assert(/Customer mentioned Google Pixel 10a/.test(facts));
  assert(!/AT&T|Verizon|wireless plan/i.test(facts));
});
