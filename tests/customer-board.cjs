const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const compiled=process.env.COMPILED_UI_TEST_DIR||'/tmp/salesagent-board-tests';
const {customerGroup}=require(path.join(compiled,'utils/customerBoard.js'));
const c={id:'test',name:'Alex',contact:'+12025550199',followUpPending:true,followUpTasks:[{id:'task',title:'Review quote',completed:false}]};
test('manual moves override automatic grouping without completing follow-up tasks',()=>{
 assert.equal(customerGroup(c),'active');
 const history={...c,trackingGroup:'history'};
 assert.equal(customerGroup(history),'history');
 assert.equal(history.followUpTasks[0].completed,false);
 assert.equal(customerGroup({...history,trackingGroup:'active'}),'active');
 assert.equal(customerGroup({...c,followUpPending:false,followUpTasks:[] }),'history');
});
test('do-not-contact customers stay in history even with an old active override',()=>{
 assert.equal(customerGroup({...c,trackingGroup:'active',doNotContact:true}),'history');
});
test('customer moves, creation and deletion are queued for the backend; new calls reactivate history',async()=>{
 const storage=new Map();global.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 global.window=new EventTarget();const saved=[];
 global.fetch=async(url,options)=>{if(options?.method==='POST')saved.push(JSON.parse(options.body).record);return {ok:true,json:async()=>({customers:[]})};};
 const {customerRepository:repo}=require(path.join(compiled,'services/customerRepository.js'));
 const customer=repo.ensurePhone('+12025550199');
 await new Promise(r=>setImmediate(r));
 repo.patch(customer.id,{trackingGroup:'history',readiness:8,communicationScore:92});
 await new Promise(r=>setImmediate(r));
 assert.equal(customerGroup(repo.list()[0]),'history');
 assert.equal(saved.at(-1).trackingGroup,'history');
 assert.equal(saved.at(-1).communicationScore,92);
 repo.appendCall(customer.id,{id:'new-call',date:'2026-10-18',summary:'A new conversation',productDiscussed:'Phone',concerns:[],nextSteps:[]});
 await new Promise(r=>setImmediate(r));
 assert.equal(customerGroup(repo.list()[0]),'active');
 repo.remove(customer.id);
 await new Promise(r=>setImmediate(r));
 assert.equal(repo.list().length,0);
 assert.equal(saved.at(-1).archived,true);
});
