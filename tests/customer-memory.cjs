const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const compiled=process.env.COMPILED_UI_TEST_DIR||'/tmp/salesagent-memory-tests';
const {criticalInformation,suggestFollowUp,requestedNoContact,importantPhrases}=require(path.join(compiled,'utils/customerSignals.js'));
const turn=(text,speaker='customer')=>({id:'turn',text,speaker,time:'12:00'});
test('customer evidence excludes seller claims and highlights the stated budget',()=>{
 const facts=criticalInformation([turn('My budget is $80 and I work using hotspot.'),turn('You will save $40','seller')]);
 assert.equal(facts.length,1);assert(!facts.some(f=>f.quote.includes('You will save')));assert(importantPhrases(facts[0].text).includes('$80'));
});
test('a requested callback takes priority over a suggested date; opt-outs block follow-up',()=>{
 const now=new Date(2026,9,17,12);
 assert.deepEqual(suggestFollowUp([turn('Call me tomorrow')],now).date,'2026-10-18');
 assert.equal(suggestFollowUp([turn('I need hotspot')],now).basis,'suggested');
 assert.equal(suggestFollowUp([turn("Don't call me again")],now),undefined);
 assert(requestedNoContact([turn('Please remove my number')]));
});
test('phone identity deduplicates formatting without requiring a customer name',()=>{
 const memory=new Map();global.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 global.window=new EventTarget();global.fetch=async()=>({ok:true,json:async()=>({customers:[]})});
 const {customerRepository}=require(path.join(compiled,'services/customerRepository.js'));
 const a=customerRepository.ensurePhone('(202) 555-0199'),b=customerRepository.ensurePhone('+1 202 555 0199');
 assert.equal(a.id,b.id);assert.equal(a.name,'+12025550199');
 customerRepository.appendCall(a.id,{id:'call',date:'2026-10-17',summary:'First draft',productDiscussed:'T-Mobile',concerns:[],nextSteps:[]});
 customerRepository.appendCall(a.id,{id:'call',date:'2026-10-17',summary:'Completed transcript',productDiscussed:'T-Mobile',concerns:[],nextSteps:[]});
 assert.equal(customerRepository.list().find(c=>c.id===a.id).callHistory.length,1);
 assert.equal(customerRepository.list().find(c=>c.id===a.id).callHistory[0].summary,'Completed transcript');
});
