const {calculateDealRisk}=require('./deal-risk');
const {createFollowUp}=require('./follow-up');
const {assessIntent}=require('./sales-signals');
const {estimateRecovery}=require('./recovery-estimate');
const phones=require('../tmobile_sales_agent_mock_data.json').phones;
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
function buildDealRecovery({report,lines=[],needs={},customer={}}){
 const intent=assessIntent(lines,report);
 const customers=lines.map((l,i)=>({...l,id:i})).filter(l=>l.speaker==='customer');
 const latestCommit=intent.kind==='ready'?intent.evidence[0]?.turn_id:-1;
 const evidenceValid=e=>Number.isInteger(e.turn_id)&&lines[e.turn_id]?.speaker==='customer'&&lines[e.turn_id].text.includes(e.quote);
 // An old objection is not automatically an unresolved blocker after an unqualified commitment.
 const open=(report.concerns||[]).filter(c=>(c.evidence||[]).some(e=>evidenceValid(e)&&e.turn_id>=latestCommit));
 const snippets=(rx)=>customers.filter(l=>rx.test(l.text)&&l.id>=latestCommit).map(l=>({turn_id:l.id,quote:l.text}));
 const positive=intent.kind==='ready'?intent.evidence:[];
 const competitor=snippets(/\b(?:another store|other store|competitor|compare (?:with|at))\b/i);
 const hesitation=snippets(/\b(?:think about it|need (?:some )?time|not ready|talk it over|ask my|check with my)\b/i);
 const price=open.find(c=>c.category==='Price');
 const promised=(report.follow_up_actions||[]).find(a=>a.kind==='promised'&&a.evidence?.length);
 const stopped=intent.kind==='opt_out'||intent.kind==='declined'||customer.doNotContact;
 const signals={priceObjection:!!price,consideringCompetitor:!!competitor.length,needsTimeToThink:!!hesitation.length,recommendationOverBudget:false,positiveBuyingIntent:!!positive.length,agreedNextStep:!!promised};
 const risk=calculateDealRisk(signals);
 if(stopped){risk.dealRiskScore=100;risk.dealStatus='at_risk';}
 const priorities=[...new Set((report.customer_needs||[]).flatMap(n=>(n.evidence||[]).filter(evidenceValid).map(e=>e.quote)))].slice(0,3);
 const device=[...lines].reverse().flatMap(l=>phones.map(p=>`${p.brand} ${p.model}`).sort((a,b)=>b.length-a.length).filter(name=>l.text.toLowerCase().includes(name.toLowerCase())))[0]||null;
 let channel=customer.confirmedChannel||customer.recommendedChannel||'message',channelReason='A short message can keep the specific next step easy to act on after the call.';
 for(const c of customers){
  if(/\b(?:email me|send (?:me )?(?:an |the |a )?email|by email)\b/i.test(c.text)&&!/\b(?:don't|do not|no) email/i.test(c.text)){channel='email';channelReason=`Customer asked for email: “${c.text}”`;}
  if(/\b(?:text me|message me|send (?:me )?(?:a )?text|by (?:text|sms))\b/i.test(c.text)&&!/\b(?:don't|do not) (?:text|message)/i.test(c.text)){channel='message';channelReason=`Customer asked for a message: “${c.text}”`;}
 }

 const forbiddenEmail=customers.some(c=>/\b(?:don't|do not|no) email/i.test(c.text));
 const forbiddenMessage=customers.some(c=>/\b(?:don't|do not) (?:text|message)/i.test(c.text));
 if(channel==='email'&&forbiddenEmail){channel='message';channelReason='Customer declined email; confirm permission for a short message first.';}
 if(channel==='message'&&forbiddenMessage){channel='email';channelReason='Customer declined messages; confirm email address and permission first.';}
 const action=stopped?{type:'respect_no_contact',priority:'none',channel:'none',reason:'The customer declined or opted out. Do not send a recovery pitch.'}:intent.kind==='ready'?{type:'confirm_next_step',priority:'high',channel,reason:`T-Mobile next step: confirm ${device||'the chosen phone'}, its configuration, current quote and availability. Customer said “${positive[0]?.quote}”; close the conversation instead of reopening discovery.`}:price?{type:'offer_lower_cost_option',priority:'high',channel,reason:`Catch the unresolved price concern before the customer leaves: ${price.text}. Prepare a current handset quote or a lower-cost option with a clear feature trade-off; use ${channel}.`}:hesitation.length||competitor.length?{type:'send_personalized_recap',priority:'high',channel,reason:`Before the customer disengages, send a recap of ${device||'the phone options'} tied to their stated priorities and one unresolved decision. ${channelReason}`}:{type:'clarify_customer_needs',priority:'medium',channel,reason:`Keep the T-Mobile conversation actionable: recap ${priorities[0]||'the stated handset needs'}, then offer one concrete device-review step. ${channelReason}`};
 if(!stopped){action.reason+=` ${channelReason} ${promised?.time_text?`Honor the agreed timing: ${promised.time_text}.`:'Suggested seller timing: prepare the recap before the call ends and, with permission, reach out within two hours. This is a demo workflow assumption, not a customer promise.'}`;}
 const missing=[];if(!device)missing.push('Confirm which handset the customer wants to review.');
 if(!stopped)missing.push('Verify the current T-Mobile quote, configuration and availability before purchase.');
 if(channel==='email'&&!customer.email)missing.push('Confirm the recipient email address before sending.');
 const rate=Number(process.env.RECOVERY_BASELINE_RATE??0.20),uplift=Number(process.env.RECOVERY_ASSUMED_UPLIFT??0.05);
 const recoveryEstimate=estimateRecovery({eligibleOpportunities:stopped?0:100,baselineRate:rate,assumedUplift:stopped?0:uplift});
 const impact=stopped?'No recovery outreach is recommended.':`Illustrative recovery scenario: for 100 eligible opportunities, a ${(rate*100).toFixed(0)}% assumed baseline plus ${(uplift*100).toFixed(0)} percentage points from timely, relevant follow-up gives ${((rate+uplift)*100).toFixed(0)}%, or ${recoveryEstimate.expectedIncrementalCloses.toFixed(0)} additional closes. These are demo assumptions, not measured T-Mobile results.`;
 risk.scoreExplanation=`Evidence confidence: ${intent.confidence}. ${intent.reason} Buying intent ${intent.readiness??'unknown'}/10 is a heuristic, not a close probability. ${impact}`;
 const followUp=createFollowUp({customerName:customer.name,customer:{...customer,doNotContact:stopped,productDiscussed:device||customer.productDiscussed},action,customerPriorities:priorities,concern:open.map(c=>c.text).slice(0,2).join('; '),tasks:report.follow_up_actions||[],agreedTime:promised?.time_text||'',contactPreference:'message',contactPermissionConfirmed:false});
 followUp.channelReason=channelReason;
 followUp.timing=require('./followup-timing').suggestTiming({lines,callDate:customer.callDate});
 const summary=require('./concise-summary').conciseSummary(report.summary?.text);
 return {...risk,intent,signals,conversationSummary:summary,recoveryEstimate,riskSignals:[...open.map(c=>({type:c.category==='Price'?'price_objection':'open_objection',severity:'high',evidence:c.evidence.find(evidenceValid)?.quote,turn_id:c.evidence.find(evidenceValid)?.turn_id})),...positive.map(e=>({type:'positive_buying_intent',severity:'positive',evidence:e.quote,turn_id:e.turn_id}))],unresolvedObjections:open.map(c=>c.text),recommendedAction:action,missingInformation:missing,followUp};
}
module.exports={buildDealRecovery};
