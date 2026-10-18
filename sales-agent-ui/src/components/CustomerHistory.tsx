import {useEffect,useState} from 'react';
import type {CustomerCallHistory} from '../types/salesAgent';
type Message={id:string;channel:string;recipient:string;body:string;status:string;createdAt?:string;acceptedAt?:string;finishedAt?:string;scheduledAt?:string;error?:string};
const stamp=(value?:string)=>value?new Date(value).toLocaleString():'Time unavailable';
export function CustomerHistory({customerId,calls}:{customerId:string;calls:CustomerCallHistory[]}){
 const [messages,setMessages]=useState<Message[]>([]),[error,setError]=useState('');
 useEffect(()=>{let stopped=false;const load=async()=>{try{const r=await fetch('/api/followups/history?customerId='+encodeURIComponent(customerId));const x=await r.json();if(!r.ok)throw Error(x.error);if(!stopped){setMessages(x.messages);setError('');}}catch{if(!stopped)setError('Message history could not load. Retrying…');}};void load();const timer=setInterval(()=>void load(),15000);window.addEventListener('followup-updated',load);return()=>{stopped=true;clearInterval(timer);window.removeEventListener('followup-updated',load);};},[customerId]);
 const entries=[...calls.map(call=>({kind:'call' as const,id:call.id,date:call.date,call})),...messages.map(message=>({kind:'message' as const,id:message.id,date:message.acceptedAt||message.finishedAt||message.createdAt||'',message}))].sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0));
 const status=(s:string)=>({accepted:'Accepted by provider · Delivery unconfirmed',scheduled:'Scheduled · Not sent',cancelled:'Cancelled · Not sent',unconfirmed:'Unconfirmed · Check provider',pending:'Sending · Unconfirmed',sending:'Sending · Unconfirmed',failed:'Failed · Not confirmed sent'}[s]||s);
 return <details className="focus-panel"><summary>History · {calls.length} calls · {messages.length} messages</summary>{error&&<p role="status">{error}</p>}{!entries.length&&<p>No calls or messages yet.</p>}{entries.map(entry=><article key={`${entry.kind}-${entry.id}`}>
  <small>{entry.kind==='call'?'Call':entry.message.channel==='email'?'Email':'iMessage'} · {stamp(entry.date)}</small>
  {entry.kind==='call'?<><p>{entry.call.summary}</p><details><summary>Transcript</summary>{entry.call.transcript?.map(t=><p key={t.id}><b>{t.speaker}:</b> {t.text}</p>)}</details></>:<><p><b>{status(entry.message.status)}</b> · To: {entry.message.recipient}</p>{entry.message.scheduledAt&&<p>Scheduled for: {stamp(entry.message.scheduledAt)}</p>}<p style={{whiteSpace:'pre-wrap'}}>{entry.message.body}</p>{entry.message.error&&<p role="status">{entry.message.error}</p>}</>}
 </article>)}</details>;
}
