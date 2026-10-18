import { criticalInformation, requestedNoContact, suggestFollowUp } from "./utils/customerSignals";
import { PlanDatabasePanel } from "./components/PlanDatabasePanel";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, MessageSquareText, Plus, Send, Sparkles } from "lucide-react";
import { AppHeader } from "./components/AppHeader";
import { AppSidebar } from "./components/AppSidebar";
import { DashboardHome } from "./components/DashboardHome";
import { CustomerTrackingWorkspace } from "./components/CustomerTrackingWorkspace";
import { CallControls, ConversationBubble, PageHeading, Panel, ScoreRow } from "./components/Cards";
import { customer, demoListeningTranscript, followUps as initialFollowUps, summary } from "./data/mockData";
import { mockRealtimeSource } from "./services/salesAgentRealtime";
import { CoachCard } from "./components/CoachCard";
import { PhoneCallPanel } from "./components/PhoneCallPanel";
import { LiveCoach } from "./services/liveCoach";
import { fetchCards, fetchStatus, requestPostCall } from "./services/coachApi";
import type { Card, CoachRole, PostCallReport, ServerStatus, ShownCard } from "./types/coach";
import { applyReportToCustomer } from "./utils/callInsights";
import { createCustomerId, customerRepository } from "./services/customerRepository";
import type { ConversationTurn, FollowUpTask, ListeningStatus, NavKey, TrackedCustomer } from "./types/salesAgent";

const pageMeta: Record<NavKey,{title:string;subtitle:string}> = {
  "plan-database":{title:"Plan Database",subtitle:"Official carrier plans and pricing conditions"},
  home:{title:"Home",subtitle:"Start a call or check on your customers"},
  "new-conversation":{title:"New Conversation",subtitle:"Listen to a call and get a card for each objection or question"},
  suggestions:{title:"AI Suggestions",subtitle:"Review response ideas, communication strategy, and facts to verify."},
  ongoing:{title:"Ongoing Conversation",subtitle:"Say what the card suggests"},
  summary:{title:"Call Summary",subtitle:"How the call went, saved to your customer"},
  "follow-ups":{title:"Follow-up Actions",subtitle:"Turn the conversation into clear next steps for your team."},
  "customer-tracking":{title:"Customer Tracking",subtitle:"Customers, readiness ratings and follow-ups"},
  history:{title:"History",subtitle:"Calls saved to your customers"},
  settings:{title:"Settings",subtitle:"Manage your Sales Agent workspace preferences."},
};
function now(){return new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});}
/** The coach server calls the salesperson "rep"; this UI's older types call them "seller". */
const toSpeaker=(role:CoachRole):"seller"|"customer"=>role==="rep"?"seller":"customer";
const scoreLabels:Record<string,string>={needs_discovery:"Understanding needs",clarity:"Clarity",objection_handling:"Objection handling",honesty_and_respect:"Honesty and respect",next_steps:"Next steps"};
function App(){
  const [page,setPage]=useState<NavKey>("home");
  const productName="T-Mobile plans";   // the one plan being sold (see the plan sheet in server.js)
  const [turns,setTurns]=useState<ConversationTurn[]>([]);
  const [draft,setDraft]=useState("");
  const [listeningStatus,setListeningStatus]=useState<ListeningStatus>("ready");
  const [listeningError,setListeningError]=useState("");
  const [tasks,setTasks]=useState<FollowUpTask[]>(initialFollowUps);
  const [dashboardCustomerId,setDashboardCustomerId]=useState(()=>customerRepository.list()[0]?.id??customer.id);
  const [sessionCustomerId,setSessionCustomerId]=useState("");
  const [callId,setCallId]=useState(createCustomerId);
  const [callSaved,setCallSaved]=useState(false);
  const [pendingCustomerLink,setPendingCustomerLink]=useState(false);
  const [linkCustomerChoice,setLinkCustomerChoice]=useState("");
  const [newCallCustomerName,setNewCallCustomerName]=useState("");
  const [newCallCustomerCompany,setNewCallCustomerCompany]=useState("");
  const [newCallCustomerRole,setNewCallCustomerRole]=useState("");
  const [newCallCustomerContact,setNewCallCustomerContact]=useState("");
  const [newCallCustomerNeeds,setNewCallCustomerNeeds]=useState("");
  const [newCallCustomerConcerns,setNewCallCustomerConcerns]=useState("");
  const [newCallCustomerFollowUp,setNewCallCustomerFollowUp]=useState("");
  const [callSaveError,setCallSaveError]=useState("");
  const [notice,setNotice]=useState("");
  const [syncStatus,setSyncStatus]=useState("");
  const [,refreshCustomers]=useState(0);
  const customerIdRef=useRef("");
  const currentCallRef=useRef(callId); currentCallRef.current=callId;
  const callStartedRef=useRef(new Date().toISOString());
  useEffect(()=>{
    const update=()=>refreshCustomers(n=>n+1);
    const synced=(e:Event)=>setSyncStatus((e as CustomEvent<string>).detail);
    window.addEventListener("customers-updated",update); window.addEventListener("customer-sync",synced);
    void customerRepository.hydrate().catch(()=>setSyncStatus("Local records available · team database unavailable"));
    const retry=()=>void customerRepository.hydrate().catch(()=>undefined); window.addEventListener("online",retry);
    return ()=>{window.removeEventListener("customers-updated",update);window.removeEventListener("customer-sync",synced);window.removeEventListener("online",retry);};
  },[]);
  // ---- live coach (server-backed): transcript, coaching cards and the post-call report ----
  const [status,setStatus]=useState<ServerStatus>({claude:false,deepgram:false});
  const [cards,setCards]=useState<Card[]>([]);
  const [coachCard,setCoachCard]=useState<ShownCard|null>(null);
  const [live,setLive]=useState<{role:CoachRole;text:string}|null>(null);
  const [report,setReport]=useState<PostCallReport|null>(null);
  const [reportState,setReportState]=useState<"idle"|"loading"|"error">("idle");
  const [reportError,setReportError]=useState("");
  const coachRef=useRef<LiveCoach|null>(null);
  const reportRef=useRef<PostCallReport|null>(null);
  const savedToRef=useRef("");
  const endingRef=useRef(false);
  const endCallLatest=useRef<()=>void>(()=>{});
  useEffect(()=>{void fetchStatus().then(setStatus);fetchCards().then(setCards).catch(()=>setListeningError("Coaching cards could not load. Refresh the page to reconnect."));},[]);
  /** True when the server has Deepgram + the cards: the app listens to a real microphone. Otherwise it stays in demo mode. */
  const liveEnabled=status.deepgram&&cards.length>0;
  const ensureCoach=():LiveCoach=>{
    if(!coachRef.current)coachRef.current=new LiveCoach(cards,{
      onLive:setLive,
      onTurn:turn=>setTurns(prev=>[...prev,{id:`turn-${Date.now()}-${prev.length}`,speaker:toSpeaker(turn.role),text:turn.text,time:now(),source:"live"}]),
      onCard:setCoachCard,
      onError:message=>setListeningError(message),
    },status.claude);
    coachRef.current.setCustomer(customerIdRef.current);
    return coachRef.current;
  };
  const navigate=(next:NavKey)=>{setPage(next);setNotice("");};
  const startCall=(customerId?:string)=>{customerIdRef.current=customerId??"";callStartedRef.current=new Date().toISOString();coachRef.current?.stop();coachRef.current=null;endingRef.current=false;setCoachCard(null);setLive(null);setReport(null);reportRef.current=null;savedToRef.current="";setReportState("idle");setReportError("");setTurns([]);setDraft("");setListeningStatus("ready");setListeningError("");setCallId(createCustomerId());setCallSaved(false);setPendingCustomerLink(false);setCallSaveError("");setLinkCustomerChoice("");setSessionCustomerId(customerId??"");navigate("new-conversation");};
  const startListening=async()=>{ensureAnonymousCustomer();setListeningError("");
    if(liveEnabled){setListeningStatus("listening");try{await ensureCoach().startMic();navigate("ongoing");setNotice("Listening on your microphone. Put the call on speaker.");}catch(error){coachRef.current?.stop();coachRef.current=null;setListeningStatus("error");setListeningError(error instanceof Error?error.message:"Could not start the microphone.");}return;}
    setListeningStatus("listening");try{if(!turns.length)await mockRealtimeSource.start(turn=>{if(cards.length)ensureCoach().typed(turn.speaker==="seller"?"rep":"customer",turn.text);else setTurns(t=>[...t,turn]);});navigate("ongoing");setNotice("Mock transcript loaded. No audio is being recorded.");}catch{setListeningStatus("error");setListeningError("The demo transcript could not be loaded. Please try again.");}};
  const stopListening=async()=>{try{coachRef.current?.stop();coachRef.current=null;await mockRealtimeSource.stop();setListeningStatus("ready");setNotice("Demo session stopped.");}catch{setListeningStatus("error");setListeningError("The session could not be stopped cleanly.");}};
  /** A customer line typed by hand: goes through the same coach as a spoken line when the server has the cards. */
  const addCustomerLine=(text:string)=>{ensureAnonymousCustomer();if(cards.length){ensureCoach().typed("customer",text);}else{setTurns(t=>[...t,{id:`turn-${Date.now()}`,speaker:"customer",text,time:now(),source:"mock"}]);}};
  const generate=()=>{if(draft.trim()){addCustomerLine(draft.trim());setDraft("");}navigate("ongoing");};
  const sendTurn=()=>{if(!draft.trim())return;addCustomerLine(draft.trim());setDraft("");};
  function ensureAnonymousCustomer(){
    if(customerIdRef.current)return customerIdRef.current;
    const id=createCustomerId();customerRepository.save({id,name:"Call " + new Date().toLocaleString(),contact:"",company:"",role:"",needs:"",concerns:"",productDiscussed:productName,purchaseStage:"Discovery",followUpDate:"",notes:"",lastContact:"",summary:"Call in progress",callHistory:[]});
    customerIdRef.current=id;setSessionCustomerId(id);return id;
  }
  const preparePhoneCall=async(phone:string)=>{
    const existing=await customerRepository.lookupPhone(phone);
    const profile=existing??customerRepository.ensurePhone(phone);
    if(profile.doNotContact)throw Error("This customer requested no further contact. The call was not placed.");
    if(profile.archived)customerRepository.save({...profile,archived:false});
    startCall(profile.id);return profile;
  };
  const previewPhone=async(phone:string)=>{const profile=await customerRepository.lookupPhone(phone);return profile;};
  const trackedCustomers=customerRepository.list();
  const recentHistory=trackedCustomers.filter(item=>!item.isSample&&!item.id.startsWith("demo-")).flatMap(item=>(item.callHistory??[]).map(call=>({customer:item,call}))).filter(({call})=>Number.isFinite(Date.parse(call.date))).sort((a,b)=>Date.parse(b.call.date)-Date.parse(a.call.date));
  const trackedSessionCustomer=trackedCustomers.find(item=>item.id===sessionCustomerId);
  /** Copy the post-call report onto the customer: stage, readiness rating, needs, follow-up date and follow-up tasks. */
  const applyInsights=(customerId:string,forCall:string,r:PostCallReport)=>{const done=applyReportToCustomer(customerId,forCall,r);if(done)setNotice(`Customer record updated${done.purchaseStage?` · stage: ${done.purchaseStage}`:""}${done.readiness!==undefined?` · readiness ${done.readiness}/10`:""}${done.followUpDate?` · follow-up ${done.followUpDate}`:""}${done.tasksAdded?` · ${done.tasksAdded} follow-up task${done.tasksAdded>1?"s":""} added`:""}.`);};
  const saveCallForCustomer=(customerId:string)=>{const tracked=customerRepository.list().find(item=>item.id===customerId);if(!tracked){setCallSaveError("That customer is no longer available. Choose another profile or create one.");setPendingCustomerLink(true);return;}customerIdRef.current=customerId;setSessionCustomerId(customerId);setPendingCustomerLink(false);setCallSaveError("");try{const previous=customerRepository.list().find(c=>c.id===customerId);const blocked=previous?.doNotContact||requestedNoContact(turns);const followUp=blocked?undefined:suggestFollowUp(turns);customerRepository.patch(customerId,{criticalInformation:mergeCritical(customerId),doNotContact:blocked,...(followUp?{followUpRecommendation:followUp,followUpDate:followUp.date}:{followUpDate:""})});const hasTranscript=turns.some(turn=>turn.text.trim());const detected=coachCard&&!coachCard.card.stop?{title:coachCard.card.title}:undefined;const isSample=customerId===customer.id&&demoListeningTranscript.every(sample=>turns.some(turn=>turn.id===sample.id));const rep=reportRef.current;customerRepository.appendCall(customerId,{id:callId,date:callStartedRef.current,summary:!hasTranscript?"Call ended; no transcript was captured.":isSample?summary.summary:(rep?.summary.text??""),productDiscussed:productName,concerns:rep?[...new Set(rep.concerns.map(c=>c.category))]:detected?[detected.title]:[],nextSteps:rep?rep.follow_up_actions.map(a=>a.action):isSample?initialFollowUps.map(task=>task.title):[],transcript:turns});savedToRef.current=customerId;if(rep)applyInsights(customerId,callId,rep);setCallSaved(true);setNotice(`${hasTranscript?"Call transcript":"Call activity"} saved to ${tracked.name}'s customer record on this device.`);}catch{setCallSaveError("The call could not be saved in this browser. Check storage and try again.");setLinkCustomerChoice(customerId);setPendingCustomerLink(true);}};
  const createCustomerFromCall=()=>{const name=newCallCustomerName.trim()||newCallCustomerContact.trim()||"Call " + new Date().toLocaleString();const company=newCallCustomerCompany.trim();const existing=customerRepository.list().find(item=>item.name.trim().toLowerCase()===name.toLowerCase()&&item.company.trim().toLowerCase()===company.toLowerCase());if(existing){setCallSaveError(`${existing.name} at ${existing.company||"this company"} already has a profile. Select it above to avoid a duplicate.`);return;}const next:TrackedCustomer={id:createCustomerId(),name,company,role:newCallCustomerRole.trim(),contact:newCallCustomerContact.trim(),needs:newCallCustomerNeeds.trim(),concerns:newCallCustomerConcerns.trim(),productDiscussed:productName,purchaseStage:"Discovery",followUpDate:newCallCustomerFollowUp,notes:"",lastContact:"",summary:"No call transcript was captured.",callHistory:[]};try{const saved=customerRepository.save(next);saveCallForCustomer(saved.find(c=>c.name===next.name&&c.company===next.company)?.id??next.id);setNewCallCustomerName("");setNewCallCustomerCompany("");setNewCallCustomerRole("");setNewCallCustomerContact("");setNewCallCustomerNeeds("");setNewCallCustomerConcerns("");setNewCallCustomerFollowUp("");}catch{setCallSaveError("The customer profile could not be saved in this browser. Check storage and try again.");}};
  /** End the call: stop listening, wait a moment for the last spoken line to land, then save and write the report. */
  const endCall=()=>{if(endingRef.current)return;endingRef.current=true;coachRef.current?.stop();coachRef.current=null;setListeningStatus("ready");setLive(null);setTimeout(()=>endCallLatest.current(),150);};
  /** Ask the server for the post-call report (also used by the "Try again" button). */
  const makeReport=()=>{
    if(turns.length&&status.claude){
      setReportState("loading");setReportError("");setReport(null);reportRef.current=null;
      const thisCall=callId; const thisCustomer=customerIdRef.current;
      requestPostCall(turns.map(t=>({speaker:(t.speaker==="seller"?"rep":"customer") as CoachRole,text:t.text}))).then(r=>{
        if(thisCustomer){customerRepository.updateCall(thisCustomer,thisCall,{summary:r.summary.text,concerns:[...new Set(r.concerns.map(c=>c.category))],nextSteps:r.follow_up_actions.map(a=>a.action)});applyReportToCustomer(thisCustomer,thisCall,r);}
        if(currentCallRef.current!==thisCall)return;
        reportRef.current=r;setReport(r);setReportState("idle");
        setTasks(r.follow_up_actions.map((a,i)=>({id:`report-${i}`,title:a.action,owner:a.owner==="seller"?"You":a.owner==="customer"?"Customer":"Unassigned",due:a.time_text??"To confirm"})));
        if(savedToRef.current){customerRepository.updateCall(savedToRef.current,thisCall,{summary:r.summary.text,concerns:[...new Set(r.concerns.map(c=>c.category))],nextSteps:r.follow_up_actions.map(a=>a.action)});applyInsights(savedToRef.current,thisCall,r);}
      }).catch(error=>{if(currentCallRef.current!==thisCall)return;setReportState("error");setReportError(error instanceof Error?error.message:"The report could not be created.");});
    }
  };
  const endCallNow=()=>{void mockRealtimeSource.stop();setListeningStatus("ready");navigate("summary");makeReport();
    const id=customerIdRef.current||ensureAnonymousCustomer();
    if(customerRepository.list().some(item=>item.id===id)){saveCallForCustomer(id);}
    else{setPendingCustomerLink(true);setLinkCustomerChoice("");setNotice(turns.some(turn=>turn.text.trim())?"Call ended. Link it to an existing customer or create a profile to save the transcript.":"Call ended. Add or link the customer so you can track this conversation.");}};
  endCallLatest.current=endCallNow;   // always points at the newest render, so it sees the last spoken line
  const sessionProfile=trackedSessionCustomer?{id:trackedSessionCustomer.id,name:trackedSessionCustomer.name,initials:trackedSessionCustomer.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()??"").join(""),role:trackedSessionCustomer.role||"Customer",company:trackedSessionCustomer.company||"",needs:trackedSessionCustomer.needs?[trackedSessionCustomer.needs]:[],concerns:trackedSessionCustomer.concerns?[trackedSessionCustomer.concerns]:[],purchaseStage:trackedSessionCustomer.purchaseStage,intent:"medium" as const}:sessionCustomerId?customer:{id:"unlinked",name:"No customer linked",initials:"--",role:"Choose a customer after the call",company:"",needs:[],concerns:[],purchaseStage:"Not selected",intent:"unclear" as const};
  function mergeCritical(id:string){
    const old=customerRepository.list().find(c=>c.id===id)?.criticalInformation??[];
    return [...new Map([...old,...criticalInformation(turns)].map(x=>[x.quote,x])).values()].slice(-12);
  }
  useEffect(()=>{
    const id=customerIdRef.current;if(!id||!turns.length)return;
    const timer=setTimeout(()=>{
      const information=mergeCritical(id);
      const stopped=requestedNoContact(turns);
      customerRepository.patch(id,{criticalInformation:information,...(stopped?{doNotContact:true,followUpDate:""}:{})});
      customerRepository.appendCall(id,{id:callId,date:callStartedRef.current,summary:"Call transcript captured. Analysis pending.",productDiscussed:productName,concerns:[],nextSteps:[],transcript:turns});
    },1200);return()=>clearTimeout(timer);
  },[turns,callId]);
  const toggleTask=(id:string)=>setTasks(t=>t.map(task=>task.id===id?{...task,completed:!task.completed}:task));
  const visibleTurns=turns;
  const hasSampleSummary=sessionCustomerId===customer.id&&demoListeningTranscript.every(sample=>turns.some(turn=>turn.id===sample.id));
  return <div className="app-shell"><AppSidebar active={page} onNavigate={navigate}/><div className="app-main"><AppHeader title={pageMeta[page].title} subtitle={pageMeta[page].subtitle}/><main className="page-content">
    <div style={{display:page==="new-conversation"||page==="ongoing"?"block":"none"}}><PhoneCallPanel onBeforeDial={preparePhoneCall} onLookupCustomer={previewPhone} onAudioTrack={(role,track)=>{setListeningStatus("listening");navigate("ongoing");ensureCoach().attachTrack(role,track).catch(error=>{setListeningStatus("error");setListeningError(error instanceof Error?error.message:"Could not transcribe the call audio.");});}} onCallEnded={endCall}/></div>
    {(page==="new-conversation"||page==="ongoing")&&trackedSessionCustomer&&<div className="precall-brief"><span className="eyebrow">CUSTOMER MEMORY</span><h3>{trackedSessionCustomer.name||trackedSessionCustomer.contact}</h3><p>{trackedSessionCustomer.summary}</p><div className="memory-facts">{trackedSessionCustomer.criticalInformation?.slice(-4).map((x,i)=><span key={i}><strong>{x.kind}:</strong> {x.text}</span>)}</div>{trackedSessionCustomer.followUpRecommendation&&<p>{trackedSessionCustomer.followUpRecommendation.basis==="agreed"?"Customer-requested follow-up":"Suggested follow-up"}: {trackedSessionCustomer.followUpRecommendation.date} · {trackedSessionCustomer.followUpRecommendation.reason}</p>}</div>}
    {page==="home"&&<DashboardHome customers={trackedCustomers} onStart={()=>startCall()} onNavigate={navigate}/>}
    {page==="new-conversation"&&<><PageHeading title="Start a conversation" description="Put the call on speaker and press Start Listening, or call the customer by phone above. You can also type what the customer says."/><CallControls status={listeningStatus} error={listeningError} live={liveEnabled} onStart={startListening} onStop={stopListening}/><div className="session-customer-picker"><label>Customer on this call (optional)<select value={sessionCustomerId} onChange={event=>{customerIdRef.current=event.target.value;setSessionCustomerId(event.target.value);coachRef.current?.setCustomer(event.target.value);}}><option value="">Choose after the call</option>{trackedCustomers.map(item=><option key={item.id} value={item.id}>{item.name}{item.company?" · "+item.company:""}</option>)}</select></label></div><Panel title="Try it by typing" subtitle="Type what the customer says and press Enter"><Composer value={draft} onChange={setDraft} onSend={generate} placeholder="Type what the customer says..." buttonText="Get a card"/></Panel></>}
    {page==="ongoing"&&<><PageHeading title="Ongoing conversation" description="Cards appear as the customer speaks." action={<button className="danger-light" onClick={endCall}>End Conversation</button>}/><CallControls status={listeningStatus} error={listeningError} live={liveEnabled} onStart={startListening} onStop={stopListening}/><div className="ongoing-layout"><Panel title="Conversation" subtitle="What is being said"><div className="transcript-list">{turns.length?turns.map(t=><ConversationBubble key={t.id} speaker={t.speaker} text={t.text} time={t.time} source={t.source??"live"}/>):<div className="transcript-empty">Nothing yet. Press Start Listening, or type what the customer says below.</div>}{live&&<ConversationBubble speaker={toSpeaker(live.role)} text={live.text} time="now" source="live"/>}</div>{listeningError&&<div className="listening-error" role="alert">{listeningError}</div>}<Composer value={draft} onChange={setDraft} onSend={sendTurn} placeholder="Type what the customer says..." buttonText="Send" compact/></Panel><Panel title="Coaching card" subtitle="A relevant answer, a reason to buy, and the next step">{coachCard?<CoachCard shown={coachCard} customerText={turns.filter(t=>t.speaker==="customer").slice(-1)[0]?.text??""}/>:<div className="coach-waiting">A card appears here when the customer pushes back or asks a question.</div>}</Panel></div></>}
    {page==="summary"&&<><PageHeading title="Call summary" description="Review the call and the information saved to the selected customer." action={<span className="timestamp-pill">{new Date().toLocaleString()}</span>}/>
      {pendingCustomerLink&&!callSaved&&<Panel title="Add customer details" subtitle={turns.some(turn=>turn.text.trim())?"Link this call to an existing customer or create a profile to save the transcript.":"This call has ended. Add a customer profile now so you can track this contact and follow up later."}><label className="call-link-field">Existing customer<select value={linkCustomerChoice} onChange={event=>setLinkCustomerChoice(event.target.value)}><option value="">Select a customer…</option>{trackedCustomers.map(item=><option key={item.id} value={item.id}>{item.name}{item.company?` · ${item.company}`:""}</option>)}</select></label><button className="primary-button" disabled={!linkCustomerChoice} onClick={()=>saveCallForCustomer(linkCustomerChoice)}><CheckCircle2 size={15}/>{turns.some(turn=>turn.text.trim())?"Save call to customer":"Link customer"}</button><div className="call-create-customer"><strong>Or create a customer profile</strong><div className="call-create-fields"><input value={newCallCustomerName} onChange={event=>setNewCallCustomerName(event.target.value)} placeholder="Name (optional)" aria-label="Customer name"/><input value={newCallCustomerCompany} onChange={event=>setNewCallCustomerCompany(event.target.value)} placeholder="Company" aria-label="Company"/><input value={newCallCustomerRole} onChange={event=>setNewCallCustomerRole(event.target.value)} placeholder="Role / title" aria-label="Role or title"/><input value={newCallCustomerContact} onChange={event=>setNewCallCustomerContact(event.target.value)} placeholder="Email or phone" aria-label="Email or phone"/><input value={newCallCustomerNeeds} onChange={event=>setNewCallCustomerNeeds(event.target.value)} placeholder="Customer needs" aria-label="Customer needs"/><input value={newCallCustomerConcerns} onChange={event=>setNewCallCustomerConcerns(event.target.value)} placeholder="Main concern" aria-label="Main concern"/><label className="call-follow-up-field">Follow-up date<input type="date" value={newCallCustomerFollowUp} onChange={event=>setNewCallCustomerFollowUp(event.target.value)}/></label><button className="secondary-button" onClick={createCustomerFromCall}><Plus size={14}/>{turns.some(turn=>turn.text.trim())?"Create profile and save call":"Create customer profile"}</button></div></div>{callSaveError&&<div className="tracking-error" role="alert">{callSaveError}</div>}</Panel>}
      <Panel title="Call Summary" subtitle="Conversation overview" className="summary-panel"><div className="summary-status"><CheckCircle2 size={22}/><strong>{turns.some(turn=>turn.text.trim())?callSaved?"Call transcript saved":"Call ended":callSaved?"Call activity saved · no transcript captured":pendingCustomerLink?"Call ended · no transcript captured":"Summary ready"}</strong></div><p className="summary-text">{!turns.some(turn=>turn.text.trim())?pendingCustomerLink?"The customer call ended, but no transcript was received. Add or link a customer above to keep the account record up to date.":callSaved?"The call activity is saved in the linked customer record. No transcript was received, so the summary is unavailable.":summary.summary:hasSampleSummary?summary.summary:report?report.summary.text:reportState==="loading"?"Writing the call report… this takes a few seconds.":reportState==="error"?`The report could not be created: ${reportError}`:"No AI summary is available for this session. The transcript is saved for review; add a summary later if needed."}</p>{reportState==="error"&&<button className="secondary-button" onClick={makeReport}>Try the report again</button>}<p className="call-save-note">{sessionCustomerId?<>Linked customer: <strong>{sessionProfile.name}</strong></>:pendingCustomerLink?"Customer link pending · choose or create a confirmed customer above.":"No customer linked."} {callSaved?(turns.some(turn=>turn.text.trim())?"Transcript saved automatically; cloud sync status shown above.":"Call activity saved automatically."):""}</p></Panel>
      {report&&!hasSampleSummary&&<ReportPanel report={report}/>}
      {hasSampleSummary?<div className="two-column summary-grid"><Panel title="Customer Insights"><Insight title="Needs" values={summary.needs}/><Insight title="Main Concerns" values={summary.concerns}/><Insight title="Purchase Stage" values={[summary.purchaseStage]}/><Insight title="Call Outcome" values={[summary.outcome]}/></Panel><Panel title="Sales Communication Scores" subtitle="Demo score · out of 5">{summary.scores.map(s=><ScoreRow key={s.category} item={s}/>)}</Panel></div>:turns.length>0?<Panel title="Transcript for review" subtitle={`${turns.length} conversation turns · saved to the customer history when linked`}><details className="summary-transcript"><summary>Show transcript</summary>{turns.map(turn=><p key={turn.id}><b>{turn.speaker==="customer"?"Customer":"Sales rep"} · {turn.time}</b> {turn.text}</p>)}</details></Panel>:null}
      <div className="bottom-actions"><button className="secondary-button" onClick={()=>startCall(sessionCustomerId)}><Plus size={16}/>Start New Conversation</button><button className="primary-button" onClick={()=>navigate("customer-tracking")}>View Customer Record <ArrowRight size={15}/></button></div></>}
    {page==="customer-tracking"&&<CustomerTrackingWorkspace onStartConversation={startCall}/> }
    {page==="history"&&<><PageHeading title="Conversation history" description="Calls saved to your customer profiles."/><Panel title="Recent conversations" subtitle="Saved customer activity">{recentHistory.length?<div className="history-table"><div className="history-head"><span>Customer</span><span>Date</span><span>Summary / product</span><span>Concerns</span></div>{recentHistory.map(({customer:item,call})=><div className="history-row" key={call.id}><strong>{item.name}</strong><span>{new Date(call.date).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</span><span>{call.summary||call.productDiscussed||"Transcript saved"}</span><span>{call.concerns.join(", ")||"—"}</span></div>)}</div>:<div className="dashboard-empty"><span className="dashboard-empty-icon"><MessageSquareText size={19}/></span><div><strong>No saved conversations yet</strong><p>Link a completed conversation to a customer to keep it here.</p></div><button className="dashboard-text-link" onClick={()=>startCall()}>Start a conversation <ArrowRight size={14}/></button></div>}</Panel><button className="primary-button history-cta" onClick={() => startCall()}>Start New Conversation <ArrowRight size={16}/></button></>}
    {page==="plan-database"&&<PlanDatabasePanel/>}
    {syncStatus&&<div className="memory-sync" role="status">{syncStatus}</div>}
    {notice&&<div className="toast"><CheckCircle2 size={16}/>{notice}</div>}
  </main></div></div>;
}
function Composer({value,onChange,onSend,placeholder,buttonText,compact=false}:{value:string;onChange:(v:string)=>void;onSend:()=>void;placeholder:string;buttonText:string;compact?:boolean}){return <div className={`composer ${compact?"compact":""}`}><textarea value={value} onChange={e=>onChange(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&value.trim()){e.preventDefault();onSend();}}} placeholder={placeholder} maxLength={500}/><div className="composer-bottom"><span>{value.length}/500</span><button className="primary-button" onClick={onSend} disabled={!value.trim()}>{compact?<Send size={15}/>:<>{buttonText}<Sparkles size={15}/></>}</button></div></div>}
/** The post-call report (Eva's analysis, written by Claude). Every finding carries a quote from the call as evidence. */
function ReportPanel({report}:{report:PostCallReport}){
  const quote=(evidence:{quote:string}[])=>evidence[0]?<span className="report-quote"> “{evidence[0].quote}”</span>:null;
  const scored=report.communication_scores.filter(s=>s.score!==null);
  return <div className="two-column summary-grid">
    <Panel title="Call report" subtitle="Written from the transcript. Quotes show the evidence.">
      <div className="report-grid">
        {report.customer_needs.length>0&&<div className="report-row"><b>Customer needs</b>{report.customer_needs.map((n,i)=><div key={i}>{n.text}{quote(n.evidence)}</div>)}</div>}
        {report.concerns.length>0&&<div className="report-row"><b>Concerns</b>{report.concerns.map((c,i)=><div key={i}><strong>{c.category}</strong> · {c.text}{quote(c.evidence)}</div>)}</div>}
        {report.purchase_stage?.label&&<div className="report-row"><b>Purchase stage</b>{report.purchase_stage.label}<span className="report-quote"> · {report.purchase_stage.reason}</span></div>}
        {report.call_outcome&&<div className="report-row"><b>Call outcome</b>{report.call_outcome.text}</div>}
        {report.follow_up_actions.length>0&&<div className="report-row"><b>Follow-ups</b>{report.follow_up_actions.map((a,i)=><div key={i}>{a.action}{a.time_text?` (${a.time_text})`:""}</div>)}</div>}
      </div>
    </Panel>
    <Panel title="Sales communication scores" subtitle={report.scoring.overall_score!==null?`Overall ${report.scoring.overall_score}/100 · ${report.scoring.observed_criteria} of ${report.scoring.total_criteria} criteria observed`:"Not enough of the call to score"}>
      {scored.map(s=><ScoreRow key={s.criterion} item={{category:scoreLabels[s.criterion]??s.criterion,score:(s.score as number)+1,reason:s.reason}}/>)}
    </Panel>
  </div>;
}
function Insight({title,values}:{title:string;values:string[]}){return <div className="insight-row"><span className="insight-icon"><ClipboardList size={17}/></span><div><strong>{title}</strong><span>{values.join(" · ")}</span></div></div>}
export default App;
