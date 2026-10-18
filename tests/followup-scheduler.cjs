const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
test('durable scheduled iMessages send once at the chosen time, can be cancelled, and honor opt-outs',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'scheduler-'));const previous={...process.env},original=global.fetch;
 Object.assign(process.env,{DEMO_DATABASE_PATH:path.join(tmp,'crm.sqlite'),PHOTON_AGENT_USER_ID:'test-agent',PHOTON_MESSAGE_PLATFORM:'imessage',COMMUNICATIONS_SERVICE_TOKEN:'test-only'});
 const {demoOperation:op}=require('../knowledge/demo-api');const {schedule,reschedule,cancel,sendNow,tick}=require('../knowledge/followup-scheduler');const {send}=require('../knowledge/followups-api');
 const now=new Date('2026-10-19T17:00:00Z'),due='2026-10-19T18:00:00.000Z';let sends=0;
 global.fetch=async(url,options)=>{sends++;assert.match(url,/127\.0\.0\.1:8787\/followup/);assert.equal(JSON.parse(options.body).text,'Your camera-phone comparison.');return {ok:true,json:async()=>({id:'mock-provider-'+sends})};};
 try{
  const customers=(await op('customer-list')).customers;
  for(const c of customers){c.callHistory=[{id:'test-call',date:now.toISOString(),summary:'Camera phone'}];await op('customer-save',{record:c});}
  const payload={customerId:customers[0].id,callId:'test-call',body:'Your camera-phone comparison.',scheduledAt:due,requestId:'schedule-test-request-0001'};
  const job=await schedule(payload,now);assert.equal(job.status,'scheduled');assert.equal((await schedule(payload,now)).id,job.id);
  await assert.rejects(schedule({...payload,requestId:'schedule-test-request-0002'},now),/already has/);
  await assert.rejects(send({customerId:payload.customerId,channel:'message',recipient:customers[0].contact,body:'Manual',requestId:'manual-request-00000001'}),/Cancel the scheduled/);
  const moved='2026-10-19T19:00:00.000Z';await reschedule({customerId:payload.customerId,id:job.id,scheduledAt:moved,body:'Updated comparison draft.'},now);assert.equal((await op('job-list',{customerId:payload.customerId})).jobs[0].body,'Updated comparison draft.');const staleClaim=await op('job-update',{id:job.id,expectedStatus:'scheduled',status:'sending',onlyDueAt:due});assert.equal(staleClaim.changed,false);await tick(new Date(due));assert.equal(sends,0);assert.equal((await op('job-list',{customerId:payload.customerId})).jobs[0].scheduledAt,moved);await reschedule({customerId:payload.customerId,id:job.id,scheduledAt:due,body:payload.body},now);await tick(now);assert.equal(sends,0);
  await tick(new Date(due));delete require.cache[require.resolve('../knowledge/followup-scheduler')];await require('../knowledge/followup-scheduler').tick(new Date(due));assert.equal(sends,1);
  assert.equal((await op('job-list',{customerId:payload.customerId})).jobs[0].status,'accepted');const recorded=await op('followup-history',{customerId:payload.customerId});assert.equal(recorded.messages.length,1);assert.equal(recorded.messages[0].body,payload.body);assert(recorded.messages[0].acceptedAt);await assert.rejects(reschedule({customerId:payload.customerId,id:job.id,scheduledAt:due},now),/already started or finished/);
  const p2={...payload,customerId:customers[1].id,requestId:'schedule-test-request-0003'};const j2=await schedule(p2,now);await cancel({customerId:p2.customerId,id:j2.id});await tick(new Date(due));assert.equal(sends,1);
  const p3={...payload,customerId:customers[2].id,requestId:'schedule-test-request-0004'};await schedule(p3,now);await op('customer-save',{record:{...customers[2],doNotContact:true}});await tick(new Date(due));assert.equal(sends,1);assert.equal((await op('job-list',{customerId:p3.customerId})).jobs[0].status,'failed');
  const c4={...customers[0],id:'phone-12025550199',contact:'+12025550199',callHistory:[{id:'failure-call',date:now.toISOString()}]};await op('customer-save',{record:c4});
  const failure={...payload,customerId:c4.id,callId:'failure-call',requestId:'schedule-test-request-0005'};await schedule(failure,now);let attempts=0;global.fetch=async()=>{attempts++;throw Error('network unavailable');};await tick(new Date(due));await tick(new Date(due));assert.equal(attempts,1);assert.equal((await op('job-list',{customerId:c4.id})).jobs[0].status,'unconfirmed');
  const c5={...customers[0],id:'phone-12025550198',contact:'+12025550198',callHistory:[{id:'now-call',date:now.toISOString()}]};await op('customer-save',{record:c5});
  const immediate=await schedule({...payload,customerId:c5.id,callId:'now-call',requestId:'schedule-now-request-0006'},now);let immediateSends=0;
  global.fetch=async()=>{immediateSends++;return {ok:true,json:async()=>({id:'mock-now'})};};
  const result=await sendNow({customerId:c5.id,id:immediate.id,body:'Send the edited draft now.'},now);assert.equal(result.status,'accepted');assert.equal(result.body,'Send the edited draft now.');
  await sendNow({customerId:c5.id,id:immediate.id,body:'Send the edited draft now.'},now);await tick(new Date(due));assert.equal(immediateSends,1);
 }finally{global.fetch=original;for(const k of Object.keys(process.env))if(!(k in previous))delete process.env[k];Object.assign(process.env,previous);fs.rmSync(tmp,{recursive:true,force:true});}
});
