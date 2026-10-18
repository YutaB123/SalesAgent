const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assessIntent,fastCard}=require('./sales-signals');
const {buildDealRecovery}=require('./deal-recovery');
const {CARDS}=require('../cards');
const line=text=>({speaker:'customer',text});
test('one clear latest commitment earns high evidence confidence; conditions and rep claims do not',()=>{
 const ready=assessIntent([line('I need to think about it.'),line("I'll take it.")]);
 assert.equal(ready.confidence,'High');assert.equal(ready.readiness,9);assert.equal(ready.evidence[0].turn_id,1);
 assert.equal(assessIntent([line("I'll take it if the price drops.")]).kind,'conditional');
 assert.notEqual(assessIntent([{speaker:'rep',text:"Let's do it."}]).kind,'ready');
 assert.equal(assessIntent([line("I'll take it."),line('Actually, I need to check with my wife.')]).kind,'conditional');
 assert.equal(assessIntent([line("I'll take it."),line('No thanks, not interested.')]).kind,'declined');
 assert.equal(assessIntent([line("Don't text me again.")]).kind,'opt_out');
});
test('closing has no discovery question and does not trigger on partial or conditional speech',()=>{
 const closing=fastCard({text:"I'm ready to buy.",speaker:'customer'},CARDS);
 assert.equal(closing.card,'closing');assert.equal(closing.ask,'');
 assert.equal(fastCard({text:"I'll take it if you give me a discount.",speaker:'customer'},CARDS),null);
 assert.equal(fastCard({text:"I'll take it.",speaker:'customer',partial:true},CARDS),null);
 assert.equal(fastCard({text:'Sounds good.',speaker:'customer',history:['Rep: I can email you the quote.']},CARDS).card,'closing');
});
test('recovery connects customer facts, seller action, channel and explicitly assumed rates',()=>{
 const lines=[line('I need a good camera for my kids.'),{speaker:'rep',text:'We discussed the Google Pixel 10a.'},line('The price is too high; text me the comparison.')];
 const report={summary:{text:'Customer needs a camera phone and is concerned about price.'},customer_needs:[{text:'Good camera',evidence:[{turn_id:0,quote:lines[0].text}]}],concerns:[{category:'Price',text:'Handset price is too high',evidence:[{turn_id:2,quote:lines[2].text}]}],follow_up_actions:[{kind:'suggested',action:'Compare a lower-cost camera phone',evidence:[]}],purchase_stage:{label:'Comparing',evidence:[]}};
 const r=buildDealRecovery({report,lines,customer:{name:'+12065550123'}});
 assert.equal(r.followUp.channel,'message');assert.match(r.followUp.message,/Google Pixel 10a/);assert.match(r.followUp.message,/kids/);assert.match(r.followUp.message,/lower-cost/);assert.match(r.followUp.message,/Hi there/);
 assert.match(r.conversationSummary,/camera phone/);assert(r.conversationSummary.split(/\s+/).length<=60);assert.match(r.recommendedAction.reason,/within two hours/);assert.match(r.followUp.channelReason,/Customer asked/);
 assert.equal(r.recoveryEstimate.expectedIncrementalCloses,5);assert.match(r.scoreExplanation,/demo assumptions, not measured/);
 const done=buildDealRecovery({report,lines:[...lines,line("I'll take it.")]});
 assert.equal(done.intent.confidence,'High');assert.equal(done.unresolvedObjections.length,0);
 const stop=buildDealRecovery({report,lines:[...lines,line('Do not contact me again.')]});
 assert.equal(stop.followUp.message,'');assert.equal(stop.recoveryEstimate.expectedIncrementalCloses,0);
});
