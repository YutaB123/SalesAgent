import { useEffect, useRef, useState } from 'react';
import { createCustomerId } from '../services/customerRepository';
import type { PostCallRecovery } from '../types/coach';

export function RecoveryDashboard({
  recovery,
  customerName,
  customerId, contact, doNotContact, callId,
  onChange,
  initialMessage,
  onSaveDraft,
  analysisMessage,
  readiness
}: {
  recovery?: PostCallRecovery;
  customerName: string;
  callId?: string;
  customerId: string; contact: string; email?: string; doNotContact?: boolean;
  onChange?: (next: PostCallRecovery) => void;
  initialMessage?: string;
  onSaveDraft?: (message: string) => void;
  analysisMessage?: string;
  readiness?: number;
}) {
  type Job={id:string;callId:string;status:string;body:string;scheduledAt:string;error?:string};
  const [jobs,setJobs]=useState<Job[]>([]),[jobsLoading,setJobsLoading]=useState(true);
  const [scheduledAt,setScheduledAt]=useState('');
  const scheduleRequest=useRef({key:'',id:''});
  const [copyStatus, setCopyStatus] = useState('');
  const [busy,setBusy]=useState(false),[sent,setSent]=useState(false);
  const request=useRef({key:'',id:''});
  const summary = recovery?.summary;
  const followUp = recovery?.followUp;
  const [draftMessage, setDraftMessage] = useState(followUp?.message || initialMessage || '');
  useEffect(() => { setDraftMessage(followUp?.message || initialMessage || ''); }, [followUp?.message, initialMessage]);
  const saveFollowUp = (patch: Partial<NonNullable<typeof followUp>> = {}) => {
    if (!recovery || !followUp || !onChange) {onSaveDraft?.(draftMessage);return;}
    onChange({ ...recovery, followUp: { ...followUp, channel:'message', subject:null, message: draftMessage, ...patch } });
  };
  const localTime=(iso:string)=>{const d=new Date(iso);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
  useEffect(()=>{setScheduledAt(followUp?.timing?.scheduledAt?localTime(followUp?.timing.scheduledAt):'');},[followUp?.timing?.scheduledAt]);
  useEffect(()=>{let cancelled=false;const load=async()=>{try{const r=await fetch('/api/followups/schedules?customerId='+encodeURIComponent(customerId));const x=await r.json();if(!r.ok)throw Error(x.error);if(!cancelled){setJobs(x.jobs);setJobsLoading(false);}}catch{if(!cancelled){setCopyStatus('Could not check scheduled follow-ups. Keep the server running; retry after reconnecting.');setJobsLoading(true);}}};void load();const timer=setInterval(()=>void load(),15000);return()=>{cancelled=true;clearInterval(timer);};},[customerId]);
  const job=jobs.find(x=>x.callId===callId&&['scheduled','sending','unconfirmed','accepted'].includes(x.status))||jobs.find(x=>x.callId===callId);
  const pendingJob=jobs.find(x=>['scheduled','sending','unconfirmed'].includes(x.status));
  const submitted=sent||followUp?.sendStatus==='accepted'||job?.status==='accepted';
  const locked=!!pendingJob&&pendingJob.status!=='scheduled';
  useEffect(()=>{if(pendingJob?.status==='scheduled')setScheduledAt(localTime(pendingJob.scheduledAt));},[pendingJob?.id,pendingJob?.scheduledAt]);
  const changedTime=!!pendingJob&&!!scheduledAt&&(new Date(scheduledAt).getTime()!==new Date(pendingJob.scheduledAt).getTime()||draftMessage!==pendingJob.body);
  const schedule=async(cancel=false)=>{
    if(busy||!callId)return;setBusy(true);setCopyStatus('');
    try{
      const payload=cancel?{customerId,id:pendingJob?.id}:pendingJob?.status==='scheduled'?{customerId,id:pendingJob.id,scheduledAt:new Date(scheduledAt).toISOString(),body:draftMessage}:{customerId,callId,body:draftMessage,scheduledAt:new Date(scheduledAt).toISOString()};
      const key=JSON.stringify(payload);if(scheduleRequest.current.key!==key)scheduleRequest.current={key,id:createCustomerId()};
      const r=await fetch('/api/followups/'+(cancel?'cancel':pendingJob?.status==='scheduled'?'reschedule':'schedule'),{method:'POST',headers:{'Content-Type':'application/json','X-Customer-Action':'1'},body:JSON.stringify({...payload,requestId:scheduleRequest.current.id})});
      const x=await r.json();if(!r.ok)throw Error(x.error||'Scheduling failed.');
      setJobs(current=>[x.job,...current.filter(j=>j.id!==x.job.id)]);saveFollowUp();window.dispatchEvent(new Event('followup-updated'));
      setCopyStatus(cancel?'Schedule cancelled.':`iMessage scheduled for ${new Date(x.job.scheduledAt).toLocaleString()}. Keep the app server online.`);
    }catch(error){setCopyStatus(error instanceof Error?error.message:'Scheduling failed.');}finally{setBusy(false);}
  };
  const generate=async()=>{
    if(busy||locked)return;setBusy(true);setCopyStatus('Generating follow-up message…');
    try{
      const r=await fetch('/api/followups/draft',{method:'POST',headers:{'Content-Type':'application/json','X-Customer-Action':'1'},body:JSON.stringify({customerId,callId,channel:'message'})});
      const x=await r.json();if(!r.ok)throw Error(x.error||'Could not generate a draft.');
      setDraftMessage(x.draft.body);setSent(false);
      if(recovery&&followUp&&onChange)onChange({...recovery,followUp:{...followUp,channel:'message',subject:null,message:x.draft.body,timing:pendingJob?followUp?.timing:x.draft.timing,sendStatus:'draft'}});else onSaveDraft?.(x.draft.body);
      if(!pendingJob&&x.draft.timing?.scheduledAt)setScheduledAt(localTime(x.draft.timing.scheduledAt));
      setCopyStatus('Follow-up generated and saved.');
    }catch(error){setCopyStatus(error instanceof Error?error.message:'Could not generate a draft.');}finally{setBusy(false);}
  };
  const channel='message';
  const recipient=contact;
  const fullSummary=(summary?.text||summary?.conversationSummary||'').split('T-Mobile opportunity:')[0].replace(/\s+/g,' ').trim();
  const summaryWords=fullSummary.split(/(?<=[.!?])\s+(?=[A-Z])/).slice(0,3).join(' ').split(/\s+/);
  const conversationSummary=summaryWords.slice(0,60).join(' ')+(summaryWords.length>60?'…':'');
  const send=async()=>{
    if(busy||doNotContact||!draftMessage.trim())return;
    setBusy(true);setCopyStatus('Sending via Photon iMessage…');
    const payload={customerId,channel,recipient,subject:'',body:draftMessage};
    const key=JSON.stringify(payload);
    if(request.current.key!==key)request.current={key,id:createCustomerId()};
    saveFollowUp();
    try{
      if(pendingJob?.status==='scheduled'){
        const r=await fetch('/api/followups/send-now',{method:'POST',headers:{'Content-Type':'application/json','X-Customer-Action':'1'},body:JSON.stringify({customerId,id:pendingJob.id,body:draftMessage})});
        const x=await r.json();if(!r.ok)throw Error(x.error||'Sending failed.');
        setJobs(current=>[x.job,...current.filter(j=>j.id!==x.job.id)]);window.dispatchEvent(new Event('followup-updated'));
        if(x.job.status==='accepted'){saveFollowUp({sendStatus:'accepted'});setSent(true);setCopyStatus('Accepted by Photon iMessage. Delivery is not yet confirmed.');}
        else setCopyStatus(x.job.error||'Sending via Photon iMessage. Check the message status below.');
        return;
      }
      const response=await fetch('/api/followups/send',{method:'POST',headers:{'Content-Type':'application/json','X-Customer-Action':'1'},body:JSON.stringify({...payload,requestId:request.current.id})});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Message sending failed.');
      saveFollowUp({sendStatus:'accepted'});setSent(true);window.dispatchEvent(new Event('followup-updated'));
      setCopyStatus('Accepted by Photon iMessage. Delivery is not yet confirmed.');
    }catch(error){setCopyStatus(error instanceof Error?error.message:'Sending failed. Draft saved.');}
    finally{setBusy(false);}
  };
  const riskName = (type: string) => ({
    price_objection: 'Price objection',
    considering_competitor: 'Considering alternatives',
    needs_time_to_think: 'Needs time to decide',
    recommendation_over_budget: 'Recommendation over budget',
    positive_buying_intent: 'Positive buying intent',
    agreed_next_step: 'Agreed next step'
  }[type] || type.replaceAll('_', ' '));

  return <section className="recovery-dashboard" aria-label={`Post-call recovery dashboard for ${customerName}`}>
    <header className="recovery-heading"><div><h2>Post-Call Recovery Dashboard</h2><p>Turn call insights into the next best action.</p></div><span className={`recovery-status ${summary?.dealStatus || 'uncertain'}`}>{summary ? `Demo: ${summary.dealStatus.replace('_', ' ')}` : 'Waiting for analysis'}</span></header>
    <p className="recovery-summary"><b>Conversation summary</b>{conversationSummary || analysisMessage || 'A summary will appear here after a call is completed and analyzed.'}</p>

    <div className="recovery-overview">
      <article><span>Deal Risk</span><b>{summary?.dealRiskScore ?? '—'}{summary&&<small>/100</small>}</b><small>{summary?'Heuristic score':'Awaiting call analysis'}</small></article>
      <article><span>Buying Intent</span><b>{readiness ?? '—'}{readiness!=null&&<small>/10</small>}</b><small>Purchase signals</small></article>
      <article><span>Open Objections</span><b>{summary?.unresolvedObjections.length ?? '—'}</b><small>{summary?'Needs follow-up':'Awaiting call analysis'}</small></article>
    </div>

    <section className="recovery-section recovery-risk">
      <div className="recovery-section-heading"><h3>A. Deal Risk Assessment</h3><span className="risk-score">{summary?.dealRiskScore ?? '—'}<small>/100</small></span></div>
      <hr/><span className="recovery-muted">Primary risk</span>
      <b className="recovery-value">{summary ? (summary.riskSignals.find(signal => signal.severity !== 'positive') ? riskName(summary.riskSignals.find(signal => signal.severity !== 'positive')!.type) : 'No primary risk identified') : '—'}</b>
      {summary?.riskSignals.length ? <><span className="recovery-muted">Evidence from the call</span>{summary.riskSignals.map((signal, index) => <blockquote key={`${signal.type}-${index}`}>“{signal.evidence}”</blockquote>)}</> : !summary&&<p>No risk evidence yet.</p>}
      {!!summary?.unresolvedObjections.length&&<p className="recovery-muted">Unresolved: {summary.unresolvedObjections.join('; ')}</p>}
      {!!summary?.missingInformation.length&&<p className="recovery-muted">Still to confirm: {summary.missingInformation.join('; ')}</p>}
      {summary&&<small>{summary.scoreExplanation}</small>}
    </section>

    <section className="recovery-section">
      <h3>B. Recommended Next Action</h3>
      <p className="recovery-action-title">{summary?.recommendedAction.type.replaceAll('_', ' ') || '—'}</p>
      <p>{summary?.recommendedAction.reason || 'A next step will appear after the conversation is analyzed.'}</p>
      {!!summary?.missingInformation.length && <p><b>Confirm first:</b> {summary.missingInformation.join(' ')}</p>}
    </section>

    <section className="recovery-section">
      <div className="recovery-section-heading"><h3>C. Personalized Follow-up</h3><span className="draft-status">{followUp||draftMessage ? (job?.status==='scheduled'?'Scheduled · Not sent':job?.status==='sending'?'Sending · Unconfirmed':job?.status==='unconfirmed'?'Unconfirmed · Check provider':submitted ? 'Accepted · Delivery unconfirmed' : followUp?.sendStatus === 'marked_sent_manually' ? 'Marked sent manually' : 'Draft · Not sent') : 'Not generated'}</span></div>
      <div className="message-channel">iMessage · Photon · To: {recipient}</div>
      <label className="recovery-field">Message draft<textarea rows={4} maxLength={4000} disabled={busy||locked} value={draftMessage} onChange={event => {setDraftMessage(event.target.value);if(followUp?.sendStatus==='accepted'&&recovery&&onChange)onChange({...recovery,followUp:{...followUp,message:event.target.value,sendStatus:'draft'}});}} placeholder="Write a personalized message or analyze a call to generate a draft."/></label>
      {!!followUp?.personalizationEvidence.length && <p><b>Personalization evidence:</b> {followUp.personalizationEvidence.join(', ')}</p>}
      {(followUp||draftMessage)&&<><label className="recovery-field">Follow-up time (your browser's local timezone)<input type="datetime-local" value={scheduledAt} disabled={busy||locked} onChange={e=>setScheduledAt(e.target.value)}/></label><p><b>{followUp?.timing?.basis==='customer_requested'?'Customer-requested timing':'Suggested timing'}:</b> {followUp?.timing?.reason||'Choose a future time to schedule this draft.'}</p><p>To: {contact}. Sends automatically at the selected time. Keep the server online.</p></>}
      {pendingJob?.status==='scheduled'&&<p>Edit the time or message, then click Update schedule to save changes.</p>}
      {job&&<p role="status">{job.status==='accepted'?'Accepted by Photon · Delivery unconfirmed':`${job.status}: ${new Date(job.scheduledAt).toLocaleString()}`}{job.error&&` · ${job.error}`}</p>}

      <div className="recovery-actions"><button disabled={busy||doNotContact||locked} onClick={()=>void generate()}>Generate follow-up</button><button onClick={() => { if (followUp && onChange) saveFollowUp({ sendStatus: 'draft' }); else onSaveDraft?.(draftMessage); setCopyStatus('Draft saved.'); }}>Save draft</button><button onClick={() => { void navigator.clipboard.writeText(draftMessage).then(() => setCopyStatus('Draft copied.')).catch(() => setCopyStatus('Clipboard access is unavailable.')); }}>Copy draft</button><button className="recovery-primary" disabled={busy||jobsLoading||locked||doNotContact||!draftMessage.trim()||submitted} onClick={() => {if(!recipient){setCopyStatus('Save a customer phone number before sending.');return;}void send();}}>{busy?'Please wait…':submitted?'Accepted':'Send iMessage now'}</button><button disabled={busy||jobsLoading||doNotContact||!callId||!scheduledAt||!draftMessage.trim()||locked||submitted||(pendingJob?.status==='scheduled'&&!changedTime)} onClick={()=>void schedule()}>{pendingJob?.status==='scheduled'?'Update schedule':'Schedule iMessage'}</button>{pendingJob?.status==='scheduled'&&<button disabled={busy} onClick={()=>void schedule(true)}>Cancel schedule</button>}</div>

      {copyStatus && <p role="status" aria-live="polite">{copyStatus}</p>}
    </section>

  </section>;
}
