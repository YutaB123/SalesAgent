import { useEffect, useState } from "react";
interface Plan { id:string; carrier:string; name:string; sourceUrl:string; sourceSection:string; verifiedOn:string; features:string[]; baseMonthlyCentsByLines:Record<string,number>; priceBasis?:string; eligibility?:string; taxesAndFees?:string; supportSourceUrl?:string; fetchedOn?:string; advertisedOffer?:{lines:number;perLineCents:number;conditions:string}; }
interface Catalog { storage:string; plans:Plan[]; revisions:Record<string,number>; updates:{id:string;plan_id:string;revision:number;updated_at:string}[]; }
async function request(body?:unknown):Promise<Catalog>{const response=await fetch('/api/plan-database',body?{method:'POST',headers:{'Content-Type':'application/json','X-Plan-Action':'1'},body:JSON.stringify(body)}:undefined);const data=await response.json();if(!response.ok)throw Error(data.error||'Database request failed');return data;}
export function PlanDatabasePanel(){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[plan,setPlan]=useState<Plan|null>(null),[verified,setVerified]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const choose=(p:Plan)=>{setPlan(structuredClone(p));setVerified(false);};
 const reload=async(id?:string)=>{const data=await request();setCatalog(data);const selected=data.plans.find(p=>p.id===id)||data.plans[0];if(selected)choose(selected);};
 useEffect(()=>{void reload().catch(error=>setMessage(error.message));},[]);
 const patch=(values:Partial<Plan>)=>{setPlan(p=>p?{...p,...values}:p);setVerified(false);};
 const save=async()=>{if(!plan||!catalog)return;setBusy(true);setMessage('');try{await request({record:plan,expectedRevision:catalog.revisions[plan.id],sourceVerified:verified});await reload(plan.id);setMessage('Database updated. Changes and previous values have been saved.');}catch(error){setMessage(error instanceof Error?error.message:'Update failed');}finally{setBusy(false);}};
 return <section className="panel" style={{padding:24}}><h2>Carrier plan database</h2><p>T-Mobile, AT&amp;T and Verizon official plan information. Review the source before saving changes.</p><p>Storage: <strong>{catalog?.storage==='supabase'?'Team Supabase':catalog?'Local SQLite — cloud connection pending':'Connecting…'}</strong></p><button className="secondary-button" disabled={busy} onClick={()=>void reload(plan?.id).catch(error=>setMessage(error.message))}>Reload database</button><p role="status">{message}</p>
 {catalog&&plan&&<form onSubmit={e=>{e.preventDefault();void save();}} style={{display:'grid',gap:16,maxWidth:800}}>
 <label>Plan<select value={plan.id} onChange={e=>{const p=catalog.plans.find(p=>p.id===e.target.value);if(p)choose(p);}}>{catalog.plans.map(p=><option key={p.id} value={p.id}>{p.carrier} · {p.name}</option>)}</select></label>
 <p>{catalog.plans.length} plans · Revision {catalog.revisions[plan.id]} · <a href={plan.sourceUrl} target="_blank" rel="noreferrer">Open official source ↗</a></p>
 {plan.eligibility&&<p><strong>Eligibility:</strong> {plan.eligibility}</p>}
 {plan.taxesAndFees&&<p><strong>Taxes and fees:</strong> {plan.taxesAndFees}</p>}
 {plan.supportSourceUrl&&<a href={plan.supportSourceUrl} target="_blank" rel="noreferrer">Official benefit details ↗</a>}
 <label>Plan name<input required value={plan.name} onChange={e=>patch({name:e.target.value})}/></label>
 <label>Official source URL<input required type="url" value={plan.sourceUrl} onChange={e=>patch({sourceUrl:e.target.value})}/></label>
 <label>Source section / pricing basis<input required value={plan.sourceSection} onChange={e=>patch({sourceSection:e.target.value})}/></label>
 <label>Last verified<input required type="date" value={plan.verifiedOn} onChange={e=>patch({verifiedOn:e.target.value})}/></label>
 {Object.entries(plan.baseMonthlyCentsByLines).map(([lines,cents])=><label key={lines}>{lines} line(s): monthly account base price ($)<input required type="number" min="0.01" max="10000" step="0.01" value={cents/100} onChange={e=>patch({baseMonthlyCentsByLines:{...plan.baseMonthlyCentsByLines,[lines]:Math.round(Number(e.target.value)*100)}})}/></label>)}
 {plan.priceBasis&&<label>Base-price conditions<textarea required value={plan.priceBasis} onChange={e=>patch({priceBasis:e.target.value})}/></label>}
 {plan.advertisedOffer&&<><p>Advertised offers are separate from an existing customer's actual bill.</p><label>Advertised price per line ($)<input required type="number" min="0.01" max="10000" step="0.01" value={plan.advertisedOffer.perLineCents/100} onChange={e=>patch({advertisedOffer:{...plan.advertisedOffer!,perLineCents:Math.round(Number(e.target.value)*100)}})}/></label><label>Required number of lines<input required type="number" min="1" max="12" value={plan.advertisedOffer.lines} onChange={e=>patch({advertisedOffer:{...plan.advertisedOffer!,lines:Number(e.target.value)}})}/></label><label>Eligibility and offer conditions<textarea required value={plan.advertisedOffer.conditions} onChange={e=>patch({advertisedOffer:{...plan.advertisedOffer!,conditions:e.target.value}})}/></label></>}
 <label>Features (one per line)<textarea value={plan.features.join('\n')} onChange={e=>patch({features:e.target.value.split('\n')})}/></label>
 <label style={{display:'flex',gap:8}}><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>I checked these values and conditions against the official source.</label>
 <button className="primary-button" type="submit" disabled={!verified||busy}>{busy?'Updating…':'Update database'}</button>
 </form>}
 {!!catalog?.updates.length&&<><h3>Recent updates</h3><ul>{catalog.updates.map(update=><li key={update.id}>{update.plan_id} · revision {update.revision} · {new Date(update.updated_at).toLocaleString()}</li>)}</ul></>}
 </section>;
}
