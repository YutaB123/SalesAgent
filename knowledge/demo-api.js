const {spawn}=require('node:child_process');
const path=require('node:path');
function demoOperation(command,payload={}){
 return new Promise((resolve,reject)=>{
  const crm=process.env.CUSTOMER_STORAGE==='supabase'&&['customer-list','customer-save'].includes(command);
  const child=spawn(crm?(process.env.PLAN_DATABASE_PYTHON||process.env.PYTHON||'python3'):(process.env.PYTHON||'python3'),[path.join(__dirname,crm?'customer_store.py':'demo_store.py'),command],{env:process.env});
  let raw=''; const timer=setTimeout(()=>{child.kill();reject(Error('Demo database timed out'));},20000);
  child.stdout.on('data',d=>raw+=d);
  child.on('error',()=>{clearTimeout(timer);reject(Error('Demo database could not start'));});
  child.on('close',code=>{clearTimeout(timer);try{if(code)throw Error();resolve(JSON.parse(raw));}catch{reject(Error('Demo database could not save this record'));}});
  child.stdin.end(JSON.stringify(payload));
 });
}
module.exports={demoOperation};
