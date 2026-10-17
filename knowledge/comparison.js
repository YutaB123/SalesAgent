const snapshot = require('./carrier-plans.json');
const money = cents => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(cents/100);
const canonicalCarrier = text => /\bat\s*(?:&|and)\s*t\b/i.test(text) ? 'AT&T' : /\bverizon\b/i.test(text) ? 'Verizon' : /\bt[ -]?mobile\b/i.test(text) ? 'T-Mobile' : null;
const numberWords={one:1,two:2,three:3,four:4,five:5};

// Only the customer speaking about their current bill establishes pricing facts.
// Rep claims, hypothetical budgets, friends' offers and advertised prices do not.
function extractFacts(text,history=[]) {
  const customerLines=history.filter(s=>typeof s==='string'&&/^Customer:/i.test(s)).map(s=>s.replace(/^Customer:\s*/i,''));
  customerLines.push(text);
  const facts={};
  for(const line of customerLines){
    if(typeof line!=='string'||/\b(?:not|no longer|used to|don't|do not|sister|brother|friend|budget|could|would|offered)\b/i.test(line))continue;
    const carrier=canonicalCarrier(line);
    if(carrier&&/\b(?:i(?:'m| am)?\s+(?:with|on|using|have)|my\s+(?:current\s+)?(?:plan|carrier|bill))\b/i.test(line))facts.carrier=carrier;
    const price=line.match(/\b(?:i\s+(?:pay|am paying)|i'm\s+paying|my\s+(?:current\s+)?(?:plan|bill)\s+(?:is|costs?))\s*\$\s*(\d+(?:\.\d{1,2})?)/i);
    if(price){
      facts.monthlyCents=Math.round(Number(price[1])*100);
      facts.amountBasis=/per\s+line/i.test(line)?'per_line':'account_total';
      // A new price statement invalidates qualifiers of an earlier quote.
      delete facts.taxBasis;delete facts.devicePaymentsExcluded;delete facts.lineCount;
      facts.evidence=line;
    }
    const lines=line.match(/\b(\d+|one|two|three|four|five)\s+(?:phone\s+)?lines?\b/i);
    if(lines&&facts.monthlyCents){facts.lineCount=numberWords[lines[1].toLowerCase()]||Number(lines[1]);}
    if(facts.monthlyCents&&/\b(?:before|excluding)\s+(?:all\s+)?taxes\s+and\s+fees\b/i.test(line))facts.taxBasis='excluded';
    if(facts.monthlyCents&&/\b(?:plan only|service only|excluding (?:device|phone) payments)\b/i.test(line))facts.devicePaymentsExcluded=true;
  }
  return facts;
}
function validateCustomer(input={}){
  if(input===null||typeof input!=='object'||Array.isArray(input))throw Error('customer must be an object');
  const out={};
  if(input.carrier!==undefined){if(!['AT&T','Verizon','T-Mobile','Other'].includes(input.carrier))throw Error('Choose a valid carrier');out.carrier=input.carrier;}
  if(input.planName!==undefined){if(typeof input.planName!=='string'||input.planName.length>100)throw Error('Invalid plan name');out.planName=input.planName;}
  if(input.lineCount!==undefined){if(!Number.isInteger(input.lineCount)||input.lineCount<1||input.lineCount>12)throw Error('lineCount must be 1–12');out.lineCount=input.lineCount;}
  if(input.monthlyCents!==undefined){if(!Number.isSafeInteger(input.monthlyCents)||input.monthlyCents<=0||input.monthlyCents>1000000)throw Error('Invalid monthly service charge');out.monthlyCents=input.monthlyCents;}
  if(input.amountBasis!==undefined){if(!['account_total','per_line'].includes(input.amountBasis))throw Error('Invalid amount basis');out.amountBasis=input.amountBasis;}
  if(input.taxBasis!==undefined){if(!['excluded','included','unknown'].includes(input.taxBasis))throw Error('Invalid tax basis');out.taxBasis=input.taxBasis;}
  if(input.devicePaymentsExcluded!==undefined){if(typeof input.devicePaymentsExcluded!=='boolean')throw Error('Invalid device payment confirmation');out.devicePaymentsExcluded=input.devicePaymentsExcluded;}
  return out;
}
function compare(catalog,{text='',history=[],customer={},targetPlanId='tmobile-essentials-2'}={},now=Date.now()){
  if(typeof text!=='string'||!Array.isArray(history))throw Error('Invalid conversation input');
  const facts={...extractFacts(text,history),...validateCustomer(customer)};
  const mentionedCarrier=canonicalCarrier(text)||facts.carrier||null;
  const target=catalog.plans.find(p=>p.id===targetPlanId&&p.carrier==='T-Mobile');
  if(!target)throw Error('Unknown T-Mobile plan');
  if(target.requiresEligibility)throw Error('This specialized plan requires verified eligibility; request an individual quote before comparing.');
  const stale=p=>!p.verifiedOn||!Number.isFinite(Date.parse(p.verifiedOn))||now-Date.parse(p.verifiedOn+'T00:00:00Z')>catalog.maxAgeDays*86400000;
  const competitors=catalog.plans.filter(p=>p.carrier===mentionedCarrier&&p.carrier!=='T-Mobile');
  const questions=[];
  if(!facts.carrier)questions.push('Which carrier do you use today?');
  if(!facts.planName)questions.push('What is the exact name and version of your current plan?');
  if(!facts.lineCount)questions.push('How many phone lines does that price cover?');
  if(!facts.monthlyCents)questions.push('What is your current monthly service charge?');
  if(!facts.amountBasis)questions.push('Is that the account total or a per-line price?');
  if(facts.taxBasis!=='excluded')questions.push('What is the service charge before taxes and fees?');
  if(facts.devicePaymentsExcluded!==true)questions.push('Can you separate device payments, insurance and add-ons from service?');
  const source={label:target.carrier+' '+target.name,url:target.sourceUrl,verifiedOn:target.verifiedOn};
  const base=target.baseMonthlyCentsByLines[String(facts.lineCount)];
  const usable=!!(facts.monthlyCents&&facts.lineCount&&facts.amountBasis&&facts.taxBasis==='excluded'&&facts.devicePaymentsExcluded===true&&base!==undefined&&!stale(target));
  const current=usable?facts.monthlyCents*(facts.amountBasis==='per_line'?facts.lineCount:1):null;
  const delta=usable?current-base:null;
  const status=stale(target)?'stale':!usable?'needs_details':delta>0?'lower_base_price':delta<0?'higher_base_price':'same_base_price';
  let headline,points,ask;
  if(status==='stale'){
    headline='The saved plan prices need a fresh check.';points=['I will verify the current T-Mobile quote before comparing.','Your existing price and benefits need a like-for-like comparison.'];ask='May I confirm the latest quote first?';
  }else if(!usable){
    headline=mentionedCarrier?`Let’s compare your ${mentionedCarrier} plan accurately.`:'Let’s compare the plans on the same basis.';
    points=['Your actual bill can differ from advertised offers.','I need the line count and service-only charge before claiming savings.'];ask=questions.find(q=>!q.includes('carrier'))||questions[0]||'Which benefits matter most to you?';
  }else{
    headline=`${target.name}: ${money(base)} for ${facts.lineCount} line${facts.lineCount===1?'':'s'}, before taxes and fees.`;
    points=[delta>0?`That base service price is ${money(delta)} below your stated ${money(current)} charge.`:delta<0?`That base service price is ${money(-delta)} above your stated ${money(current)} charge.`:'The base service prices are the same.',
      'This is not total-bill savings; fees, device balances and benefits still need review.'];
    ask='Do the coverage and included features meet your needs?';
  }
  return {status,mentionedCarrier,customer:facts,target,competitors,sources:[source,...competitors.map(p=>({label:p.carrier+' '+p.name,url:p.sourceUrl,verifiedOn:p.verifiedOn}))],
    baseServiceDifferenceCents:delta,annualizedBaseDifferenceCents:delta===null?null:delta*12,totalBillSavingsCents:null,
    targetBaseMonthlyCents:usable?base:null,currentServiceMonthlyCents:current,
    providerFeeCents:usable?target.providerFeeCentsPerLine*facts.lineCount:null,
    oneTimeConnectionChargeCents:usable?target.connectionChargeCentsPerLine*facts.lineCount:null,
    stale:stale(target),questions,script:{agree:headline,points,ask}};
}
function planSheet(catalog=snapshot){
 return 'SELLER: T-Mobile. Use only the official-source snapshot below. Prices are USD/month. Standard service charges exclude taxes, provider fees, devices and discounts. Advertising offers are NOT the customer\'s existing price. Never claim T-Mobile is universally better or cheaper. Never invent switching credits, payoff amounts or deadlines. If a fact is absent or the record is older than '+catalog.maxAgeDays+' days, ask to verify it.\n'+JSON.stringify(catalog.plans.filter(p=>p.carrier==='T-Mobile'));
}
module.exports={compare,extractFacts,validateCustomer,planSheet,snapshot,canonicalCarrier};
