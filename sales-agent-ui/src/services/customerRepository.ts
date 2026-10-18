import type { CustomerCallHistory, TrackedCustomer } from "../types/salesAgent";

const STORAGE_KEY = "sales-agent-demo-customers-v2";

export interface CustomerRepository {
  list(): TrackedCustomer[];
  hydrate(): Promise<void>;
  lookupPhone(phone: string): Promise<TrackedCustomer | undefined>;
  ensurePhone(phone: string): TrackedCustomer;
  save(customer: TrackedCustomer): TrackedCustomer[];
  remove(customerId: string): TrackedCustomer[];
  appendCall(customerId: string, entry: CustomerCallHistory): TrackedCustomer[];
  /** Update a few fields on a customer (used to copy a post-call report onto the record). */
  patch(customerId: string, fields: Partial<Pick<TrackedCustomer, "purchaseStage" | "readiness" | "followUpDate" | "needs" | "concerns" | "notes" | "criticalInformation" | "followUpRecommendation" | "doNotContact" | "summary" | "confidence" | "followUpTasks" | "followUpPending" | "recommendedChannel" | "confirmedChannel" | "recommendedPlan" | "communicationScore">>): TrackedCustomer[];
  /** Fill in a saved call's summary, concerns and next steps once the post-call report is ready. */
  updateCall(customerId: string, callId: string, patch: Partial<Pick<CustomerCallHistory, "summary" | "concerns" | "nextSteps">>): TrackedCustomer[];
}

function read(): TrackedCustomer[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) return (parsed as TrackedCustomer[]).filter(c=>!c.archived);
  } catch {
    // Keep the sample experience available when storage is unavailable or malformed.
  }
  return [];
}

function write(customers: TrackedCustomer[]) {
  const previous = read();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
  window.dispatchEvent(new Event("customers-updated"));
  for (const c of customers) if (JSON.stringify(c) !== JSON.stringify(previous.find(x => x.id === c.id))) {
    const dirty = readDirty(); dirty[c.id] = c; localStorage.setItem(DIRTY_KEY, JSON.stringify(dirty));
  }
  window.dispatchEvent(new CustomEvent("customer-sync", {detail:"Saving customer updates…"}));
  void flush();
}
const DIRTY_KEY = "sales-agent-demo-outbox-v2";
function readDirty(): Record<string, TrackedCustomer> { try { return JSON.parse(localStorage.getItem(DIRTY_KEY) || "{}"); } catch { return {}; } }
let syncing = false;
let syncFailed = false;
async function cloud(url: string, record?: TrackedCustomer) {
  const response = await fetch(url, record ? { signal: AbortSignal.timeout(25000), method: "POST", headers: {"Content-Type":"application/json", "X-Customer-Action":"1"}, body: JSON.stringify({record}) } : {signal:AbortSignal.timeout(25000)});
  const data = await response.json(); if (!response.ok) throw Error(data.error || "Customer sync failed"); return data;
}
let retryTimer: ReturnType<typeof setTimeout> | undefined;
async function flush() {
  if (syncing) return; syncing = true; syncFailed = false;
  try {
    for (const [id, record] of Object.entries(readDirty())) {
      await cloud("/api/customers", record);
      const pending = readDirty(); if (JSON.stringify(pending[id]) === JSON.stringify(record)) { delete pending[id]; localStorage.setItem(DIRTY_KEY, JSON.stringify(pending)); }
    }
    window.dispatchEvent(new CustomEvent("customer-sync", {detail: Object.keys(readDirty()).length ? "Saving customer updates…" : "Customer records synced to backend"}));
  } catch { syncFailed = true; window.dispatchEvent(new CustomEvent("customer-sync", {detail:"Saved on this device · backend sync pending"})); }
  finally { syncing = false; if(syncFailed && !retryTimer) retryTimer=setTimeout(()=>{retryTimer=undefined;void flush();},5000); if(!syncFailed && Object.keys(readDirty()).length) void flush(); }
}
export function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, ""); if (digits.startsWith("0")) throw Error("Enter a valid phone number with country code"); if (digits.length === 10 && !value.trim().startsWith("+")) digits = "1" + digits;
  if (!/^[1-9]\d{7,14}$/.test(digits)) throw Error("Enter a valid phone number with country code");
  return "+" + digits;
}
function mergeCloud(records: TrackedCustomer[], replace = false) {
 const dirty = readDirty(); const merged = new Map((replace ? Object.values(dirty) : read()).map(c => [c.id, c]));
 for (const c of records) if (!dirty[c.id]) merged.set(c.id, c);
 localStorage.setItem(STORAGE_KEY, JSON.stringify([...merged.values()])); window.dispatchEvent(new Event("customers-updated"));
}


export function createCustomerId() {
  return globalThis.crypto?.randomUUID?.() ?? `customer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const customerRepository: CustomerRepository = {
  list: read,
  async hydrate() { await flush(); const data = await cloud("/api/customers"); mergeCloud(data.customers, true); },
  async lookupPhone(phone) { const normalized = normalizePhone(phone); const data = await cloud("/api/customers?phone=" + encodeURIComponent(normalized)); mergeCloud(data.customers); return data.customers[0] ?? read().find(c => { try { return normalizePhone(c.contact) === normalized; } catch { return false; } }); },
  ensurePhone(phone) {
    const normalized = normalizePhone(phone);
    const existing = read().find(c => { try { return normalizePhone(c.contact) === normalized; } catch { return false; } });
    if (existing) return existing;
    const next: TrackedCustomer = {id: "phone-" + normalized.slice(1),name:normalized,contact:normalized,company:"",role:"",needs:"",concerns:"",productDiscussed:"Demo Essential",recommendedPlan:"Demo Essential",purchaseStage:"Discovery",followUpDate:"",notes:"",lastContact:"",summary:"No previous calls yet.",callHistory:[]};
    customerRepository.save(next); return next;
  },
  save(next) {
    const previousId=next.id;
    if(next.contact && /^[+\d\s().-]+$/.test(next.contact)){const phone=normalizePhone(next.contact);next={...next,id:"phone-"+phone.slice(1),contact:phone,name:next.name||phone};}
    const current = read().filter(c=>c.id!==previousId || previousId===next.id);
    const updated = current.some((item) => item.id === next.id)
      ? current.map((item) => item.id === next.id ? next : item)
      : [...current, next];
    write(updated);
    return updated;
  },
  remove(customerId) {
    const updated = read().map(item=>item.id===customerId?{...item,archived:true}:item);
    write(updated);
    return updated.filter(c=>!c.archived);
  },
  appendCall(customerId, entry) {
    const updated = read().map((item) => {
      if (item.id !== customerId) return item;
      return {
        ...item,
        lastContact: entry.date,
        productDiscussed: entry.productDiscussed || item.productDiscussed,
        concerns: entry.concerns.length ? entry.concerns.join(", ") : item.concerns,
        summary: entry.summary || "Transcript saved for review; no generated summary is available.",
        callHistory: [entry, ...item.callHistory.filter(call=>call.id!==entry.id)],
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
