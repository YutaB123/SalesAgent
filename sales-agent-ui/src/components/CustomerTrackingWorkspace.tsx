import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronDown, Pencil, Plus, Save, Search, Sparkles, Trash2, X } from "lucide-react";
import { followUps as initialFollowUps } from "../data/mockData";
import { createCustomerId, customerRepository } from "../services/customerRepository";
import type { FollowUpTask, TrackedCustomer } from "../types/salesAgent";
import { followUpUrgency, groupAndSortCustomers, matchesCustomerTrackingFilters, readinessGroups, readinessScore, readinessTier, validReadinessScore } from "../utils/customerPrioritization";
import { AssistantMascot } from "./AssistantMascot";
import { FollowUpCard, Panel, PageHeading } from "./Cards";

type TaskDraft = { title: string; owner: string; due: string };
type CustomerDraft = Omit<TrackedCustomer, "callHistory" | "readiness" | "lastContact" | "summary" | "isSample">;
type ReadinessGroupId = typeof readinessGroups[number]["id"];
const blankTask = (): TaskDraft => ({ title: "", owner: "Sales Team", due: "Within 1 day" });
const blankCustomer = (): CustomerDraft => ({ id: "", name: "", company: "", role: "", contact: "", needs: "", concerns: "", productDiscussed: "", purchaseStage: "Discovery", followUpDate: "", notes: "" });
const stages = ["Discovery", "Evaluation", "Decision", "Purchased", "Not moving forward"];

function loadTasks(): Record<string, FollowUpTask[]> {
  try {
    const saved = localStorage.getItem("sales-agent-account-tasks-v1");
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.fromEntries(Object.entries(parsed).map(([customerId, tasks]) => [customerId, Array.isArray(tasks) ? tasks.filter((task): task is FollowUpTask => Boolean(task && typeof task === "object" && typeof task.id === "string" && typeof task.title === "string" && typeof task.owner === "string" && typeof task.due === "string")) : []]));
      }
    }
  } catch { /* Fall back to demo tasks. */ }
  return { "demo-01": initialFollowUps.map((task) => ({ ...task })) };
}
function loadScores(): Record<string, number> {
  try {
    const saved = localStorage.getItem("sales-agent-account-scores-v1");
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, number>;
    }
  } catch { /* Missing or malformed scores stay unscored. */ }
  return {};
}
function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?"; }
function urgencyLabel(urgency: ReturnType<typeof followUpUrgency>, date: string) {
  if (urgency === "overdue") return `Overdue · ${formatDateOnly(date)}`;
  if (urgency === "today") return "Due today";
  if (urgency === "upcoming") return `Upcoming · ${formatDateOnly(date)}`;
  if (urgency === "open-no-date") return "Open · No date";
  return "No follow-up";
}
function formatDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "No date";
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString([], { month: "short", day: "numeric" });
}
function hasRecentActivity(customer: TrackedCustomer) {
  if (!customer.callHistory?.length) return false;
  const newest = new Date(customer.callHistory[0].date).getTime();
  return Number.isFinite(newest) && Date.now() - newest <= 7 * 24 * 60 * 60 * 1000;
}
function tasksFor(customer: TrackedCustomer, tasksByCustomer: Record<string, FollowUpTask[]>): FollowUpTask[] {
  const saved = tasksByCustomer[customer.id];
  return Array.isArray(saved) ? saved : (customer.isSample ? initialFollowUps : customer.callHistory.slice(0,1).flatMap(call=>call.nextSteps.map((title,i)=>({id:call.id+"-next-"+i,title,owner:"Sales Team",due:customer.followUpRecommendation?.date||customer.followUpDate||"To confirm"}))));
}

export function CustomerTrackingWorkspace({ onStartConversation }: { onStartConversation: (customerId?: string) => void }) {
  const [customers, setCustomers] = useState<TrackedCustomer[]>(() => customerRepository.list());
  useEffect(()=>{const update=()=>setCustomers(customerRepository.list());window.addEventListener("customers-updated",update);return()=>window.removeEventListener("customers-updated",update);},[]);
  const [selectedId, setSelectedId] = useState(() => customerRepository.list()[0]?.id ?? "");
  const [tasksByCustomer, setTasksByCustomer] = useState<Record<string, FollowUpTask[]>>(loadTasks);
  const [scores, setScores] = useState<Record<string, number>>(loadScores);
  const [query, setQuery] = useState("");
  const [followUpFilter, setFollowUpFilter] = useState<"all" | "open" | "none">("all");
  const [activityFilter, setActivityFilter] = useState<"all" | "recent">("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Partial<Record<ReadinessGroupId, boolean>>>({});
  const [customerDraft, setCustomerDraft] = useState<CustomerDraft>(blankCustomer);
  const [customerError, setCustomerError] = useState("");
  const [customerForm, setCustomerForm] = useState<"add" | "edit" | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(blankTask);
  const activeFilters = Boolean(query.trim()) || followUpFilter !== "all" || activityFilter !== "all";

  useEffect(() => { try { localStorage.setItem("sales-agent-account-tasks-v1", JSON.stringify(tasksByCustomer)); } catch { setStorageError("Could not save follow-up actions in this browser."); } }, [tasksByCustomer]);
  useEffect(() => { try { localStorage.setItem("sales-agent-account-scores-v1", JSON.stringify(scores)); } catch { setStorageError("Could not save customer scores in this browser."); } }, [scores]);

  const filteredCustomers = useMemo(() => customers.filter((account) => {
    return matchesCustomerTrackingFilters(account, { query, followUp: followUpFilter, activity: activityFilter }, tasksFor(account, tasksByCustomer), hasRecentActivity(account));
  }), [customers, query, followUpFilter, activityFilter, tasksByCustomer]);
  const groupedCustomers = useMemo(() => groupAndSortCustomers(filteredCustomers, scores, (account) => tasksFor(account, tasksByCustomer))
    .filter((group) => !activeFilters || group.customers.length > 0), [filteredCustomers, scores, tasksByCustomer, activeFilters]);
  const selected = customers.find((account) => account.id === selectedId) ?? filteredCustomers[0] ?? customers[0];
  const tasks = selected ? tasksFor(selected, tasksByCustomer) : [];
  const selectedScore = selected ? readinessScore(selected, scores) : undefined;
  const selectedTier = readinessGroups.find((group) => group.id === readinessTier(selectedScore));
  const status = selected ? followUpUrgency(selected, tasks) : "none";
  useEffect(() => {
    if (filteredCustomers.length && !filteredCustomers.some((account) => account.id === selectedId)) setSelectedId(filteredCustomers[0].id);
  }, [filteredCustomers, selectedId]);

  const persistCustomer = (next: TrackedCustomer[]) => {
    setCustomers(next);
    setStorageError("");
  };
  const openAddCustomer = () => { setCustomerDraft(blankCustomer()); setCustomerError(""); setCustomerForm("add"); };
  const openEditCustomer = () => {
    if (!selected) return;
    setCustomerDraft({ id: selected.id, name: selected.name, company: selected.company, role: selected.role, contact: selected.contact, needs: selected.needs, concerns: selected.concerns, productDiscussed: selected.productDiscussed, purchaseStage: selected.purchaseStage, followUpDate: selected.followUpDate, notes: selected.notes });
    setCustomerError(""); setCustomerForm("edit");
  };
  const saveCustomer = () => {
    if (!customerDraft.name.trim() && !customerDraft.contact.trim()) { setCustomerError("Enter a phone number or contact information; a name is optional."); return; }
    if (customerDraft.followUpDate && Number.isNaN(Date.parse(customerDraft.followUpDate))) { setCustomerError("Choose a valid follow-up date."); return; }
    const existing = customers.find((item) => item.id === customerDraft.id);
    const normalized = (value: string) => value.trim().toLocaleLowerCase();
    const duplicate = customers.find((item) => item.id !== customerDraft.id && normalized(item.name) === normalized(customerDraft.name) && normalized(item.company) === normalized(customerDraft.company));
    if (duplicate) { setCustomerError(`${duplicate.name} at ${duplicate.company || "this company"} is already tracked. Select that profile to avoid a duplicate.`); return; }
    const nextCustomer: TrackedCustomer = {
      ...existing,
      ...customerDraft,
      id: customerDraft.id || createCustomerId(),
      name: customerDraft.name.trim() || customerDraft.contact.trim(), company: customerDraft.company.trim(), role: customerDraft.role.trim(), contact: customerDraft.contact.trim(),
      needs: customerDraft.needs.trim(), concerns: customerDraft.concerns.trim(), productDiscussed: customerDraft.productDiscussed.trim(), notes: customerDraft.notes.trim(),
      readiness: existing?.readiness, lastContact: existing?.lastContact ?? "", summary: existing?.summary ?? "No call summary has been saved yet.",
      callHistory: existing?.callHistory ?? [], isSample: false,
    };
    try { const saved=customerRepository.save(nextCustomer);persistCustomer(saved);setSelectedId(saved.find(c=>c.name===nextCustomer.name&&c.company===nextCustomer.company)?.id??nextCustomer.id); setQuery(""); setFollowUpFilter("all"); setActivityFilter("all"); setCustomerForm(null); }
    catch { setCustomerError("The customer could not be saved. Check browser storage and try again."); }
  };
  const removeCustomer = () => {
    if (!selected) return;
    try {
      const remaining = customerRepository.remove(selected.id);
      persistCustomer(remaining); setSelectedId(remaining[0]?.id ?? ""); setQuery(""); setFollowUpFilter("all"); setActivityFilter("all"); setDeleteConfirm(false);
      setTasksByCustomer((current) => { const next = { ...current }; delete next[selected.id]; return next; });
      setScores((current) => { const next = { ...current }; delete next[selected.id]; return next; });
    } catch { setStorageError("The customer could not be deleted. Check browser storage and try again."); setDeleteConfirm(false); }
  };

  const patchTask = (id: string, patch: Partial<FollowUpTask>) => setTasksByCustomer((current) => ({ ...current, [selectedId]: (current[selectedId] ?? (selected?.isSample ? initialFollowUps : [])).map((task) => task.id === id ? { ...task, ...patch } : task) }));
  const beginEditTask = (task: FollowUpTask) => { setEditingTaskId(task.id); setTaskDraft({ title: task.title, owner: task.owner, due: task.due }); setTaskFormOpen(false); };
  const saveTaskEdit = () => { if (!editingTaskId || !taskDraft.title.trim()) return; patchTask(editingTaskId, { title: taskDraft.title.trim(), owner: taskDraft.owner.trim() || "Sales Team", due: taskDraft.due.trim() || "No due date" }); setEditingTaskId(null); setTaskDraft(blankTask()); };
  const addTask = () => { if (!taskDraft.title.trim()) return; setTasksByCustomer((current) => ({ ...current, [selectedId]: [...(current[selectedId] ?? (selected?.isSample ? initialFollowUps : [])), { id: createCustomerId(), title: taskDraft.title.trim(), owner: taskDraft.owner.trim() || "Sales Team", due: taskDraft.due.trim() || "No due date" }] })); setTaskDraft(blankTask()); setTaskFormOpen(false); };
  const cancelTaskEditor = () => { setTaskFormOpen(false); setEditingTaskId(null); setTaskDraft(blankTask()); };

  return <>
    <PageHeading title="Customer Tracking" description="Keep each customer's account context, call history, and next steps together." action={<button className="primary-button" onClick={openAddCustomer}><Plus size={15}/> Add Customer</button>}/>
    {storageError && <div className="tracking-error" role="alert">{storageError}</div>}
    <div className="tracking-workspace">
      <Panel title="Customers" subtitle={`${activeFilters ? `${filteredCustomers.length} of ` : ""}${customers.length} accounts · team workspace`}>
        <div className="customer-search"><Search size={14}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or company" aria-label="Search customers"/></div>
        <div className="customer-filters"><label>Follow-up<select value={followUpFilter} onChange={(event) => setFollowUpFilter(event.target.value as "all" | "open" | "none")}><option value="all">All statuses</option><option value="open">Open / scheduled</option><option value="none">No open actions</option></select></label><label>Activity<select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as "all" | "recent")}><option value="all">Any time</option><option value="recent">Last 7 days</option></select></label></div>
        <div className="tracked-customer-groups">{groupedCustomers.map((group) => <section className="tracked-customer-group" key={group.id}>
          <button className="customer-tier-toggle" aria-expanded={!collapsedGroups[group.id]} onClick={() => setCollapsedGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}>
            <ChevronDown size={15} className={collapsedGroups[group.id] ? "collapsed" : ""}/><strong>{group.label}</strong><span className="tier-range">{group.range}</span><small>{group.customers.length} {group.customers.length === 1 ? "customer" : "customers"}</small>
          </button>
          {!collapsedGroups[group.id] && <div className="tracked-customer-list">{group.customers.map((account) => {
            const urgency = followUpUrgency(account, tasksFor(account, tasksByCustomer));
            const score = readinessScore(account, scores);
            return <button key={account.id} className={`tracked-customer-row ${selected?.id === account.id ? "active" : ""}`} onClick={() => { setSelectedId(account.id); cancelTaskEditor(); }}>
              <span className="customer-avatar">{initials(account.name)}</span><span className="tracked-customer-copy"><strong>{account.name}</strong><small>{[account.role, account.company].filter(Boolean).join(" · ") || "Customer"}</small><em className={`followup-urgency urgency-${urgency}`}>{urgencyLabel(urgency, account.followUpDate)}</em></span><span className="readiness-score-display">{score === undefined ? "—" : `${score}/10`}<small>{score === undefined ? "Unscored" : "Readiness"}</small></span><ArrowRight size={15}/>
            </button>;
          })}</div>}
        </section>)}</div>
        {filteredCustomers.length === 0 && <div className="tracking-empty-tasks">No customers match these filters. Try another search or add a customer.</div>}
        <div className="tracking-buddy"><AssistantMascot/><span><strong>Little things add up!</strong><small>Keep each customer's follow-up personal and on time.</small></span><b>✦</b></div>
      </Panel>
      {selected ? <div className="tracking-detail">
        <Panel title="Customer overview" subtitle={selected.isSample ? "Sample account · demo information" : "Customer account"} action={<div className="customer-record-actions"><span className="stage-pill">{selected.purchaseStage}</span><button className="followup-icon-button" onClick={openEditCustomer} aria-label="Edit customer" title="Edit customer"><Pencil size={14}/></button><button className="followup-icon-button delete-action" onClick={() => setDeleteConfirm(true)} aria-label="Archive customer" title="Archive customer"><Trash2 size={14}/></button></div>}>
          <div className="tracking-profile"><span className="customer-avatar">{initials(selected.name)}</span><div><h2>{selected.name}</h2><span>{[selected.role, selected.company].filter(Boolean).join(" · ") || "Customer"}</span></div><span className={`intent-pill urgency-${status}`}>Follow-up · {urgencyLabel(status, selected.followUpDate)}</span></div>
          {selected.contact && <div className="customer-contact-line">Contact · {selected.contact}</div>}
          <div className="tracking-facts"><div><small>Last contact</small><strong>{selected.lastContact ? new Date(selected.lastContact).toLocaleString() : "No call saved"}</strong></div><div><small>Product discussed</small><strong>{selected.productDiscussed || "Not specified"}</strong></div><div><small>Main concern</small><strong>{selected.concerns || "Not specified"}</strong></div></div>
          <div className="tracking-facts"><div><small>Customer needs</small><strong>{selected.needs || "Not specified"}</strong></div><div><small>Next follow-up</small><strong>{selected.followUpDate || "Not scheduled"}</strong></div><div><small>Notes</small><strong>{selected.notes || "No notes"}</strong></div></div>
          <div className="customer-readiness"><div className="readiness-heading"><div><span>Purchase readiness</span><small>{selectedTier?.label} · seller estimate</small></div><strong>{selectedScore === undefined ? "—" : <>{selectedScore}<small>/10</small></>}</strong></div><label className="readiness-score-control"><span>Score</span><select aria-label={`Purchase readiness score for ${selected.name}`} value={selectedScore ?? ""} onChange={(event) => { const value = event.target.value; if (!value) return; const parsed = Number(value); if (validReadinessScore(parsed)) setScores((current) => ({ ...current, [selected.id]: parsed })); }}><option value="">Unscored · select 1–10</option>{Array.from({ length: 10 }, (_, index) => index + 1).map((score) => <option key={score} value={score}>{score} / 10</option>)}</select></label><div className="readiness-scale"><span>Tier follows score</span><span>Follow-up urgency is separate</span></div></div>
          {selected.doNotContact&&<div className="tracking-error">Do not contact · customer requested no further outreach.</div>}
          {selected.followUpRecommendation&&<div className="precall-brief"><span className="eyebrow">{selected.followUpRecommendation.basis==="agreed"?"CUSTOMER-REQUESTED FOLLOW-UP":"SUGGESTED FOLLOW-UP"}</span><p><strong>{selected.followUpRecommendation.date}</strong> · {selected.followUpRecommendation.reason}</p></div>}
          {!!selected.criticalInformation?.length&&<div className="customer-evidence"><span className="eyebrow">CRITICAL CUSTOMER INFORMATION</span>{selected.criticalInformation.slice(-6).map((x,i)=><p key={i}><strong>{x.kind}:</strong> {x.text}</p>)}</div>}
          <div className="account-summary"><span>LATEST CALL SUMMARY <AssistantMascot/></span><p>{selected.summary}</p></div>
        </Panel>
        <Panel title="Call history" subtitle={`${selected.callHistory.length} saved call${selected.callHistory.length === 1 ? "" : "s"}`}>
          {selected.callHistory.length ? <div className="customer-call-history">{selected.callHistory.map((call) => <article className="customer-call-entry" key={call.id}><div className="customer-call-entry-heading"><strong>{new Date(call.date).toLocaleString()}</strong><span>{call.productDiscussed || "Product not specified"}</span></div><p>{call.summary || "Transcript saved for review; no generated summary is available."}</p>{call.concerns.length > 0 && <small><b>Concerns:</b> {call.concerns.join(" · ")}</small>}{call.nextSteps.length > 0 && <small><b>Next steps:</b> {call.nextSteps.join(" · ")}</small>}{call.transcript?.length ? <details><summary>Review transcript ({call.transcript.length} turns)</summary><div className="saved-transcript">{call.transcript.map((turn) => <p key={turn.id}><b>{turn.speaker === "customer" ? "Customer" : "Sales rep"} · {turn.time}</b> {turn.text}</p>)}</div></details> : null}</article>)}</div> : <div className="tracking-empty-tasks">No call history has been saved for this customer yet.</div>}
        </Panel>
        <Panel title="Follow-up actions" subtitle="Add, edit, or complete this customer's next steps" action={<div className="tracking-task-actions"><span className="count-pill">{tasks.filter((task) => !task.completed).length} open</span><button className="add-product-button" onClick={() => { setTaskFormOpen((value) => !value); setEditingTaskId(null); setTaskDraft(blankTask()); }}><Plus size={13}/> Add action</button></div>}>
          {taskFormOpen && <TaskEditor draft={taskDraft} setDraft={setTaskDraft} onSave={addTask} onCancel={cancelTaskEditor} saveLabel="Add action"/>}
          <div className="followup-list">{tasks.map((task) => editingTaskId === task.id ? <TaskEditor key={`${selected.id}-${task.id}`} draft={taskDraft} setDraft={setTaskDraft} onSave={saveTaskEdit} onCancel={cancelTaskEditor} saveLabel="Save changes"/> : <div className={`editable-followup ${task.completed ? "completed" : ""}`} key={`${selected.id}-${task.id}`}><FollowUpCard task={task} onToggle={() => patchTask(task.id, { completed: !task.completed })}/><div className="followup-edit-controls"><button aria-label={`Edit ${task.title}`} title="Edit action" onClick={() => beginEditTask(task)}><Pencil size={13}/></button><button className="delete-action" aria-label={`Delete ${task.title}`} title="Delete action" onClick={() => setTasksByCustomer((current) => ({ ...current, [selected.id]: (current[selected.id] ?? (selected.isSample ? initialFollowUps : [])).filter((item) => item.id !== task.id) }))}><Trash2 size={13}/></button></div></div>)}</div>
          {tasks.length === 0 && !taskFormOpen && <div className="tracking-empty-tasks"><Sparkles size={16}/> No follow-ups yet. Add the next step for {selected.name}.</div>}
        </Panel>
        <div className="tracking-cta"><span><AssistantMascot/><span><strong>Ready for the next conversation?</strong><small>Use {selected.name}'s saved profile as the call context.</small></span></span><button className="primary-button" onClick={() => onStartConversation(selected.id)}>Start Conversation <ArrowRight size={15}/></button></div>
      </div> : <Panel title="No customer selected" subtitle="Add a customer to begin tracking"><button className="primary-button" onClick={openAddCustomer}><Plus size={15}/> Add Customer</button></Panel>}
    </div>
    {customerForm && <div className="product-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCustomerForm(null); }}><section className="product-dialog-card customer-dialog" role="dialog" aria-modal="true" aria-labelledby="customer-form-title"><button className="product-dialog-close" aria-label="Close" onClick={() => setCustomerForm(null)}><X size={17}/></button><div className="product-dialog-heading"><span className="product-dialog-icon"><Plus size={19}/></span><div><span className="product-dialog-eyebrow"><Sparkles size={12}/> CUSTOMER WORKSPACE</span><h2 id="customer-form-title">{customerForm === "add" ? "Add a customer" : "Edit customer"}</h2><p>Save confirmed customer details and follow-up context.</p></div><AssistantMascot/></div><div className="product-form-grid customer-form-grid">
      <label>Name (optional)<input autoFocus value={customerDraft.name} onChange={(event) => setCustomerDraft({ ...customerDraft, name: event.target.value })} placeholder="e.g. Alex Chen" maxLength={100}/></label>
      <label>Company<input value={customerDraft.company} onChange={(event) => setCustomerDraft({ ...customerDraft, company: event.target.value })} placeholder="Company name" maxLength={100}/></label>
      <label>Job title<input value={customerDraft.role} onChange={(event) => setCustomerDraft({ ...customerDraft, role: event.target.value })} placeholder="e.g. Operations Manager" maxLength={100}/></label>
      <label>Contact information<input value={customerDraft.contact} onChange={(event) => setCustomerDraft({ ...customerDraft, contact: event.target.value })} placeholder="Email or phone (optional)" maxLength={140}/></label>
      <label>Product discussed<input value={customerDraft.productDiscussed} onChange={(event) => setCustomerDraft({ ...customerDraft, productDiscussed: event.target.value })} placeholder="Product name" maxLength={120}/></label>
      <label>Purchase stage<select value={customerDraft.purchaseStage} onChange={(event) => setCustomerDraft({ ...customerDraft, purchaseStage: event.target.value })}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label>
      <label>Next follow-up date<input type="date" value={customerDraft.followUpDate} onChange={(event) => setCustomerDraft({ ...customerDraft, followUpDate: event.target.value })}/></label>
      <label>Customer needs<input value={customerDraft.needs} onChange={(event) => setCustomerDraft({ ...customerDraft, needs: event.target.value })} placeholder="What are they looking for?" maxLength={240}/></label>
      <label className="customer-form-wide">Main concerns<input value={customerDraft.concerns} onChange={(event) => setCustomerDraft({ ...customerDraft, concerns: event.target.value })} placeholder="Price, timing, product fit..." maxLength={240}/></label>
      <label className="customer-form-wide">Notes<textarea rows={3} value={customerDraft.notes} onChange={(event) => setCustomerDraft({ ...customerDraft, notes: event.target.value })} placeholder="Additional confirmed context" maxLength={1000}/></label>
    </div>{customerError && <div className="tracking-error" role="alert">{customerError}</div>}<div className="product-dialog-footer"><span><AssistantMascot/>Saved locally and synced to the team database.</span><div><button className="secondary-button" onClick={() => setCustomerForm(null)}>Cancel</button><button className="primary-button" onClick={saveCustomer}><Check size={15}/>{customerForm === "add" ? "Save Customer" : "Save Changes"}</button></div></div></section></div>}
    {deleteConfirm && selected && <div className="product-dialog-backdrop"><section className="product-dialog-card delete-customer-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-customer-title"><button className="product-dialog-close" aria-label="Cancel delete" onClick={() => setDeleteConfirm(false)}><X size={17}/></button><span className="product-dialog-icon delete-dialog-icon"><Trash2 size={19}/></span><h2 id="delete-customer-title">Archive {selected.name}?</h2><p>This hides the customer from the active list. Their phone identity and call history stay in the team database for future conversations.</p><div className="product-dialog-footer"><span>Make sure you selected the right customer.</span><div><button className="secondary-button" onClick={() => setDeleteConfirm(false)}>Keep customer</button><button className="danger-button" onClick={removeCustomer}><Trash2 size={14}/>Archive customer</button></div></div></section></div>}
  </>;
}

function TaskEditor({ draft, setDraft, onSave, onCancel, saveLabel }: { draft: TaskDraft; setDraft: (draft: TaskDraft) => void; onSave: () => void; onCancel: () => void; saveLabel: string }) {
  return <div className="task-editor"><label>Action<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="e.g. Send a product comparison"/></label><div className="task-editor-row"><label>Owner<input value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} placeholder="Sales Team"/></label><label>Due<input value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} placeholder="Within 2 days"/></label></div><div className="task-editor-buttons"><button className="secondary-button" onClick={onCancel}><X size={13}/>Cancel</button><button className="primary-button" disabled={!draft.title.trim()} onClick={onSave}><Save size={13}/>{saveLabel}</button></div></div>;
}
