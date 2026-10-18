const normalized=s=>String(s||'').replace(/[’]/g,"'").trim();
const STOP=/\b(?:do not|don't|stop) (?:call|contact|calling|text|texting)|remove me|take me off|不要再联系|别再打/iu;
const BLOCK=/\b(?:not ready|not sure|just browsing|only looking|not today|not now|still deciding|need more time|undecided|maybe|might|unless|if|not going to|don't want|do not want|can't|cannot|not buying|not interested|before (?:i|we)|need to (?:ask|check|think)|only if|if you|but (?:first|i|the|my))\b|还没决定|先考虑|不买|如果/iu;
const BUY=/\b(?:i(?:'ll| will) take (?:it|that|this|the)|i(?:'m| am) ready to (?:buy|order|purchase)|i(?:'d| would) like to (?:buy|order|purchase)|i want to (?:buy|order|purchase)|let'?s (?:do it|go ahead|proceed)|sign me up|go ahead (?:with|and order)|place (?:my|the) order)\b|我要买|就买这个|可以下单|帮我订/iu;
const DECLINE=/\b(?:not interested|no thanks|no thank you|don't want (?:it|to buy)|do not want (?:it|to buy)|not buying|decided not to buy)\b|不买了|不感兴趣/iu;
function assessIntent(lines=[],report={}){
 const customer=lines.map((l,i)=>({...l,id:i,text:normalized(l.text)})).filter(l=>l.speaker==='customer');
 if(!customer.length)return {readiness:null,confidence:'Low',kind:'unknown',evidence:[],reason:'No labelled customer evidence.'};
 const stopped=customer.findLast(l=>STOP.test(l.text));
 if(stopped)return {readiness:1,confidence:'High',kind:'opt_out',evidence:[{turn_id:stopped.id,quote:stopped.text}],reason:'Explicit request to stop contact; suppress outreach.'};
 let lastSignal;
 for(const c of customer){
  if(DECLINE.test(c.text))lastSignal={kind:'declined',line:c};
  else if(BUY.test(c.text)&&!BLOCK.test(c.text)&&!/^my (?:wife|friend|partner).*said/i.test(c.text))lastSignal={kind:'ready',line:c};
  else if(BLOCK.test(c.text))lastSignal={kind:'conditional',line:c};
 }
 if(lastSignal){const {kind,line}=lastSignal;return {kind,readiness:kind==='ready'?9:kind==='declined'?1:5,confidence:kind==='conditional'?'Medium':'High',evidence:[{turn_id:line.id,quote:line.text}],reason:kind==='ready'?'One explicit purchase commitment is stronger evidence than multiple neutral remarks.':kind==='declined'?'Latest explicit customer decision is not to proceed.':'A condition or unresolved decision remains; do not count it as a commitment.'};}
 const stage=report.purchase_stage?.label;
 return {kind:stage==='Ready to buy'?'ready':stage==='Comparing'?'comparing':'exploring',readiness:({'Ready to buy':8,Comparing:6,Exploring:3,'Not considering':1})[stage]??4,confidence:report.purchase_stage?.evidence?.length?'Medium':'Low',evidence:report.purchase_stage?.evidence||[],reason:'Stage-based estimate; no explicit recent purchase commitment was detected.'};
}
function fastCard({text='',history=[],speaker,partial},cards){
 if(speaker!=='customer'||partial)return null;
 const q=normalized(text);if(STOP.test(q)){const card=cards.find(c=>c.stop);return card?{speaker:'customer',card:card.id,agree:card.agree,points:card.points,ask:''}:null;}
 const intent=assessIntent([{speaker:'customer',text:q}]);
 const previous=[...history].reverse().find(h=>/^Rep:/i.test(h))||'';
 const acknowledgement=/^(?:yes[,!. ]*|okay[,!. ]*|great[,!. ]*)?(?:that (?:sounds|works|looks) good|sounds good|that works for me|agreed|perfect|yes please|see you (?:then|tomorrow))[.! ]*$/i.test(q);
 const agreedStep=acknowledgement && /\b(?:send|email|text|call you|follow up|appointment|meet|quote|review|check availability)\b/i.test(previous);
 if(intent.kind!=='ready'&&!agreedStep)return null;
 if(!cards.some(c=>c.id==='closing'))return null;
 return {speaker:'customer',card:'closing',agree:intent.kind==='ready'?"Great, let's move forward with the phone you've chosen.":'Perfect, we have a clear next step.',points:intent.kind==='ready'?["I’ll verify the exact configuration, current price and availability before any purchase.","Thank you for choosing to review your phone with T-Mobile."]:["I’ll prepare the details we discussed for your review.","Thank you for your time. We’ll continue with that next step."],ask:''};
}
module.exports={assessIntent,fastCard};
