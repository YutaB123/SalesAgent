const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
test('frontend edits and follow-up confirmation reach backend, survive hydration and preserve phone lookup cache',async()=>{
 const memory=new Map(),backend=new Map();global.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};global.window=new EventTarget();
 global.fetch=async(url,options)=>{if(options?.method==='POST'){const {record}=JSON.parse(options.body);backend.set(record.id,record);return {ok:true,json:async()=>({customer:record})};}const phone=new URL(url,'http://localhost').searchParams.get('phone');return {ok:true,json:async()=>({customers:[...backend.values()].filter(c=>!phone||c.contact===phone)})};};
 const {transformWithOxc}=await import('../sales-agent-ui/node_modules/vite/dist/node/index.js');
 const source=fs.readFileSync(require('node:path').join(__dirname,'../sales-agent-ui/src/services/customerRepository.ts'),'utf8');
 const {code}=await transformWithOxc(source,'repository.ts');
 const {customerRepository:r}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const a=r.ensurePhone('+12025550100');r.ensurePhone('+12025550101');r.save({...a,name:'Changed',summary:'Edited',readiness:9,communicationScore:88,followUpPending:true,followUpTasks:[{id:'a',title:'Review proposal',owner:'You',due:'Tomorrow'}]});
 const drain=async()=>{for(let i=0;i<25;i++){if(memory.get('sales-agent-demo-outbox-v2')==='{}')return;await new Promise(r=>setTimeout(r,5));}throw Error('Outbox did not drain');};await drain();assert.equal(backend.get(a.id).communicationScore,88);assert.equal(backend.get(a.id).summary,'Edited');assert.equal(backend.get(a.id).followUpTasks.length,1);
 r.patch(a.id,{followUpPending:false,confirmedChannel:'message'});await drain();await r.lookupPhone(a.contact);assert.equal(r.list().length,2);await r.hydrate();assert.equal(r.list().find(c=>c.id===a.id).confirmedChannel,'message');assert.equal(backend.get(a.id).followUpPending,false);
});
