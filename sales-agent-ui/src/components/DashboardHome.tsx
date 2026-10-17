import { ArrowRight, CalendarDays, Clock3, Package, PhoneCall, Plus, UserRound } from "lucide-react";
import type { FollowUpTask, ProductInfo, TrackedCustomer } from "../types/salesAgent";
import { AssistantMascot } from "./AssistantMascot";

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

export function DashboardHome({
  customers, products, selectedCustomerId, selectedProductId,
  onSelectCustomer, onSelectProduct, onStart, onNavigate, onAddProduct,
}: {
  customers: TrackedCustomer[];
  products: ProductInfo[];
  selectedCustomerId: string;
  selectedProductId: string;
  onSelectCustomer: (id: string) => void;
  onSelectProduct: (id: string) => void;
  onStart: (customerId: string, productId: string) => void;
  onNavigate: (page: "customer-tracking" | "history" | "new-conversation") => void;
  onAddProduct: () => void;
}) {
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? products[0];
  const tasks = readSavedTasks(customers);
  const calls = readRecentCalls(customers);

  return <div className="dashboard-home">
    <section className="dashboard-hero">
      <div className="dashboard-hero-copy">
        <span className="dashboard-greeting">SALES CONVERSATION WORKSPACE</span>
        <h1>Ready for your next conversation?</h1>
        <p>Choose a customer and product, then open your sales workspace.</p>
        <button className="primary-button" onClick={() => selectedCustomer && selectedProduct && onStart(selectedCustomer.id, selectedProduct.id)} disabled={!selectedCustomer || !selectedProduct}>
          Start a Conversation <ArrowRight size={16}/>
        </button>
      </div>
      <div className="dashboard-hero-mascot" aria-hidden="true"><AssistantMascot/></div>
    </section>

    <section className="dashboard-setup" aria-labelledby="setup-title">
      <div className="dashboard-section-heading"><div><span className="dashboard-step">01</span><div><h2 id="setup-title">Set up your conversation</h2><p>Pick the context you want ready when the conversation opens.</p></div></div></div>
      <div className="dashboard-setup-grid">
        <div className="dashboard-setup-card">
          <div className="dashboard-setup-label"><span className="dashboard-icon"><UserRound size={17}/></span><strong>Customer</strong></div>
          {customers.length ? <>
            <select aria-label="Choose a customer" value={selectedCustomerId} onChange={(event) => onSelectCustomer(event.target.value)}>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.company ? ` · ${customer.company}` : ""}</option>)}
            </select>
            <div className="dashboard-preview">{selectedCustomer ? <><span className="dashboard-avatar">{selectedCustomer.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("")}</span><span><strong>{selectedCustomer.name}</strong><small>{selectedCustomer.role || selectedCustomer.company || "Customer profile"}</small></span></> : <span className="dashboard-muted">Select a customer to preview</span>}</div>
            <button className="dashboard-text-link" onClick={() => onNavigate("customer-tracking")}>View customer details <ArrowRight size={14}/></button>
          </> : <div className="dashboard-empty-inline"><span>No customer profiles yet.</span><button className="dashboard-text-link" onClick={() => onNavigate("customer-tracking")}>Add a customer <Plus size={14}/></button></div>}
        </div>
        <div className="dashboard-setup-card">
          <div className="dashboard-setup-label"><span className="dashboard-icon"><Package size={17}/></span><strong>Product</strong><button className="dashboard-add-link" onClick={onAddProduct}><Plus size={13}/> Add product</button></div>
          {products.length ? <>
            <select aria-label="Choose a product" value={selectedProduct?.id ?? ""} onChange={(event) => onSelectProduct(event.target.value)}>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.price ? ` · ${product.price}` : ""}</option>)}
            </select>
            <div className="dashboard-preview"><span className="dashboard-icon dashboard-product-icon"><Package size={17}/></span><span><strong>{selectedProduct?.name}</strong><small>{selectedProduct?.category || "Product information"}</small></span><b>{selectedProduct?.price}</b></div>
            <button className="dashboard-text-link" onClick={() => onNavigate("new-conversation")}>View product details <ArrowRight size={14}/></button>
          </> : <div className="dashboard-empty-inline"><span>No products available yet.</span><button className="dashboard-text-link" onClick={onAddProduct}>Add a product <Plus size={14}/></button></div>}
        </div>
      </div>
      {(!selectedCustomer || !selectedProduct) && <p className="dashboard-setup-hint">Select both a customer and product to start a conversation.</p>}
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
