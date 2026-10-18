const {test}=require('node:test');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const net=require('node:net');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
test('cancelled uploads cannot crash the summary service or customer API',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'abort-regression-'));const port=19417;
 const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,CUSTOMER_STORAGE:'sqlite',PORT:String(port),DEMO_DATABASE_PATH:path.join(dir,'db.sqlite')}});
 let logs='';const ready=new Promise((resolve,reject)=>{child.stdout.on('data',d=>{logs+=d;if(logs.includes('Sales Agent:'))resolve();});child.once('error',reject);child.once('exit',code=>reject(Error('Server exited: '+code)));});
 try{
  await ready;
  for(const route of ['/api/post-call','/api/match','/api/update-needs']){
   await new Promise((resolve,reject)=>{const socket=net.connect(port,'127.0.0.1',()=>{socket.write(`POST ${route} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 50000\r\n\r\n{"lines":[`);setTimeout(()=>socket.destroy(),30);});socket.on('close',resolve);socket.on('error',reject);});
   const response=await fetch(`http://127.0.0.1:${port}/healthz`);assert.equal(response.status,200);assert.equal(child.exitCode,null);
  }
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/customers`)).status,200);
 }finally{child.kill();await new Promise(resolve=>child.once('exit',resolve));fs.rmSync(dir,{recursive:true,force:true});}
});
