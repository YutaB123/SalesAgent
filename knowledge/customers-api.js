const {operation}=require('./api');
async function handle(req,res){
 const url=new URL(req.url,'http://localhost');if(url.pathname!=='/api/customers')return false;
 const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data))};
 if(!require('./access').workspaceAccess(req)){send(403,{error:'Customer memory is available only in the local workspace.'});return true;}
 try{
  if(req.method==='GET'){send(200,await operation('customer-list',{phone:url.searchParams.get('phone'),customerId:url.searchParams.get('id')}));return true;}
  if(req.method!=='POST'){send(405,{error:'Method not allowed'});return true;}
  if(req.headers['x-customer-action']!=='1'){send(403,{error:'Missing action header'});return true;}
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>650000)throw Error('Customer record too large');}
  send(200,await operation('customer-save',JSON.parse(raw)));
 }catch(e){send(e.status||400,{error:e.message});}return true;
}
async function context(customerId){
 if(!customerId)return '';
 const {customers}=await operation('customer-list',{customerId});const c=customers[0];if(!c)return '';
 return JSON.stringify({needs:c.needs,concerns:c.concerns,criticalInformation:c.criticalInformation,followUp:c.followUpRecommendation,doNotContact:c.doNotContact,previousCalls:(c.callHistory||[]).slice(0,3).map(x=>({date:x.date,summary:x.summary,concerns:x.concerns,nextSteps:x.nextSteps}))}).slice(0,10000);
}
module.exports={handle,context};
