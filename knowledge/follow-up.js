const phones=require('../tmobile_sales_agent_mock_data.json').phones;
const clean=(value,max=500)=>String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
function handset(value){const text=clean(value).toLowerCase();return phones.map(p=>`${p.brand} ${p.model}`).sort((a,b)=>b.length-a.length).find(name=>text.includes(name.toLowerCase()))||null;}
function readableName(name,contact){const value=clean(name,80);return !value||value===contact||/^\+?[\d\s().-]+$/.test(value)||/^call\s+\d|^unnamed|^unknown/i.test(value)?'there':value;}
function personalizedDraft(customer={},channel='email',extras={}){
 if(customer.doNotContact)return {subject:'',body:'',personalizationEvidence:[],suppressed:true};
 const latest=customer.callHistory?.[0];
 const priorities=[...new Set([...(extras.customerPriorities||[]),...(customer.criticalInformation||[]).map(x=>x.quote||x.text),customer.needs].map(x=>clean(x,300)).filter(Boolean))].slice(0,2);
 const concern=clean(extras.concern||customer.concerns||latest?.concerns?.join('; '),350);
 const discussed=handset(customer.productDiscussed)||handset(customer.recommendedPlan)||handset(latest?.productDiscussed)||handset(latest?.summary);
 const proposed=discussed||handset(extras.recommendedPlan);
 const tasks=(extras.tasks||customer.followUpTasks||[]).filter(t=>!t.completed).map(t=>clean(t.title||t.action||t,400)).filter(Boolean);
 const fromHistory=(latest?.nextSteps||[]).map(x=>clean(x,400)).filter(Boolean);
 const next=tasks[0]||fromHistory[0];
 const agreedTime=clean(extras.agreedTime||(customer.followUpRecommendation?.basis==='agreed'?customer.followUpRecommendation.date:''),100);
 const action=extras.action?.type;
 const lines=[`Hi ${readableName(customer.name,customer.contact)},`];
 if(priorities.length)lines.push(`You highlighted ${priorities.map(p=>`“${p}”`).join(' and ')}.`);
 else if(latest?.summary&&!/analysis pending|no previous|no call summary/i.test(latest.summary))lines.push(`Following up on our discussion: ${clean(latest.summary,300)}`);
 if(proposed)lines.push(discussed?`The phone we discussed is ${proposed}.`:`One phone to review against those priorities is ${proposed}.`);
 if(concern)lines.push(`The point to resolve before you decide: ${concern}`);
 if(next)lines.push(`Next step: ${next.replace(/^remind (?:a human )?(?:seller|salesperson) to\s*/i,'')}`);
 else if(action==='offer_lower_cost_option')lines.push('I can compare a lower-priced handset against the features you said matter, then confirm the current quote.');
 else if(action==='prepare_plan_comparison')lines.push('I can prepare a side-by-side phone comparison focused on your priorities and the outstanding question above.');
 else if(proposed)lines.push(`I can check the ${proposed} configuration, current price and availability before you proceed.`);
 else lines.push('I can narrow the phone options around these priorities and confirm the details before you decide.');
 if(agreedTime)lines.push(`Requested follow-up: ${agreedTime}. I’ll use that timing for our next conversation.`);
 else if(next)lines.push('You can reply here with any change to that next step.');
 else lines.push('Reply with the detail you would like me to confirm first.');
 return {subject:proposed?`${proposed}: ${concern?'addressing your questions':'your next step'}`:'Your phone preferences and next step',body:lines.join(channel==='email'?'\n\n':' '),personalizationEvidence:[...priorities,...(concern?[concern]:[]),...(next?[next]:[]),...(agreedTime?[agreedTime]:[])]};
}
function createFollowUp({customerName,action,customerPriorities=[],recommendedPlan=null,contactPreference=null,contactPermissionConfirmed=false,customer={},concern='',tasks=[],agreedTime=''}){
 const channel=['sms','message'].includes(contactPreference)?'message':'email';
 const generated=personalizedDraft({...customer,name:customerName||customer.name},channel,{action,customerPriorities,recommendedPlan,concern,tasks,agreedTime});
 return {channel,channelReason:['sms','message'].includes(contactPreference)?'Using the recorded message preference.':'Email draft; confirm the channel before contacting.',subject:channel==='email'?generated.subject:null,message:generated.body,personalizationEvidence:generated.personalizationEvidence,contactPermissionConfirmed:contactPermissionConfirmed===true,requiresSellerApproval:true,sendStatus:'draft'};
}
module.exports={createFollowUp,personalizedDraft};
