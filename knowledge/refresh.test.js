const test=require('node:test'),assert=require('node:assert/strict');
const {resolveProvider}=require('./providers');
const {publicAddress,verifiedPlans}=require('./refresh');
test('supplier names resolve to official pages; unknown suppliers need a URL',()=>{
 assert(resolveProvider('att').url.includes('att.com'));
 assert(resolveProvider('Mint').url.includes('mintmobile.com'));
 assert.throws(()=>resolveProvider('Unknown Supplier'));
 assert.throws(()=>resolveProvider('Unknown Supplier','http://localhost/plans'));
});
test('private addresses cannot be fetched as supplier pages',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','::1'])assert(!publicAddress(ip));
 assert(publicAddress('8.8.8.8'));
});
test('new benefits require exact page evidence; refresh cannot re-date an unextracted base price',()=>{
 const p={name:'Example',url:'https://example.com/plans'},text='Example Basic Unlimited talk and text $30 per line with AutoPay';
 const extracted=[{name:'Basic',features:[{text:'Unlimited talk and text',evidence:'Unlimited talk and text'}],advertisedOffer:{lines:1,perLineCents:3000,conditions:'AutoPay required',evidence:'$30 per line with AutoPay'}}];
 const plans=verifiedPlans(p,text,extracted,[{id:'existing',carrier:'Example',name:'Basic',baseMonthlyCentsByLines:{'1':4000},verifiedOn:'2026-01-01'}],'2026-10-17');
 assert.equal(plans[0].verifiedOn,'2026-01-01');assert.equal(plans[0].fetchedOn,'2026-10-17');
 extracted[0].features[0].text='Invented unlimited roaming';assert.throws(()=>verifiedPlans(p,text,extracted));
});
