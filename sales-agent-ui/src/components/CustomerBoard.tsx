import {useState} from 'react';
import type {DragEvent,ReactNode} from 'react';
import {parsePhoneNumberFromString} from 'libphonenumber-js';
import type {CountryCode} from 'libphonenumber-js';
import {Plus,Trash2,GripVertical,ArrowDown,ArrowUp} from 'lucide-react';
import {customerRepository as repo,createCustomerId} from '../services/customerRepository';
import type {TrackedCustomer} from '../types/salesAgent';
import {customerGroup,type CustomerGroup} from '../utils/customerBoard';
import {ConfirmDialog} from './ConfirmDialog';
import {CountryPhoneInput} from './CountryPhoneInput';

export function CustomerBoard({customers,selected,onSelect,children}:{customers:TrackedCustomer[];selected:string;onSelect:(id:string)=>void;children:ReactNode}){
 const [historyOpen,setHistoryOpen]=useState(false),[dragging,setDragging]=useState(''),[over,setOver]=useState<CustomerGroup|null>(null);
 const [adding,setAdding]=useState(false),[deleting,setDeleting]=useState<TrackedCustomer|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[country,setCountry]=useState<CountryCode>('US');
 const active=customers.filter(c=>customerGroup(c)==='active'),history=customers.filter(c=>customerGroup(c)==='history');
 const move=(id:string,group:CustomerGroup)=>{
  const c=repo.list().find(x=>x.id===id);if(!c||customerGroup(c)===group)return;
  if(c.doNotContact&&group==='active'){setError('This customer requested no further contact.');return;}
  repo.patch(id,{trackingGroup:group});if(group==='history')setHistoryOpen(true);
  setNotice(`${c.name} moved to ${group==='active'?'Active':'History'} · syncing to backend`);setError('');
 };
 const drop=(e:DragEvent,group:CustomerGroup)=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain');move(id,group);setDragging('');setOver(null);};
 const dragOver=(e:DragEvent,group:CustomerGroup)=>{if(!dragging)return;e.preventDefault();e.dataTransfer.dropEffect='move';setOver(group);};
 const row=(c:TrackedCustomer)=>{
  const group=customerGroup(c),target=group==='active'?'history':'active';
  return <div key={c.id} className={`customer-list-item ${selected===c.id?'selected':''} ${dragging===c.id?'dragging':''}`} draggable onDragStart={e=>{e.dataTransfer.setData('text/plain',c.id);e.dataTransfer.effectAllowed='move';setDragging(c.id);}} onDragEnd={()=>{setDragging('');setOver(null);}}>
   <button className="customer-select" aria-expanded={selected===c.id} onClick={()=>onSelect(selected===c.id?'':c.id)}><GripVertical size={15} className="customer-grip" aria-hidden="true"/><span className="customer-list-copy"><strong>{c.name}</strong><small>{c.purchaseStage||'Not assessed'}</small><span className="customer-score-row"><span title="Purchase readiness"><b>{c.readiness??'—'}<small>/10</small></b><small>Readiness</small></span><span title="Sales communication score"><b>{c.communicationScore??'—'}<small>/100</small></b><small>Communication</small></span></span></span></button>
   <div className="customer-row-tools"><button aria-label={`Move ${c.name} to ${target==='active'?'Active':'History'}`} title={`Move to ${target==='active'?'Active':'History'}`} disabled={c.doNotContact&&target==='active'} onClick={()=>move(c.id,target)}>{target==='active'?<ArrowUp size={14}/>:<ArrowDown size={14}/>}</button><button className="delete-customer" aria-label={`Delete ${c.name}`} title="Delete customer" onClick={()=>setDeleting(c)}><Trash2 size={14}/></button></div>
  </div>;
 };
 const add=()=>{
  setError('');const parsed=phone.trim()?parsePhoneNumberFromString(phone,country):undefined;
  if(phone.trim()&&!parsed?.isPossible()){setError('Enter a valid phone number.');return;}
  if(email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){setError('Enter a valid email address.');return;}
  if(!parsed&&!email.trim()){setError('Add a phone number or email address.');return;}
  const contact=parsed?.number||email.trim();
  const existing=repo.list().find(c=>c.contact===contact||!!email.trim()&&c.email?.toLowerCase()===email.trim().toLowerCase());
  if(existing){setError('This customer already exists. Select their existing profile.');return;}
  const c:TrackedCustomer={id:parsed?'phone-'+parsed.number.slice(1):createCustomerId(),name:name.trim()||contact,contact,email:email.trim(),company:'',role:'',needs:'',concerns:'',productDiscussed:'',purchaseStage:'Discovery',followUpDate:'',notes:'',lastContact:'',summary:'No conversations yet.',callHistory:[],followUpPending:true,trackingGroup:'active'};
  try{repo.save(c);onSelect(c.id);setAdding(false);setNotice(`${c.name} added · syncing to backend`);}catch{setError('Could not save this customer. Please try again.');}
 };
 return <><header className="followup-heading"><div><span className="eyebrow">CUSTOMER WORKSPACE</span><h1>Follow-up</h1></div><button className="board-add-button" onClick={()=>{setName('');setPhone('');setEmail('');setCountry('US');setError('');setAdding(true);}}><Plus size={17}/>Add customer</button></header>
 {error&&!adding&&<p className="focus-error" role="alert">{error}</p>}{notice&&<p className="board-status" role="status">{notice}</p>}
 <div className="customer-layout"><aside className="customer-groups" aria-label="Customers"><section className={`customer-drop-zone ${over==='active'?'drop-over':''}`} aria-label="Active customers" onDragOver={e=>dragOver(e,'active')} onDrop={e=>drop(e,'active')}><h3>Active <span>{active.length}</span></h3>{active.map(row)}{!active.length&&<p className="customer-drop-hint">Drop customers here to follow up.</p>}</section><details className={`history-group customer-drop-zone ${over==='history'?'drop-over':''}`} open={historyOpen} onToggle={e=>setHistoryOpen(e.currentTarget.open)} onDragEnter={()=>{if(dragging)setHistoryOpen(true);}} onDragOver={e=>dragOver(e,'history')} onDrop={e=>drop(e,'history')}><summary>History <span>{history.length}</span></summary>{history.map(row)}{!history.length&&<p className="customer-drop-hint">Drop customers here to keep them in history.</p>}</details></aside>{children}</div>
 {adding&&<ConfirmDialog title="Add customer" confirmLabel="Add customer" onCancel={()=>{setAdding(false);setError('');}} onConfirm={add}><div className="add-customer-fields"><label className="record-label">Name<input autoFocus maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="Customer name"/></label><CountryPhoneInput country={country} onCountry={setCountry} value={phone} onChange={setPhone} disabled={false}/><label className="record-label">Email<input type="email" maxLength={140} value={email} onChange={e=>setEmail(e.target.value)} placeholder="customer@example.com"/></label>{error&&<p className="focus-error" role="alert">{error}</p>}</div></ConfirmDialog>}
 {deleting&&<ConfirmDialog title={`Delete ${deleting.name}?`} confirmLabel="Delete customer" onCancel={()=>setDeleting(null)} onConfirm={()=>{repo.remove(deleting.id);if(selected===deleting.id)onSelect('');setDeleting(null);setNotice('Customer deleted · syncing to backend');}}><p>Remove this customer from the workspace. Saved conversations remain in the backend archive.</p></ConfirmDialog>}
 </>;
}
