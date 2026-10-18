const {test}=require('node:test');const assert=require('node:assert/strict');const {suggestTiming}=require('./followup-timing');
test('resolves an explicit customer time in Pacific time and keeps the evidence',()=>{
 const text='Please text me tomorrow at 3 pm.';const t=suggestTiming({lines:[{speaker:'customer',text}],now:new Date('2026-10-19T17:00:00Z')});
 assert.equal(t.basis,'customer_requested');assert.equal(t.scheduledAt,'2026-10-20T22:00:00.000Z');assert.equal(t.evidence,text);
});
test('relative times stay anchored to the actual call, not a later dashboard reload',()=>{
 const lines=[{speaker:'customer',text:'Message me in 2 hours.'}];const t=suggestTiming({lines,callDate:'2026-10-19T17:00:00Z',now:new Date('2026-10-19T18:00:00Z')});assert.equal(t.scheduledAt,'2026-10-19T19:00:00.000Z');
});
test('vague timing is a labelled suggestion, moves away from weekends and does not invent agreement',()=>{
 const t=suggestTiming({lines:[{speaker:'rep',text:'I will text you tomorrow at 3 pm.'},{speaker:'customer',text:'I need to think.'}],now:new Date('2026-10-17T17:00:00Z')});assert.equal(t.basis,'suggested');assert.equal(t.scheduledAt,'2026-10-19T16:00:00.000Z');assert.equal(t.evidence,null);
});
test('Pacific daylight-saving transition is handled for explicit wall time',()=>{
 const t=suggestTiming({lines:[{speaker:'customer',text:'Please message me tomorrow at 3 pm.'}],now:new Date('2026-10-31T17:00:00Z')});assert.equal(t.scheduledAt,'2026-11-01T23:00:00.000Z');
});
test('unresolved or past customer timing requires a choice rather than an invented agreement',()=>{
 for(const text of ['Please text me tomorrow afternoon.','Please text me tomorrow at 3 pm Eastern.']){const t=suggestTiming({lines:[{speaker:'customer',text}],now:new Date('2026-10-19T17:00:00Z')});assert.equal(t.scheduledAt,'');assert.match(t.reason,/Confirm/);}
});
test('recognizes spoken durations and weekday appointments',()=>{
 const now=new Date('2026-10-19T17:00:00Z');
 assert.equal(suggestTiming({lines:[{speaker:'customer',text:'Message me in two hours.'}],now}).scheduledAt,'2026-10-19T19:00:00.000Z');
 assert.equal(suggestTiming({lines:[{speaker:'customer',text:'Text me Tuesday at 3 pm.'}],now}).scheduledAt,'2026-10-20T22:00:00.000Z');
});

test('after three days stays anchored to the call',()=>{const now=new Date('2026-10-19T17:00:00Z');assert.equal(suggestTiming({now,lines:[{speaker:'customer',text:'Please follow up after three days.'}]}).scheduledAt,'2026-10-22T17:00:00.000Z');});
