const {spawn}=require('node:child_process');
const path=require('node:path');
function demoOperation(command,payload={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.env.PYTHON||'python3',[path.join(__dirname,'demo_store.py'),command],{env:process.env});
  let raw=''; const timer=setTimeout(()=>{child.kill();reject(Error('Demo database timed out'));},20000);
  child.stdout.on('data',d=>raw+=d);
  child.on('error',()=>{clearTimeout(timer);reject(Error('Demo database could not start'));});
  child.on('close',code=>{clearTimeout(timer);try{if(code)throw Error();resolve(JSON.parse(raw));}catch{reject(Error('Demo database could not save this record'));}});
  child.stdin.end(JSON.stringify(payload));
 });
}
module.exports={demoOperation};
