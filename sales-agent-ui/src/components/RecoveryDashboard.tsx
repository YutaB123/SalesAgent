import { useEffect, useState } from 'react';
import type { PostCallRecovery } from '../types/coach';

export function RecoveryDashboard({
  recovery,
  customerName,
  onChange,
  initialMessage,
  onSaveDraft,
  analysisMessage,
  readiness
}: {
  recovery?: PostCallRecovery;
  customerName: string;
  onChange?: (next: PostCallRecovery) => void;
  initialMessage?: string;
  onSaveDraft?: (message: string) => void;
  analysisMessage?: string;
  readiness?: number;
}) {
  const [copyStatus, setCopyStatus] = useState('');
  const summary = recovery?.summary;
  const followUp = recovery?.followUp;
  const [draftMessage, setDraftMessage] = useState(followUp?.message || initialMessage || '');
  useEffect(() => { setDraftMessage(followUp?.message || initialMessage || ''); }, [followUp?.message, initialMessage]);
  const saveFollowUp = (patch: Partial<NonNullable<typeof followUp>> = {}) => {
    if (!recovery || !followUp || !onChange) return;
    onChange({ ...recovery, followUp: { ...followUp, message: draftMessage, ...patch } });
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
    <p className="recovery-summary"><b>Conversation summary</b>{summary?.conversationSummary || analysisMessage || 'A summary will appear here after a call is completed and analyzed.'}</p>

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
      <div className="recovery-section-heading"><h3>C. Personalized Follow-up</h3><span className="draft-status">{followUp ? (followUp.sendStatus === 'marked_sent_manually' ? 'Marked sent manually' : 'Draft · Not sent') : 'Not generated'}</span></div>
      <div className="message-channel">Message</div>
      <label className="recovery-field">Message draft<textarea rows={4} value={draftMessage} onChange={event => setDraftMessage(event.target.value)} placeholder="Write a personalized message or analyze a call to generate a draft."/></label>
      {!!followUp?.personalizationEvidence.length && <p><b>Personalization evidence:</b> {followUp.personalizationEvidence.join(', ')}</p>}
      <p className="recovery-approval">{followUp ? `${followUp.requiresSellerApproval ? 'Seller approval required before contacting.' : 'Seller review recommended.'} ${followUp.contactPermissionConfirmed ? 'Contact permission is confirmed.' : 'Contact permission has not been confirmed.'}` : 'Follow-up guidance will appear after analysis.'}</p>
      <div className="recovery-actions"><button onClick={() => { if (followUp && onChange) saveFollowUp({ sendStatus: 'draft' }); else onSaveDraft?.(draftMessage); setCopyStatus('Draft saved.'); }}>Save draft</button><button onClick={() => { void navigator.clipboard.writeText(draftMessage).then(() => setCopyStatus('Draft copied.')).catch(() => setCopyStatus('Clipboard access is unavailable.')); }}>Copy draft</button><button className="recovery-primary" disabled={!followUp||!onChange||followUp.sendStatus === 'marked_sent_manually'} onClick={() => saveFollowUp({ sendStatus: 'marked_sent_manually' })}>Mark as sent</button></div>
      {copyStatus && <small role="status">{copyStatus}</small>}
    </section>

  </section>;
}
