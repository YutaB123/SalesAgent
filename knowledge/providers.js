// Official pages for name-only refresh. Other suppliers need their official HTTPS plan URL once.
const PROVIDERS=[
 {name:'T-Mobile',aliases:['t mobile','tmobile'],url:'https://www.t-mobile.com/cell-phone-plans'},
 {name:'AT&T',aliases:['att','at and t'],url:'https://www.att.com/plans/unlimited-data-plans/'},
 {name:'Verizon',aliases:[],url:'https://www.verizon.com/plans/unlimited/'},
 {name:'Mint Mobile',aliases:['mint'],url:'https://www.mintmobile.com/plans/'},
 {name:'Visible',aliases:[],url:'https://www.visible.com/plans'},
 {name:'Google Fi',aliases:['fi','google fi wireless'],url:'https://fi.google.com/about/plans'},
 {name:'Cricket Wireless',aliases:['cricket'],url:'https://www.cricketwireless.com/plans/phone'},
];
const key=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
function resolveProvider(name,url){
 if(typeof name!=='string'||!name.trim()||name.length>100)throw Error('Enter a supplier name');
 const found=PROVIDERS.find(p=>[p.name,...p.aliases].some(n=>key(n)===key(name)));
 if(found)return found;
 if(!url)throw Error('Add this supplier’s official plans URL once so we can refresh it.');
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port)throw Error('Use a public official HTTPS plans URL');
 return {name:name.trim(),url:parsed.href};
}
module.exports={PROVIDERS,resolveProvider,key};
