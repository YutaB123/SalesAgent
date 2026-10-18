import {CustomerBoard} from './components/CustomerBoard';
import {customerGroup} from './utils/customerBoard';
import {House,ListTodo,Database} from 'lucide-react';
import {ConfirmDialog} from './components/ConfirmDialog';
import {useEffect,useRef,useState} from 'react';
import {PhoneCallPanel} from './components/PhoneCallPanel';
import {CoachCard} from './components/CoachCard';
import {LiveCoach} from './services/liveCoach';
import {fetchCards,fetchStatus,requestPostCall} from './services/coachApi';
import {customerRepository as repo,createCustomerId} from './services/customerRepository';
import {readinessFromReport,resolveFollowUpDate} from './utils/callInsights';
import type {Card,ServerStatus,ShownCard,CoachRole} from './types/coach';
import type {ConversationTurn,TrackedCustomer} from './types/salesAgent';
import './focus.css';
import {requestedNoContact} from './utils/customerSignals';
import {PhoneDatabase} from './components/PhoneDatabase';
import {PendingQuestionsPanel,RecommendationPanel} from './components/RecommendationPanel';
import type {CustomerNeeds} from './components/RecommendationPanel';
import {RecoveryDashboard} from './components/RecoveryDashboard';
const EMPTY_CUSTOMER_NEEDS:CustomerNeeds={budgetTarget:null,lines:1,usage:[],priorities:[],osPreference:'Any',wantsNewPhone:null,phoneBudget:null};
function getPendingQuestions(needs:CustomerNeeds){const questions:string[]=[];if(needs.budgetTarget==null)questions.push("What is the customer's total monthly budget?");if(needs.wantsNewPhone==null)questions.push('Does the customer want a new phone or to keep the current phone?');if(!needs.osPreference||needs.osPreference==='Any')questions.push('Does the customer prefer iOS, Android, or either?');if(!needs.usage?.length)questions.push('What will the customer mainly use the phone for?');return questions;}
type Call={id:string;customerId:string;date:string;turns:ConversationTurn[]};
export default function App(){
 const [page,setPage]=useState('home'),[customers,setCustomers]=useState(repo.list()),[selected,setSelected]=useState('');
 const [status,setStatus]=useState<ServerStatus>({claude:false,deepgram:false}),[cards,setCards]=useState<Card[]>([]),[shown,setShown]=useState<ShownCard|null>(null);
 const [turns,setTurns]=useState<ConversationTurn[]>([]),[live,setLive]=useState<{role:CoachRole;text:string}|null>(null),[draft,setDraft]=useState('');
 const [active,setActive]=useState(false),[analyzing,setAnalyzing]=useState(false),[error,setError]=useState(''),[sync,setSync]=useState('Loading customer records…'),[retry,setRetry]=useState<Call|null>(null);
 const [customerNeeds,setCustomerNeeds]=useState<CustomerNeeds>({...EMPTY_CUSTOMER_NEEDS}),[needsEnabled,setNeedsEnabled]=useState(false),[pendingQuestions,setPendingQuestions]=useState<string[]>(getPendingQuestions(EMPTY_CUSTOMER_NEEDS));
 const coach=useRef<LiveCoach|null>(null),session=useRef<Call|null>(null),transcript=useRef<ConversationTurn[]>([]),ending=useRef(false),workspaceRef=useRef<HTMLDivElement|null>(null);
 const customerNeedsRef=useRef<CustomerNeeds>({...EMPTY_CUSTOMER_NEEDS}),needsQueue=useRef<Promise<void>>(Promise.resolve()),needsGeneration=useRef(0);
 const pending=customers.filter(c=>customerGroup(c)==='active');
 const updateCustomerNeeds=(utterance:string)=>{const generation=needsGeneration.current;needsQueue.current=needsQueue.current.then(async()=>{const response=await fetch('/api/update-needs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentNeeds:customerNeedsRef.current,utterance})});if(!response.ok)throw new Error('Could not update customer needs');const payload=await response.json() as {needs:CustomerNeeds};if(generation!==needsGeneration.current)return;const next=payload.needs;customerNeedsRef.current=next;setCustomerNeeds(next);setNeedsEnabled(true);setPendingQuestions(getPendingQuestions(next));}).catch(e=>{if(generation===needsGeneration.current)setError(String(e));});};
 const resetCustomerNeeds=()=>{needsGeneration.current+=1;needsQueue.current=Promise.resolve();customerNeedsRef.current={...EMPTY_CUSTOMER_NEEDS};setCustomerNeeds({...EMPTY_CUSTOMER_NEEDS});setNeedsEnabled(false);setPendingQuestions(getPendingQuestions(EMPTY_CUSTOMER_NEEDS));};
 useEffect(()=>{const update=()=>setCustomers(repo.list());const synced=(e:Event)=>setSync((e as CustomEvent<string>).detail);const load=()=>void repo.hydrate().catch(()=>setSync('Backend unavailable · changes pending'));window.addEventListener('customers-updated',update);window.addEventListener('customer-sync',synced);window.addEventListener('online',load);load();void fetchStatus().then(setStatus).catch(()=>setError('Call server unavailable'));void fetchCards().then(setCards).catch(()=>setError('Coaching scripts unavailable'));return()=>{window.removeEventListener('customers-updated',update);window.removeEventListener('customer-sync',synced);window.removeEventListener('online',load);coach.current?.stop();};},[]);
 const ensureCoach=()=>{if(!coach.current)coach.current=new LiveCoach(cards,{onLive:setLive,onCard:setShown,onError:setError,onTurn:t=>{const next:ConversationTurn={id:createCustomerId(),speaker:t.role==='rep'?'seller':'customer',text:t.text,time:new Date().toLocaleTimeString(),source:'live'};transcript.current=[...transcript.current,next];setTurns(transcript.current);if(t.role==='customer')updateCustomerNeeds(t.text);}},status.claude);coach.current.setCustomer(session.current?.customerId||'');return coach.current;};
 const begin=(c:TrackedCustomer)=>{if(active||analyzing)throw Error('Finish the current conversation first.');if(c.doNotContact)throw Error('This customer requested no further contact.');coach.current?.stop();coach.current=null;resetCustomerNeeds();transcript.current=[];setTurns([]);setShown(null);setLive(null);setError('');setRetry(null);ending.current=false;session.current={id:createCustomerId(),customerId:c.id,date:new Date().toISOString(),turns:[]};setSelected(c.id);setActive(true);return c;};
 const beforeDial=async(phone:string)=>begin((await repo.lookupPhone(phone))??repo.ensurePhone(phone));
 const startMic=async()=>{try{if(!session.current)begin(customers.find(c=>c.id===selected)??repo.ensurePhone('+12025550100'));if(!status.deepgram)throw Error('Microphone transcription needs Deepgram. You can type customer lines below.');await ensureCoach().startMic();}catch(e){setError(String(e));}};
 const analyze=async(call:Call)=>{setAnalyzing(true);setError('');setRetry(null);try{if(!call.turns.length)throw Error('No transcript captured. Add a summary manually in Customer Information.');if(!status.claude)throw Error('AI analysis needs an Anthropic API key. Transcript saved; retry when connected.');await needsQueue.current;const c=repo.list().find(c=>c.id===call.customerId);if(!c)return;const historyCalls=(Array.isArray(c.callHistory)?c.callHistory:[]).filter(item=>Array.isArray(item.transcript)&&item.transcript.some(turn=>turn.text.trim())).sort((a,b)=>a.date.localeCompare(b.date));const lines=historyCalls.flatMap(item=>(item.transcript||[]).filter(turn=>turn.text.trim()).map(turn=>({speaker:turn.speaker==='seller'?'rep' as const:'customer' as const,text:turn.text})));if(!lines.length)throw Error('No saved transcript is available to analyze.');const contextIds=historyCalls.map(item=>item.id);const response=await requestPostCall(lines,customerNeedsRef.current,{name:c.name,contact:c.contact,confirmedChannel:c.confirmedChannel,recommendedChannel:c.recommendedChannel});const r=response.report;const channel=r.follow_up_actions.find(a=>/email|message|sms|text/i.test(a.channel))?.channel.toLowerCase();const evidence=new Set(r.purchase_stage?.evidence.map(e=>e.turn_id)||[]).size;const recovery={summary:response.summary,followUp:response.followUp};
 repo.updateCall(c.id,call.id,{summary:r.summary.text,concerns:r.concerns.map(x=>x.text),nextSteps:r.follow_up_actions.map(x=>x.action),recovery,recoveryContextCallIds:contextIds});
 repo.patch(c.id,{summary:r.summary.text,needs:r.customer_needs.map(x=>x.text).join('; '),concerns:r.concerns.map(x=>x.text).join('; '),purchaseStage:r.purchase_stage?.label||'Unclear',confidence:r.purchase_stage?.label&&evidence>=2?'High':evidence?'Medium':'Low',readiness:readinessFromReport(r,lines),communicationScore:r.scoring.overall_score,followUpPending:!c.doNotContact,confirmedChannel:undefined,recommendedChannel:channel&&/message|sms|text/.test(channel)?'message':'email',followUpTasks:r.follow_up_actions.map((a,i)=>({id:`${call.id}-${i}`,title:a.action,owner:a.owner,due:a.time_text||'To confirm'})),followUpDate:resolveFollowUpDate(r.follow_up_actions[0]?.time_text,new Date(call.date))||''});
 setSelected(c.id);setPage('customers');requestAnimationFrame(()=>document.querySelector('.focus-main')?.scrollTo({top:0,behavior:'smooth'}));
 }catch(e){setError(String(e));setRetry(call);}finally{setAnalyzing(false);}};
 const finish=()=>{if(ending.current||!session.current)return;ending.current=true;coach.current?.stop();coach.current=null;setActive(false);setLive(null);const call={...session.current,turns:[...transcript.current]};session.current=null;if(requestedNoContact(call.turns))repo.patch(call.customerId,{doNotContact:true,followUpPending:false,followUpDate:''});repo.appendCall(call.customerId,{id:call.id,date:call.date,summary:'Analysis pending',productDiscussed:repo.list().find(c=>c.id===call.customerId)?.recommendedPlan||'Google Pixel 10a',concerns:[],nextSteps:[],transcript:call.turns});void analyze(call);};
 const send=()=>{if(!draft.trim())return;try{if(!session.current)begin(customers.find(c=>c.id===selected)??repo.ensurePhone('+12025550100'));ensureCoach().typed('customer',draft.trim());setDraft('');}catch(e){setError(String(e));}};
 const current=customers.find(c=>c.id===selected);
 return <div className="focus-app">
  <nav className="focus-nav" aria-label="Main navigation">
   <b>Sales Agent <small>DEMO</small></b>
   <div className="focus-nav-pages">
    <button className={page==='home'?'selected':''} aria-current={page==='home'?'page':undefined} onClick={()=>setPage('home')}><House size={28}/><span>Home</span></button>
    <button className={page==='customers'?'selected':''} aria-current={page==='customers'?'page':undefined} disabled={active} onClick={()=>{setPage('customers');setSelected('');}}><ListTodo size={28}/><span>Follow-up</span>{pending.length>0&&<span className="notification-dot" aria-label={`${pending.length} active customers`}>{pending.length}</span>}</button>
   </div>
   <button className={`nav-database ${page==='database'?'selected':''}`} onClick={()=>setPage('database')}><Database size={16}/>Database</button><small>{sync}</small>
  </nav>
  <main className="focus-main">
   {page==='home'?<>
    <header><div><span className="eyebrow">LIVE WORKSPACE</span><h1>Start conversation</h1></div><div className="focus-actions"><button onClick={startMic} disabled={analyzing}>Microphone</button><button className="end-button" onClick={()=>window.dispatchEvent(new Event('end-conversation'))} disabled={!active}>End conversation</button></div></header>
    <PhoneCallPanel onBeforeDial={beforeDial} onLookupCustomer={phone=>repo.lookupPhone(phone)} onCallEnded={finish} onCallAnswered={()=>workspaceRef.current?.scrollIntoView({behavior:'smooth',block:'start'})} onAudioTrack={(role,track)=>{setActive(true);void ensureCoach().attachTrack(role,track).catch(e=>setError(String(e)));}}/>
    <div className="focus-columns" ref={workspaceRef}>
     <section className="focus-panel"><h2>Live transcript <small>{active?'● LIVE':'Ready'}</small></h2><div className="focus-transcript">{!turns.length&&<p className="empty-copy">Your conversation will appear here.</p>}{turns.map(t=><div key={t.id} className={`focus-turn ${t.speaker}`}><small>{t.speaker==='seller'?'You':'Customer'}</small><p>{t.text}</p></div>)}{live&&<p className="empty-copy">{live.text}</p>}</div><form onSubmit={e=>{e.preventDefault();send();}}><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Type a customer line to test…" aria-label="Customer line" disabled={analyzing}/><button disabled={!draft.trim()||analyzing}>Send</button></form><RecommendationPanel needs={customerNeeds} enabled={needsEnabled}/></section>
     <section className="focus-panel script-panel"><h2>Suggested script</h2>{shown?<CoachCard shown={shown} customerText={shown.customerText||''}/>:<div className="focus-script"><span>SAY THIS</span><p>What matters most in your next phone: camera, size, or price?</p></div>}{current&&<small>{current.name} · {current.recommendedPlan||current.productDiscussed}</small>}<PendingQuestionsPanel questions={pendingQuestions}/></section>
    </div>
   </>:page==='database'?<PhoneDatabase/>:<CustomerBoard customers={customers} selected={selected} onSelect={setSelected}>{current?<CustomerRecord key={current.id} customer={current}/>:<div className="focus-panel empty-copy">Select a customer to view their profile, report, and follow-up.</div>}</CustomerBoard>}
   {analyzing&&<div className="analysis-status" role="status">Analyzing conversation…</div>}{error&&<div className="focus-error" role="alert">{error}{retry&&retry.turns.length>0&&<button onClick={()=>void analyze(retry)} disabled={analyzing}>Retry analysis</button>}</div>}
  </main>
 </div>;
}
function CustomerRecord({customer:c}:{customer:TrackedCustomer}){
 const [edit,setEdit]=useState(c),[saved,setSaved]=useState(false),[deleting,setDeleting]=useState(false);useEffect(()=>setEdit(c),[c]);
 const [analysisMessage,setAnalysisMessage]=useState('');
 const analyzedContextKeys=useRef(new Set<string>());
 const callHistory=Array.isArray(c.callHistory)?c.callHistory:[];
 const hasRecovery=(call:TrackedCustomer['callHistory'][number])=>{
  const recovery=call?.recovery,summary=recovery?.summary,followUp=recovery?.followUp;
  return !!summary&&Array.isArray(summary.riskSignals)&&Array.isArray(summary.unresolvedObjections)&&Array.isArray(summary.missingInformation)&&!!summary.recommendedAction&&!!followUp&&Array.isArray(followUp.personalizationEvidence)&&typeof followUp.message==='string';
 };
 const transcriptCalls=callHistory.filter(call=>Array.isArray(call?.transcript)&&call.transcript.some(turn=>typeof turn?.text==='string'&&turn.text.trim())).sort((a,b)=>a.date.localeCompare(b.date));
 const transcriptCall=transcriptCalls[transcriptCalls.length-1];
 const contextCallIds=transcriptCalls.map(call=>call.id);
 const contextKey=JSON.stringify(contextCallIds);
 const recoveryCall=transcriptCall&&hasRecovery(transcriptCall)&&JSON.stringify(transcriptCall.recoveryContextCallIds||[])===contextKey
  ?transcriptCall
  :transcriptCalls.length?undefined:callHistory.find(hasRecovery);
 useEffect(()=>{
  if(recoveryCall){setAnalysisMessage('');return;}
  if(!transcriptCall){setAnalysisMessage(callHistory.length?'This call has no saved transcript, so its content cannot be analyzed.':'Call history is empty. Finish and analyze a call to populate this dashboard.');return;}
  if(analyzedContextKeys.current.has(contextKey))return;
  analyzedContextKeys.current.add(contextKey);
  let cancelled=false;
  setAnalysisMessage(`Analyzing ${transcriptCalls.length} saved call${transcriptCalls.length===1?'':'s'}…`);
  const lines=transcriptCalls.flatMap(call=>(call.transcript||[]).filter(turn=>typeof turn?.text==='string'&&turn.text.trim()).map(turn=>({speaker:turn.speaker==='seller'?'rep' as const:'customer' as const,text:turn.text})));
  void requestPostCall(lines,{budgetTarget:null,lines:1,usage:[],priorities:[],osPreference:'Any',wantsNewPhone:null,phoneBudget:null},{name:c.name,contact:c.contact,confirmedChannel:c.confirmedChannel,recommendedChannel:c.recommendedChannel})
   .then(response=>{
    const recovery={summary:response.summary,followUp:response.followUp};
    repo.updateCall(c.id,transcriptCall.id,{summary:response.report.summary.text,concerns:response.report.concerns.map(item=>item.text),nextSteps:response.report.follow_up_actions.map(item=>item.action),recovery,recoveryContextCallIds:contextCallIds});
    repo.patch(c.id,{readiness:readinessFromReport(response.report,lines)});
    if(!cancelled)setAnalysisMessage('');
   })
   .catch(error=>{if(!cancelled)setAnalysisMessage(`Could not analyze this transcript: ${error instanceof Error?error.message:String(error)}`);});
  return()=>{cancelled=true;};
 },[c.id,c.name,c.contact,c.confirmedChannel,c.recommendedChannel,recoveryCall?.id,transcriptCall?.id,contextKey,callHistory.length]);
 const update=(fields:Partial<TrackedCustomer>)=>{setSaved(false);setEdit(x=>({...x,...fields}));};
 return <div className="record-panels">
  <RecoveryDashboard recovery={recoveryCall?.recovery} customerName={c.name} readiness={c.readiness} analysisMessage={analysisMessage} initialMessage={c.followUpDrafts?.message?.body} onChange={recoveryCall?recovery=>repo.updateCall(c.id,recoveryCall.id,{recovery}):undefined} onSaveDraft={message=>repo.save({...c,followUpDrafts:{...c.followUpDrafts,message:{recipient:c.contact,subject:'',body:message}}})}/>
  <section className="focus-panel"><h2>Profile <button className="delete-customer" onClick={()=>setDeleting(true)}>Delete customer</button><button onClick={()=>{repo.save(edit);setSaved(true);}}>Save changes</button></h2>
   <div className="profile-fields"><label>Name<input value={edit.name} onChange={e=>update({name:e.target.value})}/></label><label>Phone<input value={edit.contact} readOnly/></label></div>
   <label className="record-label">Summary<textarea value={edit.summary} onChange={e=>update({summary:e.target.value})}/></label>
   {saved&&<small role="status">Changes queued · sync status shown in sidebar</small>}
  </section>
  <details className="focus-panel"><summary>Conversation history · {callHistory.length}</summary>{callHistory.map(call=><article key={call.id}><small>{call.date?new Date(call.date).toLocaleString():'Date unavailable'}</small><p>{call.summary}</p><details><summary>Transcript</summary>{call.transcript?.map(t=><p key={t.id}><b>{t.speaker}:</b> {t.text}</p>)}</details></article>)}</details>
  {deleting&&<ConfirmDialog title={`Delete ${c.name}?`} confirmLabel="Delete customer" onCancel={()=>setDeleting(false)} onConfirm={()=>repo.remove(c.id)}><p>The customer will be removed from this list. Saved conversations remain in the backend archive.</p></ConfirmDialog>}
 </div>;
}
