const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const os=require('node:os');
const path=require('node:path');

test('follow-ups use customer context, persist drafts, respect no-contact, and never resend accepted requests',async()=>{
 const temp=mkdtempSync(path.join(os.tmpdir(),'followups-'));
 const previous={...process.env};const originalFetch=global.fetch;
 process.env.DEMO_DATABASE_PATH=path.join(temp,'crm.sqlite');
 const {demoOperation:operation}=require('../knowledge/demo-api');
 const {draft,send}=require('../knowledge/followups-api');
 try{
  const c=(await operation('customer-list')).customers[0];
  c.email='customer@example.test';c.needs='hotspot for travel';c.concerns='monthly cost';c.followUpPending=true;
  c.followUpTasks=[{id:'task1',title:'Review data allowance',completed:false}];
  await operation('customer-save',{record:c});
  const email=draft(c,'email');assert.match(email.body,/hotspot for travel/);assert.match(email.body,/monthly cost/);assert.match(email.body,/Review data allowance/);assert.equal(email.recipient,c.email);
  const message=draft(c,'message');assert.equal(message.recipient,c.contact);
  const edited={...email,body:'Human edited follow-up'};c.followUpDrafts={email:edited};
  await operation('customer-save',{record:c});assert.equal((await operation('customer-list',{customerId:c.id})).customers[0].followUpDrafts.email.body,edited.body);
  const payload={customerId:c.id,channel:'email',...edited,requestId:'test-email-request-0001'};
  delete process.env.RESEND_API_KEY;await assert.rejects(send(payload),/not configured/);
  process.env.RESEND_API_KEY='test-only';process.env.FOLLOWUP_FROM_EMAIL='sales@example.test';
  let sends=0;global.fetch=async(url,options)=>{sends++;assert.equal(url,'https://api.resend.com/emails');assert.equal(JSON.parse(options.body).text,edited.body);assert.equal(options.headers['Idempotency-Key'],payload.requestId);return {ok:true,json:async()=>({id:'provider-test-1'})};};
  assert.equal((await send(payload)).status,'accepted');assert.equal((await send(payload)).status,'accepted');assert.equal(sends,1);
  assert.equal((await operation('customer-list',{customerId:c.id})).customers[0].followUpPending,false);
  await assert.rejects(send({...payload,body:'different body'}),/different draft/);
  const dnc={...(await operation('customer-list',{customerId:c.id})).customers[0],doNotContact:true};await operation('customer-save',{record:dnc});await assert.rejects(send({...payload,requestId:'test-email-request-0002'}),/no further contact/);
  const c2=(await operation('customer-list')).customers.find(x=>x.id!==c.id);process.env.COMMUNICATIONS_SERVICE_TOKEN='test-only';
  const sms={customerId:c2.id,channel:'message',recipient:c2.contact,subject:'',body:'Reviewed SMS draft',requestId:'test-message-request-01'};
  global.fetch=async(url,options)=>{sends++;assert.match(url,/127\.0\.0\.1:8787\/followup/);assert.equal(JSON.parse(options.body).text,sms.body);return {ok:true,json:async()=>({id:'photon-test-1'})};};
  assert.equal((await send(sms)).status,'accepted');assert.equal((await send(sms)).status,'accepted');assert.equal(sends,2);
  global.fetch=async()=>{throw Error('network unavailable')};const unknown={...sms,requestId:'test-message-request-02'};await assert.rejects(send(unknown),/unconfirmed/);await assert.rejects(send(unknown),/pending or unconfirmed/);
 }finally{global.fetch=originalFetch;for(const k of Object.keys(process.env))if(!(k in previous))delete process.env[k];Object.assign(process.env,previous);rmSync(temp,{recursive:true,force:true});}
});
