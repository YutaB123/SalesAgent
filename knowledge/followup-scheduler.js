const {demoOperation:operation}=require('./demo-api');
const {randomUUID}=require('node:crypto');
async function getCustomer(id){if(typeof id!=='string'||!id||id.length>150)throw Error('Customer ID is required.');const {customers}=await operation('customer-list',{customerId:id});const c=customers[0];if(!c||c.archived)throw Error('Customer is no longer available.');return c;}
async function schedule(data,now=new Date()){
 const c=await getCustomer(data.customerId);
 if(c.doNotContact)throw Error('This customer requested no further contact.');
 const call=c.callHistory?.find(x=>x.id===data.callId);if(!call)throw Error('Save the call before scheduling its follow-up.');
 if(!process.env.PHOTON_AGENT_USER_ID||process.env.PHOTON_MESSAGE_PLATFORM!=='imessage'||!process.env.COMMUNICATIONS_SERVICE_TOKEN)throw Error('Photon iMessage sending is not configured.');
 const date=new Date(data.scheduledAt);
 if(!Number.isFinite(+date)||date<=now||date-now>30*86400000)throw Error('Choose a future time within 30 days.');
 if(typeof data.body!=='string'||!data.body.trim()||data.body.length>4000)throw Error('Enter a message of 1–4000 characters.');
 if(!/^\+[1-9]\d{7,14}$/.test(c.contact))throw Error('Save a valid customer phone number first.');
 const r=await operation('job-create',{id:data.requestId&&/^[a-zA-Z0-9-]{16,80}$/.test(data.requestId)?data.requestId:randomUUID(),customerId:c.id,callId:call.id,recipient:c.contact,body:data.body.trim(),scheduledAt:date.toISOString(),createdAt:now.toISOString(),channel:'message',approvedAt:now.toISOString()});
 if(r.job.id===data.requestId&&(r.job.body!==data.body.trim()||r.job.scheduledAt!==date.toISOString()))throw Error('This request ID belongs to a different schedule.');
 if(r.conflict)throw Error('This call or customer already has a scheduled or submitted follow-up. Cancel the existing schedule before replacing it.');
 return r.job;
}
async function cancel(data){
 await getCustomer(data.customerId);
 const {jobs}=await operation('job-list',{customerId:data.customerId});const job=jobs.find(j=>j.id===data.id);
 if(!job)throw Error('Scheduled follow-up not found.');
 const r=await operation('job-update',{id:job.id,expectedStatus:'scheduled',status:'cancelled'});
 if(!r.changed&&r.job.status!=='cancelled')throw Error('Sending has started or finished; cancellation is no longer confirmed.');
 return r.job;
}
async function reschedule(data,now=new Date()){
 const c=await getCustomer(data.customerId);if(c.doNotContact)throw Error('This customer requested no further contact.');
 const {jobs}=await operation('job-list',{customerId:c.id});const job=jobs.find(j=>j.id===data.id);if(!job)throw Error('Scheduled follow-up not found.');
 const date=new Date(data.scheduledAt);if(!Number.isFinite(+date)||date<=now||date-now>30*86400000)throw Error('Choose a future time within 30 days.');
 if(data.body!==undefined&&(typeof data.body!=='string'||!data.body.trim()||data.body.length>4000))throw Error('Enter a message of 1–4000 characters.');
 const r=await operation('job-update',{id:job.id,expectedStatus:'scheduled',status:'scheduled',scheduledAt:date.toISOString(),...(data.body!==undefined?{body:data.body.trim()}:{}),updatedAt:now.toISOString()});
 if(!r.changed)throw Error('Sending has already started or finished. The schedule was not changed.');
 return r.job;
}
async function deliver(id,now){
 const claim=await operation('job-update',{id,expectedStatus:'scheduled',status:'sending',onlyDueAt:now.toISOString(),startedAt:now.toISOString()});if(!claim.changed)return claim.job;
 const job=claim.job;
 try{
  const c=await getCustomer(job.customerId);
  if(c.doNotContact||c.contact!==job.recipient)throw Error('Outreach suppressed: customer opted out or the phone number changed.');
  if(now-new Date(job.scheduledAt)>24*3600000)throw Error('Schedule missed by more than 24 hours. Review the timing before contacting.');
  const result=await require('./followups-api').send({customerId:job.customerId,channel:'message',recipient:job.recipient,subject:'',body:job.body,requestId:job.id},job.id);
  return (await operation('job-update',{id:job.id,status:'accepted',providerId:result.providerId,finishedAt:new Date().toISOString()})).job;
 }catch(error){return (await operation('job-update',{id:job.id,status:/unconfirmed|pending/i.test(error.message)?'unconfirmed':'failed',error:error.message})).job;}
}
async function sendNow(data,now=new Date()){
 const c=await getCustomer(data.customerId);if(c.doNotContact)throw Error('This customer requested no further contact.');
 const {jobs}=await operation('job-list',{customerId:c.id});const job=jobs.find(j=>j.id===data.id);if(!job)throw Error('Scheduled follow-up not found.');
 if(job.status==='accepted')return job;
 if(job.status!=='scheduled')throw Error('Sending has started or is unconfirmed. Check provider status before resending.');
 if(typeof data.body!=='string'||!data.body.trim()||data.body.length>4000)throw Error('Enter a message of 1–4000 characters.');
 const changed=await operation('job-update',{id:job.id,expectedStatus:'scheduled',status:'scheduled',scheduledAt:now.toISOString(),body:data.body.trim(),updatedAt:now.toISOString()});
 if(!changed.changed)return changed.job;
 return deliver(job.id,now);
}
let running=false;
async function tick(now=new Date()){
 if(running)return;running=true;
 try{const {jobs}=await operation('job-due',{now:now.toISOString()});for(const job of jobs)await deliver(job.id,now);}finally{running=false;}
}
function start(){const interval=setInterval(()=>tick().catch(()=>console.error('Scheduled follow-up check failed; tasks remain in the database.')),15000);interval.unref();return interval;}
module.exports={schedule,reschedule,cancel,sendNow,tick,start};
