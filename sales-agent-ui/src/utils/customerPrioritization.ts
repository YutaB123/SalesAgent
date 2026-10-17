import type { FollowUpTask, TrackedCustomer } from "../types/salesAgent";

export type ReadinessTier = "tier-3" | "tier-2" | "tier-1" | "unscored";
export type FollowUpUrgency = "overdue" | "today" | "upcoming" | "open-no-date" | "none";

export interface CustomerTrackingFilters {
  query: string;
  followUp: "all" | "open" | "none";
  activity: "all" | "recent";
}

export function validReadinessScore(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10 ? value : undefined;
}

export function readinessScore(customer: TrackedCustomer, overrides: Record<string, number>): number | undefined {
  return validReadinessScore(overrides[customer.id]) ?? validReadinessScore(customer.readiness);
}

export function readinessTier(score: number | undefined): ReadinessTier {
  if (score === undefined) return "unscored";
  if (score >= 7) return "tier-3";
  if (score >= 4) return "tier-2";
  return "tier-1";
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validDateKey(value: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return undefined;
  return value;
}

export function followUpUrgency(customer: TrackedCustomer, tasks: FollowUpTask[], today = new Date()): FollowUpUrgency {
  const hasOpenTask = tasks.some((task) => !task.completed);
  const allTasksClosed = tasks.length > 0 && !hasOpenTask;
  if (allTasksClosed) return "none";

  const dueDate = validDateKey(customer.followUpDate);
  if (dueDate) {
    const todayKey = localDateKey(today);
    if (dueDate < todayKey) return "overdue";
    if (dueDate === todayKey) return "today";
    return "upcoming";
  }
  return hasOpenTask ? "open-no-date" : "none";
}

export const readinessGroups: { id: ReadinessTier; label: string; range: string }[] = [
  { id: "tier-3", label: "Tier 3 · High Intent", range: "7–10" },
  { id: "tier-2", label: "Tier 2 · Considering", range: "4–6" },
  { id: "tier-1", label: "Tier 1 · Early Stage", range: "1–3" },
  { id: "unscored", label: "Unscored", range: "—" },
];

export const urgencyOrder: Record<FollowUpUrgency, number> = {
  overdue: 0,
  today: 1,
  upcoming: 2,
  "open-no-date": 3,
  none: 4,
};

export function matchesCustomerTrackingFilters(
  customer: TrackedCustomer,
  filters: CustomerTrackingFilters,
  tasks: FollowUpTask[],
  hasRecentActivity: boolean,
): boolean {
  const query = filters.query.trim().toLocaleLowerCase();
  const matchesText = !query || customer.name.toLocaleLowerCase().includes(query) || customer.company.toLocaleLowerCase().includes(query);
  const urgency = followUpUrgency(customer, tasks);
  const matchesFollowUp = filters.followUp === "all" || (filters.followUp === "open" ? urgency !== "none" : urgency === "none");
  const matchesActivity = filters.activity === "all" || hasRecentActivity;
  return matchesText && matchesFollowUp && matchesActivity;
}

export function groupAndSortCustomers(
  customers: TrackedCustomer[],
  scores: Record<string, number>,
  tasksForCustomer: (customer: TrackedCustomer) => FollowUpTask[],
) {
  return readinessGroups.map((group) => ({
    ...group,
    customers: customers.filter((customer) => readinessTier(readinessScore(customer, scores)) === group.id).sort((a, b) => {
      const urgencyDiff = urgencyOrder[followUpUrgency(a, tasksForCustomer(a))] - urgencyOrder[followUpUrgency(b, tasksForCustomer(b))];
      if (urgencyDiff) return urgencyDiff;
      const scoreA = readinessScore(a, scores);
      const scoreB = readinessScore(b, scores);
      if (scoreA !== scoreB) return (scoreB ?? -1) - (scoreA ?? -1);
      const dateA = /^\d{4}-\d{2}-\d{2}$/.test(a.followUpDate) ? a.followUpDate : "9999-99-99";
      const dateB = /^\d{4}-\d{2}-\d{2}$/.test(b.followUpDate) ? b.followUpDate : "9999-99-99";
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const contactA = a.lastContact ? Date.parse(a.lastContact) : 0;
      const contactB = b.lastContact ? Date.parse(b.lastContact) : 0;
      return (Number.isFinite(contactB) ? contactB : 0) - (Number.isFinite(contactA) ? contactA : 0) || a.name.localeCompare(b.name);
    }),
  }));
}
