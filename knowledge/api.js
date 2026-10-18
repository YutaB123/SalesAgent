const {spawn}=require('node:child_process');
const path=require('node:path');
const {compare}=require('./comparison');
function operation(command,payload){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.env.PLAN_DATABASE_PYTHON||process.env.PYTHON||'python3',[path.join(__dirname,'store.py'),command],{cwd:path.join(__dirname,'..'),env:process.env});
  let raw='';const timer=setTimeout(()=>{child.kill();reject(Object.assign(Error('Plan database timed out'),{status:503}))},20000);
  child.stdout.on('data',chunk=>raw+=chunk);
  child.stderr.on('data',()=>{}); // Connection exceptions can include credentials; never send them to clients.
  child.on('error',()=>{clearTimeout(timer);reject(Object.assign(Error('Configure PLAN_DATABASE_PYTHON with a Python environment containing database dependencies.'),{status:503}))});
  child.on('close',()=>{clearTimeout(timer);try{const data=JSON.parse(raw);if(data.error)reject(Object.assign(Error(data.error),{status:data.status||503}));else resolve(data)}catch{reject(Object.assign(Error('Plan database unavailable'),{status:503}))}});
  child.stdin.end(payload===undefined?'':JSON.stringify(payload));
 });
}
const reply=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data))};
async function handle(req,res){
 const route=req.url.split('?')[0];if(!['/api/plan-database','/api/plan-compare'].includes(route))return false;
 try{
  if(req.method==='GET'&&route==='/api/plan-database'){reply(res,200,await operation('list'));return true}
  if(req.method!=='POST'){reply(res,405,{error:'Method not allowed'});return true}
  if(req.headers['x-plan-action']!=='1'){reply(res,403,{error:'Missing action header'});return true}
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>65536){reply(res,413,{error:'Request too large'});return true}}
  const body=JSON.parse(raw||'{}');
  if(route==='/api/plan-database')reply(res,200,await operation('update',body));
  else reply(res,200,compare(await operation('list'),body));
 }catch(error){reply(res,error.status||(error instanceof SyntaxError?400:400),{error:error.message})}
 return true;
}
module.exports={handle,operation};
