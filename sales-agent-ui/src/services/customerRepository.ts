import { customer } from "../data/mockData";
import type { CustomerCallHistory, TrackedCustomer } from "../types/salesAgent";

const STORAGE_KEY = "sales-agent-customers-v1";

export interface CustomerRepository {
  list(): TrackedCustomer[];
  save(customer: TrackedCustomer): TrackedCustomer[];
  remove(customerId: string): TrackedCustomer[];
  appendCall(customerId: string, entry: CustomerCallHistory): TrackedCustomer[];
  /** Update a few fields on a customer (used to copy a post-call report onto the record). */
  patch(customerId: string, fields: Partial<Pick<TrackedCustomer, "purchaseStage" | "readiness" | "followUpDate" | "needs" | "concerns" | "notes">>): TrackedCustomer[];
  /** Fill in a saved call's summary, concerns and next steps once the post-call report is ready. */
  updateCall(customerId: string, callId: string, patch: Partial<Pick<CustomerCallHistory, "summary" | "concerns" | "nextSteps">>): TrackedCustomer[];
}

const sampleCustomers: TrackedCustomer[] = [
  {
    id: customer.id,
    name: customer.name,
    company: "Sample customer",
    role: customer.role,
    contact: "",
    needs: customer.needs.join(", "),
    concerns: customer.concerns.join(", "),
    productDiscussed: "ProBook X1",
    purchaseStage: customer.purchaseStage,
    followUpDate: "",
    notes: "Sample account for the Sales Agent demo.",
    readiness: 7,
    lastContact: "",
    summary: "Sample account. No call summary has been saved yet.",
    callHistory: [],
    isSample: true,
  },
  {
    id: "demo-02", name: "Jordan Lee", company: "Sample company", role: "Operations Manager",
    contact: "", needs: "Coordinate a team deployment", concerns: "Deployment timing",
    productDiscussed: "Team Laptop Bundle", purchaseStage: "Decision", followUpDate: "",
    notes: "Sample account for the Sales Agent demo.", readiness: 8, lastContact: "",
    summary: "Sample account. No call summary has been saved yet.", callHistory: [], isSample: true,
  },
  {
    id: "demo-03", name: "Taylor Morgan", company: "Sample company", role: "Design Lead",
    contact: "", needs: "Check product fit for design work", concerns: "Feature fit",
    productDiscussed: "StudioBook Air", purchaseStage: "Discovery", followUpDate: "",
    notes: "Sample account for the Sales Agent demo.", readiness: 5, lastContact: "",
    summary: "Sample account. No call summary has been saved yet.", callHistory: [], isSample: true,
  },
];

function read(): TrackedCustomer[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return sampleCustomers;
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) return parsed as TrackedCustomer[];
  } catch {
    // Keep the sample experience available when storage is unavailable or malformed.
  }
  return sampleCustomers;
}

function write(customers: TrackedCustomer[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
}

export function createCustomerId() {
  return globalThis.crypto?.randomUUID?.() ?? `customer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const customerRepository: CustomerRepository = {
  list: read,
  save(next) {
    const current = read();
    const updated = current.some((item) => item.id === next.id)
      ? current.map((item) => item.id === next.id ? next : item)
      : [...current, next];
    write(updated);
    return updated;
  },
  remove(customerId) {
    const updated = read().filter((item) => item.id !== customerId);
    write(updated);
    return updated;
  },
  appendCall(customerId, entry) {
    const updated = read().map((item) => {
      if (item.id !== customerId || item.callHistory.some((call) => call.id === entry.id)) return item;
      return {
        ...item,
        lastContact: entry.date,
        productDiscussed: entry.productDiscussed || item.productDiscussed,
        concerns: entry.concerns.length ? entry.concerns.join(", ") : item.concerns,
        summary: entry.summary || "Transcript saved for review; no generated summary is available.",
        callHistory: [entry, ...item.callHistory],
      };
    });
    write(updated);
    return updated;
  },
  patch(customerId, fields) {
    const updated = read().map((item) => item.id === customerId ? { ...item, ...fields } : item);
    write(updated);
    return updated;
  },
  updateCall(customerId, callId, patch) {
    const updated = read().map((item) => {
      if (item.id !== customerId || !item.callHistory.some((call) => call.id === callId)) return item;
      return {
        ...item,
        summary: patch.summary || item.summary,
        concerns: patch.concerns?.length ? patch.concerns.join(", ") : item.concerns,
        callHistory: item.callHistory.map((call) => call.id === callId ? { ...call, ...patch } : call),
      };
    });
    write(updated);
    return updated;
  },
};
