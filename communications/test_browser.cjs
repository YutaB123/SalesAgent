const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
function client(){const window={};vm.runInNewContext(readFileSync(__dirname+'/browser.js','utf8'),{window,EventTarget,CustomEvent,setTimeout,clearTimeout,clearInterval,AbortSignal});return new window.SalesAgentCommunications();}
test('hangup confirms completion immediately even when background polling is busy',async()=>{
 const c=client();c.callId='active';c.polling=true;const states=[];c.addEventListener('state',e=>states.push(e.detail));
 let requests=0;c.request=async(route,body)=>{requests++;assert.equal(route,'hangup');assert.equal(body.callId,'active');return {callId:'active',state:'ended'};};
 await Promise.all([c.hangup(),c.hangup()]);assert.equal(requests,1);assert.equal(states.length,1);assert.equal(states[0].call.state,'ended');assert.equal(c.callId,null);
});
test('hangup recovers an unknown call ID from the service before stopping it',async()=>{
 const c=client(),routes=[];c.request=async route=>{routes.push(route);return route==='state'?{call:{callId:'recovered',state:'answered'}}:{state:'ended'};};
 await c.hangup();assert.deepEqual(routes,['state','hangup']);
});
test('failure does not claim the call ended and can be retried',async()=>{
 const c=client();c.callId='active';let ended=false;c.addEventListener('state',()=>ended=true);c.request=async()=>{throw Error('service unavailable')};
 await assert.rejects(c.hangup(),/unavailable/);assert.equal(ended,false);assert.equal(c.callId,'active');
 c.request=async()=>({state:'ended'});await c.hangup();assert.equal(ended,true);
});
test('disconnect releases audio even if the backend hangup request fails',async()=>{
 const c=client();c.callId='active';let disconnected=false,stopped=false;c.room={disconnect:async()=>{disconnected=true;}};c.mic={stop:()=>{stopped=true;}};
 c.request=async()=>{throw Error('offline')};await assert.rejects(c.disconnect(),/offline/);assert(disconnected&&stopped);
});
test('an old in-flight poll cannot resurrect a confirmed ended call',async()=>{
 const c=client();c.lastEndedCallId='old';let state;c.addEventListener('state',e=>state=e.detail);
 c.request=async route=>route.startsWith('events')?{events:[],cursor:1}:{call:{callId:'old',state:'answered'}};
 await c.poll();assert.equal(state.call.state,'ended');
});

test('remote participant departure completes the call once without a network request',()=>{
 const c=client();c.callId='remote';let ended=0;c.addEventListener('state',e=>{if(e.detail.call.state==='ended')ended++;});
 c.finishCall('remote');c.finishCall('remote');assert.equal(ended,1);assert.equal(c.callId,null);
});
test('state still reports hangup when the event endpoint fails',async()=>{
 const c=client();c.callId='remote';let ended=false;c.addEventListener('state',e=>ended=e.detail.call.state==='ended');
 c.request=async route=>{if(route.startsWith('events'))throw Error('events unavailable');return {call:{callId:'remote',state:'ended'}};};
 await c.poll();assert.equal(ended,true);
});
test('late events from a previous call cannot end a new call',()=>{
 const c=client();c.callId='new-call';let ended=false;c.addEventListener('state',()=>ended=true);
 c.finishCall('old-call');assert.equal(ended,false);assert.equal(c.callId,'new-call');
});
