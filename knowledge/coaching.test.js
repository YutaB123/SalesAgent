const test=require('node:test');
const assert=require('node:assert/strict');
const {safeCards,systemPrompt}=require('./coaching');
const original=require('../cards').CARDS;
const catalog=require('./carrier-plans.json');
test('opening guidance is available without fictional offer claims',()=>{
 const cards=safeCards(original);
 assert(cards.find(c=>c.id==='discovery').ask);
 assert(!JSON.stringify(cards).includes('$150'));
 assert.deepEqual(cards.find(c=>c.id==='hard-no'),original.find(c=>c.id==='hard-no'));
});
test('coaching receives the supplied database values rather than a fixed price sheet',()=>{
 const updated=structuredClone(catalog);
 updated.plans[0].name='Updated official plan';
 const prompt=systemPrompt(safeCards(original),updated);
 assert(prompt.includes('Updated official plan'));
 assert(!prompt.includes('Fictional demo plan'));
 assert(prompt.includes('higher as well as lower'));
});
