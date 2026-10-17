import { ArrowRight, CalendarDays, Clock3, PhoneCall } from "lucide-react";
import type { FollowUpTask, TrackedCustomer } from "../types/salesAgent";

type HomeTask = FollowUpTask & { customer: TrackedCustomer };
type HomeCall = { customer: TrackedCustomer; date: string; summary: string; product: string; id: string };

function readSavedTasks(customers: TrackedCustomer[]): HomeTask[] {
  try {
    const raw = localStorage.getItem("sales-agent-account-tasks-v1");
    if (!raw) return [];
    const tasksByCustomer = JSON.parse(raw) as Record<string, FollowUpTask[]>;
    return customers
      .filter((customer) => !customer.isSample && !customer.id.startsWith("demo-"))
      .flatMap((customer) => (tasksByCustomer[customer.id] ?? [])
        .filter((task) => !task.completed)
        .map((task) => ({ ...task, customer })))
      .slice(0, 3);
  } catch {
    return [];
  }
}

function readRecentCalls(customers: TrackedCustomer[]): HomeCall[] {
  return customers.filter((customer) => !customer.isSample && !customer.id.startsWith("demo-")).flatMap((customer) => (customer.callHistory ?? []).map((call) => ({
    customer,
    date: call.date,
    summary: call.summary,
    product: call.productDiscussed,
    id: call.id,
  })))
    .filter((call) => Number.isFinite(Date.parse(call.date)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 3);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : value;
}

export function DashboardHome({ customers, onStart, onNavigate }: {
  customers: TrackedCustomer[];
  onStart: () => void;
  onNavigate: (page: "customer-tracking" | "history" | "new-conversation") => void;
}) {
  const tasks = readSavedTasks(customers);
  const calls = readRecentCalls(customers);

  return <div className="dashboard-home">
    <section className="dashboard-hero">
      <div className="dashboard-hero-copy">
        <h1>Ready for your next call?</h1>
        <p>Start a conversation and the coach listens and tells you what to say.</p>
        <button className="primary-button" onClick={onStart}>
          Start a Conversation <ArrowRight size={16}/>
        </button>
      </div>
    </section>
    <div className="dashboard-lower-grid">
      <section className="dashboard-list-card" aria-labelledby="followups-title">
        <div className="dashboard-list-heading"><div><span className="dashboard-icon"><CalendarDays size={17}/></span><div><h2 id="followups-title">Your follow-ups</h2><p>Open actions saved to customer profiles.</p></div></div><button className="dashboard-view-all" onClick={() => onNavigate("customer-tracking")}>View all <ArrowRight size={14}/></button></div>
        {tasks.length ? <div className="dashboard-rows">{tasks.map((task) => <button className="dashboard-row" key={`${task.customer.id}-${task.id}`} onClick={() => onNavigate("customer-tracking")}><span className="dashboard-avatar">{task.customer.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("")}</span><span className="dashboard-row-copy"><strong>{task.title}</strong><small>{task.customer.name}{task.owner ? ` · ${task.owner}` : ""}</small></span><span className="dashboard-due"><Clock3 size={14}/>{task.due || "No due date"}</span><ArrowRight className="dashboard-row-arrow" size={15}/></button>)}</div> : <div className="dashboard-empty"><span className="dashboard-empty-icon"><CalendarDays size={19}/></span><div><strong>No saved follow-ups yet</strong><p>Add a next step from Customer Tracking to see it here.</p></div><button className="dashboard-text-link" onClick={() => onNavigate("customer-tracking")}>Open tracking <ArrowRight size={14}/></button></div>}
      </section>
      <section className="dashboard-list-card" aria-labelledby="activity-title">
        <div className="dashboard-list-heading"><div><span className="dashboard-icon"><PhoneCall size={17}/></span><div><h2 id="activity-title">Recent activity</h2><p>Saved calls and summaries from your customers.</p></div></div><button className="dashboard-view-all" onClick={() => onNavigate("history")}>View all <ArrowRight size={14}/></button></div>
        {calls.length ? <div className="dashboard-rows">{calls.map((call) => <button className="dashboard-row" key={call.id} onClick={() => onNavigate("history")}><span className="dashboard-icon dashboard-phone-icon"><PhoneCall size={16}/></span><span className="dashboard-row-copy"><strong>Call with {call.customer.name}</strong><small>{formatDate(call.date)}{call.summary ? ` · ${call.summary}` : call.product ? ` · ${call.product}` : " · Transcript saved"}</small></span><ArrowRight className="dashboard-row-arrow" size={15}/></button>)}</div> : <div className="dashboard-empty"><span className="dashboard-empty-icon"><PhoneCall size={19}/></span><div><strong>No saved calls yet</strong><p>Completed calls linked to a customer will appear here.</p></div><button className="dashboard-text-link" onClick={() => onNavigate("new-conversation")}>Start a conversation <ArrowRight size={14}/></button></div>}
      </section>
    </div>
  </div>;
}
