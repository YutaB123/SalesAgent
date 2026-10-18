const {demoOperation:operation}=require('./demo-api');
const crypto=require('node:crypto');
const inFlight=new Map();
const email=v=>typeof v==='string'&&/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(v)&&v.length<255;
function draft(c,channel,callId){
 const call=(c.callHistory||[]).find(x=>x.id===callId)||(c.callHistory||[])[0];
 if(call)c={...c,productDiscussed:call.productDiscussed||c.productDiscussed,callHistory:[call,...(c.callHistory||[]).filter(x=>x.id!==call.id)]};
 const generated=require('./follow-up').personalizedDraft(c,channel);
 return {recipient:channel==='email'?(c.email||''):c.contact,subject:generated.subject,body:generated.body,timing:require('./followup-timing').suggestTiming({lines:(call?.transcript||[]).map(t=>({...t,speaker:t.speaker==='seller'?'rep':t.speaker})),callDate:call?.date})};
}
async function customer(id){if(typeof id!=='string'||!id||id.length>150)throw Error('Customer ID is required.');const {customers}=await operation('customer-list',{customerId:id});const c=customers[0];if(!c||c.archived)throw Error('Customer is no longer available.');return c;}
async function send(data,scheduledJobId){
 const c=await customer(data.customerId);
 if(c.doNotContact)throw Error('This customer requested no further contact.');
 const {jobs}=await operation('job-list',{customerId:c.id});
 if(jobs.some(j=>j.id!==scheduledJobId&&['scheduled','sending','unconfirmed'].includes(j.status)))throw Error('Cancel the scheduled follow-up first, or check its unconfirmed sending status.');
 const {channel,recipient,subject='',body,requestId}=data;
 if(!['email','message'].includes(channel)||typeof body!=='string'||!body.trim()||body.length>4000)throw Error('Enter a message of 1–4000 characters.');
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(requestId||''))throw Error('Invalid request ID.');
 if(channel==='email'&&(!email(recipient)||typeof subject!=='string'||!subject.trim()||subject.length>200))throw Error('Enter a valid email address and subject.');
 if(channel==='message'&&recipient!==c.contact)throw Error('Messages must use the saved customer phone number.');
 if(channel==='email'&&(!process.env.RESEND_API_KEY||!process.env.FOLLOWUP_FROM_EMAIL))throw Error('Email sending is not configured. Your draft is saved; configure the email sender on the server.');
 if(channel==='message'&&!process.env.COMMUNICATIONS_SERVICE_TOKEN)throw Error('Messaging is not configured. Your draft is saved.');
 const hash=crypto.createHash('sha256').update(JSON.stringify([c.id,channel,recipient,subject,body])).digest('hex');
 const claim=await operation('followup-claim',{requestId,hash,customerId:c.id,channel,recipient,subject,body});
 if(claim.record.hash!==hash)throw Error('This request ID belongs to a different draft.');
 if(claim.record.status==='accepted')return claim.record;
 // Unknown delivery must be reconciled with the provider instead of starting another send.
 if(!claim.created)throw Error('This send is pending or unconfirmed. Check provider activity before sending again.');
 let result;
 try{
  if(channel==='email'){
   const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':requestId},body:JSON.stringify({from:process.env.FOLLOWUP_FROM_EMAIL,to:[recipient],subject,text:body}),signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw Error(`Email provider rejected the request (HTTP ${r.status}).`);
   result=await r.json();if(!result.id)throw Error('Email provider did not confirm acceptance.');
  }else{
   const port=Number(process.env.COMMUNICATIONS_PORT||8787);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid communications port.');
   const r=await fetch(`http://127.0.0.1:${port}/followup`,{method:'POST',headers:{Authorization:`Bearer ${process.env.COMMUNICATIONS_SERVICE_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({recipient,text:body,requestId}),signal:AbortSignal.timeout(25000)});
   result=await r.json();if(!r.ok)throw Error(result.error||'Message provider rejected the request.');if(!result.id)throw Error('Message provider did not confirm acceptance.');
  }
 }catch(e){await operation('followup-result',{requestId,status:'unconfirmed'});throw Error(`${e.name==='TimeoutError'?'Provider timed out.':e.message} Delivery is unconfirmed; check provider activity before resending.`);}
 await operation('followup-result',{requestId,status:'accepted',providerId:result.id,acceptedAt:new Date().toISOString()});
 const latest=await customer(c.id);await operation('customer-save',{record:{...latest,confirmedChannel:channel,followUpPending:false}});
 return {requestId,status:'accepted',providerId:result.id};
}
async function handle(req,res){
 const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/api/followups/'))return false;
 const reply=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 if(!require('./access').workspaceAccess(req)){reply(403,{error:'Workspace access required.'});return true;}
 if(req.method==='GET'&&['/api/followups/schedules','/api/followups/history'].includes(url.pathname)){
  try{const c=await customer(url.searchParams.get('customerId'));const {jobs}=await operation('job-list',{customerId:c.id});
   if(url.pathname.endsWith('/schedules'))reply(200,{jobs});
   else{const {messages}=await operation('followup-history',{customerId:c.id});const merged=new Map(jobs.map(j=>[j.id,{...j,kind:'message'}]));for(const m of messages){const old=merged.get(m.requestId);merged.set(m.requestId,{...old,...m,id:m.requestId,kind:'message'});}reply(200,{messages:[...merged.values()]});}
  }catch(e){reply(400,{error:e.message});}return true;
 }
 if(req.method!=='POST'||req.headers['x-customer-action']!=='1'){reply(403,{error:'Explicit customer action required.'});return true;}
 try{
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>20000)throw Error('Request too large.');}const data=JSON.parse(raw);
  if(url.pathname==='/api/followups/schedule'){reply(201,{job:await require('./followup-scheduler').schedule(data)});}
  else if(url.pathname==='/api/followups/send-now'){reply(202,{job:await require('./followup-scheduler').sendNow(data)});}
  else if(url.pathname==='/api/followups/reschedule'){reply(200,{job:await require('./followup-scheduler').reschedule(data)});}
  else if(url.pathname==='/api/followups/cancel'){reply(200,{job:await require('./followup-scheduler').cancel(data)});}
  else if(url.pathname==='/api/followups/draft'){if(!['email','message'].includes(data.channel))throw Error('Choose a channel.');reply(200,{draft:draft(await customer(data.customerId),data.channel,data.callId)});}
  else if(url.pathname==='/api/followups/send'){
   const key=data.requestId,fingerprint=JSON.stringify(data);let entry=inFlight.get(key);if(entry&&entry.fingerprint!==fingerprint)throw Error('This request ID belongs to a different draft.');if(!entry){entry={fingerprint,promise:send(data)};inFlight.set(key,entry);}try{reply(202,await entry.promise);}finally{inFlight.delete(key);}
  }else reply(404,{error:'Unknown follow-up route.'});
 }catch(e){reply(400,{error:e.message});}return true;
}
module.exports={handle,draft,send};
